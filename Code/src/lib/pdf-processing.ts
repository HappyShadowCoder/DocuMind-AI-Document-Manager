import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  completeChat,
  embedTexts,
  getAiSettingsForUser,
  type AiSettings,
  type ChatTurn,
} from "@/lib/ai";
import { extractPdfPages, type PdfPageText } from "@/services/ocrService";
import type { FolderFileInventoryItem } from "@/lib/pdf-chat";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

export interface TextChunk {
  chunkIndex: number;
  pageNumber: number;
  content: string;
}

export function chunkPdfPages(pages: PdfPageText[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;

    if (text.length <= CHUNK_SIZE) {
      chunks.push({ chunkIndex: chunkIndex++, pageNumber: page.pageNumber, content: text });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      const slice = text.slice(start, end).trim();
      if (slice) {
        chunks.push({ chunkIndex: chunkIndex++, pageNumber: page.pageNumber, content: slice });
      }
      if (end >= text.length) break;
      start = Math.max(start + 1, end - CHUNK_OVERLAP);
    }
  }

  return chunks;
}

async function storeChunksWithEmbeddings(
  fileId: string,
  chunks: TextChunk[],
  embeddings: number[][]
): Promise<void> {
  await prisma.documentChunk.deleteMany({ where: { fileId } });

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const sanitizedContent = chunk.content.replace(/\0|\u0000/g, "");
    const vectorString = `[${embeddings[i].join(",")}]`;

    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk" ("id", "fileId", "chunkIndex", "pageNumber", "content", "tokenCount", "embedding", "createdAt")
      VALUES (
        ${randomUUID()},
        ${fileId},
        ${chunk.chunkIndex},
        ${chunk.pageNumber},
        ${sanitizedContent},
        ${Math.ceil(sanitizedContent.length / 4)},
        ${vectorString}::vector,
        NOW()
      )
    `;
  }
}

async function generateSummary(fullText: string, fileName: string, settings: AiSettings): Promise<string> {
  const excerpt = fullText.slice(0, 8000);
  const messages: ChatTurn[] = [
    {
      role: "system",
      content:
        "Summarize the document in 2-4 concise sentences. Mention the document type and key topics covered. Do not invent details.",
    },
    {
      role: "user",
      content: `Document: "${fileName}"\n\n${excerpt}`,
    },
  ];

  return completeChat(messages, settings);
}

function parseFirDate(raw: unknown): Date | null {
  if (!raw || typeof raw !== "string") return null;
  const str = raw.trim();
  if (!str) return null;

  // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (Standard Indian format)
  const dmyMatch = str.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    if (!isNaN(d.getTime())) return d;
  }

  // 2. YYYY/MM/DD or YYYY-MM-DD
  const ymdMatch = str.match(/\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Fallback standard parse with UTC midday normalization
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate(), 12, 0, 0));
  }

  return null;
}

async function extractFirMetadata(
  fullText: string,
  fileName: string,
  settings: AiSettings
): Promise<Record<string, unknown> | null> {
  const excerpt = fullText.slice(0, 12000);
  const systemPrompt = `You are a forensic data extraction AI specializing in Indian Police FIR (First Information Report) documents.
Extract structured metadata from the following FIR document. Return ONLY a valid JSON object with these exact fields. If a field is missing, set it to null.

{
  "state": "string or null — e.g. 'Manipur'",
  "fir_number": "string or null — e.g. '82(07)2023 WKG-PS'",
  "fir_date_created": "string or null — e.g. '2023-07-29' or '29/07/2023'",
  "district": "string or null — e.g. 'Kakching'",
  "sub_division": "string or null — e.g. 'Waikhong'",
  "police_station": "string or null — e.g. 'WKG-PS'",
  "property_loss_inr": "number or null — e.g. 2350000",
  "acts_and_sections": ["array of strings — e.g. ['143/148/427/436/34 IPC']"],
  "zero_fir_reference": "string or null — e.g. '00(7)2023 CCP-PS'"
}

FIR DATE EXTRACTION GUIDELINES (CRITICAL):
- Inspect fields like "Date and hour when reported", "Date of report", "Date of dispatch from police station", or "Date & hour of occurrence".
- Example: If the table says "Date and hour when reported: On 29/07/2023 at 4:45 PM", extract "2023-07-29" or "29/07/2023".
- Look carefully at the first column of the table under "Date and hour when reported".

ACTS & SECTIONS EXTRACTION GUIDELINES (CRITICAL):
- Carefully parse Item 2 of the FIR table ("Acts", "Sections", "Description of offence").
- Extract every listed Act and Section. Do not omit rows or special acts (e.g. Arms Act 25(1-C), NDPS Act, POCSO).
- Keep each legal Act and Section distinct: e.g. ["351(2) BNS - Punishment for criminal Intimidation", "3(5) BNS - Common Intention", "25(1-C) Arms Act - Unauthorised possession of fire arms or ammunitions"].
- Never conflate a Penal Code section (such as 3(5) BNS) with a special act (such as Arms Act).

RULES:
- Output ONLY raw JSON. No explanation, no markdown code fences.
- For property_loss_inr, convert values like "23,50,000" or "Rs. 23.5 Lakhs" into pure numeric amounts (e.g., 2350000).`;

  const messages: ChatTurn[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Document name: "${fileName}"\n\n${excerpt}` },
  ];

  try {
    const rawResponse = await completeChat(messages, settings);
    const cleaned = rawResponse
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch {
    return null;
  }
}

