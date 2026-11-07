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
