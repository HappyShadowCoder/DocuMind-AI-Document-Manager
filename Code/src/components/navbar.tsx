"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LogOut,
  Folder,
  Shield,
  Menu,
  X,
  Loader2,
  Sun,
  Moon,
  Laptop,
  User as UserIcon,
  HardDrive,
  Cpu,
  Calendar,
  Key,
  Info,
  BookOpen,
  Search,
} from "lucide-react";

interface UserSession {
  id: string;
  email: string;
  fullName?: string | null;
  role: string;
  storageLimitBytes?: string;
  aiProvider?: string;
  hasOpenAiKey?: boolean;
  createdAt?: string;
  updatedAt?: string;
  mustChangePassword?: boolean;
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setUser(data.user);
        } else {
          if (isMounted) setUser(null);
        }
      } catch (error) {
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setDropdownOpen(false);
      setMobileMenuOpen(false);
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  // Format bytes to readable GB/MB
  const formatStorage = (bytesStr?: string) => {
    if (!bytesStr) return "5 GB";
    const bytes = Number(bytesStr);
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const displayName = user?.fullName?.trim() || user?.email?.split("@")[0] || "User";
  
  // Extract initials (e.g., "Swastiek Kala" -> "SK")
  const userInitials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  if (loading) {
    return (
      <header className="sticky top-0 z-50 h-16 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      </header>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-50 h-16 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          
          {/* Brand / Logo */}
          <Link
            href={user ? "/dashboard" : "/"}
            className="group flex items-center gap-2.5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-transform group-hover:scale-105 group-active:scale-95">
              <Folder className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Office Cloud
              </span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                Storage
              </span>
            </div>
          </Link>

          {/* Right Section */}
          <div className="hidden items-center gap-5 md:flex">
            
            {/* Documentation Link */}
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
            >
              <BookOpen className="h-4 w-4" />
              Docs
            </a>

            {/* Quick Theme Switcher Button */}
            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="group relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform duration-300 dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform duration-300 dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </button>
            )}

            {/* Search Bar */}
            <div className="relative group flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-slate-500 dark:text-slate-400" />
              <input
                type="text"
                placeholder="Search files and folders... (⌘K)"
                className="h-10 w-64 lg:w-80 rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 transition-all placeholder:text-slate-500 hover:bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900 dark:focus:bg-slate-950"
              />
            </div>

            {user ? (
              <div className="flex items-center gap-5">
                {/* Vertical Divider */}
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>

                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-3 rounded-full text-left transition-opacity hover:opacity-80 focus:outline-none"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold tracking-wider text-white shadow-sm">
                      {userInitials}
                    </div>
                    <div className="hidden md:block">
                      <p className="text-sm font-semibold leading-none text-slate-900 dark:text-white">
                        {displayName}
                      </p>
                      <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 capitalize">
                        {user.role}
                      </p>
                    </div>
                  </button>

                  {/* Desktop Dropdown */}
                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-3 w-72 origin-top-right rounded-xl border border-slate-200 bg-white shadow-xl focus:outline-none dark:border-slate-800 dark:bg-slate-900">
                      {/* User Header */}
                      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {displayName}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {user.email}
                        </p>
                        <div className="mt-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                          Role: {user.role}
                        </div>
                      </div>

                      {/* Navigation Links */}
                      <div className="p-1">
                        <Link
                          href="/dashboard"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Folder className="h-4 w-4 text-slate-400" />
                          Dashboard
                        </Link>
                        {user.role === "admin" && (
                          <Link
                            href="/admin"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Shield className="h-4 w-4 text-slate-400" />
                            Admin Settings
                          </Link>
                        )}
                        <button
                          onClick={() => {
                            setDropdownOpen(false);
                            setDetailsModalOpen(true);
                          }}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Info className="h-4 w-4 text-slate-400" />
                          Account Details
                        </button>
                      </div>

                      {/* Theme Switcher Options */}
                      {mounted && (
                        <div className="border-t border-slate-100 p-2 dark:border-slate-800">
                          <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                            Theme
                          </p>
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              onClick={() => setTheme("light")}
                              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                                theme === "light"
                                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
                                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                              }`}
                            >
                              <Sun className="h-3.5 w-3.5" /> Light
                            </button>
                            <button
                              onClick={() => setTheme("dark")}
                              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                                theme === "dark"
                                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
                                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                              }`}
                            >
                              <Moon className="h-3.5 w-3.5" /> Dark
                            </button>
                            <button
                              onClick={() => setTheme("system")}
                              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                                theme === "system"
                                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
                                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                              }`}
                            >
                              <Laptop className="h-3.5 w-3.5" /> System
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Sign Out */}
                      <div className="border-t border-slate-100 p-1 dark:border-slate-800">
                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-950/30"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-500 focus:outline-none dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <span className="sr-only">Open main menu</span>
              {mobileMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu Panel */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 md:hidden">
            <div className="space-y-1 px-4 pb-3 pt-2">
              <a
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Documentation
              </a>
              {user ? (
                <>
                  <div className="flex items-center px-3 py-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-base font-semibold text-white">
                      {userInitials}
                    </div>
                    <div className="ml-3">
                      <div className="text-base font-medium text-slate-800 dark:text-white">
                        {displayName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {user.email}
                      </div>
                    </div>
                  </div>

                  <Link
                    href="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block rounded-md px-3 py-2 text-base font-medium ${
                      pathname === "/dashboard"
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                        : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    Dashboard
                  </Link>
                  {user.role === "admin" && (
                    <Link
                      href="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block rounded-md px-3 py-2 text-base font-medium ${
                        pathname.startsWith("/admin")
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      Admin Panel
                    </Link>
                  )}

                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setDetailsModalOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Info className="h-5 w-5 text-slate-400" />
                    Account Details
                  </button>

                  {/* Theme Switches Mobile */}
                  {mounted && (
                    <div className="mt-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <p className="px-3 pb-2 text-xs font-semibold text-slate-400 uppercase">
                        Theme
                      </p>
                      <div className="grid grid-cols-3 gap-2 px-3">
                        <button
                          onClick={() => setTheme("light")}
                          className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium ${
                            theme === "light"
                              ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          }`}
                        >
                          <Sun className="h-4 w-4" /> Light
                        </button>
                        <button
                          onClick={() => setTheme("dark")}
                          className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium ${
                            theme === "dark"
                              ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          }`}
                        >
                          <Moon className="h-4 w-4" /> Dark
                        </button>
                        <button
                          onClick={() => setTheme("system")}
                          className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium ${
                            theme === "system"
                              ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          }`}
                        >
                          <Laptop className="h-4 w-4" /> System
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-base font-medium text-red-600 hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-900/20"
                    >
                      <LogOut className="h-5 w-5" />
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full rounded-md bg-blue-600 px-3 py-2 text-center text-base font-medium text-white hover:bg-blue-700"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Full Account Details Modal */}
      {detailsModalOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
                  {userInitials}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Account Details
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Non-sensitive profile & system parameters
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                  <UserIcon className="h-4 w-4 text-blue-500" />
                  <span>Full Name</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {user.fullName || "Not provided"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                  <Key className="h-4 w-4 text-blue-500" />
                  <span>Email</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {user.email}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                  <Shield className="h-4 w-4 text-blue-500" />
                  <span>User Role</span>
                </div>
                <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 capitalize dark:bg-blue-900/60 dark:text-blue-300">
                  {user.role}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                  <HardDrive className="h-4 w-4 text-blue-500" />
                  <span>Storage Quota</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {formatStorage(user.storageLimitBytes)}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                  <Cpu className="h-4 w-4 text-blue-500" />
                  <span>AI Engine</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 uppercase dark:text-white">
                  {user.aiProvider || "Ollama"}
                </span>
              </div>

              {user.createdAt && (
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <span>Account Created</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setDetailsModalOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}