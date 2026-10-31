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
    if (!payload || !payload.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const rawFolderId = searchParams.get("folderId");

    const parentId =
      rawFolderId && rawFolderId !== "null" && rawFolderId !== "undefined"
        ? rawFolderId
        : null;

    let folders = [];

    if (category === "shared") {
      // Fetch shared folders; non-admin users only see accessLevel='all'
      const isAdmin = payload.role === "admin";
      folders = await prisma.folder.findMany({
        where: {
          parentId: parentId,
          shared: true,
          ...(!isAdmin ? { accessLevel: "all" } : {}),
        },
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
        orderBy: { createdAt: "desc" },
      });
    } else {
      // Fetch user's personal non-shared folders + include owner info
      folders = await prisma.folder.findMany({
        where: {
          ownerId: String(payload.id),
          parentId: parentId,
          shared: false,
        },
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
        orderBy: { name: "asc" },
      });
    }

    // Map the returned folders so they match the frontend's FileOwner interface
    const formattedFolders = folders.map((folder) => ({
      ...folder,
      fileCount: folder._count?.files ?? 0,
      owner: {
        ...folder.owner,
        name: folder.owner?.fullName || folder.owner?.email || "Unknown",
      },
    }));

    return NextResponse.json({ folders: formattedFolders }, { status: 200 });
  } catch (error: any) {
    console.error("GET /api/folders error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch folders." },
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
    if (!payload || !payload.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: String(payload.id) },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "User record not found. Please log out and log in again." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { name, parentId, folderId, category, shared, isShared, accessLevel } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Folder name is required." },
        { status: 400 }
      );
    }

    const targetParentId = parentId || folderId || null;
    const sanitizedParentId =
      targetParentId && targetParentId !== "null" && targetParentId !== "undefined"
        ? targetParentId
        : null;

    let parentFolderAccessLevel: string | null = null;
    if (sanitizedParentId) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: sanitizedParentId },
      });

      if (!parentFolder) {
        return NextResponse.json(
          { error: "Parent folder not found." },
          { status: 404 }
        );
      }
      parentFolderAccessLevel = parentFolder.accessLevel;
    }

    // Determine if the folder should be created as shared
    const isFolderShared =
      Boolean(shared) || Boolean(isShared) || category === "shared";

    // Determine access level: inherit from parent if admin, or use explicit value
    let resolvedAccessLevel: "all" | "admin" = "all";
    if (parentFolderAccessLevel === "admin") {
      // Inherit admin-only from parent
      resolvedAccessLevel = "admin";
    } else if (accessLevel === "admin" && dbUser.role === "admin") {
      resolvedAccessLevel = "admin";
    }

    const newFolder = await prisma.folder.create({
      data: {
        name: name.trim(),
        ownerId: dbUser.id,
        parentId: sanitizedParentId,
        shared: isFolderShared,
        accessLevel: resolvedAccessLevel,
      },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    // Format the newly created folder to include 'name'
    const formattedFolder = {
      ...newFolder,
      owner: {
        ...newFolder.owner,
        name: newFolder.owner?.fullName || newFolder.owner?.email || "Unknown",
      },
    };

    return NextResponse.json(
      { message: "Folder created successfully.", folder: formattedFolder },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/folders error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create folder." },
      { status: 500 }
    );
  }
}