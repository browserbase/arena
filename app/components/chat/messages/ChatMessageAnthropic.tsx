"use client";

import { motion } from "framer-motion";
import { BrowserStep } from "@/app/types/ChatFeed";

interface ChatMessageAnthropicProps {
  step: BrowserStep;
  index: number;
  previousSteps?: BrowserStep[];
}

// Anthropic-specific tool name mapping
const anthropicToolNameMapping: Record<string, string> = {
  "computer": "Computer Tool",
  "tool_use": "Tool Use",
  "text": "Reasoning",
  "MESSAGE": "Message",
  "screenshot": "Screenshot",
  "left_click": "Left Click",
  "click": "Click", 
  "type": "Type Text",
  "key": "Key Press",
  "scroll": "Scroll",
  "move": "Move Cursor",
  "drag": "Drag",
  "wait": "Wait",
  "navigate": "Navigate",
  // Additional Anthropic patterns from logs
  "processing": "Processing",
  "computer_action": "Computer Action",
  "text_block": "Text Block",
  "thinking": "Thinking",
};

export default function ChatMessageAnthropic({
  step,
  index,
  previousSteps = [],
}: ChatMessageAnthropicProps) {
  const isSystemMessage =
    step.tool === "MESSAGE" && step.reasoning === "Processing message";

  const isUserInput =
    step.tool === "MESSAGE" && step.reasoning === "User input";

  const isCompletionMessage =
    step.tool === "MESSAGE" && step.reasoning === "Task execution completed";

  const isPreemptive =
    step.tool === "MESSAGE" &&
    !isUserInput &&
    !isSystemMessage &&
    !isCompletionMessage;

  if (isPreemptive && !(step.reasoning && step.reasoning.length > 0)) return null;

  // Parse Anthropic-specific reasoning patterns
  const parseAnthropicReasoning = (reasoning: string): {
    type: 'step' | 'text_block' | 'tool_use' | 'processing' | 'computer_action' | 'thinking' | 'completion' | 'error';
    content: string;
    stepNumber?: number;
    toolName?: string;
    blockType?: string;
    actionType?: string;
    toolId?: string;
  } => {
    if (!reasoning) return { type: 'thinking', content: '' };

    // Check for step execution pattern
    const stepMatch = reasoning.match(/Executing step (\d+)\/\d+/);
    if (stepMatch) {
      return {
        type: 'step',
        content: reasoning,
        stepNumber: parseInt(stepMatch[1])
      };
    }

    // Check for text block patterns (Anthropic's thinking/reasoning)
    if (reasoning.includes('Found text block:')) {
      return {
        type: 'text_block',
        content: reasoning.replace('Found text block: ', ''),
        blockType: 'text'
      };
    }

    // Check for processing patterns
    const processingMatch = reasoning.match(/Processing block:\s*\{[^}]*"type":\s*"([^"]+)"/);
    if (processingMatch) {
      return {
        type: 'processing',
        content: reasoning,
        blockType: processingMatch[1]
      };
    }

    // Check for computer action patterns
    const computerActionMatch = reasoning.match(/computer action type: (\w+)/);
    if (computerActionMatch) {
      return {
        type: 'computer_action',
        content: reasoning,
        actionType: computerActionMatch[1]
      };
    }

    // Check for processing tool use patterns with ID
    const processingToolMatch = reasoning.match(/processing tool use: computer, id: ([^,]+), action:/);
    if (processingToolMatch) {
      return {
        type: 'tool_use',
        content: reasoning,
        toolName: 'computer',
        toolId: processingToolMatch[1],
        blockType: 'tool_use'
      };
    }

    // Check for Anthropic request patterns
    if (reasoning.includes('Sending request to Anthropic with')) {
      const messageMatch = reasoning.match(/Sending request to Anthropic with (\d+) messages/);
      const messageCount = messageMatch ? messageMatch[1] : 'unknown';
      return {
        type: 'processing',
        content: reasoning,
        blockType: 'api_request',
        toolName: `${messageCount} messages`
      };
    }

    // Check for tool use patterns
    const toolUseMatch = reasoning.match(/Found tool_use block:|tool_use.*?computer|processing block type: tool_use/);
    if (toolUseMatch) {
      let toolName = 'computer';
      let toolId = '';
      
      // Extract tool ID if present
      const idMatch = reasoning.match(/id: ([a-zA-Z0-9_-]+)/);
      if (idMatch) {
        toolId = idMatch[1];
      }

      // Extract action type
      if (reasoning.includes('screenshot')) toolName = 'screenshot';
      else if (reasoning.includes('left_click')) toolName = 'left_click';  
      else if (reasoning.includes('click')) toolName = 'click';
      else if (reasoning.includes('type')) toolName = 'type';
      else if (reasoning.includes('scroll')) toolName = 'scroll';
      else if (reasoning.includes('navigate')) toolName = 'navigate';

      return {
        type: 'tool_use',
        content: reasoning,
        toolName,
        toolId,
        blockType: 'tool_use'
      };
    }

    // Check for browser session errors (specific to Anthropic logs)
    if (reasoning.includes('Target page, context or browser has been closed') || 
        reasoning.includes('Failed to inject cursor') ||
        reasoning.includes('Error executing tool use') ||
        reasoning.includes('Error executing action')) {
      
      let actionType = '';
      const actionMatch = reasoning.match(/Error executing action (\w+):/);
      if (actionMatch) {
        actionType = actionMatch[1];
      }

      return {
        type: 'error',
        content: reasoning,
        actionType: actionType || undefined
      };
    }

    // Check for thinking content (pattern or "I" statements)
    if (reasoning.startsWith('I need to') || 
        reasoning.startsWith('I can see') ||
        reasoning.startsWith('I\'ll help') ||
        reasoning.startsWith('Let me')) {
      return {
        type: 'thinking',
        content: reasoning
      };
    }

    // Check for completion
    if (reasoning.includes('completed') || reasoning.includes('finished')) {
      return {
        type: 'completion',
        content: reasoning
      };
    }

    // Check for general errors
    if (reasoning.includes('Error') || reasoning.includes('failed') || reasoning.includes('unable')) {
      return {
        type: 'error',
        content: reasoning
      };
    }

    return { type: 'thinking', content: reasoning };
  };

  const parsedReasoning = parseAnthropicReasoning(step.reasoning);

  // Parse Anthropic action arguments from step data (enhanced for new schema)
  const parseAnthropicActionArgs = (step: BrowserStep): any => {
    const reasoning = step.reasoning || '';
    
    // First check if actionArgs already contains structured data from the new schema
    if (step.actionArgs && typeof step.actionArgs === 'object') {
      // Handle new structured data format
      if ('provider' in step.actionArgs && step.actionArgs.provider === 'anthropic') {
        return step.actionArgs;
      }
      return step.actionArgs;
    }

    // Parse step execution patterns
    if (reasoning.includes('Executing step')) {
      const stepMatch = reasoning.match(/Executing step (\d+)\/(\d+)/);
      if (stepMatch) {
        return {
          type: 'anthropic_step',
          current_step: parseInt(stepMatch[1]),
          total_steps: parseInt(stepMatch[2])
        };
      }
    }

    // For Anthropic, we need to infer tool calls from the step tool and reasoning
    // Since Processing blocks don't make it to the UI, we reconstruct from available data
    if (step.tool && step.tool !== 'MESSAGE') {
      // Try to extract action details from the tool name and reasoning
      const actionDetails: any = {
        type: 'anthropic_inferred_action',
        tool: step.tool
      };

      // Look for coordinate patterns in reasoning
      const coordMatch = reasoning.match(/coordinate.*?\[(\d+),\s*(\d+)\]/);
      if (coordMatch) {
        actionDetails.coordinate = [parseInt(coordMatch[1]), parseInt(coordMatch[2])];
      }

      // Look for text patterns
      const textMatch = reasoning.match(/text[":]\s*"([^"]+)"/);
      if (textMatch) {
        actionDetails.text = textMatch[1];
      }

      // Look for action type in reasoning
      if (reasoning.includes('screenshot')) actionDetails.action = 'screenshot';
      else if (reasoning.includes('left_click') || reasoning.includes('click')) actionDetails.action = 'left_click';
      else if (reasoning.includes('type')) actionDetails.action = 'type';
      else if (reasoning.includes('key')) actionDetails.action = 'key';
      else if (reasoning.includes('wait')) actionDetails.action = 'wait';

      return actionDetails;
    }

    return null;
  };

  const actionArgs = parseAnthropicActionArgs(step);

  return (
    <motion.div
      className={`p-6 ${
        isUserInput
          ? "bg-white shadow-sm"
          : isSystemMessage
          ? "bg-[#2E191E] text-white shadow-md"
          : "transition-colors"
      } border border-[#E5E5E5] font-ppsupply space-y-3`}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-3">
          {/* Step number */}
          <span
            className={`text-xs w-6 h-6 flex items-center justify-center font-semibold text-gray-600 border bg-gray-200`}
          >
            {step.stepNumber || parsedReasoning.stepNumber || index + 1}
          </span>
          
          {/* Anthropic-specific tool name with tool type */}
          <span
            className={`py-1 font-medium ${
              isSystemMessage 
                ? "text-gray-200" 
                : "text-[#2E191E]"
            } text-sm flex items-center gap-2`}
          >
            {anthropicToolNameMapping[step.tool] || step.tool}
            {parsedReasoning.toolName && (
              <span className="px-2 py-0.5 bg-gray-100 text-[#2E191E] text-xs border border-gray-300 font-mono">
                {parsedReasoning.toolName}
              </span>
            )}
            {parsedReasoning.actionType && (
              <span className="px-2 py-0.5 bg-gray-100 text-[#2E191E] text-xs border border-gray-300 font-mono">
                {parsedReasoning.actionType}
              </span>
            )}
            {parsedReasoning.blockType && (
              <span className="px-2 py-0.5 bg-gray-100 text-[#2E191E] text-xs border border-gray-300 font-mono">
                {parsedReasoning.blockType}
              </span>
            )}
            {parsedReasoning.toolId && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs border border-gray-300 font-mono">
                {parsedReasoning.toolId.substring(0, 8)}...
              </span>
            )}
          </span>
        </div>
      </div>
      
      <div className="text-sm leading-relaxed">
        {isSystemMessage && step.tool === "MESSAGE" ? (
          <SystemMessageContent step={step} previousSteps={previousSteps} index={index} />
        ) : (
          <div className="space-y-2">
            {isCompletionMessage ? (
              // For completion, show only the final message once
              step.text && <div>{step.text}</div>
            ) : (
              <>
                {/* Keep the step text below reasoning if present */}
                {step.text && <div>{step.text}</div>}

                {/* Show Anthropic tool call details inline */}
                {actionArgs && (
                  <div className="space-y-2">
                    {/* New structured format handling */}
                    {'provider' in actionArgs && actionArgs.provider === 'anthropic' && (
                      <>

                        {/* Tool use from new schema */}
                        {actionArgs.toolUse && (
                          <div className="p-2 bg-gray-50 border border-gray-200 text-xs">
                            <span className="font-medium text-gray-800">🔧 Anthropic Tool Call: </span>
                            <span className="font-mono text-gray-700">{actionArgs.toolUse.input.action}</span>
                            {actionArgs.toolUse.input.coordinate && Array.isArray(actionArgs.toolUse.input.coordinate) && (
                              <span className="font-mono text-gray-700 ml-2">
                                @ [{actionArgs.toolUse.input.coordinate.join(', ')}]
                              </span>
                            )}
                            {actionArgs.toolUse.input.text && (
                              <span className="font-mono text-gray-700 ml-2">
                                "{actionArgs.toolUse.input.text}"
                              </span>
                            )}
                            {actionArgs.toolUse.input.duration && (
                              <span className="font-mono text-gray-700 ml-2">
                                {actionArgs.toolUse.input.duration}s
                              </span>
                            )}
                            <span className="font-mono text-gray-500 ml-2 text-xs">
                              ID: {actionArgs.toolUse.id || 'unknown'}
                            </span>
                          </div>
                        )}

                        {/* Error handling from new schema */}
                        {actionArgs.error && (
                          <div className="p-2 bg-gray-50 border border-gray-200 text-xs">
                            <span className="font-medium text-gray-800">
                              {actionArgs.error.type === 'browser_session' 
                                ? '🌐 Browser Session Error: '
                                : actionArgs.error.type === 'cursor_injection'
                                ? '🖱️ Cursor Injection Error: '
                                : actionArgs.error.type === 'key_mapping'
                                ? '⌨️ Key Mapping Error: '
                                : '❌ Action Error: '
                              }
                            </span>
                            <span className="text-gray-700">{actionArgs.error.details}</span>
                            {actionArgs.error.actionType && (
                              <span className="ml-2 px-1 py-0.5 bg-gray-200 text-gray-800 text-xs font-mono">
                                {actionArgs.error.actionType}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Completion from new schema */}
                        {actionArgs.completion && (
                          <div className="p-2 bg-gray-50 border border-gray-200 text-xs">
                            <span className="font-medium text-gray-800">Completion: </span>
                            <span className="text-gray-700">{actionArgs.completion.message}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Legacy format handling */}
                    {!('provider' in actionArgs && actionArgs.provider === 'anthropic') && (
                      <>

                        {/* Processing block tool calls - the real Anthropic tool calls */}
                        {actionArgs.type === 'anthropic_processing_block' && actionArgs.action && (
                          <div className="p-2 bg-gray-50 border border-gray-200 text-xs">
                            <span className="font-medium text-gray-800">🔧 Anthropic Tool Call: </span>
                            <span className="font-mono text-gray-700">{actionArgs.action}</span>
                            {actionArgs.coordinate && Array.isArray(actionArgs.coordinate) && (
                              <span className="font-mono text-gray-700 ml-2">
                                @ [{actionArgs.coordinate.join(', ')}]
                              </span>
                            )}
                            {actionArgs.text && (
                              <span className="font-mono text-gray-700 ml-2">
                                "{actionArgs.text}"
                              </span>
                            )}
                            {actionArgs.duration && (
                              <span className="font-mono text-gray-700 ml-2">
                                {actionArgs.duration}s
                              </span>
                            )}
                            <span className="font-mono text-gray-500 ml-2 text-xs">
                              ID: {actionArgs.tool_id || 'unknown'}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Inferred actions from available data */}
                    {actionArgs.type === 'anthropic_inferred_action' && actionArgs.action && (
                      <div className="p-2 bg-gray-50 border border-gray-200 text-xs">
                        <span className="font-medium text-gray-800">🔧 Action: </span>
                        <span className="font-mono text-gray-700">{actionArgs.action}</span>
                        {actionArgs.coordinate && Array.isArray(actionArgs.coordinate) && (
                          <span className="font-mono text-gray-700 ml-2">
                            @ [{actionArgs.coordinate.join(', ')}]
                          </span>
                        )}
                        {actionArgs.text && (
                          <span className="font-mono text-gray-700 ml-2">
                            "{actionArgs.text}"
                          </span>
                        )}
                      </div>
                    )}

                    {/* Legacy tool use and processing block support */}
                    {(actionArgs.type === 'tool_use' || actionArgs.type === 'processing_block') && actionArgs.action && (
                      <div className="p-2 bg-gray-50 border border-gray-200 text-xs">
                        <span className="font-medium text-gray-800">
                          {actionArgs.type === 'processing_block' ? '⚙️ Processing Tool:' : '🔧 Tool Call:'} 
                        </span>
                        <span className="font-mono text-gray-700">{actionArgs.action}</span>
                        {actionArgs.coordinate && Array.isArray(actionArgs.coordinate) && (
                          <span className="font-mono text-gray-700 ml-2">
                            @ [{actionArgs.coordinate.join(', ')}]
                          </span>
                        )}
                        {actionArgs.text && (
                          <span className="font-mono text-gray-700 ml-2">
                            "{actionArgs.text}"
                          </span>
                        )}
                        {actionArgs.duration && (
                          <span className="font-mono text-gray-700 ml-2">
                            {actionArgs.duration}s
                          </span>
                        )}
                        {actionArgs.tool_id && (
                          <span className="font-mono text-gray-500 ml-2 text-xs">
                            ID: {actionArgs.tool_id.substring(0, 12)}...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}


                {/* Special handling for Anthropic browser session errors */}
                {parsedReasoning.type === 'error' && (
                  <div className="p-2 bg-gray-50 border border-gray-200 text-xs">
                    <span className="font-medium text-gray-800">
                      {step.reasoning.includes('Target page, context or browser has been closed') 
                        ? 'Browser Session Issue: '
                        : step.reasoning.includes('Failed to inject cursor')
                        ? 'Cursor Injection Issue: '
                        : step.reasoning.includes('Error executing action')
                        ? 'Action Execution Error: '
                        : step.reasoning.includes('Unknown key')
                        ? 'Key Mapping Error: '
                        : 'Error: '
                      }
                    </span>
                    <span className="text-gray-700">
                      {step.reasoning.includes('Target page, context or browser has been closed') 
                        ? 'Browser session was closed unexpectedly'
                        : step.reasoning.includes('Failed to inject cursor')
                        ? 'Unable to inject cursor for visual feedback'
                        : step.reasoning.includes('Unknown key: "ctrl"')
                        ? 'Keyboard shortcut "ctrl" not supported (use individual key presses)'
                        : step.reasoning.includes('Unknown key')
                        ? 'Keyboard key not recognized'
                        : step.reasoning
                      }
                    </span>
                    {parsedReasoning.actionType && (
                      <span className="ml-2 px-1 py-0.5 bg-gray-200 text-gray-800 text-xs font-mono">
                        {parsedReasoning.actionType}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Anthropic-specific action args parsing */}
            {actionArgs && (
              <details className="mt-3 text-xs group">
                <summary className="cursor-pointer font-semibold text-gray-600 hover:text-gray-800 transition-colors flex items-center gap-2">
                  <svg 
                    className="w-3 h-3 transition-transform group-open:rotate-90" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>ToolCall</span>
                  <span className="px-2 py-0.5 bg-gray-100 text-[#2E191E] border border-gray-300 font-mono">
                    {step.tool}
                  </span>
                </summary>
                <div className="mt-2 p-3 bg-gray-50 space-y-2 border border-gray-200">
                  {/* Parse Anthropic-specific action arguments */}
                  <div className="font-semibold text-gray-700">Arguments:</div>
                  <pre className="p-3 bg-white overflow-x-auto border border-gray-200 text-xs font-mono text-gray-700">
                    {JSON.stringify(actionArgs, null, 2)}
                  </pre>
                  {/* Show detailed breakdown for any action args */}
                  {actionArgs && (
                    <div className="p-2 bg-gray-50 border border-gray-200 text-xs space-y-1">
                      <div>
                        <span className="font-medium text-gray-700">Type: </span>
                        <span className="font-mono text-gray-700">{actionArgs.type}</span>
                      </div>
                      {actionArgs.action && (
                        <div>
                          <span className="font-medium text-gray-700">Action: </span>
                          <span className="font-mono text-gray-700">{actionArgs.action}</span>
                        </div>
                      )}
                      {actionArgs.coordinate && Array.isArray(actionArgs.coordinate) && (
                        <div>
                          <span className="font-medium text-gray-700">Coordinates: </span>
                          <span className="font-mono text-gray-700">[{actionArgs.coordinate.join(', ')}]</span>
                        </div>
                      )}
                      {actionArgs.text && (
                        <div>
                          <span className="font-medium text-gray-700">Text: </span>
                          <span className="font-mono text-gray-700">"{actionArgs.text}"</span>
                        </div>
                      )}
                      {actionArgs.duration && (
                        <div>
                          <span className="font-medium text-gray-700">Duration: </span>
                          <span className="font-mono text-gray-700">{actionArgs.duration}s</span>
                        </div>
                      )}
                      {actionArgs.tool_id && (
                        <div>
                          <span className="font-medium text-gray-700">Tool ID: </span>
                          <span className="font-mono text-gray-600">{actionArgs.tool_id}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SystemMessageContent({
  step,
}: {
  step: BrowserStep;
  previousSteps: BrowserStep[];
  index: number;
}) {
  return (
    <>
      {(() => {
        // Check if this is a message with a question
        if (step.text.includes("?")) {
          // Find all sentences that end with a question mark
          const sentences = step.text.match(/[^.!?]+[.!?]+/g) || [step.text];

          // Separate questions from non-questions
          const questions = sentences.filter((s) => s.trim().endsWith("?"));
          const nonQuestions = sentences.filter((s) => !s.trim().endsWith("?"));

          // Join non-questions as the answer
          const answerText = nonQuestions.join(" ").trim();

          // Join questions as the question
          const questionText = questions.join(" ").trim();

          // Extract answer content from the message or find it in previous steps
          let displayAnswerText = answerText;

          // If there's no answer content but there is a question
          if (!displayAnswerText && questionText) {
            // First, check if this step has a specific answer marker
            if (step.text.includes("ANSWER:")) {
              const answerParts = step.text.split("ANSWER:");
              if (answerParts.length > 1) {
                // Extract the text after "ANSWER:" and before any "QUESTION" marker
                let extractedAnswer = answerParts[1].trim();
                if (extractedAnswer.includes("QUESTION")) {
                  extractedAnswer = extractedAnswer.split("QUESTION")[0].trim();
                }
                if (extractedAnswer) {
                  displayAnswerText = extractedAnswer;
                }
              }
            }

          } else if (!displayAnswerText) {
            // For other cases with no answer content
            displayAnswerText = step.text;
          }

          // Only render the answer part in this message block
          return (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Answer
              </div>
              <div className="p-3 bg-gray-800/30 border border-gray-700">
                <span className="text-gray-100">{displayAnswerText}</span>
              </div>
            </div>
          );
        } else {
          // For regular messages without questions, format them as answers
          return (
            <div className="p-3 bg-gray-800/20 border border-gray-700">
              <span className="text-gray-100">{step.text}</span>
            </div>
          );
        }
      })()}
    </>
  );
}

