import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";

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

    const isAdmin = payload.role === "admin";

    const fileWhere: Record<string, unknown> = {
      type: "pdf",
      processingStatus: "ready",
    };

    if (!isAdmin) {
      fileWhere.accessLevel = "all";
      fileWhere.OR = [
        { ownerId: payload.id },
        { shared: true },
      ];
      fileWhere.NOT = {
        folder: {
          accessLevel: "admin",
        },
      };
    }

    const files = await prisma.file.findMany({
      where: fileWhere,
      include: {
        documentMetadata: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 150,
    });

    const documents = files.map((f) => ({
      id: f.id,
      name: f.name,
      firNumber: f.documentMetadata?.firNumber || null,
      district: f.documentMetadata?.district || null,
      policeStation: f.documentMetadata?.policeStation || null,
      firDate: f.documentMetadata?.firDate
        ? f.documentMetadata.firDate.toISOString().split("T")[0]
        : null,
      propertyLoss: f.documentMetadata?.propertyLoss || null,
      accessLevel: f.accessLevel,
      shared: f.shared,
    }));

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Failed to fetch accessible documents for chat:", error);
    return NextResponse.json({ error: "Failed to fetch documents." }, { status: 500 });
  }
}
