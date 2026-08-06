"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Users,
  HardDrive,
  FileText,
  Folder,
  UserPlus,
  Search,
  Shield,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Database,
  Trash2,
  Edit,
  AlertTriangle,
  Copy,
  Check,
  Share2,
  Wifi,
  Cpu,
} from "lucide-react";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "user" | string;
  storageLimitBytes: number;
  usedStorageBytes: number;
  fileCount: number;
  folderCount: number;
  mustChangePassword?: boolean;
  createdAt: string;
}

export interface SystemMetrics {
  totalUsersCount: number;
  totalFilesCount: number;
  totalFoldersCount: number;
  totalStorageUsedBytes: number;
  totalStorageLimitBytes: number;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const AVATAR_COLORS = [
  "bg-blue-600 text-white",
  "bg-indigo-600 text-white",
  "bg-violet-600 text-white",
  "bg-emerald-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
];

export default function AdminPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics>({
    totalUsersCount: 0,
    totalFilesCount: 0,
    totalFoldersCount: 0,
    totalStorageUsedBytes: 0,
    totalStorageLimitBytes: 5368709120, // 5 GB default
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Share Link State
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [localIp, setLocalIp] = useState<string>("");

  // Search and Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");

  // Add User State
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "user",
    storageLimitGB: "5",
  });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit User State
  const [userToEdit, setUserToEdit] = useState<AdminUser | null>(null);
  const [editFormData, setEditFormData] = useState({
    fullName: "",
    role: "user",
    storageLimitGB: "5",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editModalError, setEditModalError] = useState<string | null>(null);

  // Delete User State
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // LLM Concurrency Settings State
  const [llmMaxConcurrent, setLlmMaxConcurrent] = useState<number>(3);
  const [llmActiveSessions, setLlmActiveSessions] = useState<number>(0);
  const [llmInputValue, setLlmInputValue] = useState("3");
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);

  // Fetch local network IP from server API or construct network link
  useEffect(() => {
    async function resolveNetworkUrl() {
      try {
        const res = await fetch("/api/system/network-ip");
        if (res.ok) {
          const data = await res.json();
          if (data.ip) {
            setLocalIp(data.ip);
            const port = window.location.port ? `:${window.location.port}` : "";
            setShareUrl(`http://${data.ip}${port}/login`);
            return;
          }
        }
      } catch {
        // Fallback if network API endpoint isn't set up yet
      }

      // Default fallback using window origin or placeholder instruction
      if (typeof window !== "undefined") {
        const hostname = window.location.hostname;
        const port = window.location.port ? `:${window.location.port}` : "";
        if (hostname === "localhost" || hostname === "127.0.0.1") {
          setShareUrl(`http://YOUR_LOCAL_IP${port}/login`);
        } else {
          setShareUrl(`http://${hostname}${port}/login`);
        }
      }
    }

    resolveNetworkUrl();
  }, []);

  // Fetch the LLM concurrency limit + how many chat requests are active right now
  async function fetchLlmConcurrency() {
    try {
      const res = await fetch("/api/admin/llm-concurrency");
      if (res.ok) {
        const data = await res.json();
        setLlmMaxConcurrent(data.maxConcurrent);
        setLlmInputValue(String(data.maxConcurrent));
        setLlmActiveSessions(data.activeSessions ?? 0);
      }
    } catch (err) {
      console.error("Failed to load LLM concurrency settings:", err);
    } finally {
      setLlmLoading(false);
    }
  }

