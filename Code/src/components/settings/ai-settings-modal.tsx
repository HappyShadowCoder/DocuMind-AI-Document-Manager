"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Cpu,
  Check,
  AlertCircle,
  Loader2,
  ShieldCheck,
  HardDrive,
  RefreshCw,
} from "lucide-react";

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (newProvider: "ollama") => void;
}

export default function AiSettingsModal({
  isOpen,
  onClose,
  onSaved,
}: AiSettingsModalProps) {
  const [model, setModel] = useState("llama3.1:8b");
  const [embedModel, setEmbedModel] = useState("nomic-embed-text");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:11434");

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [statusResult, setStatusResult] = useState<{
    online: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    async function fetchAiSettings() {
      try {
        const res = await fetch("/api/settings/ai");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setModel(data.model || "llama3.1:8b");
            setEmbedModel(data.embeddingModel || "nomic-embed-text");
            setBaseUrl(data.baseUrl || "http://127.0.0.1:11434");
          }
        }
      } catch (err: any) {
        console.error("Failed to load AI settings:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchAiSettings();
    checkOllamaStatus();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  async function checkOllamaStatus() {
    setChecking(true);
    setStatusResult(null);

    try {
      // Test local connectivity via pinging Ollama directly or through local check
      const res = await fetch("http://127.0.0.1:11434/api/tags", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }).catch(() => null);

      if (res && res.ok) {
        setStatusResult({
          online: true,
          message: "Local Ollama service is active and responding on 127.0.0.1:11434.",
        });
      } else {
        setStatusResult({
          online: false,
          message: "Ollama is not responding on 127.0.0.1:11434. Start Ollama with: 'ollama run llama3.1:8b'",
        });
      }
    } catch {
      setStatusResult({
        online: false,
        message: "Could not reach local Ollama instance on port 11434.",
      });
    } finally {
      setChecking(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                100% Offline AI Engine
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Air-gapped on-premise document intelligence
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-4">
          {/* Privacy Guarantee Card */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/60 p-4 dark:border-emerald-500/20 dark:bg-emerald-950/20">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                <p className="font-semibold text-emerald-950 dark:text-emerald-100">
                  Zero Cloud Dependencies
                </p>
                <p className="text-emerald-800/90 dark:text-emerald-300/80 leading-relaxed">
                  All legal records, confidential FIRs, vectors, and chat interactions are executed strictly on your local hardware. External cloud APIs (including OpenAI) are completely disabled.
                </p>
              </div>
            </div>
          </div>

          {/* Engine Specs */}
          <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-emerald-500" />
                Inference Engine
              </span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                Ollama Local Server
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-indigo-500" />
                Chat & Analysis Model
              </span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {model}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">
                Vector Embedding Model
              </span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {embedModel} (768-dim)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Local Host Endpoint
              </span>
              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                {baseUrl}
              </span>
            </div>
          </div>

          {/* Connection Status Box */}
          {statusResult && (
            <div
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                statusResult.online
                  ? "border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              {statusResult.online ? (
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              )}
              <span className="leading-snug">{statusResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={checkOllamaStatus}
            disabled={checking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            <span>Check Local Status</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
