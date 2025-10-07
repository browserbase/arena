import { Stagehand } from "@browserbasehq/stagehand";
import { createAnthropicLogger } from "@/lib/loggers/anthropicLogger";
import { createGoogleLogger } from "@/lib/loggers/googleLogger";
import { createOpenAILogger } from "@/lib/loggers/openaiLogger";
import { sseComment, sseEncode } from "@/lib/agent/utils";
import { AGENT_INSTRUCTIONS } from "@/app/constants/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const PROVIDER_CONFIGS = {
  anthropic: {
    // model: "claude-sonnet-4-20250514",
    model: "claude-sonnet-4-5-20250929",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    logger: createAnthropicLogger,
    stagehandModel: "anthropic",
  },
  google: {
    model: "gemini-2.5-computer-use-preview-10-2025",
    apiKey: process.env.GOOGLE_API_KEY!,
    logger: createGoogleLogger,
    stagehandModel: "google",
  },
  openai: {
    model: "computer-use-preview-2025-03-11",
    apiKey: process.env.OPENAI_API_KEY!,
    logger: createOpenAILogger,
    stagehandModel: "openai",
  },
} as const;

type Provider = keyof typeof PROVIDER_CONFIGS;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const [sessionId, goal, providerParam] = [
    searchParams.get("sessionId"),
    searchParams.get("goal"),
    searchParams.get("provider"),
  ];

  if (!sessionId || !goal) {
    return new Response(
      JSON.stringify({ error: "Missing required params: sessionId and goal" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const provider = providerParam as Provider;
  if (!provider || !PROVIDER_CONFIGS[provider]) {
    return new Response(
      JSON.stringify({
        error: `Invalid provider: ${providerParam}. Must be one of: ${Object.keys(PROVIDER_CONFIGS).join(", ")}`
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const config = PROVIDER_CONFIGS[provider];
  const logger = config.logger;

  let stagehandRef: Stagehand | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
      keepAliveTimer = setInterval(() => {
        safeEnqueue(sseComment("keepalive"));
      }, 15000);

      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      timeoutTimer = setTimeout(async () => {
        console.log(`[SSE-${provider}] Timeout reached for session ${sessionId}`);
        send("error", { message: "Agent run timed out after 10 minutes" });
        await cleanup();
      }, 10 * 60 * 1000);

      let closed = false;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch (err) {
          console.error(`[SSE-${provider}] enqueue error`, err instanceof Error ? err.message : String(err));
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          safeEnqueue(sseEncode(event, data));
        } catch (err) {
          console.error(`[SSE-${provider}] send error`, err instanceof Error ? err.message : String(err));
        }
      };

      let viewportLockInterval: ReturnType<typeof setInterval> | undefined;

      const cleanup = async (stagehand?: Stagehand) => {
        if (closed) return;
        closed = true;
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (viewportLockInterval) clearInterval(viewportLockInterval);
        try {
          if (stagehand && !stagehand.isClosed) {
            await stagehand.close();
          }
        } catch {
          console.error(`[SSE-${provider}] error closing stagehand`, stagehand);
        }
        controller.close();
      };

      // Keep the connection alive for proxies
      keepAliveTimer = setInterval(() => {
        safeEnqueue(sseComment("keepalive"));
      }, 15000);

      // Hard timeout at 10 minutes
      timeoutTimer = setTimeout(async () => {
        console.log(`[SSE-${provider}] Timeout reached for session ${sessionId}`);
        send("error", { message: "Agent run timed out after 10 minutes" });
        await cleanup();
      }, 10 * 60 * 1000);

      console.log(`[SSE-${provider}] Starting Stagehand agent run`, {
        sessionId,
        goal,
        provider,
        hasInstructions: true,
      });

      const loggerInstance = logger(send);
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
        logger: loggerInstance,
      });
      stagehandRef = stagehand;

      try {
        const init = await stagehand.init();
        console.log(`[SSE-${provider}] Stagehand initialized`, init);

        send("start", {
          sessionId,
          goal,
          model: config.model,
          init,
          startedAt: new Date().toISOString(),
          provider,
        });

        const agent = stagehand.agent({
          provider: provider === "anthropic" ? "anthropic" : provider === "google" ? "google" : "openai",
          model: config.model,
          options: {
            apiKey: config.apiKey,
          },
          instructions: AGENT_INSTRUCTIONS,
        });

        const result = await agent.execute({
          instruction: goal,
          autoScreenshot: true,
          maxSteps: 100,
        });

        try {
          console.log(`[SSE-${provider}] metrics snapshot`, stagehand.metrics);
          send("metrics", stagehand.metrics);
        } catch {}

        // Extract final message from logger
        const finalMessage = (loggerInstance as unknown as { getLastMessage?: () => string }).getLastMessage?.() || null;
        console.log(`[SSE-${provider}] done`, { success: result.success, completed: result.completed, finalMessage });
        send("done", { ...result, finalMessage });

        await cleanup(stagehand);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[SSE-${provider}] error`, message);
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
        console.error(`[SSE-${provider}] error closing stagehand`, stagehandRef);
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
