// src/app/api/admin/llm-concurrency/route.ts

import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getActiveLlmSessions,
  getMaxConcurrentUsers,
  setMaxConcurrentUsers,
} from "@/lib/llm-concurrency";

// Same pattern as /api/auth/me: verify the JWT cookie, then look up the
// user's current role in the DB (a JWT issued before a role change could
// otherwise still claim "admin").
async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;

  const payload = (await verifyJwt(token)) as any;
  if (!payload?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: String(payload.id) },
    select: { id: true, role: true },
  });

  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json({
    maxConcurrent: getMaxConcurrentUsers(),
    activeSessions: getActiveLlmSessions(),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const value = Number(body?.maxConcurrent);

  if (!Number.isFinite(value) || value < 1) {
    return NextResponse.json(
      { message: "maxConcurrent must be a whole number of 1 or more." },
      { status: 400 }
    );
  }

  const saved = setMaxConcurrentUsers(value);

  return NextResponse.json({
    maxConcurrent: saved,
    activeSessions: getActiveLlmSessions(),
  });
}