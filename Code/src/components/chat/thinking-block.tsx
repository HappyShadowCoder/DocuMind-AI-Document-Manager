"use client";

import React, { useState, useEffect, useRef } from "react";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface ParsedChatContent {
  thought: string;
  answer: string;
  isThinking: boolean;
}

function splitThoughtAndPrematureAnswer(thought: string): { thought: string; leakedAnswer: string } {
  // Look for boundary where internal thought ends and actual markdown table/answer begins
  const patterns = [
    /\n\s*The FIR details are as follows:/i,
    /\n\s*Here (?:is|are) the details/i,
    /\n\s*Here is the information/i,
    /\n\s*Summary of (?:the FIR|this document)/i,
    /\n\s*#{1,3}\s+[A-Za-z0-9]/,
    /\n\s*\|\s*Document(?:\s*\/|\s*Name)/i,
    /\n\s*\|[\s-]+\|[\s-]+/,
  ];

  let earliestIdx = -1;
  for (const pat of patterns) {
    const match = thought.match(pat);
    if (match && match.index !== undefined) {
      if (earliestIdx === -1 || match.index < earliestIdx) {
        earliestIdx = match.index;
      }
    }
  }

  if (earliestIdx !== -1) {
    return {
      thought: thought.substring(0, earliestIdx).trim(),
      leakedAnswer: thought.substring(earliestIdx).trim(),
    };
  }

  return { thought, leakedAnswer: "" };
}

/**
 * Parses raw LLM output into thinking/reasoning and final visible response.
 * Handles partial streaming tags (<think> without </think> yet).
 */
export function parseThinkingAndContent(
  raw: string,
  isStreaming?: boolean
): ParsedChatContent {
  if (!raw) {
    return {
      thought: "",
      answer: "",
      isThinking: Boolean(isStreaming),
    };
  }

  const openMatch = raw.match(/<think>|<thought>/i);
  if (openMatch && openMatch.index !== undefined) {
    const thinkOpenIdx = openMatch.index;
    const openTagLength = openMatch[0].length;
    const afterOpen = raw.substring(thinkOpenIdx + openTagLength);

    const closeMatch = afterOpen.match(/<\/think>|<\/thought>/i);
    if (closeMatch && closeMatch.index !== undefined) {
      // Both open and close tags are present
      const rawThought = afterOpen.substring(0, closeMatch.index).trim();
      const rawAnswer = (
        raw.substring(0, thinkOpenIdx) +
        afterOpen.substring(closeMatch.index + closeMatch[0].length)
      ).trim();

      const { thought, leakedAnswer } = splitThoughtAndPrematureAnswer(rawThought);
      const answer = leakedAnswer ? `${leakedAnswer}\n\n${rawAnswer}`.trim() : rawAnswer;

      return {
        thought,
        answer,
        isThinking: false,
      };
    } else {
      // Still inside <think> tag: check if model started outputting answer content
      const rawThought = afterOpen.trim();
      const rawAnswer = raw.substring(0, thinkOpenIdx).trim();

      const { thought, leakedAnswer } = splitThoughtAndPrematureAnswer(rawThought);
      if (leakedAnswer) {
        // Model began answering without closing </think>
        const answer = rawAnswer ? `${rawAnswer}\n\n${leakedAnswer}`.trim() : leakedAnswer;
        return {
          thought,
          answer,
          isThinking: false,
        };
      }

      return {
        thought,
        answer: rawAnswer,
        isThinking: true,
      };
    }
  }

  // No <think> tag found
  if (isStreaming && raw.trim().length === 0) {
    return {
      thought: "",
      answer: "",
      isThinking: true,
    };
  }

  return {
    thought: "",
    answer: raw,
    isThinking: false,
  };
}

interface ThinkingBlockProps {
  thought: string;
  isThinking: boolean;
  isStreaming?: boolean;
}

export function ThinkingBlock({
  thought,
  isThinking,
  isStreaming,
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activelyThinking = isThinking && Boolean(isStreaming);

  // Timer logic for live thinking
  useEffect(() => {
    if (activelyThinking) {
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        setElapsedSeconds(secs);
      }, 500);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (elapsedSeconds > 0 && finalDuration === null) {
        setFinalDuration(elapsedSeconds);
        // Collapse once thought is complete so final answer is front and center
        setIsExpanded(false);
      }
    }
  }, [activelyThinking, elapsedSeconds, finalDuration]);

  // Phase 1: Initial "Working.." state before thoughts start streaming
  if (activelyThinking && !thought) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 select-none">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
        </span>
        <span className="font-sans font-medium text-slate-600 dark:text-slate-300 tracking-wide">
          Working..
        </span>
      </div>
    );
  }

  // If there are no thoughts and we are not thinking, render nothing
  if (!thought) {
    return null;
  }

  const durationLabel = finalDuration
    ? `${finalDuration}s`
    : elapsedSeconds > 0
    ? `${elapsedSeconds}s`
    : "";

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-indigo-200/80 bg-slate-50/80 shadow-xs transition-all dark:border-indigo-900/60 dark:bg-slate-900/80">
      {/* Header Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-3.5 py-2 text-left font-medium text-indigo-700 transition-colors hover:bg-indigo-50/60 dark:text-indigo-300 dark:hover:bg-slate-800/60"
      >
        <div className="flex items-center gap-2">
          <div className="relative flex h-5 w-5 items-center justify-center">
            {activelyThinking && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-30" />
            )}
            <Brain
              className={`h-3.5 w-3.5 ${
                activelyThinking
                  ? "animate-pulse text-indigo-600 dark:text-indigo-400"
                  : "text-indigo-500 dark:text-indigo-400"
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs tracking-wide text-slate-800 dark:text-slate-200">
              {activelyThinking ? "Thinking…" : "Thought process"}
            </span>
            {durationLabel && (
              <span className="rounded-full bg-indigo-100/80 px-1.5 py-0.2 font-mono text-[10px] text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-300">
                {durationLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="text-[11px] font-normal hidden sm:inline">
            {isExpanded ? "Hide" : "Show"}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-400 transition-transform" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform" />
          )}
        </div>
      </button>

      {/* Expanded Thought Stream */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden border-t border-slate-200/60 bg-white/50 dark:border-slate-800 dark:bg-slate-950/40"
          >
            <div className="p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <div className="max-h-72 overflow-y-auto pr-1 whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed opacity-95">
                {thought}
                {activelyThinking && (
                  <span className="inline-block h-3.5 w-1.5 animate-pulse bg-indigo-600 align-middle ml-1" />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
