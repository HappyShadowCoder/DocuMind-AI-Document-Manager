# DocuMind — AI Document Manager

What it is
-----------
DocuMind is an AI-powered document management system that helps teams store, search, and interact with documents using OCR and large language models. The app is built with Next.js (frontend), Prisma (ORM), and provides PDF-chat, OCR ingestion, folder organization, and user/auth admin features.

Features
--------
- Upload and store documents (PDF, images, text)
- OCR processing and text extraction
- Chat and search inside PDFs and other files using LLMs
- Folder-based organization and access control
- User authentication and admin panel
- Background processing and concurrency controls
- Prisma-based models and migrations

Requirements
------------
- Node.js 18+ (LTS recommended)
- npm (or yarn/pnpm)
- PostgreSQL (recommended) or other supported database
- Environment variables for database and LLM/OCR providers

Setup (local development)
--------------------------
1. Clone the repository:

```bash
git clone https://github.com/HappyShadowCoder/DocuMind-AI-Document-Manager.git
cd DocuMind-AI-Document-Manager
```

2. Install dependencies (root and frontend):

```bash
npm install
npm run install:Code --if-present
# or explicitly:
npm install --prefix Code
```

3. Create environment file:

```bash
cp .env.example .env
# then edit `.env` and set the values below
```

Important environment variables
- `DATABASE_URL` — Postgres connection string
- `NEXTAUTH_SECRET` or `SESSION_SECRET` — session secret for auth
- `OCR_API_KEY` — optional external OCR service key
- `NEXT_PUBLIC_BASE_URL` — (optional) public base URL for frontend

4. Generate Prisma client and run migrations:

```bash
npx prisma generate --schema=prisma/schema.prisma
npx prisma migrate dev --name init --schema=prisma/schema.prisma
node prisma/seed.ts # optional: seed initial data
```

5. Start development server:

```bash
npm run dev --prefix frontend
```

Project layout
--------------
- `Code/` — Next.js application and frontend source
- `prisma/` — Prisma schema and seed scripts
- `public/uploads/` — uploaded files storage
- `Code/src/lib/` — helpers (OCR, pdf-chat, prisma client)

Deploy
------
- Build the frontend: `npm run build --prefix Code`
- Start: `npm start --prefix frontend` (or use a platform like Vercel/Render)
- Ensure production environment variables and database are configured

Contributing
------------
1. Fork the repository and create a feature branch
2. Run the app locally and add tests for new behavior
3. Open a pull request with a clear description of changes

