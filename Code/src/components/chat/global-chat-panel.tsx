"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Send,
  Square,
  Plus,
  Trash2,
  FileText,
  Shield,
  UserCheck,
  Bot,
  User,
  Loader2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  Pencil,
  Check,
  X,
  BarChart3,
  AtSign,
  Search,
  Cpu,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingBlock, parseThinkingAndContent } from "@/components/chat/thinking-block";
import { PoliceStatsCard } from "@/components/chat/police-stats-card";
import AiSettingsModal from "@/components/settings/ai-settings-modal";

interface CurrentUser {
  id: string;
  email: string;
  role: "admin" | "user";
  fullName?: string | null;
}

interface ChatSessionItem {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  lastMessage?: string;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  streaming?: boolean;
  isCached?: boolean;
}

export interface AccessibleDocument {
  id: string;
  name: string;
  firNumber: string | null;
  district: string | null;
  policeStation: string | null;
  firDate: string | null;
  propertyLoss: string | null;
  accessLevel: string;
  shared: boolean;
}

interface GlobalChatPanelProps {
  user: CurrentUser | null;
}

const SAMPLE_PROMPTS = [
  "Find all FIRs related to crimes against women across all documents",
  "Show cases registered in specific districts or police stations",
  "List FIRs involving major property loss or theft",
  "Are there any Zero FIR references recorded in the documents?",
];

function visiblePortion(raw: string): string {
  const idx = raw.lastIndexOf("[[SOURCES:");
  if (idx === -1) return raw;
  const closingIdx = raw.indexOf("]]", idx);
  if (closingIdx === -1) return raw.slice(0, idx);
  return (raw.slice(0, idx) + raw.slice(closingIdx + 2)).trimEnd();
}

interface GroupedSource {
  fileId: string;
  fileName: string;
  pages: number[];
}

function groupSources(sources: string[]): GroupedSource[] {
  const map = new Map<string, { fileName: string; pages: Set<number> }>();

  for (const src of sources) {
    if (!src) continue;
    const parts = src.split("|");
    const fileId = parts[0]?.trim();
    if (!fileId) continue;
    const fileName = parts[1]?.trim() || "Document.pdf";
    const pageNum = parseInt(parts[2]?.trim() || "1", 10) || 1;

    if (!map.has(fileId)) {
      map.set(fileId, { fileName, pages: new Set() });
    }
    map.get(fileId)!.pages.add(pageNum);
  }

  return Array.from(map.entries()).map(([fileId, data]) => ({
    fileId,
    fileName: data.fileName,
    pages: Array.from(data.pages).sort((a, b) => a - b),
  }));
}

const markdownComponents = {
  table: ({ children }: any) => (
    <div className="my-3.5 w-full overflow-x-auto rounded-xl border border-slate-200/90 bg-white/70 shadow-xs dark:border-slate-800 dark:bg-slate-900/40">
      <table className="w-full border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="border-b border-slate-200 bg-slate-100/90 font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-200">
      {children}
    </thead>
  ),
  tbody: ({ children }: any) => (
    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
      {children}
    </tbody>
  ),
  tr: ({ children }: any) => (
    <tr className="transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/50">
      {children}
    </tr>
  ),
  th: ({ children }: any) => (
    <th className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="px-3.5 py-2 text-slate-700 dark:text-slate-300">
      {children}
    </td>
  ),
  p: ({ children }: any) => (
    <p className="my-2 leading-relaxed last:mb-0 first:mt-0 text-slate-800 dark:text-slate-100">
      {children}
    </p>
  ),
  ul: ({ children }: any) => (
    <ul className="my-2 ml-4 list-disc space-y-1 text-slate-800 dark:text-slate-200">
      {children}
    </ul>
  ),
  ol: ({ children }: any) => (
    <ol className="my-2 ml-4 list-decimal space-y-1 text-slate-800 dark:text-slate-200">
      {children}
    </ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-relaxed">
      {children}
    </li>
  ),
  h1: ({ children }: any) => (
    <h1 className="mt-4 mb-2 text-base font-bold font-display text-slate-900 dark:text-white">
      {children}
    </h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="mt-3 mb-1.5 text-sm font-bold font-display text-slate-900 dark:text-white">
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="mt-2.5 mb-1 text-xs font-bold font-display text-slate-900 dark:text-white">
      {children}
    </h3>
  ),
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#0052FF] dark:bg-slate-800 dark:text-[#4D7CFF]">
        {children}
      </code>
    ) : (
      <code className="block overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-xs text-slate-100 dark:bg-slate-950">
        {children}
      </code>
    ),
};

