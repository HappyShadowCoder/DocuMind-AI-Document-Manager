"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Cpu,
  Sparkles,
  Key,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (newProvider: "ollama" | "openai") => void;
}

export default function AiSettingsModal({
  isOpen,
  onClose,
  onSaved,
}: AiSettingsModalProps) {
  const [provider, setProvider] = useState<"ollama" | "openai">("ollama");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [envKeyConfigured, setEnvKeyConfigured] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setTestResult(null);

    async function fetchAiSettings() {
      try {
        const res = await fetch("/api/settings/ai");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setProvider(data.provider || "ollama");
            setApiKey(data.apiKey || "");
            setHasApiKey(Boolean(data.hasApiKey));
            setEnvKeyConfigured(Boolean(data.envKeyConfigured));
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError("Failed to load current AI settings. Please try again.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchAiSettings();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleTestKey() {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          apiKey,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid) {
        setTestResult({
          valid: true,
          message: data.message || "Valid API key! Connected to OpenAI successfully.",
        });
      } else {
        setTestResult({
          valid: false,
          error: data.error || "OpenAI rejected this API key.",
        });
      }
    } catch (err: any) {
      setTestResult({
        valid: false,
        error: err.message || "Network error while validating key.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    if (provider === "openai" && !apiKey.trim() && !hasApiKey && !envKeyConfigured) {
      setError("Please provide an OpenAI API key to enable OpenAI mode.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to save AI settings.");
      }

      setHasApiKey(data.hasApiKey);
      setSuccessMessage(
        `AI settings updated! Active provider: ${
          provider === "openai" ? "OpenAI (Cloud)" : "Ollama (Offline)"
        }`
      );

      if (onSaved) {
        onSaved(provider);
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Failed to save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                AI Engine & Model Settings
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose between Offline (Ollama) and Cloud (OpenAI) for chat and embeddings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading AI settings…</p>
          </div>
        ) : (
          <div className="mt-5 space-y-5">

            {/* Provider Selection Cards */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active AI Engine
              </label>
              
              <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                
                {/* Option 1: Ollama */}
                <div
                  onClick={() => {
                    setProvider("ollama");
                    setTestResult(null);
                    setError(null);
                  }}
                  className={`relative cursor-pointer rounded-xl border p-4 transition-all ${
                    provider === "ollama"
                      ? "border-blue-600 bg-blue-50/50 shadow-sm ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/30"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                      <Cpu className="h-5 w-5" />
                    </div>
                    {provider === "ollama" && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                    Offline (Ollama)
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    100% offline & private on your host machine. No API keys or internet needed.
                  </p>
                  
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>llama3.1:8b + nomic-embed</span>
                  </div>
                </div>

                {/* Option 2: OpenAI */}
                <div
                  onClick={() => {
                    setProvider("openai");
                    setError(null);
                  }}
                  className={`relative cursor-pointer rounded-xl border p-4 transition-all ${
                    provider === "openai"
                      ? "border-blue-600 bg-blue-50/50 shadow-sm ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/30"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    {provider === "openai" && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                    Cloud (OpenAI)
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Cloud intelligence with state-of-the-art models for document extraction.
                  </p>

                  <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-violet-700 dark:text-violet-400">
                    <Zap className="h-3.5 w-3.5" />
                    <span>gpt-4o-mini + embedding-3</span>
                  </div>
                </div>

              </div>
            </div>

            {/* OpenAI API Key Section */}
            <div
              className={`rounded-xl border p-4 transition-all duration-200 ${
                provider === "openai"
                  ? "border-violet-300 bg-violet-50/40 dark:border-violet-900/50 dark:bg-violet-950/20"
                  : "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40 opacity-75"
              }`}
            >
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Key className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  <span>OpenAI API Key</span>
                  {envKeyConfigured && !apiKey && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Found in .env
                    </span>
                  )}
                  {hasApiKey && !envKeyConfigured && (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                      Configured
                    </span>
                  )}
                </label>

                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Get key <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder={
                      hasApiKey
                        ? "•••••••••••••••••••••••• (Key saved, type to replace)"
                        : "sk-proj-..."
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 pr-10 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title={showApiKey ? "Hide key" : "Show key"}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTestKey}
                  disabled={testing || (!apiKey.trim() && !hasApiKey && !envKeyConfigured)}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {testing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Testing…
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      Test Key
                    </>
                  )}
                </button>
              </div>

              {/* Real-time test result */}
              {testResult && (
                <div
                  className={`mt-2.5 flex items-start gap-2 rounded-lg p-2.5 text-xs ${
                    testResult.valid
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                  }`}
                >
                  {testResult.valid ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  )}
                  <span>{testResult.message || testResult.error}</span>
                </div>
              )}

              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Your key is stored securely in your user record and used strictly for streaming document chat completions and embeddings.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

          </div>
        )}

        {/* Modal Footer */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Save Changes
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
