import { type LogLine } from "@browserbasehq/stagehand";

type SendFn = (event: string, data: unknown) => void;

export function createOpenAILogger(send: SendFn) {
  return (logLine: LogLine) => {
    const msg = (logLine?.message ?? "").toString();
    const originalMessage = logLine?.message ?? "";
    const category = logLine?.category ?? "";

    if (category !== "agent") return;

    // For OpenAI, we want to capture:
    // 1. Step execution
    // 2. Computer calls and function calls
    // 3. Reasoning content
    // 4. Errors
    // 5. Completion messages

    const isStepExecution = /Executing step \d+\/\d+/.test(msg);
    const isComputerCall = msg.includes('computer_call') || msg.includes('Computer action');
    const isFunctionCall = /Found function call:|function_call/.test(msg);
    const isReasoning = msg.includes('reasoning:') || msg.startsWith('💭');
    const isError = msg.includes('Error') || msg.includes('failed');
    const isCompletion = msg.includes('completed') && msg.includes('total actions performed');
    const isResponseOutput = msg.includes('response output') || msg.includes('response with');

    // Forward step execution
    if (isStepExecution) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "openai",
        type: "step_execution"
      });
      return;
    }

    // Forward computer calls
    if (isComputerCall) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "openai",
        type: "computer_call"
      });
      return;
    }

    // Forward function calls
    if (isFunctionCall) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "openai",
        type: "function_call"
      });
      return;
    }

    // Forward reasoning
    if (isReasoning) {
      const cleanMessage = msg.replace(/^reasoning:\s*/i, "💭 ");
      send("log", { 
        ...logLine, 
        message: cleanMessage, 
        provider: "openai",
        type: "reasoning"
      });
      return;
    }

    // Forward response output info
    if (isResponseOutput) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "openai",
        type: "response_info"
      });
      return;
    }

    // Forward errors
    if (isError) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "openai",
        type: "error"
      });
      return;
    }

    // Forward completion
    if (isCompletion) {
      send("log", { 
        ...logLine, 
        message: msg, 
        provider: "openai",
        type: "completion"
      });
      return;
    }

    // Skip purely technical logs
    if (msg.includes('screenshot captured') ||
        msg.includes('prepared input items') ||
        msg.includes('response id') ||
        msg.includes('usage:')) {
      console.log(`[OpenAI Logger] Skip technical:`, msg.substring(0, 50));
      return;
    }

    // Log anything else we might have missed for debugging
    console.log(`[OpenAI Logger] Unhandled message:`, msg.substring(0, 100));
  };
}
