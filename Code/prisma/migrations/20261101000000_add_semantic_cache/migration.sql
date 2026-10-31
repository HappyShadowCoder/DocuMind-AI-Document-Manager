-- Migration: add_semantic_cache
-- Adds the SemanticCache table and CacheScope enum for semantic caching of AI responses.
-- Run with: npx prisma migrate deploy
-- Or manually via psql if the DB is accessible.

-- 1. Create CacheScope enum
DO $$ BEGIN
  CREATE TYPE "CacheScope" AS ENUM ('FILE', 'FOLDER', 'GLOBAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create SemanticCache table
CREATE TABLE IF NOT EXISTS "SemanticCache" (
  "id"                TEXT          NOT NULL,
  "scopeType"         "CacheScope"  NOT NULL,
  "scopeId"           TEXT          NOT NULL,
  "docFingerprint"    TEXT          NOT NULL,
  "questionHash"      TEXT          NOT NULL,
  "questionEmbedding" vector(768)   NOT NULL,
  "answerText"        TEXT          NOT NULL,
  "sourcePages"       TEXT[]        NOT NULL DEFAULT '{}',
  "aiProvider"        "AiProvider"  NOT NULL,
  "hitCount"          INTEGER       NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SemanticCache_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS "SemanticCache_scopeType_scopeId_idx"
  ON "SemanticCache"("scopeType", "scopeId");

CREATE INDEX IF NOT EXISTS "SemanticCache_docFingerprint_idx"
  ON "SemanticCache"("docFingerprint");

CREATE INDEX IF NOT EXISTS "SemanticCache_questionHash_idx"
  ON "SemanticCache"("questionHash");

-- 4. IVFFlat index for fast cosine similarity search on the embedding column
--    (requires pgvector; lists=100 is suitable for up to ~1M rows)
CREATE INDEX IF NOT EXISTS "SemanticCache_embedding_cosine_idx"
  ON "SemanticCache" USING ivfflat ("questionEmbedding" vector_cosine_ops)
  WITH (lists = 100);

