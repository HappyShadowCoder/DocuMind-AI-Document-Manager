// app/api/files/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { processPdfFile } from "@/lib/pdf-processing";
import { resolveStoredFilePath } from "@/lib/file-path";

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

    const safeFileRecord = sanitizeRecord(fileRecord);

    return NextResponse.json({ file: safeFileRecord }, { status: 200 });
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

    // 1. Delete physical file from disk (handles absolute or relative paths)
    if (fileRecord.path) {
      const absoluteFilePath = resolveStoredFilePath(fileRecord.path);

      try {
        await fs.unlink(absoluteFilePath);
      } catch (err: any) {
        // Log warning if physical file was missing, but proceed with DB cleanup
        if (err.code !== "ENOENT") {
          console.warn(`Failed to delete physical file at ${absoluteFilePath}:`, err);
        }
      }
    }

    // 2. Execute explicit database transaction to clean up all related models
    await prisma.$transaction([
      // Explicitly delete related chat messages
      prisma.chatMessage.deleteMany({
        where: { fileId: id },
      }),
      // Explicitly delete related vector document chunks
      prisma.documentChunk.deleteMany({
        where: { fileId: id },
      }),
      // Delete primary file record
      prisma.file.delete({
        where: { id },
      }),
    ]);

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