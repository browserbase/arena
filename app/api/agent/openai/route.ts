import { Stagehand } from "@browserbasehq/stagehand";
import { createOpenAILogger } from "@/lib/loggers/openaiLogger";
import { sseComment, sseEncode } from "@/lib/agent/utils";
import { AGENT_INSTRUCTIONS } from "@/app/constants/prompt";

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
      let closed = false;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch (err) {
          console.error(`[SSE-OpenAI] enqueue error`, err instanceof Error ? err.message : String(err));
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          safeEnqueue(sseEncode(event, data));
        } catch (err) {
          console.error(`[SSE-OpenAI] send error`, err instanceof Error ? err.message : String(err));
        }
      };

      let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
      keepAliveTimer = setInterval(() => {
        safeEnqueue(sseComment("keepalive"));
      }, 15000);

      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      timeoutTimer = setTimeout(async () => {
        console.log(`[SSE-OpenAI] Timeout reached for session ${sessionId}`);
        send("error", { message: "Agent run timed out after 10 minutes" });
        await cleanup();
      }, 10 * 60 * 1000);

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
          console.error(`[SSE-OpenAI] error closing stagehand`, stagehand);
        }
        controller.close();
      };

      keepAliveTimer = setInterval(() => {
        safeEnqueue(sseComment("keepalive"));
      }, 15000);

      timeoutTimer = setTimeout(async () => {
        console.log(`[SSE-OpenAI] Timeout reached for session ${sessionId}`);
        send("error", { message: "Agent run timed out after 10 minutes" });
        await cleanup();
      }, 10 * 60 * 1000);

      const STAGEHAND_MODEL = "openai/gpt-4o";
      const AGENT_MODEL = "gpt-4o"; // OpenAI's GPT-4 Optimized model
      const PROVIDER = "openai";

      console.log(`[SSE-OpenAI] Starting Stagehand agent run`, {
        sessionId,
        goal,
        hasInstructions: true,
        stagehandModel: STAGEHAND_MODEL,
        agentModel: AGENT_MODEL,
        provider: PROVIDER,
        verbose: 2,
      });

      const stagehand = new Stagehand({
        env: "BROWSERBASE",
        browserbaseSessionID: sessionId,
        modelName: STAGEHAND_MODEL,
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
        logger: createOpenAILogger(send),
      });
      stagehandRef = stagehand;

      try {
        const init = await stagehand.init();
        console.log(`[SSE-OpenAI] Stagehand initialized with model: ${STAGEHAND_MODEL}`, {
          ...init,
          model: STAGEHAND_MODEL,
          provider: PROVIDER,
        });

        send("start", {
          sessionId,
          goal,
          model: AGENT_MODEL,
          stagehandModel: STAGEHAND_MODEL,
          init,
          startedAt: new Date().toISOString(),
          provider: PROVIDER,
        });

        console.log(`[SSE-OpenAI] Creating agent with model: ${AGENT_MODEL}`, {
          provider: PROVIDER,
          model: AGENT_MODEL,
          hasApiKey: !!process.env.OPENAI_API_KEY,
        });

        const agent = stagehand.agent({
          provider: PROVIDER,
          model: "computer-use-preview",
          options: {
            apiKey: process.env.OPENAI_API_KEY,
          },
          instructions: AGENT_INSTRUCTIONS,
        });

        console.log(`[SSE-OpenAI] Executing agent with parameters:`, {
          model: AGENT_MODEL,
          provider: PROVIDER,
          instruction: goal.substring(0, 100) + (goal.length > 100 ? "..." : ""),
          autoScreenshot: true,
          waitBetweenActions: 200,
          maxSteps: 100,
        });

        const result = await agent.execute({
          instruction: goal,
          autoScreenshot: true,
          waitBetweenActions: 200,
          maxSteps: 100,
        });

        try {
          console.log(`[SSE-OpenAI] Metrics snapshot for model ${AGENT_MODEL}:`, {
            ...stagehand.metrics,
            model: AGENT_MODEL,
            provider: PROVIDER,
          });
          send("metrics", { ...stagehand.metrics, model: AGENT_MODEL, provider: PROVIDER });
        } catch (metricsError) {
          console.warn(`[SSE-OpenAI] Failed to capture metrics:`, metricsError);
        }

        console.log(`[SSE-OpenAI] Agent execution completed with model ${AGENT_MODEL}:`, {
          success: result.success,
          completed: result.completed,
          model: AGENT_MODEL,
          provider: PROVIDER,
          sessionId,
        });
        send("done", result);

        await cleanup(stagehand);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[SSE-OpenAI] Error with model ${AGENT_MODEL}:`, {
          message,
          model: AGENT_MODEL,
          provider: PROVIDER,
          sessionId,
          error: error instanceof Error ? error.stack : error,
        });
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
