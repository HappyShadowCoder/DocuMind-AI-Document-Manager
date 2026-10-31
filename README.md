# DocuMind — AI Document Intelligence Platform

DocuMind is an AI-powered document intelligence and management platform designed for deep legal and FIR analysis, multi-document semantic search, OCR extraction, and high-performance retrieval-augmented generation (RAG).

Built with **Next.js 16 (App Router)**, **React 19**, **PostgreSQL + pgvector**, **Prisma ORM**, and **Motion (Framer Motion)**.

---

## 🌟 Key Features

### ⚡ Semantic AI Caching
- **Sub-100ms Instant Responses**: Questions that are semantically identical or closely rephrased bypass the LLM pipeline and stream directly from the vector cache.
- **pgvector Cosine Search**: Employs an IVFFlat-indexed cosine similarity search (`vector_cosine_ops`) over 768-dimensional question embeddings.
- **Dynamic Document Fingerprinting**: Cache entries are tagged with a SHA-256 fingerprint of the visible document set (`fileId:updatedAt`). Adding, editing, or deleting files automatically invalidates stale entries without race conditions.
- **Zero LLM Slot Consumption**: Cache hits bypass the concurrency limiter, preserving local GPU/CPU compute for unique queries.
- **Conversation Context Awareness**: Bypasses the cache when a chat session has prior turns ($\ge 2$ messages) to ensure context-dependent follow-up questions remain accurate.
- **Provider Isolation**: Caches Ollama and OpenAI answers separately under `aiProvider` to prevent cross-model leakage.
- **Admin Management API**: Endpoints to monitor hit counts, view top cached questions, and execute automated cleanup (`/api/admin/cache`).

