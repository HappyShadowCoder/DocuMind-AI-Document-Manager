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
