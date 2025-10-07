"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import AnimatedButton from "./components/ui/AnimatedButton";
import posthog from "posthog-js";
import ChatFeed from "./components/ChatFeed";
import NavBar from "./components/NavBar";
import { Code, MessageCircle, UtensilsCrossed, Search } from "lucide-react";

const Tooltip = ({
  children,
  text,
}: {
  children: React.ReactNode;
  text: string;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {isHovered && (
        <motion.span
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 3, scale: 1 }}
          transition={{
            duration: 0.2,
            type: "spring",
            stiffness: 400,
            damping: 17,
          }}
          className="absolute w-auto px-3 py-2 min-w-max left-1/2 -translate-x-1/2 bg-[#2E191E] text-white text-xs font-ppsupply z-50 backdrop-blur-sm"
        >
          {text}
        </motion.span>
      )}
    </div>
  );
};

type RightProvider = "openai" | "anthropic";

export default function Home() {
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | null>(null);
  const [rightProvider, setRightProvider] =
    useState<RightProvider>("anthropic");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle CMD+Enter to submit the form when chat is not visible
      if (!isChatVisible && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const form = document.querySelector("form") as HTMLFormElement;
        if (form) {
          form.requestSubmit();
        }
      }

      // Handle CMD+K to focus input when chat is not visible
      if (!isChatVisible && (e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector(
          'input[name="message"]'
        ) as HTMLInputElement;
        if (input) {
          input.focus();
        }
      }

      // Handle ESC to close chat when visible
      if (isChatVisible && e.key === "Escape") {
        e.preventDefault();
        setIsChatVisible(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isChatVisible]);

  const startChat = useCallback(
    (finalMessage: string) => {
      setInitialMessage(finalMessage);
      setIsChatVisible(true);

      try {
        posthog.capture("browser_agent_arena_submit_message", {
          message: finalMessage,
          rightProvider,
        });
      } catch (e) {
        console.error(e);
      }
    },
    [setInitialMessage, setIsChatVisible, rightProvider]
  );

  return (
    <>
      {!isChatVisible ? (
        <div className="min-h-screen bg-gray-50 flex flex-col relative">
          {/* Grid Background */}
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
          {/* Top Navigation */}
          <NavBar />

          {/* OpenAI Issues Banner */}
          <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mx-4 sm:mx-6 z-20 relative">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-orange-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">
                  We're currently experiencing issues with OpenAI's API. Please
                  use Anthropic for now.
                </p>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <main className="flex-1 flex flex-col items-center pt-8 sm:pt-12 md:pt-16 lg:pt-20 pb-12 sm:pb-16 md:pb-24 lg:pb-32 px-4 sm:px-6 z-10">
            <div className="w-full max-w-[640px] md:max-w-[800px] lg:max-w-[960px] bg-white border border-[#CAC8C7] shadow-sm z-10">
              <div className="w-full h-10 md:h-16 bg-white border-b border-[#CAC8C7] flex items-center px-3 md:px-6">
                <div className="flex items-center gap-2">
                  <Tooltip text="why would you want to close this?">
                    <div className="w-2 h-2 md:w-3 md:h-3 bg-red-500 hover:scale-110 transition-transform" />
                  </Tooltip>
                  <Tooltip text="s/o to the 🅱️rowserbase devs">
                    <div className="w-2 h-2 md:w-3 md:h-3 bg-yellow-500 hover:scale-110 transition-transform" />
                  </Tooltip>
                  <Tooltip text="@kylejeong21 was here">
                    <div className="w-2 h-2 md:w-3 md:h-3 bg-green-500 hover:scale-110 transition-transform" />
                  </Tooltip>
                </div>
              </div>

              <div className="p-4 md:p-10 lg:p-12 flex flex-col items-center gap-4 md:gap-10">
                <div className="flex flex-col items-center gap-2 md:gap-5">
                  <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-ppneue text-gray-900 text-center">
                    Browser Agent Arena
                  </h1>
                  <p className="text-sm sm:text-base md:text-lg font-ppsupply text-gray-500 text-center">
                    Compare AI models side-by-side as they browse the web.
                  </p>

                  {/* Provider Selection */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 md:p-4 bg-gray-50 border border-[#CAC8C7] w-full">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1">
                      <span className="font-ppsupply text-xs sm:text-sm text-[#2E191E] font-medium w-10 sm:w-auto">
                        Left:
                      </span>
                      <span className="flex-1 text-center px-3 py-1 bg-[#2E191E] text-white text-xs sm:text-sm font-ppsupply">
                        Gemini
                      </span>
                    </div>
                    <div className="hidden sm:block w-px h-6 bg-[#CAC8C7]"></div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-1">
                      <span className="font-ppsupply text-xs sm:text-sm text-[#2E191E] font-medium w-10 sm:w-auto">
                        Right:
                      </span>
                      <div className="flex-1 inline-flex border border-[#CAC8C7] bg-white">
                        <button
                          className="flex-1 px-3 sm:px-4 py-1 text-xs sm:text-sm font-ppsupply cursor-not-allowed opacity-50 bg-gray-100 text-gray-400"
                          disabled
                          title="Currently unavailable due to API issues"
                        >
                          OpenAI
                        </button>
                        <button
                          className={`flex-1 px-3 sm:px-4 py-1 text-xs sm:text-sm font-ppsupply transition-all duration-200 ${
                            rightProvider === "anthropic"
                              ? "bg-[#2E191E] text-white"
                              : "bg-white text-[#2E191E] hover:bg-gray-50"
                          }`}
                          onClick={() => setRightProvider("anthropic")}
                        >
                          Anthropic
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const input = e.currentTarget.querySelector(
                      'input[name="message"]'
                    ) as HTMLInputElement;
                    const message = (formData.get("message") as string).trim();
                    const finalMessage = message || input.placeholder;
                    startChat(finalMessage);
                  }}
                  className="w-full max-w-[720px] md:max-w-[880px] lg:max-w-[1040px] flex flex-col items-center gap-3 md:gap-5"
                >
                  <div className="relative w-full">
                    <input
                      ref={inputRef}
                      name="message"
                      type="text"
                      placeholder="What's the price of NVIDIA stock?"
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pr-[90px] sm:pr-[100px] md:pr-[140px] border border-[#CAC8C7] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 focus:border-[#FF3B00] font-ppsupply text-sm md:text-base md:py-5 lg:py-6 transition-all duration-300 focus:pulse-glow-red focus:backdrop-blur-sm focus:bg-opacity-95 focus:bg-white"
                      style={{
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        backdropFilter: "blur(8px)",
                      }}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:pr-3">
                      <AnimatedButton type="submit">Run</AnimatedButton>
                    </div>
                  </div>
                </form>
                <div className="grid grid-cols-2 gap-2 md:gap-4 lg:gap-5 w-full">
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    onClick={() =>
                      startChat(
                        "Find the most recently opened non-draft PR on Github for Browserbase's Stagehand project and make sure the combination-evals in the PR validation passed."
                      )
                    }
                    className="p-2 sm:p-3 md:p-5 lg:p-6 text-xs sm:text-sm md:text-base lg:text-xl text-[#2E191E] border border-[#CAC8C7] hover:border-[#FF3B00] hover:text-[#FF3B00] transition-colors font-ppsupply font-medium text-center overflow-hidden text-ellipsis break-words whitespace-normal min-h-[80px] sm:min-h-[100px] md:min-h-[120px] flex items-center justify-center backdrop-blur-sm bg-opacity-60 bg-[rgba(245,240,255,0.15)] hover:bg-[rgba(255,59,0,0.05)]"
                  >
                    <div className="w-full h-full flex flex-col sm:flex-row justify-between items-start px-2 sm:px-3 md:px-4 py-2 sm:py-3 gap-2">
                      <span className="text-left text-xs sm:text-sm md:text-base">
                        Review a pull request
                        <br />
                        on Github
                      </span>
                      <div className="self-end sm:self-start">
                        <Code
                          className="sm:hidden"
                          size={16}
                          strokeWidth={1.5}
                        />
                        <Code
                          className="hidden sm:block"
                          size={20}
                          strokeWidth={1.5}
                        />
                      </div>
                    </div>
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                    onClick={() =>
                      startChat(
                        "Go to Hacker News and find the most controversial post from today, then read the top 3 comments and summarize the debate."
                      )
                    }
                    className="p-2 sm:p-3 md:p-5 lg:p-6 text-xs sm:text-sm md:text-base lg:text-xl text-[#2E191E] border border-[#CAC8C7] hover:border-[#FF3B00] hover:text-[#FF3B00] transition-colors font-ppsupply font-medium text-center overflow-hidden text-ellipsis break-words whitespace-normal min-h-[80px] sm:min-h-[100px] md:min-h-[120px] flex items-center justify-center backdrop-blur-sm bg-opacity-60 bg-[rgba(245,240,255,0.15)] hover:bg-[rgba(255,59,0,0.05)]"
                  >
                    <div className="w-full h-full flex flex-col sm:flex-row justify-between items-start px-2 sm:px-3 md:px-4 py-2 sm:py-3 gap-2">
                      <span className="text-left text-xs sm:text-sm md:text-base">
                        Browse Hacker News
                        <br />
                        for trending debates
                      </span>
                      <div className="self-end sm:self-start">
                        <MessageCircle
                          className="sm:hidden"
                          size={16}
                          strokeWidth={1.5}
                        />
                        <MessageCircle
                          className="hidden sm:block"
                          size={20}
                          strokeWidth={1.5}
                        />
                      </div>
                    </div>
                  </motion.button>
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.5 }}
                    onClick={() =>
                      startChat(
                        "Play a game of 2048 on https://www.2048.org/. Just try to win and I'll watch. Good luck!"
                      )
                    }
                    className="p-2 sm:p-3 md:p-5 lg:p-6 text-xs sm:text-sm md:text-base lg:text-xl text-[#2E191E] border border-[#CAC8C7] hover:border-[#FF3B00] hover:text-[#FF3B00] transition-colors font-ppsupply font-medium text-center overflow-hidden text-ellipsis break-words whitespace-normal min-h-[80px] sm:min-h-[100px] md:min-h-[120px] flex items-center justify-center backdrop-blur-sm bg-opacity-60 bg-[rgba(245,240,255,0.15)] hover:bg-[rgba(255,59,0,0.05)]"
                  >
                    <div className="w-full h-full flex flex-col sm:flex-row justify-between items-start px-2 sm:px-3 md:px-4 py-2 sm:py-3 gap-2">
                      <span className="text-left text-xs sm:text-sm md:text-base">
                        Play a game of
                        <br />
                        2048
                      </span>
                      <div className="self-end sm:self-start">
                        <UtensilsCrossed
                          className="sm:hidden"
                          size={16}
                          strokeWidth={1.5}
                        />
                        <UtensilsCrossed
                          className="hidden sm:block"
                          size={20}
                          strokeWidth={1.5}
                        />
                      </div>
                    </div>
                  </motion.button>
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.7 }}
                    onClick={() =>
                      startChat(
                        "Find the current price of Bitcoin and Ethereum."
                      )
                    }
                    className="p-2 sm:p-3 md:p-5 lg:p-6 text-xs sm:text-sm md:text-base lg:text-xl text-[#2E191E] border border-[#CAC8C7] hover:border-[#FF3B00] hover:text-[#FF3B00] transition-colors font-ppsupply font-medium text-center overflow-hidden text-ellipsis break-words whitespace-normal min-h-[80px] sm:min-h-[100px] md:min-h-[120px] flex items-center justify-center backdrop-blur-sm bg-opacity-60 bg-[rgba(245,240,255,0.15)] hover:bg-[rgba(255,59,0,0.05)]"
                  >
                    <div className="w-full h-full flex flex-col sm:flex-row justify-between items-start px-2 sm:px-3 md:px-4 py-2 sm:py-3 gap-2">
                      <span className="text-left text-xs sm:text-sm md:text-base">
                        Get current crypto prices
                        <br />
                      </span>
                      <div className="self-end sm:self-start">
                        <Search
                          className="sm:hidden"
                          size={16}
                          strokeWidth={1.5}
                        />
                        <Search
                          className="hidden sm:block"
                          size={20}
                          strokeWidth={1.5}
                        />
                      </div>
                    </div>
                  </motion.button>
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 1.0 }}
                  className="text-center text-xs text-gray-500"
                  onAnimationComplete={() => {
                    // Focus the input field after the last animation completes
                    setTimeout(() => {
                      inputRef.current?.focus();
                    }, 100);
                  }}
                >
                  <p>Or type your own request</p>
                </motion.div>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: 0.5,
                delay: 0.2,
                ease: [0.25, 0.1, 0.25, 1.0],
                staggerChildren: 0.1,
              }}
              className="bg-[#28171B] p-3 md:p-6 lg:p-8 mt-4 md:mt-10 w-full max-w-[640px] md:max-w-[800px] lg:max-w-[960px] relative overflow-hidden backdrop-blur-sm bg-opacity-90"
            >
              {/* Tech animation background elements */}
              <motion.div
                className="absolute inset-0 opacity-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.1 }}
                transition={{ duration: 0.5 }}
              >
                <div className="absolute top-0 right-0 sm:w-20 sm:h-20 w-16 h-16 bg-[#FF3B00] -full blur-xl"></div>
                <div className="absolute bottom-0 left-0 w-16 h-16 bg-blue-400 -full blur-xl"></div>
              </motion.div>

              <motion.p
                className="text-sm md:text-lg font-ppsupply text-center text-white relative z-10 font-semibold"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                Powered by{" "}
                <motion.a
                  href="https://browserbase.com"
                  className="text-[#FF3B00] hover:underline relative"
                  whileHover={{ scale: 1.05 }}
                >
                  Browserbase & Stagehand
                </motion.a>{" "}
              </motion.p>
            </motion.div>
          </main>
        </div>
      ) : (
        <ChatFeed
          key={`chat-feed-vs-${initialMessage}-${rightProvider}`}
          initialMessage={initialMessage}
          rightProvider={rightProvider}
          onClose={() => setIsChatVisible(false)}
        />
      )}
    </>
  );
}