### 🤖 Dual AI Engine Support
- **Local & Offline (Default)**: Powered by [Ollama](https://ollama.com/) with `llama3.1:8b` and `nomic-embed-text` (768 dimensions). Zero cloud dependency and fully private.
- **Cloud (Opt-in)**: Powered by OpenAI with `gpt-4o-mini` and `text-embedding-3-small` (normalized to 768 dimensions).
- **Concurrency Limiter**: Admin-configurable active slot limiter that protects local hardware from resource exhaustion under multi-user load.

### 📜 FIR & Legal Document Intelligence
- **Automated Metadata Extraction**: Extracts FIR Numbers, Registration Dates, Districts, Police Stations, Property Loss amounts, and Zero FIR references during ingestion.
- **IPC & BNS Dual Knowledge**: Handles both legacy Indian Penal Code (IPC) and modern Bharatiya Nyaya Sanhita (BNS 2023) provisions with subsection resolution.
- **Multi-Scope AI Chat**:
  - **Global Chat**: Query across all permitted documents in the entire repository with role-based access control (Admin vs. Standard User).
  - **Folder Chat**: Synthesize information across multiple PDFs grouped inside a folder.
  - **Single PDF Chat**: Page-level grounding with clickable citation tags that navigate directly to referenced pages.
- **Interactive `/stats` Police Dashboard**: Generates comprehensive crime distributions, police station caseloads, and property loss summaries with interactive UI cards.

### 👁️ OCR & Scanned Document Ingestion
- Dual-engine document parser combining `pdf-parse` for digital PDFs and `tesseract.js` for scanned or photographed physical FIR forms.

### ✨ Smooth Motion Animations
- Integrated with `framer-motion` for fluid message entrances, responsive empty-state prompt buttons, and collapsible thought accordions (`<ThinkingBlock>`).
- Live animated `⚡ Semantic Cache Hit` indicators on instant responses.

---

## ⚡ Quick Start (One-Click Setup)

### On macOS:
Simply **double-click** `setup.command` in Finder!  
Or run in Terminal:
```bash
./setup.command
```

### On Windows:
Double-click `setup.bat` in File Explorer!

### On Linux / macOS Terminal:
```bash
./setup.sh
# or
npm run setup
```

The automated setup script handles:
1. **Node.js & npm check**: Verifies required runtime environment (v18+).
2. **Environment configuration**: Auto-creates `Code/.env` from `.env.example` with a secure random JWT secret.
3. **Database initialization**:
   - If Docker is running, automatically starts PostgreSQL with `pgvector` on port 5433 via `docker-compose.yml`.
   - If PostgreSQL is already installed locally, connects and validates it.
4. **Dependency installation**: Runs `npm install` automatically.
5. **Schema & seeding**: Generates Prisma client, applies migrations, and seeds default user accounts.
6. **Auto-launch**: Opens `http://localhost:3000` in your default browser.

---

## 🚀 Daily Launch (After Initial Setup)

Start the application anytime:
- **macOS**: Double-click `start.command`
- **Windows**: Double-click `start.bat` (or run `npm run dev`)
- **Terminal**: Run `./start.sh` or `cd Code && npm run dev`

---

## 🐳 Docker Deployment (Database)

If you run the database via Docker:
```bash
docker compose up -d postgres
```
This launches a PostgreSQL 16 container with the `pgvector` extension enabled on port `5433`.

---

## 🔐 Credentials & Default Ports

- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **Administrator**: `admin@example.com` / `password123`
- **Standard User**: `test@example.com` / `password123`
- **PostgreSQL Port**: `5433` (Database: `documind`, User: `postgres`, Password: `postgrespassword`)
- **Ollama AI (Optional)**: `http://127.0.0.1:11434`

---

## 📁 Repository Structure

```
├── Code/                               # Main Next.js application
│   ├── prisma/
│   │   ├── migrations/                 # Schema migrations including pgvector & SemanticCache
│   │   ├── schema.prisma               # Prisma models (User, File, DocumentChunk, SemanticCache, etc.)
│   │   └── seed.ts                     # Database seeder
│   ├── public/
│   │   └── uploads/                    # Physical uploaded PDF documents
│   ├── src/
│   │   ├── app/                        # Next.js App Router routes & API endpoints
│   │   │   ├── (auth)/login/           # User authentication
│   │   │   ├── admin/                  # System admin panel
│   │   │   ├── api/
│   │   │   │   ├── admin/cache/        # Semantic cache inspection & maintenance API
│   │   │   │   ├── chat/global/        # Global repository chat endpoint
│   │   │   │   ├── files/[id]/chat/    # Single document chat endpoint
│   │   │   │   └── folders/[id]/chat/  # Folder multi-document chat endpoint
│   │   │   └── dashboard/              # Document management, PDF viewer & folder views
│   │   ├── components/                 # React UI components
│   │   │   ├── chat/                   # Global chat panel, thinking block & stats card
│   │   │   └── settings/               # AI engine settings modal
│   │   ├── lib/
│   │   │   ├── ai.ts                   # Unified Ollama / OpenAI embeddings & completions
│   │   │   ├── semantic-cache.ts       # Semantic caching engine & fingerprinting
│   │   │   ├── pdf-processing.ts       # RAG retrieval, chunking & vector search
│   │   │   └── police-stats.ts         # FIR statistics aggregation engine
│   │   └── services/
│   │       └── ocrService.ts           # Tesseract OCR & text extraction
│   └── package.json
├── docker-compose.yml                  # PostgreSQL + pgvector Docker service
├── setup.command / setup.sh / setup.bat# One-click environment bootstrap
├── start.command / start.sh            # Quick application launch scripts
└── README.md
```

---

## 🛠️ Semantic Cache Configuration

Adjust semantic cache behavior in `Code/.env`:

| Environment Variable | Default | Description |
|---|---|---|
| `SEMANTIC_CACHE_THRESHOLD` | `0.15` | Cosine distance cutoff for cache hits (lower = stricter match) |
| `SEMANTIC_CACHE_MAX_AGE_DAYS` | `30` | Age in days before zero-hit cache rows are pruned |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama service endpoint |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Local embedding model (768 dims) |
| `OLLAMA_CHAT_MODEL` | `llama3.1:8b` | Local chat completion model |
| `OPENAI_API_KEY` | *(optional)* | OpenAI API key for cloud engine |
