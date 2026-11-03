import { prisma } from "@/lib/prisma";
import { PDFParse } from "pdf-parse";

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  pages: PdfPageText[];
  isScanned: boolean;
  ocrEngineUsed: string | null;
}

const MIN_VALID_TEXT_LENGTH = 100;

async function loadPdfJs() {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return pdfjsLib;
  } catch {
    return await import("pdfjs-dist/build/pdf.mjs");
  }
}

async function loadTesseract() {
  try {
    const tesseractMod = await import("tesseract.js");
    return tesseractMod.default || tesseractMod;
  } catch (error: any) {
    if (error?.code === "MODULE_NOT_FOUND" || error?.code === "ERR_MODULE_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

function normalizeText(text: string): string {
  return text.replace(/\0|\u0000/g, "").replace(/\s+/g, " ").trim();
}

function hasValidText(text: string): boolean {
  return normalizeText(text).length >= MIN_VALID_TEXT_LENGTH;
}

/**
 * Fetch the raw PDF buffer for a file.
 * Tries the FileBlob table first (new DB-native storage).
 * Falls back to the legacy filesystem path for files uploaded before the migration.
 */
async function getPdfBuffer(fileId: string): Promise<Buffer> {
  // Primary: DB blob
  const blob = await prisma.fileBlob.findUnique({
    where: { fileId },
    select: { data: true },
  });

  if (blob?.data) {
    return blob.data as Buffer;
  }

  // Legacy fallback: read from filesystem using stored path
  const fileRecord = await prisma.file.findUnique({
    where: { id: fileId },
    select: { path: true },
  });

  if (fileRecord?.path) {
    const { readFile } = await import("node:fs/promises");
    const { resolveStoredFilePath } = await import("@/lib/file-path");
    const absolutePath = resolveStoredFilePath(fileRecord.path);
    return readFile(absolutePath);
  }

  throw new Error(
    `No file content found for file ${fileId}. The FileBlob is missing and no legacy path exists.`
  );
}

async function extractNativePdfText(fileId: string): Promise<PdfPageText[]> {
  const buffer = await getPdfBuffer(fileId);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();

    const pages = (result.pages ?? [])
      .map((page: any) => ({
        pageNumber: page.num,
        text: normalizeText(page.text || ""),
      }))
      .filter((page: PdfPageText) => page.text.length > 0);

    if (pages.length > 0) {
      return pages;
    }

    const fullText = normalizeText(result.text || "");
    if (fullText) {
      return [{ pageNumber: 1, text: fullText }];
    }

    return [];
  } finally {
    await parser.destroy();
  }
}

async function renderPdfPageAsPng(page: any): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  // Render at 2.5x scale (180 DPI) for crisp character edges on fine print, stamps, and handwriting
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  const renderTask = page.render({ canvasContext: context, viewport });
  await renderTask.promise;

  // Enhance contrast: convert to grayscale and stretch dynamic range to make faint text/handwriting legible
  try {
    const imgData = context.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      // Contrast stretch: whiten light background (>195), darken ink (<75)
      const enhanced =
        gray > 195 ? 255 : gray < 75 ? 0 : Math.max(0, Math.min(255, (gray - 60) * 1.6));
      d[i] = enhanced;
      d[i + 1] = enhanced;
      d[i + 2] = enhanced;
    }
    context.putImageData(imgData, 0, 0);
  } catch {
    // Canvas pixel manipulation fallback
  }

  return canvas.toBuffer("image/png");
}

async function extractTextWithOcr(fileId: string): Promise<PdfPageText[]> {
  const tesseract = await loadTesseract();
  if (!tesseract) {
    throw new Error(
      "OCR is unavailable because tesseract.js is not installed. Install it or use a cloud OCR integration."
    );
  }

  const pdfjsLib = await loadPdfJs();
  const buffer = await getPdfBuffer(fileId);
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdfDocument = await loadingTask.promise;

  const worker = await tesseract.createWorker("eng", 1, {
    logger: (message: any) => {
      console.log(
        `[OCR] page=${message?.status?.includes("recognizing") ? "processing" : message.status} progress=${message.progress ?? "n/a"}`
      );
    },
  });

  try {
    const workerAny = worker as any;
    if (typeof workerAny.load === "function") await workerAny.load();
    if (typeof workerAny.loadLanguage === "function") await workerAny.loadLanguage("eng");
    if (typeof workerAny.initialize === "function") await workerAny.initialize("eng");

    // Preserve column formatting in tables
    if (typeof worker.setParameters === "function") {
      await worker.setParameters({
        preserve_interword_spaces: "1",
      });
    }

    const pages: PdfPageText[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const imageBuffer = await renderPdfPageAsPng(page);
      const { data } = await (worker as any).recognize(imageBuffer, { tessedit_pageseg_mode: "3" });
      const pageText = normalizeText(data.text || "");

      pages.push({ pageNumber, text: pageText });
    }

    return pages;
  } finally {
    await worker.terminate();
    pdfDocument.destroy?.();
  }
}

/**
 * Extract pages from a PDF identified by its database file ID.
 * Tries native text extraction first; falls back to OCR for scanned documents.
 */
export async function extractPdfPages(fileId: string): Promise<PdfExtractionResult> {
  const nativePages = await extractNativePdfText(fileId);
  const nativeText = nativePages.map((page) => page.text).join(" ");

  if (nativePages.length > 0 && hasValidText(nativeText)) {
    return {
      pages: nativePages,
      isScanned: false,
      ocrEngineUsed: null,
    };
  }

  console.log("Digital text missing or too short. Fallback to OCR starting...");
  const ocrPages = await extractTextWithOcr(fileId);
  const ocrText = ocrPages.map((page) => page.text).join(" ");

  if (!hasValidText(ocrText)) {
    throw new Error(
      "OCR extraction produced insufficient readable text. The document may be too poor quality or image-only."
    );
  }

  return {
    pages: ocrPages,
    isScanned: true,
    ocrEngineUsed: "tesseract.js",
  };
}
