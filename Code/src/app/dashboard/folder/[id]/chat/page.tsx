// app/dashboard/folder/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Send,
  Square,
  User,
  Bot,
  Folder,
  FileText,
  AlertCircle,
  MessageSquare,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingBlock, parseThinkingAndContent } from "@/components/chat/thinking-block";

const PdfViewer = dynamic(() => import("@/app/dashboard/pdf/[id]/PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8 text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading PDF viewer...
    </div>
  ),
});

type FileRecord = {
  id: string;
  name: string;
  type: string;
  path: string;
  sizeBytes: number;
  updatedAt: string;
  processingStatus: string | null;
  processingError: string | null;
  chunkCount?: number;
};

type FolderDetails = {
  id: string;
  name: string;
  shared: boolean;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: string[] | null;
  streaming?: boolean;
  isCached?: boolean;
}

function visiblePortion(raw: string): string {
  const idx = raw.lastIndexOf("[[SOURCES:");
  if (idx === -1) return raw;
  const closingIdx = raw.indexOf("]]", idx);
  if (closingIdx === -1) return raw.slice(0, idx);
  return (raw.slice(0, idx) + raw.slice(closingIdx + 2)).trimEnd();
}

function extractSources(raw: string): string[] | null {
  const match = raw.match(/\[\[SOURCES:([^\]]+)\]\]/);
  if (!match) return null;
  return Array.from(new Set(match[1].split(",").map((item) => item.trim()))).sort();
}

