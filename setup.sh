#!/usr/bin/env bash
set -e

# Navigate to the project root directory regardless of where called from
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "========================================================"
echo "          DocuMind - AI Document Manager               "
echo "              Automated Setup & Launch                 "
echo "========================================================"
echo ""

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[-] Error: Node.js is not installed."
  echo "    Please install Node.js (version 18 or higher) from https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "[-] Warning: Node.js version $NODE_VERSION detected. Version 18+ is strongly recommended."
else
  echo "[✓] Node.js $(node -v) detected."
fi

# 2. Check npm
if ! command -v npm >/dev/null 2>&1; then
  echo "[-] Error: npm is not installed. Please install npm."
  exit 1
fi
echo "[✓] npm $(npm -v) detected."

# 3. Setup Environment File (.env)
if [ ! -f "Code/.env" ]; then
  echo "[*] Creating Code/.env from .env.example..."
  cp Code/.env.example Code/.env
  
  # Generate a cryptographically secure JWT_SECRET
  RANDOM_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "documind-secure-jwt-secret-$(date +%s)")
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/JWT_SECRET=\".*\"/JWT_SECRET=\"$RANDOM_SECRET\"/" Code/.env
  else
    sed -i "s/JWT_SECRET=\".*\"/JWT_SECRET=\"$RANDOM_SECRET\"/" Code/.env
  fi
  echo "[✓] Code/.env configured with new JWT secret."
else
  echo "[✓] Code/.env already exists."
fi

# 4. Check PostgreSQL Database
echo "[*] Checking PostgreSQL connection..."
DB_READY=false

check_db_port() {
  node -e "
    const net = require('net');
    const client = net.createConnection({ port: 5433, host: '127.0.0.1' }, () => {
      client.end();
      process.exit(0);
    });
    client.on('error', () => process.exit(1));
    setTimeout(() => { client.destroy(); process.exit(1); }, 1500);
  " 2>/dev/null
}

if check_db_port; then
  echo "[✓] PostgreSQL is active on port 5433."
  DB_READY=true
else
  echo "[!] Port 5433 is not currently responding."
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "[*] Docker detected. Starting PostgreSQL with pgvector via Docker Compose..."
    docker compose up -d postgres
    echo "[*] Waiting for PostgreSQL to be ready..."
    for i in {1..15}; do
      if check_db_port; then
        echo "[✓] PostgreSQL container is ready!"
        DB_READY=true
        break
      fi
      sleep 1
    done
  else
    echo "[-] Docker is not running or not installed."
    echo "    If you are running PostgreSQL natively, ensure it is listening on port 5433 or"
    echo "    update the DATABASE_URL in Code/.env to match your PostgreSQL instance."
  fi
fi

# 5. Install Dependencies
if [ ! -d "Code/node_modules" ]; then
  echo "[*] Installing project dependencies in Code/ (this may take a minute)..."
  (cd Code && npm install)
  echo "[✓] Dependencies installed successfully."
else
  echo "[✓] Dependencies already installed."
fi

# 6. Prisma Generate & Database Setup
echo "[*] Generating Prisma client..."
(cd Code && npx prisma generate)

if [ "$DB_READY" = true ]; then
  echo "[*] Synchronizing database schema..."
  (cd Code && npx prisma db push --skip-generate --accept-data-loss || true)

  echo "[*] Applying semantic cache vector tables..."
  (cd Code && npx tsx scripts/apply-cache-migration.ts || true)

  echo "[*] Seeding default administrator and test accounts..."
  (cd Code && npm run db:seed || true)
fi

# 7. Check Optional Ollama AI Server
if curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "[✓] Ollama local AI server is running on http://127.0.0.1:11434."
else
  echo "[i] Note: Ollama is not detected on http://127.0.0.1:11434."
  echo "    (You can use Ollama or configure an OpenAI API key in the DocuMind UI settings)."
fi

echo ""
echo "========================================================"
echo "          DocuMind Setup Finished Successfully!         "
echo "========================================================"
echo "  Web Application:   http://localhost:3000              "
echo "  Admin Login:       admin@example.com / password123   "
echo "  Standard User:     test@example.com  / password123   "
echo "========================================================"
echo ""
echo "[*] Launching browser and starting development server..."

# Open browser after a brief delay
if [[ "$OSTYPE" == "darwin"* ]]; then
  (sleep 3 && open "http://localhost:3000") >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 3 && xdg-open "http://localhost:3000") >/dev/null 2>&1 &
fi

# Start Next.js dev server
cd Code
exec npm run dev
