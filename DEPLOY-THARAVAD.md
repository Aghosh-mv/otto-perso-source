# Deploying Otto on Tharavad.xyz (always-on, self-hosted, no cloud)

Tharavad.xyz is a **free community Linux server** (TinkerHub Kerala). Each user
gets **root on their own NixOS VM** and can expose a port to a public HTTPS URL:
`https://<username>.tharavad.xyz`. Hosting Otto there gives you an always-on
backend so Lok + your chats are shared across your phone and laptop — no cloud,
no credit card.

## What you get
- Always-on Otto backend reachable at `https://<you>.tharavad.xyz`.
- Cross-device Lok: set `OTTO_REMOTE_URL` (Electron) + `REMOTE_URL` (mobile) to
  that URL → phone + laptop share one account, one chat history, one mascot.
- Lok travels between devices (active-device routing), pops in proactively, and
  the "Hey Otto" voice call works from any device pointing at the backend.

## 0. Get access (if you don't have it yet)
- Sign up: https://auth.tharavad.xyz/if/flow/tinkerhub-enrollment/
- SSH in once approved: `ssh <you>@<you>.tharavad.xyz` (you = your username).
  You land as root on your own NixOS VM. "Your mess stays yours."

## 1. Build Otto on the VM
NixOS uses nixpkgs. Get Node 20 + Bun into a shell, clone, build the Next.js
standalone server:

```bash
# one-time: enter a shell with the toolchain
nix-shell -p nodejs_20 bun git

git clone https://github.com/Aghosh-mv/otto-perso-source.git otto
cd otto
bun install                # or npm install
cp .env.example .env       # then edit .env (see below)
bun run build              # produces .next/standalone + .next/static
```

### `.env` (the important ones)
```
DATABASE_URL=file:/home/<you>/otto-data/otto.db   # persistent path, NOT inside the repo
GEMINI_API_KEY=<your key>                          # the bundled default works too
NEXTAUTH_SECRET=<generate a long random string>
NEXTAUTH_URL=https://<you>.tharavad.xyz
OTTO_VAULT_DIR=/home/<you>/otto-data/vault
OTTO_WORKSPACE_ROOT=/home/<you>/otto-data/workspace
```
Move the static + public assets next to the standalone server (Next requirement):
```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

## 2. Run it (smoke test)
```bash
cd .next/standalone
PORT=3000 node server.js
# visit http://localhost:3000 on the VM — should show Otto login
```

## 3. Expose it to the public URL
Tharavad maps "a port in git → https://<you>.tharavad.xyz". Declare the port your
Otto server listens on (3000) in the Tharavad config (the mothership Nix flake /
the `tinkerspace-vm` or `vps` config in github.com/tinkerhub0/tharavad). Once
applied, `https://<you>.tharavad.xyz` proxies to your VM:3000.

Optional multiplexing: the repo's `Caddyfile` listens on `:81` and proxies to
`:3000`, with `?XTransformPort=<port>` to reach any other port on the VM. If you
prefer one entry point for several services, run that Caddy and expose port 81.

## 4. Make it always-on (NixOS systemd service)
On NixOS you define a service in your VM's nix config (home-manager or
configuration.nix). Minimal systemd unit equivalent:

```nix
# in your nixos config
systemd.services.otto = {
  description = "Otto Perso backend";
  after = [ "network.target" ];
  wantedBy = [ "multi-user.target" ];
  serviceConfig = {
    WorkingDirectory = "/home/<you>/otto/.next/standalone";
    EnvironmentFile = "/home/<you>/otto/.env";
    ExecStart = "${pkgs.nodejs_20}/bin/node server.js";
    Restart = "always";
    RestartSec = 5;
    Environment = "PORT=3000" "HOSTNAME=127.0.0.1";
  };
};
```
Apply with `nixos-rebuild switch` (or however your VM takes config). Otto now
restarts on crash and survives reboots — always on.

## 5. Point your devices at it
- **Desktop (Electron)**: set `OTTO_REMOTE_URL=https://<you>.tharavad.xyz` in the
  app's env. It skips the bundled local server and talks to your Tharavad backend.
- **Android (otto-mobile)**: set `REMOTE_URL = 'https://<you>.tharavad.xyz'` in
  `otto-mobile/App.tsx` (or via react-native-config) and rebuild the APK.
- Sign in on each device with the **same Otto account**.

Now: open your phone → same chats as laptop. Say "hey Otto" on either → it wakes
there, claims active, Lok travels. The desktop overlay only pops on the device
you're using. Proactive pop-ins, voice, drafts — all driven by the always-on
backend.

## Persistence notes
- Keep `otto-data/` (the SQLite db, vault, workspace) on your VM's persistent
  home — not inside the cloned repo, so `git pull` updates don't wipe data.
- SQLite is fine for single-account use. If you later want concurrent
  multi-device writes with no lock contention, swap `DATABASE_URL` to Postgres
  (run it on the VM or use Headscale to reach a private one).

## Updating
```bash
cd ~/otto
git pull
bun install
bun run build
cp -r .next/static .next/standalone/.next/static
systemctl restart otto   # or: nixos-rebuild switch
```

## Caveats
- The VM is community-shared infrastructure — don't put secrets you wouldn't
  trust to a shared box in `otto-data/`. Use Vaultwarden (vault.tharavad.xyz) for
  real secrets if needed.
- If the Tharavad VM reboots/wipes, your data in `otto-data/` goes with it unless
  you back it up. Back up the SQLite db + vault periodically.
- "Always-on" = while the Tharavad host is up + your VM is running. Community
  servers can have downtime; it's not an SLA.
