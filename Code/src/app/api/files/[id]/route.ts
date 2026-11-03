// app/api/files/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processPdfFile } from "@/lib/pdf-processing";
import { verifyJwt } from "@/lib/auth";
import { invalidateOnDocumentChange } from "@/lib/semantic-cache";

// Helper function to safely serialize BigInt fields to numbers or strings
function sanitizeRecord<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await context.params;
    const id = resolvedParams?.id;

    if (!id) {
      return NextResponse.json(
        { error: "Missing route parameter: id" },
        { status: 400 }
      );
    }

    const fileRecord = await prisma.file.findUnique({
      where: { id },
    });

    if (!fileRecord) {
      return NextResponse.json(
        { error: "File not found in database." },
        { status: 404 }
      );
    }

    // Capture folderId before deleting
    const folderId = fileRecord.folderId;

    // Check access level for admin-only shared files
    if (fileRecord.shared && fileRecord.accessLevel === "admin") {
      const token = request.cookies.get("auth_token")?.value;
      const payload = token ? await verifyJwt(token) : null;
      const isOwner = payload?.id === fileRecord.ownerId;
      const isAdmin = payload?.role === "admin";
      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to access this file." },
          { status: 403 }
        );
      }
    }

    const safeFileRecord = sanitizeRecord(fileRecord);

    // Ensure consumers always get the auth-gated serve URL, not a raw filesystem path
    const responseRecord = {
      ...safeFileRecord,
      path: `/api/files/${id}/serve`,
    };

    return NextResponse.json({ file: responseRecord }, { status: 200 });
  } catch (error: any) {
    console.error("=== EXPLICIT ROUTE ERROR ===");
    console.error(error);

    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await context.params;
    const id = resolvedParams?.id;

    if (!id) {
      return NextResponse.json(
        { error: "Missing route parameter: id" },
        { status: 400 }
      );
    }

    const fileRecord = await prisma.file.findUnique({
      where: { id },
    });

    if (!fileRecord) {
      return NextResponse.json(
        { error: "File not found in database." },
        { status: 404 }
      );
    }

    // Capture folderId before deleting
    const folderId = fileRecord.folderId;

    if (fileRecord.processingStatus === "ready" && fileRecord.chunkCount > 0) {
      const safeFileRecord = sanitizeRecord(fileRecord);
      return NextResponse.json(
        { message: "File is already processed.", file: safeFileRecord },
        { status: 200 }
      );
    }

    if (fileRecord.type !== "pdf") {
      return NextResponse.json(
        { error: "Only PDF files can be processed for chat." },
        { status: 400 }
      );
    }

    await processPdfFile(id);

    const updatedRecord = await prisma.file.findUnique({ where: { id } });
    if (!updatedRecord) {
      return NextResponse.json({ error: "File not found after processing." }, { status: 404 });
    }

    const safeFileRecord = sanitizeRecord(updatedRecord);

    return NextResponse.json(
      { message: "File processing completed.", file: safeFileRecord },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("=== POST ROUTE ERROR ===");
    console.error(error);

    return NextResponse.json(
      {
        error: "Failed to process PDF.",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await context.params;
    const id = resolvedParams?.id;

    if (!id) {
      return NextResponse.json(
        { error: "Missing route parameter: id" },
        { status: 400 }
      );
    }

    const fileRecord = await prisma.file.findUnique({
      where: { id },
    });

    if (!fileRecord) {
      return NextResponse.json(
        { error: "File not found in database." },
        { status: 404 }
      );
    }

    // Capture folderId before deleting
    const folderId = fileRecord.folderId;

    // FileBlob is deleted automatically by ON DELETE CASCADE from File.
    // No fs.unlink needed — bytes live in PostgreSQL, not on disk.

    // Execute database transaction to clean up all related models
    await prisma.$transaction([
      // Delete related chat sessions (FILE-scoped)
      prisma.chatSession.deleteMany({
        where: { entityType: "FILE", entityId: id },
      }),
      // Explicitly delete related chat messages
      prisma.chatMessage.deleteMany({
        where: { fileId: id },
      }),
      // Explicitly delete related vector document chunks
      prisma.documentChunk.deleteMany({
        where: { fileId: id },
      }),
      // Explicitly delete FIR metadata
      prisma.documentMetadata.deleteMany({
        where: { fileId: id },
      }),
      // Delete primary file record
      prisma.file.delete({
        where: { id },
      }),
    ]);

    // Invalidate semantic cache entries tied to this file/folder/global
    invalidateOnDocumentChange(id, folderId).catch(() => {});

    return NextResponse.json(
      { message: "File and all associated data deleted successfully." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("=== DELETE ROUTE ERROR ===");
    console.error(error);

    return NextResponse.json(
      {
        error: "An error occurred while deleting the file.",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}