export async function processPdfFile(fileId: string): Promise<void> {
  const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
  if (!fileRecord) {
    throw new Error("File not found.");
  }

  if (fileRecord.type !== "pdf") {
    throw new Error("Only PDF files can be processed for chat.");
  }

  await prisma.file.update({
    where: { id: fileId },
    data: { processingStatus: "processing", processingError: null },
  });

  try {
    const settings = await getAiSettingsForUser(fileRecord.ownerId);
    // Pass fileId — ocrService now reads bytes from the FileBlob table (DB-native)
    const extraction = await extractPdfPages(fileId);
    const pages = extraction.pages;

    if (pages.length === 0) {
      throw new Error(
        "No readable text was found in this PDF. It may be a scanned image-only document."
      );
    }

    const chunks = chunkPdfPages(pages);
    const embeddings = await embedTexts(
      chunks.map((chunk) => chunk.content),
      settings
    );

    if (embeddings.length !== chunks.length) {
      throw new Error("Embedding count did not match chunk count.");
    }

    await storeChunksWithEmbeddings(fileId, chunks, embeddings);

    const fullText = pages.map((page) => page.text).join("\n\n");
    const summary = await generateSummary(fullText, fileRecord.name, settings);

    await prisma.file.update({
      where: { id: fileId },
      data: {
        processingStatus: "ready",
        processingError: null,
        summary,
        processedAt: new Date(),
        chunkCount: chunks.length,
        embeddingProvider: settings.provider,
        isScanned: extraction.isScanned,
        ocrEngineUsed: extraction.ocrEngineUsed,
      },
    });

    // Attempt FIR metadata extraction (non-blocking: failures don't fail the whole processing)
    try {
      const firMetadata = await extractFirMetadata(fullText, fileRecord.name, settings);
      if (firMetadata) {
        const firDate = parseFirDate(firMetadata.fir_date_created);

        let propertyLoss: number | null = null;
        const rawLoss = firMetadata.property_loss_inr;
        if (typeof rawLoss === "number") {
          propertyLoss = rawLoss;
        } else if (typeof rawLoss === "string") {
          const n = parseFloat(rawLoss as string);
          if (!isNaN(n)) propertyLoss = n;
        }

        const actsAndSections = Array.isArray(firMetadata.acts_and_sections)
          ? firMetadata.acts_and_sections
          : undefined;

        await prisma.documentMetadata.upsert({
          where: { fileId },
          create: {
            fileId,
            state: (firMetadata.state as string) ?? null,
            firNumber: (firMetadata.fir_number as string) ?? null,
            firDate,
            district: (firMetadata.district as string) ?? null,
            subDivision: (firMetadata.sub_division as string) ?? null,
            policeStation: (firMetadata.police_station as string) ?? null,
            propertyLoss,
            actsAndSections: actsAndSections ?? undefined,
            zeroFirReference: (firMetadata.zero_fir_reference as string) ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawJson: JSON.parse(JSON.stringify(firMetadata)) as any,
          },
          update: {
            state: (firMetadata.state as string) ?? null,
            firNumber: (firMetadata.fir_number as string) ?? null,
            firDate,
            district: (firMetadata.district as string) ?? null,
            subDivision: (firMetadata.sub_division as string) ?? null,
            policeStation: (firMetadata.police_station as string) ?? null,
            propertyLoss,
            actsAndSections: actsAndSections ?? undefined,
            zeroFirReference: (firMetadata.zero_fir_reference as string) ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawJson: JSON.parse(JSON.stringify(firMetadata)) as any,
          },
        });
      }
    } catch {
      // FIR metadata extraction failure should not block PDF processing
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.file.update({
      where: { id: fileId },
      data: {
        processingStatus: "failed",
        processingError: message,
      },
    });
    throw error;
  }
}

export async function ensureFirMetadata(fileId: string): Promise<void> {
  try {
    const existing = await prisma.documentMetadata.findUnique({ where: { fileId } });
    if (existing && existing.firDate !== null && existing.firNumber !== null) return;

    const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
    if (!fileRecord || fileRecord.processingStatus !== "ready") return;

    const chunks = await prisma.documentChunk.findMany({
      where: { fileId },
      orderBy: { chunkIndex: "asc" },
      select: { content: true },
    });

    if (chunks.length === 0) return;

    const fullText = chunks.map((c) => c.content).join("\n\n");
    const settings = await getAiSettingsForUser(fileRecord.ownerId);

    const firMetadata = await extractFirMetadata(fullText, fileRecord.name, settings);
    if (firMetadata) {
      const firDate = parseFirDate(firMetadata.fir_date_created);

      let propertyLoss: number | null = null;
      const rawLoss = firMetadata.property_loss_inr;
      if (typeof rawLoss === "number") {
        propertyLoss = rawLoss;
      } else if (typeof rawLoss === "string") {
        const n = parseFloat(rawLoss as string);
        if (!isNaN(n)) propertyLoss = n;
      }

      const actsAndSections = Array.isArray(firMetadata.acts_and_sections)
        ? firMetadata.acts_and_sections
        : undefined;

      await prisma.documentMetadata.upsert({
        where: { fileId },
        create: {
          fileId,
          state: (firMetadata.state as string) ?? null,
          firNumber: (firMetadata.fir_number as string) ?? null,
          firDate,
          district: (firMetadata.district as string) ?? null,
          subDivision: (firMetadata.sub_division as string) ?? null,
          policeStation: (firMetadata.police_station as string) ?? null,
          propertyLoss,
          actsAndSections: actsAndSections ?? undefined,
          zeroFirReference: (firMetadata.zero_fir_reference as string) ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawJson: JSON.parse(JSON.stringify(firMetadata)) as any,
        },
        update: {
          state: (firMetadata.state as string) ?? null,
          firNumber: (firMetadata.fir_number as string) ?? null,
          firDate,
          district: (firMetadata.district as string) ?? null,
          subDivision: (firMetadata.sub_division as string) ?? null,
          policeStation: (firMetadata.police_station as string) ?? null,
          propertyLoss,
          actsAndSections: actsAndSections ?? undefined,
          zeroFirReference: (firMetadata.zero_fir_reference as string) ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawJson: JSON.parse(JSON.stringify(firMetadata)) as any,
        },
      });
    }
  } catch {
    // Ignore extraction errors
  }
}


export interface RetrievedContext {
  contextText: string;
  sourcePages: number[];
}

const FULL_CONTEXT_CHUNK_LIMIT = 12;
const FULL_CONTEXT_CHAR_LIMIT = 14000;
const RAG_CHUNK_LIMIT = 8;

export async function retrieveDocumentContext(
  fileId: string,
  query: string,
  settings: AiSettings
): Promise<RetrievedContext> {
  const allChunks = await prisma.documentChunk.findMany({
    where: { fileId },
    orderBy: { chunkIndex: "asc" },
    select: { content: true, pageNumber: true },
  });

  if (allChunks.length === 0) {
    return { contextText: "", sourcePages: [] };
  }

  const totalChars = allChunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
  const useFullDocument =
    allChunks.length <= FULL_CONTEXT_CHUNK_LIMIT || totalChars <= FULL_CONTEXT_CHAR_LIMIT;

  let selectedChunks = allChunks;

  if (!useFullDocument) {
    const [queryEmbedding] = await embedTexts([query], settings);
    const vectorString = `[${queryEmbedding.join(",")}]`;

    selectedChunks = await prisma.$queryRaw<Array<{ content: string; pageNumber: number }>>`
      SELECT "content", "pageNumber"
      FROM "DocumentChunk"
      WHERE "fileId" = ${fileId}
      ORDER BY "embedding" <=> ${vectorString}::vector
      LIMIT ${RAG_CHUNK_LIMIT}
    `;
  }

  const contextText = selectedChunks
    .map((chunk) => `[Page ${chunk.pageNumber}]\n${chunk.content}`)
    .join("\n\n---\n\n");

  const sourcePages = Array.from(new Set(selectedChunks.map((chunk) => chunk.pageNumber))).sort(
    (a, b) => a - b
  );

  return { contextText, sourcePages };
}

export async function retrieveFolderDocumentContext(
  folderId: string,
  query: string,
  settings: AiSettings
): Promise<RetrievedContext> {
  const pdfFiles = await prisma.file.findMany({
    where: { folderId, type: "pdf", processingStatus: "ready" },
    select: { id: true, name: true },
  });

  if (pdfFiles.length === 0) {
    return { contextText: "", sourcePages: [] };
  }

  const fileIds = pdfFiles.map((file) => file.id);
  const fileNameById = new Map(pdfFiles.map((file) => [file.id, file.name]));

  const allChunks = await prisma.documentChunk.findMany({
    where: { fileId: { in: fileIds } },
    orderBy: { chunkIndex: "asc" },
    select: { content: true, pageNumber: true, fileId: true },
  });

  if (allChunks.length === 0) {
    return { contextText: "", sourcePages: [] };
  }

  const totalChars = allChunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
  const useFullDocument =
    allChunks.length <= FULL_CONTEXT_CHUNK_LIMIT || totalChars <= FULL_CONTEXT_CHAR_LIMIT;

  let selectedChunks: Array<{
    content: string;
    pageNumber: number;
    fileId: string;
  }> = allChunks;

  if (!useFullDocument) {
    const [queryEmbedding] = await embedTexts([query], settings);
    const vectorString = `[${queryEmbedding.join(",")}]`;

    selectedChunks = await prisma.$queryRaw<Array<{
      content: string;
      pageNumber: number;
      fileId: string;
    }>>`
      SELECT "content", "pageNumber", "fileId"
      FROM "DocumentChunk"
      WHERE "fileId" = ANY(${fileIds}::text[])
      ORDER BY "embedding" <=> ${vectorString}::vector
      LIMIT ${RAG_CHUNK_LIMIT}
    `;
  }

  const contextText = selectedChunks
    .map((chunk) => {
      const fileName = fileNameById.get(chunk.fileId) ?? "Unknown document";
      return `[Document: ${fileName}] [Page ${chunk.pageNumber}]\n${chunk.content}`;
    })
    .join("\n\n---\n\n");

  const sourcePages = Array.from(new Set(selectedChunks.map((chunk) => chunk.pageNumber))).sort(
    (a, b) => a - b
  );

  return { contextText, sourcePages };
}

export interface GlobalRetrievedContext {
  contextText: string;
  sourceFiles: Array<{ id: string; name: string; pageNumber: number }>;
  filesInventory: FolderFileInventoryItem[];
  totalAccessibleCount: number;
}

/**
 * Retrieves multi-document context across the entire repository while strictly enforcing user access levels.
 * Non-admin users are strictly filtered to only their files and shared files with accessLevel='all'.
 */
export async function retrieveGlobalDocumentContext(
  userId: string,
  userRole: string,
  query: string,
  settings: AiSettings
): Promise<GlobalRetrievedContext> {
  const isAdmin = userRole === "admin";

  // Build where clause for permitted PDF files:
  // Admin: can access all ready PDF files
  // Non-admin: can access files where ownerId == userId OR (shared == true AND accessLevel == 'all')
  const fileWhere: Record<string, unknown> = {
    type: "pdf",
    processingStatus: "ready",
  };

  if (!isAdmin) {
    fileWhere.accessLevel = "all";
    fileWhere.OR = [
      { ownerId: userId },
      { shared: true },
    ];
    fileWhere.NOT = {
      folder: {
        accessLevel: "admin",
      },
    };
  }

  const accessibleFiles = await prisma.file.findMany({
    where: fileWhere,
    include: {
      documentMetadata: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 100, // Top 100 recent files for inventory
  });

  if (accessibleFiles.length === 0) {
    return {
      contextText: "",
      sourceFiles: [],
      filesInventory: [],
      totalAccessibleCount: 0,
    };
  }

  const fileIds = accessibleFiles.map((f) => f.id);
  const fileNameById = new Map(accessibleFiles.map((f) => [f.id, f.name]));

  // Build filesInventory with FIR metadata
  const filesInventory: FolderFileInventoryItem[] = accessibleFiles.map((file) => {
    const meta = file.documentMetadata;
    const actsAndSections = Array.isArray(meta?.actsAndSections)
      ? (meta.actsAndSections as string[])
      : null;
    return {
      id: file.id,
      fileName: file.name,
      firNumber: meta?.firNumber,
      firDate: meta?.firDate ? meta.firDate.toISOString().split("T")[0] : null,
      district: meta?.district,
      subDivision: meta?.subDivision,
      policeStation: meta?.policeStation,
      propertyLoss: meta?.propertyLoss,
      actsAndSections,
      zeroFirReference: meta?.zeroFirReference,
    };
  });

  const qLower = query.toLowerCase();
  const qClean = qLower.replace(/[-_./()]/g, " ").replace(/\s+/g, " ");

  // 1. HIGH-PRIORITY: Check if user is asking about specific document(s) by filename or FIR number
  const filenameMatches: typeof accessibleFiles = [];
  for (const file of accessibleFiles) {
    const rawName = file.name.toLowerCase();
    const cleanName = rawName.replace(/\.pdf$/i, "");
    if (qLower.includes(rawName) || qLower.includes(cleanName)) {
      filenameMatches.push(file);
      continue;
    }
    const normalizedFileName = cleanName.replace(/[-_./()]/g, " ").replace(/\s+/g, " ");
    if (qClean.includes(normalizedFileName)) {
      filenameMatches.push(file);
      continue;
    }
    // Check distinctive numeric ID in filename (e.g. 122082023, 33032026, 74062026, 6842025)
    const idTokens = cleanName.match(/\b\d{6,10}\b/g) || [];
    if (idTokens.some((tok) => qLower.includes(tok))) {
      filenameMatches.push(file);
      continue;
    }
  }

  let specificFileMatches = filenameMatches;
  if (specificFileMatches.length === 0) {
    const firMatches: typeof accessibleFiles = [];
    for (const file of accessibleFiles) {
      const firNum = file.documentMetadata?.firNumber?.toLowerCase();
      if (firNum && firNum.length > 3) {
        const cleanFir = firNum.replace(/[-_./()]/g, " ").replace(/\s+/g, " ").trim();
        const firNumOnly = cleanFir.match(/\b\d+\s+\d+\s+\d{4}\b/)?.[0];
        if (qClean.includes(cleanFir) || (firNumOnly && qClean.includes(firNumOnly))) {
          firMatches.push(file);
        }
      }
    }
    if (firMatches.length > 1) {
      const refined = firMatches.filter((f) => {
        const ps = (f.documentMetadata?.policeStation || "").toLowerCase();
        const dist = (f.documentMetadata?.district || "").toLowerCase();
        const fn = f.name.toLowerCase();
        return (
          (ps && qLower.includes(ps)) ||
          (dist && qLower.includes(dist)) ||
          (fn.includes("wkg") && qLower.includes("waikhong")) ||
          (fn.includes("ccp") && qLower.includes("churachandpur"))
        );
      });
      specificFileMatches = refined.length > 0 ? refined : firMatches;
    } else {
      specificFileMatches = firMatches;
    }
  }

  // IF SPECIFIC FILE(S) WERE TARGETED: Isolate context 100% to these files!
  if (specificFileMatches.length > 0) {
    const targetIds = specificFileMatches.map((f) => f.id);
    const candidateChunks = await prisma.documentChunk.findMany({
      where: { fileId: { in: targetIds } },
      select: { fileId: true, pageNumber: true, content: true },
      orderBy: [{ fileId: "asc" }, { pageNumber: "asc" }],
      take: 12,
    });

    const targetedInventory = filesInventory.filter((f) => f.id && targetIds.includes(f.id));

    const chunksByFile = new Map<string, Array<{ pageNumber: number; content: string }>>();
    for (const chunk of candidateChunks) {
      const list = chunksByFile.get(chunk.fileId) || [];
      list.push(chunk);
      chunksByFile.set(chunk.fileId, list);
    }

    const contextText = Array.from(chunksByFile.entries())
      .map(([fileId, chunks]) => {
        const fileName = fileNameById.get(fileId) ?? "Unknown document";
        const pages = Array.from(new Set(chunks.map((c) => c.pageNumber))).sort((a, b) => a - b);
        const pageStr = pages.map((p) => `p.${p}`).join(", ");
        const combinedChunks = chunks
          .map((c) => `[Page ${c.pageNumber}]\n${c.content}`)
          .join("\n\n---\n\n");
        return `[DOCUMENT: ${fileName}] [RELEVANT PAGES: ${pageStr}]\n${combinedChunks}`;
      })
      .join("\n\n====================\n\n");

    const sourceFiles = candidateChunks.map((chunk) => ({
      id: chunk.fileId,
      name: fileNameById.get(chunk.fileId) ?? "Document",
      pageNumber: chunk.pageNumber,
    }));

    return {
      contextText,
      sourceFiles,
      filesInventory: targetedInventory,
      totalAccessibleCount: accessibleFiles.length,
    };
  }

  // 2. DETECT ZERO FIR QUERY
  const isZeroFirQuery =
    qLower.includes("zero fir") || qLower.includes("zero-fir") || qLower.includes("zero_fir");
  if (isZeroFirQuery) {
    const textMatchedZeroChunks = await prisma.documentChunk.findMany({
      where: {
        fileId: { in: fileIds },
        content: { contains: "zero", mode: "insensitive" },
      },
      select: { fileId: true, pageNumber: true, content: true },
    });

    const isGenuineZeroFirChunk = (content: string) => {
      const cleaned = content
        .replace(/outside\s+(?:the\s+)?limit.*?\(?\s*zero\s*fir\s*\)?/gi, "")
        .replace(/name\s+of\s+p[._\s]*[sS§$][._\s]*:?-?\s*\(?\s*zero\s*fir\s*\)?/gi, "");
      return /zero[- ]?fir/i.test(cleaned);
    };

    const genuineZeroChunks = textMatchedZeroChunks.filter((c) =>
      isGenuineZeroFirChunk(c.content)
    );

    const metaZeroFiles = accessibleFiles.filter(
      (f) => f.documentMetadata?.zeroFirReference
    );
    const metaZeroFileIds = metaZeroFiles.map((f) => f.id);

    const zeroMatchingIds = Array.from(
      new Set([...genuineZeroChunks.map((c) => c.fileId), ...metaZeroFileIds])
    );

    if (zeroMatchingIds.length > 0) {
      // Fetch complete page 1, 2, 3 chunks for candidate Zero FIR files
      const zeroChunks = await prisma.documentChunk.findMany({
        where: {
          fileId: { in: zeroMatchingIds },
          pageNumber: { in: [1, 2, 3] },
        },
        select: { fileId: true, pageNumber: true, content: true },
        orderBy: [{ fileId: "asc" }, { pageNumber: "asc" }],
      });

      const targetedInventory = filesInventory.filter((f) => f.id && zeroMatchingIds.includes(f.id));

      const chunksByFile = new Map<string, Array<{ pageNumber: number; content: string }>>();
      for (const chunk of zeroChunks) {
        const list = chunksByFile.get(chunk.fileId) || [];
        list.push(chunk);
        chunksByFile.set(chunk.fileId, list);
      }

      const contextText = Array.from(chunksByFile.entries())
        .map(([fileId, chunks]) => {
          const fileName = fileNameById.get(fileId) ?? "Unknown document";
          const pages = Array.from(new Set(chunks.map((c) => c.pageNumber))).sort((a, b) => a - b);
          const pageStr = pages.map((p) => `p.${p}`).join(", ");
          const combinedChunks = chunks
            .map((c) => `[Page ${c.pageNumber}]\n${c.content}`)
            .join("\n\n---\n\n");
          return `[DOCUMENT: ${fileName}] (Single Document, Relevant Pages: ${pageStr})\n${combinedChunks}`;
        })
        .join("\n\n====================\n\n");

      const sourceFiles = zeroChunks.map((chunk) => ({
        id: chunk.fileId,
        name: fileNameById.get(chunk.fileId) ?? "Document",
        pageNumber: chunk.pageNumber,
      }));

      return {
        contextText,
        sourceFiles,
        filesInventory: targetedInventory,
        totalAccessibleCount: accessibleFiles.length,
      };
    }
  }

  // 3. DETECT CRIMES AGAINST WOMEN
  const isCrimesAgainstWomen =
    qLower.includes("women") ||
    qLower.includes("female") ||
    qLower.includes("rape") ||
    qLower.includes("pocso") ||
    qLower.includes("dowry") ||
    qLower.includes("molest") ||
    qLower.includes("498a") ||
    qLower.includes("498-a") ||
    qLower.includes("498 a") ||
    qLower.includes("354") ||
    qLower.includes("376") ||
    qLower.includes("509") ||
    qLower.includes("cruelty");

  let candidateFileIds = fileIds;

  if (isCrimesAgainstWomen) {
    const womenTokens = [
      "376",
      "354",
      "498a",
      "509",
      "pocso",
      "dowry",
      "rape",
      "molest",
      "bns 64",
      "bns 74",
      "bns 85",
      "bns 79",
    ];

    const matchedWomenFiles = accessibleFiles.filter((file) => {
      const acts = Array.isArray(file.documentMetadata?.actsAndSections)
        ? (file.documentMetadata.actsAndSections as string[])
        : [];
      const actsStr = acts.join(" ").toLowerCase();
      const fileName = file.name.toLowerCase();
      return womenTokens.some((tok) => actsStr.includes(tok) || fileName.includes(tok));
    });

    const textMatchedWomenChunks = await prisma.documentChunk.findMany({
      where: {
        fileId: { in: fileIds },
        OR: [
          { content: { contains: "376", mode: "insensitive" } },
          { content: { contains: "354", mode: "insensitive" } },
          { content: { contains: "498a", mode: "insensitive" } },
          { content: { contains: "509", mode: "insensitive" } },
          { content: { contains: "pocso", mode: "insensitive" } },
          { content: { contains: "dowry", mode: "insensitive" } },
          { content: { contains: "rape", mode: "insensitive" } },
          { content: { contains: "molest", mode: "insensitive" } },
          { content: { contains: "outrage modesty", mode: "insensitive" } },
        ],
      },
      select: { fileId: true },
    });

    const womenMatchingIds = Array.from(
      new Set([
        ...matchedWomenFiles.map((f) => f.id),
        ...textMatchedWomenChunks.map((c) => c.fileId),
      ])
    );

    if (womenMatchingIds.length === 0) {
      return {
        contextText: "",
        sourceFiles: [],
        filesInventory: [],
        totalAccessibleCount: accessibleFiles.length,
      };
    }
    candidateFileIds = womenMatchingIds;
  }

  // 4. DETECT PROPERTY LOSS / THEFT QUERIES
  const isPropertyLossQuery =
    qLower.includes("property loss") ||
    qLower.includes("property damage") ||
    qLower.includes("loss") ||
    qLower.includes("stolen") ||
    qLower.includes("theft") ||
    qLower.includes("looted");

  if (isPropertyLossQuery && !isCrimesAgainstWomen && candidateFileIds.length === fileIds.length) {
    const propertyFiles = accessibleFiles.filter((f) => {
      const meta = f.documentMetadata;
      if (!meta) return false;
      const acts = Array.isArray(meta.actsAndSections) ? meta.actsAndSections.join(" ").toLowerCase() : "";
      const hasLoss = meta.propertyLoss != null && Number(meta.propertyLoss) > 0;
      const hasTheftSection = ["303", "305", "397", "427", "436", "theft", "loot"].some((s) => acts.includes(s));
      return hasLoss || hasTheftSection;
    });

    if (propertyFiles.length > 0) {
      candidateFileIds = propertyFiles.map((f) => f.id);
    }
  }

  // 4b. DETECT FIREARMS / ARMS ACT QUERIES
  const isFirearmsQuery =
    qLower.includes("fire arm") ||
    qLower.includes("firearm") ||
    qLower.includes("fire arms") ||
    qLower.includes("arms act") ||
    qLower.includes("weapon") ||
    qLower.includes("ammunition") ||
    qLower.includes("gun");

  if (isFirearmsQuery && candidateFileIds.length === fileIds.length) {
    const firearmsFiles = accessibleFiles.filter((f) => {
      const meta = f.documentMetadata;
      if (!meta) return false;
      const acts = Array.isArray(meta.actsAndSections) ? meta.actsAndSections.join(" ").toLowerCase() : "";
      return (
        acts.includes("arms act") ||
        acts.includes("fire arm") ||
        acts.includes("firearm") ||
        acts.includes("25(") ||
        acts.includes("weapon")
      );
    });

    if (firearmsFiles.length > 0) {
      candidateFileIds = firearmsFiles.map((f) => f.id);
    }
  }

  // 5. DETECT DISTRICT OR POLICE STATION SPECIFIC QUERIES
  const districtsAndStations = [
    {
      key: "imphal west",
      filter: (f: typeof accessibleFiles[0]) =>
        f.documentMetadata?.district?.toLowerCase().includes("imphal west") ||
        f.documentMetadata?.policeStation?.toLowerCase().includes("city") ||
        f.documentMetadata?.policeStation?.toLowerCase().includes("lamphel"),
    },
    {
      key: "churachandpur",
      filter: (f: typeof accessibleFiles[0]) =>
        f.documentMetadata?.district?.toLowerCase().includes("churachandpur") ||
        f.documentMetadata?.policeStation?.toLowerCase().includes("ccp") ||
        f.name.toLowerCase().includes("ccp"),
    },
    {
      key: "kakching",
      filter: (f: typeof accessibleFiles[0]) =>
        f.documentMetadata?.district?.toLowerCase().includes("kakching") ||
        f.documentMetadata?.policeStation?.toLowerCase().includes("wkg") ||
        f.name.toLowerCase().includes("wkg"),
    },
    {
      key: "thoubal",
      filter: (f: typeof accessibleFiles[0]) =>
        f.documentMetadata?.district?.toLowerCase().includes("thoubal") ||
        f.documentMetadata?.policeStation?.toLowerCase().includes("lil") ||
        f.name.toLowerCase().includes("lil"),
    },
    {
      key: "kamjong",
      filter: (f: typeof accessibleFiles[0]) =>
        f.documentMetadata?.district?.toLowerCase().includes("kamjong") ||
        f.documentMetadata?.policeStation?.toLowerCase().includes("kkl") ||
        f.name.toLowerCase().includes("kkl"),
    },
  ];

  for (const item of districtsAndStations) {
    if (qLower.includes(item.key) && candidateFileIds.length === fileIds.length) {
      const distMatches = accessibleFiles.filter(item.filter);
      if (distMatches.length > 0) {
        candidateFileIds = distMatches.map((f) => f.id);
        break;
      }
    }
  }

  // 5b. DETECT SPECIFIC YEAR FILTER (e.g. "2026", "and 2026?", "from 2025", "year 2024")
  const yearMatch = query.match(/\b(20\d{2})\b/);
  const targetYear = yearMatch ? yearMatch[1] : null;
  const isYearSpecificQuery = !!targetYear && (
    qLower.includes("year") ||
    qLower.includes("fir") ||
    qLower.includes("and ") ||
    qLower.includes("from ") ||
    qLower.includes("in ") ||
    /^\s*(?:and\s+)?20\d{2}\??\s*$/i.test(query.trim())
  );

  if (isYearSpecificQuery && targetYear && candidateFileIds.length === fileIds.length) {
    const yearMatchedFiles = accessibleFiles.filter((file) => {
      const meta = file.documentMetadata;
      const dateStr = meta?.firDate ? meta.firDate.toISOString().slice(0, 4) : "";
      const firNum = meta?.firNumber || "";
      const fileName = file.name;
      return (
        dateStr === targetYear ||
        firNum.includes(targetYear) ||
        fileName.includes(targetYear)
      );
    });

    if (yearMatchedFiles.length > 0) {
      candidateFileIds = yearMatchedFiles.map((f) => f.id);
    } else {
      return {
        contextText: "",
        sourceFiles: [],
        filesInventory: [],
        totalAccessibleCount: accessibleFiles.length,
      };
    }
  }

  // 6. DETECT LEGAL SECTION SEARCH
  const potentialSectionTokens = (
    query.match(/\b\d{2,4}[A-Za-z]?(?:\([0-9a-zA-Z-]+\))?\b/g) || []
  ).filter((token) => !["2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028"].includes(token));

  if (potentialSectionTokens.length > 0 && candidateFileIds.length === fileIds.length) {
    const sectionMatchedFiles = accessibleFiles.filter((file) => {
      const acts = Array.isArray(file.documentMetadata?.actsAndSections)
        ? (file.documentMetadata.actsAndSections as string[])
        : [];
      const actsStr = acts.join(" ").toLowerCase();
      return potentialSectionTokens.some((tok) => actsStr.includes(tok.toLowerCase()));
    });

    const textMatchedChunks = await prisma.documentChunk.findMany({
      where: {
        fileId: { in: fileIds },
        OR: potentialSectionTokens.map((tok) => ({
          content: { contains: tok, mode: "insensitive" },
        })),
      },
      select: { fileId: true },
    });

    const fileIdsWithExactChunkMatch = new Set(textMatchedChunks.map((c) => c.fileId));
    const allMatchingIds = Array.from(
      new Set([
        ...sectionMatchedFiles.map((f) => f.id),
        ...fileIdsWithExactChunkMatch,
      ])
    );

    if (allMatchingIds.length > 0) {
      candidateFileIds = allMatchingIds;
    } else {
      // Zero files match this legal section in the repository.
      // Return empty context so vector search does NOT return unrelated false-positive documents!
      return {
        contextText: "",
        sourceFiles: [],
        filesInventory: [],
        totalAccessibleCount: accessibleFiles.length,
      };
    }
  }

  if (candidateFileIds.length === 0) {
    return {
      contextText: "",
      sourceFiles: [],
      filesInventory: [],
      totalAccessibleCount: accessibleFiles.length,
    };
  }

  // Filter inventory to candidate files
  const targetedInventory =
    candidateFileIds.length < fileIds.length
      ? filesInventory.filter((f) => f.id && candidateFileIds.includes(f.id))
      : filesInventory;

  // Retrieve relevant chunks only from candidateFileIds
  let selectedChunks: Array<{ content: string; pageNumber: number; fileId: string }> = [];
  try {
    const [queryEmbedding] = await embedTexts([query], settings);
    const vectorString = `[${queryEmbedding.join(",")}]`;

    selectedChunks = await prisma.$queryRaw<Array<{
      content: string;
      pageNumber: number;
      fileId: string;
    }>>`
      SELECT "content", "pageNumber", "fileId"
      FROM "DocumentChunk"
      WHERE "fileId" = ANY(${candidateFileIds}::text[])
      ORDER BY "embedding" <=> ${vectorString}::vector
      LIMIT 10
    `;
  } catch (err) {
    console.warn("Vector search failed or AI provider offline, falling back to candidate chunks:", err);
    selectedChunks = await prisma.documentChunk.findMany({
      where: { fileId: { in: candidateFileIds } },
      select: { content: true, pageNumber: true, fileId: true },
      take: 10,
      orderBy: [{ fileId: "asc" }, { pageNumber: "asc" }],
    });
  }

  // Group chunks by fileId to mention each document once with combined pages
  const chunksByFile = new Map<string, Array<{ pageNumber: number; content: string }>>();
  for (const chunk of selectedChunks) {
    const list = chunksByFile.get(chunk.fileId) || [];
    list.push(chunk);
    chunksByFile.set(chunk.fileId, list);
  }

  const contextText = Array.from(chunksByFile.entries())
    .map(([fileId, chunks]) => {
      const fileName = fileNameById.get(fileId) ?? "Unknown document";
      const pages = Array.from(new Set(chunks.map((c) => c.pageNumber))).sort((a, b) => a - b);
      const pageStr = pages.map((p) => `p.${p}`).join(", ");
      const combinedChunks = chunks
        .map((c) => `[Page ${c.pageNumber}]\n${c.content}`)
        .join("\n\n---\n\n");
      return `[DOCUMENT: ${fileName}] (Single Document, Relevant Pages: ${pageStr})\n${combinedChunks}`;
    })
    .join("\n\n====================\n\n");

  const sourceFilesMap = new Map<string, { id: string; name: string; pageNumber: number }>();
  for (const chunk of selectedChunks) {
    if (!sourceFilesMap.has(chunk.fileId)) {
      sourceFilesMap.set(chunk.fileId, {
        id: chunk.fileId,
        name: fileNameById.get(chunk.fileId) ?? "Document",
        pageNumber: chunk.pageNumber,
      });
    }
  }
  const sourceFiles = Array.from(sourceFilesMap.values());

  return {
    contextText,
    sourceFiles,
    filesInventory: targetedInventory,
    totalAccessibleCount: accessibleFiles.length,
  };
}
