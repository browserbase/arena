"use client";

import { motion } from "framer-motion";
import { BrowserStep } from "@/app/types/ChatFeed";

interface ChatMessageProps {
  step: BrowserStep;
}

// Map Anthropic action types to display names
const actionTypeMapping: Record<string, string> = {
  "screenshot": "Screenshot",
  "click": "Click",
  "left_click": "Left Click",
  "type": "Type Text",
  "key": "Key Press",
  "keypress": "Key Press",
  "double_click": "Double Click",
  "triple_click": "Triple Click",
  "scroll": "Scroll",
  "move": "Move Cursor",
  "drag": "Drag",
  "wait": "Wait",
  "navigate": "Navigate",
};

const toolNameMapping: Record<string, string> = {
  "MESSAGE": "Message",
};

// Helper function to get display name for tool
function getToolDisplayName(step: BrowserStep): string {
  // For computer tool, use the action type from actionArgs
  if (step.tool === "computer" && step.actionArgs) {
    const action = (step.actionArgs as any).action;
    if (action && actionTypeMapping[action]) {
      return actionTypeMapping[action];
    }
  }
  // Fallback to tool name mapping or the tool itself
  return toolNameMapping[step.tool] || step.tool;
}

export default function ChatMessageAnthropic({ step }: ChatMessageProps) {
  const isUserInput = step.tool === "MESSAGE" && step.reasoning === "User input";
  const isCompletionMessage = step.tool === "MESSAGE" && step.reasoning === "Task execution completed";

  if (step.tool === "ERROR") return null;

  // Don't render blocks that have no meaningful content yet
  const hasReasoning = step.reasoning && step.reasoning.trim().length > 0;
  const hasActionArgs = step.actionArgs !== undefined;
  const hasText = step.text && step.text.trim().length > 0;

  // Only show blocks if they have content or are special cases
  // Allow action steps to render even without reasoning since they have actionArgs
  const shouldRender = hasReasoning || hasActionArgs || hasText || isCompletionMessage || isUserInput;

  if (!shouldRender) {
    return null;
  }

  return (
    <motion.div
      className={`p-6 border border-[#E5E5E5] font-ppsupply space-y-3 ${
        isUserInput ? "bg-white shadow-sm" : "transition-colors"
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs w-6 h-6 flex items-center justify-center font-semibold text-gray-600 border bg-gray-200">
            {step.stepNumber}
          </span>
          <span className="py-1 font-medium text-[#2E191E] text-sm">
            {getToolDisplayName(step)}
          </span>
        </div>
      </div>

      <div className="text-sm leading-relaxed">
        <div className="space-y-2">
          {isCompletionMessage ? (
            step.text && <div>{step.text}</div>
          ) : (
            <>
              {hasReasoning && (
                <div className="text-[#2E191E]">{step.reasoning}</div>
              )}
              {hasText && <div>{step.text}</div>}
              {/* Show a placeholder if we have action args but no reasoning */}
              {!hasReasoning && !hasText && hasActionArgs && (
                <div className="text-gray-500 italic">Executing action...</div>
              )}
            </>
          )}

          {hasActionArgs && (
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
                  {(step.actionArgs as any).action || step.tool}
                </span>
              </summary>
              <div className="mt-2 p-3 bg-gray-50 space-y-2 border border-gray-200">
                <div className="font-semibold text-gray-700">Arguments:</div>
                <pre className="p-3 bg-white overflow-x-auto border border-gray-200 text-xs font-mono text-gray-700">
                  {JSON.stringify(step.actionArgs, null, 2)}
                </pre>
              </div>
            </details>
          )}
        </div>
      </div>
    </motion.div>
  );
}
