import { prisma } from "@/lib/prisma";

export interface PoliceStatsPayload {
  userId: string;
  role: "admin" | "user";
  userName?: string | null;
  userEmail: string;
}

export interface StationStat {
  name: string;
  rawNames: string[];
  count: number;
  percentage: number;
  district: string;
  propertyLoss: number;
  firNumbers: string[];
}

export interface DistrictStat {
  name: string;
  count: number;
  percentage: number;
}

export interface CrimeCategoryStat {
  id: string;
  name: string;
  acts: string;
  count: number;
  percentage: number;
  severity: "critical" | "high" | "medium" | "moderate";
  color: string;
  examples: string[];
}

export interface HighLossCase {
  firNumber: string;
  policeStation: string;
  district: string;
  propertyLoss: number;
  formattedLoss: string;
  acts: string[];
}

export interface ZeroFirCase {
  firNumber: string;
  policeStation: string;
  district: string;
  zeroFirReference: string;
  acts: string[];
}

export interface PoliceStatsData {
  scope: "state_admin" | "unit_officer";
  scopeLabel: string;
  generatedAt: string;
  summary: {
    totalFiles: number;
    totalFirs: number;
    totalStations: number;
    totalDistricts: number;
    totalPropertyLoss: number;
    formattedTotalLoss: string;
    zeroFirCount: number;
    scannedCount: number;
    digitalCount: number;
    searchReadyCount: number;
    processingCount: number;
  };
  stations: StationStat[];
  districts: DistrictStat[];
  crimeCategories: CrimeCategoryStat[];
  highLossCases: HighLossCase[];
  zeroFirs: ZeroFirCase[];
  personnel: {
    totalPersonnel: number;
    activeNow: number;
    dutyOfficers: string[];
    requestingOfficer: string;
    isOfficerAdmin: boolean;
  };
  technical: {
    aiModel: string;
    storageMb: string;
    vectorChunks: number;
  };
  suggestedQueries: string[];
}

export function formatIndianCurrency(amount: number): string {
  if (!amount || isNaN(amount)) return "₹ 0";
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹ ${cr.toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    const lk = amount / 100000;
    return `₹ ${lk.toFixed(2)} Lakh`;
  }
  return `₹ ${new Intl.NumberFormat("en-IN").format(amount)}`;
}

export function formatIndianFullNumber(amount: number): string {
  if (!amount || isNaN(amount)) return "₹ 0";
  return `₹ ${new Intl.NumberFormat("en-IN").format(amount)}`;
}

function getCanonicalStation(rawPs: string | null | undefined): { name: string; districtFallback?: string } {
  if (!rawPs || !rawPs.trim()) return { name: "Headquarters / Unassigned PS" };
  const upper = rawPs.toUpperCase().trim();

  if (upper.includes("CITY")) return { name: "City Police Station", districtFallback: "Imphal West" };
  if (upper.includes("LIL") || upper.includes("LILONG")) return { name: "Lilong Police Station (LIL-PS)", districtFallback: "Thoubal" };
  if (upper.includes("KKL") || upper.includes("KASOM")) return { name: "Kasom Khullen Police Station (KKL-PS)", districtFallback: "Kamjong" };
  if (upper.includes("LAMPHEL") || upper.includes("LPS")) return { name: "Lamphel Police Station (LPS)", districtFallback: "Imphal West" };
  if (upper.includes("WKG") || upper.includes("WAIKHONG")) return { name: "Waikhong Police Station (WKG-PS)", districtFallback: "Kakching" };
  if (upper.includes("CCP") || upper.includes("CHURACHANDPUR")) return { name: "Churachandpur Police Station (CCP-PS)", districtFallback: "Churachandpur" };

  return { name: rawPs.trim() };
}

