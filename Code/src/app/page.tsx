"use client";

import React, { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { Inter, Calistoga, JetBrains_Mono } from "next/font/google";
import { ArrowRight, FileText, Lock, Share2, Search, Sparkles } from "lucide-react";
import { MagneticButton } from "../components/MagneticButton";

// Font Setup
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const calistoga = Calistoga({ weight: "400", subsets: ["latin"], variable: "--font-calistoga" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

// Animation Primitives
const easeOut = [0.16, 1, 0.3, 1] as const;

const fadeInUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeOut } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: easeOut } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const floatAnimation = {
  y: ["-10px", "10px", "-10px"],
  transition: { duration: 5, ease: "easeInOut" as const, repeat: Infinity },
};

export default function DocumentManagementHome() {
  const prefersReducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);

  // Subtle parallax as the hero scrolls out of view
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroTextY = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : -60]);
  const heroArtY = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : -120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.3]);

  return (
    <div className={`${inter.variable} ${calistoga.variable} ${jetbrains.variable} font-sans bg-[#FAFAFA] text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-white min-h-screen overflow-hidden`}>

      {/* Scroll progress indicator */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] origin-left z-[60]"
        style={{ scaleX: useScroll().scrollYProgress }}
      />

      {/* 1. HERO SECTION */}
      <section
        ref={heroRef}
        className="relative w-full max-w-6xl mx-auto px-6 pt-12 pb-28 md:pt-16 md:pb-32"
      >
        {/* Ambient Gradient Glow */}
        <motion.div
          animate={prefersReducedMotion ? {} : { opacity: [0.04, 0.08, 0.04] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#0052FF] dark:opacity-[0.08] blur-[150px] rounded-full pointer-events-none"
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-8 items-center">

          {/* Left: Content */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            style={{ y: heroTextY }}
            className="relative z-10"
          >
            <motion.div
              variants={fadeInUp}
              whileHover={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="inline-flex items-center gap-3 rounded-full border border-[#0052FF]/30 bg-[#0052FF]/5 dark:bg-[#0052FF]/10 px-5 py-2 mb-8 cursor-default"
            >
              <motion.span
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="h-2 w-2 rounded-full bg-[#0052FF]"
              />
              <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#0052FF] dark:text-[#4D7CFF]">
                Enterprise Ready
              </span>
              <motion.span
                animate={{ rotate: [0, 15, 0, -15, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#4D7CFF]" />
              </motion.span>
            </motion.div>

            <motion.h1 variants={fadeInUp} className="font-display text-[2.75rem] md:text-6xl lg:text-[5.25rem] leading-[1.05] tracking-[-0.02em] mb-6">
              Documents organized. <br />
              <span className="relative inline-block">
                Chaos
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: 0.9, ease: easeOut }}
                  style={{ transformOrigin: "left" }}
                  className="absolute bottom-[-0.25rem] md:bottom-[-0.5rem] left-0 h-3 md:h-4 w-full rounded-sm bg-gradient-to-r from-[#0052FF]/15 to-[#4D7CFF]/10 dark:from-[#0052FF]/30 dark:to-[#4D7CFF]/20"
                />
              </span>{" "}
              <motion.span
                initial={{ backgroundPosition: "0% 50%" }}
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                className="bg-clip-text text-transparent bg-gradient-to-r from-[#0052FF] via-[#4D7CFF] to-[#0052FF] bg-[length:200%_auto]"
              >
                eliminated.
              </motion.span>
            </motion.h1>

            <motion.p variants={fadeInUp} className="text-slate-500 dark:text-slate-400 text-lg md:text-xl leading-relaxed max-w-lg mb-10 transition-colors">
              The minimalist workspace for your team's most critical files. Secure, lightning-fast, and designed to stay entirely out of your way.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4">
              <MagneticButton variant="primary">
                Start Now
                <motion.span
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowRight className="w-4 h-4" />
                </motion.span>
              </MagneticButton>
            </motion.div>
          </motion.div>

          {/* Right: Abstract Graphic */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            style={{ y: heroArtY, opacity: heroOpacity }}
            className="relative hidden md:block h-[500px] w-full"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-dashed border-slate-300 dark:border-slate-700 pointer-events-none transition-colors duration-300"
            />

            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] rounded-full border border-dotted border-[#0052FF]/20 pointer-events-none"
            />

            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] pointer-events-none"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#0052FF] shadow-[0_0_12px_rgba(0,82,255,0.7)]" />
            </motion.div>

            {/* Floating Document Cards */}
            <motion.div
              initial={{ opacity: 0, x: 30, rotate: 6 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: easeOut }}
              whileHover={{ scale: 1.03, rotate: -1 }}
              className="absolute top-[10%] right-[20%] w-64 z-20"
            >
              <motion.div
                animate={floatAnimation}
                whileHover={{ transition: { duration: 0.3 } }}
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 transition-colors duration-300 hover:shadow-2xl hover:border-[#0052FF]/30"
              >
                <motion.div
                  whileHover={{ rotate: -8, scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                  className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] flex items-center justify-center mb-4"
                >
                  <FileText className="text-white w-5 h-5" />
                </motion.div>
                <div className="w-3/4 h-2 bg-slate-100 dark:bg-slate-800 rounded-full mb-3 transition-colors" />
                <div className="w-1/2 h-2 bg-slate-100 dark:bg-slate-800 rounded-full mb-6 transition-colors" />
                <div className="w-full h-20 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 transition-colors" />
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -30, rotate: -6 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              transition={{ duration: 0.8, delay: 0.6, ease: easeOut }}
              whileHover={{ scale: 1.03, rotate: 1 }}
              className="absolute bottom-[15%] left-[10%] w-56 z-10"
            >
              <motion.div
                animate={{ ...floatAnimation, transition: { ...floatAnimation.transition, delay: 1, duration: 6 } }}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 shadow-lg border border-slate-200 dark:border-slate-800 transition-colors duration-300 hover:shadow-xl hover:border-emerald-400/30"
              >
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    whileHover={{ rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 0.5 }}
                    className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center transition-colors"
                  >
                    <Lock className="text-emerald-600 dark:text-emerald-400 w-4 h-4" />
                  </motion.div>
                  <div className="w-20 h-2 bg-slate-100 dark:bg-slate-800 rounded-full transition-colors" />
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full mb-2 transition-colors" />
                <div className="w-5/6 h-2 bg-slate-100 dark:bg-slate-800 rounded-full transition-colors" />
              </motion.div>
            </motion.div>
          </motion.div>

        </div>
      </section>

      {/* 2. INVERTED FEATURES SECTION */}
      <section className="relative w-full bg-slate-900 text-white py-28 md:py-44 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

        <div className="relative z-10 max-w-6xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: false, amount: 0.15, margin: "-60px" }}
            variants={stagger}
            className="flex flex-col items-center text-center mb-20"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-3 rounded-full border border-slate-700 bg-slate-800/50 px-5 py-2 mb-6">
              <span className="font-mono text-xs uppercase tracking-[0.15em] text-slate-300">
                Core Capabilities
              </span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="font-display text-3xl md:text-5xl leading-[1.15] max-w-2xl mb-6">
              Everything you need. <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#0052FF] to-[#4D7CFF]">Nothing you don't.</span>
            </motion.h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Search, title: "Deep Search", desc: "Find any document instantly with full-text indexing and optical character recognition." },
              { icon: Lock, title: "Bank-Grade Security", desc: "End-to-end encryption ensures your sensitive intellectual property remains completely private." },
              { icon: Share2, title: "Granular Sharing", desc: "Control exactly who sees what with time-limited links and role-based access permissions." }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, amount: 0.15 }}
                transition={{ duration: 0.55, delay: i * 0.12, ease: easeOut }}
                whileHover={{ y: -6 }}
                className="group relative p-8 rounded-2xl bg-slate-800/50 border border-slate-700 hover:bg-slate-800 transition-colors duration-300"
              >
                <motion.div
                  aria-hidden
                  className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: "linear-gradient(135deg, rgba(0,82,255,0.15), transparent 60%)" }}
                />

                <motion.div
                  whileHover={{ rotate: 8, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                  className="relative w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center mb-6 group-hover:border-[#0052FF]/50 transition-colors"
                >
                  <feature.icon className="text-[#0052FF] w-6 h-6" />
                </motion.div>
                <h3 className="relative font-sans font-semibold text-xl mb-3">{feature.title}</h3>
                <p className="relative text-slate-400 leading-relaxed">{feature.desc}</p>

                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  className="relative mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#4D7CFF] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                >
                  Learn more <ArrowRight className="w-3.5 h-3.5" />
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. FINAL CTA */}
      <section className="relative w-full max-w-4xl mx-auto px-6 py-28 md:py-44 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.5 }}
          variants={stagger}
        >
          <motion.h2 variants={scaleIn} className="font-display text-4xl md:text-5xl mb-6">
            Ready to organize your workflow?
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-slate-500 dark:text-slate-400 text-lg mb-10 max-w-xl mx-auto transition-colors">
            Join thousands of teams who have already switched to a faster, cleaner document management experience.
          </motion.p>
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <div className="relative inline-block">
              <motion.span
                aria-hidden
                animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 rounded-xl bg-[#0052FF]/30 blur-md"
              />
              <MagneticButton variant="primary" className="px-10">
                Create your workspace
              </MagneticButton>
            </div>
          </motion.div>
        </motion.div>
      </section>

    </div>
  );
}