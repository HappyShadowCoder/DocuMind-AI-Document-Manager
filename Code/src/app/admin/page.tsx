"use client";

import React, { useEffect, useState } from "react";
import AdminPanel from "@/components/admin/admin-panel";
import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";

interface CurrentUser {
  id: string;
  email: string;
  role: string;
}

export default function AdminPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdminAuth() {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    checkAdminAuth();
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-white">
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : !user ? (
          <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
              Authentication Required
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Please sign in to access the system administration panel.
            </p>
            <div className="mt-6">
              <Link
                href="/login"
                className="inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700"
              >
                Sign In
              </Link>
            </div>
          </div>
        ) : user.role !== "admin" ? (
          <div className="mx-auto max-w-md rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-lg dark:border-rose-900/50 dark:bg-rose-950/40">
            <ShieldAlert className="mx-auto h-12 w-12 text-rose-500" />
            <h2 className="mt-4 text-xl font-bold text-rose-900 dark:text-rose-200">
              Access Restricted
            </h2>
            <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
              You do not have administrator permissions to view this panel.
            </p>
            <div className="mt-6">
              <Link
                href="/dashboard"
                className="inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <AdminPanel />
        )}
      </main>
    </div>
  );
}
