"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BrowserStep } from "@/app/types/ChatFeed";

interface ChatMessageOpenAIProps {
  step: BrowserStep;
  index: number;
  previousSteps?: BrowserStep[];
}

// OpenAI-specific tool name mapping
const openaiToolNameMapping: Record<string, string> = {
  "computer_call": "Computer Action",
  "reasoning": "Reasoning",
  "MESSAGE": "Message",
  "computer": "Computer Tool",
  "screenshot": "Screenshot",
  "click": "Click",
  "type": "Type Text",
  "keypress": "Key Press",
  "scroll": "Scroll",
  "move": "Move Cursor",
  "drag": "Drag",
  "wait": "Wait",
  "navigate": "Navigate",
};

export default function ChatMessageOpenAI({
  step,
  index,
  previousSteps = [],
}: ChatMessageOpenAIProps) {
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

  // Parse OpenAI-specific reasoning patterns
  const parseOpenAIReasoning = (reasoning: string): {
    type: 'step' | 'computer_action' | 'reasoning' | 'completion' | 'error';
    content: string;
    stepNumber?: number;
    action?: string;
  } => {
    if (!reasoning) return { type: 'reasoning', content: '' };

    // Check for step execution pattern
    const stepMatch = reasoning.match(/Executing step (\d+)\/\d+/);
    if (stepMatch) {
      return {
        type: 'step',
        content: reasoning,
        stepNumber: parseInt(stepMatch[1])
      };
    }

    // Check for computer action patterns
    if (reasoning.includes('computer_call') || reasoning.includes('Computer action')) {
      let action = 'unknown';
      if (reasoning.includes('screenshot')) action = 'screenshot';
      else if (reasoning.includes('click')) action = 'click';
      else if (reasoning.includes('type')) action = 'type';
      else if (reasoning.includes('scroll')) action = 'scroll';
      else if (reasoning.includes('navigate')) action = 'navigate';

      return {
        type: 'computer_action',
        content: reasoning,
        action
      };
    }

    // Check for reasoning/thinking content
    if (reasoning.includes('💭') || reasoning.startsWith('I need to') || reasoning.startsWith('I\'ll')) {
      return {
        type: 'reasoning',
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

    // Check for errors
    if (reasoning.includes('Error') || reasoning.includes('failed')) {
      return {
        type: 'error',
        content: reasoning
      };
    }

    return { type: 'reasoning', content: reasoning };
  };

  const parsedReasoning = parseOpenAIReasoning(step.reasoning);

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
            className={`text-xs w-6 h-6 flex items-center justify-center font-semibold text-gray-600 border ${
              parsedReasoning.type === 'step' ? 'bg-blue-200 border-blue-400' :
              parsedReasoning.type === 'computer_action' ? 'bg-green-200 border-green-400' :
              parsedReasoning.type === 'error' ? 'bg-red-200 border-red-400' :
              'bg-gray-200'
            }`}
          >
            {step.stepNumber || parsedReasoning.stepNumber || index + 1}
          </span>
          
          {/* OpenAI-specific tool name with action type */}
          <span
            className={`py-1 font-medium ${
              isSystemMessage 
                ? "text-gray-200" 
                : "text-[#2E191E]"
            } text-sm flex items-center gap-2`}
          >
            {openaiToolNameMapping[step.tool] || step.tool}
            {parsedReasoning.action && (
              <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs border border-green-300 font-mono">
                {parsedReasoning.action}
              </span>
            )}
          </span>
          
          {/* Provider badge */}
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs border border-blue-300 font-mono">
            OpenAI
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
                {step.text && <div>{step.text}</div>}
              </>
            )}

            {/* OpenAI-specific action args parsing */}
            {typeof step.actionArgs !== "undefined" && (
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
                  <span>OpenAI Tool Call</span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 font-mono">
                    {step.tool}
                  </span>
                </summary>
                <div className="mt-2 p-3 bg-blue-50 space-y-2 border border-blue-200">
                  {/* Parse OpenAI-specific action arguments */}
                  <div className="font-semibold text-blue-800">OpenAI Computer Use Arguments:</div>
                  <pre className="p-3 bg-white overflow-x-auto border border-blue-200 text-xs font-mono text-blue-900">
                    {JSON.stringify(step.actionArgs, null, 2)}
                  </pre>
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
                OpenAI Response
              </div>
              <div className="p-3 bg-blue-900/30 border border-blue-700">
                <span className="text-gray-100">{displayAnswerText}</span>
              </div>
            </div>
          );
        } else {
          // For regular messages without questions, format them as answers
          return (
            <div className="p-3 bg-blue-900/20 border border-blue-700">
              <span className="text-gray-100">{step.text}</span>
            </div>
          );
        }
      })()}
    </>
  );
}

