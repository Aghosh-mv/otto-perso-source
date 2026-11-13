#!/usr/bin/env bash
#
# Otto Perso — one-command deploy to your Tharavad.xyz VM.
#
#   usage:  bash scripts/deploy-tharavad.sh <your-tharavad-username> [gemini-api-key]
#
# It SSHs into <you>@<you>.tharavad.xyz and:
#   1. installs Node 20 + Bun + git (via nix profile — persistent, no nix-shell needed)
#   2. clones/updates the Otto repo + builds the Next.js standalone server
#   3. writes .env (persistent DB, vault, workspace under ~/otto-data)
#   4. installs a user systemd service that auto-restarts + survives reboot (enable-linger)
#   5. starts Otto on port 3000 and prints your URL + the device env vars to set
#
# The ONE thing it can't do for you: declare port 3000 in the Tharavad community
# config so https://<you>.tharavad.xyz proxies to your VM. That's a git PR into
# the tinkerhub0/tharavad repo (the "port in git" step). It prints the exact line
# to add. Everything else is automated.
#
# Re-run anytime to update Otto (git pull + rebuild + restart).

set -euo pipefail

USER="${1:?usage: deploy-tharavad.sh <tharavad-username> [gemini-key]}"
GEMINI="${2:-}"
HOST="${USER}@${USER}.tharavad.xyz"

echo "→ Deploying Otto to $HOST …"
echo "  (if this is your first SSH, accept the host fingerprint; you may be asked for a password / key)"
echo

# Run the whole setup remotely. Quoted heredoc => no local expansion; the remote
# bash expands its own variables. Args are passed as $1/$2.
ssh "$HOST" bash -s "$USER" "$GEMINI" <<'REMOTE'
set -euo pipefail
U="$1"; GEMINI="$2"
echo "[1/5] installing toolchain (Node 20, Bun, git) via nix profile…"
nix-install() {
  if command -v nix >/dev/null 2>&1; then
    nix profile install nixpkgs#"$1" 2>/dev/null || nix-env -iA nixpkgs."$1" 2>/dev/null || true
  fi
}
command -v node >/dev/null 2>&1 || nix-install nodejs_20
command -v bun  >/dev/null 2>&1 || nix-install bun
command -v git  >/dev/null 2>&1 || nix-install git
command -v openssl >/dev/null 2>&1 || nix-install openssl
# add ~/.nix-profile/bin to PATH for this session + the service later
export PATH="$HOME/.nix-profile/bin:$PATH"

echo "[2/5] cloning / updating Otto…"
mkdir -p "$HOME/otto-data"
if [ -d "$HOME/otto/.git" ]; then
  cd "$HOME/otto" && git pull --ff-only
else
  git clone https://github.com/Aghosh-mv/otto-perso-source.git "$HOME/otto"
  cd "$HOME/otto"
fi

echo "[3/5] writing .env + building…"
SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | tr -d '\n' | base64)"
GEMINI_KEY="${GEMINI:-AIzaSyBhbksuN31y_FGPkC3BEvTWv7lCvZ2Sf0Y}"
cat > "$HOME/otto/.env" <<EOF
DATABASE_URL=file:$HOME/otto-data/otto.db
GEMINI_API_KEY=$GEMINI_KEY
NEXTAUTH_SECRET=$SECRET
NEXTAUTH_URL=https://$U.tharavad.xyz
OTTO_VAULT_DIR=$HOME/otto-data/vault
OTTO_WORKSPACE_ROOT=$HOME/otto-data/workspace
EOF
bun install
bun run build
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true

echo "[4/5] installing always-on service (user systemd + linger)…"
mkdir -p "$HOME/.config/systemd/user"
NODE="$(command -v node)"
cat > "$HOME/.config/systemd/user/otto.service" <<EOF
[Unit]
Description=Otto Perso backend (always-on)
After=network.target
[Service]
WorkingDirectory=$HOME/otto/.next/standalone
EnvironmentFile=$HOME/otto/.env
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
Environment=PATH=$HOME/.nix-profile/bin:/run/wrappers/bin:/usr/bin:/bin
ExecStart=$NODE server.js
Restart=always
RestartSec=5
[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now otto.service
loginctl enable-linger "$U" 2>/dev/null || true   # run without an active SSH session + on boot

echo "[5/5] status…"
sleep 2
systemctl --user --no-pager --full status otto.service | head -10 || true

echo
echo "═══════════════════════════════════════════════════════════════"
echo "  Otto is running on your VM at http://localhost:3000"
echo "═══════════════════════════════════════════════════════════════"
echo
echo "ONE manual step (community git — can't be automated):"
echo "  Declare port 3000 so it becomes https://$U.tharavad.xyz."
echo "  In github.com/tinkerhub0/tharavad, add your port to the user-VM/proxy"
echo "  config (see DEPLOY-THARAVAD.md §3). Once applied, your public URL is:"
echo "    https://$U.tharavad.xyz"
echo
echo "Then on your devices (same Otto account on each):"
echo "  Desktop (Electron) env:   OTTO_REMOTE_URL=https://$U.tharavad.xyz"
echo "  Android (otto-mobile):    set REMOTE_URL='https://$U.tharavad.xyz' in App.tsx + rebuild"
echo
echo "Logs:   ssh $U@$U.tharavad.xyz 'journalctl --user -u otto -f'"
echo "Update: bash scripts/deploy-tharavad.sh $U   (re-run anytime)"
REMOTE

echo
echo "→ Done. If the SSH session above showed the status block, Otto is live on your VM."
