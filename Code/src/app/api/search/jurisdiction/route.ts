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

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state")?.trim() || "";
    const district = searchParams.get("district")?.trim() || "";
    const subDivision = searchParams.get("subDivision")?.trim() || "";

    // 1. All distinct states
    const stateRows = await prisma.documentMetadata.findMany({
      where: { state: { not: null } },
      select: { state: true },
      distinct: ["state"],
      orderBy: { state: "asc" },
    });
    let states = stateRows.map((r) => r.state).filter(Boolean) as string[];
    if (states.length === 0) {
      states = ["Manipur"];
    }

    // 2. Districts filtered by state (if state is selected)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const districtWhere: Record<string, any> = { district: { not: null } };
    if (state) districtWhere.state = { equals: state, mode: "insensitive" };

    const districtRows = await prisma.documentMetadata.findMany({
      where: districtWhere,
      select: { district: true },
      distinct: ["district"],
      orderBy: { district: "asc" },
    });
    const districts = districtRows.map((r) => r.district).filter(Boolean) as string[];

    // 3. Sub-divisions filtered by state + district
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subDivisionWhere: Record<string, any> = { subDivision: { not: null } };
    if (state) subDivisionWhere.state = { equals: state, mode: "insensitive" };
    if (district) subDivisionWhere.district = { equals: district, mode: "insensitive" };

    const subDivisionRows = await prisma.documentMetadata.findMany({
      where: subDivisionWhere,
      select: { subDivision: true },
      distinct: ["subDivision"],
      orderBy: { subDivision: "asc" },
    });
    const subDivisions = subDivisionRows.map((r) => r.subDivision).filter(Boolean) as string[];

    // 4. Police stations filtered by state + district + subDivision
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policeStationWhere: Record<string, any> = { policeStation: { not: null } };
    if (state) policeStationWhere.state = { equals: state, mode: "insensitive" };
    if (district) policeStationWhere.district = { equals: district, mode: "insensitive" };
    if (subDivision) policeStationWhere.subDivision = { equals: subDivision, mode: "insensitive" };

    const policeStationRows = await prisma.documentMetadata.findMany({
      where: policeStationWhere,
      select: { policeStation: true },
      distinct: ["policeStation"],
      orderBy: { policeStation: "asc" },
    });
    const policeStations = policeStationRows.map((r) => r.policeStation).filter(Boolean) as string[];

    return NextResponse.json({ states, districts, subDivisions, policeStations });
  } catch (err) {
    console.error("Jurisdiction fetch error:", err);
    return NextResponse.json({ error: "Failed to load jurisdiction options" }, { status: 500 });
  }
}
