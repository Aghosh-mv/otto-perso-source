// Otto Perso — Electron main process
// Bundles the Next.js server INSIDE the desktop app.
// No localhost visible. No terminal. No Node.js install needed.
// Double-click → server starts internally → native window opens → Otto is there.

const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let serverProcess = null;
const PORT = 3000;

function getServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return __dirname;
}

function startServer() {
  const serverDir = getServerPath();
  const serverFile = path.join(serverDir, 'server.js');

  if (!fs.existsSync(serverFile)) {
    console.error('Server file not found:', serverFile);
    return;
  }

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    ELECTRON_RUN_AS_NODE: undefined,
  };

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
      callback(false);
      return;
    }
    const req = http.get(`http://127.0.0.1:${PORT}/login`, (res) => {
      if (res.statusCode === 200 || res.statusCode === 302) {
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

app.whenReady().then(() => {
  startServer();
  waitForServer((ready) => {
    if (ready) {
      createWindow();
    } else {
      createWindow();
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
