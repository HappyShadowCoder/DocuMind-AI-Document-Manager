import path from "node:path";

/** Resolve a stored file path (public URL or relative) to an absolute filesystem path. */
export function resolveStoredFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.startsWith("/uploads/")) {
    return path.join(process.cwd(), "public", normalized.slice(1));
  }

  if (normalized.startsWith("uploads/")) {
    return path.join(process.cwd(), "public", normalized);
  }

  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.join(process.cwd(), normalized.replace(/^\//, ""));
}
