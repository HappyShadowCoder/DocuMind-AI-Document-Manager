import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: folderId } = await context.params;
    if (!folderId) {
      return NextResponse.json({ error: "Missing folder id." }, { status: 400 });
    }

    const sessions = await prisma.chatSession.findMany({
      where: { entityType: "FOLDER", entityId: folderId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    });

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (error) {
    console.error("Failed to load folder sessions", error);
    return NextResponse.json({ error: "Failed to load folder sessions." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: folderId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    if (!folderId || !sessionId || !title) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const updated = await prisma.chatSession.updateMany({
      where: { id: sessionId, entityType: "FOLDER", entityId: folderId },
      data: { title: title.slice(0, 80), updatedAt: new Date() },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, title: title.slice(0, 80) });
  } catch (error) {
    console.error("Failed to rename folder session:", error);
    return NextResponse.json({ error: "Failed to rename session." }, { status: 500 });
  }
}
