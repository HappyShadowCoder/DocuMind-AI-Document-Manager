-- Migration: Add FileBlob table and make File.path optional
-- This migration stores raw file bytes in PostgreSQL instead of the local filesystem.

-- 1. Create the FileBlob table
CREATE TABLE "FileBlob" (
    "id"        TEXT          NOT NULL,
    "fileId"    TEXT          NOT NULL,
    "data"      BYTEA         NOT NULL,
    "mimeType"  TEXT          NOT NULL,
    "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBlob_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "FileBlob_fileId_key" UNIQUE ("fileId"),
    CONSTRAINT "FileBlob_fileId_fkey"
        FOREIGN KEY ("fileId") REFERENCES "File"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2. Make File.path optional (existing rows keep their values; new uploads set path = NULL)
ALTER TABLE "File" ALTER COLUMN "path" DROP NOT NULL;

