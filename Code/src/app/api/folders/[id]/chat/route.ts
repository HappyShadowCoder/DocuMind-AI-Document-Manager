import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAiSettingsForUser, streamChatCompletion } from "@/lib/ai";
import { retrieveFolderDocumentContext } from "@/lib/pdf-processing";
import { appendSourcePages, buildPdfChatMessages } from "@/lib/pdf-chat";
import { tryAcquireLlmSlot, releaseLlmSlot } from "@/lib/llm-concurrency";

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

    const pdfFiles = await prisma.file.findMany({
      where: { folderId, type: "pdf", processingStatus: "ready" },
      orderBy: { updatedAt: "asc" },
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

    const settings = await getAiSettingsForUser(folderRecord.ownerId);
    const { contextText, sourcePages } = await retrieveFolderDocumentContext(
      folderId,
      userMessageText,
      settings
    );

    const chatMessages = buildPdfChatMessages(
      folderRecord.name,
      contextText,
      userMessageText,
      []
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullAssistantResponse = "";

          for await (const delta of streamChatCompletion(chatMessages, settings)) {
            fullAssistantResponse += delta;
            controller.enqueue(encoder.encode(delta));
          }

          const responseWithSources = appendSourcePages(fullAssistantResponse, sourcePages);
          if (sourcePages.length > 0 && !fullAssistantResponse.includes("[[SOURCES:")) {
            controller.enqueue(encoder.encode(`\n\n[[SOURCES:${sourcePages.join(",")}]]`));
          }

          controller.close();
        } catch (err) {
          console.error("Error during folder chat streaming pipeline:", err);
          controller.error(err);
        } finally {
          releaseSlotOnce();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
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
