#!/usr/bin/env bash
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "Starting DocuMind..."
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose up -d postgres 2>/dev/null || true
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  (sleep 2 && open "http://localhost:3000") >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "http://localhost:3000") >/dev/null 2>&1 &
fi

cd Code
exec npm run dev
