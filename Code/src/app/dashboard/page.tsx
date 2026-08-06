// app/page.tsx

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  Plus,
  FolderPlus,
  HardDrive,
  Files,
  Share2,
  ShieldCheck,
  Shield,
  LayoutGrid,
  LayoutDashboard,
  List,
  Folder,
  FileText,
  FileImage,
  FileArchive,
  FileSpreadsheet,
  FileVideo,
  File as FileIcon,
  MoreHorizontal,
  MessageSquareText,
  Download,
  Trash2,
  Share,
  UploadCloud,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  UserCheck,
  X,
  ExternalLink,
} from "lucide-react";
import AdminPanel from "@/components/admin/admin-panel";
import { normalizeFileType } from "@/lib/file-types";

// =========================================================
// Types
// =========================================================

type Role = "admin" | "user";

interface CurrentUser {
  id: string;
  email: string;
  fullName?: string;
  role: Role;
  storageLimitBytes?: number;
  mustChangePassword?: boolean;
}

type FileType = "pdf" | "image" | "archive" | "doc" | "sheet" | "video" | "other";

interface FileOwner {
  name?: string;
}

interface FileItem {
  id: string;
  name: string;
  type: FileType;
  sizeBytes: number;
  path: string;
  updatedAt: string;
  owner?: FileOwner;
  shared: boolean;
}

interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  owner?: FileOwner;
  createdAt: string;
  shared: boolean;
  fileCount?: number;
}

interface QuickFolder {
  id: string;
  name: string;
  fileCount: number;
  icon: typeof Folder;
  accent: string;
}

type ViewMode = "grid" | "list";
type FileFilter = "all" | FileType;
type StorageCategory = "dashboard" | "my-files" | "shared" | "admin";
type ExplorerCategory = Exclude<StorageCategory, "dashboard" | "admin">;

interface DashboardStats {
  totalFiles: number;
  totalBytes: number;
  sharedCount: number;
}

// =========================================================
// Constants
// =========================================================

const QUICK_FOLDERS: QuickFolder[] = [
  { id: "documents", name: "Documents", fileCount: 0, icon: Folder, accent: "from-[#0052FF] to-[#4D7CFF]" },
  { id: "images", name: "Images", fileCount: 0, icon: FileImage, accent: "from-violet-500 to-fuchsia-500" },
  { id: "backups", name: "Backups", fileCount: 0, icon: FileArchive, accent: "from-amber-500 to-orange-500" },
];

const FILE_TYPE_LABELS: Record<FileType, string> = {
  pdf: "PDFs",
  image: "Images",
  archive: "Archives",
  doc: "Documents",
  sheet: "Spreadsheets",
  video: "Videos",
  other: "Other",
};

