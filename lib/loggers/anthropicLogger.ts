import { type LogLine } from "@browserbasehq/stagehand";

type SendFn = (event: string, data: unknown) => void;

export function createAnthropicLogger(send: SendFn) {
  let lastTextBlock: string | null = null;

  const logger = (logLine: LogLine) => {
    const msg = (logLine?.message ?? "").toString();
    const category = logLine?.category ?? "";

    if (category !== "agent") return;

    // Handle "Found tool_use block: {JSON}"
    const toolUseMatch = msg.match(/^Found tool_use block:\s*([\s\S]*)/);
    if (toolUseMatch) {
      try {
        const toolData = JSON.parse(toolUseMatch[1]);
        // Send as pure JSON for parseLog to handle
        const message = JSON.stringify({
          type: "tool_use",
          id: toolData.id,
          name: toolData.name,
          input: toolData.input
        });
        
        console.log("[Anthropic Logger] Sending tool_use:", message);
        send("log", {
          ...logLine,
          message,
          provider: "anthropic",
          type: "tool_use"
        });
        return;
      } catch (error) {
        console.error("[Anthropic Logger] Error parsing tool_use block:", error);
      }
    }

    // Handle "Found text block: {text}"
    const textBlockMatch = msg.match(/^Found text block:\s*([\s\S]+)/);
    if (textBlockMatch) {
      const text = textBlockMatch[1].trim();
      lastTextBlock = text; // Track the last text block
      // Send as JSON for parseLog to handle
      const message = JSON.stringify({
        type: "text",
        text: text
      });
      
      console.log("[Anthropic Logger] Sending text block:", message);
      send("log", {
        ...logLine,
        message,
        provider: "anthropic",
        type: "text_block"
      });
      return;
    }

    // Handle "Executing step X/Y"
    const stepMatch = msg.match(/^Executing step\s+(\d+)\/(\d+)/);
    if (stepMatch) {
      const currentStep = parseInt(stepMatch[1]);
      const totalSteps = parseInt(stepMatch[2]);
      
      send("log", {
        ...logLine,
        message: `Executing step ${currentStep}/${totalSteps}`,
        provider: "anthropic",
        type: "step_execution"
      });
      return;
    }

    // Handle completion messages
    if (msg.includes('completed') && msg.includes('total actions performed')) {
      send("log", {
        ...logLine,
        message: msg,
        provider: "anthropic",
        type: "completion"
      });
      return;
    }

    // Handle errors
    if (msg.toLowerCase().includes('error') || msg.includes('failed')) {
      send("log", {
        ...logLine,
        message: msg,
        provider: "anthropic",
        type: "error"
      });
      return;
    }

    // Skip technical noise
    const isTechnicalNoise =
      msg.includes('Processing tool use:') ||
      msg.includes('Added tool_use item:') ||
      msg.includes('Created action from tool_use:') ||
      msg.includes('Computer action type:') ||
      msg.includes('Taking action on') ||
      msg.includes('Executing action:') ||
      msg.includes('Taking screenshot') ||
      msg.includes('Screenshot captured') ||
      msg.includes('Added computer tool result') ||
      msg.includes('Prepared') ||
      msg.includes('Received response') ||
      msg.includes('Step processed') ||
      msg.includes('Starting Anthropic agent') ||
      msg.includes('metrics snapshot');

    if (isTechnicalNoise) {
      return;
    }

    // Log any unhandled messages for debugging
    console.log("[Anthropic Logger] Unhandled:", msg.substring(0, 100));
  };
  
  // Return logger with getLastMessage method
  return Object.assign(logger, {
    getLastMessage: () => lastTextBlock
  });
}
