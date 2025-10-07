import { type LogLine } from "@browserbasehq/stagehand";

type SendFn = (event: string, data: unknown) => void;

export function createOpenAILogger(send: SendFn) {
  let lastMessageText: string | null = null;
  
  const logger = (logLine: LogLine) => {
    const msg = (logLine?.message ?? "").toString();
    const category = logLine?.category ?? "";

    if (category !== "agent") return;

    // Parse OpenAI's structured response format
    
    // 1. Step execution logs
    const stepMatch = msg.match(/Executing step (\d+)\/(\d+)/);
    if (stepMatch) {
      send("step", {
        stepNumber: parseInt(stepMatch[1]),
        maxSteps: parseInt(stepMatch[2]),
        message: msg,
      });
      return;
    }

    // 2. Reasoning logs
    const reasoningMatch = msg.match(/^Reasoning:?\s*(.*)$/i);
    if (reasoningMatch) {
      const reasoningText = reasoningMatch[1];

      send("reasoning", {
        content: reasoningText,
        timestamp: Date.now(),
      });
      return;
    }

    // 3. Computer call logs
    const computerCallMatch = msg.match(/Found computer_call: ([\w.]+), call_id: ([\w-]+)/);
    if (computerCallMatch) {
      send("tool", {
        tool: "computer",
        action: computerCallMatch[1],
        callId: computerCallMatch[2],
        type: "computer_call",
      });
      return;
    }

    // Handle executing computer action logs
    const executingComputerMatch = msg.match(/Executing computer action: (\w+)/);
    if (executingComputerMatch) {
      send("tool_execution", {
        action: executingComputerMatch[1],
        type: "computer",
      });
      return;
    }

    // 4. Function call logs
    const functionCallMatch = msg.match(/Found function_call: (\w+), call_id: ([\w-]+)/);
    if (functionCallMatch) {
      send("tool", {
        tool: functionCallMatch[1],
        callId: functionCallMatch[2],
        type: "function_call",
      });
      return;
    }

    // 5. Message text logs
    if (msg.startsWith("Message text:")) {
      const messageText = msg.replace(/^Message text:\s*/, "");
      lastMessageText = messageText; // Track the last message
      send("message", {
        content: messageText,
        timestamp: Date.now(),
      });
      return;
    }

    // 6. Found message block (indicates a message is being processed)
    if (msg === "Found message block") {
      // Skip this - we'll handle actual message content
      return;
    }

    // 7. Error logs
    if (msg.includes("Error") && (msg.includes("executing") || msg.includes("parsing"))) {
      send("agent_error", {
        message: msg,
        timestamp: Date.now(),
      });
      return;
    }

    // 8. Computer call output logs
    const outputMatch = msg.match(/Added computer_call_output for call_id: ([\w-]+)/);
    if (outputMatch) {
      // Skip these technical logs
      return;
    }

    // 9. Skip purely technical logs
    if (msg.includes('screenshot captured') ||
        msg.includes('prepared input items') ||
        msg.includes('response id') ||
        msg.includes('usage:') ||
        msg.includes('Converted function_call to action')) {
      return;
    }

    // For any other agent logs that might be useful, forward them as generic logs
    if (msg.trim()) {
      console.log(`[OpenAI Logger] Forwarding generic log:`, msg.substring(0, 100));
      send("log", { 
        message: msg,
        provider: "openai",
      });
    }
  };
  
  // Return logger with getLastMessage method
  return Object.assign(logger, {
    getLastMessage: () => lastMessageText
  });
}