export default function GlobalChatPanel({ user }: GlobalChatPanelProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState<string>("");

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<string>("ollama");

  const [accessibleDocs, setAccessibleDocs] = useState<AccessibleDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inFlightSessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // Scroll only the messages container, preventing the browser window from scrolling
  const scrollToBottom = (smooth = true) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [messages]);

  // Load chat sessions on mount
  useEffect(() => {
    async function fetchSessions() {
      setLoadingSessions(true);
      try {
        const res = await fetch("/api/chat/global/sessions");
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
          if (data.sessions?.length > 0) {
            setActiveSessionId(data.sessions[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load global chat sessions:", err);
      } finally {
        setLoadingSessions(false);
      }
    }

    async function fetchAccessibleDocs() {
      setLoadingDocs(true);
      try {
        const res = await fetch("/api/chat/documents");
        if (res.ok) {
          const data = await res.json();
          setAccessibleDocs(data.documents || []);
        }
      } catch (err) {
        console.error("Failed to load accessible documents for chat:", err);
      } finally {
        setLoadingDocs(false);
      }
    }

    async function loadCurrentAiProvider() {
      try {
        const res = await fetch("/api/settings/ai");
        if (res.ok) {
          const data = await res.json();
          if (data.provider) setAiProvider(data.provider);
        }
      } catch {}
    }

    fetchSessions();
    fetchAccessibleDocs();
    loadCurrentAiProvider();
  }, []);

  // Load messages whenever activeSessionId changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }

    // Skip reload if this session update was from an active in-flight stream
    if (inFlightSessionIdRef.current === activeSessionId) {
      return;
    }

    async function loadSessionMessages() {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/chat/global?sessionId=${activeSessionId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(
            (data.messages || []).map((m: { id: string; role: string; content: string; sources?: string[] }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              sources: m.sources || [],
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load session messages:", err);
      } finally {
        setLoadingMessages(false);
      }
    }

    loadSessionMessages();
  }, [activeSessionId]);

  // Create a new session
  const handleCreateNewChat = async () => {
    try {
      const res = await fetch("/api/chat/global/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (res.ok) {
        const data = await res.json();
        const newSession = data.session;
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to create new chat session:", err);
    }
  };

  // Delete a session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/chat/global/sessions?sessionId=${sessionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId);
          if (remaining.length > 0) {
            setActiveSessionId(remaining[0].id);
          } else {
            setActiveSessionId(null);
            setMessages([]);
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  // Start renaming a session
  const startEditingSession = (e: React.MouseEvent, session: ChatSessionItem) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitleInput(session.title || "New Chat");
  };

  // Save renamed session title
  const handleSaveSessionTitle = async (sessionId: string) => {
    const trimmed = editTitleInput.trim();
    if (!trimmed) {
      setEditingSessionId(null);
      return;
    }

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s))
    );
    setEditingSessionId(null);

    try {
      await fetch("/api/chat/global/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, title: trimmed }),
      });
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  };

  const handleCancelEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSessionId(null);
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || isSending) return;

    setInput("");
    setSlashDismissed(false);
    setSlashSelectedIndex(0);
    setIsSending(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    // Add user message and empty streaming assistant bubble
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: query },
      { id: assistantMessageId, role: "assistant", content: "", streaming: true },
    ]);

    try {
      const res = await fetch("/api/chat/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          message: query,
          sessionId: activeSessionId || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to get AI response");
      }

      // Check if session ID and dynamic Title was returned
      const returnedSessionId = res.headers.get("X-Session-Id");
      const returnedSessionTitle = res.headers.get("X-Session-Title");
      const cacheHeader = res.headers.get("X-Cache") || res.headers.get("x-cache");
      const isCacheHit = cacheHeader?.toUpperCase() === "HIT";
      const targetSessionId = returnedSessionId || activeSessionId;

      if (returnedSessionId) {
        inFlightSessionIdRef.current = returnedSessionId;
        if (!activeSessionId || activeSessionId !== returnedSessionId) {
          setActiveSessionId(returnedSessionId);
        }
      }

      if (returnedSessionTitle && targetSessionId) {
        const decodedTitle = decodeURIComponent(returnedSessionTitle);
        setSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId ? { ...s, title: decodedTitle } : s
          )
        );
      }

      if (!res.body) throw new Error("No response stream available");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: accumulated, streaming: true }
              : msg
          )
        );
      }

      // Finalize assistant message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, streaming: false, isCached: isCacheHit }
            : msg
        )
      );

      // Re-fetch message history to get saved sources and title updates
      const targetId = returnedSessionId || activeSessionId;
      if (targetId) {
        const historyRes = await fetch(`/api/chat/global?sessionId=${targetId}`);
        if (historyRes.ok) {
          const data = await historyRes.json();
          setMessages(
            (data.messages || []).map((m: { id: string; role: string; content: string; sources?: string[] }, idx: number, arr: unknown[]) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              sources: m.sources || [],
              isCached: idx === arr.length - 1 && isCacheHit ? true : false,
            }))
          );
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "AbortError" || abortController.signal.aborted)) {
        // User terminated the message
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: msg.content
                    ? `${msg.content}\n\n*[Response terminated by user]*`
                    : "*[Response terminated by user]*",
                  streaming: false,
                }
              : msg
          )
        );
        return;
      }
      console.error("Chat error:", err);
      const errorMessage = err instanceof Error ? err.message : "An error occurred while streaming response.";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: `⚠️ ${errorMessage}`,
                streaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
      inFlightSessionIdRef.current = null;
    }
  };

  const customMarkdownComponents = useMemo(
    () => ({
      ...markdownComponents,
      code: ({ inline, className, children, ...props }: any) => {
        const isPoliceStats =
          !inline && (className === "language-police-stats" || className?.includes("police-stats"));
        if (isPoliceStats) {
          return (
            <PoliceStatsCard
              rawJson={String(children)}
              onPromptClick={(prompt) => handleSendMessage(prompt)}
            />
          );
        }
        return inline ? (
          <code
            className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#0052FF] dark:bg-slate-800 dark:text-[#4D7CFF]"
            {...props}
          >
            {children}
          </code>
        ) : (
          <code
            className="block overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-xs text-slate-100 dark:bg-slate-950"
            {...props}
          >
            {children}
          </code>
        );
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSessionId, isSending]
  );

  const slashCommands = [
    {
      id: "stats" as const,
      command: "/stats",
      title: "Police Intelligence & Crime Statistics",
      description: "FIR volume, station breakdowns, crime acts, property loss & visual graphs",
      badge: "CRB Analytics",
      icon: Shield,
    },
    {
      id: "doc" as const,
      command: "/doc",
      title: "Tag a Document",
      description: "Search & tag a document from your permitted library to ask specific questions about it",
      badge: "Targeted Query",
      icon: FileText,
    },
  ];

  const trimmedInput = input.trimStart();
  const isSlashActive = (trimmedInput.startsWith("/") || trimmedInput.startsWith("@")) && !slashDismissed;
  const isDocMode = trimmedInput.startsWith("/doc") || trimmedInput.startsWith("@");

  const docSearchQuery = trimmedInput.startsWith("/doc")
    ? trimmedInput.slice(4).trim().toLowerCase()
    : trimmedInput.startsWith("@")
    ? trimmedInput.slice(1).trim().toLowerCase()
    : "";

  const filteredDocs = accessibleDocs.filter((d) => {
    if (!docSearchQuery) return true;
    return (
      d.name.toLowerCase().includes(docSearchQuery) ||
      (d.firNumber && d.firNumber.toLowerCase().includes(docSearchQuery)) ||
      (d.policeStation && d.policeStation.toLowerCase().includes(docSearchQuery)) ||
      (d.district && d.district.toLowerCase().includes(docSearchQuery))
    );
  });

  const commandSearchQuery = trimmedInput.startsWith("/")
    ? trimmedInput.slice(1).trim().toLowerCase()
    : "";

  const filteredCommands = slashCommands.filter((cmd) => {
    if (!commandSearchQuery) return true;
    return (
      cmd.command.slice(1).toLowerCase().includes(commandSearchQuery) ||
      cmd.title.toLowerCase().includes(commandSearchQuery)
    );
  });

  const handleSelectCommand = (cmdId: "stats" | "doc") => {
    if (cmdId === "stats") {
      setSlashDismissed(true);
      handleSendMessage("/stats");
    } else if (cmdId === "doc") {
      setInput("/doc ");
      setSlashSelectedIndex(0);
      setSlashDismissed(false);
      textareaRef.current?.focus();
    }
  };

  const handleSelectDoc = (doc: AccessibleDocument) => {
    setInput(`@${doc.name} `);
    setSlashDismissed(true);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSlashActive) {
      const activeListLength = isDocMode ? filteredDocs.length : filteredCommands.length;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (activeListLength > 0) {
          setSlashSelectedIndex((prev) => (prev + 1) % activeListLength);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (activeListLength > 0) {
          setSlashSelectedIndex((prev) => (prev - 1 + activeListLength) % activeListLength);
        }
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (isDocMode) {
          if (filteredDocs.length > 0 && slashSelectedIndex < filteredDocs.length) {
            e.preventDefault();
            handleSelectDoc(filteredDocs[slashSelectedIndex]);
            return;
          }
        } else {
          if (filteredCommands.length > 0 && slashSelectedIndex < filteredCommands.length) {
            e.preventDefault();
            handleSelectCommand(filteredCommands[slashSelectedIndex].id);
            return;
          }
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[580px] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900/90">
      {/* 1. SESSIONS SIDEBAR */}
      <aside className="flex w-72 flex-shrink-0 flex-col border-r border-slate-200/80 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="p-4">
          <button
            onClick={handleCreateNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-4 py-3 text-xs font-semibold text-white shadow-md shadow-[#0052FF]/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#0052FF]/30 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
          {loadingSessions ? (
            <div className="flex items-center justify-center p-8 text-xs text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#0052FF]" />
              Loading chats…
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No previous chats found. Start a new investigation!
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isEditing = editingSessionId === session.id;

              return (
                <div
                  key={session.id}
                  onClick={() => !isEditing && setActiveSessionId(session.id)}
                  className={`group relative flex cursor-pointer items-center justify-between rounded-xl p-2.5 text-left transition-all ${
                    isActive
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/80 dark:bg-slate-800 dark:text-white dark:border-slate-700"
                      : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
                  }`}
                >
                  {isEditing ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 w-full"
                    >
                      <input
                        type="text"
                        value={editTitleInput}
                        onChange={(e) => setEditTitleInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveSessionTitle(session.id);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            handleCancelEditing();
                          }
                        }}
                        autoFocus
                        className="w-full rounded-md border border-[#0052FF] bg-white px-2 py-1 text-xs text-slate-900 outline-none shadow-xs dark:bg-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveSessionTitle(session.id)}
                        className="p-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                        title="Save title"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditing}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 truncate pr-2 flex-1">
                        <MessageSquare className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-[#0052FF]" : "text-slate-400"}`} />
                        <span className="truncate text-xs font-medium" title={session.title}>
                          {session.title || "Untitled Chat"}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => startEditingSession(e, session)}
                          className="p-1 text-slate-400 hover:text-[#0052FF] dark:hover:text-[#4D7CFF] transition-colors"
                          title="Rename chat"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSession(e, session.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                          title="Delete chat"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Access Level Status in Sidebar Footer */}
        <div className="border-t border-slate-200/70 p-4 dark:border-slate-800/80">
          <div className="flex items-center gap-2 rounded-xl bg-slate-100/70 p-2.5 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            {user?.role === "admin" ? (
              <>
                <Shield className="h-4 w-4 flex-shrink-0 text-amber-500" />
                <div>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">Admin Mode</span>
                  <p className="text-[10px] text-slate-400">Full repository + admin files indexed</p>
                </div>
              </>
            ) : (
              <>
                <UserCheck className="h-4 w-4 flex-shrink-0 text-blue-500" />
                <div>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">Standard Access</span>
                  <p className="text-[10px] text-slate-400">Public & shared documents only</p>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* 2. MAIN CHAT AREA */}
      <section className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white shadow-md shadow-[#0052FF]/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                Global AI Document Assistant
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Multi-document FIR intelligence, cross-jurisdiction analysis & semantic search
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAiSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-500/20 dark:text-violet-300"
              title="Click to configure AI Engine (Ollama / OpenAI)"
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>{aiProvider === "openai" ? "OpenAI (Cloud)" : "Ollama (Offline)"}</span>
            </button>

            {user?.role === "admin" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <Shield className="h-3.5 w-3.5" />
                Admin Scope
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <UserCheck className="h-3.5 w-3.5" />
                Standard Scope
              </span>
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-6">
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#0052FF]" />
              Retrieving conversation…
            </div>
          ) : messages.length === 0 ? (
            /* Empty State & Starter Prompts */
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-[#0052FF] dark:bg-blue-500/10 dark:text-[#4D7CFF]">
                <Bot className="h-8 w-8" />
              </div>
              <h3 className="font-display text-xl text-slate-900 dark:text-white">
                How can I assist your investigation?
              </h3>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Ask questions across all indexed FIR documents, IPC/BNS acts, police stations, dates, or specific criminal categories.
              </p>

              <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
                {SAMPLE_PROMPTS.map((prompt, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04, duration: 0.22 }}
                    whileHover={{ scale: 1.01, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSendMessage(prompt)}
                    className="flex items-center justify-between rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 text-left text-xs font-medium text-slate-700 transition-colors hover:border-[#0052FF]/40 hover:bg-white hover:shadow-md dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:border-[#4D7CFF]/40 dark:hover:bg-slate-800"
                  >
                    <span>{prompt}</span>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const parsed = !isUser
                  ? parseThinkingAndContent(message.content, message.streaming)
                  : { thought: "", answer: message.content, isThinking: false };
                const visible = isUser
                  ? message.content
                  : visiblePortion(parsed.answer);

                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className={`flex items-start gap-3.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl shadow-sm ${
                        isUser
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                          : "bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white"
                      }`}
                    >
                      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>

                    {/* Bubble Content */}
                    <div
                      className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-4.5 text-xs sm:text-sm ${
                        isUser
                          ? "rounded-tr-none bg-[#0052FF] text-white shadow-md shadow-[#0052FF]/10"
                          : "rounded-tl-none border border-slate-200/80 bg-white text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-100"
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{visible}</p>
                      ) : (
                        <div>
                          {message.isCached && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.2 }}
                              className="mb-2.5 flex items-center gap-1.5"
                            >
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-50/80 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 shadow-2xs dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <Zap className="h-3 w-3 fill-emerald-500 text-emerald-500 animate-pulse" />
                                <span>Semantic Cache Hit &bull; Instant</span>
                              </span>
                            </motion.div>
                          )}

                          <ThinkingBlock
                            thought={parsed.thought}
                            isThinking={parsed.isThinking}
                            isStreaming={message.streaming}
                          />

                          {visible ? (
                            <>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={customMarkdownComponents}
                              >
                                {visible}
                              </ReactMarkdown>
                              {message.streaming && !parsed.isThinking && (
                                <span className="inline-block h-4 w-1 animate-pulse bg-[#0052FF] align-middle ml-1" />
                              )}
                            </>
                          ) : null}
                        </div>
                      )}

                      {/* Sleek Compact Inline References */}
                      {!isUser && message.sources && message.sources.length > 0 && (() => {
                        const grouped = groupSources(message.sources);
                        if (grouped.length === 0) return null;

                        return (
                          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-2.5 dark:border-slate-800/60">
                            <span className="mr-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              <FileText className="h-3.5 w-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
                              <span>Ref:</span>
                            </span>
                            {grouped.map((doc) => (
                              <a
                                key={doc.fileId}
                                href={`/dashboard/pdf/${doc.fileId}?mode=view&page=${doc.pages[0] || 1}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-100/70 px-2.5 py-1 text-[11px] font-mono text-slate-700 transition-all hover:border-[#0052FF]/60 hover:bg-blue-50/60 hover:text-[#0052FF] dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-[#4D7CFF]/60 dark:hover:bg-slate-800 dark:hover:text-white"
                                title={`Open ${doc.fileName} in new tab (Page ${doc.pages[0] || 1})`}
                              >
                                <span className="max-w-[200px] truncate sm:max-w-[280px]">
                                  {doc.fileName}
                                </span>
                                <span className="rounded bg-slate-200/80 px-1.5 py-0.2 font-sans text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  [{doc.pages.map((p) => `p.${p}`).join(", ")}]
                                </span>
                                <ExternalLink className="h-3 w-3 text-slate-400 opacity-60 transition-opacity group-hover:opacity-100 group-hover:text-[#0052FF] dark:group-hover:text-[#4D7CFF]" />
                              </a>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Input Footer */}
        <div className="border-t border-slate-200/80 p-4 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20">
          {/* Quick command pills when input is empty */}
          {!input.trim() && !isSending && (
            <div className="mb-2 flex items-center gap-2 overflow-x-auto text-xs">
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                <Sparkles className="h-3 w-3 text-[#0052FF]" />
                <span>Commands:</span>
              </span>
              <button
                type="button"
                onClick={() => handleSendMessage("/stats")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs transition-all hover:border-[#0052FF]/50 hover:bg-blue-50/70 hover:text-[#0052FF] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Run /stats (FIR records, station breakdowns, crime categories & property loss)"
              >
                <Shield className="h-3.5 w-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
                <span>/stats</span>
                <span className="text-[10px] text-slate-400">Police Stats & Graphs</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInput("/doc ");
                  setSlashDismissed(false);
                  setSlashSelectedIndex(0);
                  textareaRef.current?.focus();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs transition-all hover:border-[#0052FF]/50 hover:bg-blue-50/70 hover:text-[#0052FF] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Run /doc (Search and tag a permitted document)"
              >
                <FileText className="h-3.5 w-3.5 text-indigo-500" />
                <span>/doc</span>
                <span className="text-[10px] text-slate-400">Tag Document</span>
              </button>
            </div>
          )}

          <div className="relative">
            {/* Floating Slash Palette Popup */}
            {isSlashActive && (
              <div className="absolute bottom-full left-0 right-0 mb-3 z-50 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-2xl shadow-slate-900/15 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-slate-950/60">
                {isDocMode ? (
                  /* DOCUMENT PICKER */
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800/80 mb-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Tag Document for Targeted Question
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#0052FF] dark:bg-blue-950/70 dark:text-[#4D7CFF]">
                          {filteredDocs.length} {filteredDocs.length === 1 ? "document" : "documents"} available
                        </span>
                        <span className="hidden sm:inline text-[10px] text-slate-400">↑↓ to navigate · Enter to tag</span>
                      </div>
                    </div>

                    {filteredDocs.length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-400">
                        {loadingDocs ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0052FF]" />
                            <span>Loading accessible documents...</span>
                          </div>
                        ) : (
                          <span>No permitted documents match &quot;{docSearchQuery}&quot;</span>
                        )}
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto space-y-1 p-1">
                        {filteredDocs.map((doc, idx) => {
                          const isSelected = idx === slashSelectedIndex;
                          return (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => handleSelectDoc(doc)}
                              onMouseEnter={() => setSlashSelectedIndex(idx)}
                              className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-all ${
                                isSelected
                                  ? "border-l-4 border-[#0052FF] bg-blue-50/90 text-blue-950 dark:bg-blue-950/60 dark:text-blue-100 ring-1 ring-blue-500/20 shadow-xs"
                                  : "hover:bg-slate-50 text-slate-700 dark:hover:bg-slate-800/60 dark:text-slate-300"
                              }`}
                            >
                              <div
                                className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                                  isSelected
                                    ? "bg-[#0052FF] text-white"
                                    : "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                                }`}
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 max-w-[280px] sm:max-w-[360px]">
                                    {doc.name}
                                  </span>
                                  {doc.accessLevel === "admin" && (
                                    <span className="rounded bg-amber-500/10 px-1.5 py-0.2 font-sans text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                                      Admin
                                    </span>
                                  )}
                                  {doc.shared && (
                                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 font-sans text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                                      Shared
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                                  {doc.firNumber && (
                                    <span>
                                      FIR: <strong className="font-semibold text-slate-600 dark:text-slate-300">{doc.firNumber}</strong>
                                    </span>
                                  )}
                                  {doc.policeStation && <span>• PS: {doc.policeStation}</span>}
                                  {doc.district && <span>• Dist: {doc.district}</span>}
                                  {doc.firDate && <span>• Date: {doc.firDate}</span>}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* SLASH COMMAND LIST */
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800/80 mb-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-[#0052FF]" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Quick Slash Commands
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">↑↓ to navigate · Enter/Tab to select · Esc to close</span>
                    </div>

                    {filteredCommands.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No command matches &quot;{commandSearchQuery}&quot;
                      </div>
                    ) : (
                      <div className="space-y-1 p-1">
                        {filteredCommands.map((cmd, idx) => {
                          const isSelected = idx === slashSelectedIndex;
                          const Icon = cmd.icon;
                          return (
                            <button
                              key={cmd.id}
                              type="button"
                              onClick={() => handleSelectCommand(cmd.id)}
                              onMouseEnter={() => setSlashSelectedIndex(idx)}
                              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                                isSelected
                                  ? "border-l-4 border-[#0052FF] bg-blue-50/90 text-blue-950 dark:bg-blue-950/60 dark:text-blue-100 ring-1 ring-blue-500/20 shadow-xs"
                                  : "hover:bg-slate-50 text-slate-700 dark:hover:bg-slate-800/60 dark:text-slate-300"
                              }`}
                            >
                              <div
                                className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                                  isSelected
                                    ? "bg-[#0052FF] text-white"
                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-[#0052FF] dark:text-[#4D7CFF]">
                                    {cmd.command}
                                  </span>
                                  <span className="text-xs font-semibold">{cmd.title}</span>
                                  {cmd.badge && (
                                    <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                      {cmd.badge}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                                  {cmd.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="relative flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm transition-all focus-within:border-[#0052FF] focus-within:ring-4 focus-within:ring-[#0052FF]/10 dark:border-slate-800 dark:bg-slate-900">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  if (slashDismissed && (val.startsWith("/") || val.startsWith("@"))) {
                    setSlashDismissed(false);
                  }
                  setSlashSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything across permitted documents, or type / for stats and doc tagger..."
                className="max-h-32 flex-1 resize-none bg-transparent py-2 text-xs sm:text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
              {isSending ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="ml-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-md shadow-rose-600/30 transition-all duration-150 hover:bg-rose-700 hover:scale-105 active:scale-95"
                  title="Stop generation"
                  aria-label="Stop generation"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!input.trim()}
                  className="ml-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-md shadow-[#0052FF]/20 transition-all hover:shadow-lg disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Send message"
                  title="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-400">
            Type <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">/stats</kbd> for live police records & graphs or <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">/doc</kbd> to search & tag any document.
          </p>
        </div>
      </section>

      {/* AI Settings Modal */}
      <AiSettingsModal
        isOpen={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
        onSaved={(newProvider) => setAiProvider(newProvider)}
      />
    </div>
  );
}
