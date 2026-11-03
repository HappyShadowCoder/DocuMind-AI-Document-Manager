import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import { getAiSettingsForUser, streamChatCompletion } from "@/lib/ai";
import { retrieveGlobalDocumentContext } from "@/lib/pdf-processing";
import { buildGlobalChatMessages } from "@/lib/pdf-chat";
import { tryAcquireLlmSlot, releaseLlmSlot } from "@/lib/llm-concurrency";
import { generatePoliceStatsReport } from "@/lib/police-stats";
import {
  prepareSemanticCacheContext,
  lookupSemanticCache,
  storeSemanticCache,
  streamCachedAnswer,
} from "@/lib/semantic-cache";
import { generateChatTitle } from "@/lib/chat-title";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyJwt(token);
    if (!payload?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    }

    const chatSession = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        entityType: "GLOBAL",
        entityId: payload.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!chatSession) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json({
      session: {
        id: chatSession.id,
        title: chatSession.title,
        createdAt: chatSession.createdAt,
        updatedAt: chatSession.updatedAt,
      },
      messages: chatSession.messages,
    });
  } catch (error) {
    console.error("Failed to fetch global chat history:", error);
    return NextResponse.json({ error: "Failed to fetch chat history." }, { status: 500 });
  }
}

function isDatabaseStatsQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  const patterns = [
    /\b(db|database|system|repository)\s+(stats|statistics|metrics|count|summary|status)\b/,
    /\bhow many\b.*\b(firs?|files?|documents?|records?|cases?)\b.*\b(db|database|system|repository)\b/,
    /\b(total|count of)\b.*\b(firs?|files?|documents?|records?|cases?)\b.*\b(db|database|system|repository)\b/,
    /\b(firs?|files?|documents?)\s+in\s+(the\s+)?(db|database|system|repository)\b/,
    /\bdatabase\s+stats\b/,
    /\bdb\s+stats\b/,
  ];
  return patterns.some((p) => p.test(q));
}

