const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let mainWindow;

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_PATH = path.join(HOME_DIR, '.flowmind');
const DB_PATH = path.join(DATA_PATH, 'data', 'flowmind.db');

// API for renderer to call
function createAPI() {
  return {
    // Get all flows
    getFlows: () => {
      try {
        const db = new Database(DB_PATH, { readonly: true });
        const flows = db.prepare('SELECT * FROM flows ORDER BY updated_at DESC').all();
        db.close();
        return flows.map(f => ({
          id: f.id,
          name: f.name,
          description: f.description,
          appUrl: f.app_url,
          nodeCount: JSON.parse(f.graph || '{}').nodes?.length || 0,
          createdAt: f.created_at,
          updatedAt: f.updated_at
        }));
      } catch (e) {
        return [];
      }
    },
    
    // Get a single flow
    getFlow: (id) => {
      try {
        const db = new Database(DB_PATH, { readonly: true });
        const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(id);
        db.close();
        if (flow) {
          return {
            id: flow.id,
            name: flow.name,
            description: flow.description,
            appUrl: flow.app_url,
            graph: JSON.parse(flow.graph || '{}'),
            createdAt: flow.created_at,
            updatedAt: flow.updated_at
          };
        }
        return null;
      } catch (e) {
        return null;
      }
    },
    
    // Get runs
    getRuns: (flowId, limit = 50) => {
      try {
        const db = new Database(DB_PATH, { readonly: true });
        let sql = 'SELECT * FROM runs';
        const params = [];
        if (flowId) {
          sql += ' WHERE flow_id = ?';
          params.push(flowId);
        }
        sql += ' ORDER BY started_at DESC LIMIT ?';
        params.push(limit);
        const runs = db.prepare(sql).all(...params);
        db.close();
        return runs.map(r => ({
          id: r.id,
          flowId: r.flow_id,
          status: r.status,
          startedAt: r.started_at,
          completedAt: r.completed_at,
          duration: r.duration,
          errorMessage: r.error_message
        }));
      } catch (e) {
        return [];
      }
    },
    
    // Get a single run
    getRun: (id) => {
      try {
        const db = new Database(DB_PATH, { readonly: true });
        const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
        if (run) {
          const steps = db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY step_number').all(id);
          db.close();
          return {
            id: run.id,
            flowId: run.flow_id,
            status: run.status,
            startedAt: run.started_at,
            completedAt: run.completed_at,
            duration: run.duration,
            errorMessage: run.error_message,
            steps: steps.map(s => ({
              id: s.id,
              stepNumber: s.step_number,
              name: s.name,
              action: s.action,
              selector: s.selector,
              value: s.value,
              status: s.status,
              duration: s.duration,
              errorMessage: s.error_message,
              screenshotPath: s.screenshot_path
            }))
          };
        }
        db.close();
        return null;
      } catch (e) {
        return null;
      }
    },
    
    // Get statistics
    getStats: () => {
      try {
        const db = new Database(DB_PATH, { readonly: true });
        const flowCount = db.prepare('SELECT COUNT(*) as count').get().count;
        const runs = db.prepare('SELECT * FROM runs').all();
        const passed = runs.filter(r => r.status === 'passed').length;
        const failed = runs.filter(r => r.status === 'failed').length;
        db.close();
        return {
          flowCount,
          totalRuns: runs.length,
          passed,
          failed,
          successRate: runs.length > 0 ? Math.round((passed / runs.length) * 100) : 0
        };
      } catch (e) {
        return { flowCount: 0, totalRuns: 0, passed: 0, failed: 0, successRate: 0 };
      }
    },
    
    // Get screenshot as base64
    getScreenshot: (runId, stepNum, failed = false) => {
      try {
        const suffix = failed ? '-FAILED' : '';
        const screenshotPath = path.join(DATA_PATH, 'screenshots', runId, `step-${stepNum}${suffix}.png`);
        if (fs.existsSync(screenshotPath)) {
          const data = fs.readFileSync(screenshotPath);
          return data.toString('base64');
        }
        return null;
      } catch (e) {
        return null;
      }
    },
    
    // Get screenshot paths for a run
    getScreenshots: (runId) => {
      try {
        const dir = path.join(DATA_PATH, 'screenshots', runId);
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
          return files.map(f => {
            const data = fs.readFileSync(path.join(dir, f));
            return { filename: f, data: data.toString('base64') };
          });
        }
        return [];
      } catch (e) {
        return [];
      }
    },
    
    // Open screenshot in viewer
    openScreenshot: (runId, filename) => {
      const screenshotPath = path.join(DATA_PATH, 'screenshots', runId, filename);
      require('electron').shell.openPath(screenshotPath);
    },
    
    // Open URL in browser
    openExternal: (url) => {
      require('electron').shell.openExternal(url);
    },
    
    // Get data path
    getDataPath: () => DATA_PATH,
    
    // Run a flow
    runFlow: async (flowId) => {
      const { spawn } = require('child_process');
      const flowmindPath = path.join(__dirname, '..', '..', '..', 'flowmind.js');
      
      return new Promise((resolve) => {
        const proc = spawn('node', [flowmindPath, 'run', flowId], {
          cwd: path.join(__dirname, '..', '..', '..')
        });
        
        let output = '';
        proc.stdout.on('data', (data) => { output += data.toString(); });
        proc.stderr.on('data', (data) => { output += data.toString(); });
        proc.on('close', (code) => {
          resolve({ success: code === 0, output });
        });
      });
    }
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Flowmind Desktop Viewer',
    backgroundColor: '#1e1e2e'
  });

  // Expose API to renderer
  mainWindow.api = createAPI();

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
