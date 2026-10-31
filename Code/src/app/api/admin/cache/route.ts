// src/app/api/admin/cache/route.ts
//
// Admin-only endpoints for managing the semantic cache.
//
// GET  /api/admin/cache        → returns cache stats
// DELETE /api/admin/cache      → runs cleanup (purges stale/zero-hit entries)

import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanupStaleCache } from "@/lib/semantic-cache";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyJwt(token);
  if (!payload?.id || payload.role !== "admin") return null;
  return payload;
}

export async function GET(request: NextRequest) {
  const payload = await requireAdmin(request);
  if (!payload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [total, byScope, topHits] = await Promise.all([
      prisma.semanticCache.count(),
      prisma.semanticCache.groupBy({
        by: ["scopeType"],
        _count: { id: true },
        _sum: { hitCount: true },
      }),
      prisma.semanticCache.findMany({
        orderBy: { hitCount: "desc" },
        take: 10,
        select: {
          id: true,
          scopeType: true,
          scopeId: true,
          hitCount: true,
          createdAt: true,
          updatedAt: true,
          aiProvider: true,
        },
      }),
    ]);

    return NextResponse.json({
      totalEntries: total,
      byScope: byScope.map((s) => ({
        scopeType: s.scopeType,
        count: s._count.id,
        totalHits: s._sum.hitCount ?? 0,
      })),
      topHits,
    });
  } catch (error) {
    console.error("Cache stats error:", error);
    return NextResponse.json({ error: "Failed to fetch cache stats" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const payload = await requireAdmin(request);
  if (!payload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { deleted } = await cleanupStaleCache();
    return NextResponse.json({
      message: `Cleaned up ${deleted} stale cache entries.`,
      deleted,
    });
  } catch (error) {
    console.error("Cache cleanup error:", error);
    return NextResponse.json({ error: "Failed to cleanup cache" }, { status: 500 });
  }
}

