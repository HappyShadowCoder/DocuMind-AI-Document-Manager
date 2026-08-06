// src/app/api/auth/me/route.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwt } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;

    if (!token) {
      return NextResponse.json(
        { message: "Not authenticated" },
        { status: 401 }
      );
    }

    const payload = (await verifyJwt(token)) as any;

    if (!payload || !payload.id) {
      return NextResponse.json(
        { message: "Invalid or expired session" },
        { status: 401 }
      );
    }

    const userId = String(payload.id);

    // Fetch full user details from the database
    let dbUser = null;
    try {
      dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          storageLimitBytes: true,
          aiProvider: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e) {
      console.warn("Could not fetch user from DB in auth/me, falling back to payload", e);
    }

    // 1. Calculate storage usage and file count dynamically
    const [storageAggregate, fileCount] = await Promise.all([
      prisma.file.aggregate({
        where: { ownerId: userId },
        _sum: { sizeBytes: true },
      }),
      prisma.file.count({
        where: { ownerId: userId },
      }),
    ]);

    // Safely convert BigInt to Number for JSON response
    const rawStorageBytes = storageAggregate._sum.sizeBytes;
    const usedStorageBytes = rawStorageBytes ? Number(rawStorageBytes) : 0;

    const userEmail = dbUser?.email || payload.email || "";
    const userFullName =
      dbUser?.fullName ||
      payload.fullName ||
      (userEmail ? userEmail.split("@")[0] : "User");

    const storageLimitBytes = dbUser?.storageLimitBytes
      ? Number(dbUser.storageLimitBytes)
      : 5368709120; // Default 5 GB

    const user = {
      id: userId,
      email: userEmail,
      fullName: userFullName,
      role: dbUser?.role || payload.role || "user",
      mustChangePassword: dbUser?.mustChangePassword ?? payload.must_change_password ?? false,
      aiProvider: dbUser?.aiProvider || "ollama",
      createdAt: dbUser?.createdAt ? dbUser.createdAt.toISOString() : null,
      updatedAt: dbUser?.updatedAt ? dbUser.updatedAt.toISOString() : null,
      storageLimitBytes,
      usedStorageBytes,
      fileCount,
    };

    return NextResponse.json(
      { user },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Session verification error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}