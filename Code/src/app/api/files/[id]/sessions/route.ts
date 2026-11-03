import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: fileId } = await context.params;
    if (!fileId) {
      return NextResponse.json({ error: "Missing file id." }, { status: 400 });
    }

    const sessions = await prisma.chatSession.findMany({
      where: { entityType: "FILE", entityId: fileId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    });

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (error) {
    console.error("Failed to load file sessions", error);
    return NextResponse.json({ error: "Failed to load file sessions." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: fileId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    if (!fileId || !sessionId || !title) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const updated = await prisma.chatSession.updateMany({
      where: { id: sessionId, entityType: "FILE", entityId: fileId },
      data: { title: title.slice(0, 80), updatedAt: new Date() },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, title: title.slice(0, 80) });
  } catch (error) {
    console.error("Failed to rename file session:", error);
    return NextResponse.json({ error: "Failed to rename session." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: fileId } = await context.params;
    if (!fileId) {
      return NextResponse.json({ error: "Missing file id." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const deleteAll = searchParams.get("all") === "true";

    if (deleteAll) {
      // Delete all chat messages and sessions for this file
      await prisma.$transaction([
        prisma.chatMessage.deleteMany({
          where: { fileId },
        }),
        prisma.chatSession.deleteMany({
          where: { entityType: "FILE", entityId: fileId },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: "All chat sessions deleted successfully.",
      });
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter or all=true flag." },
        { status: 400 }
      );
    }

    // Delete specific session and its messages
    await prisma.$transaction([
      prisma.chatMessage.deleteMany({
        where: { sessionId },
      }),
      prisma.chatSession.deleteMany({
        where: { id: sessionId, entityType: "FILE", entityId: fileId },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Chat session deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete chat session(s):", error);
    return NextResponse.json(
      { error: "Failed to delete chat session." },
      { status: 500 }
    );
  }
}
