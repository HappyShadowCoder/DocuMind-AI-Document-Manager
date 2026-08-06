import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rawUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        storageLimitBytes: true,
        mustChangePassword: true,
        createdAt: true,
        _count: {
          select: {
            files: true,
            folders: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Calculate aggregated file sizes per user
    const storageSums = await prisma.file.groupBy({
      by: ["ownerId"],
      _sum: {
        sizeBytes: true,
      },
    });

    const storageMap = new Map<string, number>();
    for (const item of storageSums) {
      // Explicitly convert BigInt to Number to prevent BigInt mixing errors
      storageMap.set(item.ownerId, Number(item._sum.sizeBytes || 0));
    }

    let totalStorageUsedBytes = 0;
    let totalStorageLimitBytes = 0;
    let totalFilesCount = 0;
    let totalFoldersCount = 0;

    const formattedUsers = rawUsers.map((user) => {
      const usedStorage = Number(storageMap.get(user.id) || 0);
      const limitBytes = Number(user.storageLimitBytes || 0);

      totalStorageUsedBytes += usedStorage;
      totalStorageLimitBytes += limitBytes;
      totalFilesCount += user._count.files;
      totalFoldersCount += user._count.folders;

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName || "N/A",
        role: user.role,
        storageLimitBytes: limitBytes,
        usedStorageBytes: usedStorage,
        fileCount: user._count.files,
        folderCount: user._count.folders,
        mustChangePassword: Boolean(user.mustChangePassword),
        createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
      };
    });

    return NextResponse.json({
      users: formattedUsers,
      metrics: {
        totalUsersCount: formattedUsers.length,
        totalFilesCount,
        totalFoldersCount,
        totalStorageUsedBytes,
        totalStorageLimitBytes,
      },
    });
  } catch (error: any) {
    console.error("GET /api/users error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch users." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, fullName, role, storageLimitGB, mustChangePassword } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 400 }
      );
    }

    // Assign fallback password if omitted in request
    const plainPassword = (typeof password === "string" && password.trim() !== "")
      ? password
      : "TempPass123!";

    // Hash password using bcryptjs if installed, or fallback to plain text string
    let passwordHash = plainPassword;
    try {
      const bcrypt = await import("bcryptjs");
      passwordHash = await bcrypt.hash(plainPassword, 10);
    } catch {
      passwordHash = plainPassword;
    }

    const gbNum = parseFloat(storageLimitGB || "5");
    const limitInBytes = BigInt(Math.round(gbNum * 1024 * 1024 * 1024));

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: fullName || null,
        role: role || "user",
        storageLimitBytes: limitInBytes,
        mustChangePassword: mustChangePassword !== undefined ? Boolean(mustChangePassword) : true,
      },
    });

    return NextResponse.json(
      {
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName || "N/A",
          role: newUser.role,
          storageLimitBytes: Number(newUser.storageLimitBytes),
          usedStorageBytes: 0,
          fileCount: 0,
          folderCount: 0,
          mustChangePassword: newUser.mustChangePassword,
          createdAt: newUser.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/users error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create user." },
      { status: 500 }
    );
  }
}