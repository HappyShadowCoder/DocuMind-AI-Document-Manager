@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo           DocuMind - AI Document Manager               
echo               Windows Setup Launcher                   
echo ========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [-] Error: Node.js is not installed.
    echo     Please install Node.js (version 18+) from https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [-] Error: npm is not installed.
    pause
    exit /b 1
)

echo [✓] Node.js and npm detected.

if not exist "Code\.env" (
    echo [*] Creating Code\.env from .env.example...
    copy "Code\.env.example" "Code\.env" >nul
    echo [✓] Code\.env created.
) else (
    echo [✓] Code\.env already exists.
)

where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] Starting PostgreSQL container with pgvector...
    docker compose up -d postgres
    timeout /t 3 >nul
)

if not exist "Code\node_modules" (
    echo [*] Installing dependencies in Code\...
    cd Code
    call npm install
    cd ..
)

echo [*] Generating Prisma Client...
cd Code
call npx prisma generate
call npx prisma db push --skip-generate --accept-data-loss
call npx tsx scripts/apply-cache-migration.ts
call npm run db:seed
cd ..

echo.
echo ========================================================
echo       DocuMind Setup Finished Successfully!             
echo   URL:          http://localhost:3000                  
echo   Admin Login:  admin@example.com / password123       
echo ========================================================
echo.

start http://localhost:3000

cd Code
call npm run dev
