"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Inter, Calistoga, JetBrains_Mono } from "next/font/google";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { MagneticButton } from "../../../components/MagneticButton";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const calistoga = Calistoga({ weight: "400", subsets: ["latin"], variable: "--font-calistoga" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const easeOut = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: easeOut } },
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Incorrect email or password.");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={`${inter.variable} ${calistoga.variable} ${jetbrains.variable} font-sans relative min-h-screen w-full overflow-hidden bg-[#FAFAFA] text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-white`}>
      {/* Ambient glow, consistent with the home page hero */}
      <motion.div
        animate={{ opacity: [0.04, 0.08, 0.04] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute top-[-10%] left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#0052FF] blur-[150px] dark:opacity-[0.08]"
      />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-16">
        {/* Logo, links back to marketing home */}
        <Link href="/" className="mb-10 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 dark:bg-white">
            <div className="h-3 w-3 rounded-full bg-[#FAFAFA] dark:bg-slate-950" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">
            Knowlege Spatial Doc Manger
          </span>
        </Link>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/80 p-8 shadow-xl backdrop-blur-md transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900/70 md:p-10"
        >
          <motion.div variants={fadeInUp} className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#0052FF]/30 bg-[#0052FF]/5 px-4 py-1.5 dark:bg-[#0052FF]/10">
              <ShieldCheck className="h-3.5 w-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#0052FF] dark:text-[#4D7CFF]">
                Invite-only workspace
              </span>
            </div>
            <h1 className="font-display text-3xl leading-tight tracking-[-0.01em] md:text-4xl">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Sign in with the credentials your admin provided.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <motion.div variants={fadeInUp}>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </motion.div>

            {/* Password */}
            <motion.div variants={fadeInUp}>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs font-medium text-[#0052FF] transition-colors hover:text-[#4D7CFF] dark:text-[#4D7CFF]">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-11 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-[#0052FF] focus:ring-4 focus:ring-[#0052FF]/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
                <motion.button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  whileTap={{ scale: 0.9 }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={showPassword ? "hide" : "show"}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.15 }}
                      className="flex"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>

            {/* Remember me */}
            <motion.label variants={fadeInUp} className="flex select-none items-center gap-2.5 text-sm text-slate-500 dark:text-slate-400">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 transition-colors checked:border-[#0052FF] checked:bg-[#0052FF] dark:border-slate-700"
                />
                <motion.svg
                  initial={false}
                  animate={{ opacity: remember ? 1 : 0, scale: remember ? 1 : 0.5 }}
                  transition={{ duration: 0.15 }}
                  className="pointer-events-none absolute h-3 w-3 text-white"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path d="M2 6L4.8 8.8L10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              </span>
              Keep me signed in
            </motion.label>

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 overflow-hidden rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div variants={fadeInUp}>
              <MagneticButton type="submit" variant="primary" disabled={isSubmitting} className="w-full">
                <AnimatePresence mode="wait" initial={false}>
                  {isSubmitting ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in…
                    </motion.span>
                  ) : (
                    <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      Sign in
                    </motion.span>
                  )}
                </AnimatePresence>
              </MagneticButton>
            </motion.div>
          </form>

          {/* No sign-up path — accounts are admin-provisioned only */}
          <motion.p variants={fadeInUp} className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Don't have an account? Ask your workspace admin to create one for you.
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}