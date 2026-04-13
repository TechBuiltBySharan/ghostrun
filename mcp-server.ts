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

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_PATH = path.join(HOME_DIR, '.ghostrun');
const DB_PATH = path.join(DATA_PATH, 'data', 'ghostrun.db');

// Path to the compiled CLI — same directory as this file
const GHOSTRUN_BIN = path.join(__dirname, 'ghostrun.js');

// ============================================
// DATABASE (read-only helpers for list/get)
// ============================================

function openDb() {
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

// ============================================
// MCP SERVER
// ============================================

const server = new Server(
  { name: 'ghostrun', version: '1.0.0' },
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
          steps: result.steps,
          errorMessage: result.steps?.find(s => s.errorMessage)?.errorMessage ?? null,
          hint: !result.passed
            ? `Run failed. Use get_run_result with runId "${result.runId?.slice(0, 8)}" for details.`
            : 'All steps passed.',
        }, null, 2));
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
        const writeDb = new Database(DB_PATH);
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
