#!/usr/bin/env node

/**
 * Flowmind MCP Server
 *
 * Exposes Flowmind capabilities as MCP tools so AI agents (Claude, etc.)
 * can list flows, run them, inspect results, and manage automation.
 *
 * Usage:
 *   npx tsx mcp-server.ts
 *
 * Add to Claude Desktop (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "flowmind": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/flowmind/mcp-server.ts"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_PATH = path.join(HOME_DIR, '.flowmind');
const DB_PATH = path.join(DATA_PATH, 'data', 'flowmind.db');

// ============================================
// DATABASE (shared logic with flowmind.ts)
// ============================================

function openDb() {
  fs.mkdirSync(path.join(DATA_PATH, 'data'), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'screenshots'), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, app_url TEXT,
      graph TEXT NOT NULL DEFAULT '{}', version TEXT NOT NULL DEFAULT '1.0.0',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT,
      duration INTEGER, error_message TEXT, summary TEXT,
      FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, step_number INTEGER NOT NULL,
      name TEXT NOT NULL, action TEXT NOT NULL, selector TEXT, value TEXT,
      status TEXT NOT NULL DEFAULT 'pending', duration INTEGER, error_message TEXT,
      screenshot_path TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );
  `);
  return db;
}

type FlowRow = Record<string, unknown>;
type RunRow = Record<string, unknown>;
type StepRow = Record<string, unknown>;

function mapFlow(r: FlowRow) {
  return { id: r.id as string, name: r.name as string, description: r.description as string | null, appUrl: r.app_url as string | null, graph: r.graph as string, createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}
function mapRun(r: RunRow) {
  return { id: r.id as string, flowId: r.flow_id as string, status: r.status as string, startedAt: r.started_at as string, completedAt: r.completed_at as string | null, duration: r.duration as number | null, errorMessage: r.error_message as string | null, summary: r.summary as string | null };
}
function mapStep(r: StepRow) {
  return { id: r.id as string, runId: r.run_id as string, stepNumber: r.step_number as number, name: r.name as string, action: r.action as string, selector: r.selector as string | null, value: r.value as string | null, status: r.status as string, duration: r.duration as number | null, errorMessage: r.error_message as string | null, screenshotPath: r.screenshot_path as string | null };
}

function sanitizePII(text: string): string {
  if (!text) return text;
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  text = text.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[JWT]');
  text = text.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]');
  return text;
}

// ============================================
// FLOW EXECUTOR
// ============================================

async function executeFlow(flowId: string, timeout = 60000): Promise<{
  runId: string;
  status: 'passed' | 'failed';
  duration: number;
  steps: Array<{ stepNumber: number; name: string; status: string; duration: number | null; errorMessage: string | null }>;
  errorMessage: string | null;
  screenshotsDir: string;
}> {
  const db = openDb();

  const flowRow = db.prepare('SELECT * FROM flows WHERE id LIKE ?').get(flowId + '%') as FlowRow | undefined;
  if (!flowRow) { db.close(); throw new Error(`Flow not found: ${flowId}`); }
  const flow = mapFlow(flowRow);

  let graph: { nodes: Record<string, unknown>[]; edges: object[]; appUrl?: string };
  try { graph = JSON.parse(flow.graph); } catch { db.close(); throw new Error('Invalid flow graph'); }

  const runId = uuidv4();
  db.prepare(`INSERT INTO runs (id, flow_id, status, started_at) VALUES (?, ?, 'running', datetime('now'))`).run(runId, flow.id);

  const screenshotsDir = path.join(DATA_PATH, 'screenshots', runId);
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const actionNodes = (graph.nodes || []).filter((n: Record<string, unknown>) => n.type === 'action');
  const stepResults: Array<{ stepNumber: number; name: string; status: string; duration: number | null; errorMessage: string | null }> = [];

  let stepNum = 1;
  let failed = false;
  let runError: string | null = null;
  const runStart = Date.now();

  for (const node of actionNodes as Array<Record<string, unknown>>) {
    const label = node.label as string;
    const action = node.action as string;
    const stepId = uuidv4();

    db.prepare(`INSERT INTO steps (id, run_id, step_number, name, action, selector, value, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .run(stepId, runId, stepNum, label, action, node.selector || null, node.value || null);

    const t = Date.now();
    try {
      switch (action) {
        case 'navigate': await page.goto((node.url || node.value) as string, { waitUntil: 'domcontentloaded', timeout: 15000 }); break;
        case 'click': await page.click(node.selector as string, { timeout: 10000 }); break;
        case 'fill': await page.fill(node.selector as string, sanitizePII((node.value as string) || ''), { timeout: 10000 }); break;
        case 'select': await page.selectOption(node.selector as string, (node.value as string) || '', { timeout: 10000 }); break;
        case 'check':
          if (node.value === 'true') await page.check(node.selector as string, { timeout: 10000 });
          else await page.uncheck(node.selector as string, { timeout: 10000 });
          break;
        case 'wait': await page.waitForSelector(node.selector as string, { timeout: 10000 }); break;
        case 'press': await page.press(node.selector as string, (node.value as string) || 'Enter'); break;
      }

      const duration = Date.now() - t;
      const screenshot = await page.screenshot();
      const screenshotPath = path.join(screenshotsDir, `step-${stepNum}.png`);
      fs.writeFileSync(screenshotPath, screenshot);
      db.prepare(`UPDATE steps SET status = 'passed', duration = ?, screenshot_path = ? WHERE id = ?`).run(duration, screenshotPath, stepId);
      stepResults.push({ stepNumber: stepNum, name: label, status: 'passed', duration, errorMessage: null });

    } catch (err) {
      const duration = Date.now() - t;
      const errorMessage = err instanceof Error ? err.message.split('\n')[0] : String(err);
      try {
        const screenshot = await page.screenshot();
        const screenshotPath = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
        fs.writeFileSync(screenshotPath, screenshot);
        db.prepare(`UPDATE steps SET status = 'failed', duration = ?, error_message = ?, screenshot_path = ? WHERE id = ?`).run(duration, errorMessage, screenshotPath, stepId);
      } catch {
        db.prepare(`UPDATE steps SET status = 'failed', duration = ?, error_message = ? WHERE id = ?`).run(duration, errorMessage, stepId);
      }
      stepResults.push({ stepNumber: stepNum, name: label, status: 'failed', duration, errorMessage });
      runError = errorMessage;
      failed = true;
      break;
    }
    stepNum++;
  }

  await browser.close();

  const totalDuration = Date.now() - runStart;
  const finalStatus = failed ? 'failed' : 'passed';
  db.prepare(`UPDATE runs SET status = ?, completed_at = datetime('now'), duration = ?, error_message = ? WHERE id = ?`)
    .run(finalStatus, totalDuration, runError, runId);
  db.close();

  return { runId, status: finalStatus, duration: totalDuration, steps: stepResults, errorMessage: runError, screenshotsDir };
}

// ============================================
// MCP SERVER
// ============================================

const server = new Server(
  { name: 'flowmind', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_flows',
      description: 'List all saved Flowmind automation flows with their IDs, names, step counts, and last updated date.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_flow',
      description: 'Get detailed information about a specific flow, including its full action graph (steps, selectors, values).',
      inputSchema: {
        type: 'object',
        properties: {
          flowId: { type: 'string', description: 'Flow ID or first 8 characters of it' },
        },
        required: ['flowId'],
      },
    },
    {
      name: 'run_flow',
      description: 'Execute a flow using Playwright. Returns run ID, pass/fail status, per-step results, and error details if any step failed. Runs headless in the background.',
      inputSchema: {
        type: 'object',
        properties: {
          flowId: { type: 'string', description: 'Flow ID or first 8 characters of it' },
        },
        required: ['flowId'],
      },
    },
    {
      name: 'get_run_result',
      description: 'Get detailed results of a previous flow run including step-by-step status, timing, error messages, and screenshot paths.',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'Run ID or first 8 characters of it' },
        },
        required: ['runId'],
      },
    },
    {
      name: 'list_runs',
      description: 'List recent flow runs with status and duration. Optionally filter by flow ID.',
      inputSchema: {
        type: 'object',
        properties: {
          flowId: { type: 'string', description: 'Optional: filter by flow ID' },
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
      },
    },
    {
      name: 'delete_flow',
      description: 'Delete a flow and all its run history.',
      inputSchema: {
        type: 'object',
        properties: {
          flowId: { type: 'string', description: 'Flow ID or first 8 characters of it' },
        },
        required: ['flowId'],
      },
    },
    {
      name: 'get_status',
      description: 'Get Flowmind system statistics: total flows, total runs, pass/fail counts, success rate.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: toolArgs } = request.params;

  try {
    switch (name) {
      case 'list_flows': {
        const db = openDb();
        const flows = (db.prepare('SELECT * FROM flows ORDER BY updated_at DESC').all() as FlowRow[]).map(mapFlow);
        db.close();

        if (flows.length === 0) {
          return text('No flows saved yet. Use `node flowmind.ts learn <url>` to record your first flow.');
        }

        const rows = flows.map(f => {
          let stepCount = 0;
          try { stepCount = (JSON.parse(f.graph).nodes || []).filter((n: Record<string,unknown>) => n.type === 'action').length; } catch {}
          return { id: f.id.slice(0, 8), name: f.name, description: f.description || '', steps: stepCount, url: f.appUrl || '', updated: f.updatedAt };
        });

        return text(JSON.stringify({ total: flows.length, flows: rows }, null, 2));
      }

      case 'get_flow': {
        const { flowId } = toolArgs as { flowId: string };
        const db = openDb();
        const row = db.prepare('SELECT * FROM flows WHERE id LIKE ?').get(flowId + '%') as FlowRow | undefined;
        db.close();
        if (!row) return error(`Flow not found: ${flowId}`);
        const flow = mapFlow(row);
        const graph = JSON.parse(flow.graph);
        const actionNodes = (graph.nodes || []).filter((n: Record<string,unknown>) => n.type === 'action');
        return text(JSON.stringify({
          id: flow.id,
          name: flow.name,
          description: flow.description,
          appUrl: flow.appUrl,
          createdAt: flow.createdAt,
          updatedAt: flow.updatedAt,
          stepCount: actionNodes.length,
          steps: actionNodes.map((n: Record<string,unknown>, i: number) => ({
            step: i + 1,
            label: n.label,
            action: n.action,
            selector: n.selector || null,
            value: n.value ? '***' : null, // mask values for privacy
          })),
        }, null, 2));
      }

      case 'run_flow': {
        const { flowId } = toolArgs as { flowId: string };
        const result = await executeFlow(flowId);
        return text(JSON.stringify({
          runId: result.runId,
          runIdShort: result.runId.slice(0, 8),
          status: result.status,
          duration: `${result.duration}ms`,
          stepsTotal: result.steps.length,
          stepsPassed: result.steps.filter(s => s.status === 'passed').length,
          stepsFailed: result.steps.filter(s => s.status === 'failed').length,
          steps: result.steps,
          errorMessage: result.errorMessage,
          screenshotsDir: result.screenshotsDir,
          hint: result.status === 'failed'
            ? `Use get_run_result with runId "${result.runId.slice(0, 8)}" for full details. Set ANTHROPIC_API_KEY and run \`node flowmind.ts run:analyze ${result.runId.slice(0, 8)}\` for AI analysis.`
            : 'All steps passed.',
        }, null, 2));
      }

      case 'get_run_result': {
        const { runId } = toolArgs as { runId: string };
        const db = openDb();
        const runRow = db.prepare('SELECT * FROM runs WHERE id LIKE ?').get(runId + '%') as RunRow | undefined;
        if (!runRow) { db.close(); return error(`Run not found: ${runId}`); }
        const run = mapRun(runRow);
        const flowRow = db.prepare('SELECT * FROM flows WHERE id = ?').get(run.flowId) as FlowRow | undefined;
        const flow = flowRow ? mapFlow(flowRow) : null;
        const steps = (db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY step_number').all(run.id) as StepRow[]).map(mapStep);
        db.close();

        return text(JSON.stringify({
          runId: run.id,
          flowName: flow?.name || 'Unknown',
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          duration: run.duration ? `${run.duration}ms` : null,
          errorMessage: run.errorMessage,
          aiSummary: run.summary || null,
          steps: steps.map(s => ({
            step: s.stepNumber,
            name: s.name,
            action: s.action,
            selector: s.selector,
            status: s.status,
            duration: s.duration ? `${s.duration}ms` : null,
            errorMessage: s.errorMessage,
            screenshotPath: s.screenshotPath,
          })),
        }, null, 2));
      }

      case 'list_runs': {
        const { flowId, limit = 20 } = (toolArgs || {}) as { flowId?: string; limit?: number };
        const db = openDb();
        const sql = flowId
          ? 'SELECT r.*, f.name as flow_name FROM runs r LEFT JOIN flows f ON r.flow_id = f.id WHERE r.flow_id LIKE ? ORDER BY r.started_at DESC LIMIT ?'
          : 'SELECT r.*, f.name as flow_name FROM runs r LEFT JOIN flows f ON r.flow_id = f.id ORDER BY r.started_at DESC LIMIT ?';
        const params = flowId ? [flowId + '%', limit] : [limit];
        const rows = db.prepare(sql).all(...params) as (RunRow & { flow_name: string })[];
        db.close();

        return text(JSON.stringify({
          total: rows.length,
          runs: rows.map(r => ({
            id: (r.id as string).slice(0, 8),
            flowName: r.flow_name || 'Unknown',
            status: r.status,
            startedAt: r.started_at,
            duration: r.duration ? `${r.duration}ms` : null,
            hasAiSummary: !!r.summary,
          })),
        }, null, 2));
      }

      case 'delete_flow': {
        const { flowId } = toolArgs as { flowId: string };
        const db = openDb();
        const row = db.prepare('SELECT * FROM flows WHERE id LIKE ?').get(flowId + '%') as FlowRow | undefined;
        if (!row) { db.close(); return error(`Flow not found: ${flowId}`); }
        const flow = mapFlow(row);
        db.prepare('DELETE FROM flows WHERE id = ?').run(flow.id);
        db.close();
        return text(`Deleted flow "${flow.name}" (${flow.id.slice(0, 8)})`);
      }

      case 'get_status': {
        const db = openDb();
        const flowCount = (db.prepare('SELECT COUNT(*) as c FROM flows').get() as { c: number }).c;
        const runCount = (db.prepare('SELECT COUNT(*) as c FROM runs').get() as { c: number }).c;
        const passedCount = (db.prepare("SELECT COUNT(*) as c FROM runs WHERE status = 'passed'").get() as { c: number }).c;
        const failedCount = (db.prepare("SELECT COUNT(*) as c FROM runs WHERE status = 'failed'").get() as { c: number }).c;
        db.close();

        return text(JSON.stringify({
          flows: flowCount,
          totalRuns: runCount,
          passed: passedCount,
          failed: failedCount,
          successRate: runCount > 0 ? `${Math.round((passedCount / runCount) * 100)}%` : 'N/A',
          dataPath: DATA_PATH,
          aiEnabled: !!process.env.ANTHROPIC_API_KEY,
        }, null, 2));
      }

      default:
        return error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return error(err instanceof Error ? err.message : String(err));
  }
});

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

function error(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Flowmind MCP Server running. Connect via Claude Desktop or any MCP client.\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
