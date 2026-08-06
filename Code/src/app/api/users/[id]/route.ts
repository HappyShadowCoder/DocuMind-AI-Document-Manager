import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma";

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;

        if (!id) {
            return NextResponse.json(
                { error: "User ID is required." },
                { status: 400 }
            );
        }

        const body = await request.json();
        const { fullName, role, storageLimitGB } = body;

        const updateData: {
            fullName?: string;
            role?: Role;
            storageLimitBytes?: bigint;
        } = {};

        if (typeof fullName === "string") {
            updateData.fullName = fullName;
        }

        if (typeof role === "string" && (role === "admin" || role === "user")) {
            updateData.role = role as Role;
        }

        if (storageLimitGB !== undefined) {
            const parsedGB = parseFloat(storageLimitGB);
            if (isNaN(parsedGB) || parsedGB <= 0) {
                return NextResponse.json(
                    { error: "Invalid storage quota limit provided." },
                    { status: 400 }
                );
            }
            // Convert GB to Bytes as BigInt to match the Prisma schema
            updateData.storageLimitBytes = BigInt(Math.round(parsedGB * 1024 * 1024 * 1024));
        }

        // Update user in database
        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                storageLimitBytes: true,
                mustChangePassword: true,
                createdAt: true,
            },
        });

        // Dynamically calculate user's storage usage, file count, and folder count
        const [storageAggregate, fileCount, folderCount] = await Promise.all([
            prisma.file.aggregate({
                where: { ownerId: id },
                _sum: { sizeBytes: true },
            }),
            prisma.file.count({ where: { ownerId: id } }),
            prisma.folder.count({ where: { ownerId: id } }),
        ]);

        const usedStorageBytes = storageAggregate._sum.sizeBytes || 0;

        // Convert BigInt to Number for JSON response compatibility
        const formattedUser = {
            ...updatedUser,
            storageLimitBytes: Number(updatedUser.storageLimitBytes),
            usedStorageBytes,
            fileCount,
            folderCount,
        };

        return NextResponse.json({ user: formattedUser }, { status: 200 });
    } catch (error: any) {
        console.error("PATCH /api/users/[id] error:", error);

        if (error.code === "P2025") {
            return NextResponse.json(
                { error: "User not found in the database." },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: error.message || "Failed to update user." },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;

        if (!id) {
            return NextResponse.json(
                { error: "User ID is required." },
                { status: 400 }
            );
        }

        // Since onDelete: Cascade is not defined in the Prisma schema,
        // delete user's files and folders first to maintain relational integrity in SQLite.
        await prisma.$transaction([
            prisma.file.deleteMany({ where: { ownerId: id } }),
            prisma.folder.deleteMany({ where: { ownerId: id } }),
            prisma.user.delete({ where: { id } }),
        ]);

        return NextResponse.json(
            { message: "User and associated data deleted successfully." },
            { status: 200 }
        );
    } catch (error: any) {
        console.error("DELETE /api/users/[id] error:", error);

        if (error.code === "P2025") {
            return NextResponse.json(
                { error: "User not found or already deleted." },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: error.message || "Failed to delete user." },
            { status: 500 }
        );
    }
}