const AVATAR_COLORS = [
  "bg-[#0052FF]",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

// =========================================================
// Helpers
// =========================================================

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${parseFloat(value.toFixed(decimals))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name?: string): string {
  if (!name || !name.trim()) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name?: string): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getFileVisual(type: FileType): { icon: typeof FileIcon; className: string; bg: string } {
  switch (type) {
    case "pdf":
      return { icon: FileText, className: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10" };
    case "image":
      return { icon: FileImage, className: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-500/10" };
    case "archive":
      return { icon: FileArchive, className: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10" };
    case "doc":
      return { icon: FileText, className: "text-[#0052FF] dark:text-[#4D7CFF]", bg: "bg-[#0052FF]/5 dark:bg-[#0052FF]/10" };
    case "sheet":
      return { icon: FileSpreadsheet, className: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" };
    case "video":
      return { icon: FileVideo, className: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-500/10" };
    default:
      return { icon: FileIcon, className: "text-slate-500 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800" };
  }
}

// =========================================================
// Presentational Components
// =========================================================

function StatCard({
  icon: Icon,
  iconClassName,
  iconBg,
  label,
  value,
  sublabel,
  loading,
  children,
}: {
  icon: typeof FileIcon;
  iconClassName: string;
  iconBg: string;
  label: string;
  value: string;
  sublabel?: string;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconClassName}`} />
        </div>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      ) : (
        <p className="mt-1 font-display text-2xl leading-tight tracking-[-0.01em] text-slate-900 dark:text-white">
          {value}
        </p>
      )}
      {sublabel && !loading && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sublabel}</p>}
      {!loading && children}
    </div>
  );
}

function DoughnutChart({
  percent,
  size = 132,
  strokeWidth = 13,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const [animatedPercent, setAnimatedPercent] = useState(0);

  useEffect(() => {
    setAnimatedPercent(0);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimatedPercent(percent));
    });
    return () => cancelAnimationFrame(raf);
  }, [percent]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, animatedPercent)) / 100) * circumference;

  return (
    <div className="relative flex flex-shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-slate-100 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-[#0052FF] transition-[stroke-dashoffset] duration-[1100ms] ease-out dark:stroke-[#4D7CFF]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl leading-none tracking-[-0.01em] text-slate-900 dark:text-white">
          {Math.round(percent)}%
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">used</span>
      </div>
    </div>
  );
}

function ContextMenu({
  onDownload,
  onShare,
  onDelete,
  onClose,
}: {
  onDownload: () => void;
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const items = [
    { label: "Download", icon: Download, onClick: onDownload, danger: false },
    { label: "Share", icon: Share, onClick: onShare, danger: false },
    { label: "Delete", icon: Trash2, onClick: onDelete, danger: true },
  ];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors ${
            item.danger
              ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

// =========================================================
// Main Dashboard Page
// =========================================================

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [category, setCategory] = useState<StorageCategory>("dashboard");

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<FolderItem[]>([]);
  const currentFolder = folderPath[folderPath.length - 1] ?? null;

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);

  const [stats, setStats] = useState<DashboardStats>({ totalFiles: 0, totalBytes: 0, sharedCount: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FileFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isDraggingOverWindow, setIsDraggingOverWindow] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [dashboardOpenKey, setDashboardOpenKey] = useState(0);

  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "file"; item: FileItem } | { kind: "folder"; item: FolderItem } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const isExplorer = category === "my-files" || category === "shared";

  const storageLimitBytes = user?.storageLimitBytes ?? 5 * 1024 * 1024 * 1024;

  // -----------------------------------------------------
  // 1. Fetch Auth User
  // -----------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          setUser({
            id: "user_placeholder_id",
            email: "admin@office-pc.local",
            fullName: "Office Administrator",
            role: "admin",
            storageLimitBytes: 5 * 1024 * 1024 * 1024,
          });
          return;
        }
        const data = await res.json();
        if (isMounted) setUser(data.user ?? data);
      } catch {
        setUser({
          id: "user_placeholder_id",
          email: "admin@office-pc.local",
          fullName: "Office Administrator",
          role: "admin",
          storageLimitBytes: 5 * 1024 * 1024 * 1024,
        });
      } finally {
        if (isMounted) setLoadingUser(false);
      }
    }
    fetchUser();
    return () => {
      isMounted = false;
    };
  }, []);

  // -----------------------------------------------------
  // 2. Fetch overview stats for the Dashboard tab
  // -----------------------------------------------------
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const [myRes, sharedRes] = await Promise.all([
        fetch("/api/files?category=my-files"),
        fetch("/api/files?category=shared"),
      ]);
      const myData = myRes.ok ? await myRes.json() : { files: [] };
      const sharedData = sharedRes.ok ? await sharedRes.json() : { files: [] };
      const myFiles: FileItem[] = myData.files || [];
      const sharedFiles: FileItem[] = sharedData.files || [];
      setStats({
        totalFiles: myFiles.length,
        totalBytes: myFiles.reduce((sum, f) => sum + (f?.sizeBytes || 0), 0),
        sharedCount: sharedFiles.length,
      });
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // -----------------------------------------------------
  // 3. Fetch folders + files for the active explorer view
  // -----------------------------------------------------
  const fetchExplorerContent = async (cat: ExplorerCategory, folderId: string | null) => {
    setLoadingContent(true);
    try {
      const folderParam = `&folderId=${folderId ?? "null"}`;

      const [foldersRes, filesRes] = await Promise.all([
        fetch(`/api/folders?category=${cat}${folderParam}`, { cache: "no-store" }),
        fetch(`/api/files?category=${cat}${folderParam}`, { cache: "no-store" }),
      ]);

      const foldersData = foldersRes.ok ? await foldersRes.json() : { folders: [] };
      const filesData = filesRes.ok ? await filesRes.json() : { files: [] };
      setFolders(foldersData.folders || []);
      setFiles(filesData.files || []);
    } catch (err) {
      console.error("Failed to load folder contents:", err);
    } finally {
      setLoadingContent(false);
    }
  };

  useEffect(() => {
    if (isExplorer) {
      fetchExplorerContent(category as ExplorerCategory, currentFolderId);
    }
  }, [category, currentFolderId]);

  function handleCategoryChange(next: StorageCategory) {
    setCategory(next);
    setCurrentFolderId(null);
    setFolderPath([]);
    setSearchQuery("");
    setActiveFilter("all");
    setOpenMenuId(null);
    if (next === "dashboard") {
      setDashboardOpenKey((k) => k + 1);
    }
  }

  function handleOpenFolder(folder: FolderItem) {
    setFolderPath((prev) => [...prev, folder]);
    setCurrentFolderId(folder.id);
    setSearchQuery("");
  }

  function handleBreadcrumbClick(index: number) {
    if (index === -1) {
      setFolderPath([]);
      setCurrentFolderId(null);
      return;
    }
    setFolderPath((prev) => {
      const next = prev.slice(0, index + 1);
      setCurrentFolderId(next[next.length - 1]?.id ?? null);
      return next;
    });
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setIsFilterOpen(false);
        setOpenMenuId(null);
        setIsNewFolderModalOpen(false);
        setDeleteTarget(null);
        setPreviewFile(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isNewFolderModalOpen) {
      setTimeout(() => newFolderInputRef.current?.focus(), 50);
    }
  }, [isNewFolderModalOpen]);

  useEffect(() => {
    let dragCounter = 0;
    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      if (e.dataTransfer?.types?.includes("Files")) {
        dragCounter += 1;
        setIsDraggingOverWindow(true);
      }
    }
    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }
    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounter -= 1;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsDraggingOverWindow(false);
      }
    }
    function handleDrop(e: DragEvent) {
      e.preventDefault();
      dragCounter = 0;
      setIsDraggingOverWindow(false);
      const dropped = e.dataTransfer?.files;
      if (dropped && dropped.length > 0 && isExplorer) {
        uploadFiles(dropped);
      }
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [isExplorer, currentFolderId, category]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const filteredFolders = useMemo(() => {
    return folders.filter((f) => f?.name?.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  }, [folders, searchQuery]);

  const filteredFiles = useMemo(() => {
    return files
      .filter((f) => (activeFilter === "all" ? true : f?.type === activeFilter))
      .filter((f) => f?.name?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      .sort((a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime());
  }, [files, activeFilter, searchQuery]);

  const uploadFiles = async (fileList: FileList) => {
    if (!isExplorer) return;
    const fileArray = Array.from(fileList);
    let uploadedCount = 0;

    for (const file of fileArray) {
      const formData = new FormData();
      formData.append("file", file);
      if (currentFolderId) formData.append("folderId", currentFolderId);

      formData.append("shared", category === "shared" ? "true" : "false");

      try {
        setToast(`Uploading ${file.name}…`);
        const res = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const uploaded = data.file;

          if (uploaded) {
            const normalizedType = normalizeFileType(uploaded.type, uploaded.name);
            setFiles((prev) => [
              {
                id: uploaded.id,
                name: uploaded.name,
                type: normalizedType,
                sizeBytes: uploaded.sizeBytes,
                path: uploaded.path,
                updatedAt: uploaded.updatedAt,
                owner: {
                  name: user?.fullName || user?.email || "You",
                },
                shared: uploaded.shared,
              },
              ...prev.filter((existing) => existing?.id !== uploaded.id),
            ]);
            uploadedCount++;
          }
          setToast(`${file.name} uploaded successfully!`);
        } else {
          const errData = await res.json().catch(() => ({}));
          setToast(errData.error || `Failed to upload ${file.name}`);
        }
      } catch (err) {
        console.error("Upload error:", err);
        setToast("An error occurred during upload.");
      }
    }

    if (uploadedCount > 0) {
      fetchExplorerContent(category as ExplorerCategory, currentFolderId);
      fetchStats();
    }
  };

  const handleOpenPdf = (file: FileItem) => {
    router.push(`/dashboard/pdf/${file.id}`);
  };

  const handleOpenFolderChat = (folder: FolderItem) => {
    router.push(`/dashboard/folder/${folder.id}/chat`);
  };

  const handleDelete = (file: FileItem) => {
    setDeleteTarget({ kind: "file", item: file });
  };

  const handleDeleteFolder = (folder: FolderItem) => {
    setDeleteTarget({ kind: "folder", item: folder });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "file") {
        const file = deleteTarget.item;
        const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
        if (res.ok) {
          setFiles((prev) => prev.filter((f) => f?.id !== file.id));
          setToast(`${file.name} deleted.`);
          fetchStats();
        } else {
          setToast("Failed to delete file.");
        }
      } else {
        const folder = deleteTarget.item;
        const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
        if (res.ok) {
          setFolders((prev) => prev.filter((f) => f?.id !== folder.id));
          setToast(`Folder "${folder.name}" deleted.`);
          fetchStats();
        } else {
          setToast("Failed to delete folder.");
        }
      }
    } catch {
      setToast(deleteTarget.kind === "file" ? "Error deleting file." : "Error deleting folder.");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleShare = (file: FileItem) => {
    const link = `${window.location.origin}/files/${file.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).catch(() => {});
    }
    setToast("Share link copied to clipboard");
  };

  const handleDownload = (file: FileItem) => {
    setToast(`Downloading ${file.name}…`);
    const anchor = document.createElement("a");
    anchor.href = file.path;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !isExplorer) return;
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parentId: currentFolderId || undefined,
          shared: category === "shared",
        }),
      });
      if (res.ok) {
        setToast(`Folder "${name}" created`);
        setNewFolderName("");
        setIsNewFolderModalOpen(false);
        fetchExplorerContent(category as ExplorerCategory, currentFolderId);
      } else {
        setToast("Failed to create folder");
      }
    } catch {
      setToast("Error creating folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  const availableFileTypes = useMemo(() => {
    const seen: FileType[] = [];
    files.forEach((f) => {
      if (f?.type && !seen.includes(f.type)) seen.push(f.type);
    });
    return seen;
  }, [files]);

  const filterOptions: { value: FileFilter; label: string }[] = useMemo(
    () => [
      { value: "all", label: "All files" },
      ...availableFileTypes.map((type) => ({ value: type as FileFilter, label: FILE_TYPE_LABELS[type] })),
    ],
    [availableFileTypes]
  );

  useEffect(() => {
    if (activeFilter !== "all" && !availableFileTypes.includes(activeFilter as FileType)) {
      setActiveFilter("all");
    }
  }, [availableFileTypes, activeFilter]);

  const usedPercent = Math.min(100, Math.round((stats.totalBytes / storageLimitBytes) * 100));

  return (
    <div className="relative min-h-screen w-full bg-[#FAFAFA] text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-white">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {isDraggingOverWindow && isExplorer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="mx-6 flex w-full max-w-lg flex-col items-center rounded-3xl border-2 border-dashed border-[#4D7CFF] bg-slate-900/90 px-10 py-16 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0052FF]/20">
              <UploadCloud className="h-8 w-8 text-[#4D7CFF]" />
            </div>
            <p className="font-display text-2xl text-white">Drop to upload</p>
            <p className="mt-2 text-sm text-slate-400">
              {currentFolderId ? "Release to add these files to this folder" : "Release anywhere on the screen to save to host PC"}
            </p>
          </div>
        </div>
      )}

      {isNewFolderModalOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => !creatingFolder && setIsNewFolderModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg text-slate-900 dark:text-white">New folder</h3>
              <button
                onClick={() => setIsNewFolderModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {folderPath.length > 0
                ? `Inside ${folderPath[folderPath.length - 1]?.name ?? "Folder"}`
                : category === "shared"
                  ? "In Shared Files"
                  : "In My Files"}
            </p>
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
              placeholder="Folder name"
              className="mb-5 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsNewFolderModalOpen(false)}
                disabled={creatingFolder}
                className="flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-4 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,82,255,0.3)] disabled:pointer-events-none disabled:opacity-50"
              >
                {creatingFolder ? "Creating…" : "Create folder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg text-slate-900 dark:text-white">
                Delete {deleteTarget.kind === "folder" ? "folder" : "file"}?
              </h3>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
              {deleteTarget.kind === "folder" ? (
                <>
                  Are you sure you want to delete <span className="font-medium text-slate-700 dark:text-slate-300">"{deleteTarget.item.name}"</span>
                  {" "}and everything inside it? This can't be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete <span className="font-medium text-slate-700 dark:text-slate-300">"{deleteTarget.item.name}"</span>? This can't be undone.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setPreviewFile(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                {(() => {
                  const Vis = getFileVisual(previewFile.type);
                  return (
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${Vis.bg}`}>
                      <Vis.icon className={`h-5 w-5 ${Vis.className}`} />
                    </div>
                  );
                })()}
                <div>
                  <h3 className="font-display font-medium text-slate-900 dark:text-white">{previewFile.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatBytes(previewFile.sizeBytes)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(previewFile)}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto p-6 min-h-[300px] bg-slate-50 dark:bg-slate-950">
              {previewFile.type === "image" ? (
                <img
                  src={previewFile.path}
                  alt={previewFile.name}
                  className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-md"
                />
              ) : previewFile.type === "pdf" ? (
                <div className="flex flex-col items-center gap-4 text-center">
                  <FileText className="h-16 w-16 text-red-500" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">PDF Document</p>
                  <button
                    onClick={() => {
                      setPreviewFile(null);
                      handleOpenPdf(previewFile);
                    }}
                    className="flex items-center gap-2 rounded-xl bg-[#0052FF] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0042CC]"
                  >
                    Open PDF Reader <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  {(() => {
                    const Vis = getFileVisual(previewFile.type);
                    return <Vis.icon className={`h-16 w-16 ${Vis.className}`} />;
                  })()}
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{previewFile.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Preview not available for this file type.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[150] flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-2xl transition-all duration-300 dark:bg-slate-800">
          <Check className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Navigation Tabs */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <nav className="flex gap-2">
            {[
              { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
              { id: "my-files", label: "My Files", icon: Files },
              { id: "shared", label: "Shared", icon: Share2 },
              ...(user?.role === "admin" ? [{ id: "admin", label: "Admin", icon: Shield }] : []),
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = category === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleCategoryChange(tab.id as StorageCategory)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {isExplorer && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsNewFolderModalOpen(true)}
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <FolderPlus className="h-4 w-4 text-slate-500" />
                New Folder
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-4 text-xs font-medium text-white shadow-md shadow-[#0052FF]/20 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#0052FF]/30"
              >
                <Plus className="h-4 w-4" />
                Upload File
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: DASHBOARD OVERVIEW */}
        {category === "dashboard" && (
          <div key={dashboardOpenKey} className="space-y-8">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                icon={Files}
                iconClassName="text-blue-600 dark:text-blue-400"
                iconBg="bg-blue-50 dark:bg-blue-500/10"
                label="Total Files"
                value={stats.totalFiles.toString()}
                loading={loadingStats}
              />
              <StatCard
                icon={Share2}
                iconClassName="text-violet-600 dark:text-violet-400"
                iconBg="bg-violet-50 dark:bg-violet-500/10"
                label="Shared Items"
                value={stats.sharedCount.toString()}
                loading={loadingStats}
              />
              <StatCard
                icon={HardDrive}
                iconClassName="text-emerald-600 dark:text-emerald-400"
                iconBg="bg-emerald-50 dark:bg-emerald-500/10"
                label="Storage Used"
                value={formatBytes(stats.totalBytes)}
                sublabel={`of ${formatBytes(storageLimitBytes)} total`}
                loading={loadingStats}
              />
            </div>

            {/* Storage breakdown section */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-lg text-slate-900 dark:text-white">Storage Usage</h3>
              <div className="mt-6 flex flex-col items-center gap-8 md:flex-row md:justify-around">
                <DoughnutChart percent={usedPercent} />
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Used Space</p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white">
                      {formatBytes(stats.totalBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Free Space</p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white">
                      {formatBytes(Math.max(0, storageLimitBytes - stats.totalBytes))}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2 & 3: FILE EXPLORER (My Files & Shared) */}
        {isExplorer && (
          <div className="space-y-6">
            {/* Breadcrumb Navigation & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 overflow-x-auto text-sm">
                <button
                  onClick={() => handleBreadcrumbClick(-1)}
                  className={`font-medium transition-colors ${
                    folderPath.length === 0
                      ? "text-slate-900 dark:text-white font-semibold"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {category === "shared" ? "Shared Files" : "My Files"}
                </button>
                {folderPath.map((folder, idx) => (
                  <React.Fragment key={folder.id}>
                    <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <button
                      onClick={() => handleBreadcrumbClick(idx)}
                      className={`font-medium transition-colors whitespace-nowrap ${
                        idx === folderPath.length - 1
                          ? "text-slate-900 dark:text-white font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      {folder.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <div className="flex items-center gap-3">
                {currentFolder && (
                  <button
                    type="button"
                    onClick={() => handleOpenFolderChat(currentFolder)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <MessageSquareText className="h-3.5 w-3.5" />
                    AI Chat
                  </button>
                )}

                {/* Search Box */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files and folders…"
                    className="h-9 w-48 rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-xs text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 focus:w-64 dark:border-slate-800 dark:bg-slate-900 dark:text-white sm:w-56 sm:focus:w-72"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Dropdown */}
                <div ref={filterRef} className="relative">
                  <button
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
                    {FILE_TYPE_LABELS[activeFilter as FileType] || "All Files"}
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                  {isFilterOpen && (
                    <div className="absolute right-0 top-full z-30 mt-1.5 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                      {filterOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setActiveFilter(opt.value);
                            setIsFilterOpen(false);
                          }}
                          className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <span className={activeFilter === opt.value ? "font-semibold text-[#0052FF]" : "text-slate-700 dark:text-slate-300"}>
                            {opt.label}
                          </span>
                          {activeFilter === opt.value && <Check className="h-3.5 w-3.5 text-[#0052FF]" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`rounded-lg p-1.5 text-slate-500 transition-colors ${
                      viewMode === "grid" ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white" : ""
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`rounded-lg p-1.5 text-slate-500 transition-colors ${
                      viewMode === "list" ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white" : ""
                    }`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Folders & Files Display */}
            {loadingContent ? (
              <div className="py-20 text-center text-sm text-slate-400 animate-pulse">Loading content...</div>
            ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 p-12 text-center dark:border-slate-800">
                <Folder className="h-12 w-12 text-slate-300 dark:text-slate-700" />
                <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">No files or folders here</p>
                <p className="mt-1 text-xs text-slate-400">Upload a file or create a folder to get started</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Folders List */}
                {filteredFolders.length > 0 && (
                  <div>
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Folders</h4>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {filteredFolders.map((folder) => (
                        <div
                          key={folder.id}
                          onClick={() => handleOpenFolder(folder)}
                          className="group relative flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0052FF] dark:bg-blue-500/10 dark:text-[#4D7CFF]">
                              <Folder className="h-5 w-5" />
                            </div>
                            <div className="truncate">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                {folder.name}
                              </p>
                              <p className="text-[10px] text-slate-400">{formatDate(folder.createdAt)}</p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFolder(folder);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 transition-opacity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files Grid / List View */}
                {filteredFiles.length > 0 && (
                  <div>
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Files</h4>
                    {viewMode === "grid" ? (
                      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {filteredFiles.map((file) => {
                          const Vis = getFileVisual(file.type);
                          return (
                            <div
                              key={file.id}
                              onClick={() => {
                                if (file.type === "pdf") handleOpenPdf(file);
                                else setPreviewFile(file);
                              }}
                              className="group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                            >
                              <div className="mb-4 flex items-start justify-between">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${Vis.bg}`}>
                                  <Vis.icon className={`h-5 w-5 ${Vis.className}`} />
                                </div>
                                <div className="relative" ref={openMenuId === file.id ? menuRef : null}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuId(openMenuId === file.id ? null : file.id);
                                    }}
                                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                  {openMenuId === file.id && (
                                    <ContextMenu
                                      onDownload={() => handleDownload(file)}
                                      onShare={() => handleShare(file)}
                                      onDelete={() => handleDelete(file)}
                                      onClose={() => setOpenMenuId(null)}
                                    />
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                  {file.name}
                                </p>
                                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                                  <span>{formatBytes(file.sizeBytes)}</span>
                                  <span>{formatDate(file.updatedAt)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-slate-100 bg-slate-50/50 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50">
                            <tr>
                              <th className="px-4 py-3 font-medium">Name</th>
                              <th className="px-4 py-3 font-medium">Size</th>
                              <th className="px-4 py-3 font-medium">Updated</th>
                              <th className="px-4 py-3 font-medium text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredFiles.map((file) => {
                              const Vis = getFileVisual(file.type);
                              return (
                                <tr
                                  key={file.id}
                                  onClick={() => {
                                    if (file.type === "pdf") handleOpenPdf(file);
                                    else setPreviewFile(file);
                                  }}
                                  className="group cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                                >
                                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                    <div className="flex items-center gap-3">
                                      <Vis.icon className={`h-4 w-4 ${Vis.className}`} />
                                      <span className="truncate max-w-xs">{file.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-500">{formatBytes(file.sizeBytes)}</td>
                                  <td className="px-4 py-3 text-slate-500">{formatDate(file.updatedAt)}</td>
                                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => handleDownload(file)}
                                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                      >
                                        <Download className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(file)}
                                        className="p-1 text-slate-400 hover:text-red-500"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ADMIN PANEL */}
        {category === "admin" && user?.role === "admin" && <AdminPanel />}
      </main>
    </div>
  );
}