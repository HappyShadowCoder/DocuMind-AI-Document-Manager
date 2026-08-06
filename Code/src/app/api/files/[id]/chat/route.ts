// src/app/api/files/[id]/chat/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAiSettingsForUser, streamChatCompletion } from "@/lib/ai";
import { retrieveDocumentContext } from "@/lib/pdf-processing";
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
    const { id: fileId } = await context.params;

    if (!fileId) {
      return NextResponse.json({ error: "Missing route parameter: id" }, { status: 400 });
    }

    const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
    if (!fileRecord) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
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

    // Save the new user message
    await prisma.chatMessage.create({
      data: {
        fileId,
        role: "user",
        content: userMessageText,
      },
    });

    // Fetch the recent conversation history to provide memory to the LLM.
    // Limiting to the last 10 messages prevents exceeding the token context window.
    const recentMessages = await prisma.chatMessage.findMany({
      where: { fileId },
      orderBy: { createdAt: "asc" },
      take: 10, 
    });

    const settings = await getAiSettingsForUser(fileRecord.ownerId);
    
    // Retrieve context specific to the new query
    const { contextText, sourcePages } = await retrieveDocumentContext(
      fileId,
      userMessageText,
      settings
    );

    // Pass the recent messages array into your builder function
    const chatMessages = buildPdfChatMessages(
      fileRecord.name, 
      contextText, 
      userMessageText,
      recentMessages
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
            controller.enqueue(
              encoder.encode(`\n\n[[SOURCES:${sourcePages.join(",")}]]`)
            );
          }

          // Save the assistant's response
          await prisma.chatMessage.create({
            data: {
              fileId,
              role: "assistant",
              content: responseWithSources || "No response generated.",
            },
          });

          controller.close();
        } catch (err) {
          console.error("Error during streaming pipeline:", err);
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