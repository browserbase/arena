"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Layers, X } from "lucide-react";

interface NavBarProps {
  title?: string;
  showCloseButton?: boolean;
  onClose?: () => void;
  showGitHubButton?: boolean;
  className?: string;
}

export default function NavBar({
  title = "Arena",
  showCloseButton = false,
  onClose,
  showGitHubButton = true,
  className = "",
}: NavBarProps) {
  return (
    <motion.nav
      className={`flex justify-between items-center px-3 py-2 sm:px-8 sm:py-4 bg-white border-b border-[#CAC8C7] shadow-sm relative z-10 ${className}`}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2 }}
      style={{
        backgroundColor: "#ffffff",
      }}
    >
      <div className="flex items-center gap-2">
        <a
          href="https://www.browserbase.com/cua/gemini"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 sm:gap-3 hover:opacity-90 transition-opacity duration-200"
        >
          <Image
            src="/favicon.svg"
            alt="Google Browser"
            className="w-6 h-6 sm:w-8 sm:h-8"
            width={32}
            height={32}
          />
          <span className="font-ppsupply text-sm sm:text-xl font-bold text-[#100D0D]">
            {title}
          </span>
        </a>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <a
          href="https://www.stagehand.dev/agent-evals"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button className="h-fit flex items-center justify-center px-2 py-1.5 sm:px-3 sm:py-2 gap-1 text-xs sm:text-sm font-medium text-[#100D0D] border border-[#CAC8C7] transition-colors duration-200 hover:opacity-90"
            style={{ backgroundColor: "#FFC83C" }}
          >
            <span className="font-ppsupply">
              <span className="sm:hidden">Evals</span>
              <span className="hidden sm:inline">Computer Use Evaluations</span>
            </span>
          </button>
        </a>
        {showGitHubButton && (
          <a
            href="https://github.com/browserbase/arena"
            target="_blank"
            rel="noopener noreferrer"
          >
            <button className="h-fit flex items-center justify-center px-2 py-1.5 sm:px-3 sm:py-2 bg-[#1b2128] hover:bg-[#1d232b] gap-1 text-xs sm:text-sm font-medium text-white border border-[#CAC8C7] transition-colors duration-200">
              <Image
                src="/github.svg"
                alt="GitHub"
                width={16}
                height={16}
                className="sm:w-5 sm:h-5 sm:mr-2"
              />
              <span className="hidden sm:inline">View GitHub</span>
            </button>
          </a>
        )}
        {showCloseButton && onClose && (
          <motion.button
            onClick={onClose}
            className="flex items-center justify-center px-2 py-1.5 sm:px-3 sm:py-2 bg-[#F6F5F5] gap-1 text-xs sm:text-sm font-medium border border-[#CAC8C7] transition-all duration-200 hover:bg-gray-100 h-full"
            whileTap={{ scale: 0.98 }}
          >
            <span className="flex items-center text-[#10100D]">
              <span className="hidden sm:inline">Close</span>
              <X
                size={14}
                className="sm:size-4 sm:ml-2 text-[#10100D]"
                strokeWidth={2}
              />
            </span>
          </motion.button>
        )}
      </div>
    </motion.nav>
  );
}
