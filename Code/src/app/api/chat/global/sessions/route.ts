import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";

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

    const sessions = await prisma.chatSession.findMany({
      where: {
        entityType: "GLOBAL",
        entityId: payload.id,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, createdAt: true },
        },
      },
    });

    const formatted = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
      lastMessage: s.messages[0]?.content || "",
    }));

    return NextResponse.json({ sessions: formatted });
  } catch (error) {
    console.error("Failed to fetch global sessions:", error);
    return NextResponse.json({ error: "Failed to fetch sessions." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyJwt(token);
    if (!payload?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "New Chat";

    const session = await prisma.chatSession.create({
      data: {
        entityType: "GLOBAL",
        entityId: payload.id,
        title,
      },
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Failed to create global session:", error);
    return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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

    await prisma.chatSession.deleteMany({
      where: {
        id: sessionId,
        entityType: "GLOBAL",
        entityId: payload.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete global session:", error);
    return NextResponse.json({ error: "Failed to delete session." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyJwt(token);
    if (!payload?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    if (!sessionId || !title) {
      return NextResponse.json({ error: "sessionId and title are required." }, { status: 400 });
    }

    const updated = await prisma.chatSession.updateMany({
      where: {
        id: sessionId,
        entityType: "GLOBAL",
        entityId: payload.id,
      },
      data: {
        title: title.slice(0, 80),
        updatedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, title: title.slice(0, 80) });
  } catch (error) {
    console.error("Failed to rename global session:", error);
    return NextResponse.json({ error: "Failed to rename session." }, { status: 500 });
  }
}