function makeAsciiBar(percentage: number, length: number = 16): string {
  const filled = Math.max(0, Math.min(length, Math.round((percentage / 100) * length)));
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export async function generatePoliceStatsReport({
  userId,
  role,
  userName,
  userEmail,
}: PoliceStatsPayload): Promise<{ json: PoliceStatsData; markdown: string }> {
  const isAdmin = role === "admin";

  // 1. Retrieve files & metadata with respect to permissions
  const accessibleFiles = await prisma.file.findMany({
    where: isAdmin
      ? {}
      : {
          accessLevel: "all",
          OR: [{ ownerId: userId }, { shared: true }],
          NOT: { folder: { accessLevel: "admin" } },
        },
    include: {
      documentMetadata: true,
      owner: { select: { fullName: true, email: true, id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalFiles = accessibleFiles.length;
  let readyCount = 0;
  let processingCount = 0;
  let scannedCount = 0;
  let digitalCount = 0;
  let totalLoss = 0;
  let zeroFirCount = 0;

  const stationMap = new Map<string, {
    name: string;
    rawNames: Set<string>;
    count: number;
    district: string;
    propertyLoss: number;
    firNumbers: string[];
  }>();

  const districtMap = new Map<string, number>();

  const crimeCategoryCounts: Record<string, {
    count: number;
    firExamples: string[];
  }> = {
    theft: { count: 0, firExamples: [] },
    rioting: { count: 0, firExamples: [] },
    narcotics: { count: 0, firExamples: [] },
    violent: { count: 0, firExamples: [] },
    arms: { count: 0, firExamples: [] },
    atrocities: { count: 0, firExamples: [] },
    intimidation: { count: 0, firExamples: [] },
    other: { count: 0, firExamples: [] },
  };

  const highLossCasesList: HighLossCase[] = [];
  const zeroFirsList: ZeroFirCase[] = [];

  for (const file of accessibleFiles) {
    if (file.processingStatus === "ready") readyCount++;
    else if (file.processingStatus === "processing") processingCount++;

    if (file.isScanned) scannedCount++;
    else digitalCount++;

    const meta = file.documentMetadata;
    const firNum = meta?.firNumber || file.name.replace(/\.pdf$/i, "");

    if (meta) {
      if (meta.propertyLoss && !isNaN(Number(meta.propertyLoss))) {
        const lossVal = Number(meta.propertyLoss);
        if (lossVal > 0) {
          totalLoss += lossVal;
          const actsList = Array.isArray(meta.actsAndSections)
            ? (meta.actsAndSections as string[])
            : [];
          highLossCasesList.push({
            firNumber: meta.firNumber || file.name,
            policeStation: meta.policeStation || "Unknown PS",
            district: meta.district || "Unassigned",
            propertyLoss: lossVal,
            formattedLoss: formatIndianCurrency(lossVal),
            acts: actsList,
          });
        }
      }

      if (meta.zeroFirReference && meta.zeroFirReference.trim()) {
        zeroFirCount++;
        const actsList = Array.isArray(meta.actsAndSections)
          ? (meta.actsAndSections as string[])
          : [];
        zeroFirsList.push({
          firNumber: meta.firNumber || file.name,
          policeStation: meta.policeStation || "Unknown PS",
          district: meta.district || "Unassigned",
          zeroFirReference: meta.zeroFirReference.trim(),
          acts: actsList,
        });
      }

      // Station aggregation
      const canonical = getCanonicalStation(meta.policeStation);
      const dist = meta.district?.trim() || canonical.districtFallback || "Unassigned District";

      if (!stationMap.has(canonical.name)) {
        stationMap.set(canonical.name, {
          name: canonical.name,
          rawNames: new Set(meta.policeStation ? [meta.policeStation] : []),
          count: 0,
          district: dist,
          propertyLoss: 0,
          firNumbers: [],
        });
      }
      const st = stationMap.get(canonical.name)!;
      st.count += 1;
      if (meta.policeStation) st.rawNames.add(meta.policeStation);
      if (meta.propertyLoss) st.propertyLoss += Number(meta.propertyLoss);
      if (meta.firNumber && !st.firNumbers.includes(meta.firNumber)) {
        st.firNumbers.push(meta.firNumber);
      }

      // District aggregation
      districtMap.set(dist, (districtMap.get(dist) || 0) + 1);

      // Crime categorization
      const actsArr = Array.isArray(meta.actsAndSections)
        ? (meta.actsAndSections as string[])
        : [];
      const actsCombined = actsArr.join(" ").toUpperCase();
      let categorized = false;

      if (actsCombined.includes("143") || actsCombined.includes("436") || actsCombined.includes("427") || actsCombined.includes("397") || actsCombined.includes("RIOTING")) {
        crimeCategoryCounts.rioting.count++;
        if (firNum && !crimeCategoryCounts.rioting.firExamples.includes(firNum)) crimeCategoryCounts.rioting.firExamples.push(firNum);
        categorized = true;
      }
      if (actsCombined.includes("303") || actsCombined.includes("305") || actsCombined.includes("331") || actsCombined.includes("379") || actsCombined.includes("380") || actsCombined.includes("THEFT")) {
        crimeCategoryCounts.theft.count++;
        if (firNum && !crimeCategoryCounts.theft.firExamples.includes(firNum)) crimeCategoryCounts.theft.firExamples.push(firNum);
        categorized = true;
      }
      if (actsCombined.includes("ND&PS") || actsCombined.includes("NDPS") || actsCombined.includes("NARCOTIC")) {
        crimeCategoryCounts.narcotics.count++;
        if (firNum && !crimeCategoryCounts.narcotics.firExamples.includes(firNum)) crimeCategoryCounts.narcotics.firExamples.push(firNum);
        categorized = true;
      }
      if (actsCombined.includes("109") || actsCombined.includes("118") || actsCombined.includes("307") || actsCombined.includes("323") || actsCombined.includes("324") || actsCombined.includes("HURT")) {
        crimeCategoryCounts.violent.count++;
        if (firNum && !crimeCategoryCounts.violent.firExamples.includes(firNum)) crimeCategoryCounts.violent.firExamples.push(firNum);
        categorized = true;
      }
      if (actsCombined.includes("ARMS") || actsCombined.includes("WEAPON") || actsCombined.includes("FIREARM")) {
        crimeCategoryCounts.arms.count++;
        if (firNum && !crimeCategoryCounts.arms.firExamples.includes(firNum)) crimeCategoryCounts.arms.firExamples.push(firNum);
        categorized = true;
      }
      if (actsCombined.includes("SC/ST") || actsCombined.includes("SC&ST") || actsCombined.includes("ATROCITIES")) {
        crimeCategoryCounts.atrocities.count++;
        if (firNum && !crimeCategoryCounts.atrocities.firExamples.includes(firNum)) crimeCategoryCounts.atrocities.firExamples.push(firNum);
        categorized = true;
      }
      if (actsCombined.includes("351") || actsCombined.includes("INTIMIDATION") || actsCombined.includes("THREAT")) {
        crimeCategoryCounts.intimidation.count++;
        if (firNum && !crimeCategoryCounts.intimidation.firExamples.includes(firNum)) crimeCategoryCounts.intimidation.firExamples.push(firNum);
        categorized = true;
      }
      if (!categorized && actsCombined.length > 0) {
        crimeCategoryCounts.other.count++;
        if (firNum) crimeCategoryCounts.other.firExamples.push(firNum);
      }
    }
  }

  // Sort high loss cases descending
  highLossCasesList.sort((a, b) => b.propertyLoss - a.propertyLoss);

  // Compute station stats list
  const totalFirsCount = accessibleFiles.filter((f) => !!f.documentMetadata?.firNumber || !!f.documentMetadata).length || totalFiles;
  const stationsList: StationStat[] = Array.from(stationMap.values())
    .map((s) => ({
      name: s.name,
      rawNames: Array.from(s.rawNames),
      count: s.count,
      percentage: totalFirsCount > 0 ? Math.round((s.count / totalFirsCount) * 100) : 0,
      district: s.district,
      propertyLoss: s.propertyLoss,
      firNumbers: s.firNumbers.slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count);

  // Compute district stats list
  const districtsList: DistrictStat[] = Array.from(districtMap.entries())
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalFirsCount > 0 ? Math.round((count / totalFirsCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Crime category stats list
  const crimeCategoryDefinitions: {
    id: string;
    name: string;
    acts: string;
    severity: "critical" | "high" | "medium" | "moderate";
    color: string;
  }[] = [
    {
      id: "theft",
      name: "Theft, Burglary & House-Trespass",
      acts: "BNS 303, 305, 331 / IPC 379, 380",
      severity: "high",
      color: "#F59E0B", // amber
    },
    {
      id: "rioting",
      name: "Arson, Rioting & Deadly Weapons",
      acts: "IPC 143, 148, 427, 436, 397, 34",
      severity: "critical",
      color: "#EF4444", // crimson
    },
    {
      id: "narcotics",
      name: "Narcotics & Psychotropic Contraband",
      acts: "ND&PS Act (Sec 18, 20, 21)",
      severity: "high",
      color: "#8B5CF6", // purple
    },
    {
      id: "violent",
      name: "Attempted Murder & Grievous Hurt",
      acts: "BNS 109, 118 / IPC 307, 324, 326",
      severity: "critical",
      color: "#EC4899", // pink
    },
    {
      id: "atrocities",
      name: "Atrocities on Marginalized Groups",
      acts: "SC/ST (Prevention of Atrocities) Act",
      severity: "high",
      color: "#6366F1", // indigo
    },
    {
      id: "arms",
      name: "Unlawful Firearms & Arms Act",
      acts: "Arms Act, 1959 (Sec 25)",
      severity: "critical",
      color: "#DC2626", // red
    },
    {
      id: "intimidation",
      name: "Criminal Intimidation & Threats",
      acts: "BNS 351, 3(5) / IPC 506",
      severity: "moderate",
      color: "#06B6D4", // cyan
    },
  ];

  const crimeCategoriesList: CrimeCategoryStat[] = crimeCategoryDefinitions
    .map((def) => {
      const data = crimeCategoryCounts[def.id] || { count: 0, firExamples: [] };
      return {
        id: def.id,
        name: def.name,
        acts: def.acts,
        count: data.count,
        percentage: totalFirsCount > 0 ? Math.round((data.count / totalFirsCount) * 100) : 0,
        severity: def.severity,
        color: def.color,
        examples: data.firExamples.slice(0, 3),
      };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // Personnel details
  const totalUsers = await prisma.user.count();
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
  const activeUsers = await prisma.user.findMany({
    where: { OR: [{ updatedAt: { gte: thirtyMinsAgo } }, { id: userId }] },
    select: { fullName: true, email: true, id: true, role: true },
    take: 8,
  });

  const dutyOfficers = activeUsers.map(
    (u) => (u.fullName || u.email.split("@")[0]) + (u.id === userId ? " (You)" : "")
  );

  // Technical metrics
  const totalChunks = await prisma.documentChunk.count();
  const storageSum = await prisma.file.aggregate({ _sum: { sizeBytes: true } });
  const totalStorageMb = (Number(storageSum._sum.sizeBytes || 0) / (1024 * 1024)).toFixed(2);

  const formattedLossStr = formatIndianCurrency(totalLoss);
  const formattedFullLossStr = formatIndianFullNumber(totalLoss);

  const statsJson: PoliceStatsData = {
    scope: isAdmin ? "state_admin" : "unit_officer",
    scopeLabel: isAdmin
      ? "Headquarters & State Command (All Jurisdictions)"
      : "Assigned Police Station & Permitted Scope",
    generatedAt: new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) + " " + new Date().toLocaleTimeString("en-IN", { hour12: true }),
    summary: {
      totalFiles,
      totalFirs: totalFirsCount,
      totalStations: stationsList.length,
      totalDistricts: districtsList.length,
      totalPropertyLoss: totalLoss,
      formattedTotalLoss: formattedLossStr,
      zeroFirCount,
      scannedCount,
      digitalCount,
      searchReadyCount: readyCount,
      processingCount,
    },
    stations: stationsList,
    districts: districtsList,
    crimeCategories: crimeCategoriesList,
    highLossCases: highLossCasesList.slice(0, 6),
    zeroFirs: zeroFirsList,
    personnel: {
      totalPersonnel: totalUsers,
      activeNow: activeUsers.length,
      dutyOfficers,
      requestingOfficer: userName || userEmail.split("@")[0],
      isOfficerAdmin: isAdmin,
    },
    technical: {
      aiModel: "llama3.1:8b (Ollama local inference)",
      storageMb: totalStorageMb,
      vectorChunks: totalChunks,
    },
    suggestedQueries: [
      `Show details of all cases from ${stationsList[0]?.name || "City Police Station"}`,
      "Summarize all NDPS narcotics seizure cases",
      "List cases with highest reported property damage",
      "Explain the Zero FIR transfer under SC/ST Act",
    ],
  };

  // Generate Police Executive Briefing in Markdown
  const markdownLines: string[] = [];

  // Embedding JSON block for client component interception
  markdownLines.push("```police-stats");
  markdownLines.push(JSON.stringify(statsJson, null, 2));
  markdownLines.push("```");
  markdownLines.push("");

  // Professional markdown briefing
  markdownLines.push("## 🛡️ Crime Records Bureau (CRB) Intelligence Briefing");
  markdownLines.push(`**Jurisdiction Scope:** ${statsJson.scopeLabel} | **Timestamp:** ${statsJson.generatedAt}`);
  markdownLines.push("");

  // Executive Overview Table
  markdownLines.push("### 📊 Executive Summary");
  markdownLines.push("| Metric | Count / Valuation | Status / Details |");
  markdownLines.push("| :--- | :--- | :--- |");
  markdownLines.push(`| **Total Registered Case Dossiers** | **${totalFirsCount} FIRs** (${totalFiles} docs) | Indexed & Semantically Searchable |`);
  markdownLines.push(`| **Active Police Stations** | **${stationsList.length} Stations** | Across ${districtsList.length} Operational Districts |`);
  markdownLines.push(`| **Reported Property Loss Tracked** | **${formattedLossStr}** (${formattedFullLossStr}) | Valuation recorded across crime scenes |`);
  markdownLines.push(`| **Cross-Jurisdiction Zero FIRs** | **${zeroFirCount} Cases** | Inter-station transfer references logged |`);
  markdownLines.push(`| **Evidence OCR Digitization** | **${scannedCount} Scanned / ${digitalCount} Digital** | ${Math.round((scannedCount / Math.max(1, totalFiles)) * 100)}% physical case files OCR-converted |`);
  markdownLines.push(`| **Investigating Officers Online** | **${activeUsers.length} Active** (${totalUsers} registered) | Duty Roster: ${dutyOfficers.join(", ")} |`);
  markdownLines.push("");

  // Police Station Distribution with visual ASCII mini-bars
  markdownLines.push("### 🏢 Police Station FIR Volume Distribution");
  markdownLines.push("| Police Station | District | FIRs | Share | Volume Graph |");
  markdownLines.push("| :--- | :--- | :---: | :---: | :--- |");
  for (const st of stationsList) {
    const bar = makeAsciiBar(st.percentage, 12);
    markdownLines.push(`| **${st.name}** | ${st.district} | ${st.count} | ${st.percentage}% | \`${bar}\` |`);
  }
  markdownLines.push("");

  // Major Crime Categories (IPC / BNS)
  markdownLines.push("### ⚖️ Crime Classifications & Statutory Enactments (IPC / BNS)");
  markdownLines.push("| Offense Category | Governing Acts & Sections | Cases | Proportion |");
  markdownLines.push("| :--- | :--- | :---: | :--- |");
  for (const cat of crimeCategoriesList) {
    const bar = makeAsciiBar(cat.percentage, 10);
    markdownLines.push(`| **${cat.name}** | \`${cat.acts}\` | ${cat.count} | \`${bar}\` ${cat.percentage}% |`);
  }
  markdownLines.push("");

  // Property Loss Leaderboard
  if (highLossCasesList.length > 0) {
    markdownLines.push("### 💰 High-Valuation Incident Records (Reported Property Loss)");
    markdownLines.push("| FIR Number | Police Station | Primary Sections | Reported Damage Valuation |");
    markdownLines.push("| :--- | :--- | :--- | :---: |");
    for (const h of highLossCasesList.slice(0, 4)) {
      const actShort = h.acts.slice(0, 2).join(", ") || "Recorded Offenses";
      markdownLines.push(`| **${h.firNumber}** | ${h.policeStation} | \`${actShort}\` | **${h.formattedLoss}** |`);
    }
    markdownLines.push("");
  }

  // Zero FIR Note
  if (zeroFirsList.length > 0) {
    markdownLines.push("### 🔄 Cross-Jurisdiction Transfer Records (Zero FIRs)");
    for (const z of zeroFirsList) {
      markdownLines.push(`- **FIR ${z.firNumber}** (${z.policeStation}, ${z.district}) — Transferred from Zero FIR Reference: **\`${z.zeroFirReference}\`** under \`${z.acts.join(", ") || "Special Acts"}\``);
    }
    markdownLines.push("");
  }

  // Actionable prompts
  markdownLines.push("💡 *Tip: Click any interactive graph tab or suggestion chip above in the interactive dashboard to instantly investigate specific crime patterns, stations, or statutory offenses.*");

  return {
    json: statsJson,
    markdown: markdownLines.join("\n"),
  };
}
