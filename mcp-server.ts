#!/usr/bin/env node

/**
 * GhostRun MCP Server
 *
 * Exposes GhostRun capabilities as MCP tools so AI agents (Claude, Cursor, etc.)
 * can list flows, run them, inspect results, and manage automation.
 *
 * Usage:
 *   node mcp-server.js
 *
 * Add to Claude Desktop (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "ghostrun": {
 *         "command": "node",
 *         "args": ["/path/to/ghostrun/mcp-server.js"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectRoot, buildProjectPaths } from './project-scope';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_PATH = path.join(HOME_DIR, '.ghostrun');

function resolveDbPath(): string {
  const root = resolveProjectRoot(process.cwd());
  if (root) return buildProjectPaths(root).dbPath;
  return path.join(DATA_PATH, 'data', 'ghostrun.db');
}

// Path to the compiled CLI — same directory as this file
const GHOSTRUN_BIN = path.join(__dirname, 'ghostrun.js');

// ============================================
// DATABASE (read-only helpers for list/get)
// ============================================

function openDb() {
  const DB_PATH = resolveDbPath();
  if (!fs.existsSync(DB_PATH)) return null;
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma('foreign_keys = ON');
  return db;
}

type FlowRow = Record<string, unknown>;
type RunRow = Record<string, unknown>;
type StepRow = Record<string, unknown>;

function mapFlow(r: FlowRow) {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    appUrl: r.app_url as string | null,
    graph: r.graph as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
function mapRun(r: RunRow) {
  return {
    id: r.id as string,
    flowId: r.flow_id as string,
    status: r.status as string,
    startedAt: r.started_at as string,
    completedAt: r.completed_at as string | null,
    duration: r.duration as number | null,
    errorMessage: r.error_message as string | null,
    summary: r.summary as string | null,
  };
}
function mapStep(r: StepRow) {
  return {
    id: r.id as string,
    runId: r.run_id as string,
    stepNumber: r.step_number as number,
    name: r.name as string,
    action: r.action as string,
    selector: r.selector as string | null,
    value: r.value as string | null,
    status: r.status as string,
    duration: r.duration as number | null,
    errorMessage: r.error_message as string | null,
    screenshotPath: r.screenshot_path as string | null,
  };
}

// ============================================
// CLI DELEGATION — run flows via ghostrun.js
// ============================================

interface CliRunResult {
  passed: boolean;
  runId: string;
  flowId: string;
  flowName: string;
  duration: number;
  steps: Array<{
    stepNumber: number;
    name: string;
    status: string;
    duration: number | null;
    screenshotPath: string | null;
    errorMessage: string | null;
  }>;
  extractedData: Record<string, string>;
  summary?: string;
  scrapeDiagnostics?: Array<{ scrapeId: string; resultPath: string | null; reason: string | null }>;
}

function runFlowViaCli(flowId: string, vars?: Record<string, string>): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const varArgs: string[] = [];
    if (vars) {
      for (const [k, v] of Object.entries(vars)) varArgs.push('--var', `${k}=${v}`);
    }

    const proc = spawn('node', [GHOSTRUN_BIN, 'run', flowId, '--output', 'json', ...varArgs], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', () => {
      // Find the JSON line in stdout (ghostrun --output json prints one JSON object)
      const jsonLine = stdout.split('\n').find(l => l.trim().startsWith('{'));
      if (jsonLine) {
        try {
          resolve(JSON.parse(jsonLine) as CliRunResult);
          return;
        } catch {}
      }
      reject(new Error(`ghostrun run failed: ${stderr || stdout || '(no output)'}`));
    });

    proc.on('error', (err) => reject(new Error(`Failed to spawn ghostrun: ${err.message}`)));
  });
}

function runCliJson(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [GHOSTRUN_BIN, ...args], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', () => {
      const jsonLine = stdout.split('\n').filter(l => {
        const trimmed = l.trim();
        return trimmed.startsWith('{') || trimmed.startsWith('[');
      }).at(-1);
      if (jsonLine) {
        try {
          resolve(JSON.parse(jsonLine));
          return;
        } catch {}
      }
      reject(new Error(stderr || stdout || 'GhostRun command produced no JSON output'));
    });

    proc.on('error', (err) => reject(new Error(`Failed to spawn ghostrun: ${err.message}`)));
  });
}

function runScrapeViaCli(url: string, options?: { maxPages?: number; selector?: string; waitFor?: string }): Promise<any> {
  const args = ['scrape', url, '--output', 'json'];
  if (options?.maxPages) args.push('--max-pages', String(options.maxPages));
  if (options?.selector) args.push('--selector', options.selector);
  return runCliJson(args);
}

function runScrapeAndFlowViaCli(url: string, flowId: string, vars?: Record<string, string>, options?: { maxPages?: number; selector?: string }): Promise<any> {
  const args = ['scrape:run', url, '--flow', flowId, '--output', 'json'];
  if (options?.maxPages) args.push('--max-pages', String(options.maxPages));
  if (options?.selector) args.push('--selector', options.selector);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}=${v}`);
  }
  return runCliJson(args);
}

// ============================================
// MCP SERVER
// ============================================

const server = new Server(
  { name: 'ghostrun', version: '1.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_flows',
      description: 'List all saved GhostRun flows with their IDs, names, step counts, and last updated date. Works for both browser automation flows and API test flows.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_flow',
      description: 'Get detailed information about a specific GhostRun flow, including all action steps with their selectors and values.',
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
      description: 'Execute a GhostRun flow. Handles browser automation flows (Playwright), pure API test flows (no browser needed), and hybrid flows. Returns run ID, pass/fail status, per-step results, extracted data, and error details.',
      inputSchema: {
        type: 'object',
        properties: {
          flowId: { type: 'string', description: 'Flow ID or first 8 characters of it (also accepts flow name)' },
          vars: {
            type: 'object',
            description: 'Optional key=value variables to inject into the flow (e.g. { "username": "alice", "env": "staging" })',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['flowId'],
      },
    },
    {
      name: 'scrape_website',
      description: 'Scrape a website with optional Crawlee support and return structured page data for agent workflows: title, headings, links, forms, buttons, text, and selected content.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape' },
          maxPages: { type: 'number', description: 'Maximum pages to scrape (default 1)' },
          selector: { type: 'string', description: 'Optional CSS selector for targeted content extraction' },
          waitFor: { type: 'string', description: 'Reserved for future wait conditions' },
        },
        required: ['url'],
      },
    },
    {
      name: 'get_scrape_result',
      description: 'Fetch a saved scrape result by ID, including the structured JSON dataset and artifact path.',
      inputSchema: {
        type: 'object',
        properties: {
          scrapeId: { type: 'string', description: 'Scrape ID or first 8 characters of it' },
        },
        required: ['scrapeId'],
      },
    },
    {
      name: 'scrape_and_run_flow',
      description: 'Scrape a website first, then run a GhostRun flow. Useful for AI agents that need page context and a test result in one tool call.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape before running the flow' },
          flowId: { type: 'string', description: 'Flow ID or name to run after scraping' },
          maxPages: { type: 'number', description: 'Maximum pages to scrape (default 1)' },
          selector: { type: 'string', description: 'Optional CSS selector for targeted content extraction' },
          vars: {
            type: 'object',
            description: 'Optional key=value variables to inject into the flow',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['url', 'flowId'],
      },
    },
    {
      name: 'get_run_result',
      description: 'Get detailed results of a previous flow run: step-by-step status, timing, error messages, extracted data, AI failure summary, and screenshot paths.',
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
      description: 'List recent flow runs with status, duration, and flow name. Optionally filter by flow ID.',
      inputSchema: {
        type: 'object',
        properties: {
          flowId: { type: 'string', description: 'Optional: filter runs to a specific flow' },
          limit: { type: 'number', description: 'Max results to return (default 20)' },
        },
      },
    },
    {
      name: 'delete_flow',
      description: 'Delete a GhostRun flow and all its run history.',
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
      description: 'Get GhostRun system statistics: total flows, total runs, pass/fail counts, success rate, and data path.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_profiles',
      description: 'List all saved GhostRun profiles (environment configs) in the current project\'s .ghostrun/profiles/ directory.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_suites',
      description: 'List all saved GhostRun test suites in the current project\'s .ghostrun/suites/ directory.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'run_suite',
      description: 'Run a GhostRun test suite by name, optionally with a named profile. Returns suite results as JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          suiteName: { type: 'string', description: 'Name of the suite to run (matches filename without .json)' },
          profile: { type: 'string', description: 'Optional profile name to use when running the suite' },
        },
        required: ['suiteName'],
      },
    },
    {
      name: 'list_repair_proposals',
      description: 'List all AI-generated repair proposals for failing flows in the current project\'s .ghostrun/proposals/repairs/ directory.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_repair_proposal',
      description: 'Get the full content of a specific repair proposal by ID (prefix match supported).',
      inputSchema: {
        type: 'object',
        properties: {
          proposalId: { type: 'string', description: 'Proposal ID or prefix to match' },
        },
        required: ['proposalId'],
      },
    },
    {
      name: 'get_ai_usage',
      description: 'Get a summary of AI token and cost usage across all GhostRun sessions from the current project\'s .ghostrun/ai/usage/ directory.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'author_flow',
      description: 'Generate a GhostRun flow from a natural language description using project profile context. Saves the flow and returns flow ID, steps, and run hint.',
      inputSchema: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Plain-language description of the flow to generate' },
          baseUrl: { type: 'string', description: 'Optional base URL. Uses active profile baseUrl when omitted.' },
          profile: { type: 'string', description: 'Optional profile name for context and baseUrl resolution' },
          preview: { type: 'boolean', description: 'If true, return generated flow without saving' },
        },
        required: ['description'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: toolArgs } = request.params;

  try {
    switch (name) {
      case 'list_flows': {
        const db = openDb();
        if (!db) return text('No flows yet. Record your first flow with: ghostrun learn <url>');
        const flows = (db.prepare('SELECT * FROM flows ORDER BY updated_at DESC').all() as FlowRow[]).map(mapFlow);
        db.close();

        if (flows.length === 0) return text('No flows saved yet. Use `ghostrun learn <url>` to record your first flow.');

        const rows = flows.map(f => {
          let stepCount = 0;
          let isApiFlow = false;
          try {
            const nodes = (JSON.parse(f.graph).nodes || []).filter((n: Record<string,unknown>) => n.type === 'action');
            stepCount = nodes.length;
            const apiActions = new Set(['http:request','assert:response','set:variable','extract:json','env:switch']);
            isApiFlow = nodes.length > 0 && nodes.every((n: Record<string,unknown>) => apiActions.has(n.action as string));
          } catch {}
          return { id: f.id.slice(0, 8), name: f.name, description: f.description || '', steps: stepCount, type: isApiFlow ? 'api' : 'browser', url: f.appUrl || '', updated: f.updatedAt };
        });

        return text(JSON.stringify({ total: flows.length, flows: rows }, null, 2));
      }

      case 'get_flow': {
        const { flowId } = toolArgs as { flowId: string };
        const db = openDb();
        if (!db) return error('No database found. Run `ghostrun init` first.');
        const row = db.prepare('SELECT * FROM flows WHERE id LIKE ? OR name = ?').get(flowId + '%', flowId) as FlowRow | undefined;
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
            value: n.value ? '***' : null,
            url: n.url || null,
          })),
        }, null, 2));
      }

      case 'run_flow': {
        const { flowId, vars } = toolArgs as { flowId: string; vars?: Record<string, string> };
        let result: CliRunResult;
        try {
          result = await runFlowViaCli(flowId, vars);
        } catch (err) {
          return error(err instanceof Error ? err.message : String(err));
        }
        return text(JSON.stringify({
          runId: result.runId,
          runIdShort: result.runId?.slice(0, 8),
          status: result.passed ? 'passed' : 'failed',
          flowName: result.flowName,
          duration: result.duration ? `${result.duration}ms` : null,
          stepsTotal: result.steps?.length ?? 0,
          stepsPassed: result.steps?.filter(s => s.status === 'passed').length ?? 0,
          stepsFailed: result.steps?.filter(s => s.status === 'failed').length ?? 0,
          extractedData: result.extractedData || {},
          scrapeDiagnostics: result.scrapeDiagnostics || [],
          steps: result.steps,
          errorMessage: result.steps?.find(s => s.errorMessage)?.errorMessage ?? null,
          hint: !result.passed
            ? `Run failed. Use get_run_result with runId "${result.runId?.slice(0, 8)}" for details.`
            : 'All steps passed.',
        }, null, 2));
      }

      case 'scrape_website': {
        const { url, maxPages, selector, waitFor } = toolArgs as { url: string; maxPages?: number; selector?: string; waitFor?: string };
        try {
          const result = await runScrapeViaCli(url, { maxPages, selector, waitFor });
          return text(JSON.stringify(result, null, 2));
        } catch (err) {
          return error(err instanceof Error ? err.message : String(err));
        }
      }

      case 'get_scrape_result': {
        const { scrapeId } = toolArgs as { scrapeId: string };
        const db = openDb();
        if (!db) return error('No database found.');
        let row: Record<string, unknown> | undefined;
        try {
          row = db.prepare('SELECT * FROM scrape_runs WHERE id LIKE ? ORDER BY created_at DESC LIMIT 1').get(scrapeId + '%') as Record<string, unknown> | undefined;
        } catch {
          db.close();
          return error('No scrape history found. Run scrape_website first.');
        }
        db.close();
        if (!row) return error(`Scrape not found: ${scrapeId}`);
        const resultPath = row.result_path as string | null;
        let data: unknown = null;
        if (resultPath && fs.existsSync(resultPath)) {
          try { data = JSON.parse(fs.readFileSync(resultPath, 'utf8')); } catch {}
        }
        return text(JSON.stringify({
          scrapeId: row.id,
          status: row.status,
          url: row.url,
          reason: row.reason,
          pagesCount: row.pages_count,
          resultPath,
          errorMessage: row.error_message,
          data,
        }, null, 2));
      }

      case 'scrape_and_run_flow': {
        const { url, flowId, vars, maxPages, selector } = toolArgs as { url: string; flowId: string; vars?: Record<string, string>; maxPages?: number; selector?: string };
        try {
          const result = await runScrapeAndFlowViaCli(url, flowId, vars, { maxPages, selector });
          return text(JSON.stringify(result, null, 2));
        } catch (err) {
          return error(err instanceof Error ? err.message : String(err));
        }
      }

      case 'get_run_result': {
        const { runId } = toolArgs as { runId: string };
        const db = openDb();
        if (!db) return error('No database found.');
        const runRow = db.prepare('SELECT * FROM runs WHERE id LIKE ?').get(runId + '%') as RunRow | undefined;
        if (!runRow) { db.close(); return error(`Run not found: ${runId}`); }
        const run = mapRun(runRow);
        const flowRow = db.prepare('SELECT * FROM flows WHERE id = ?').get(run.flowId) as FlowRow | undefined;
        const flow = flowRow ? mapFlow(flowRow) : null;
        const steps = (db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY step_number').all(run.id) as StepRow[]).map(mapStep);
        let scrapeDiagnostics: Array<Record<string, unknown>> = [];
        try {
          scrapeDiagnostics = db.prepare('SELECT * FROM scrape_runs WHERE run_id = ? ORDER BY created_at DESC').all(run.id) as Array<Record<string, unknown>>;
        } catch {}
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
          scrapeDiagnostics: scrapeDiagnostics.map(s => ({
            scrapeId: s.id,
            reason: s.reason,
            status: s.status,
            pagesCount: s.pages_count,
            resultPath: s.result_path,
          })),
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
        if (!db) return text('{ "runs": [] }');
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
        if (!db) return error('No database found.');
        const row = db.prepare('SELECT * FROM flows WHERE id LIKE ? OR name = ?').get(flowId + '%', flowId) as FlowRow | undefined;
        if (!row) { db.close(); return error(`Flow not found: ${flowId}`); }
        const flow = mapFlow(row);
        // Use write connection for delete
        const writeDb = new Database(resolveDbPath());
        writeDb.prepare('DELETE FROM flows WHERE id = ?').run(flow.id);
        writeDb.close();
        db.close();
        return text(`Deleted flow "${flow.name}" (${flow.id.slice(0, 8)})`);
      }

      case 'get_status': {
        const db = openDb();
        if (!db) return text(JSON.stringify({ flows: 0, totalRuns: 0, passed: 0, failed: 0, successRate: 'N/A', dataPath: DATA_PATH, aiEnabled: !!process.env.ANTHROPIC_API_KEY }, null, 2));
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

      case 'list_profiles': {
        const profilesDir = path.join(process.cwd(), '.ghostrun', 'profiles');
        if (!fs.existsSync(profilesDir)) return text(JSON.stringify({ total: 0, profiles: [] }, null, 2));
        const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));
        const profiles = files.map(f => {
          try {
            const content = JSON.parse(fs.readFileSync(path.join(profilesDir, f), 'utf8'));
            return { name: path.basename(f, '.json'), ...content };
          } catch {
            return { name: path.basename(f, '.json'), error: 'Failed to parse' };
          }
        });
        return text(JSON.stringify({ total: profiles.length, profiles }, null, 2));
      }

      case 'list_suites': {
        const suitesDir = path.join(process.cwd(), '.ghostrun', 'suites');
        if (!fs.existsSync(suitesDir)) return text(JSON.stringify({ total: 0, suites: [] }, null, 2));
        const files = fs.readdirSync(suitesDir).filter(f => f.endsWith('.json'));
        const suites = files.map(f => {
          try {
            const content = JSON.parse(fs.readFileSync(path.join(suitesDir, f), 'utf8'));
            return { name: path.basename(f, '.json'), ...content };
          } catch {
            return { name: path.basename(f, '.json'), error: 'Failed to parse' };
          }
        });
        return text(JSON.stringify({ total: suites.length, suites }, null, 2));
      }

      case 'run_suite': {
        const { suiteName, profile } = toolArgs as { suiteName: string; profile?: string };
        const args = ['suite:run', suiteName, '--output', 'json'];
        if (profile) args.push('--profile', profile);
        try {
          const result = await runCliJson(args);
          return text(JSON.stringify(result, null, 2));
        } catch (err) {
          return error(err instanceof Error ? err.message : String(err));
        }
      }

      case 'list_repair_proposals': {
        const repairsDir = path.join(process.cwd(), '.ghostrun', 'proposals', 'repairs');
        if (!fs.existsSync(repairsDir)) return text(JSON.stringify({ total: 0, proposals: [] }, null, 2));
        const files = fs.readdirSync(repairsDir).filter(f => f.endsWith('.json'));
        const proposals = files.map(f => {
          try {
            const content = JSON.parse(fs.readFileSync(path.join(repairsDir, f), 'utf8')) as Record<string, unknown>;
            return {
              id: content.id ?? path.basename(f, '.json'),
              status: content.status ?? null,
              flowName: content.flowName ?? null,
              createdAt: content.createdAt ?? null,
            };
          } catch {
            return { id: path.basename(f, '.json'), status: null, flowName: null, createdAt: null };
          }
        });
        return text(JSON.stringify({ total: proposals.length, proposals }, null, 2));
      }

      case 'get_repair_proposal': {
        const { proposalId } = toolArgs as { proposalId: string };
        const repairsDir = path.join(process.cwd(), '.ghostrun', 'proposals', 'repairs');
        if (!fs.existsSync(repairsDir)) return error('No repair proposals directory found.');
        const files = fs.readdirSync(repairsDir).filter(f => f.endsWith('.json'));
        const match = files.find(f => path.basename(f, '.json').startsWith(proposalId) || f.startsWith(proposalId));
        if (!match) return error(`Repair proposal not found: ${proposalId}`);
        try {
          const content = JSON.parse(fs.readFileSync(path.join(repairsDir, match), 'utf8'));
          return text(JSON.stringify(content, null, 2));
        } catch {
          return error(`Failed to read repair proposal: ${match}`);
        }
      }

      case 'get_ai_usage': {
        const usageDir = path.join(process.cwd(), '.ghostrun', 'ai', 'usage');
        if (!fs.existsSync(usageDir)) return text(JSON.stringify({ totalTokens: 0, totalCost: 0, sessions: 0, lastSessions: [] }, null, 2));
        const files = fs.readdirSync(usageDir).filter(f => f.endsWith('.json')).sort();
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCost = 0;
        const sessions: Array<Record<string, unknown>> = [];
        for (const f of files) {
          try {
            const record = JSON.parse(fs.readFileSync(path.join(usageDir, f), 'utf8')) as Record<string, unknown>;
            totalInputTokens += (record.inputTokens as number) || 0;
            totalOutputTokens += (record.outputTokens as number) || 0;
            totalCost += (record.cost as number) || 0;
            sessions.push(record);
          } catch {}
        }
        const lastSessions = sessions.slice(-10).map(s => ({
          sessionId: s.sessionId ?? s.id ?? null,
          model: s.model ?? null,
          inputTokens: s.inputTokens ?? 0,
          outputTokens: s.outputTokens ?? 0,
          cost: s.cost ?? 0,
          createdAt: s.createdAt ?? s.timestamp ?? null,
        }));
        return text(JSON.stringify({
          totalInputTokens,
          totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          totalCost: Math.round(totalCost * 1e6) / 1e6,
          sessions: sessions.length,
          lastSessions,
        }, null, 2));
      }

      case 'author_flow': {
        const { description, baseUrl, profile, preview } = toolArgs as {
          description: string;
          baseUrl?: string;
          profile?: string;
          preview?: boolean;
        };
        if (!description?.trim()) return error('description is required');
        const cliArgs = ['author', 'create', description.trim(), '--output', 'json'];
        if (baseUrl) cliArgs.push('--base-url', baseUrl);
        if (profile) cliArgs.push('--profile', profile);
        if (preview) cliArgs.push('--preview');
        try {
          const result = await runCliJson(cliArgs);
          return text(JSON.stringify(result, null, 2));
        } catch (err) {
          return error(err instanceof Error ? err.message : String(err));
        }
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
  process.stderr.write('GhostRun MCP Server running. Connect via Claude Desktop or any MCP client.\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
