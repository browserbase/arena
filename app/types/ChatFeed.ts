export interface ChatFeedProps {
    initialMessage: string | null;
    onClose: () => void;
    url?: string;
  }

export interface ActionArgs {
    action: string;
    [key: string]: unknown;
}
  
export interface BrowserStep {
    text: string;
    reasoning: string;
    tool: "MESSAGE" | string;
    instruction: string;
    stepNumber?: number;
    messageId?: string;
    actionArgs?: ActionArgs;
}
  
export interface AgentState {
    sessionId: string | null;
    sessionUrl: string | null;
    steps: BrowserStep[];
    isLoading: boolean;
}