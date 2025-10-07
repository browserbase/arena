"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import posthog from "posthog-js";

import NavBar from "./NavBar";
import BrowserTabs from "./ui/BrowserTabs";
import BrowserSessionContainer from "./BrowserSessionContainer";
import PinnedGoalMessage from "./chat/PinnedGoalMessage";
import ChatMessagesList from "./chat/ChatMessagesList";

import { useAgentStreamGoogle } from "@/app/hooks/useAgentStreamGoogle";
import { useAgentStreamAnthropic } from "@/app/hooks/useAgentStreamAnthropic";
import { useAgentStreamOpenAI } from "@/app/hooks/useAgentStreamOpenAI";
import { ChatFeedProps, BrowserStep } from "@/app/types/ChatFeed";
import { SessionLiveURLs } from "@browserbasehq/sdk/resources/index.mjs";
import PinnedFinalAnswer from "./chat/PinnedFinalAnswer";


type RightProvider = "openai" | "anthropic";

function AgentPanel({
  title,
  provider,
  goal,
  sessionId: providedSessionId,
  initialSessionUrl,
  stopSignal,
  onRestartAll,
  className = "",
}: {
  title: string;
  provider: string;
  goal: string | null;
  sessionId: string | null;
  initialSessionUrl?: string | null;
  stopSignal: number;
  onRestartAll: () => void;
  className?: string;
}) {
  const providerType = useMemo(() => {
    return provider as "openai" | "anthropic" | "google";
  }, [provider]);

  const [activePage, setActivePage] = useState<SessionLiveURLs.Page | null>(null);
  const [hasEnded, setHasEnded] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastStopSignalRef = useRef(stopSignal);
  const { width } = useWindowSize();
  const isMobile = width ? width < 768 : false;

  const [uiState, setUiState] = useState<{
    sessionId: string | null;
    sessionUrl: string | null;
    connectUrl: string | null;
    steps: BrowserStep[];
  }>({
    sessionId: null,
    sessionUrl: null,
    connectUrl: null,
    steps: [],
  });

  const handleStart = useCallback(
    (data: { sessionId: string }) => {
      setHasEnded(false);
      setUiState((prev) => ({ ...prev, sessionId: data.sessionId }));
    },
    []
  );

  const handleDone = useCallback(() => {
    setHasEnded(true);
    if (uiState.sessionId) {
      fetch("/api/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: uiState.sessionId }),
      }).catch((error) => {
        console.error(`[AgentPanel-${title}] Error during session termination (can be ignored):`, error);
      });
    }
  }, [uiState.sessionId, title]);

  const handleError = useCallback((errorMessage: string) => {
    console.error(`[AgentPanel-${title}] Agent stream error:`, errorMessage);
    setHasEnded(true);
  }, [title]);

  const agentHooks = {
    google: useAgentStreamGoogle,
    anthropic: useAgentStreamAnthropic,
    openai: useAgentStreamOpenAI,
  } as const;

  if (!providerType) {
    throw new Error(`Unknown provider: ${providerType}`);
  }

  const useAgentStream = agentHooks[providerType];
  const { sessionId, sessionUrl, connectUrl, steps, isFinished } = useAgentStream({
    sessionId: providedSessionId,
    goal: providedSessionId ? goal : null, // Only pass goal if we have a sessionId
    onStart: handleStart,
    onDone: handleDone,
    onError: handleError,
    provider: providerType,
  });

  const agentFinished = isFinished || hasEnded;
  const activePageUrl = activePage?.debuggerFullscreenUrl ?? activePage?.debuggerUrl ?? null;

  // Prefer initial session URL (from creation) to open curtains early; fallback to active page URL or hook sessionUrl
  const browserDisplayUrl = initialSessionUrl || activePageUrl || sessionUrl;
  
  // Memoize final answer step
  const finalAnswerStep = useMemo(() => {
    return uiState.steps
      .slice()
      .reverse()
      .find((step) => step.tool === "MESSAGE" && step.instruction === "Final Answer");
  }, [uiState.steps]);
  
  const stepsWithoutFinal = useMemo(() => {
    if (!finalAnswerStep) {
      return uiState.steps;
    }
    return uiState.steps.filter((step) => step !== finalAnswerStep);
  }, [uiState.steps, finalAnswerStep]);

  // Track scroll position to apply conditional margin
  useEffect(() => {
    const handleScroll = () => {
      if (chatContainerRef.current) {
        setIsScrolled(chatContainerRef.current.scrollTop > 10);
      }
    };

    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, []);

  // Update UI state when hook state changes
  useEffect(() => {
    setUiState((prev) => ({
      ...prev,
      sessionId: sessionId || prev.sessionId,
      sessionUrl: sessionUrl || prev.sessionUrl,
      connectUrl: connectUrl || prev.connectUrl,
      steps,
    }));
  }, [sessionId, sessionUrl, connectUrl, steps]);

  useEffect(() => {
    if (stopSignal !== lastStopSignalRef.current) {
      lastStopSignalRef.current = stopSignal;
      if (stopSignal > 0 && !agentFinished) {
        handleDone();
      }
    }
  }, [stopSignal, handleDone, agentFinished]);

  return (
    <div className={`flex-1 flex flex-col min-w-0 ${className}`}>
      {/* Panel header */}
      <div className="px-2 md:px-3 py-1.5 md:py-2 border-b border-[#CAC8C7] bg-white flex items-center justify-between">
        <span className="font-ppsupply font-semibold text-[#2E191E] text-sm md:text-base">{title}</span>
      </div>
      
      {/* Panel content - different layout for mobile */}
      {isMobile ? (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Browser takes full space - goal is shown globally above both panels */}
          <div className="flex-1 p-2 bg-white overflow-hidden flex flex-col items-center justify-center">
            {/* Tabs - more compact on mobile */}
            {!agentFinished && uiState.sessionId && (
              <div className="mb-1 w-full">
                <BrowserTabs
                  sessionId={uiState.sessionId}
                  activePage={activePage}
                  setActivePage={setActivePage}
                />
              </div>
            )}
            
            <BrowserSessionContainer
              sessionUrl={browserDisplayUrl}
              isVisible={true}
              isCompleted={agentFinished}
              initialMessage={goal || undefined}
              onRestart={onRestartAll}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row h-full overflow-hidden">
          {/* Browser area - Desktop */}
          <div className="w-full md:flex-[3] p-2 md:p-3 order-first md:order-last flex flex-col items-center justify-center bg-white">
            {/* Tabs */}
            {!agentFinished && uiState.sessionId && (
              <BrowserTabs
                sessionId={uiState.sessionId}
                activePage={activePage}
                setActivePage={setActivePage}
              />
            )}

            <BrowserSessionContainer
              sessionUrl={browserDisplayUrl}
              isVisible={true}
              isCompleted={agentFinished}
              initialMessage={goal || undefined}
              onRestart={onRestartAll}
            />
          </div>

          {/* Chat sidebar - Desktop only */}
          <div
            className="w-full md:w-[320px] min-w-0 md:min-w-[260px] px-2 pb-3 md:px-4 md:pb-4 border-r border-[#CAC8C7] flex flex-col flex-1 overflow-hidden"
            style={{
              height: "calc(100vh - 8rem)",
              position: "relative",
            }}
          >
            {/* Pinned Goal Message */}
            {goal && (
              <PinnedGoalMessage
                initialMessage={goal}
                isScrolled={isScrolled}
              />
            )}

            <ChatMessagesList
              steps={stepsWithoutFinal}
              chatContainerRef={chatContainerRef}
              isMobile={false}
              provider={providerType}
              hasPinnedFinalAnswer={Boolean(finalAnswerStep)}
            />
            
            {finalAnswerStep && (
              <PinnedFinalAnswer message={finalAnswerStep.text || ""} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatFeed({ initialMessage, onClose, rightProvider = "openai" }: ChatFeedProps & { rightProvider?: RightProvider }) {
  const [sessions, setSessions] = useState<{ left: { id: string | null; url: string | null }; right: { id: string | null; url: string | null } }>({ left: { id: null, url: null }, right: { id: null, url: null } });
  const [sessionsInitialized, setSessionsInitialized] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [stopSignal, setStopSignal] = useState(0);
  const initializingSessionsRef = useRef(false);
  const goal = useMemo(() => initialMessage, [initialMessage]);
  const { width } = useWindowSize();
  const isMobile = width ? width < 768 : false;

  const handleStopAllSessions = useCallback(() => {
    setStopSignal((prev) => prev + 1);
  }, []);

  // Initialize both sessions in parallel
  useEffect(() => {
    if (!goal || sessionsInitialized || initializingSessionsRef.current) return;

    initializingSessionsRef.current = true;

    const initializeSessions = async () => {
      try {
        // Create both sessions simultaneously
        const [leftSessionResponse, rightSessionResponse] = await Promise.all([
          fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          }),
          fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          })
        ]);

        const [leftSessionData, rightSessionData] = await Promise.all([
          leftSessionResponse.json(),
          rightSessionResponse.json()
        ]);

        if (!leftSessionData.success || !rightSessionData.success) {
          throw new Error("Failed to create sessions");
        }

        // console.log("[ChatFeed] Both sessions created:", {
        //   left: leftSessionData.sessionId,
        //   right: rightSessionData.sessionId
        // });

        setSessions({
          left: { id: leftSessionData.sessionId, url: leftSessionData.sessionUrl ?? null },
          right: { id: rightSessionData.sessionId, url: rightSessionData.sessionUrl ?? null },
        });
        setStopSignal(0);
        setSessionsInitialized(true);
        
        // Track the start event
        try {
          posthog.capture("browser_agent_arena_start", { 
            goal: goal?.substring(0, 100), 
            rightProvider,
            leftSessionId: leftSessionData.sessionId,
            rightSessionId: rightSessionData.sessionId,
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          console.error("PostHog error:", e);
        }

      } catch (error) {
        console.error("[ChatFeed] Failed to initialize sessions:", error);
        setSessionError(error instanceof Error ? error.message : "Failed to initialize sessions");
        return;
      } finally {
        initializingSessionsRef.current = false;
      }
    };

    void initializeSessions();
  }, [goal, rightProvider, sessionsInitialized]);

  // Spring configuration for smoother animations
  const springConfig = {
    type: "spring",
    stiffness: 350,
    damping: 30,
  };

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        ...springConfig,
        staggerChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.2 },
    },
  };

  return (
    <motion.div
      className="min-h-screen min-w-[80vw] bg-gray-50 flex flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <NavBar
        title="Arena"
        showCloseButton={true}
        onClose={onClose}
        showGitHubButton={false}
      />
      <main
        className="flex-1 flex flex-col items-center sm:p-2 md:p-3 relative overflow-hidden"
        style={{ backgroundColor: "#FCFCFC" }}
      >
        <div
          className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
          style={{
            backgroundImage: "url(/grid.svg)",
            backgroundSize: "25%",
            backgroundPosition: "center",
            backgroundRepeat: "repeat",
            opacity: 0.8,
            position: "fixed",
          }}
        ></div>
        <motion.div
          className="w-full max-w-[98vw] bg-white md:border border-[#CAC8C7] shadow-sm overflow-hidden mx-auto relative z-10"
          style={{ height: isMobile ? "calc(100vh - 56px)" : "calc(100vh - 100px)" }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {/* Model comparison header */}
          <div className="flex flex-col gap-2 p-2 md:p-3 border-b border-[#CAC8C7] bg-gray-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="font-ppsupply font-semibold text-[#2E191E] text-sm md:text-base">Model Comparison</span>
                <div className="text-xs md:text-sm text-gray-600 font-ppsupply">
                  Watch both agents tackle the same task simultaneously
                </div>
              </div>
              <button
                type="button"
                onClick={handleStopAllSessions}
                disabled={!sessionsInitialized || !!sessionError}
                className={`w-full sm:w-auto px-3 py-1.5 text-xs sm:text-sm font-ppsupply font-medium text-white transition-colors ${
                  !sessionsInitialized || !!sessionError
                    ? "bg-[#FF3B00]/50 cursor-not-allowed"
                    : "bg-[#FF3B00] hover:bg-[#E63500]"
                }`}
              >
                Stop All Sessions
              </button>
            </div>
          </div>
          
          {/* Shared Task Display - Mobile Only */}
          {isMobile && goal && sessionsInitialized && !sessionError && (
            <div className="bg-white border-b border-[#CAC8C7] px-3 py-2 sticky top-0 z-20">
              <div className="text-xs font-ppsupply text-gray-700">
                <span className="font-semibold">Task: </span>
                {goal}
              </div>
            </div>
          )}
          
          {/* Split view panels */}
          <div 
            className="flex flex-col md:flex-row" 
            style={{ height: isMobile ? (sessionsInitialized && !sessionError ? "calc(100vh - 180px)" : "calc(100vh - 140px)") : "calc(100vh - 110px)" }}
          >
            {sessionError ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center">
                  <div className="text-red-600 font-ppsupply text-sm md:text-lg mb-2">Failed to initialize sessions</div>
                  <div className="text-gray-600 font-ppsupply text-xs md:text-sm mb-4">{sessionError}</div>
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 md:px-4 md:py-2 text-sm bg-[#FF3B00] text-white font-ppsupply hover:bg-[#E63500] transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            ) : !sessionsInitialized ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center">
                  <div className="text-[#2E191E] font-ppsupply text-sm md:text-lg mb-3 md:mb-4">Initializing sessions...</div>
                  <div className="flex justify-center space-x-1.5 md:space-x-2">
                    <div className="w-2 h-2 md:w-3 md:h-3 bg-[#FF3B00] rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 md:w-3 md:h-3 bg-[#FF3B00] rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 md:w-3 md:h-3 bg-[#FF3B00] rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <AgentPanel
                  title="Gemini Computer Use"
                  provider="google"
                  goal={goal}
                  sessionId={sessions.left.id}
                  initialSessionUrl={sessions.left.url}
                  stopSignal={stopSignal}
                  onRestartAll={onClose}
                  className={isMobile ? "border-b border-[#CAC8C7]" : "border-r border-[#CAC8C7]"}
                />
                <AgentPanel
                  title={rightProvider === "openai" ? "OpenAI Computer Use" : "Anthropic Computer Use (Claude Sonnet 4.5)"}
                  provider={rightProvider}
                  goal={goal}
                  sessionId={sessions.right.id}
                  initialSessionUrl={sessions.right.url}
                  stopSignal={stopSignal}
                  onRestartAll={onClose}
                />
              </>
            )}
          </div>
        </motion.div>
      </main>
    </motion.div>
  );
}
