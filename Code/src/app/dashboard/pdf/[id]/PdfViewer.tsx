"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

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
  initialPage?: number;
}

export default function PdfViewer({ url, width = 760, className, initialPage = 1 }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPage > 0 ? initialPage : 1);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pdfDocRef = useRef<PdfDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    pdfDocRef.current = null;
    setLoading(true);
    setError(null);
    setNumPages(null);
    setPageNumber(initialPage > 0 ? initialPage : 1);
    setZoomScale(1.0);

    async function openDocument() {
      try {
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument(url).promise;
        if (cancelled) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        if (initialPage > 0 && initialPage <= doc.numPages) {
          setPageNumber(initialPage);
        }
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
  }, [url, initialPage]);

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
        // Calculate fit scale capped at 1.15 to prevent huge over-zooming on wide screens
        const fitScale = Math.min(1.15, Math.max(0.6, (width - 48) / baseViewport.width));
        const finalScale = fitScale * zoomScale;
        const viewport = page.getViewport({ scale: finalScale });

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
  }, [pageNumber, width, zoomScale, loading, error, numPages]);

  if (loading) {
    return (
      <div className={`flex w-full items-center justify-center p-8 text-slate-500 ${className || ""}`}>
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#0052FF]" />
        <p className="text-sm">Loading PDF document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex w-full items-center justify-center p-8 text-red-500 ${className || ""}`}>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className={`relative flex w-full flex-col items-center justify-center p-4 ${className || ""}`}>
      <div className="overflow-auto max-w-full rounded-xl bg-white p-2 shadow-md dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <canvas ref={canvasRef} className="max-w-full rounded" />
      </div>

      {/* Floating Control Bar for Navigation & Zoom */}
      {numPages !== null && numPages > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2 shadow-lg backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/90">
          {/* Page Navigation */}
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((prev) => prev - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Previous Page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="min-w-[90px] text-center text-xs font-semibold text-slate-700 dark:text-slate-300">
            Page {pageNumber} of {numPages}
          </span>

          <button
            type="button"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((prev) => prev + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Next Page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-800" />

          {/* Zoom Controls */}
          <button
            type="button"
            disabled={zoomScale <= 0.5}
            onClick={() => setZoomScale((prev) => Math.max(0.5, prev - 0.15))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Zoom Out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setZoomScale(1.0)}
            className="min-w-[48px] rounded-lg px-2 py-1 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Reset Zoom to 100%"
          >
            {Math.round(zoomScale * 100)}%
          </button>

          <button
            type="button"
            disabled={zoomScale >= 2.5}
            onClick={() => setZoomScale((prev) => Math.min(2.5, prev + 0.15))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Zoom In (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          {zoomScale !== 1.0 && (
            <button
              type="button"
              onClick={() => setZoomScale(1.0)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              title="Reset Zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
