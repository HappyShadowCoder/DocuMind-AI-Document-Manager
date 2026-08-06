// src/components/admin/llm-concurrency-settings.tsx
//
// Drop this into your existing admin panel, e.g. in
// src/components/admin/admin-panel.tsx:
//
//   import LlmConcurrencySettings from "./llm-concurrency-settings";
//   ...
//   <LlmConcurrencySettings />
//
// It lets an admin set how many people can chat with the local LLM at the
// same time. When that limit is hit, /api/files/[id]/chat responds with a
// 429 and a "heavy traffic" message instead of queueing the request.

"use client";

import { useEffect, useState } from "react";

export default function LlmConcurrencySettings() {
  const [maxConcurrent, setMaxConcurrentState] = useState<number>(3);
  const [activeSessions, setActiveSessions] = useState<number>(0);
  const [inputValue, setInputValue] = useState("3");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/llm-concurrency");
      if (res.ok) {
        const data = await res.json();
        setMaxConcurrentState(data.maxConcurrent);
        setInputValue(String(data.maxConcurrent));
        setActiveSessions(data.activeSessions ?? 0);
      }
    } catch (err) {
      console.error("Failed to load LLM concurrency settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    // Keep the "active right now" count fresh while the admin has this open.
    const interval = setInterval(fetchSettings, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    const parsed = parseInt(inputValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setMessage("Enter a whole number of 1 or more.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/llm-concurrency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxConcurrent: parsed }),
      });
      if (res.ok) {
        const data = await res.json();
        setMaxConcurrentState(data.maxConcurrent);
        setInputValue(String(data.maxConcurrent));
        setMessage("Saved.");
      } else {
        setMessage("Failed to save setting.");
      }
    } catch {
      setMessage("Error saving setting.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 font-display text-lg text-slate-900 dark:text-white">AI chat concurrency</h3>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Limit how many people can query the LLM on this PC at the same time. Anyone over the
        limit sees a "heavy traffic" message instead of the model queueing up.
      </p>

      {loading ? (
        <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="max-concurrent">
              Max concurrent users
            </label>
            <input
              id="max-concurrent"
              type="number"
              min={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="h-10 w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <button
              onClick={handleSave}
              disabled={saving || parseInt(inputValue, 10) === maxConcurrent}
              className="flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-4 text-sm font-medium text-white shadow-sm transition-all disabled:pointer-events-none disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Right now: <span className="font-semibold text-slate-600 dark:text-slate-300">{activeSessions}</span> /{" "}
            {maxConcurrent} slots in use
          </p>

          {message && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{message}</p>}
        </>
      )}
    </div>
  );
}