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
import { SessionControls } from "./SessionControls";

import { useAgentStreamByEndpoint } from "../hooks/useAgentStreamByEndpoint";
import { ChatFeedProps, BrowserStep } from "../types/ChatFeed";
import { SessionLiveURLs } from "@browserbasehq/sdk/resources/index.mjs";

type RightProvider = "openai" | "anthropic";

function AgentPanel({
  title,
  endpoint,
  goal,
  sessionId: providedSessionId,
  initialSessionUrl,
  onStopAll: _onStopAll, // eslint-disable-line @typescript-eslint/no-unused-vars
  onRestartAll,
  className = "",
}: {
  title: string;
  endpoint: string;
  goal: string | null;
  sessionId: string | null;
  initialSessionUrl?: string | null;
  onStopAll: () => void;
  onRestartAll: () => void;
  className?: string;
}) {
  const provider = useMemo(() => {
    if (endpoint.includes('/api/agent/openai')) return 'openai';
    if (endpoint.includes('/api/agent/anthropic')) return 'anthropic';
    if (endpoint.includes('/api/agent/gemini')) return 'gemini';
    return undefined;
  }, [endpoint]);

  const [activePage, setActivePage] = useState<SessionLiveURLs.Page | null>(null);
  const [sessionTime, setSessionTime] = useState(0);
  const [hasEnded, setHasEnded] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
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
      console.log(`[AgentPanel-${title}] Agent started with session: ${data.sessionId}`);
      setHasEnded(false);
      setUiState((prev) => ({ ...prev, sessionId: data.sessionId }));
    },
    [title]
  );

  const handleDone = useCallback(() => {
    console.log(`[AgentPanel-${title}] Agent finished`);
    setHasEnded(true);
    if (uiState.sessionId) {
      fetch("/api/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: uiState.sessionId }),
      }).catch((error) => {
        console.log(`[AgentPanel-${title}] Error during session termination (can be ignored):`, error);
      });
    }
  }, [uiState.sessionId, title]);

  const handleError = useCallback((errorMessage: string) => {
    console.error(`[AgentPanel-${title}] Agent stream error:`, errorMessage);
    setHasEnded(true);
  }, [title]);

  const { sessionId, sessionUrl, connectUrl, steps, isFinished } =
    useAgentStreamByEndpoint({
      endpoint,
      sessionId: providedSessionId,
      goal,
      onStart: handleStart,
      onDone: handleDone,
      onError: handleError,
    });

  const agentFinished = isFinished || hasEnded;
  const activePageUrl = activePage?.debuggerFullscreenUrl ?? activePage?.debuggerUrl ?? null;

  // Prefer initial session URL (from creation) to open curtains early; fallback to active page URL or hook sessionUrl
  const browserDisplayUrl = initialSessionUrl || activePageUrl || sessionUrl;

  // Track session time
  useEffect(() => {
    let timer: number | undefined;
    if (uiState.sessionId) {
      setSessionTime(0);
      timer = window.setInterval(() => setSessionTime((t) => t + 1), 1000);
    }
    return () => { if (timer) window.clearInterval(timer); };
  }, [uiState.sessionId]);

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

  return (
    <div className={`flex-1 flex flex-col min-w-0 ${className}`}>
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-[#CAC8C7] bg-white flex items-center justify-between">
        <span className="font-ppsupply font-semibold text-[#2E191E] text-lg">{title}</span>
        {!agentFinished && uiState.sessionId && !isMobile && (
          <SessionControls sessionTime={sessionTime} onStop={handleDone} />
        )}
      </div>
      
      {/* Panel content */}
      <div className="flex flex-col md:flex-row h-full overflow-hidden">
        {/* Browser area */}
        <div className="w-full md:flex-[3] p-4 md:p-6 order-first md:order-last flex flex-col items-center justify-center bg-white">
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
            sessionTime={sessionTime}
            onStop={handleDone}
            onRestart={onRestartAll}
          />

          {/* Mobile session controls */}
          {!agentFinished && isMobile && (
            <div className="mt-4 flex justify-center items-center space-x-1 text-sm text-[#2E191E]">
              <SessionControls
                sessionTime={sessionTime}
                onStop={handleDone}
              />
            </div>
          )}
        </div>

        {/* Chat sidebar */}
        <div
          className="w-full md:w-[350px] min-w-0 md:min-w-[280px] px-4 pb-4 md:px-6 md:pb-6 border-r border-[#CAC8C7] flex flex-col flex-1 overflow-hidden"
          style={{
            height: isMobile
              ? "calc(100vh - 300px)"
              : "calc(100vh - 12rem)",
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
            steps={uiState.steps}
            chatContainerRef={chatContainerRef}
            isMobile={isMobile}
            provider={provider}
          />
        </div>
      </div>
    </div>
  );
}

export default function ChatFeedVS({ initialMessage, onClose, rightProvider = "openai" }: ChatFeedProps & { rightProvider?: RightProvider }) {
  const [sessions, setSessions] = useState<{ left: { id: string | null; url: string | null }; right: { id: string | null; url: string | null } }>({ left: { id: null, url: null }, right: { id: null, url: null } });
  const [sessionsInitialized, setSessionsInitialized] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const goal = useMemo(() => initialMessage, [initialMessage]);
  const { width } = useWindowSize();
  const isMobile = width ? width < 768 : false;

  // Initialize both sessions in parallel
  useEffect(() => {
    if (!goal || sessionsInitialized) return;

    const initializeSessions = async () => {
      try {
        console.log("[ChatFeedVS] Initializing sessions in parallel...");
        
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

        console.log("[ChatFeedVS] Both sessions created:", {
          left: leftSessionData.sessionId,
          right: rightSessionData.sessionId
        });

        setSessions({
          left: { id: leftSessionData.sessionId, url: leftSessionData.sessionUrl ?? null },
          right: { id: rightSessionData.sessionId, url: rightSessionData.sessionUrl ?? null },
        });
        setSessionsInitialized(true);
        
        // Track the start event
        try {
          posthog.capture("vs_run_start", { 
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
        console.error("[ChatFeedVS] Failed to initialize sessions:", error);
        setSessionError(error instanceof Error ? error.message : "Failed to initialize sessions");
      }
    };

    initializeSessions();
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
        title="VS Browser"
        showCloseButton={true}
        onClose={onClose}
        showGitHubButton={false}
      />
      <main
        className="flex-1 flex flex-col items-center sm:p-4 md:p-6 relative overflow-hidden"
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
          className="w-full max-w-[95vw] bg-white md:border border-[#CAC8C7] shadow-sm overflow-hidden mx-auto relative z-10"
          style={{ height: isMobile ? "calc(100vh - 56px)" : "auto" }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {/* Model comparison header */}
          <div className="flex items-center justify-center p-4 border-b border-[#CAC8C7] bg-gray-50">
            <div className="flex items-center gap-4">
              <span className="font-ppsupply font-semibold text-[#2E191E]">Model Comparison</span>
              <div className="text-sm text-gray-600 font-ppsupply">
                Watch both agents tackle the same task simultaneously
              </div>
            </div>
          </div>
          
          {/* Split view panels */}
          <div 
            className="flex flex-col md:flex-row" 
            style={{ height: isMobile ? "calc(100vh - 140px)" : "calc(100vh - 140px)" }}
          >
            {sessionError ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="text-red-600 font-ppsupply text-lg mb-2">Failed to initialize sessions</div>
                  <div className="text-gray-600 font-ppsupply text-sm mb-4">{sessionError}</div>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-[#FF3B00] text-white font-ppsupply hover:bg-[#E63500] transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            ) : !sessionsInitialized ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="text-[#2E191E] font-ppsupply text-lg mb-4">Initializing sessions...</div>
                  <div className="flex justify-center space-x-2">
                    <div className="w-3 h-3 bg-[#FF3B00] rounded-full animate-pulse"></div>
                    <div className="w-3 h-3 bg-[#FF3B00] rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-3 h-3 bg-[#FF3B00] rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <AgentPanel
                  title="Gemini"
                  endpoint="/api/agent/gemini"
                  goal={goal}
                  sessionId={sessions.left.id}
                  initialSessionUrl={sessions.left.url}
                  onStopAll={() => {}}
                  onRestartAll={onClose}
                  className="border-r border-[#CAC8C7]"
                />
                <AgentPanel
                  title={rightProvider === "openai" ? "OpenAI Computer Use" : "Claude 4 Sonnet"}
                  endpoint={rightProvider === "openai" ? "/api/agent/openai" : "/api/agent/anthropic"}
                  goal={goal}
                  sessionId={sessions.right.id}
                  initialSessionUrl={sessions.right.url}
                  onStopAll={() => {}}
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