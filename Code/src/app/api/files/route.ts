import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import { normalizeFileType } from "@/lib/file-types";

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

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category") || "my-files";
    const rawFolderId = searchParams.get("folderId");
    const resolvedFolderId =
      rawFolderId && rawFolderId !== "null" && rawFolderId !== "undefined" ? rawFolderId : null;

    const whereClause: Record<string, unknown> = {
      folderId: resolvedFolderId,
    };

    if (category === "shared") {
      whereClause.shared = true;
    } else if (category === "my-files") {
      whereClause.ownerId = payload.id;
      whereClause.shared = false;
    }

    const files = await prisma.file.findMany({
      where: whereClause,
      include: {
        owner: { select: { fullName: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const formattedFiles = files.map((file) => ({
      id: file.id,
      name: file.name,
      type: normalizeFileType(file.type, file.name),
      sizeBytes: Number(file.sizeBytes),
      path: file.path,
      updatedAt: file.updatedAt.toISOString(),
      shared: file.shared,
      owner: {
        name: file.owner?.fullName || file.owner?.email || "Unknown User",
      },
    }));

    return NextResponse.json({ files: formattedFiles }, { status: 200 });
  } catch (error) {
    console.error("Error fetching files:", error);
    return NextResponse.json({ error: "Error fetching files." }, { status: 500 });
  }
}
