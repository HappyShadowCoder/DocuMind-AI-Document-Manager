export type FileCategory = "pdf" | "image" | "archive" | "doc" | "sheet" | "video" | "other";

export function resolveFileType(fileName: string, mimeType = ""): FileCategory {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const mime = mimeType.toLowerCase();

  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) {
    return "image";
  }
  if (
    ["zip", "rar", "7z", "tar", "gz"].includes(ext) ||
    mime.includes("zip") ||
    mime.includes("archive") ||
    mime.includes("compressed")
  ) {
    return "archive";
  }
  if (["doc", "docx"].includes(ext) || mime.includes("word") || mime.includes("document")) return "doc";
  if (
    ["xls", "xlsx", "csv"].includes(ext) ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    return "sheet";
  }
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";

  const knownCategories: FileCategory[] = ["pdf", "image", "archive", "doc", "sheet", "video", "other"];
  if (knownCategories.includes(mime as FileCategory)) return mime as FileCategory;

  return "other";
}

export function normalizeFileType(type: string, fileName: string): FileCategory {
  return resolveFileType(fileName, type);
}

export function isPdfFile(file: { type: string; name: string }): boolean {
  return normalizeFileType(file.type, file.name) === "pdf";
}
