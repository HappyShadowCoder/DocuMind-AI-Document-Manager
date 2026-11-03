import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import { getAiSettingsForUser, streamChatCompletion } from "@/lib/ai";
import { retrieveFolderDocumentContext } from "@/lib/pdf-processing";
import { appendSourcePages, buildFolderChatMessages } from "@/lib/pdf-chat";
import { tryAcquireLlmSlot, releaseLlmSlot } from "@/lib/llm-concurrency";
import {
  prepareSemanticCacheContext,
  lookupSemanticCache,
  storeSemanticCache,
  streamCachedAnswer,
} from "@/lib/semantic-cache";
import { generateChatTitle } from "@/lib/chat-title";

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
    const { id: folderId } = await context.params;
    if (!folderId) {
      return NextResponse.json({ error: "Missing route parameter: id" }, { status: 400 });
    }

    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }

    // Block non-admin users from accessing admin-only shared folder chats
    if (folder.shared && folder.accessLevel === "admin") {
      const token = _request.cookies.get("auth_token")?.value;
      const payload = token ? await verifyJwt(token) : null;
      const isOwner = payload?.id === folder.ownerId;
      const isAdmin = payload?.role === "admin";
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Forbidden: You do not have permission to access this folder." }, { status: 403 });
      }
    }

    const pdfFiles = await prisma.file.findMany({
      where: { folderId, type: "pdf" },
      orderBy: { updatedAt: "asc" },
    });

    return NextResponse.json(
      {
        folderName: folder.name,
        files: pdfFiles.map((file) => sanitizeRecord(file)),
        messages: [],
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("=== GET FOLDER CHAT ROUTE ERROR ===", error);
    return NextResponse.json(
      {
        error: "Failed to fetch folder chat history.",
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
  let slotReleased = true;
  const releaseSlotOnce = () => {
    if (!slotReleased) {
      slotReleased = true;
      releaseLlmSlot();
    }
  };

  try {
    const { id: folderId } = await context.params;
    if (!folderId) {
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

    const folderRecord = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folderRecord) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }

    const token = request.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJwt(token) : null;

    // Block non-admin users from chatting with admin-only shared folders
    if (folderRecord.shared && folderRecord.accessLevel === "admin") {
      const isOwner = payload?.id === folderRecord.ownerId;
      const isAdmin = payload?.role === "admin";
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Forbidden: You do not have permission to access this folder." }, { status: 403 });
      }
    }

    const pdfFiles = await prisma.file.findMany({
      where: { folderId, type: "pdf", processingStatus: "ready" },
      orderBy: { updatedAt: "asc" },
      include: {
        documentMetadata: true,
      },
    });

    if (pdfFiles.length === 0) {
      return NextResponse.json(
        { error: "No ready PDF documents are available in this folder." },
        { status: 409 }
      );
    }

    if (!tryAcquireLlmSlot()) {
      return NextResponse.json(
        { error: "We're facing heavy traffic right now. Please try again in a little while." },
        { status: 429 }
      );
    }
    slotReleased = false;

    const fileIds = pdfFiles.map((f) => f.id);

    const pageCounts = await prisma.documentChunk.groupBy({
      by: ["fileId"],
      where: { fileId: { in: fileIds } },
      _max: { pageNumber: true },
    });

    const pageCountByFileId = new Map(
      pageCounts.map((pc) => [pc.fileId, pc._max.pageNumber || 1])
    );

    const filesInventory = pdfFiles.map((file) => {
      const meta = file.documentMetadata;
      const actsAndSections = Array.isArray(meta?.actsAndSections)
        ? (meta.actsAndSections as string[])
        : null;
      return {
        id: file.id,
        fileName: file.name,
        totalPagesCount: pageCountByFileId.get(file.id) || 1,
        firNumber: meta?.firNumber,
        firDate: meta?.firDate ? meta.firDate.toISOString().split("T")[0] : null,
        district: meta?.district,
        subDivision: meta?.subDivision,
        policeStation: meta?.policeStation,
        propertyLoss: meta?.propertyLoss,
        actsAndSections,
        zeroFirReference: meta?.zeroFirReference,
      };
    });

    const chatUserId = (payload?.id as string) || folderRecord.ownerId;
    const settings = await getAiSettingsForUser(chatUserId);

    // Pre-compute embedding + fingerprint in parallel with context retrieval
    const [{ embedding: questionEmbedding, docFingerprint }, { contextText, sourcePages }] =
      await Promise.all([
        prepareSemanticCacheContext(userMessageText, "FOLDER", folderId, settings),
        retrieveFolderDocumentContext(folderId, userMessageText, settings),
      ]);

    const requestedSessionId = typeof body?.sessionId === "string" ? body.sessionId : null;

    let chatSession = requestedSessionId
      ? await prisma.chatSession.findFirst({
          where: {
            id: requestedSessionId,
            entityType: "FOLDER",
            entityId: folderId,
          },
        })
      : null;

    if (!chatSession) {
      chatSession = await prisma.chatSession.create({
        data: {
          entityType: "FOLDER",
          entityId: folderId,
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

    const recentMessages = await prisma.chatMessage.findMany({
      where: { sessionId: chatSession.id },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { role: true, content: true },
    });

    // -----------------------------------------------------------------------
    // Semantic cache lookup (after recentMessages so we know conversational depth)
    const priorTurns = Math.max(0, recentMessages.length - 1);
    const cacheHit = await lookupSemanticCache(
      userMessageText,
      questionEmbedding,
      "FOLDER",
      folderId,
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
      releaseSlotOnce();

      const encoder = new TextEncoder();
      const cachedAnswer = cacheHit.answerText;
      const cachedSources = cacheHit.sourcePages;
      const stream = new ReadableStream({
        start(controller) {
          streamCachedAnswer(cachedAnswer, controller, encoder);
          if (cachedSources.length > 0 && !cachedAnswer.includes("[[SOURCES:")) {
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

    const chatMessages = buildFolderChatMessages(
      folderRecord.name,
      filesInventory,
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

          const numericSourcePages = sourcePages.map(Number);
          const responseWithSources = appendSourcePages(fullAssistantResponse, numericSourcePages);
          if (sourcePages.length > 0 && !fullAssistantResponse.includes("[[SOURCES:") && !isCancelled) {
            try {
              controller.enqueue(encoder.encode(`\n\n[[SOURCES:${sourcePages.join(",")}]]`));
            } catch {
              isCancelled = true;
            }
          }

          if (chatSession?.id && fullAssistantResponse) {
            await prisma.chatMessage.create({
              data: {
                sessionId: chatSession.id,
                role: "assistant",
                content: responseWithSources || "No response generated.",
                sources: sourcePages.map(String),
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
                responseWithSources || fullAssistantResponse,
                sourcePages.map(String),
                "FOLDER",
                folderId,
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
            console.log("Folder chat stream cancelled/aborted by client.");
          } else {
            console.error("Error during folder chat streaming pipeline:", err);
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
    console.error("=== POST FOLDER CHAT ROUTE CRASH ===", error);
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: "Failed to process folder chat request.",
        message,
      },
      { status: 500 }
    );
  }
}