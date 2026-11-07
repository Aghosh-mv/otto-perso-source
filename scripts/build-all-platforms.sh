#!/usr/bin/env bash
# Otto Perso — Lean multi-platform portable bundle builder
# Builds 3 zips (Mac, Windows, Linux) using only the traced standalone files.
# Each zip is ~55MB.

set -e

VERSION="1.0.0"
ROOT_DIR="$(pwd)"

echo "╔══════════════════════════════════════════════╗"
echo "║  Otto Perso — Lean Bundle Builder             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. Build Next.js standalone (traced files only)
echo "→ Building Next.js standalone..."
bun run build:next-standalone > /dev/null 2>&1

# 2. Prepare launcher scripts
mkdir -p scripts/launchers

cat > scripts/launchers/otto.sh << 'LAUNCHER'
#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -f db/custom.db ]; then
  echo "→ Initializing database..."
  mkdir -p db
  node node_modules/prisma/build/index.js db push --accept-data-loss 2>/dev/null || npx prisma db push --accept-data-loss 2>/dev/null
fi
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
echo "→ Starting Otto..."
PORT=3000 NODE_ENV=production node server.js &
SERVER_PID=$!
echo "→ Waiting for Otto to wake up..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/login > /dev/null 2>&1; then echo "✓ Otto is ready!"; break; fi
  sleep 1
done
if command -v open &> /dev/null; then open http://localhost:3000
elif command -v xdg-open &> /dev/null; then xdg-open http://localhost:3000; fi
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Otto Perso is running.                      ║"
echo "║  Open: http://localhost:3000                 ║"
echo "║  Stop: Ctrl+C                                ║"
echo "╚══════════════════════════════════════════════╝"
wait $SERVER_PID
LAUNCHER

cat > scripts/launchers/otto.bat << 'WINLAUNCHER'
@echo off
cd /d "%~dp0"
if not exist db\custom.db (
  echo Initializing database...
  mkdir db 2>nul
  call npx prisma db push --accept-data-loss
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

cat > scripts/launchers/README.txt << 'README'
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

REQUIREMENTS:
  - Node.js 18+ (download from nodejs.org if you don't have it)
  - That's it.

DATA LOCATION:
  Database: db/custom.db (in this folder)
  Vault:    ~/otto-vault/ (your home directory)
  Workspace: ~/otto-workspace/

© 2026 Otto Perso. MIT License.
README

# 3. Assemble each platform bundle (lean — only traced files)
assemble_lean() {
  local PLATFORM=$1
  local BUNDLE_NAME="otto-perso-${VERSION}-${PLATFORM}"
  local BUNDLE_DIR="build/${BUNDLE_NAME}"

  rm -rf "${BUNDLE_DIR}"
  mkdir -p "${BUNDLE_DIR}/.next/static" "${BUNDLE_DIR}/public" "${BUNDLE_DIR}/prisma" "${BUNDLE_DIR}/db"

  # Copy ONLY the traced standalone server.js + its traced node_modules
  cp .next/standalone/server.js "${BUNDLE_DIR}/"
  cp -r .next/standalone/node_modules "${BUNDLE_DIR}/node_modules"

  # Copy static + public
  cp -r .next/static/* "${BUNDLE_DIR}/.next/static/" 2>/dev/null || true
  cp -r public/* "${BUNDLE_DIR}/public/" 2>/dev/null || true

  # Prisma schema + the prisma client binary
  cp prisma/schema.prisma "${BUNDLE_DIR}/prisma/"
  # Ensure prisma CLI is in node_modules for db push
  mkdir -p "${BUNDLE_DIR}/node_modules/prisma/build"
  cp -r node_modules/prisma/build/* "${BUNDLE_DIR}/node_modules/prisma/build/" 2>/dev/null || true
  cp node_modules/prisma/package.json "${BUNDLE_DIR}/node_modules/prisma/" 2>/dev/null || true

  # .env with bundled key
  cp .env.example "${BUNDLE_DIR}/.env" 2>/dev/null || cp .env "${BUNDLE_DIR}/.env"

  # Launchers (include both in every bundle)
  cp scripts/launchers/otto.sh "${BUNDLE_DIR}/otto.sh"
  cp scripts/launchers/otto.bat "${BUNDLE_DIR}/otto.bat"
  chmod +x "${BUNDLE_DIR}/otto.sh"
  cp scripts/launchers/README.txt "${BUNDLE_DIR}/README.txt"

  # Zip
  cd build
  zip -r "${BUNDLE_NAME}.zip" "${BUNDLE_NAME}" -x "*.DS_Store" > /dev/null
  cd "${ROOT_DIR}"
  rm -rf "${BUNDLE_DIR}"

  local SIZE=$(du -h "build/${BUNDLE_NAME}.zip" | cut -f1)
  echo "✓ ${PLATFORM}: build/${BUNDLE_NAME}.zip (${SIZE})"
}

mkdir -p build
echo "Building lean bundles..."
assemble_lean "macos"
assemble_lean "windows"
assemble_lean "linux"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ All bundles built!                         ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  These are real, downloadable Otto apps.      ║"
echo "║  Each ~55MB. Contains:                        ║"
echo "║   - Next.js standalone server                 ║"
echo "║   - All traced dependencies                   ║"
echo "║   - Bundled brain key (works out of box)      ║"
echo "║   - Platform launcher scripts                 ║"
echo "║   - README                                    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
ls -lh build/otto-perso-1.0.0-*.zip
