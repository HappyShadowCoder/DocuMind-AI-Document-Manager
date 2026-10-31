import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import { ensureFirMetadata } from "@/lib/pdf-processing";

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

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId")?.trim() || "";
    const query = searchParams.get("query")?.trim() || "";
    const state = searchParams.get("state")?.trim() || "";
    const district = searchParams.get("district")?.trim() || "";
    const subDivision = searchParams.get("subDivision")?.trim() || "";
    const policeStation = searchParams.get("policeStation")?.trim() || "";
    const fromDate = searchParams.get("fromDate")?.trim() || "";
    const toDate = searchParams.get("toDate")?.trim() || "";

    if (fileId) {
      await ensureFirMetadata(fileId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (fileId) {
      where.fileId = fileId;
    }
    if (query) {
      where.firNumber = { contains: query, mode: "insensitive" };
    }
    if (state) {
      where.state = { equals: state, mode: "insensitive" };
    }
    if (district) {
      where.district = { equals: district, mode: "insensitive" };
    }
    if (subDivision) {
      where.subDivision = { equals: subDivision, mode: "insensitive" };
    }
    if (policeStation) {
      where.policeStation = { equals: policeStation, mode: "insensitive" };
    }
    if (fromDate || toDate) {
      const firDateFilter: Record<string, Date> = {};
      if (fromDate) {
        const d = new Date(fromDate);
        if (!isNaN(d.getTime())) firDateFilter.gte = d;
      }
      if (toDate) {
        const d = new Date(toDate);
        d.setHours(23, 59, 59, 999);
        if (!isNaN(d.getTime())) firDateFilter.lte = d;
      }
      if (Object.keys(firDateFilter).length > 0) {
        where.firDate = firDateFilter;
      }
    }

    const results = await prisma.documentMetadata.findMany({
      where,
      orderBy: { firDate: "desc" },
      take: 200,
      select: {
        id: true,
        state: true,
        firNumber: true,
        firDate: true,
        district: true,
        subDivision: true,
        policeStation: true,
        propertyLoss: true,
        actsAndSections: true,
        zeroFirReference: true,
        fileId: true,
        file: {
          select: { id: true, name: true },
        },
      },
    });

    const formatted = results.map((r) => ({
      id: r.id,
      fileId: r.fileId,
      fileName: r.file.name,
      state: r.state,
      firNumber: r.firNumber,
      firDate: r.firDate ? r.firDate.toISOString().split("T")[0] : null,
      district: r.district,
      subDivision: r.subDivision,
      policeStation: r.policeStation,
      propertyLoss: r.propertyLoss,
      actsAndSections: r.actsAndSections,
      zeroFirReference: r.zeroFirReference,
    }));

    return NextResponse.json({ results: formatted, total: formatted.length });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
