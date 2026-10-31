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

## ⚙️ Key Architecture

- **Semantic Cache**: [`src/lib/semantic-cache.ts`](src/lib/semantic-cache.ts) — PostgreSQL pgvector IVFFlat cosine search cache with document fingerprint invalidation.
- **AI Engine**: [`src/lib/ai.ts`](src/lib/ai.ts) — Hybrid Ollama / OpenAI embeddings and streaming chat.
- **RAG & OCR**: [`src/lib/pdf-processing.ts`](src/lib/pdf-processing.ts) & [`src/services/ocrService.ts`](src/services/ocrService.ts) — Chunking, embeddings, and text extraction.
- **Police Records & FIR Stats**: [`src/lib/police-stats.ts`](src/lib/police-stats.ts) — Interactive analytics and reporting for crime and police station records.
- **Motion Animations**: [`src/components/chat/`](src/components/chat/) — Fluid message entrance animations, live semantic cache hit pills, and reasoning accordions.
