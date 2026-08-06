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
    const extraction = await extractPdfPages(fileRecord.path);
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

export interface RetrievedContext {
  contextText: string;
  sourcePages: string[];
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
