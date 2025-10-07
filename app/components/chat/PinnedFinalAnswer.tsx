import { motion } from "framer-motion";

interface PinnedFinalAnswerProps {
  message: string;
}

export default function PinnedFinalAnswer({
  message,
}: PinnedFinalAnswerProps) {
  return (
    <div className="relative mt-4">
      <motion.div
        className="font-ppsupply z-10 w-full max-h-[30vh] overflow-y-scroll"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          backgroundColor: "rgba(245, 240, 255, 0.95)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid #CAC8C7",
          width: "100%",
          zIndex: 10,
          scrollbarWidth: "thin",
          scrollbarColor: "#CAC8C7",
        }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(245, 240, 255, 0.85), rgba(245, 240, 255, 0))",
            opacity: 0.6,
            filter: "blur(2px)",
            width: "100%",
            height: "32px",
            left: "0",
            right: "0",
            top: "-24px",
            zIndex: 0,
          }}
        ></div>

        <div className="px-3 py-3 md:px-4 md:py-4">
          <p className="break-words whitespace-pre-wrap text-xs md:text-sm text-[#2E191E] leading-relaxed">
            {message}
          </p>
        </div>

        <style jsx>{`
          div::-webkit-scrollbar {
            width: 8px;
          }
          div::-webkit-scrollbar-track {
            background: transparent;
          }
          div::-webkit-scrollbar-thumb {
            background: #CAC8C7;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: #B5B3B2;
          }
        `}</style>
      </motion.div>
    </div>
  );
}