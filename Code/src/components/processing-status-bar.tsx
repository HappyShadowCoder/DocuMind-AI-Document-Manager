"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertTriangle,
} from "lucide-react";

interface StatusData {
  totalCount: number;
  readyCount: number;
  pendingCount: number;
  failedCount: number;
  currentProcessingFile: string | null;
  pendingFiles: { id: string; name: string; status: string }[];
}

export default function ProcessingStatusBar({ onComplete }: { onComplete?: () => void }) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const prevPendingRef = useRef<number | null>(null);

  // Trigger background processing for any idle documents on mount
  useEffect(() => {
    fetch("/api/files/processing-status", { method: "POST" }).catch(() => {});
  }, []);

  // Poll status every 3 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;

    async function checkStatus() {
      try {
        const res = await fetch("/api/files/processing-status", { cache: "no-store" });
        if (res.ok) {
          const data: StatusData = await res.json();
          setStatus(data);

          // Check if we just completed all pending files
          if (
            prevPendingRef.current !== null &&
            prevPendingRef.current > 0 &&
            data.pendingCount === 0
          ) {
            setShowSuccessToast(true);
            if (onComplete) onComplete();
          }

          prevPendingRef.current = data.pendingCount;

          // If there are still pending files, trigger processing POST to ensure processing stays active
          if (data.pendingCount > 0) {
            fetch("/api/files/processing-status", { method: "POST" }).catch(() => {});
          }
        }
      } catch {
        // Ignore polling errors
      }
    }

    checkStatus();
    timer = setInterval(checkStatus, 3000);

    return () => clearInterval(timer);
  }, [onComplete]);

  // Auto-dismiss success toast after 5 seconds
  useEffect(() => {
    if (showSuccessToast) {
      const t = setTimeout(() => setShowSuccessToast(false), 5000);
      return () => clearTimeout(t);
    }
  }, [showSuccessToast]);

  if (!status) return null;

  const { totalCount, readyCount, pendingCount, failedCount, currentProcessingFile } = status;

  // Nothing to display if no files are pending and no success toast
  if (pendingCount === 0 && !showSuccessToast) {
    return null;
  }

  const processedCount = totalCount - pendingCount;
  const progressPercent = totalCount > 0 ? Math.min(100, Math.round((processedCount / totalCount) * 100)) : 0;

  return (
    <div className="fixed bottom-6 right-6 z-50 transition-all duration-300">
      {/* ── Success Completion Toast ── */}
      {showSuccessToast && pendingCount === 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/90 p-4 text-emerald-100 shadow-2xl backdrop-blur-xl dark:border-emerald-500/40">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">OCR & Embeddings Complete!</p>
            <p className="text-[11px] text-emerald-300">
              All PDF documents processed & ready for AI Chat.
            </p>
          </div>
        </div>
      )}

      {/* ── Active Processing Widget ── */}
      {pendingCount > 0 && (
        <div className="w-80 overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur-xl text-white">
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-[#0052FF]/20 text-[#4D7CFF]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-amber-400" />
              </div>
              <div>
                <h4 className="text-xs font-bold tracking-tight text-white">
                  AI Document Processing
                </h4>
                <p className="text-[10px] text-slate-400 font-mono">
                  {pendingCount} document{pendingCount > 1 ? "s" : ""} left
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsMinimized((m) => !m)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label="Toggle widget size"
            >
              {isMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Body Content */}
          {!isMinimized && (
            <div className="p-4 flex flex-col gap-3">
              {/* File Info */}
              {currentProcessingFile && (
                <div className="flex items-center gap-2 rounded-xl bg-slate-800/80 p-2.5 text-xs">
                  <FileText className="h-4 w-4 text-[#4D7CFF] shrink-0" />
                  <span className="truncate font-medium text-slate-200" title={currentProcessingFile}>
                    {currentProcessingFile}
                  </span>
                </div>
              )}

              {/* Progress Bar Container */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[11px] font-medium text-slate-400">
                  <span>Progress ({readyCount}/{totalCount})</span>
                  <span className="font-mono text-[#4D7CFF] font-bold">{progressPercent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0052FF] via-[#4D7CFF] to-blue-400 transition-all duration-500"
                    style={{ width: `${Math.max(5, progressPercent)}%` }}
                  />
                </div>
              </div>

              {/* Sub-label */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                <span>Running OCR & AI Vector Embeddings</span>
                {failedCount > 0 && (
                  <span className="flex items-center gap-1 text-red-400 font-semibold">
                    <AlertTriangle className="h-3 w-3" /> {failedCount} failed
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
