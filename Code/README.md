# DocuMind — Code & Application Setup

This directory contains the full Next.js 16 application for DocuMind.

## 🚀 Running the App

```bash
# Install dependencies
npm install

# Generate Prisma Client & apply schema
npx prisma generate
npx prisma db push

# Start the dev server
npm run dev
```

The application will be accessible at [http://localhost:3000](http://localhost:3000).

## ⚙️ Key Architecture & Modules

- **Hybrid Database Storage**: [`src/app/api/files/[id]/serve/route.ts`](src/app/api/files/[id]/serve/route.ts) — PostgreSQL `FileBlob` binary storage with auth-gated streaming.
- **Semantic Vector Cache**: [`src/lib/semantic-cache.ts`](src/lib/semantic-cache.ts) — PostgreSQL pgvector IVFFlat cosine search cache with document fingerprint invalidation.
- **Smart Chat Titles**: [`src/lib/chat-title.ts`](src/lib/chat-title.ts) — Semantic intent classification for clean thread names.
- **AI Engine**: [`src/lib/ai.ts`](src/lib/ai.ts) — Hybrid Ollama / OpenAI embeddings and streaming chat.
- **RAG & OCR**: [`src/lib/pdf-processing.ts`](src/lib/pdf-processing.ts) & [`src/services/ocrService.ts`](src/services/ocrService.ts) — Chunking, embeddings, and text extraction.
- **Police Records & FIR Stats**: [`src/lib/police-stats.ts`](src/lib/police-stats.ts) — Interactive analytics and reporting for crime and police station records.
- **Motion Animations**: [`src/components/chat/`](src/components/chat/) — Fluid message entrance animations, live semantic cache hit pills, and reasoning accordions.
