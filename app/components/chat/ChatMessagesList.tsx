import { RefObject, useRef } from "react";
import { BrowserStep } from "@/app/types/ChatFeed";
import ChatMessageOpenAI from "./messages/ChatMessageOpenAI";
import ChatMessageAnthropic from "./messages/ChatMessageAnthropic";
import ChatMessageGoogle from "./messages/ChatMessageGoogle";

type Provider = "openai" | "anthropic" | "google";

interface ChatMessagesListProps {
  steps: BrowserStep[];
  chatContainerRef: RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  provider?: Provider;
  hasPinnedFinalAnswer?: boolean;
}

export default function ChatMessagesList({
  steps,
  chatContainerRef,
  isMobile,
  provider,
  hasPinnedFinalAnswer = false,
}: ChatMessagesListProps) {
  // Track previous steps length to detect new messages
  const prevStepsLength = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Filter out empty first steps
  const filteredSteps = steps.filter((step, index) => {
    // Hide first step if it's empty or placeholder
    if (index === 0 && step.tool === "MESSAGE" && !step.text?.trim() && !step.reasoning?.trim()) {
      return false;
    }
    return true;
  });

  // Choose the appropriate ChatMessage component based on provider
  const getChatMessageComponent = (step: BrowserStep, index: number, previousSteps: BrowserStep[]) => {
    const props = {
      key: step.stepNumber ?? index,
      step,
      index,
      previousSteps
    };

    switch (provider) {
      case "openai":
        return <ChatMessageOpenAI {...props} />;
      case "anthropic":
        return <ChatMessageAnthropic {...props} />;
      case "google":
        return <ChatMessageGoogle {...props} />;
    }
  };

  // Auto-scroll when new messages appear
  const handleContainerRef = (node: HTMLDivElement | null) => {
    if (chatContainerRef) {
      (chatContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
    containerRef.current = node;
    
    // Scroll to bottom when new messages are added
    if (node && filteredSteps.length > prevStepsLength.current) {
      requestAnimationFrame(() => {
        node.scrollTop = node.scrollHeight;
      });
    }
    
    prevStepsLength.current = filteredSteps.length;
  };

  return (
    <div
      ref={handleContainerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 hide-scrollbar w-full"
      style={{
        height: isMobile
          ? "calc(100vh - 400px)"
          : "calc(100% - 100px)",
        flex: "1 1 auto",
        position: "relative",
        maxWidth: "100%",
      }}
    >
      {filteredSteps.map((step, index) => 
        getChatMessageComponent(step, index, filteredSteps.slice(0, index))
      )}
      
      {/* Extra padding at bottom to ensure last message is fully visible */}
      <div style={{ height: hasPinnedFinalAnswer ? '16px' : '60px' }} />
    </div>
  );
}
