// src/lib/llm-concurrency.ts
//
// Tracks how many chat requests are currently being answered by the local
// LLM (Ollama, running on the host laptop) at the same time, and enforces
// an admin-configurable ceiling. When the ceiling is hit, callers should
// reject the request with a "heavy traffic" message instead of queuing it
// indefinitely.
//
// The limit is persisted to a small JSON file on disk so it survives
// server restarts. If you'd rather store it in the database (e.g. next to
// the settings read by getAiSettingsForUser), swap readConfig/writeConfig
// below for prisma calls — the rest of this module doesn't care where the
// number comes from.

import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "data", "llm-concurrency.json");
const DEFAULT_MAX_CONCURRENT = 3;

interface ConcurrencyConfig {
  maxConcurrent: number;
}

// In-memory count of requests currently occupying a "slot". This resets on
// server restart, which is fine — any in-flight requests reset too.
let activeCount = 0;

let cachedConfig: ConcurrencyConfig | null = null;

function readConfig(): ConcurrencyConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const value = Number(parsed?.maxConcurrent);
    cachedConfig = {
      maxConcurrent: Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_CONCURRENT,
    };
  } catch {
    cachedConfig = { maxConcurrent: DEFAULT_MAX_CONCURRENT };
  }
  return cachedConfig;
}

function writeConfig(config: ConcurrencyConfig) {
  cachedConfig = config;
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist LLM concurrency setting:", err);
  }
}

/** How many concurrent chat requests the admin allows right now. */
export function getMaxConcurrentUsers(): number {
  return readConfig().maxConcurrent;
}

/** Admin panel calls this to change the concurrent-user limit. */
export function setMaxConcurrentUsers(value: number): number {
  const safeValue = Math.max(1, Math.floor(value) || DEFAULT_MAX_CONCURRENT);
  writeConfig({ maxConcurrent: safeValue });
  return safeValue;
}

/** How many requests are currently occupying a slot (for the admin panel to display). */
export function getActiveLlmSessions(): number {
  return activeCount;
}

/**
 * Attempts to reserve a slot for a new chat request.
 * Returns true if a slot was reserved (caller MUST call releaseLlmSlot()
 * exactly once when the request finishes, succeeds, or fails).
 * Returns false if the server is at capacity — caller should respond with
 * a "heavy traffic" message and NOT proceed to call the model.
 */
export function tryAcquireLlmSlot(): boolean {
  const max = getMaxConcurrentUsers();
  if (activeCount >= max) return false;
  activeCount += 1;
  return true;
}

/** Frees up a slot previously reserved by tryAcquireLlmSlot(). Safe to call at most once per acquired slot. */
export function releaseLlmSlot(): void {
  activeCount = Math.max(0, activeCount - 1);
}