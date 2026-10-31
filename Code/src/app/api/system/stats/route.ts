import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import os from "os";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

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

    // 1. User metrics
    const totalUsers = await prisma.user.count();
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    const standardUserCount = totalUsers - adminCount;

    // Active in last 30 minutes
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const activeUsersList = await prisma.user.findMany({
      where: {
        OR: [
          { updatedAt: { gte: thirtyMinsAgo } },
          { id: payload.id }, // include current user
        ],
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        updatedAt: true,
      },
      take: 10,
    });
    const activeUsersCount = Math.max(1, activeUsersList.length);

    // 2. Document & Repository metrics
    const totalFiles = await prisma.file.count();
    const readyFiles = await prisma.file.count({ where: { processingStatus: "ready" } });
    const processingFiles = await prisma.file.count({ where: { processingStatus: "processing" } });
    const failedFiles = await prisma.file.count({ where: { processingStatus: "failed" } });

    // Accessible files for non-admin
    const accessibleFilesCount = isAdmin
      ? totalFiles
      : await prisma.file.count({
          where: {
            accessLevel: "all",
            OR: [{ ownerId: payload.id }, { shared: true }],
            NOT: { folder: { accessLevel: "admin" } },
          },
        });

    const totalChunks = await prisma.documentChunk.count();

    // Storage
    const storageSum = await prisma.file.aggregate({
      _sum: { sizeBytes: true },
    });
    const totalStorageBytes = Number(storageSum._sum.sizeBytes || 0);

    const userFilesSum = await prisma.file.aggregate({
      where: { ownerId: payload.id },
      _sum: { sizeBytes: true },
    });
    const userStorageBytes = Number(userFilesSum._sum.sizeBytes || 0);

    // 3. System & Server Health
    const uptimeSecs = os.uptime();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const usedMem = totalMem - freeMem;

    // Get Primary LAN IP
    const interfaces = os.networkInterfaces();
    let primaryIp = "127.0.0.1";
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          if (
            net.address.startsWith("192.168.") ||
            net.address.startsWith("10.") ||
            net.address.startsWith("172.")
          ) {
            primaryIp = net.address;
            break;
          }
        }
      }
    }

    return NextResponse.json({
      role: payload.role,
      isAdmin,
      users: {
        total: totalUsers,
        adminCount,
        standardUserCount,
        activeCount: activeUsersCount,
        activeList: activeUsersList.map((u) => ({
          name: u.fullName || u.email,
          email: u.email,
          role: u.role,
          isCurrentUser: u.id === payload.id,
        })),
      },
      repository: {
        totalDocuments: totalFiles,
        accessibleDocuments: accessibleFilesCount,
        processedReady: readyFiles,
        inProgress: processingFiles,
        failed: failedFiles,
        totalChunks,
        totalStorage: formatBytes(totalStorageBytes),
        totalStorageBytes,
        userStorage: formatBytes(userStorageBytes),
        userStorageBytes,
      },
      system: {
        serverUptime: formatUptime(uptimeSecs),
        serverTime: new Date().toLocaleTimeString("en-IN", { hour12: true }),
        serverDate: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        platform: `${os.platform()} (${os.arch()})`,
        memoryUsed: formatBytes(usedMem),
        memoryTotal: formatBytes(totalMem),
        memoryPercent: Math.round((usedMem / totalMem) * 100),
        lanIp: primaryIp,
        aiProvider: "Ollama (Local Host)",
      },
    });
  } catch (error) {
    console.error("Failed to load system stats:", error);
    return NextResponse.json({ error: "Failed to load system stats." }, { status: 500 });
  }
}
