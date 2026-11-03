// app/dashboard/pdf/[id]/page.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
    ArrowLeft,
    Send,
    Square,
    Loader2,
    FileText,
    Bot,
    User,
    AlertCircle,
    RefreshCcw,
    MessageSquare,
    Plus,
    PanelLeft,
    Eye,
    ChevronDown,
    Database,
    X,
    ChevronRight,
    IndianRupee,
    MapPin,
    Calendar,
    Scale,
    Hash,
    Zap,
    Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingBlock, parseThinkingAndContent } from "@/components/chat/thinking-block";

const PdfViewer = dynamic(() => import("./PdfViewer"), { 
  ssr: false, 
  loading: () => (
    <div className="flex items-center justify-center p-8 text-gray-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading PDF viewer...
    </div>
  )
});

type ProcessingStatus = "idle" | "processing" | "ready" | "failed";

interface ChatMessageRow {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt?: string;
}

interface DisplayMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources: number[] | null;
    streaming?: boolean;
    isCached?: boolean;
}

interface FileMeta {
    id: string;
    name: string;
    processingStatus: ProcessingStatus;
    processingError: string | null;
    summary: string | null;
    chunkCount?: number;
}

interface ChatSessionSummary {
    id: string;
    title: string;
    updatedAt: string;
}

function visiblePortion(raw: string): string {
    const idx = raw.lastIndexOf("[[SOURCES:");
    if (idx === -1) return raw;
    const closingIdx = raw.indexOf("]]", idx);
    if (closingIdx === -1) return raw.slice(0, idx);
    return (raw.slice(0, idx) + raw.slice(closingIdx + 2)).trimEnd();
}

function extractSources(raw: string): number[] | null {
    const match = raw.match(/\[\[SOURCES:([\d,]+)\]\]/);
    if (!match) return null;
    return Array.from(new Set(match[1].split(",").map(Number))).sort((a, b) => a - b);
}

function ChatSkeleton() {
    return (
        <div className="flex h-full flex-col gap-5 p-5">
            <div className="flex items-center gap-3">
                <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="flex flex-col gap-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-2.5 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                </div>
            </div>

            {[0, 1].map((i) => (
                <div key={i} className="space-y-2">
                    <div className="h-3 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-11/12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                </div>
            ))}

            <div className="mt-auto flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading the document, generating embeddings, and summarizing…
            </div>
        </div>
    );
}

