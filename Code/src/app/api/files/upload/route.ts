// src/app/api/files/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { normalizeFileType, resolveFileType } from "@/lib/file-types";
import { processPdfFile } from "@/lib/pdf-processing";
import { invalidateOnDocumentChange } from "@/lib/semantic-cache";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-super-secret-key-change-me"
);

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
    
    // Check for "file" or find the first entry that is an instance of File
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
      folderId && folderId !== "null" && folderId !== "undefined"
        ? folderId
        : null;

    // EXTRACT THE SHARED FLAG FROM THE REQUEST
    const sharedParam = formData.get("shared") as string | null;
    let isShared = sharedParam === "true";

    // EXTRACT THE ACCESS LEVEL FROM THE REQUEST
    const accessLevelParam = formData.get("accessLevel") as string | null;
    let resolvedAccessLevel: "all" | "admin" = "all";

    if (resolvedFolderId && !isShared) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: resolvedFolderId },
        select: { shared: true, accessLevel: true },
      });
      if (parentFolder?.shared) {
        isShared = true;
      }
      if (parentFolder?.accessLevel === "admin") {
        resolvedAccessLevel = "admin";
      }
    }

    // Only admin users can set accessLevel to 'admin'
    if (resolvedAccessLevel !== "admin" && accessLevelParam === "admin") {
      const uploader = await prisma.user.findUnique({
        where: { id: loggedInUserId },
        select: { role: true },
      });
      if (uploader?.role === "admin") {
        resolvedAccessLevel = "admin";
      }
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = path.join(uploadDir, uniqueFileName);
    const publicUrlPath = `/uploads/${uniqueFileName}`;

    await writeFile(filePath, buffer);

    const fileType = resolveFileType(file.name, file.type);

    const newFile = await prisma.file.create({
      data: {
        name: file.name,
        type: fileType,
        sizeBytes: BigInt(file.size),
        path: publicUrlPath,
        ownerId: loggedInUserId,
        folderId: resolvedFolderId,
        shared: isShared,
        accessLevel: resolvedAccessLevel,
      },
    });

    if (fileType === "pdf") {
      // Fire-and-forget: Immediately kick off background OCR, embedding, summary, and FIR extraction
      processPdfFile(newFile.id).catch((err) => {
        console.error(`Background processing failed for file ${newFile.id}:`, err);
      });
    }

    // Invalidate semantic cache for the new file's scope (fire-and-forget)
    invalidateOnDocumentChange(newFile.id, resolvedFolderId).catch(() => {});

    return NextResponse.json({
      file: {
        id: newFile.id,
        name: newFile.name,
        type: normalizeFileType(newFile.type, newFile.name),
        sizeBytes: Number(newFile.sizeBytes),
        path: newFile.path,
        updatedAt: newFile.updatedAt.toISOString(),
        shared: newFile.shared,
        accessLevel: newFile.accessLevel,
      },
    }, { status: 201 });

  } catch (error: any) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: error?.message || "An error occurred while uploading file." },
      { status: 500 }
    );
  }
}