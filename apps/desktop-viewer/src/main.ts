/**
 * Flowmind Desktop Viewer - Main Process
 * 
 * A lightweight desktop app that invokes the CLI internally
 * and displays results in a beautiful UI.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let cliProcess: ChildProcess | null = null;

const DATA_PATH = path.join(app.getPath('home'), '.flowmind');
const SCREENSHOTS_PATH = path.join(DATA_PATH, 'screenshots');

// Find flowmind CLI
function findCLI(): string {
  // Try to find the CLI in various locations
  const locations = [
    path.join(__dirname, '../../cli/dist/cli.js'),
    path.join(__dirname, '../../../cli/dist/cli.js'),
    path.join(process.cwd(), 'apps/cli/dist/cli.js'),
    '/usr/local/bin/flowmind',
    path.join(app.getAppPath(), 'resources/flowmind'),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return `node "${loc}"`;
    }
  }

  // Fallback - assume CLI is available in PATH
  return 'flowmind';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Flowmind',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the renderer
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers - These invoke the CLI and return results

ipcMain.handle('cli:run', async (_, command: string, args: string[]) => {
  const cli = findCLI();
  const fullCommand = `${cli} ${command} ${args.join(' ')}`;
  
  try {
    const output = execSync(fullCommand, {
      encoding: 'utf-8',
      cwd: process.cwd(),
      timeout: 60000,
    });
    return { success: true, output };
  } catch (error: unknown) {
    const err = error as { message?: string; stderr?: string };
    return { 
      success: false, 
      output: err.stderr || err.message || 'Unknown error',
    };
  }
});

ipcMain.handle('cli:spawn', async (_, command: string, args: string[]) => {
  const cli = findCLI();
  
  return new Promise((resolve) => {
    const child = spawn(cli, [command, ...args], {
      cwd: process.cwd(),
      env: process.env,
    });

    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      mainWindow?.webContents.send('cli:output', text);
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      mainWindow?.webContents.send('cli:error', text);
    });

    child.on('close', (code) => {
      cliProcess = null;
      resolve({ 
        success: code === 0, 
        output, 
        error: errorOutput,
        code 
      });
    });

    child.on('error', (error) => {
      cliProcess = null;
      resolve({ 
        success: false, 
        output: '', 
        error: error.message 
      });
    });

    cliProcess = child;
  });
});

ipcMain.handle('cli:kill', async () => {
  if (cliProcess) {
    cliProcess.kill();
    cliProcess = null;
    return { success: true };
  }
  return { success: false };
});

// File operations
ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
  try {
    const fullPath = path.join(DATA_PATH, dirPath);
    const files = fs.readdirSync(fullPath, { withFileTypes: true });
    return {
      success: true,
      data: files.map(f => ({
        name: f.name,
        isDirectory: f.isDirectory(),
        path: path.join(dirPath, f.name),
      })),
    };
  } catch (error: unknown) {
    const err = error as { message?: string };
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    const fullPath = path.join(DATA_PATH, filePath);
    const content = fs.readFileSync(fullPath);
    return { success: true, data: content.toString('base64') };
  } catch (error: unknown) {
    const err = error as { message?: string };
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs:exists', async (_, filePath: string) => {
  const fullPath = path.join(DATA_PATH, filePath);
  return fs.existsSync(fullPath);
});

ipcMain.handle('path:getData', async () => DATA_PATH);
ipcMain.handle('path:getScreenshots', async () => SCREENSHOTS_PATH);

// Open external links
ipcMain.handle('shell:openExternal', async (_, url: string) => {
  await shell.openExternal(url);
});

// Get database data (direct SQLite access)
ipcMain.handle('db:getFlows', async () => {
  try {
    const dbPath = path.join(DATA_PATH, 'data', 'flowmind.db');
    if (!fs.existsSync(dbPath)) {
      return { success: true, data: [] };
    }
    
    // Use sqlite3 directly if available, otherwise use a simpler approach
    const result = execSync(`sqlite3 "${dbPath}" "SELECT id, name, description, app_url, created_at, updated_at FROM flows ORDER BY updated_at DESC" -json 2>/dev/null || echo "[]"`, {
      encoding: 'utf-8',
    });
    
    return { success: true, data: JSON.parse(result || '[]') };
  } catch {
    return { success: true, data: [] };
  }
});

ipcMain.handle('db:getRuns', async (_, flowId?: string) => {
  try {
    const dbPath = path.join(DATA_PATH, 'data', 'flowmind.db');
    if (!fs.existsSync(dbPath)) {
      return { success: true, data: [] };
    }
    
    const query = flowId 
      ? `SELECT * FROM runs WHERE flow_id = '${flowId}' ORDER BY started_at DESC LIMIT 20`
      : `SELECT * FROM runs ORDER BY started_at DESC LIMIT 50`;
    
    const result = execSync(`sqlite3 "${dbPath}" "${query}" -json 2>/dev/null || echo "[]"`, {
      encoding: 'utf-8',
    });
    
    return { success: true, data: JSON.parse(result || '[]') };
  } catch {
    return { success: true, data: [] };
  }
});

ipcMain.handle('db:getSteps', async (_, runId: string) => {
  try {
    const dbPath = path.join(DATA_PATH, 'data', 'flowmind.db');
    if (!fs.existsSync(dbPath)) {
      return { success: true, data: [] };
    }
    
    const result = execSync(`sqlite3 "${dbPath}" "SELECT * FROM steps WHERE run_id = '${runId}' ORDER BY step_number" -json 2>/dev/null || echo "[]"`, {
      encoding: 'utf-8',
    });
    
    return { success: true, data: JSON.parse(result || '[]') };
  } catch {
    return { success: true, data: [] };
  }
});

ipcMain.handle('db:getFlowGraph', async (_, flowId: string) => {
  try {
    const dbPath = path.join(DATA_PATH, 'data', 'flowmind.db');
    if (!fs.existsSync(dbPath)) {
      return { success: true, data: null };
    }
    
    const result = execSync(`sqlite3 "${dbPath}" "SELECT graph FROM flows WHERE id = '${flowId}'" -csv 2>/dev/null || echo ""`, {
      encoding: 'utf-8',
    });
    
    if (result.trim()) {
      return { success: true, data: JSON.parse(result.trim()) };
    }
    return { success: true, data: null };
  } catch {
    return { success: true, data: null };
  }
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (cliProcess) {
    cliProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
