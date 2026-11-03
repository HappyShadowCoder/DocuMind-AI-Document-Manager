// src/app/api/files/[id]/chat/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import { getAiSettingsForUser, streamChatCompletion } from "@/lib/ai";
import { retrieveDocumentContext } from "@/lib/pdf-processing";
import { appendSourcePages, buildPdfChatMessages } from "@/lib/pdf-chat";
import { tryAcquireLlmSlot, releaseLlmSlot } from "@/lib/llm-concurrency";
import {
  prepareSemanticCacheContext,
  lookupSemanticCache,
  storeSemanticCache,
  streamCachedAnswer,
} from "@/lib/semantic-cache";

function sanitizeRecord<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) => (typeof value === "bigint" ? Number(value) : value))
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: fileId } = await context.params;

    if (!fileId) {
      return NextResponse.json({ error: "Missing route parameter: id" }, { status: 400 });
    }

    const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
    if (!fileRecord) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    // Block non-admin users from accessing admin-only shared file chats
    if (fileRecord.shared && fileRecord.accessLevel === "admin") {
      const token = _request.cookies.get("auth_token")?.value;
      const payload = token ? await verifyJwt(token) : null;
      const isOwner = payload?.id === fileRecord.ownerId;
      const isAdmin = payload?.role === "admin";
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Forbidden: You do not have permission to access this file." }, { status: 403 });
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where: { fileId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      {
        fileName: fileRecord.name,
        messages: sanitizeRecord(messages),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("=== GET CHAT ROUTE ERROR ===", error);
    return NextResponse.json(
      {
        error: "Failed to fetch chat history.",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let slotReleased = true; // flips to false only once a slot is actually acquired below
  const releaseSlotOnce = () => {
    if (!slotReleased) {
      slotReleased = true;
      releaseLlmSlot();
    }
  };

  try {
    const { id: fileId } = await context.params;

    if (!fileId) {
      return NextResponse.json({ error: "Missing route parameter: id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const userMessageText = body?.message;

    if (!userMessageText || typeof userMessageText !== "string") {
      return NextResponse.json(
        { error: "Message string is required in request body." },
        { status: 400 }
      );
    }

    const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
    if (!fileRecord) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const token = request.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJwt(token) : null;

    // Block non-admin users from chatting with admin-only shared files
    if (fileRecord.shared && fileRecord.accessLevel === "admin") {
      const isOwner = payload?.id === fileRecord.ownerId;
      const isAdmin = payload?.role === "admin";
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Forbidden: You do not have permission to access this file." }, { status: 403 });
      }
    }

    if (fileRecord.processingStatus !== "ready") {
      return NextResponse.json(
        { error: "This PDF is still being processed. Please wait and try again." },
        { status: 409 }
      );
    }

    // Enforce the admin-configured limit on how many people can use the
    // local LLM at the same time. Do this right before the expensive work
    // (context retrieval + model call) so cheap validation above still runs
    // even when the server is busy.
    if (!tryAcquireLlmSlot()) {
      return NextResponse.json(
        { error: "We're facing heavy traffic right now. Please try again in a little while." },
        { status: 429 }
      );
    }
    slotReleased = false;

    const requestedSessionId = typeof body?.sessionId === "string" ? body.sessionId : null;

    let chatSession = requestedSessionId
      ? await prisma.chatSession.findFirst({
          where: {
            id: requestedSessionId,
            entityType: "FILE",
            entityId: fileId,
          },
        })
      : null;

function generateChatTitle(query: string): string {
  let clean = query.replace(/[#*`_]/g, "").replace(/\s+/g, " ").trim();
  clean = clean.replace(
    /^(can you please|could you please|please|can you|could you|tell me about|what is|show me|find all|list all|give me|check)\s+/i,
    ""
  );
  if (!clean) return "New Chat";
  const capped = clean.charAt(0).toUpperCase() + clean.slice(1);
  if (capped.length <= 36) return capped;
  const truncated = capped.slice(0, 36);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
}

    if (!chatSession) {
      chatSession = await prisma.chatSession.create({
        data: {
          entityType: "FILE",
          entityId: fileId,
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
        fileId,
        role: "user",
        content: userMessageText,
        sources: [],
      },
    });

    const recentMessages = await prisma.chatMessage.findMany({
      where: { sessionId: chatSession.id },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { role: true, content: true },
    });

    const [docMeta, pageAggregate] = await Promise.all([
      prisma.documentMetadata.findUnique({ where: { fileId } }),
      prisma.documentChunk.aggregate({
        where: { fileId },
        _max: { pageNumber: true },
      }),
    ]);

    const totalPagesCount = pageAggregate._max.pageNumber || 1;
    const actsAndSections = Array.isArray(docMeta?.actsAndSections)
      ? (docMeta.actsAndSections as string[])
      : null;

    const fileMetaContext = {
      fileName: fileRecord.name,
      totalPagesCount,
      firNumber: docMeta?.firNumber,
      firDate: docMeta?.firDate ? docMeta.firDate.toISOString().split("T")[0] : null,
      district: docMeta?.district,
      subDivision: docMeta?.subDivision,
      policeStation: docMeta?.policeStation,
      propertyLoss: docMeta?.propertyLoss,
      actsAndSections,
      zeroFirReference: docMeta?.zeroFirReference,
    };

    const chatUserId = (payload?.id as string) || fileRecord.ownerId;
    const settings = await getAiSettingsForUser(chatUserId);

    // -----------------------------------------------------------------------
    // Semantic cache lookup
    // Prior turns = recentMessages minus the user message we just saved
    const priorTurns = Math.max(0, recentMessages.length - 1);
    const { embedding: questionEmbedding, docFingerprint } =
      await prepareSemanticCacheContext(userMessageText, "FILE", fileId, settings);
    const cacheHit = await lookupSemanticCache(
      userMessageText,
      questionEmbedding,
      "FILE",
      fileId,
      docFingerprint,
      settings,
      priorTurns
    );

    if (cacheHit) {
      // Save assistant message from cache to session history
      if (chatSession?.id) {
        await prisma.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            fileId,
            role: "assistant",
            content: cacheHit.answerText,
            sources: [...cacheHit.sourcePages, "__CACHED__"],
          },
        });
        await prisma.chatSession.update({
          where: { id: chatSession.id },
          data: { updatedAt: new Date() },
        });
      }
      releaseSlotOnce();

      const encoder = new TextEncoder();
      const cachedAnswer = cacheHit.answerText;
      const cachedSources = cacheHit.sourcePages;
      const stream = new ReadableStream({
        start(controller) {
          streamCachedAnswer(cachedAnswer, controller, encoder);
          // Re-emit source tags if present and not already embedded
          if (
            cachedSources.length > 0 &&
            !cachedAnswer.includes("[[SOURCES:")
          ) {
            controller.enqueue(
              encoder.encode(`\n\n[[SOURCES:${cachedSources.join(",")}]]`)
            );
          }
          controller.close();
        },
      });
      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "X-Session-Id": chatSession.id,
          "X-Cache": "HIT",
          "Access-Control-Expose-Headers": "X-Cache, X-Session-Id",
        },
      });
    }
    // -----------------------------------------------------------------------

    // Retrieve context specific to the new query
    const { contextText, sourcePages } = await retrieveDocumentContext(
      fileId,
      userMessageText,
      settings
    );

    // Pass the metadata context into your builder function
    const chatMessages = buildPdfChatMessages(
      fileMetaContext, 
      contextText, 
      userMessageText,
      recentMessages
    );

    const encoder = new TextEncoder();
    const abortController = new AbortController();
    let isCancelled = false;

    const handleAbort = () => {
      isCancelled = true;
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
      releaseSlotOnce();
    };

    if (request.signal.aborted) {
      handleAbort();
    } else {
      request.signal.addEventListener("abort", handleAbort);
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullAssistantResponse = "";

          for await (const delta of streamChatCompletion(chatMessages, settings, abortController.signal)) {
            if (isCancelled || abortController.signal.aborted) break;
            fullAssistantResponse += delta;
            try {
              controller.enqueue(encoder.encode(delta));
            } catch {
              isCancelled = true;
              abortController.abort();
              break;
            }
          }

          if (isCancelled || abortController.signal.aborted) {
            if (fullAssistantResponse && !fullAssistantResponse.endsWith("*[Response terminated by user]*")) {
              fullAssistantResponse += "\n\n*[Response terminated by user]*";
            }
          }

          const responseWithSources = appendSourcePages(fullAssistantResponse, sourcePages);
          if (sourcePages.length > 0 && !fullAssistantResponse.includes("[[SOURCES:") && !isCancelled) {
            try {
              controller.enqueue(
                encoder.encode(`\n\n[[SOURCES:${sourcePages.join(",")}]]`)
              );
            } catch {
              isCancelled = true;
            }
          }

          if (chatSession?.id && fullAssistantResponse) {
            await prisma.chatMessage.create({
              data: {
                sessionId: chatSession.id,
                fileId,
                role: "assistant",
                content: responseWithSources || "No response generated.",
                sources: sourcePages.map(String),
              },
            });

            await prisma.chatSession.update({
              where: { id: chatSession.id },
              data: { updatedAt: new Date() },
            });

            // Store successful answer in semantic cache (fire-and-forget)
            if (!isCancelled) {
              storeSemanticCache(
                userMessageText,
                questionEmbedding,
                responseWithSources || fullAssistantResponse,
                sourcePages.map(String),
                "FILE",
                fileId,
                docFingerprint,
                settings
              ).catch(() => {});
            }
          }

          if (!isCancelled) {
            try {
              controller.close();
            } catch {}
          }
        } catch (err: any) {
          if (isCancelled || abortController.signal.aborted || err?.name === "AbortError") {
            console.log("PDF chat stream cancelled/aborted by client.");
          } else {
            console.error("Error during streaming pipeline:", err);
            if (!isCancelled) {
              try {
                controller.error(err);
              } catch {}
            }
          }
        } finally {
          request.signal.removeEventListener("abort", handleAbort);
          releaseSlotOnce();
        }
      },
      cancel() {
        handleAbort();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Session-Id": chatSession.id,
      },
    });
  } catch (error: unknown) {
    releaseSlotOnce();
    console.error("=== POST CHAT ROUTE CRASH ===", error);
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Ollama") || message.includes("Could not connect")) {
      return NextResponse.json(
        {
          error: "Could not connect to the AI engine. Is Ollama running?",
          details: message,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to process chat request.",
        message,
      },
      { status: 500 }
    );
  }
}