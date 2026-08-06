"use client";

import { useEffect, useRef, useState } from "react";

const PDFJS_VERSION = "5.4.394";
const PDFJS_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const WORKER_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: string) => { promise: Promise<PdfDocument> };
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

async function loadPdfJs(): Promise<PdfJsModule> {
  const pdfjs = (await import(
    /* webpackIgnore: true */
    PDFJS_URL
  )) as PdfJsModule;

  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
  return pdfjs;
}

export interface PdfViewerProps {
  url: string;
  width?: number;
  className?: string;
}

export default function PdfViewer({ url, width = 760, className }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pdfDocRef = useRef<PdfDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    pdfDocRef.current = null;
    setLoading(true);
    setError(null);
    setNumPages(null);
    setPageNumber(1);

    async function openDocument() {
      try {
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument(url).promise;
        if (cancelled) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
      } catch (err) {
        console.error("PDF load error:", err);
        if (!cancelled) setError("Failed to load PDF file.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    openDocument();

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || loading || error) return;

    let cancelled = false;
    const context = canvas.getContext("2d");
    if (!context) return;

    async function renderPage() {
      try {
        const page = await doc!.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = width / baseViewport.width;
        const viewport = page.getViewport({ scale });

        canvas!.width = viewport.width;
        canvas!.height = viewport.height;

        await page.render({ canvasContext: context!, viewport }).promise;
      } catch (err) {
        console.error("PDF render error:", err);
        if (!cancelled) setError("Failed to render PDF page.");
      }
    }

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pageNumber, width, loading, error, numPages]);

  if (loading) {
    return (
      <div className={`flex w-full items-center justify-center p-8 ${className || ""}`}>
        <p className="text-gray-500">Loading PDF document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex w-full items-center justify-center p-8 ${className || ""}`}>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex w-full flex-col items-center justify-center p-4 ${className || ""}`}>
      <canvas ref={canvasRef} className="max-w-full shadow-sm" />

      {numPages !== null && numPages > 0 && (
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((prev) => prev - 1)}
            className="rounded bg-gray-200 px-3 py-1 text-sm transition-colors hover:bg-gray-300 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm">
            Page {pageNumber} of {numPages}
          </span>
          <button
            type="button"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((prev) => prev + 1)}
            className="rounded bg-gray-200 px-3 py-1 text-sm transition-colors hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
