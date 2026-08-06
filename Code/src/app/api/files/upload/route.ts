// src/app/api/files/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { normalizeFileType, resolveFileType } from "@/lib/file-types";

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
    // EXTRACT THE SHARED FLAG FROM THE REQUEST
    const sharedParam = formData.get("shared") as string | null;
    const isShared = sharedParam === "true";

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = path.join(uploadDir, uniqueFileName);
    const publicUrlPath = `/uploads/${uniqueFileName}`;

    await writeFile(filePath, buffer);

    const resolvedFolderId =
      folderId && folderId !== "null" && folderId !== "undefined"
        ? folderId
        : null;

    const fileType = resolveFileType(file.name, file.type);

    const newFile = await prisma.file.create({
      data: {
        name: file.name,
        type: fileType,
        sizeBytes: BigInt(file.size),
        path: publicUrlPath,
        ownerId: loggedInUserId,
        folderId: resolvedFolderId,
        shared: isShared, // SAVE THE SHARED STATUS TO DB
      },
    });

    return NextResponse.json({
      file: {
        id: newFile.id,
        name: newFile.name,
        type: normalizeFileType(newFile.type, newFile.name),
        sizeBytes: Number(newFile.sizeBytes),
        path: newFile.path,
        updatedAt: newFile.updatedAt.toISOString(),
        shared: newFile.shared,
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