  useEffect(() => {
    fetchLlmConcurrency();
    // Keep the "active right now" count fresh while the admin has this open
    const interval = setInterval(fetchLlmConcurrency, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleSaveLlmConcurrency() {
    const parsed = parseInt(llmInputValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setLlmError("Enter a whole number of 1 or more.");
      return;
    }
    setLlmSaving(true);
    setLlmError(null);
    try {
      const res = await fetch("/api/admin/llm-concurrency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxConcurrent: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLlmError(data.message || "Failed to save setting.");
        return;
      }
      setLlmMaxConcurrent(data.maxConcurrent);
      setLlmInputValue(String(data.maxConcurrent));
      setToastMessage("AI chat concurrency limit updated!");
    } catch (err) {
      console.error("Failed to save LLM concurrency setting:", err);
      setLlmError("Network error occurred while saving.");
    } finally {
      setLlmSaving(false);
    }
  }

  async function fetchUsersAndMetrics(showRefreshSpinner = false) {
    if (showRefreshSpinner) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) {
        throw new Error("Failed to load user management data.");
      }
      const data = await res.json();
      setUsers(data.users || []);
      if (data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error("Error fetching admin data:", err);
      setError("Unable to load system overview. Please check server logs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) {
          throw new Error("Failed to load user management data.");
        }
        const data = await res.json();
        if (!ignore) {
          setUsers(data.users || []);
          if (data.metrics) setMetrics(data.metrics);
        }
      } catch (err) {
        console.error("Error fetching admin data:", err);
        if (!ignore) setError("Unable to load system overview. Please check server logs.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  // Toast Auto-Dismiss
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setToastMessage("Local Wi-Fi link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.fullName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);

    if (!formData.email || !formData.email.includes("@")) {
      setModalError("Please enter a valid email address.");
      return;
    }

    if (!formData.password || formData.password.length < 6) {
      setModalError("Password must be at least 6 characters long.");
      return;
    }

    const gbNum = parseFloat(formData.storageLimitGB);
    if (isNaN(gbNum) || gbNum <= 0) {
      setModalError("Please enter a valid storage quota limit in GB.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          storageLimitGB: gbNum,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setModalError(data.error || "Failed to create user.");
        return;
      }

      setIsAddUserModalOpen(false);
      setFormData({ fullName: "", email: "", password: "", role: "user", storageLimitGB: "5" });
      setToastMessage(`User "${data.user.email}" created successfully!`);
      fetchUsersAndMetrics(true);
    } catch (err) {
      console.error("User creation error:", err);
      setModalError("Network error occurred while creating user.");
    } finally {
      setSubmitting(false);
    }
  }

  function openEditModal(user: AdminUser) {
    setUserToEdit(user);
    setEditModalError(null);
    setEditFormData({
      fullName: user.fullName || "",
      role: user.role,
      storageLimitGB: String(user.storageLimitBytes / (1024 * 1024 * 1024)),
    });
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!userToEdit) return;
    setEditModalError(null);

    const gbNum = parseFloat(editFormData.storageLimitGB);
    if (isNaN(gbNum) || gbNum <= 0) {
      setEditModalError("Please enter a valid storage quota limit in GB.");
      return;
    }

    setIsEditing(true);
    try {
      const res = await fetch(`/api/users/${userToEdit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editFormData.fullName,
          role: editFormData.role,
          storageLimitGB: gbNum,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEditModalError(data.error || "Failed to update user.");
        return;
      }

      setUserToEdit(null);
      setToastMessage(`User details updated successfully!`);
      fetchUsersAndMetrics(true);
    } catch (err) {
      console.error("User update error:", err);
      setEditModalError("Network error occurred while updating user.");
    } finally {
      setIsEditing(false);
    }
  }

  async function handleDeleteUser() {
    if (!userToDelete) return;
    setDeleteError(null);
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/users/${userToDelete.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || "Failed to delete user.");
        return;
      }

      setUserToDelete(null);
      setToastMessage(`User deleted successfully!`);
      fetchUsersAndMetrics(true);
    } catch (err) {
      console.error("User deletion error:", err);
      setDeleteError("Network error occurred while deleting user.");
    } finally {
      setIsDeleting(false);
    }
  }

  const storageUsedPercent = Math.min(
    100,
    Math.round((metrics.totalStorageUsedBytes / (metrics.totalStorageLimitBytes || 5368709120)) * 100)
  );

  return (
    <div className="w-full space-y-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/90 px-4 py-3 text-sm font-medium text-emerald-200 shadow-2xl backdrop-blur-md">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              System Administration
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
              <Shield className="h-3 w-3" /> Admin Mode
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Monitor system storage metrics, review registered accounts, and provision new users.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchUsersAndMetrics(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => setIsAddUserModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-4 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,82,255,0.3)] active:scale-[0.98]"
          >
            <UserPlus className="h-4 w-4" />
            Add New User
          </button>
        </div>
      </div>

      {/* LOCAL WI-FI / NETWORK SHARE LINK SECTION */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-200/80 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white p-6 shadow-sm dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-900/80 dark:to-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Local Network Access (Same Wi-Fi)
                </h3>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  Wi-Fi Ready
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Share this IP address link with other phones, tablets, or PCs connected to the same Wi-Fi router.
              </p>
            </div>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-80">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 text-xs font-mono font-semibold text-blue-600 shadow-inner focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-blue-400"
              />
            </div>
            <button
              onClick={handleCopyLink}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-white" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Wi-Fi Link
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* AI CHAT CONCURRENCY LIMIT SECTION */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-500/20">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                AI Chat Concurrency Limit
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Cap how many people can query the local LLM at the same time. Anyone over the
                limit sees a "heavy traffic" message instead of the model queueing up.
              </p>
            </div>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              type="number"
              min={1}
              value={llmInputValue}
              onChange={(e) => setLlmInputValue(e.target.value)}
              className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-3 text-center text-sm font-semibold text-slate-900 shadow-inner focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <button
              onClick={handleSaveLlmConcurrency}
              disabled={llmSaving || parseInt(llmInputValue, 10) === llmMaxConcurrent}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-95 disabled:opacity-50"
            >
              {llmSaving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              llmActiveSessions >= llmMaxConcurrent ? "bg-red-500" : "bg-emerald-500"
            }`}
          />
          {llmLoading
            ? "Loading current usage…"
            : `${llmActiveSessions} / ${llmMaxConcurrent} slots in use right now`}
        </div>

        {llmError && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{llmError}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. SYSTEM OVERVIEW & METRICS CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: System Storage */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <HardDrive className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {storageUsedPercent}% Used
            </span>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Total Storage Capacity
            </p>
            {loading ? (
              <div className="mt-2 h-7 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {formatBytes(metrics.totalStorageUsedBytes)}{" "}
                <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                  / {formatBytes(metrics.totalStorageLimitBytes, 0)}
                </span>
              </p>
            )}
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] transition-all duration-500"
              style={{ width: `${storageUsedPercent}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Registered Users */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <Users className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              System Accounts
            </span>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Registered Users
            </p>
            {loading ? (
              <div className="mt-2 h-7 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {metrics.totalUsersCount}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Active system administrators & users
          </p>
        </div>

        {/* Metric 3: Total Files */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <FileText className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              Stored Files
            </span>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Total Files
            </p>
            {loading ? (
              <div className="mt-2 h-7 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {metrics.totalFilesCount}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Indexed across local storage
          </p>
        </div>

        {/* Metric 4: Total Folders */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Folder className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              Directory Tree
            </span>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Total Folders
            </p>
            {loading ? (
              <div className="mt-2 h-7 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {metrics.totalFoldersCount}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Organized workspace folders
          </p>
        </div>
      </div>

      {/* 2. USER MANAGEMENT TABLE & FILTER BAR */}
      <div className="rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-6 md:flex-row md:items-center md:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              User Directory & Storage Quotas
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage accounts, roles, and individual storage allocation limits.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search user or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 transition-colors focus:border-[#0052FF] focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 sm:w-64 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-[#4D7CFF]"
              />
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/50 p-1 dark:border-slate-800 dark:bg-slate-900">
              <button
                onClick={() => setRoleFilter("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${roleFilter === "all"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                  }`}
              >
                All ({users.length})
              </button>
              <button
                onClick={() => setRoleFilter("admin")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${roleFilter === "admin"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                  }`}
              >
                Admins ({users.filter((u) => u.role === "admin").length})
              </button>
              <button
                onClick={() => setRoleFilter("user")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${roleFilter === "user"
                  ? "bg-[#0052FF] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                  }`}
              >
                Users ({users.filter((u) => u.role === "user").length})
              </button>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:bg-slate-950/50 dark:text-slate-500">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Storage Usage / Limit</th>
                <th className="px-6 py-4">Items Created</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800" />
                        <div className="space-y-1.5">
                          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                          <div className="h-3 w-40 rounded bg-slate-200 dark:bg-slate-800" />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <Database className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                    <p className="mt-2 font-medium">No users found matching filter.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((userItem, index) => {
                  const usedPercent = Math.min(
                    100,
                    Math.round((userItem.usedStorageBytes / userItem.storageLimitBytes) * 100)
                  );
                  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

                  return (
                    <tr
                      key={userItem.id}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold shadow-sm ${avatarColor}`}
                          >
                            {userItem.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 dark:text-white">
                              {userItem.fullName}
                            </p>
                            <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                              {userItem.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {userItem.role === "admin" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/50 dark:text-blue-400">
                            <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                            User
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="w-48">
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span className="text-slate-700 dark:text-slate-300">
                              {formatBytes(userItem.usedStorageBytes)}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500">
                              of {formatBytes(userItem.storageLimitBytes, 0)} ({usedPercent}%)
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${usedPercent > 90
                                ? "bg-rose-500"
                                : usedPercent > 70
                                  ? "bg-amber-500"
                                  : "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF]"
                                }`}
                              style={{ width: `${usedPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            {userItem.fileCount} files
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Folder className="h-3.5 w-3.5 text-slate-400" />
                            {userItem.folderCount} folders
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(userItem)}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                            title="Edit User"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setUserToDelete(userItem)}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                            title="Delete User"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. ADD NEW USER MODAL UI */}
      {isAddUserModalOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setIsAddUserModalOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    Add New User Account
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Provision account credentials & storage quota
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddUserModalOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateUser} className="space-y-4 p-6">
              {modalError && (
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-[#0052FF] focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-[#4D7CFF]"
                />
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="sarah@company.local"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-[#0052FF] focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-[#4D7CFF]"
                />
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-[#0052FF] focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-[#4D7CFF]"
                />
              </div>

              {/* Role & Quota Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Role */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    System Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-[#0052FF] focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-[#4D7CFF]"
                  >
                    <option value="user" className="bg-white dark:bg-slate-900">User</option>
                    <option value="admin" className="bg-white dark:bg-slate-900">Administrator</option>
                  </select>
                </div>

                {/* Storage Quota Limit (GB) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Quota Limit (GB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={formData.storageLimitGB}
                    onChange={(e) => setFormData({ ...formData, storageLimitGB: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-[#0052FF] focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-[#4D7CFF]"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. EDIT USER MODAL UI */}
      {userToEdit && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setUserToEdit(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                  <Edit className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    Edit User Details
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {userToEdit.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUserToEdit(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Edit Form */}
            <form onSubmit={handleEditUser} className="space-y-4 p-6">
              {editModalError && (
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{editModalError}</span>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins"
                  value={editFormData.fullName}
                  onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-indigo-400"
                />
              </div>

              {/* Role & Quota Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Role */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    System Role
                  </label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-indigo-400"
                  >
                    <option value="user" className="bg-white dark:bg-slate-900">User</option>
                    <option value="admin" className="bg-white dark:bg-slate-900">Administrator</option>
                  </select>
                </div>

                {/* Storage Quota Limit (GB) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Quota Limit (GB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={editFormData.storageLimitGB}
                    onChange={(e) => setEditFormData({ ...editFormData, storageLimitGB: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setUserToEdit(null)}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isEditing && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. DELETE CONFIRMATION MODAL */}
      {userToDelete && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setUserToDelete(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center sm:p-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-500">
                <AlertTriangle className="h-8 w-8" />
              </div>

              <h3 className="mt-6 text-xl font-bold text-slate-900 dark:text-white">
                Delete User Account?
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Are you sure you want to permanently delete{" "}
                <strong className="text-slate-900 dark:text-white">{userToDelete.email}</strong>?
                This action will wipe their account completely and cannot be undone.
              </p>

              {deleteError && (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  disabled={isDeleting}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 sm:w-1/2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={isDeleting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-red-700 disabled:opacity-50 sm:w-1/2"
                >
                  {isDeleting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}