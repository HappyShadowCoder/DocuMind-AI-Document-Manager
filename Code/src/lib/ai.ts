// lib/ai.ts
//
// 100% Offline, Local-First AI Engine for DocuMind:
// Powered exclusively by Ollama (nomic-embed-text for embeddings + llama3.1:8b for chat & analysis).
// Zero cloud calls, zero external API keys, 100% private and air-gapped.

export const EMBEDDING_DIM = 768;

export type AiProviderName = "ollama" | "openai";

export interface AiSettings {
  provider: "ollama";
  openAiApiKey?: string | null;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b";

// ---------------------------------------------------------------------------
// Settings resolution (Offline Ollama only)
// ---------------------------------------------------------------------------

/**
 * Returns the offline local Ollama engine configuration.
 * All external cloud integrations have been disabled for complete on-premise privacy.
 */
export async function getAiSettingsForUser(_userId?: string): Promise<AiSettings> {
  return { provider: "ollama", openAiApiKey: null };
}

// ---------------------------------------------------------------------------
// Small concurrency limiter
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
// Embeddings (Offline Local Ollama)
// ---------------------------------------------------------------------------

export async function embedTexts(texts: string[], _settings?: AiSettings): Promise<number[][]> {
  if (texts.length === 0) return [];
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
        `Failed to connect to local Ollama at ${OLLAMA_BASE_URL}: ${error?.message || "Connection refused"}. Make sure Ollama is running locally (e.g. 'ollama run ${OLLAMA_CHAT_MODEL}').`
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

// ---------------------------------------------------------------------------
// Chat completion (Offline Local Ollama Streaming)
// ---------------------------------------------------------------------------

export async function* streamChatCompletion(
  messages: ChatTurn[],
  _settings?: AiSettings,
  signal?: AbortSignal
): AsyncGenerator<string> {
  yield* streamOllamaChat(messages, signal);
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
      `Failed to connect to local Ollama at ${OLLAMA_BASE_URL}: ${error?.message || "Connection refused"}. Make sure Ollama is running locally on your machine.`
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

/** Convenience wrapper for non-streaming use (e.g. summarization). */
export async function completeChat(messages: ChatTurn[], settings?: AiSettings): Promise<string> {
  let full = "";
  for await (const delta of streamChatCompletion(messages, settings)) {
    full += delta;
  }
  return full.trim();
}
