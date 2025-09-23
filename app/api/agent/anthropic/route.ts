import { Stagehand } from "@browserbasehq/stagehand";
import { createAnthropicLogger } from "@/lib/loggers/anthropicLogger";
import { AGENT_INSTRUCTIONS } from "@/app/constants/prompt";
import { sseComment, sseEncode } from "@/lib/agent/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const [sessionId, goal] = [searchParams.get("sessionId"), searchParams.get("goal")];

  if (!sessionId || !goal) {
    return new Response(
      JSON.stringify({ error: "Missing required params: sessionId and goal" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let stagehandRef: Stagehand | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
      keepAliveTimer = setInterval(() => {
          safeEnqueue(sseComment("keepalive"));
      }, 15000);

      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      timeoutTimer = setTimeout(async () => {
          console.log(`[SSE-Anthropic] Timeout reached for session ${sessionId}`);
          send("error", { message: "Agent run timed out after 10 minutes" });
          await cleanup();
      }, 10 * 60 * 1000);

      let closed = false;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch (err) {
          console.error(`[SSE-Anthropic] enqueue error`, err instanceof Error ? err.message : String(err));
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          safeEnqueue(sseEncode(event, data));
        } catch (err) {
          console.error(`[SSE-Anthropic] send error`, err instanceof Error ? err.message : String(err));
        }
      };

      const cleanup = async (stagehand?: Stagehand) => {
        if (closed) return;
        closed = true;
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        try {
          if (stagehand && !stagehand.isClosed) {
            await stagehand.close();
          }
        } catch {
          console.error(`[SSE-Anthropic] error closing stagehand`, stagehand);
        }
        controller.close();
      };

      keepAliveTimer = setInterval(() => {
        safeEnqueue(sseComment("keepalive"));
      }, 15000);

      timeoutTimer = setTimeout(async () => {
        console.log(`[SSE-Anthropic] Timeout reached for session ${sessionId}`);
        send("error", { message: "Agent run timed out after 10 minutes" });
        await cleanup();
      }, 10 * 60 * 1000);

      console.log(`[SSE-Anthropic] Starting Stagehand agent run`, {
        sessionId,
        goal,
        hasInstructions: true,
      });

      const stagehand = new Stagehand({
        env: "BROWSERBASE",
        browserbaseSessionID: sessionId,
        modelName: "openai/gpt-4o",
        modelClientOptions: {
          apiKey: process.env.OPENAI_API_KEY,
        },
        browserbaseSessionCreateParams: {
          projectId: process.env.BROWSERBASE_PROJECT_ID!,
          proxies: true,
          browserSettings: {
            viewport: {
              width: 1288,
              height: 711,
            },
          },
        },
        useAPI: false,
        verbose: 2,
        disablePino: true,
        logger: createAnthropicLogger(send),
      });
      stagehandRef = stagehand;

      try {
        const init = await stagehand.init();
        console.log(`[SSE-Anthropic] Stagehand initialized`, init);

        send("start", {
          sessionId,
          goal,
          model: "anthropic",
          init,
          startedAt: new Date().toISOString(),
          provider: "anthropic",
        });

        const agent = stagehand.agent({
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          options: {
            apiKey: process.env.ANTHROPIC_API_KEY,
          },
          instructions: AGENT_INSTRUCTIONS,
        });

        const result = await agent.execute({
          instruction: goal,
          autoScreenshot: true,
          maxSteps: 100,
        });

        try {
          console.log(`[SSE-Anthropic] metrics snapshot`, stagehand.metrics);
          send("metrics", stagehand.metrics);
        } catch {}

        console.log(`[SSE-Anthropic] done`, { success: result.success, completed: result.completed });
        send("done", result);

        await cleanup(stagehand);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[SSE-Anthropic] error`, message);
        send("error", { message });
        await cleanup(stagehand);
      }
    },
    cancel: async () => {
      try {
        if (stagehandRef && !stagehandRef.isClosed) {
          await stagehandRef.close();
        }
      } catch {
        // no-op
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
