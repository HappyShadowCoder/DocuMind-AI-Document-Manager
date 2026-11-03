# DocuMind — AI Document Intelligence Platform

DocuMind is an enterprise-grade AI-powered document intelligence and management platform designed for deep legal and FIR analysis, multi-document semantic search, OCR extraction, high-performance retrieval-augmented generation (RAG), and zero-disk database file storage.

Built with **Next.js 16 (App Router)**, **React 19**, **PostgreSQL 16 + pgvector**, **Prisma ORM**, and **Motion (Framer Motion)**.

---

## 🌟 Key Features

### 🗄️ Hybrid Database Storage & Auth-Gated Streaming
- **Zero Local Disk Exposure**: Uploaded files (PDFs, images, etc.) are stored as binary data (`BYTEA`) directly in PostgreSQL via a dedicated `FileBlob` table.
- **Secure Auth-Gated Streaming (`/api/files/[id]/serve`)**: Static public URLs in `public/uploads/` are completely eliminated. Every document view or download requires a valid JWT cookie and undergoes role/ownership access checks.
- **Atomic Transactions**: File records and raw binary blobs are created together in a single `prisma.$transaction`.
- **Cascading Deletions**: Deleting a file instantly and cleanly cascades to remove its binary blob, FIR metadata, vector embeddings, and chat sessions without leaving orphaned files on disk.

### ⚡ Semantic AI Caching (pgvector)
- **Sub-50ms Instant Responses**: Questions that are semantically identical or closely rephrased bypass the LLM pipeline and stream directly from the vector cache.
- **pgvector Cosine Search**: Employs an IVFFlat-indexed cosine similarity search (`vector_cosine_ops`) over 768-dimensional question embeddings with an adaptive `0.28` threshold.
- **Dynamic Document Fingerprinting**: Cache entries are tagged with a SHA-256 fingerprint of the visible document set (`fileId:updatedAt`). Adding, editing, or deleting files automatically invalidates stale entries without race conditions.
- **Fail-Open Resilience**: Cache lookup failures gracefully fall back to live AI generation — ensuring chat never throws a 500 error.
- **Model Fingerprint Scoping**: Caches answers under local model parameters and document fingerprints to prevent stale or cross-model leakage.
- **Persistent Cache Badges**: Responses retrieved from the cache permanently show the green **⚡ Semantic Cache Hit • Instant** badge, even across page reloads and session switches.
- **Admin Management API**: Endpoints to monitor hit counts, inspect top cached questions, and execute automated cleanup (`/api/admin/cache`).

### 💬 Intelligent Chat Threads & Sleek History Popover
- **Smart Semantic Title Generator**: Automatic intent classification produces polished thread names like *"Document Overview"*, *"Acts & Legal Sections"*, *"FIR Details"*, and *"Property Loss & Damages"* instead of awkward sentence fragments.
- **Compact Thread Switcher**: Single-row modern header with a dedicated **`[+ New Chat]`** button and an interactive **Thread Selector Popover**.
- **Thread History & Management**: View relative timestamps (*"Just now"*, *"10m ago"*, *"Yesterday"*), switch between threads instantly, delete individual chat threads, or **"Clear all"** history with one click.

### 🤖 100% Offline Local AI Architecture
- **Air-Gapped & Fully Private**: Powered locally by [Ollama](https://ollama.com/) with `llama3.1:8b` for reasoning and `nomic-embed-text` (768 dimensions) for vector search.
- **Zero Cloud Exposure**: External cloud integrations (including OpenAI) are disabled. Documents, vectors, and chat prompts never leave your local hardware.
- **Concurrency Limiter**: Admin-configurable active slot limiter that protects local hardware from resource exhaustion under multi-user load.

### 📜 FIR & Legal Document Intelligence
- **Automated Metadata Extraction**: Extracts FIR Numbers, Registration Dates, Districts, Police Stations, Property Loss amounts, and Zero FIR references during ingestion.
- **IPC & BNS Dual Knowledge**: Handles both legacy Indian Penal Code (IPC) and modern Bharatiya Nyaya Sanhita (BNS 2023) provisions with subsection resolution.
- **Multi-Scope AI Chat**:
  - **Single PDF Chat**: Side-by-side PDF viewer with page-level grounding and clickable citation tags.
  - **Folder Chat**: Synthesize information across multiple PDFs grouped inside a folder.
  - **Global Chat**: Query across all permitted documents in the entire repository with role-based access control.
- **Interactive `/stats` Police Dashboard**: Generates comprehensive crime distributions, police station caseloads, and property loss summaries with interactive UI cards.

### 👁️ OCR & Scanned Document Ingestion
- Dual-engine document parser combining `pdf-parse` for digital PDFs and `tesseract.js` for scanned or photographed physical FIR forms.

### ✨ Smooth Motion Animations
- Integrated with `framer-motion` for fluid message entrances, responsive empty-state prompt buttons, and collapsible thought accordions (`<ThinkingBlock>`).

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

## 🔄 Database Migration Scripts

DocuMind includes standalone migration and maintenance scripts in `Code/scripts/`:

```bash
# Apply Semantic Cache vector table & indexes
cd Code && npx tsx scripts/apply-cache-migration.ts

# Migrate legacy disk files (public/uploads/) into PostgreSQL FileBlob
cd Code && npx tsx scripts/migrate-files-to-db.ts
```

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
│   │   ├── migrations/                 # Schema migrations (pgvector, SemanticCache, FileBlob)
│   │   ├── schema.prisma               # Prisma models (User, File, FileBlob, DocumentChunk, SemanticCache, etc.)
│   │   └── seed.ts                     # Database seeder
│   ├── scripts/
│   │   ├── apply-cache-migration.ts    # Standalone script to apply semantic cache migration
│   │   └── migrate-files-to-db.ts      # One-shot migration from disk uploads to DB FileBlob
│   ├── src/
│   │   ├── app/                        # Next.js App Router routes & API endpoints
│   │   │   ├── (auth)/login/           # User authentication
│   │   │   ├── admin/                  # System admin panel
│   │   │   ├── api/
│   │   │   │   ├── admin/cache/        # Semantic cache inspection & maintenance API
│   │   │   │   ├── chat/global/        # Global repository chat endpoint
│   │   │   │   ├── files/[id]/chat/    # Single document chat endpoint
│   │   │   │   ├── files/[id]/serve/   # Auth-gated document streaming endpoint
│   │   │   │   ├── files/[id]/sessions/# Chat session management (delete / clear all)
│   │   │   │   └── folders/[id]/chat/  # Folder multi-document chat endpoint
│   │   │   └── dashboard/              # Document management, PDF viewer & folder views
│   │   ├── components/                 # React UI components
│   │   │   ├── chat/                   # Global chat panel, thinking block & stats card
│   │   │   └── settings/               # AI engine settings modal
│   │   ├── lib/
│   │   │   ├── ai.ts                   # 100% Offline Ollama embeddings & completions
│   │   │   ├── chat-title.ts           # Smart semantic title generator
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
| `SEMANTIC_CACHE_THRESHOLD` | `0.28` | Cosine distance cutoff for cache hits (allows natural question rephrasing) |
| `SEMANTIC_CACHE_MAX_AGE_DAYS` | `30` | Age in days before zero-hit cache rows are pruned |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama service endpoint |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Local embedding model (768 dims) |
| `OLLAMA_CHAT_MODEL` | `llama3.1:8b` | Local chat completion model |
