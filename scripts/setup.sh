#!/usr/bin/env bash
# Otto Perso — first-run setup script
# Run this once after cloning/downloading to get Otto running.
#
# Usage:
#   bash scripts/setup.sh      # or: bun run setup

set -e

echo "╔══════════════════════════════════════════════╗"
echo "║  Otto Perso — Setup                          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. Check for bun
if ! command -v bun &> /dev/null; then
  echo "✗ bun is not installed."
  echo "  Install it: https://bun.sh"
  echo "  Or:  curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "✓ bun $(bun --version)"

# 2. Install dependencies
echo ""
echo "→ Installing dependencies..."
bun install

# 3. Generate Prisma client
echo ""
echo "→ Generating database client..."
bun run db:generate

# 4. Create database + push schema
echo ""
echo "→ Creating database..."
bun run db:push

# 5. Check for .env
if [ ! -f .env ]; then
  echo ""
  echo "→ Creating .env from .env.example..."
  cp .env.example .env
  echo "  ✓ .env created. Otto ships with a bundled brain key — no setup needed."
else
  echo ""
  echo "✓ .env already exists"
fi

# 6. Create workspace dir
mkdir -p /home/z/otto-workspace 2>/dev/null || true
mkdir -p /home/z/otto-vault 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ Setup complete!                           ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  Start Otto:                                 ║"
echo "║    bun run dev                               ║"
echo "║                                              ║"
echo "║  Then open:                                  ║"
echo "║    http://localhost:3000                     ║"
echo "║                                              ║"
echo "║  Default login:                              ║"
echo "║    owner@otto.local / otto-perso-owner       ║"
echo "║  (or create your own at /register)           ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
