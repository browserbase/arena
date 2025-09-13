import { type LogLine } from "@browserbasehq/stagehand";

type SendFn = (event: string, data: unknown) => void;

interface AnthropicLogEvent {
  type: 'step_execution' | 'text_block' | 'tool_use' | 'processing_block' | 'error' | 'completion';
  provider: 'anthropic';
  stepNumber?: number;
  data: any;
  originalMessage: string;
  category: string;
}

export function createAnthropicLogger(send: SendFn) {
  let stepCounter = 0;

  return (logLine: LogLine) => {
    const msg = (logLine?.message ?? "").toString();
    const originalMessage = logLine?.message ?? "";
    const category = logLine?.category ?? "";

    if (category !== "agent") return;

    // For Anthropic, we want to capture specific patterns:
    // 1. Step execution
    // 2. Processing blocks (contains actual tool calls)
    // 3. Text blocks (contains thinking)
    // 4. Errors
    // 5. Completion messages

    const isStepExecution = /Executing step \d+\/\d+/.test(msg);
    const isProcessingBlock = originalMessage.startsWith('Processing block:');
    const isTextBlock = msg.includes('Found text block:');
    const isError = msg.includes('Error') || msg.includes('failed');
    const isCompletion = msg.includes('completed') && msg.includes('total actions performed');
    const isMetrics = msg.includes('metrics snapshot');

    // Forward step execution
    if (isStepExecution) {
      const stepMatch = msg.match(/Executing step (\d+)\/(\d+)/);
      const currentStep = stepMatch ? parseInt(stepMatch[1]) : ++stepCounter;
      const totalSteps = stepMatch ? parseInt(stepMatch[2]) : 0;

      const logEvent: AnthropicLogEvent = {
        type: 'step_execution',
        provider: 'anthropic',
        stepNumber: currentStep,
        data: {
          stepExecution: {
            current: currentStep,
            total: totalSteps
          }
        },
        originalMessage: msg,
        category
      };

      send("anthropic_step", logEvent);
      console.log(`[Anthropic Logger] Step execution:`, currentStep, '/', totalSteps);
      return;
    }

    // Forward Processing blocks as structured events
    if (isProcessingBlock) {
      try {
        const jsonMatch = originalMessage.match(/Processing block:\s*({[\s\S]*?})/);
        if (jsonMatch) {
          const blockData = JSON.parse(jsonMatch[1]);
          
          const logEvent: AnthropicLogEvent = {
            type: 'processing_block',
            provider: 'anthropic',
            stepNumber: ++stepCounter,
            data: {
              processingBlock: blockData,
              toolUse: blockData.type === 'tool_use' ? {
                id: blockData.id,
                name: blockData.name,
                input: blockData.input
              } : undefined
            },
            originalMessage,
            category
          };

          send("anthropic_step", logEvent);
          console.log(`[Anthropic Logger] Processing block:`, blockData.type, blockData.id || 'no-id');
          return;
        }
      } catch (e) {
        console.error('Failed to parse Processing block JSON:', e);
      }
    }

    // Forward text blocks (thinking content)
    if (isTextBlock) {
      const cleanMessage = msg.replace('Found text block: ', '');
      
      const logEvent: AnthropicLogEvent = {
        type: 'text_block',
        provider: 'anthropic',
        stepNumber: ++stepCounter,
        data: {
          textBlock: {
            content: cleanMessage,
            type: 'thinking'
          }
        },
        originalMessage: msg,
        category
      };

      send("anthropic_step", logEvent);
      console.log(`[Anthropic Logger] Text block:`, cleanMessage.substring(0, 50));
      return;
    }

    // Forward errors with structured data
    if (isError) {
      let errorType: 'browser_session' | 'cursor_injection' | 'action_execution' | 'key_mapping' = 'action_execution';
      let actionType: string | undefined;

      if (msg.includes('Target page, context or browser has been closed')) {
        errorType = 'browser_session';
      } else if (msg.includes('Failed to inject cursor')) {
        errorType = 'cursor_injection';
      } else if (msg.includes('Unknown key')) {
        errorType = 'key_mapping';
        const keyMatch = msg.match(/Unknown key: "([^"]+)"/);
        actionType = keyMatch ? keyMatch[1] : undefined;
      } else if (msg.includes('Error executing action')) {
        const actionMatch = msg.match(/Error executing action (\w+):/);
        actionType = actionMatch ? actionMatch[1] : undefined;
      }

      const logEvent: AnthropicLogEvent = {
        type: 'error',
        provider: 'anthropic',
        stepNumber: ++stepCounter,
        data: {
          error: {
            type: errorType,
            details: msg,
            actionType
          }
        },
        originalMessage: msg,
        category
      };

      send("anthropic_step", logEvent);
      console.log(`[Anthropic Logger] Error:`, errorType, actionType || '');
      return;
    }

    // Forward completion
    if (isCompletion) {
      const logEvent: AnthropicLogEvent = {
        type: 'completion',
        provider: 'anthropic',
        stepNumber: ++stepCounter,
        data: {
          completion: {
            message: msg,
            completed: true
          }
        },
        originalMessage: msg,
        category
      };

      send("anthropic_step", logEvent);
      console.log(`[Anthropic Logger] Completion:`, msg.substring(0, 50));
      return;
    }

    // Skip metrics and other technical logs
    if (isMetrics || 
        msg.includes('screenshot captured') ||
        msg.includes('prepared input items') ||
        msg.includes('step processed') ||
        msg.includes('added computer tool result')) {
      console.log(`[Anthropic Logger] Skip technical:`, msg.substring(0, 50));
      return;
    }

    // Log anything else we might have missed for debugging
    console.log(`[Anthropic Logger] Unhandled message:`, msg.substring(0, 100));
  };
}
