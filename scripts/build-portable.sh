#!/usr/bin/env bash
# Otto Perso — Portable bundle builder
# Produces a self-contained zip that runs without installation.
# User downloads, unzips, double-clicks Otto → it opens in their browser.
#
# Usage:
#   bash scripts/build-portable.sh

set -e

VERSION=$(node -p "require('./package.json').version")
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
BUNDLE_NAME="otto-perso-${VERSION}-${PLATFORM}-${ARCH}"
BUILD_DIR="build/portable"
BUNDLE_DIR="${BUILD_DIR}/${BUNDLE_NAME}"

echo "╔══════════════════════════════════════════════╗"
echo "║  Otto Perso — Portable Bundle Builder        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Version:  ${VERSION}"
echo "Platform: ${PLATFORM}-${ARCH}"
echo "Bundle:   ${BUNDLE_NAME}.zip"
echo ""

# 1. Build Next.js standalone
echo "→ Building Next.js standalone bundle..."
bun run build:next-standalone

# 2. Clean bundle dir
echo "→ Preparing bundle directory..."
rm -rf "${BUNDLE_DIR}"
mkdir -p "${BUNDLE_DIR}"

# 3. Copy standalone server
echo "→ Copying standalone server..."
cp -r .next/standalone/* "${BUNDLE_DIR}/"

# 4. Copy static assets (already copied by build:next-standalone, but ensure)
mkdir -p "${BUNDLE_DIR}/.next/static"
cp -r .next/static/* "${BUNDLE_DIR}/.next/static/" 2>/dev/null || true
mkdir -p "${BUNDLE_DIR}/public"
cp -r public/* "${BUNDLE_DIR}/public/" 2>/dev/null || true

# 5. Copy Prisma schema + migrations
echo "→ Copying database files..."
mkdir -p "${BUNDLE_DIR}/prisma"
cp prisma/schema.prisma "${BUNDLE_DIR}/prisma/"
cp -r prisma/migrations "${BUNDLE_DIR}/prisma/" 2>/dev/null || true

# 6. Copy .env.example (not .env — user creates their own or uses bundled)
cp .env.example "${BUNDLE_DIR}/.env" 2>/dev/null || true

# 7. Create launcher scripts
echo "→ Creating launcher scripts..."

# Unix launcher
cat > "${BUNDLE_DIR}/otto.sh" << 'LAUNCHER'
#!/usr/bin/env bash
# Otto Perso launcher — starts the server and opens your browser.
cd "$(dirname "$0")"

# Ensure DB exists
if [ ! -f db/custom.db ]; then
  echo "→ Initializing database..."
  mkdir -p db
  npx prisma db push --accept-data-loss 2>/dev/null || bunx prisma db push --accept-data-loss
fi

# Start server in background
echo "→ Starting Otto..."
PORT=3000 NODE_ENV=production node server.js &
SERVER_PID=$!

# Wait for server to be ready
echo "→ Waiting for Otto to wake up..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/login > /dev/null 2>&1; then
    echo "✓ Otto is ready!"
    break
  fi
  sleep 1
done

# Open browser
echo "→ Opening browser..."
if command -v open &> /dev/null; then
  open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
  xdg-open http://localhost:3000
elif command -v wslview &> /dev/null; then
  wslview http://localhost:3000
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Otto Perso is running.                      ║"
echo "║  Open: http://localhost:3000                 ║"
echo "║  Stop: Ctrl+C                                ║"
echo "╚══════════════════════════════════════════════╝"

# Wait for server to exit
wait $SERVER_PID
LAUNCHER
chmod +x "${BUNDLE_DIR}/otto.sh"

# Windows launcher
cat > "${BUNDLE_DIR}/otto.bat" << 'WINLAUNCHER'
@echo off
cd /d "%~dp0"

if not exist db\custom.db (
  echo Initializing database...
  mkdir db 2>nul
  npx prisma db push --accept-data-loss
)

echo Starting Otto...
start /b cmd /c "set PORT=3000 && set NODE_ENV=production && node server.js"

echo Waiting for Otto to wake up...
timeout /t 5 /nobreak >nul

echo Opening browser...
start http://localhost:3000

echo.
echo Otto Perso is running.
echo Open: http://localhost:3000
echo Close this window to stop Otto.
pause >nul
WINLAUNCHER

# README inside the bundle
cat > "${BUNDLE_DIR}/README.txt" << 'README'
OTTO PERSO — Your digital employee

HOW TO RUN:
  Mac/Linux:   Double-click otto.sh (or run: bash otto.sh)
  Windows:     Double-click otto.bat

Otto opens in your browser at http://localhost:3000

FIRST RUN:
  - Default login: owner@otto.local / otto-perso-owner
  - Or create your own account at /register

OTTO'S BRAIN:
  Otto ships with a bundled brain key — works out of the box.
  To use your own key: Settings → Brain → paste your key.

STOP OTTO:
  Close the terminal window, or Ctrl+C.

DATA LOCATION:
  Database: db/custom.db (in this folder)
  Vault:    ~/otto-vault/ (your home directory)
  Workspace: ~/otto-workspace/

© 2026 Otto Perso. MIT License.
README

# 8. Create the zip
echo "→ Creating zip archive..."
cd "${BUILD_DIR}"
zip -r "../${BUNDLE_NAME}.zip" "${BUNDLE_NAME}" -x "*.DS_Store" > /dev/null
cd ../..

ZIP_PATH="build/${BUNDLE_NAME}.zip"
ZIP_SIZE=$(du -h "${ZIP_PATH}" | cut -f1)

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ Portable bundle built!                    ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  File: ${ZIP_PATH}"
echo "║  Size: ${ZIP_SIZE}                            ║"
echo "║                                              ║"
echo "║  Users:                                      ║"
echo "║  1. Download the zip                         ║"
echo "║  2. Unzip                                    ║"
echo "║  3. Double-click otto.sh (or otto.bat)       ║"
echo "║  4. Otto opens in browser                    ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
