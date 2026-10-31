// src/lib/semantic-cache.ts
//
// Semantic caching layer for AI chat responses.
//
// Strategy:
//   1. Every cache entry carries a "docFingerprint" — a SHA-256 hash of
//      the file set in scope (IDs + updatedAt). When docs are added or
//      removed the fingerprint changes automatically, making old cache rows
//      stale without any proactive deletion.
//   2. Lookup: exact questionHash match first (O(1)), then pgvector cosine
//      similarity for semantically similar questions.
//   3. Cache hits stream the stored answer back in chunks so the UI
//      experience is identical to a real LLM response.
//   4. The cache is scoped per AI provider (Ollama / OpenAI) so switching
//      providers never returns an answer from the wrong model.
//   5. Conversation-aware: callers pass recentTurns count; if ≥ 2 prior
//      turns exist we skip the cache to avoid context-dependent confusions.

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { embedTexts, type AiSettings } from "@/lib/ai";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Cosine-distance threshold for a semantic cache hit (lower = stricter). */
const SIMILARITY_THRESHOLD =
  parseFloat(process.env.SEMANTIC_CACHE_THRESHOLD || "") || 0.15;

/** Days after which zero-hit entries are purged by cleanupStaleCache(). */
const MAX_AGE_DAYS =
  parseInt(process.env.SEMANTIC_CACHE_MAX_AGE_DAYS || "", 10) || 30;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CacheScopeType = "FILE" | "FOLDER" | "GLOBAL";

export interface CacheHit {
  answerText: string;
  sourcePages: string[];
  entryId: string;
}

// ---------------------------------------------------------------------------
// Fingerprint helpers
// ---------------------------------------------------------------------------

/**
 * Builds a deterministic SHA-256 fingerprint from the current set of files
 * visible in the given scope. Any change in membership or updatedAt makes the
 * hash differ, automatically invalidating old cache rows.
 */
