import { RefObject } from "react";
import { BrowserStep } from "@/app/types/ChatFeed";
import ChatMessage from "./ChatMessage";
import ChatMessageOpenAI from "./messages/ChatMessageOpenAI";
import ChatMessageAnthropic from "./messages/ChatMessageAnthropic";
import ChatMessageGemini from "./messages/ChatMessageGemini";

type Provider = "openai" | "anthropic" | "gemini";

interface ChatMessagesListProps {
  steps: BrowserStep[];
  chatContainerRef: RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  provider?: Provider;
}

export default function ChatMessagesList({
  steps,
  chatContainerRef,
  isMobile,
  provider,
}: ChatMessagesListProps) {
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
      case "gemini":
        return <ChatMessageGemini {...props} />;
      default:
        // Fallback to original ChatMessage for backwards compatibility
        return <ChatMessage {...props} />;
    }
  };

  return (
    <div
      ref={chatContainerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 hide-scrollbar"
      style={{
        height: isMobile
          ? "calc(100vh - 400px)"
          : "calc(100% - 100px)",
        flex: "1 1 auto",
        position: "relative",
      }}
    >
      {filteredSteps.map((step, index) => 
        getChatMessageComponent(step, index, filteredSteps.slice(0, index))
      )}

    </div>
  );
}