function PdfChatContent() {
    const params = useParams<{ id: string }>();
    const fileId = params.id;
    const router = useRouter();
    const searchParams = useSearchParams();

    const initialMode = searchParams.get("mode") === "view" ? "view" : "chat";
    const [mode, setMode] = useState<"chat" | "view">(initialMode);
    const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
    const modeDropdownRef = useRef<HTMLDivElement>(null);

    const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [isClearingAll, setIsClearingAll] = useState(false);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [activeMobileTab, setActiveMobileTab] = useState<"document" | "chat">("chat");
    const [viewerWidth, setViewerWidth] = useState(760);

    // Metadata drawer
    const [metadataOpen, setMetadataOpen] = useState(false);
    const [firMetadata, setFirMetadata] = useState<Record<string, unknown> | null>(null);
    const [metadataLoading, setMetadataLoading] = useState(false);

    const viewerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const handleStopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    const fetchFirMetadata = useCallback(async () => {
        if (firMetadata !== null) return; // already loaded
        setMetadataLoading(true);
        try {
            const res = await fetch(`/api/search?fileId=${fileId}`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                const match = (data.results ?? [])[0];
                if (match) {
                    setFirMetadata(match);
                } else {
                    setFirMetadata({});
                }
            } else {
                setFirMetadata({});
            }
        } catch {
            setFirMetadata({});
        } finally {
            setMetadataLoading(false);
        }
    }, [fileId, firMetadata]);

    const handleMetadataToggle = () => {
        if (!metadataOpen && firMetadata === null) {
            fetchFirMetadata();
        }
        setMetadataOpen((o) => !o);
    };

    useEffect(() => {
        const urlMode = searchParams.get("mode");
        if (urlMode === "view" || urlMode === "chat") {
            setMode(urlMode);
        }
    }, [searchParams]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
                setModeDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleModeSelect = (newMode: "chat" | "view") => {
        setMode(newMode);
        setModeDropdownOpen(false);
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set("mode", newMode);
        router.replace(`/dashboard/pdf/${fileId}?${urlParams.toString()}`);
    };

    useEffect(() => {
        function updateWidth() {
            if (viewerRef.current) setViewerWidth(Math.max(280, viewerRef.current.clientWidth - 32));
        }
        updateWidth();
        window.addEventListener("resize", updateWidth);
        return () => window.removeEventListener("resize", updateWidth);
    }, [activeMobileTab, mode]);

    const loadSessions = useCallback(async () => {
        const res = await fetch(`/api/files/${fileId}/sessions`, { credentials: "include" });
        if (!res.ok) {
            return;
        }
        const data = (await res.json()) as { sessions: ChatSessionSummary[] };
        setSessions(data.sessions || []);
    }, [fileId]);

    const loadHistory = useCallback(async (sessionId?: string | null) => {
        if (!sessionId) {
            setMessages([]);
            return;
        }

        const res = await fetch(`/api/chat/sessions/${sessionId}/messages`, { credentials: "include" });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Failed to load chat history.");
        }
        const data = (await res.json()) as { messages: ChatMessageRow[] };
        setMessages(
            data.messages
                .filter((m) => m.role !== "system")
                .map((m) => ({
                    id: m.id,
                    role: m.role as "user" | "assistant",
                    content: visiblePortion(m.content),
                    sources: extractSources(m.content),
                }))
        );
    }, []);

    const handleDeleteSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this chat thread and its messages?")) return;
        setDeletingSessionId(sessionId);
        try {
            const res = await fetch(`/api/files/${fileId}/sessions?sessionId=${sessionId}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (res.ok) {
                if (currentSessionId === sessionId) {
                    setCurrentSessionId(null);
                    setMessages([]);
                }
                await loadSessions();
            }
        } catch (err) {
            console.error("Failed to delete chat session:", err);
        } finally {
            setDeletingSessionId(null);
        }
    }, [fileId, currentSessionId, loadSessions]);

    const handleClearAllSessions = useCallback(async () => {
        if (!window.confirm("Are you sure you want to delete all chat history for this document? This cannot be undone.")) return;
        setIsClearingAll(true);
        try {
            const res = await fetch(`/api/files/${fileId}/sessions?all=true`, {
                method: "DELETE",
                credentials: "include",
            });
            if (res.ok) {
                setCurrentSessionId(null);
                setMessages([]);
                await loadSessions();
            }
        } catch (err) {
            console.error("Failed to delete all sessions:", err);
        } finally {
            setIsClearingAll(false);
        }
    }, [fileId, loadSessions]);

    const ensureProcessed = useCallback(
        async (meta: FileMeta) => {
            const needsProcessing =
                meta.processingStatus === "idle" ||
                meta.processingStatus === "failed" ||
                (meta.processingStatus === "ready" && (meta.chunkCount ?? 0) === 0);

            if (meta.processingStatus === "ready" && !needsProcessing) {
                await loadSessions();
                if (currentSessionId) {
                    await loadHistory(currentSessionId);
                }
                return;
            }

            if (needsProcessing) {
                setFileMeta((prev) => (prev ? { ...prev, processingStatus: "processing" } : prev));

                const res = await fetch(`/api/files/${fileId}`, { method: "POST", credentials: "include" });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setFileMeta((prev) => (prev ? { ...prev, processingStatus: "failed", processingError: data.error } : prev));
                    setLoadError(data.error || "Failed to process this PDF.");
                    return;
                }
                setFileMeta((prev) => (prev ? { ...prev, processingStatus: "ready" } : prev));
                await loadSessions();
                if (currentSessionId) {
                    await loadHistory(currentSessionId);
                }
                return;
            }

            pollTimer.current = setTimeout(async () => {
                const pollRes = await fetch(`/api/files/${fileId}`, { credentials: "include" });
                const pollData = await pollRes.json().catch(() => ({}));
                if (pollRes.ok) {
                    setFileMeta(pollData.file);
                    await ensureProcessed(pollData.file);
                }
            }, 2500);
        },
        [fileId, currentSessionId, loadHistory, loadSessions]
    );

    useEffect(() => {
        let cancelled = false;

        async function init() {
            setLoadError(null);
            try {
                const res = await fetch(`/api/files/${fileId}`, { credentials: "include" });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Failed to load this file.");
                if (cancelled) return;

                setFileMeta(data.file);
                await ensureProcessed(data.file);
            } catch (err) {
                if (!cancelled) setLoadError(err instanceof Error ? err.message : "Something went wrong.");
            }
        }

        init();
        return () => {
            cancelled = true;
            if (pollTimer.current) clearTimeout(pollTimer.current);
        };
    }, [fileId, ensureProcessed]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function handleSend() {
        const text = input.trim();
        if (!text || isSending || fileMeta?.processingStatus !== "ready") return;

        const sessionIdToUse = currentSessionId;

        setInput("");
        setIsSending(true);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const userMsg: DisplayMessage = { id: `local-${Date.now()}`, role: "user", content: text, sources: null };
        const assistantId = `local-${Date.now()}-a`;
        setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", sources: null, streaming: true }]);

        try {
            const res = await fetch(`/api/files/${fileId}/chat`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                signal: abortController.signal,
                body: JSON.stringify({ message: text, sessionId: sessionIdToUse }),
            });

            if (!res.ok || !res.body) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "The assistant failed to respond.");
            }

            const isCacheHit = res.headers.get("X-Cache") === "HIT";
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let raw = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                raw += decoder.decode(value, { stream: true });
                const visible = visiblePortion(raw);
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: visible, streaming: true, isCached: isCacheHit } : m)));
            }

            const finalVisible = visiblePortion(raw).trim();
            const sources = extractSources(raw);
            const nextSessionId = res.headers.get("X-Session-Id");
            if (nextSessionId) {
                setCurrentSessionId(nextSessionId);
            }
            setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: finalVisible || "(no response)", sources, streaming: false, isCached: isCacheHit } : m))
            );
            await loadSessions();
        } catch (err) {
            if (err instanceof Error && (err.name === "AbortError" || abortController.signal.aborted)) {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantId
                            ? {
                                  ...m,
                                  content: m.content
                                      ? `${m.content}\n\n*[Response terminated by user]*`
                                      : "*[Response terminated by user]*",
                                  streaming: false,
                              }
                            : m
                    )
                );
                return;
            }
            const message = err instanceof Error ? err.message : "The assistant failed to respond.";
            setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: `⚠️ ${message}`, streaming: false } : m))
            );
        } finally {
            setIsSending(false);
            abortControllerRef.current = null;
        }
    }

    function formatMetadataDate(dateStr: unknown): string {
        if (!dateStr) return "—";
        try {
            const str = String(dateStr).trim();
            const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (ymdMatch) {
                const year = parseInt(ymdMatch[1], 10);
                const month = parseInt(ymdMatch[2], 10) - 1;
                const day = parseInt(ymdMatch[3], 10);
                return new Date(year, month, day, 12, 0, 0).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                });
            }
            return new Date(str).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            });
        } catch {
            return String(dateStr);
        }
    }

    const isIngesting = !fileMeta || fileMeta.processingStatus === "idle" || fileMeta.processingStatus === "processing";
    const isFailed = fileMeta?.processingStatus === "failed";

    const originFolderId = searchParams.get("folderId");

    const handleBack = () => {
        if (originFolderId) {
            router.push(`/dashboard?category=my-files&folderId=${originFolderId}`);
        } else {
            router.push("/dashboard");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#FAFAFA] text-slate-900 dark:bg-slate-950 dark:text-white">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button
                        onClick={handleBack}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        aria-label="Back"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-500/10">
                        <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {fileMeta?.name || "Loading…"}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Metadata Drawer Toggle Button */}
                    <button
                        type="button"
                        onClick={handleMetadataToggle}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            metadataOpen
                                ? "border-[#0052FF]/40 bg-[#0052FF]/10 text-[#0052FF] dark:border-[#4D7CFF]/40 dark:bg-[#4D7CFF]/10 dark:text-[#4D7CFF]"
                                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        }`}
                        aria-label="Toggle metadata panel"
                    >
                        <Database className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Metadata</span>
                    </button>

                    {/* Mode Dropdown Selector */}
                    <div className="relative" ref={modeDropdownRef}>
                        <button
                            type="button"
                            onClick={() => setModeDropdownOpen((prev) => !prev)}
                            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                            {mode === "view" ? (
                                <>
                                    <Eye className="h-4 w-4 text-[#0052FF]" />
                                    <span>View Mode</span>
                                </>
                            ) : (
                                <>
                                    <MessageSquare className="h-4 w-4 text-[#0052FF]" />
                                    <span>Chat Mode</span>
                                </>
                            )}
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        </button>

                        {modeDropdownOpen && (
                            <div className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                                <button
                                    type="button"
                                    onClick={() => handleModeSelect("chat")}
                                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors ${
                                        mode === "chat"
                                            ? "bg-blue-50 text-[#0052FF] dark:bg-blue-500/10 dark:text-[#4D7CFF]"
                                            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                    }`}
                                >
                                    <MessageSquare className="h-4 w-4" />
                                    Chat Mode
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleModeSelect("view")}
                                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors ${
                                        mode === "view"
                                            ? "bg-blue-50 text-[#0052FF] dark:bg-blue-500/10 dark:text-[#4D7CFF]"
                                            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                    }`}
                                >
                                    <Eye className="h-4 w-4" />
                                    View Mode
                                </button>
                            </div>
                        )}
                    </div>

                    {mode === "chat" && (
                        <div className="flex flex-shrink-0 items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 md:hidden">
                            <button
                                onClick={() => setActiveMobileTab("document")}
                                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                                    activeMobileTab === "document"
                                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                }`}
                            >
                                <FileText className="h-3.5 w-3.5" /> PDF
                            </button>
                            <button
                                onClick={() => setActiveMobileTab("chat")}
                                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                                    activeMobileTab === "chat"
                                        ? "bg-[#0052FF] text-white shadow-sm"
                                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                }`}
                            >
                                <MessageSquare className="h-3.5 w-3.5" /> Chat
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Metadata Drawer Panel ── */}
            <div
                className={`flex-shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white transition-all duration-300 ease-in-out dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/80 ${
                    metadataOpen ? "max-h-[340px] opacity-100" : "max-h-0 overflow-hidden opacity-0"
                }`}
            >
                <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: 340 }}>
                    {metadataLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin text-[#0052FF]" />
                            Loading metadata…
                        </div>
                    ) : !firMetadata || Object.keys(firMetadata).length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                            <Database className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No FIR metadata found</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                Metadata is extracted automatically when a PDF is processed. Re-process the document to extract FIR data.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                            {/* FIR Number */}
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    <Hash className="h-3 w-3" /> FIR Number
                                </div>
                                <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                                    {(firMetadata.firNumber as string) || "—"}
                                </p>
                            </div>
                            {/* Date */}
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    <Calendar className="h-3 w-3" /> Date Registered
                                </div>
                                <p className="text-xs text-slate-900 dark:text-white">
                                    {formatMetadataDate(firMetadata.firDate)}
                                </p>
                            </div>
                            {/* District */}
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    <MapPin className="h-3 w-3" /> District
                                </div>
                                <p className="text-xs text-slate-900 dark:text-white">{(firMetadata.district as string) || "—"}</p>
                            </div>
                            {/* Sub-Division */}
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    <MapPin className="h-3 w-3" /> Sub-Division
                                </div>
                                <p className="text-xs text-slate-900 dark:text-white">{(firMetadata.subDivision as string) || "—"}</p>
                            </div>
                            {/* Police Station */}
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    <MapPin className="h-3 w-3" /> Police Station
                                </div>
                                <p className="text-xs text-slate-900 dark:text-white">{(firMetadata.policeStation as string) || "—"}</p>
                            </div>
                            {/* Property Loss */}
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    <IndianRupee className="h-3 w-3" /> Property Loss
                                </div>
                                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                    {firMetadata.propertyLoss !== null && firMetadata.propertyLoss !== undefined
                                        ? `₹ ${new Intl.NumberFormat("en-IN").format(firMetadata.propertyLoss as number)}`
                                        : "Null"}
                                </p>
                            </div>
                            {/* Zero FIR Reference */}
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    <ChevronRight className="h-3 w-3" /> Zero FIR Ref
                                </div>
                                <p className="text-xs text-slate-900 dark:text-white">{(firMetadata.zeroFirReference as string) || "—"}</p>
                            </div>
                            {/* Acts & Sections */}
                            <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    <Scale className="h-3 w-3" /> Acts & Sections
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {Array.isArray(firMetadata.actsAndSections) && (firMetadata.actsAndSections as string[]).length > 0
                                        ? (firMetadata.actsAndSections as string[]).map((act, i) => (
                                            <span key={i} className="rounded-md bg-[#0052FF]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#0052FF] dark:bg-[#4D7CFF]/15 dark:text-[#4D7CFF]">
                                                {act}
                                            </span>
                                          ))
                                        : <span className="text-xs text-slate-400">—</span>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {loadError ? (
                <div className="flex flex-1 items-center justify-center p-8 bg-white dark:bg-slate-900">
                    <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-500/20 dark:bg-red-500/10">
                        <AlertCircle className="mx-auto mb-3 h-6 w-6 text-red-600 dark:text-red-400" />
                        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
                    </div>
                </div>
            ) : mode === "view" ? (
                /* View Mode Layout: Only the PDF is visible full width */
                <div className="flex flex-1 flex-col min-h-0 w-full overflow-hidden">
                    <div
                        ref={viewerRef}
                        className="flex flex-1 h-full w-full flex-col overflow-y-auto bg-slate-100 p-4 dark:bg-slate-900/40"
                    >
                        {fileMeta ? (
                            <PdfViewer
                                url={`/api/files/${fileMeta.id}/serve`}
                                width={viewerWidth}
                                initialPage={parseInt(searchParams.get("page") || "1", 10) || 1}
                            />
                        ) : (
                            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading file…
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* Chat Mode Layout: Dual columns with PDF viewer and AI Chat */
                <div className="flex flex-1 flex-col min-h-0 w-full overflow-hidden md:grid md:grid-cols-2">
                    <div
                        ref={viewerRef}
                        className={`overflow-y-auto bg-slate-100 p-4 dark:bg-slate-900/40 md:border-r md:border-slate-200 md:dark:border-slate-800 ${
                            activeMobileTab === "document" ? "flex flex-1 h-full w-full flex-col" : "hidden md:block"
                        }`}
                    >
                        {fileMeta ? (
                            <PdfViewer
                                url={`/api/files/${fileMeta.id}/serve`}
                                width={viewerWidth}
                                initialPage={parseInt(searchParams.get("page") || "1", 10) || 1}
                            />
                        ) : (
                            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading file…
                            </div>
                        )}
                    </div>

                    <div
                        className={`flex-1 min-h-0 flex-col bg-white dark:bg-slate-900 ${
                            activeMobileTab === "chat" ? "flex h-full w-full" : "hidden md:flex"
                        }`}
                    >
                        {isIngesting ? (
                            <ChatSkeleton />
                        ) : isFailed ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                                <AlertCircle className="h-6 w-6 text-red-500" />
                                <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
                                    {fileMeta?.processingError || "Something went wrong while processing this PDF."}
                                </p>
                                <button
                                    onClick={() => fileMeta && ensureProcessed({ ...fileMeta, processingStatus: "idle" })}
                                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform hover:-translate-y-0.5"
                                >
                                    <RefreshCcw className="h-3.5 w-3.5" /> Try again
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-col gap-3 border-b border-slate-200 p-3 dark:border-slate-800">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCurrentSessionId(null);
                                                    setMessages([]);
                                                }}
                                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                                                aria-label="New chat"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Chat history</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">Switch threads or start fresh</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {sessions.length > 0 && (
                                                <button
                                                    type="button"
                                                    disabled={isClearingAll}
                                                    onClick={handleClearAllSessions}
                                                    className="flex items-center gap-1 rounded-xl border border-red-200 bg-red-50/50 px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-900/30 disabled:opacity-50"
                                                    title="Delete all chat history for this document"
                                                >
                                                    {isClearingAll ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    )}
                                                    <span className="hidden sm:inline">Clear all</span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => loadSessions()}
                                                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                                            >
                                                Refresh
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {sessions.length === 0 ? (
                                            <p className="text-xs text-slate-500 dark:text-slate-400">No prior chats yet.</p>
                                        ) : (
                                            sessions.map((session) => (
                                                <div
                                                    key={session.id}
                                                    className={`group inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium transition ${
                                                        currentSessionId === session.id
                                                            ? "bg-[#0052FF] text-white shadow-sm"
                                                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                                    }`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setCurrentSessionId(session.id);
                                                            void loadHistory(session.id);
                                                        }}
                                                        className="truncate text-left max-w-[130px] sm:max-w-[180px]"
                                                        title={session.title}
                                                    >
                                                        {session.title}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={deletingSessionId === session.id}
                                                        onClick={(e) => handleDeleteSession(e, session.id)}
                                                        className={`flex h-4 w-4 items-center justify-center rounded-full transition ${
                                                            currentSessionId === session.id
                                                                ? "text-white/70 hover:bg-white/20 hover:text-white"
                                                                : "text-slate-400 hover:bg-slate-200 hover:text-red-600 dark:hover:bg-slate-700 dark:hover:text-red-400"
                                                        }`}
                                                        title="Delete this chat thread"
                                                        aria-label={`Delete chat thread: ${session.title}`}
                                                    >
                                                        {deletingSessionId === session.id ? (
                                                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                        ) : (
                                                            <X className="h-3 w-3" />
                                                        )}
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                                    {messages.map((m) => (
                                        <motion.div
                                            key={m.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.22, ease: "easeOut" }}
                                            className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                                        >
                                            <div
                                                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${m.role === "user"
                                                    ? "bg-[#0052FF] text-white"
                                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                                    }`}
                                            >
                                                {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                                            </div>
                                            {(() => {
                                                const parsed = m.role !== "user"
                                                    ? parseThinkingAndContent(m.content, m.streaming)
                                                    : { thought: "", answer: m.content, isThinking: false };
                                                return (
                                                    <div
                                                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user"
                                                            ? "bg-[#0052FF] text-white"
                                                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                                                            }`}
                                                    >
                                                        {m.role !== "user" && m.isCached && (
                                                            <div className="mb-2 flex items-center gap-1.5">
                                                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                                    <Zap className="h-2.5 w-2.5 fill-emerald-500 text-emerald-500 animate-pulse" />
                                                                    <span>Semantic Cache Hit &bull; Instant</span>
                                                                </span>
                                                            </div>
                                                        )}
                                                        {m.role !== "user" && (
                                                            <ThinkingBlock
                                                                thought={parsed.thought}
                                                                isThinking={parsed.isThinking}
                                                                isStreaming={m.streaming}
                                                            />
                                                        )}
                                                        <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                                                            {parsed.answer ? (
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm]}
                                                                    components={{
                                                                        table: ({ children }) => (
                                                                            <div className="my-3 overflow-x-auto rounded-lg border border-slate-300 dark:border-slate-700">
                                                                                <table className="w-full border-collapse text-left text-xs sm:text-sm">
                                                                                    {children}
                                                                                </table>
                                                                            </div>
                                                                        ),
                                                                        thead: ({ children }) => (
                                                                            <thead className="bg-slate-200/70 font-semibold text-slate-900 dark:bg-slate-700/60 dark:text-slate-100">
                                                                                {children}
                                                                            </thead>
                                                                        ),
                                                                        tbody: ({ children }) => (
                                                                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white/50 dark:bg-slate-900/50">
                                                                                {children}
                                                                            </tbody>
                                                                        ),
                                                                        th: ({ children }) => (
                                                                            <th className="border-b border-slate-300 dark:border-slate-700 px-3 py-2 font-semibold">
                                                                                {children}
                                                                            </th>
                                                                        ),
                                                                        td: ({ children }) => (
                                                                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 last:border-r-0">
                                                                                {children}
                                                                            </td>
                                                                        ),
                                                                    }}
                                                                >
                                                                    {parsed.answer}
                                                                </ReactMarkdown>
                                                            ) : m.streaming && !parsed.isThinking ? (
                                                                "…"
                                                            ) : null}
                                                        </div>
                                                {m.sources && m.sources.length > 0 && (
                                                    <p className="mt-1.5 text-xs opacity-70">
                                                        Source page{m.sources.length > 1 ? "s" : ""}: {m.sources.join(", ")}
                                                    </p>
                                                )}
                                                    </div>
                                                );
                                            })()}
                                        </motion.div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>

                                <div className="border-t border-slate-200 p-3 dark:border-slate-800">
                                    <form
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            handleSend();
                                        }}
                                        className="flex items-center gap-2"
                                    >
                                        <input
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            placeholder="Ask a question about this PDF…"
                                            disabled={isSending}
                                            className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition-all focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                        />
                                        {isSending ? (
                                            <button
                                                type="button"
                                                onClick={handleStopGeneration}
                                                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-md shadow-rose-600/30 transition-all duration-150 hover:bg-rose-700 hover:scale-105 active:scale-95"
                                                title="Stop generation"
                                                aria-label="Stop generation"
                                            >
                                                <Square className="h-4 w-4 fill-current" />
                                            </button>
                                        ) : (
                                            <button
                                                type="submit"
                                                disabled={!input.trim()}
                                                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                                                aria-label="Send"
                                                title="Send"
                                            >
                                                <Send className="h-4 w-4" />
                                            </button>
                                        )}
                                    </form>
                                    <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                                        Answers are restricted to the content of this PDF.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PdfChatPage() {
    return (
        <React.Suspense
            fallback={
                <div className="flex h-screen w-full items-center justify-center bg-[#FAFAFA] text-slate-500 dark:bg-slate-950">
                    <Loader2 className="h-6 w-6 animate-spin text-[#0052FF]" />
                </div>
            }
        >
            <PdfChatContent />
        </React.Suspense>
    );
}