'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');

const HOME_DIR = process.env.HOME || os.homedir();
const DATA_PATH = path.join(HOME_DIR, '.ghostrun');
const DB_PATH = path.join(DATA_PATH, 'data', 'ghostrun.db');

// ── Database ───────────────────────────────────────────────────────────────
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  console.error('better-sqlite3 not found. Run: npm install');
  app.quit();
}

function openDb() {
  if (!fs.existsSync(DB_PATH)) return null;
  return new Database(DB_PATH, { readonly: true });
}

// ── Window ─────────────────────────────────────────────────────────────────
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle('app:status', () => {
  const db = openDb();
  if (!db) return { flows: 0, runs: 0, passed: 0, failed: 0, dataPath: DATA_PATH, aiProvider: 'unknown', dbExists: false };
  try {
    const flows = db.prepare('SELECT COUNT(*) as n FROM flows').get().n;
    const runs = db.prepare('SELECT COUNT(*) as n FROM runs').get().n;
    const passed = db.prepare("SELECT COUNT(*) as n FROM runs WHERE status = 'passed'").get().n;
    const failed = db.prepare("SELECT COUNT(*) as n FROM runs WHERE status = 'failed'").get().n;
    db.close();
    return { flows, runs, passed, failed, dataPath: DATA_PATH, dbExists: true };
  } catch (e) {
    try { db.close(); } catch {}
    return { flows: 0, runs: 0, passed: 0, failed: 0, dataPath: DATA_PATH, dbExists: false, error: String(e) };
  }
});

ipcMain.handle('flows:list', () => {
  const db = openDb();
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT * FROM flows ORDER BY updated_at DESC').all();
    db.close();
    return rows.map(r => ({ id: r.id, name: r.name, description: r.description, appUrl: r.app_url, updatedAt: r.updated_at, createdBy: r.created_by || 'human' }));
  } catch (e) {
    try { db.close(); } catch {}
    return [];
  }
});

ipcMain.handle('flows:delete', (_, id) => {
  const db = new Database(DB_PATH);
  try {
    const changes = db.prepare('DELETE FROM flows WHERE id = ?').run(id).changes;
    db.close();
    return { ok: changes > 0 };
  } catch (e) {
    try { db.close(); } catch {}
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('runs:list', () => {
  const db = openDb();
  if (!db) return [];
  try {
    const rows = db.prepare(`
      SELECT r.*, f.name as flow_name
      FROM runs r LEFT JOIN flows f ON r.flow_id = f.id
      ORDER BY r.started_at DESC LIMIT 100
    `).all();
    db.close();
    return rows.map(r => ({
      id: r.id, flowId: r.flow_id, flowName: r.flow_name || 'Unknown',
      status: r.status, duration: r.duration, startedAt: r.started_at,
      errorMessage: r.error_message, summary: r.summary,
    }));
  } catch (e) {
    try { db.close(); } catch {}
    return [];
  }
});

ipcMain.handle('runs:get-steps', (_, runId) => {
  const db = openDb();
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY step_number').all(runId);
    db.close();
    return rows.map(r => ({
      id: r.id, stepNumber: r.step_number, name: r.name, action: r.action,
      selector: r.selector, status: r.status, duration: r.duration,
      errorMessage: r.error_message, screenshotPath: r.screenshot_path,
    }));
  } catch (e) {
    try { db.close(); } catch {}
    return [];
  }
});

ipcMain.handle('runs:get-screenshot', (_, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
});

ipcMain.handle('flow:run', (event, flowId) => {
  const ghostrunJs = path.join(__dirname, '..', '..', 'ghostrun.js');
  return new Promise((resolve) => {
    const child = spawn('node', [ghostrunJs, 'run', flowId], {
      cwd: path.join(__dirname, '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', d => {
      const chunk = d.toString();
      output += chunk;
      event.sender.send('run:progress', { type: 'stdout', text: chunk });
    });
    child.stderr.on('data', d => {
      event.sender.send('run:progress', { type: 'stderr', text: d.toString() });
    });
    child.on('close', code => {
      event.sender.send('run:progress', { type: 'done', exitCode: code });
      resolve({ exitCode: code, output });
    });
  });
});

ipcMain.handle('shell:open', (_, filePath) => {
  shell.openPath(filePath);
});
