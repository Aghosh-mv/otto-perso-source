# How to build real native Otto installers (.dmg / .exe / .AppImage)

## The short version

You can't build native Mac/Windows installers from a Linux machine. But GitHub can — for free. This repo has GitHub Actions workflows that build all 3 platforms automatically when you push a version tag.

## Step-by-step

### 1. Create a GitHub repo

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `otto-perso`
3. Set to **Public**
4. **Don't** initialize with README (we'll push our own)
5. Click **Create repository**

### 2. Push the code

From this project folder:
```bash
git init
git add .
git commit -m "Otto Perso v1.0.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/otto-perso.git
git push -u origin main
```

### 3. Set repository secrets

Go to your repo → Settings → Secrets and variables → Actions → New repository secret:

- **`GEMINI_API_KEY`** = `AIzaSyBhbksuN31y_FGPkC3BEvTWv7lCvZ2Sf0Y` (or your own key)
- **`NEXTAUTH_SECRET`** = `otto-perso-local-dev-secret-change-me-9k2m5x7q8w3e1r4t6y0u`

### 4. Tag a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 5. Watch the build

Go to your repo → **Actions** tab. You'll see two workflows running:

- **"Release Otto Perso"** — builds native installers (.dmg, .exe, .AppImage, .deb) via Tauri
- **"Build Portable Bundles"** — builds the portable zips (no Rust needed, finishes faster)

Both run in parallel on real macOS, Windows, and Linux VMs. Takes ~10-15 minutes.

### 6. Download your installers

When the builds finish, go to your repo → **Releases** → you'll see:

**From the Tauri build (native installers):**
- `Otto-Perso_1.0.0_x64.dmg` — macOS installer (Intel)
- `Otto-Perso_1.0.0_aarch64.dmg` — macOS installer (Apple Silicon)
- `Otto-Perso_1.0.0_x64-setup.exe` — Windows installer
- `Otto-Perso_1.0.0_amd64.AppImage` — Linux portable app
- `otto-perso_1.0.0_amd64.deb` — Linux Debian/Ubuntu package

**From the portable build:**
- `otto-perso-1.0.0-macos.zip` — Mac portable (no install)
- `otto-perso-1.0.0-windows.zip` — Windows portable
- `otto-perso-1.0.0-linux.zip` — Linux portable

### 7. Update your marketing site

The download URLs will be:
```
https://github.com/YOUR_USERNAME/otto-perso/releases/download/v1.0.0/Otto-Perso_1.0.0_x64.dmg
https://github.com/YOUR_USERNAME/otto-perso/releases/download/v1.0.0/Otto-Perso_1.0.0_x64-setup.exe
https://github.com/YOUR_USERNAME/otto-perso/releases/download/v1.0.0/Otto-Perso_1.0.0_amd64.AppImage
```

Update the `PLATFORMS` object in `marketing-site/index.html` with these URLs, then redeploy the marketing site to Vercel.

---

## Why this works

- **GitHub Actions** gives you 2,000 free build minutes/month
- macOS runners are real Macs (can build .dmg)
- Windows runners are real Windows (can build .exe)
- Linux runners build .AppImage + .deb
- Tauri compiles a native binary for each platform — real desktop app, not a zip with a script
- The binaries are ~10-20MB (much smaller than the 66MB portable zips)

## Cost

**Free.** GitHub Actions free tier: 2,000 minutes/month for public repos (unlimited for public repos actually). Each build uses ~30 minutes across all platforms. You'd need to build 60+ times per month to hit limits.

## What the native installers look like

- **macOS `.dmg`** — drag Otto to Applications folder, launches like any Mac app
- **Windows `.exe`** — installer wizard, adds to Start Menu + desktop shortcut
- **Linux `.AppImage`** — single file, double-click to run, no install
- **Linux `.deb`** — `sudo dpkg -i otto-perso.deb`, adds to app launcher

These are real desktop apps. Not browser-based. Native windows with proper title bars, dock icons, the works.

---

## If you just want the portable zips now (skip native)

The portable zips are already built and ready. They work today, no GitHub needed. They're just not "real" installers — they're a folder you unzip + double-click a script.

To get them hosted right now: claim the Vercel deployment I made earlier, or upload to Google Drive / Dropbox.

But for the real `.dmg`/`.exe`/`.AppImage` — GitHub Actions is the way.
