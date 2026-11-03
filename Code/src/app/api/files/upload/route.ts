// src/app/api/files/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { normalizeFileType, resolveFileType } from "@/lib/file-types";
import { processPdfFile } from "@/lib/pdf-processing";
import { invalidateOnDocumentChange } from "@/lib/semantic-cache";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-super-secret-key-change-me"
);

/** Guess MIME type from file name extension when browser-supplied type is generic. */
function resolveMimeType(fileName: string, browserMime: string): string {
  if (browserMime && browserMime !== "application/octet-stream") return browserMime;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    zip: "application/zip",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const verified = await jwtVerify(token, JWT_SECRET);
    const payload = verified.payload as { id?: string; userId?: string };
    const loggedInUserId = payload.id || payload.userId;

    if (!loggedInUserId) {
      return NextResponse.json({ error: "Invalid session token." }, { status: 401 });
    }

    const formData = await request.formData();

    // Accept "file" key or the first File-like entry
    let file = formData.get("file") as File | null;
    if (!file) {
      for (const [_, value] of formData.entries()) {
        if (value && typeof value === "object" && "name" in value && "arrayBuffer" in value) {
          file = value as File;
          break;
        }
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file was received in the request." }, { status: 400 });
    }

    const folderId = formData.get("folderId") as string | null;
    const resolvedFolderId =
      folderId && folderId !== "null" && folderId !== "undefined" ? folderId : null;

    // ── Shared / access level resolution ────────────────────────────────────
    const sharedParam = formData.get("shared") as string | null;
    let isShared = sharedParam === "true";
    const accessLevelParam = formData.get("accessLevel") as string | null;
    let resolvedAccessLevel: "all" | "admin" = "all";

    if (resolvedFolderId && !isShared) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: resolvedFolderId },
        select: { shared: true, accessLevel: true },
      });
      if (parentFolder?.shared) isShared = true;
      if (parentFolder?.accessLevel === "admin") resolvedAccessLevel = "admin";
    }

    // Only admin users can set accessLevel to 'admin'
    if (resolvedAccessLevel !== "admin" && accessLevelParam === "admin") {
      const uploader = await prisma.user.findUnique({
        where: { id: loggedInUserId },
        select: { role: true },
      });
      if (uploader?.role === "admin") resolvedAccessLevel = "admin";
    }

    // ── Read file bytes ──────────────────────────────────────────────────────
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = resolveMimeType(file.name, file.type);
    const fileType = resolveFileType(file.name, file.type);

    // ── Atomic transaction: create File record + FileBlob ───────────────────
    const newFile = await prisma.$transaction(async (tx) => {
      const created = await tx.file.create({
        data: {
          name: file!.name,
          type: fileType,
          sizeBytes: BigInt(file!.size),
          // path is now optional; set null for DB-stored files
          path: null,
          ownerId: loggedInUserId,
          folderId: resolvedFolderId,
          shared: isShared,
          accessLevel: resolvedAccessLevel,
        },
      });

      await tx.fileBlob.create({
        data: {
          fileId: created.id,
          data: buffer,
          mimeType,
        },
      });

      return created;
    });

    // ── Fire-and-forget: OCR + embedding pipeline ────────────────────────────
    if (fileType === "pdf") {
      processPdfFile(newFile.id).catch((err) => {
        console.error(`Background processing failed for file ${newFile.id}:`, err);
      });
    }

    // Invalidate semantic cache for the new file's scope (fire-and-forget)
    invalidateOnDocumentChange(newFile.id, resolvedFolderId).catch(() => {});

    return NextResponse.json(
      {
        file: {
          id: newFile.id,
          name: newFile.name,
          type: normalizeFileType(newFile.type, newFile.name),
          sizeBytes: Number(newFile.sizeBytes),
          // Return the auth-gated serve URL instead of a raw filesystem path
          path: `/api/files/${newFile.id}/serve`,
          updatedAt: newFile.updatedAt.toISOString(),
          shared: newFile.shared,
          accessLevel: newFile.accessLevel,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: error?.message || "An error occurred while uploading file." },
      { status: 500 }
    );
  }
}