export default function FolderChatPage() {
  const params = useParams<{ id: string }>();
  const folderId = params.id;
  const router = useRouter();

  const [folder, setFolder] = useState<FolderDetails | null>(null);
  const [pdfFiles, setPdfFiles] = useState<FileRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // UI State
  const [activeMobileTab, setActiveMobileTab] = useState<"document" | "chat">("chat");
  const [viewerWidth, setViewerWidth] = useState(760);
  const [autoIndexAttempted, setAutoIndexAttempted] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const selectedFile = useMemo(
    () => pdfFiles.find((file) => file.id === selectedFileId) ?? pdfFiles[0] ?? null,
    [pdfFiles, selectedFileId]
  );

  const hasReadyFiles = useMemo(
    () => pdfFiles.some((file) => file.processingStatus === "ready"),
    [pdfFiles]
  );

  useEffect(() => {
    function updateWidth() {
      if (viewerRef.current) setViewerWidth(Math.max(280, viewerRef.current.clientWidth - 32));
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [activeMobileTab]);

  useEffect(() => {
    let canceled = false;

    async function loadFolder() {
      if (!folderId) {
        setLoadError("Missing folder identifier.");
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/folders/${folderId}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to load folder details.");
        }
        if (canceled) return;

        setFolder(data.folder);
        setPdfFiles(data.files || []);
        setSelectedFileId(data.files?.[0]?.id ?? null);
      } catch (error) {
        if (!canceled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load folder.");
        }
      } finally {
        if (!canceled) setIsLoading(false);
      }
    }

    loadFolder();
    return () => {
      canceled = true;
    };
  }, [folderId]);

  useEffect(() => {
    const hasUnprocessedFiles = pdfFiles.some(
      (file) => file.processingStatus !== "ready" || (file.chunkCount ?? 0) === 0
    );

    if (
      !isLoading &&
      folderId &&
      !autoIndexAttempted &&
      pdfFiles.length > 0 &&
      hasUnprocessedFiles
    ) {
      setAutoIndexAttempted(true);
      autoIndexUnprocessedFiles();
    }
  }, [isLoading, folderId, pdfFiles, autoIndexAttempted]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending || !folderId || !hasReadyFiles) return;

    setInput("");
    setIsSending(true);

    const userMessage: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      sources: null,
    };
    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "", sources: null, streaming: true },
    ]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const body = {
        message: trimmed,
        recentMessages: messages
          .slice(-10)
          .map((message) => ({ role: message.role, content: message.content })),
      };

      const res = await fetch(`/api/folders/${folderId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: abortController.signal,
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to communicate with the AI.");
      }

      const cacheHeader = res.headers.get("X-Cache") || res.headers.get("x-cache");
      const isCacheHit = cacheHeader?.toUpperCase() === "HIT";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let incremental = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        incremental += decoder.decode(value, { stream: true });

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: visiblePortion(incremental),
                  sources: extractSources(incremental),
                  streaming: true,
                  isCached: isCacheHit,
                }
              : message
          )
        );
      }

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: visiblePortion(incremental),
                sources: extractSources(incremental),
                streaming: false,
                isCached: isCacheHit,
              }
            : message
        )
      );
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || abortController.signal.aborted)) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: message.content
                    ? `${message.content}\n\n*[Response terminated by user]*`
                    : "*[Response terminated by user]*",
                  streaming: false,
                }
              : message
          )
        );
        return;
      }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: "Failed to generate a response. Please try again.",
                streaming: false,
              }
            : message
        )
      );
      console.error(error);
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
    }
  }

  async function autoIndexUnprocessedFiles() {
    if (!folderId || isIndexing || pdfFiles.length === 0) return;

    const unprocessedFiles = pdfFiles.filter(
      (file) => file.processingStatus !== "ready" || (file.chunkCount ?? 0) === 0
    );

    if (unprocessedFiles.length === 0) return;

    setIsIndexing(true);
    setIndexingProgress({ current: 0, total: unprocessedFiles.length, fileName: unprocessedFiles[0].name });
    setLoadError(null);

    try {
      for (let i = 0; i < unprocessedFiles.length; i += 1) {
        const file = unprocessedFiles[i];
        setIndexingProgress({ current: i + 1, total: unprocessedFiles.length, fileName: file.name });

        const res = await fetch(`/api/files/${file.id}`, {
          method: "POST",
          credentials: "include",
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Failed to process ${file.name}`);
        }

        setPdfFiles((prev) =>
          prev.map((item) =>
            item.id === file.id ? { ...item, ...data.file } : item
          )
        );
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to index PDFs.");
    } finally {
      setIsIndexing(false);
      setIndexingProgress(null);
    }
  }

  function handleSelectFile(event: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedFileId(event.target.value);
  }

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#FAFAFA] text-slate-900 dark:bg-slate-950 dark:text-white">
      {/* Top Header Navigation */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 overflow-hidden">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
            <Folder className="h-4 w-4 text-[#0052FF] dark:text-[#4D7CFF]" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {folder ? folder.name : "Loading folder…"}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {pdfFiles.length} Document{pdfFiles.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Mobile view selector */}
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
            <p className="font-semibold text-red-800 dark:text-red-300">Unable to load folder chat</p>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300/80">{loadError}</p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center p-8 bg-white dark:bg-slate-900">
          <div className="flex flex-col items-center text-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-slate-400 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading folder content and document index…</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0 w-full overflow-hidden md:grid md:grid-cols-2">
          
          {/* Left Pane: Document Viewer */}
          <div
            ref={viewerRef}
            className={`overflow-y-auto bg-slate-100 p-4 dark:bg-slate-900/40 md:border-r md:border-slate-200 md:dark:border-slate-800 ${
              activeMobileTab === "document" ? "flex flex-1 h-full w-full flex-col" : "hidden md:block"
            }`}
          >
            {/* Viewer Header / Selector */}
            <div className="mb-4">
              <select
                value={selectedFile?.id || ""}
                onChange={handleSelectFile}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {pdfFiles.length === 0 && <option value="">No PDFs in this folder</option>}
                {pdfFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Viewer Body */}
            {selectedFile ? (
              <PdfViewer url={selectedFile.path} width={viewerWidth} />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                No PDF document available to preview.
              </div>
            )}
          </div>

          {/* Right Pane: Chat */}
          <div
            className={`flex-1 min-h-0 flex-col bg-white dark:bg-slate-900 ${
              activeMobileTab === "chat" ? "flex h-full w-full" : "hidden md:flex"
            }`}
          >
            {/* Chat Status Header */}
            <div className="border-b border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between px-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Bot className="inline mb-0.5 mr-1 h-3.5 w-3.5" /> AI trained on {folder?.fileCount ?? 0} files
                </p>
                {!hasReadyFiles && (
                  <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Indexing
                  </span>
                )}
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 ? (
                 <div className="flex h-full flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400">
                   <Bot className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
                   <p className="text-sm font-medium">Start a conversation!</p>
                   <p className="mt-1 max-w-xs text-xs">Your AI is ready to answer questions based on all the documents in this folder.</p>
                 </div>
              ) : (
                messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                        m.role === "user"
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
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            m.role === "user"
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
                              Source file{m.sources.length > 1 ? "s" : ""}: {m.sources.join(", ")}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </motion.div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              {/* Indexing Progress Indicator */}
              {!hasReadyFiles && isIndexing && indexingProgress && (
                <div className="mb-3 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950 dark:text-amber-300">
                  <div className="flex justify-between">
                    <p>Indexing: <span className="font-semibold">{indexingProgress.fileName}</span></p>
                    <p>({indexingProgress.current}/{indexingProgress.total})</p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-800">
                    <div
                      className="h-full rounded-full bg-amber-600 transition-all duration-300 dark:bg-amber-500"
                      style={{
                        width: `${Math.round((indexingProgress.current / indexingProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

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
                  placeholder="Ask a question about these documents…"
                  disabled={isSending || !hasReadyFiles}
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
                    disabled={!input.trim() || !hasReadyFiles}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                    aria-label="Send"
                    title="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </form>
              <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                Answers are restricted to the content of the PDFs in this folder.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}