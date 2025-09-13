import { type LogLine } from "@browserbasehq/stagehand";

type SendFn = (event: string, data: unknown) => void;

export function createGeminiLogger(send: SendFn) {
  return (logLine: LogLine) => {
    const msg = (logLine?.message ?? "").toString();
    const category = logLine?.category ?? "";

    if (category !== "agent") return;

    // For Gemini, we want to capture:
    // 1. Step execution
    // 2. Function calls with args
    // 3. Raw responses with thought signatures
    // 4. Reasoning content
    // 5. Errors
    // 6. Completion messages

    const isStepExecution = /Executing step \d+\/\d+/.test(msg);
    const isFunctionCall = /Found function call:\s*[a-z0-9_]+\s+(?:with args:)?/i.test(msg);
    const isRawResponse = msg.includes('Raw response from Google:') || msg.includes('raw response from google:');
    const isReasoning = msg.includes('reasoning:') || msg.startsWith('💭');
    const isError = msg.includes('Error') || msg.includes('failed') || msg.includes('Unknown key');
    const isCompletion = msg.includes('completed') && msg.includes('total actions performed');
    const isThoughtSignature = msg.includes('thoughtsignature');

    // Forward step execution
    if (isStepExecution) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "gemini",
        type: "step_execution"
      });
      return;
    }

    // Forward function calls (these contain the actual tool call data for Gemini)
    if (isFunctionCall) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "gemini",
        type: "function_call"
      });
      return;
    }

    // Forward raw responses (contains thought signatures and function calls)
    if (isRawResponse) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "gemini",
        type: "raw_response"
      });
      return;
    }

    // Forward reasoning
    if (isReasoning) {
      const cleanMessage = msg.replace(/^reasoning:\s*/i, "💭 ");
      send("log", { 
        ...logLine, 
        message: cleanMessage, 
        provider: "gemini",
        type: "reasoning"
      });
      return;
    }

    // Forward errors
    if (isError) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "gemini",
        type: "error"
      });
      return;
    }

    // Forward completion
    if (isCompletion) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "gemini",
        type: "completion"
      });
      return;
    }

    // Skip purely technical logs
    if (msg.includes('found 1 function calls') ||
        msg.includes('converted to') ||
        msg.includes('executing action') ||
        msg.includes('skipping') ||
        msg.includes('adding function responses') ||
        msg.includes('screenshot after executing')) {
      console.log(`[Gemini Logger] Skip technical:`, msg.substring(0, 50));
      return;
    }

    // Log anything else we might have missed for debugging
    console.log(`[Gemini Logger] Unhandled message:`, msg.substring(0, 100));
  };
}
