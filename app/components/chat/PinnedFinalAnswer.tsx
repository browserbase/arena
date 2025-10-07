import { motion } from "framer-motion";

interface PinnedFinalAnswerProps {
  message: string;
}

export default function PinnedFinalAnswer({
  message,
}: PinnedFinalAnswerProps) {
  return (
    <div className="relative -mx-4 min-h-[60vh] md:-mx-6 h-full mt-4">
      <motion.div
        className="font-ppsupply z-10 w-full overflow-y-auto h-full scrollbar scrollbar-thumb-[#CAC8C7] scrollbar-track-[#CAC8C7]/20 scrollbar-thumb-rounded scrollbar-w-[10px] hover:scrollbar-thumb-[#B5B3B2]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          backgroundColor: "rgba(245, 240, 255, 0.95)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid #CAC8C7",
          width: "100%",
          zIndex: 10,
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

        <div className="px-3 py-3 md:px-4 md:py-4 overflow-scroll">
          <p className="break-words whitespace-pre-wrap text-xs md:text-sm text-[#2E191E] leading-relaxed">
          <span className="font-semibold">Result:</span><br />
            {message}
          </p>
        </div>
      </motion.div>
    </div>
  );
}