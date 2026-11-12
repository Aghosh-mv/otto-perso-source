// Otto Perso — Electron main process
// Bundles the Next.js server INSIDE the desktop app.
// No localhost visible. No terminal. No Node.js install needed.
// Double-click → server starts internally → native window opens → Otto is there.

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let mascotWindow = null;
let serverProcess = null;
const PORT = 3000;

function getServerPath() {
  // In production (packaged app), the app files are in resources/app
  // In development, they're in the project root
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', '.next', 'standalone');
  }
  return path.join(__dirname, '.next', 'standalone');
}

function startServer() {
  const serverDir = getServerPath();
  const serverFile = path.join(serverDir, 'server.js');

  console.log('Server directory:', serverDir);
  console.log('Server file exists:', fs.existsSync(serverFile));

  if (!fs.existsSync(serverFile)) {
    console.error('Server file not found:', serverFile);
    return;
  }

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
  };

  // Use the Electron-bundled Node.js to run the server
  serverProcess = spawn(process.execPath, [serverFile], {
    cwd: serverDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (data) => {
    console.log('[server]', data.toString().trim());
  });

  serverProcess.stderr.on('data', (data) => {
    console.error('[server]', data.toString().trim());
  });
}

function waitForServer(callback) {
  let attempts = 0;
  const maxAttempts = 60;
  const check = () => {
    if (attempts++ > maxAttempts) {
      console.error('Server did not start within timeout');
      callback(false);
      return;
    }
    const req = http.get(`http://127.0.0.1:${PORT}/login`, (res) => {
      if (res.statusCode === 200 || res.statusCode === 302) {
        console.log('Server is ready!');
        callback(true);
      } else {
        setTimeout(check, 500);
      }
    });
    req.on('error', () => setTimeout(check, 500));
    req.setTimeout(2000, () => {
      req.destroy();
      setTimeout(check, 500);
    });
  };
  check();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Otto Perso',
    backgroundColor: '#FAFAF9',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Lok mascot overlay ────────────────────────────────────────────────────
// A transparent, frameless, always-on-top, movable window that floats the
// mascot on top of everything on screen. Drag it anywhere. The overlay page
// (/mascot-overlay) reads its config + mood from localStorage, so the main app
// can pop Lok in with an emote by setting `otto.mascot.mood` in localStorage.
function createMascotOverlay() {
  mascotWindow = new BrowserWindow({
    width: 340,
    height: 420,
    x: 80,
    y: 80,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mascotWindow.setAlwaysOnTop(true, 'floating');
  mascotWindow.loadURL(`http://127.0.0.1:${PORT}/mascot-overlay`);
  mascotWindow.on('closed', () => { mascotWindow = null; });
  // Click-through on transparent pixels (Electron >=20). Falls back gracefully
  // on older builds — the mascot stays draggable.
  try { mascotWindow.setIgnoreMouseEvents(false, { forward: true }); } catch {}
}

// IPC — the renderer can ask to show/hide/set-mood on the overlay.
ipcMain.on('mascot:show', () => { if (mascotWindow) mascotWindow.show(); else createMascotOverlay(); });
ipcMain.on('mascot:hide', () => { if (mascotWindow) mascotWindow.hide(); });
ipcMain.on('mascot:move', (_e, x, y) => { try { if (mascotWindow) mascotWindow.setPosition(x, y); } catch {} });
ipcMain.on('mascot:toggle', () => {
  if (!mascotWindow) { createMascotOverlay(); return; }
  mascotWindow.isVisible() ? mascotWindow.hide() : mascotWindow.show();
});
ipcMain.on('mascot:mood', (_e, mood) => {
  if (!mascotWindow) createMascotOverlay();
  if (mascotWindow) {
    mascotWindow.show();
    mascotWindow.webContents.executeJavaScript(
      `localStorage.setItem('otto.mascot.mood', ${JSON.stringify(String(mood))})`
    );
    setTimeout(() => {
      mascotWindow && mascotWindow.webContents.executeJavaScript(
        `localStorage.removeItem('otto.mascot.mood')`
      );
    }, 4000);
  }
});

app.whenReady().then(() => {
  startServer();
  waitForServer((ready) => {
    if (ready) {
      createWindow();
      createMascotOverlay();
    } else {
      // Create window anyway — user will see an error page
      createWindow();
      createMascotOverlay();
    }
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill('SIGKILL');
      }
    }, 3000);
  }
});
