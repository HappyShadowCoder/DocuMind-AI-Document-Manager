"use client";

import React, { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

type MagneticButtonProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  onClick?: () => void;
  strength?: number;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

/**
 * A button that gently pulls toward the cursor, shows a light sweep on hover,
 * and gives a satisfying spring-based press. Falls back to a simple hover/tap
 * state when the user prefers reduced motion.
 */
export function MagneticButton({
  children,
  variant = "primary",
  className = "",
  onClick,
  strength = 0.35,
  type = "button",
  disabled = false,
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 200, damping: 15, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 200, damping: 15, mass: 0.4 });

  // Light sweep follows cursor position across the button face
  const sweepX = useMotionValue(50);
  const sweepY = useMotionValue(50);

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    if (prefersReducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    x.set((relX - rect.width / 2) * strength);
    y.set((relY - rect.height / 2) * strength);

    sweepX.set((relX / rect.width) * 100);
    sweepY.set((relY / rect.height) * 100);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  }

  const base =
    "group relative inline-flex h-14 items-center justify-center gap-2 overflow-hidden rounded-xl px-8 font-medium select-none";

  const styles =
    variant === "primary"
      ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-sm"
      : "border border-slate-200 dark:border-slate-800 bg-transparent text-slate-900 dark:text-white";

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{ x: springX, y: springY }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={`${base} ${styles} ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${className}`}
    >
      {/* Cursor-tracking light sweep, primary variant only */}
      {variant === "primary" && !prefersReducedMotion && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.25 }}
          style={{
            background: `radial-gradient(120px circle at ${sweepX}% ${sweepY}%, rgba(255,255,255,0.35), transparent 70%)`,
          }}
        />
      )}

      {/* Ambient glow ring on hover, secondary variant */}
      {variant === "secondary" && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl"
          animate={{
            boxShadow: isHovered
              ? "0 8px 24px rgba(0,82,255,0.18), inset 0 0 0 1px rgba(0,82,255,0.3)"
              : "0 0px 0px rgba(0,82,255,0), inset 0 0 0 1px rgba(0,0,0,0)",
          }}
          transition={{ duration: 0.25 }}
        />
      )}

      <motion.span
        className="relative z-10 flex items-center gap-2"
        animate={{ y: isHovered && !prefersReducedMotion ? -1 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {children}
      </motion.span>
    </motion.button>
  );
}