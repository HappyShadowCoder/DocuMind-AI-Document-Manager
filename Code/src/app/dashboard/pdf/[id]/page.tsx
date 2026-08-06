// app/dashboard/pdf/[id]/page.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
    ArrowLeft,
    Send,
    Loader2,
    FileText,
    Bot,
    User,
    AlertCircle,
    RefreshCcw,
    MessageSquare,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

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
}

interface FileMeta {
    id: string;
    name: string;
    path: string;
    processingStatus: ProcessingStatus;
    processingError: string | null;
    summary: string | null;
    chunkCount?: number;
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

export default function PdfChatPage() {
    const params = useParams<{ id: string }>();
    const fileId = params.id;
    const router = useRouter();

    const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [activeMobileTab, setActiveMobileTab] = useState<"document" | "chat">("chat");
    const [viewerWidth, setViewerWidth] = useState(760);

    const viewerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        function updateWidth() {
            if (viewerRef.current) setViewerWidth(Math.max(280, viewerRef.current.clientWidth - 32));
        }
        updateWidth();
        window.addEventListener("resize", updateWidth);
        return () => window.removeEventListener("resize", updateWidth);
    }, [activeMobileTab]);

    const loadHistory = useCallback(async () => {
        const res = await fetch(`/api/files/${fileId}/chat`, { credentials: "include" });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Failed to load chat history.");
        }
        const data = (await res.json()) as { fileName: string; messages: ChatMessageRow[] };
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
    }, [fileId]);

    const ensureProcessed = useCallback(
        async (meta: FileMeta) => {
            const needsProcessing =
                meta.processingStatus === "idle" ||
                meta.processingStatus === "failed" ||
                (meta.processingStatus === "ready" && (meta.chunkCount ?? 0) === 0);

            if (meta.processingStatus === "ready" && !needsProcessing) {
                await loadHistory();
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
                await loadHistory();
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
        [fileId, loadHistory]
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

        setInput("");
        setIsSending(true);

        const userMsg: DisplayMessage = { id: `local-${Date.now()}`, role: "user", content: text, sources: null };
        const assistantId = `local-${Date.now()}-a`;
        setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", sources: null, streaming: true }]);

        try {
            const res = await fetch(`/api/files/${fileId}/chat`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text }),
            });

            if (!res.ok || !res.body) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "The assistant failed to respond.");
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let raw = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                raw += decoder.decode(value, { stream: true });
                const visible = visiblePortion(raw);
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: visible, streaming: true } : m)));
            }

            const finalVisible = visiblePortion(raw).trim();
            const sources = extractSources(raw);
            setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: finalVisible || "(no response)", sources, streaming: false } : m))
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : "The assistant failed to respond.";
            setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: `⚠️ ${message}`, streaming: false } : m))
            );
        } finally {
            setIsSending(false);
        }
    }

    const isIngesting = !fileMeta || fileMeta.processingStatus === "idle" || fileMeta.processingStatus === "processing";
    const isFailed = fileMeta?.processingStatus === "failed";

    return (
        /* Using fixed inset-0 z-50 covers any surrounding parent layout including Navbars & Footers */
        <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#FAFAFA] text-slate-900 dark:bg-slate-950 dark:text-white">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button
                        onClick={() => router.back()}
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

                {/* Mobile view selector (Document vs Chat) */}
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
            </div>

            {loadError ? (
                <div className="flex flex-1 items-center justify-center p-8 bg-white dark:bg-slate-900">
                    <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-500/20 dark:bg-red-500/10">
                        <AlertCircle className="mx-auto mb-3 h-6 w-6 text-red-600 dark:text-red-400" />
                        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 flex-col min-h-0 w-full overflow-hidden md:grid md:grid-cols-2">
                    {/* Left pane: PDF viewer */}
                    <div
                        ref={viewerRef}
                        className={`overflow-y-auto bg-slate-100 p-4 dark:bg-slate-900/40 md:border-r md:border-slate-200 md:dark:border-slate-800 ${
                            activeMobileTab === "document" ? "flex flex-1 h-full w-full flex-col" : "hidden md:block"
                        }`}
                    >
                        {fileMeta?.path ? (
                            <PdfViewer url={fileMeta.path} width={viewerWidth} />
                        ) : (
                            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading file…
                            </div>
                        )}
                    </div>

                    {/* Right pane: chat */}
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
                                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                                    {messages.map((m) => (
                                        <div key={m.id} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                                            <div
                                                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${m.role === "user"
                                                    ? "bg-[#0052FF] text-white"
                                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                                    }`}
                                            >
                                                {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                                            </div>
                                            <div
                                                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user"
                                                    ? "bg-[#0052FF] text-white"
                                                    : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                                                    }`}
                                            >
                                                <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
    {m.content ? (
        <ReactMarkdown>{m.content}</ReactMarkdown>
    ) : m.streaming ? (
        "…"
    ) : null}
</div>
                                                {m.sources && m.sources.length > 0 && (
                                                    <p className="mt-1.5 text-xs opacity-70">
                                                        Source page{m.sources.length > 1 ? "s" : ""}: {m.sources.join(", ")}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
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
                                        <button
                                            type="submit"
                                            disabled={isSending || !input.trim()}
                                            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                                            aria-label="Send"
                                        >
                                            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        </button>
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