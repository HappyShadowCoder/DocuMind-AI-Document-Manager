// src/app/api/files/[id]/serve/route.ts
// Auth-gated file streaming endpoint — replaces the old public /uploads/ static serving.
// Enforces JWT authentication and file access level before streaming bytes.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Missing file id." }, { status: 400 });
    }

    // ── 1. Authentication ──────────────────────────────────────────────────
    const token = request.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJwt(token) : null;

    // ── 2. Load file metadata (no blob bytes yet — keep it fast) ───────────
    const fileRecord = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        shared: true,
        accessLevel: true,
        ownerId: true,
      },
    });

    if (!fileRecord) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    // ── 3. Authorization ───────────────────────────────────────────────────
    // Public shared file with "all" access → no login required
    const isPublicShared = fileRecord.shared && fileRecord.accessLevel === "all";
    if (!isPublicShared) {
      if (!payload) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      const isOwner = payload.id === fileRecord.ownerId;
      const isAdmin = payload.role === "admin";
      const isSharedAll = fileRecord.shared && fileRecord.accessLevel === "all";

      if (!isOwner && !isAdmin && !isSharedAll) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    // ── 4. Fetch blob ──────────────────────────────────────────────────────
    const blob = await prisma.fileBlob.findUnique({
      where: { fileId: id },
      select: { data: true, mimeType: true },
    });

    if (!blob) {
      return NextResponse.json(
        { error: "File content not found. The file may still be processing." },
        { status: 404 }
      );
    }

    // ── 5. Determine MIME type ─────────────────────────────────────────────
    const mimeType =
      blob.mimeType ||
      (fileRecord.type === "pdf"
        ? "application/pdf"
        : fileRecord.type === "image"
        ? "image/jpeg"
        : "application/octet-stream");

    // ── 6. Stream bytes back ───────────────────────────────────────────────
    const safeFileName = encodeURIComponent(fileRecord.name);
    const isDownload = request.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(blob.data, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(blob.data.length),
        "Content-Disposition": isDownload
          ? `attachment; filename="${safeFileName}"`
          : `inline; filename="${safeFileName}"`,
        // Private caching — allows browser to cache but not shared proxies
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("Error serving file:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
