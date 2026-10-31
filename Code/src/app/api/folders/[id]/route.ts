import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import { processPdfFile } from "@/lib/pdf-processing";
import { invalidateScopeCache, invalidateOnDocumentChange } from "@/lib/semantic-cache";

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
    const isAdmin = payload.role === "admin";
    if (!isOwner && !folder.shared) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to access this folder." }, { status: 403 });
    }

    // Block non-admin users from accessing admin-only shared folders
    if (folder.shared && folder.accessLevel === "admin" && !isAdmin && !isOwner) {
      return NextResponse.json({ error: "Forbidden: You do not have permission to access this folder." }, { status: 403 });
    }

    const files = await prisma.file.findMany({
      where: {
        folderId,
        type: "pdf",
        // Non-admin users can only see files with accessLevel 'all'
        ...(!isAdmin && !isOwner ? { accessLevel: "all" } : {}),
      },
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
          accessLevel: folder.accessLevel,
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
      include: {
        files: {
          select: { id: true, path: true },
        },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }

    // Only the owner can delete. Admins are allowed too.
    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { role: true } });
    const isOwner = folder.ownerId === payload.id;
    const isAdmin = user?.role === "admin";

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to delete this folder." },
        { status: 403 }
      );
    }

    const fileIds = folder.files.map((f) => f.id);

    // 1. Delete all physical files from disk
    for (const file of folder.files) {
      if (file.path) {
        try {
          const { resolveStoredFilePath } = await import("@/lib/file-path");
          const absoluteFilePath = resolveStoredFilePath(file.path);
          const { promises: fs } = await import("fs");
          await fs.unlink(absoluteFilePath);
        } catch (err: unknown) {
          const e = err as { code?: string };
          if (e?.code !== "ENOENT") {
            console.warn(`Could not delete physical file for file id ${file.id}:`, err);
          }
        }
      }
    }

    if (fileIds.length > 0) {
      // 2. Delete all DB content related to files in this folder
      await prisma.$transaction([
        // Chat sessions for folder
        prisma.chatSession.deleteMany({
          where: { entityType: "FOLDER", entityId: folderId },
        }),
        // Chat messages for all files
        prisma.chatMessage.deleteMany({
          where: { fileId: { in: fileIds } },
        }),
        // Document chunks (embeddings) for all files
        prisma.documentChunk.deleteMany({
          where: { fileId: { in: fileIds } },
        }),
        // Document metadata for all files
        prisma.documentMetadata.deleteMany({
          where: { fileId: { in: fileIds } },
        }),
        // The file records themselves
        prisma.file.deleteMany({
          where: { id: { in: fileIds } },
        }),
      ]);
    } else {
      // Still delete folder-level chat sessions even if no files
      await prisma.chatSession.deleteMany({
        where: { entityType: "FOLDER", entityId: folderId },
      });
    }

    // 3. Delete the folder record itself
    await prisma.folder.delete({
      where: { id: folderId },
    });

    // Invalidate semantic cache: FOLDER scope + GLOBAL scope (files gone)
    invalidateScopeCache("FOLDER", folderId).catch(() => {});
    // For each deleted file, clean up FILE scope cache entries
    for (const file of fileIds) {
      invalidateOnDocumentChange(file, null).catch(() => {});
    }

    return NextResponse.json(
      { message: "Folder and all its contents deleted successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Folder deletion failed:", error);
    return NextResponse.json({ error: "Error deleting folder." }, { status: 500 });
  }
}