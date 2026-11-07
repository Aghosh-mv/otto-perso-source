// Cross-platform Next.js standalone build script.
// Works on macOS, Windows, and Linux. Replaces the bash-only "cp -r" commands.

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function run(cmd) {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: process.cwd() })
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

console.log('Building Next.js standalone...')
run('next build')

// Copy static assets into standalone (cross-platform)
const staticSrc = path.join('.next', 'static')
const staticDest = path.join('.next', 'standalone', '.next', 'static')
console.log(`Copying ${staticSrc} → ${staticDest}`)
copyDir(staticSrc, staticDest)

const publicSrc = 'public'
const publicDest = path.join('.next', 'standalone', 'public')
if (fs.existsSync(publicSrc)) {
  console.log(`Copying ${publicSrc} → ${publicDest}`)
  copyDir(publicSrc, publicDest)
}

// Create out/ directory with a loading page for Tauri
const outDir = path.join('out')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

fs.writeFileSync(path.join(outDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=http://localhost:3000">
<title>Otto Perso</title>
<style>body{background:#FAFAF9;color:#0A0A0A;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.loader{width:40px;height:40px;border:3px solid #E5E5E5;border-top-color:#0A0A0A;border-radius:50%;animation:spin 0.8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style>
</head>
<body><div class="loader"></div></body>
</html>`)

console.log('✓ Build complete')