export async function POST(request: NextRequest) {
  let slotReleased = false;
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyJwt(token);
    if (!payload?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const userMessageText = typeof body?.message === "string" ? body.message.trim() : "";

    if (!userMessageText) {
      return NextResponse.json({ error: "Message content cannot be empty." }, { status: 400 });
    }

    const requestedSessionId = typeof body?.sessionId === "string" ? body.sessionId : null;

    let chatSession = requestedSessionId
      ? await prisma.chatSession.findFirst({
          where: {
            id: requestedSessionId,
            entityType: "GLOBAL",
            entityId: payload.id,
          },
        })
      : null;

    if (!chatSession) {
      chatSession = await prisma.chatSession.create({
        data: {
          entityType: "GLOBAL",
          entityId: payload.id,
          title: generateChatTitle(userMessageText),
        },
      });
    } else if (chatSession.title === "New Chat" || !chatSession.title) {
      const derivedTitle = generateChatTitle(userMessageText);
      await prisma.chatSession.update({
        where: { id: chatSession.id },
        data: { title: derivedTitle },
      });
      chatSession.title = derivedTitle;
    }

    await prisma.chatMessage.create({
      data: {
        sessionId: chatSession.id,
        role: "user",
        content: userMessageText,
        sources: [],
      },
    });

    // Handle /stats slash command & police crime statistics queries directly for instant, accurate reporting
    const isStatsSlash =
      userMessageText.toLowerCase().trim() === "/stats" ||
      userMessageText.toLowerCase().trim() === "stats" ||
      /^\/?(police stats|crime stats|fir stats|station stats|stats)$/i.test(userMessageText.trim()) ||
      isDatabaseStatsQuery(userMessageText);

    if (isStatsSlash) {
      const userRecord = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { fullName: true, email: true },
      });

      const { markdown: statsReport } = await generatePoliceStatsReport({
        userId: payload.id,
        role: payload.role as "admin" | "user",
        userName: userRecord?.fullName,
        userEmail: payload.email,
      });

      await prisma.chatMessage.create({
        data: {
          sessionId: chatSession.id,
          role: "assistant",
          content: statsReport,
          sources: [],
        },
      });

      await prisma.chatSession.update({
        where: { id: chatSession.id },
        data: { updatedAt: new Date(), title: chatSession.title === "New Chat" ? "Police Records Stats" : chatSession.title },
      });

      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(statsReport));
            controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Session-Id": chatSession.id,
            "X-Session-Title": encodeURIComponent(chatSession.title === "New Chat" ? "Police Records Stats" : chatSession.title),
          },
        }
      );
    }

    const settings = await getAiSettingsForUser(payload.id);

    // -----------------------------------------------------------------------
    // Semantic cache lookup — done BEFORE acquiring the LLM slot so cache
    // hits never consume concurrency capacity.
    const recentMessagesForCache = await prisma.chatMessage.findMany({
      where: { sessionId: chatSession.id },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { role: true, content: true },
    });
    const priorTurns = Math.max(0, recentMessagesForCache.length - 1);
    const { embedding: questionEmbedding, docFingerprint } =
      await prepareSemanticCacheContext(userMessageText, "GLOBAL", payload.id, settings);
    const cacheHit = await lookupSemanticCache(
      userMessageText,
      questionEmbedding,
      "GLOBAL",
      payload.id,
      docFingerprint,
      settings,
      priorTurns
    );

    if (cacheHit) {
      await prisma.chatMessage.create({
        data: {
          sessionId: chatSession.id,
          role: "assistant",
          content: cacheHit.answerText,
          sources: [...cacheHit.sourcePages, "__CACHED__"],
        },
      });
      await prisma.chatSession.update({
        where: { id: chatSession.id },
        data: { updatedAt: new Date() },
      });

      const encoder = new TextEncoder();
      const cachedAnswer = cacheHit.answerText;
      const cachedSources = cacheHit.sourcePages;
      return new Response(
        new ReadableStream({
          start(controller) {
            streamCachedAnswer(cachedAnswer, controller, encoder);
            if (cachedSources.length > 0 && !cachedAnswer.includes("[[SOURCES:")) {
              controller.enqueue(
                encoder.encode(`\n\n[[SOURCES:${cachedSources.join(",")}]]`)
              );
            }
            controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Session-Id": chatSession.id,
            "X-Session-Title": encodeURIComponent(chatSession.title || "New Chat"),
            "X-Cache": "HIT",
            "Access-Control-Expose-Headers": "X-Cache, X-Session-Id, X-Session-Title",
          },
        }
      );
    }
    // -----------------------------------------------------------------------

    if (!tryAcquireLlmSlot()) {
      return NextResponse.json(
        { error: "We're facing heavy traffic right now. Please try again in a little while." },
        { status: 429 }
      );
    }
    slotReleased = false;

    // Retrieve global document context respecting access level
    const { contextText, sourceFiles, filesInventory, totalAccessibleCount } =
      await retrieveGlobalDocumentContext(payload.id, payload.role, userMessageText, settings);

    if (totalAccessibleCount === 0) {
      if (!slotReleased) {
        releaseLlmSlot();
        slotReleased = true;
      }

      const zeroReply =
        "There are currently **0 FIRs or documents** in the database. All previous documents were deleted or none have been uploaded yet.";

      await prisma.chatMessage.create({
        data: {
          sessionId: chatSession.id,
          role: "assistant",
          content: zeroReply,
          sources: [],
        },
      });

      await prisma.chatSession.update({
        where: { id: chatSession.id },
        data: { updatedAt: new Date() },
      });

      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(zeroReply));
            controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Session-Id": chatSession.id,
          },
        }
      );
    }

    // If targeted search found 0 matching documents (e.g., crimes against women with 0 occurrences),
    // respond instantly with 100% accuracy and zero latency.
    if (contextText === "" && filesInventory.length === 0) {
      if (!slotReleased) {
        releaseLlmSlot();
        slotReleased = true;
      }

      const qLower = userMessageText.toLowerCase();
      let zeroMatchReply = "No documents or FIRs matching your query were found in your permitted documents.";
      if (
        qLower.includes("women") ||
        qLower.includes("female") ||
        qLower.includes("rape") ||
        qLower.includes("pocso") ||
        qLower.includes("dowry") ||
        qLower.includes("molest")
      ) {
        zeroMatchReply =
          "There are currently **0 FIRs or documents** related to crimes against women (e.g. IPC 376, 354, 498A, 509, BNS 64, 74, 85, Dowry Prohibition, or POCSO) in your repository.";
      } else if (qLower.includes("zero fir") || qLower.includes("zero-fir")) {
        zeroMatchReply = "There are currently **0 FIRs** with Zero FIR references found in your permitted documents.";
      }

      await prisma.chatMessage.create({
        data: {
          sessionId: chatSession.id,
          role: "assistant",
          content: zeroMatchReply,
          sources: [],
        },
      });

      await prisma.chatSession.update({
        where: { id: chatSession.id },
        data: { updatedAt: new Date() },
      });

      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(zeroMatchReply));
            controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Session-Id": chatSession.id,
          },
        }
      );
    }

    const recentMessages = recentMessagesForCache;

    const chatMessages = buildGlobalChatMessages(
      totalAccessibleCount,
      filesInventory,
      contextText,
      userMessageText,
      recentMessages,
      payload.role === "admin"
    );

    const encoder = new TextEncoder();
    const abortController = new AbortController();
    let isCancelled = false;

    const handleAbort = () => {
      isCancelled = true;
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
      if (!slotReleased) {
        releaseLlmSlot();
        slotReleased = true;
      }
    };

    if (request.signal.aborted) {
      handleAbort();
    } else {
      request.signal.addEventListener("abort", handleAbort);
    }

    const stream = new ReadableStream({
      async start(controller) {
        let fullAssistantReply = "";

        try {
          const completionStream = streamChatCompletion(chatMessages, settings, abortController.signal);

          for await (const chunk of completionStream) {
            if (isCancelled || abortController.signal.aborted) break;
            fullAssistantReply += chunk;
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              isCancelled = true;
              abortController.abort();
              break;
            }
          }

          if (isCancelled || abortController.signal.aborted) {
            if (fullAssistantReply && !fullAssistantReply.endsWith("*[Response terminated by user]*")) {
              fullAssistantReply += "\n\n*[Response terminated by user]*";
            }
          }

          if (chatSession?.id && fullAssistantReply) {
            // Filter sources so only documents actually cited or discussed in the assistant's reply are saved
            const replyLower = fullAssistantReply.toLowerCase();
            const relevantSources: string[] = [];
            const seenFileIds = new Set<string>();

            // 1. Chunks from sourceFiles whose document name or base name appears in the reply
            for (const s of sourceFiles) {
              if (seenFileIds.has(s.id)) continue;
              const fileName = s.name.toLowerCase();
              const baseName = fileName.replace(/\.pdf$/i, "");
              if (replyLower.includes(fileName) || replyLower.includes(baseName)) {
                relevantSources.push(`${s.id}|${s.name}|${s.pageNumber}`);
                seenFileIds.add(s.id);
              }
            }

            // 2. Also check filesInventory for files mentioned by name or FIR number
            for (const file of filesInventory) {
              if (!file.id || seenFileIds.has(file.id)) continue;
              const fileName = file.fileName.toLowerCase();
              const baseName = fileName.replace(/\.pdf$/i, "");
              const firNum = file.firNumber?.toLowerCase();
              const isMentioned =
                replyLower.includes(fileName) ||
                replyLower.includes(baseName) ||
                (firNum && firNum.length > 3 && replyLower.includes(firNum));

              if (isMentioned) {
                relevantSources.push(`${file.id}|${file.fileName}|1`);
                seenFileIds.add(file.id);
              }
            }

            await prisma.chatMessage.create({
              data: {
                sessionId: chatSession.id,
                role: "assistant",
                content: fullAssistantReply,
                sources: relevantSources,
              },
            });

            await prisma.chatSession.update({
              where: { id: chatSession.id },
              data: { updatedAt: new Date() },
            });

            // Store in semantic cache (fire-and-forget)
            if (!isCancelled) {
              storeSemanticCache(
                userMessageText,
                questionEmbedding,
                fullAssistantReply,
                relevantSources,
                "GLOBAL",
                payload.id,
                docFingerprint,
                settings
              ).catch(() => {});
            }
          }

          if (!isCancelled) {
            try {
              controller.close();
            } catch {
              // Stream already closed or cancelled
            }
          }
        } catch (streamError: any) {
          if (isCancelled || abortController.signal.aborted || streamError?.name === "AbortError") {
            console.log("Global chat stream cancelled/aborted by client.");
          } else {
            console.error("Global chat stream error:", streamError);
            if (!isCancelled) {
              try {
                controller.error(streamError);
              } catch {
                // Stream already closed or cancelled
              }
            }
          }
        } finally {
          request.signal.removeEventListener("abort", handleAbort);
          if (!slotReleased) {
            releaseLlmSlot();
            slotReleased = true;
          }
        }
      },
      cancel() {
        handleAbort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Session-Id": chatSession.id,
        "X-Session-Title": encodeURIComponent(chatSession.title || "New Chat"),
      },
    });
  } catch (error) {
    if (!slotReleased) {
      releaseLlmSlot();
    }
    console.error("Global chat error:", error);
    return NextResponse.json({ error: "Failed to process global chat message." }, { status: 500 });
  }
}
