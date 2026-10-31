import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import { processPdfFile } from "@/lib/pdf-processing";

// Track currently active processing tasks to prevent duplicate concurrent runs
const activeProcessingSet = new Set<string>();

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

    const userId = payload.id;

    // Fetch all PDF files for the user
    const pdfFiles = await prisma.file.findMany({
      where: { ownerId: userId, type: "pdf" },
      select: {
        id: true,
        name: true,
        processingStatus: true,
        processingError: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const totalCount = pdfFiles.length;
    const readyCount = pdfFiles.filter((f) => f.processingStatus === "ready").length;
    const failedCount = pdfFiles.filter((f) => f.processingStatus === "failed").length;

    // Pending includes idle and processing
    const pendingFiles = pdfFiles.filter(
      (f) => f.processingStatus === "idle" || f.processingStatus === "processing"
    );
    const pendingCount = pendingFiles.length;

    const currentProcessingFile =
      pdfFiles.find((f) => f.processingStatus === "processing")?.name ||
      pendingFiles[0]?.name ||
      null;

    return NextResponse.json({
      totalCount,
      readyCount,
      pendingCount,
      failedCount,
      currentProcessingFile,
      pendingFiles: pendingFiles.map((f) => ({
        id: f.id,
        name: f.name,
        status: f.processingStatus,
      })),
    });
  } catch (err) {
    console.error("Error fetching processing status:", err);
    return NextResponse.json(
      { error: "Failed to fetch processing status" },
      { status: 500 }
    );
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

    const userId = payload.id;

    // Find all PDF files that are idle
    const idleFiles = await prisma.file.findMany({
      where: { ownerId: userId, type: "pdf", processingStatus: "idle" },
      select: { id: true, name: true },
    });

    // Start background processing for idle files
    for (const f of idleFiles) {
      if (!activeProcessingSet.has(f.id)) {
        activeProcessingSet.add(f.id);
        processPdfFile(f.id)
          .catch((err) => {
            console.error(`Background processing error for ${f.name} (${f.id}):`, err);
          })
          .finally(() => {
            activeProcessingSet.delete(f.id);
          });
      }
    }

    return NextResponse.json({
      message: `Triggered background processing for ${idleFiles.length} files.`,
      triggeredCount: idleFiles.length,
    });
  } catch (err) {
    console.error("Error triggering process-all:", err);
    return NextResponse.json(
      { error: "Failed to trigger processing" },
      { status: 500 }
    );
  }
}
