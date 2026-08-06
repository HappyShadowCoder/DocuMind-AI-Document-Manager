import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import { processPdfFile } from "@/lib/pdf-processing";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyJwt(token);
    if (!payload || !payload.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { id: folderId } = await context.params;
    if (!folderId) {
      return NextResponse.json({ error: "Folder ID is required." }, { status: 400 });
    }

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        _count: {
          select: { files: true },
        },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }

    const isOwner = folder.ownerId === payload.id;
    if (!isOwner && !folder.shared) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to access this folder." }, { status: 403 });
    }

    const files = await prisma.file.findMany({
      where: { folderId, type: "pdf" },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(
      {
        folder: {
          id: folder.id,
          name: folder.name,
          owner: {
            name: folder.owner?.fullName || folder.owner?.email || "Unknown",
          },
          fileCount: folder._count?.files ?? 0,
          shared: folder.shared,
          createdAt: folder.createdAt.toISOString(),
          updatedAt: folder.updatedAt.toISOString(),
        },
        files: files.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          path: file.path,
          sizeBytes: Number(file.sizeBytes),
          updatedAt: file.updatedAt.toISOString(),
          processingStatus: file.processingStatus,
          processingError: file.processingError,
          chunkCount: file.chunkCount,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching folder details:", error);
    return NextResponse.json({ error: "Failed to fetch folder details." }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyJwt(token);
    if (!payload || !payload.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { id: folderId } = await context.params;
    if (!folderId) {
      return NextResponse.json({ error: "Folder ID is required." }, { status: 400 });
    }

    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }

    const isOwner = folder.ownerId === payload.id;
    if (!isOwner && !folder.shared) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to access this folder." }, { status: 403 });
    }

    const pdfFiles = await prisma.file.findMany({
      where: { folderId, type: "pdf" },
      orderBy: { updatedAt: "asc" },
    });

    if (pdfFiles.length === 0) {
      return NextResponse.json({ error: "No PDF documents found in this folder." }, { status: 404 });
    }

    const unprocessedFiles = pdfFiles.filter(
      (file) => file.processingStatus !== "ready" || (file.chunkCount ?? 0) === 0
    );

    const results: Array<{ fileId: string; status: string; message?: string }> = [];
    for (const file of unprocessedFiles) {
      try {
        await processPdfFile(file.id);
        results.push({ fileId: file.id, status: "processed" });
      } catch (error: unknown) {
        results.push({
          fileId: file.id,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const updatedFiles = await prisma.file.findMany({
      where: { folderId, type: "pdf" },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(
      {
        message: "Folder indexing completed.",
        results,
        files: updatedFiles.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          path: file.path,
          sizeBytes: Number(file.sizeBytes),
          updatedAt: file.updatedAt.toISOString(),
          processingStatus: file.processingStatus,
          processingError: file.processingError,
          chunkCount: file.chunkCount,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing folder PDFs:", error);
    return NextResponse.json({ error: "Failed to process PDFs in this folder." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyJwt(token);
    if (!payload || !payload.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { id: folderId } = await context.params;

    if (!folderId) {
      return NextResponse.json({ error: "Folder ID is required." }, { status: 400 });
    }

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }

    if (folder.ownerId !== payload.id) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to delete this folder." },
        { status: 403 }
      );
    }

    await prisma.folder.delete({
      where: { id: folderId },
    });

    return NextResponse.json(
      { message: "Folder deleted successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Folder deletion failed:", error);
    return NextResponse.json({ error: "Error deleting folder." }, { status: 500 });
  }
}