export async function computeDocFingerprint(
  scopeType: CacheScopeType,
  scopeId: string
): Promise<string> {
  let rows: { id: string; updatedAt: Date }[] = [];

  if (scopeType === "FILE") {
    const file = await prisma.file.findUnique({
      where: { id: scopeId },
      select: { id: true, updatedAt: true },
    });
    rows = file ? [file] : [];
  } else if (scopeType === "FOLDER") {
    rows = await prisma.file.findMany({
      where: { folderId: scopeId, processingStatus: "ready" },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" },
    });
  } else {
    // GLOBAL — all files accessible (we use all ready files for simplicity;
    // the per-user access check happens before cache lookup in the route)
    rows = await prisma.file.findMany({
      where: { processingStatus: "ready" },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" },
    });
  }

  const payload = rows.map((r) => `${r.id}:${r.updatedAt.getTime()}`).join("|");
  return createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Core lookup
// ---------------------------------------------------------------------------

/**
 * Attempts to find a cached answer for the given question.
 *
 * Returns a CacheHit if found, or null on a miss.
 *
 * @param question        Raw user question text.
 * @param embedding       Pre-computed 768-d embedding of the question.
 * @param scopeType       FILE | FOLDER | GLOBAL
 * @param scopeId         fileId / folderId / userId
 * @param docFingerprint  Current fingerprint — only entries with a matching
 *                        fingerprint are considered valid.
 * @param settings        AI provider settings (provider must match).
 * @param recentTurns     Number of prior messages in the session. If ≥ 2 we
 *                        bypass the cache because the question may depend on
 *                        conversational context.
 */
export async function lookupSemanticCache(
  question: string,
  embedding: number[],
  scopeType: CacheScopeType,
  scopeId: string,
  docFingerprint: string,
  settings: AiSettings,
  recentTurns = 0
): Promise<CacheHit | null> {
  // Don't serve cached answers for context-dependent follow-up questions
  if (recentTurns >= 2) return null;

  const provider = settings.provider;

  // --- Fast path: exact question hash ---
  const questionHash = createHash("sha256")
    .update(question.toLowerCase().trim())
    .digest("hex");

  const exact = await prisma.$queryRaw<
    Array<{ id: string; answerText: string; sourcePages: string[] }>
  >`
    SELECT id, "answerText", "sourcePages"
    FROM "SemanticCache"
    WHERE "scopeType" = ${scopeType}::"CacheScope"
      AND "scopeId"        = ${scopeId}
      AND "docFingerprint" = ${docFingerprint}
      AND "questionHash"   = ${questionHash}
      AND "aiProvider"     = ${provider}::"AiProvider"
    LIMIT 1
  `;

  if (exact.length > 0) {
    const hit = exact[0];
    // Bump hit count asynchronously (non-blocking)
    prisma.semanticCache
      .update({ where: { id: hit.id }, data: { hitCount: { increment: 1 } } })
      .catch(() => {});
    return { answerText: hit.answerText, sourcePages: hit.sourcePages, entryId: hit.id };
  }

  // --- Semantic path: vector similarity search ---
  const vectorString = `[${embedding.join(",")}]`;

  const similar = await prisma.$queryRaw<
    Array<{
      id: string;
      answerText: string;
      sourcePages: string[];
      distance: number;
    }>
  >`
    SELECT id, "answerText", "sourcePages",
           ("questionEmbedding" <=> ${vectorString}::vector) AS distance
    FROM "SemanticCache"
    WHERE "scopeType"      = ${scopeType}::"CacheScope"
      AND "scopeId"        = ${scopeId}
      AND "docFingerprint" = ${docFingerprint}
      AND "aiProvider"     = ${provider}::"AiProvider"
    ORDER BY "questionEmbedding" <=> ${vectorString}::vector
    LIMIT 1
  `;

  if (similar.length > 0 && similar[0].distance <= SIMILARITY_THRESHOLD) {
    const hit = similar[0];
    prisma.semanticCache
      .update({ where: { id: hit.id }, data: { hitCount: { increment: 1 } } })
      .catch(() => {});
    return { answerText: hit.answerText, sourcePages: hit.sourcePages, entryId: hit.id };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Store a new cache entry
// ---------------------------------------------------------------------------

/**
 * Persists a completed LLM answer into the semantic cache.
 * Should be called after the full response has been streamed/collected.
 */
export async function storeSemanticCache(
  question: string,
  embedding: number[],
  answerText: string,
  sourcePages: string[],
  scopeType: CacheScopeType,
  scopeId: string,
  docFingerprint: string,
  settings: AiSettings
): Promise<void> {
  // Don't cache empty or error answers
  if (!answerText || answerText.length < 10) return;
  // Don't cache terminated answers
  if (answerText.includes("[Response terminated by user]")) return;

  const questionHash = createHash("sha256")
    .update(question.toLowerCase().trim())
    .digest("hex");
  const vectorString = `[${embedding.join(",")}]`;
  const provider = settings.provider;

  try {
    await prisma.$executeRaw`
      INSERT INTO "SemanticCache" (
        "id", "scopeType", "scopeId", "docFingerprint",
        "questionHash", "questionEmbedding",
        "answerText", "sourcePages", "aiProvider",
        "hitCount", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid()::text,
        ${scopeType}::"CacheScope",
        ${scopeId},
        ${docFingerprint},
        ${questionHash},
        ${vectorString}::vector,
        ${answerText},
        ${sourcePages}::text[],
        ${provider}::"AiProvider",
        0,
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
    `;
  } catch (err) {
    // Non-fatal — a cache write failure should never break the chat response
    console.warn("[SemanticCache] Failed to store cache entry:", err);
  }
}

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

/**
 * Deletes all cache entries for a given scope whose docFingerprint no longer
 * matches the current fingerprint.
 *
 * Called fire-and-forget after file upload or deletion so the next request
 * for that scope always computes a fresh fingerprint and finds no stale hits.
 *
 * Because lookup already requires fingerprint equality, calling this is an
 * optimisation (clears disk space) rather than a correctness requirement.
 */
export async function invalidateScopeCache(
  scopeType: CacheScopeType,
  scopeId: string
): Promise<void> {
  try {
    const currentFingerprint = await computeDocFingerprint(scopeType, scopeId);
    await prisma.semanticCache.deleteMany({
      where: {
        scopeType,
        scopeId,
        NOT: { docFingerprint: currentFingerprint },
      },
    });
  } catch (err) {
    console.warn("[SemanticCache] invalidateScopeCache failed:", err);
  }
}

/**
 * Convenience: invalidates FILE, FOLDER (if applicable), and GLOBAL caches
 * when a document is added or removed.
 *
 * @param fileId   The affected file's ID.
 * @param folderId The folder the file belongs to (if any).
 */
export async function invalidateOnDocumentChange(
  fileId: string,
  folderId: string | null
): Promise<void> {
  const tasks: Promise<void>[] = [
    invalidateScopeCache("FILE", fileId),
    // GLOBAL scope — scopeId doesn't matter for fingerprint recompute; we
    // delete ALL global entries since any file change affects global context.
    (async () => {
      try {
        await prisma.semanticCache.deleteMany({ where: { scopeType: "GLOBAL" } });
      } catch (err) {
        console.warn("[SemanticCache] Failed to purge GLOBAL cache:", err);
      }
    })(),
  ];

  if (folderId) {
    tasks.push(invalidateScopeCache("FOLDER", folderId));
  }

  await Promise.allSettled(tasks);
}

// ---------------------------------------------------------------------------
// Cleanup (maintenance)
// ---------------------------------------------------------------------------

/**
 * Removes entries that are stale or have never been used.
 * Safe to call at any time; designed for nightly maintenance.
 */
export async function cleanupStaleCache(): Promise<{ deleted: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

  const result = await prisma.semanticCache.deleteMany({
    where: {
      OR: [
        // Never hit and more than 7 days old
        { hitCount: 0, createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
        // Very old regardless of hit count
        { updatedAt: { lt: cutoff } },
      ],
    },
  });

  return { deleted: result.count };
}

// ---------------------------------------------------------------------------
// Streaming helper
// ---------------------------------------------------------------------------

/**
 * Streams a cached answer through a ReadableStream controller, mimicking
 * the chunked output of the real LLM pipeline so the UI experience is
 * identical (typing animation etc.).
 */
export function streamCachedAnswer(
  answerText: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  chunkSize = 40
): void {
  let offset = 0;
  while (offset < answerText.length) {
    const chunk = answerText.slice(offset, offset + chunkSize);
    controller.enqueue(encoder.encode(chunk));
    offset += chunkSize;
  }
}

// ---------------------------------------------------------------------------
// Embed + fingerprint in one call (used by route handlers)
// ---------------------------------------------------------------------------

/**
 * Computes the question embedding AND the doc fingerprint in parallel,
 * returning both. This saves one round-trip compared to sequential awaits.
 */
export async function prepareSemanticCacheContext(
  question: string,
  scopeType: CacheScopeType,
  scopeId: string,
  settings: AiSettings
): Promise<{ embedding: number[]; docFingerprint: string }> {
  const [embeddings, docFingerprint] = await Promise.all([
    embedTexts([question], settings),
    computeDocFingerprint(scopeType, scopeId),
  ]);
  return { embedding: embeddings[0], docFingerprint };
}

