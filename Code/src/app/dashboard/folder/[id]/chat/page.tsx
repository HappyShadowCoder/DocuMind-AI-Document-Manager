"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Send,
  FileText,
  Bot,
  User,
  AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const PdfViewer = dynamic(() => import("@/app/dashboard/pdf/[id]/PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8 text-gray-500">
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
  const [viewerWidth, setViewerWidth] = useState(740);
  const [autoIndexAttempted, setAutoIndexAttempted] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      if (viewerRef.current) setViewerWidth(Math.max(240, viewerRef.current.clientWidth - 32));
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

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
  }, [messages]);

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
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to communicate with the AI.");
      }

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
              }
            : message
        )
      );
    } catch (error) {
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

  const viewerUrl = selectedFile?.path || "";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {folder ? `AI Chat: ${folder.name}` : "Folder AI Chat"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Ask questions against all the PDF documents in this folder.
            </p>
          </div>
          <div className="rounded-3xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Documents indexed</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              {pdfFiles.length}
            </p>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            <p className="font-semibold">Unable to load folder chat.</p>
            <p>{loadError}</p>
          </div>
        ) : isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-slate-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading folder content and document index…</p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(420px,1.2fr)_1.2fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Document viewer</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Select a PDF and preview it here while the AI uses all documents.
                  </p>
                </div>
                <div className="min-w-[220px]">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Selected PDF
                  </label>
                  <select
                    value={selectedFile?.id || ""}
                    onChange={handleSelectFile}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {pdfFiles.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div ref={viewerRef} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                {selectedFile ? (
                  <PdfViewer url={selectedFile.path} width={viewerWidth} />
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                    No PDF document available to preview.
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <span>{folder?.fileCount ?? 0} total file(s) in folder</span>
                {hasReadyFiles ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200">
                    Ready documents included
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-800 dark:text-amber-200">
                    No ready documents indexed yet
                  </span>
                )}
              </div>
            </section>

            <section className="flex min-h-[680px] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-xl transition-shadow duration-200 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Chat with your documents</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Ask questions using the combined content from all PDFs in this folder.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                  <Bot className="h-4 w-4" />
                  RAG across documents
                </div>
              </div>

              <div className="flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-inner dark:border-slate-800 dark:bg-slate-900">
                <div className="h-full min-h-[220px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100 dark:scrollbar-thumb-slate-700 dark:scrollbar-track-slate-800 space-y-4">
                  {messages.map((message) => (
                    <div key={message.id} className={`rounded-[28px] border px-5 py-4 shadow-sm ${message.role === "user" ? "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white" : "border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"}`}>
                      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {message.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                        </span>
                        <span>{message.role === "user" ? "You" : "Assistant"}</span>
                      </div>
                      <div className="prose prose-sm max-w-none break-words text-slate-900 dark:prose-invert dark:text-slate-100">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ node, ...props }) => (
                              <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                                <table className="min-w-full border-collapse text-left text-sm" {...props} />
                              </div>
                            ),
                            thead: ({ node, ...props }) => (
                              <thead className="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100" {...props} />
                            ),
                            th: ({ node, ...props }) => (
                              <th className="border border-slate-200 px-3 py-2 font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100" {...props} />
                            ),
                            tr: ({ node, ...props }) => (
                              <tr className="even:bg-slate-50 odd:bg-white dark:even:bg-slate-900 dark:odd:bg-slate-950" {...props} />
                            ),
                            td: ({ node, ...props }) => (
                              <td className="border border-slate-200 px-3 py-2 text-slate-900 dark:border-slate-700 dark:text-slate-100" {...props} />
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-3 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                          Sources: {message.sources.join(", ")}
                        </div>
                      )}
                      {message.streaming && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Streaming response…
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <label htmlFor="folder-chat-input" className="sr-only">Ask a question</label>
                <textarea
                  id="folder-chat-input"
                  rows={3}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question about these documents..."
                  className="w-full resize-none rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    The AI uses the combined context of all indexed PDFs in this folder.
                  </p>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isSending || input.trim().length === 0 || !hasReadyFiles}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0052FF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0147d1] disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send
                  </button>
                </div>
                {!hasReadyFiles && (
                  <div className="mt-3 space-y-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    {isIndexing && indexingProgress ? (
                      <>
                        <p>
                          Automatically indexing PDFs — processing <span className="font-semibold">{indexingProgress.fileName}</span> ({indexingProgress.current}/{indexingProgress.total})
                        </p>
                        <div className="h-2 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-700">
                          <div
                            className="h-full rounded-full bg-amber-600 transition-all duration-300"
                            style={{
                              width: `${Math.round((indexingProgress.current / indexingProgress.total) * 100)}%`,
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <p>
                        Automatically indexing PDFs now. This may take a moment if the documents need OCR.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
