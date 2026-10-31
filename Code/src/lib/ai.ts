// lib/ai.ts
//
// Central place that talks to whichever AI engine the user has selected:
//   - "ollama" (default, local, offline) — nomic-embed-text + llama3/mistral
//   - "openai" (cloud, opt-in)           — text-embedding-3-small + gpt-4o-mini
//
// Both providers are normalized to the SAME embedding dimensionality (768) so
// a single `vector(768)` column in Postgres/pgvector works for either engine.

import { prisma } from "@/lib/prisma";

export const EMBEDDING_DIM = 768;

export type AiProviderName = "ollama" | "openai";

export interface AiSettings {
  provider: AiProviderName;
  openAiApiKey?: string | null;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b";

const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

// ---------------------------------------------------------------------------
// Settings resolution
// ---------------------------------------------------------------------------

/**
 * Loads the given user's AI engine preference from the database and
 * validates it.
 */
export async function getAiSettingsForUser(userId: string): Promise<AiSettings> {
  if (!userId) {
    return { provider: "ollama", openAiApiKey: null };
  }

  try {
    const user = (await prisma.user.findUnique({
      where: { id: userId },
    })) as Record<string, unknown> | null;

    if (!user) {
      return { provider: "ollama", openAiApiKey: null };
    }

    const aiProvider = (user.aiProvider as AiProviderName) || "ollama";
    const openAiApiKey =
      (user.openAiApiKey as string | null) || process.env.OPENAI_API_KEY || null;

    if (aiProvider === "openai" && !openAiApiKey) {
      throw new Error(
        "Cloud (OpenAI) is selected in Settings but no OpenAI API key has been saved. Add a key in Settings or switch back to Offline (Ollama)."
      );
    }

    return { provider: aiProvider, openAiApiKey };
  } catch (err: any) {
    if (err.message?.includes("OpenAI API key")) throw err;
    return { provider: "ollama", openAiApiKey: null };
  }
}

// ---------------------------------------------------------------------------
// Small concurrency limiter (no extra dependency)
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

export async function embedTexts(texts: string[], settings: AiSettings): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (settings.provider === "openai") {
    return embedWithOpenAI(texts, settings.openAiApiKey!);
  }
  return embedWithOllama(texts);
}

async function embedWithOllama(texts: string[]): Promise<number[][]> {
  return mapWithConcurrency(texts, 3, async (text) => {
    let res: Response;
    try {
      res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
      });
    } catch (error: any) {
      throw new Error(
        `Failed to connect to Ollama at ${OLLAMA_BASE_URL}: ${error?.message || "Connection refused"}. Make sure Ollama is running on your host machine.`
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama embeddings request failed (${res.status}): ${body || res.statusText}`);
    }

    const data = (await res.json()) as { embedding?: number[] };
    if (!data.embedding || data.embedding.length === 0) {
      throw new Error("Ollama returned an empty embedding. Is 'nomic-embed-text' pulled? Run: ollama pull nomic-embed-text");
    }
    return data.embedding;
  });
}

async function embedWithOpenAI(texts: string[], apiKey: string): Promise<number[][]> {
  const BATCH_SIZE = 96;
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  const results: number[][] = [];
  for (const batch of batches) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBED_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIM,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings request failed (${res.status}): ${body || res.statusText}`);
    }

    const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    const ordered = [...data.data].sort((a, b) => a.index - b.index);
    for (const item of ordered) results.push(item.embedding);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Chat completion (streaming)
// ---------------------------------------------------------------------------

export async function* streamChatCompletion(
  messages: ChatTurn[],
  settings: AiSettings,
  signal?: AbortSignal
): AsyncGenerator<string> {
  if (settings.provider === "openai") {
    yield* streamOpenAiChat(messages, settings.openAiApiKey!, signal);
  } else {
    yield* streamOllamaChat(messages, signal);
  }
}

async function* streamOllamaChat(messages: ChatTurn[], signal?: AbortSignal): AsyncGenerator<string> {
  if (signal?.aborted) return;
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        messages,
        stream: true,
        keep_alive: "24h",
        options: {
          temperature: 0.3,
          repeat_penalty: 1.18,
          repeat_last_n: 64,
          top_p: 0.9,
          num_ctx: 8192,
        },
      }),
    });
  } catch (error: any) {
    if (signal?.aborted || error?.name === "AbortError") {
      return;
    }
    throw new Error(
      `Failed to connect to Ollama at ${OLLAMA_BASE_URL}: ${error?.message || "Connection refused"}. Make sure Ollama is running on your host machine.`
    );
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama chat request failed (${res.status}): ${body || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullStreamed = "";

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        if (signal?.aborted) {
          await reader.cancel().catch(() => {});
          return;
        }

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;

        let parsed: { message?: { content?: string }; done?: boolean };
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        if (parsed.message?.content) {
          const chunk = parsed.message.content;
          fullStreamed += chunk;

          // Repetition loop detector: only stop if natural language text repeats 3 times (ignore table dashes/separators)
          if (fullStreamed.length > 200) {
            const tail = fullStreamed.slice(-300);
            const match = tail.match(/([^\n]{30,}?)\1\1/);
            if (match && /[a-zA-Z]{4,}/.test(match[1]) && !/^[|\-:\s]+$/.test(match[1])) {
              console.warn("Repetition loop detected in Ollama stream, gracefully terminating generation.");
              await reader.cancel().catch(() => {});
              return;
            }
          }

          yield chunk;
        }
        if (parsed.done) return;
      }
    }
  } catch (err: any) {
    if (signal?.aborted || err?.name === "AbortError") {
      return;
    }
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

async function* streamOpenAiChat(
  messages: ChatTurn[],
  apiKey: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  if (signal?.aborted) return;
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model: OPENAI_CHAT_MODEL,
        messages,
        stream: true,
        temperature: 0.2,
      }),
    });
  } catch (error: any) {
    if (signal?.aborted || error?.name === "AbortError") {
      return;
    }
    throw error;
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let errorMsg = `OpenAI chat request failed (${res.status}): ${body || res.statusText}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) {
        errorMsg = `OpenAI error (${res.status}): ${parsed.error.message}`;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        if (signal?.aborted) {
          await reader.cancel().catch(() => {});
          return;
        }

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        if (!payload) continue;

        try {
          const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Ignore malformed keep-alive lines.
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted || err?.name === "AbortError") {
      return;
    }
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

/** Convenience wrapper for non-streaming use (e.g. summarization). */
export async function completeChat(messages: ChatTurn[], settings: AiSettings): Promise<string> {
  let full = "";
  for await (const delta of streamChatCompletion(messages, settings)) {
    full += delta;
  }
  return full.trim();
}