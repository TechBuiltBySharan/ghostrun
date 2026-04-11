#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// mcp-server.ts
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");
var import_playwright = require("playwright");
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_uuid = require("uuid");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var HOME_DIR = process.env.HOME || process.env.USERPROFILE || ".";
var DATA_PATH = path.join(HOME_DIR, ".flowmind");
var DB_PATH = path.join(DATA_PATH, "data", "flowmind.db");
function openDb() {
  fs.mkdirSync(path.join(DATA_PATH, "data"), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, "screenshots"), { recursive: true });
  const db = new import_better_sqlite3.default(DB_PATH);
  db.pragma("foreign_keys = ON");
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
function mapFlow(r) {
  return { id: r.id, name: r.name, description: r.description, appUrl: r.app_url, graph: r.graph, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapRun(r) {
  return { id: r.id, flowId: r.flow_id, status: r.status, startedAt: r.started_at, completedAt: r.completed_at, duration: r.duration, errorMessage: r.error_message, summary: r.summary };
}
function mapStep(r) {
  return { id: r.id, runId: r.run_id, stepNumber: r.step_number, name: r.name, action: r.action, selector: r.selector, value: r.value, status: r.status, duration: r.duration, errorMessage: r.error_message, screenshotPath: r.screenshot_path };
}
function sanitizePII(text2) {
  if (!text2) return text2;
  text2 = text2.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  text2 = text2.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, "[JWT]");
  text2 = text2.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[CARD]");
  return text2;
}
async function executeFlow(flowId, timeout = 6e4) {
  const db = openDb();
  const flowRow = db.prepare("SELECT * FROM flows WHERE id LIKE ?").get(flowId + "%");
  if (!flowRow) {
    db.close();
    throw new Error(`Flow not found: ${flowId}`);
  }
  const flow = mapFlow(flowRow);
  let graph;
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    db.close();
    throw new Error("Invalid flow graph");
  }
  const runId = (0, import_uuid.v4)();
  db.prepare(`INSERT INTO runs (id, flow_id, status, started_at) VALUES (?, ?, 'running', datetime('now'))`).run(runId, flow.id);
  const screenshotsDir = path.join(DATA_PATH, "screenshots", runId);
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const browser = await import_playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
  const actionNodes = (graph.nodes || []).filter((n) => n.type === "action");
  const stepResults = [];
  let stepNum = 1;
  let failed = false;
  let runError = null;
  const runStart = Date.now();
  for (const node of actionNodes) {
    const label = node.label;
    const action = node.action;
    const stepId = (0, import_uuid.v4)();
    db.prepare(`INSERT INTO steps (id, run_id, step_number, name, action, selector, value, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`).run(stepId, runId, stepNum, label, action, node.selector || null, node.value || null);
    const t = Date.now();
    try {
      switch (action) {
        case "navigate":
          await page.goto(node.url || node.value, { waitUntil: "domcontentloaded", timeout: 15e3 });
          break;
        case "click":
          await page.click(node.selector, { timeout: 1e4 });
          break;
        case "fill":
          await page.fill(node.selector, sanitizePII(node.value || ""), { timeout: 1e4 });
          break;
        case "select":
          await page.selectOption(node.selector, node.value || "", { timeout: 1e4 });
          break;
        case "check":
          if (node.value === "true") await page.check(node.selector, { timeout: 1e4 });
          else await page.uncheck(node.selector, { timeout: 1e4 });
          break;
        case "wait":
          await page.waitForSelector(node.selector, { timeout: 1e4 });
          break;
        case "press":
          await page.press(node.selector, node.value || "Enter");
          break;
      }
      const duration = Date.now() - t;
      const screenshot = await page.screenshot();
      const screenshotPath = path.join(screenshotsDir, `step-${stepNum}.png`);
      fs.writeFileSync(screenshotPath, screenshot);
      db.prepare(`UPDATE steps SET status = 'passed', duration = ?, screenshot_path = ? WHERE id = ?`).run(duration, screenshotPath, stepId);
      stepResults.push({ stepNumber: stepNum, name: label, status: "passed", duration, errorMessage: null });
    } catch (err) {
      const duration = Date.now() - t;
      const errorMessage = err instanceof Error ? err.message.split("\n")[0] : String(err);
      try {
        const screenshot = await page.screenshot();
        const screenshotPath = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
        fs.writeFileSync(screenshotPath, screenshot);
        db.prepare(`UPDATE steps SET status = 'failed', duration = ?, error_message = ?, screenshot_path = ? WHERE id = ?`).run(duration, errorMessage, screenshotPath, stepId);
      } catch {
        db.prepare(`UPDATE steps SET status = 'failed', duration = ?, error_message = ? WHERE id = ?`).run(duration, errorMessage, stepId);
      }
      stepResults.push({ stepNumber: stepNum, name: label, status: "failed", duration, errorMessage });
      runError = errorMessage;
      failed = true;
      break;
    }
    stepNum++;
  }
  await browser.close();
  const totalDuration = Date.now() - runStart;
  const finalStatus = failed ? "failed" : "passed";
  db.prepare(`UPDATE runs SET status = ?, completed_at = datetime('now'), duration = ?, error_message = ? WHERE id = ?`).run(finalStatus, totalDuration, runError, runId);
  db.close();
  return { runId, status: finalStatus, duration: totalDuration, steps: stepResults, errorMessage: runError, screenshotsDir };
}
var server = new import_server.Server(
  { name: "flowmind", version: "1.0.0" },
  { capabilities: { tools: {} } }
);
server.setRequestHandler(import_types.ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_flows",
      description: "List all saved Flowmind automation flows with their IDs, names, step counts, and last updated date.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "get_flow",
      description: "Get detailed information about a specific flow, including its full action graph (steps, selectors, values).",
      inputSchema: {
        type: "object",
        properties: {
          flowId: { type: "string", description: "Flow ID or first 8 characters of it" }
        },
        required: ["flowId"]
      }
    },
    {
      name: "run_flow",
      description: "Execute a flow using Playwright. Returns run ID, pass/fail status, per-step results, and error details if any step failed. Runs headless in the background.",
      inputSchema: {
        type: "object",
        properties: {
          flowId: { type: "string", description: "Flow ID or first 8 characters of it" }
        },
        required: ["flowId"]
      }
    },
    {
      name: "get_run_result",
      description: "Get detailed results of a previous flow run including step-by-step status, timing, error messages, and screenshot paths.",
      inputSchema: {
        type: "object",
        properties: {
          runId: { type: "string", description: "Run ID or first 8 characters of it" }
        },
        required: ["runId"]
      }
    },
    {
      name: "list_runs",
      description: "List recent flow runs with status and duration. Optionally filter by flow ID.",
      inputSchema: {
        type: "object",
        properties: {
          flowId: { type: "string", description: "Optional: filter by flow ID" },
          limit: { type: "number", description: "Max results (default 20)" }
        }
      }
    },
    {
      name: "delete_flow",
      description: "Delete a flow and all its run history.",
      inputSchema: {
        type: "object",
        properties: {
          flowId: { type: "string", description: "Flow ID or first 8 characters of it" }
        },
        required: ["flowId"]
      }
    },
    {
      name: "get_status",
      description: "Get Flowmind system statistics: total flows, total runs, pass/fail counts, success rate.",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));
server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
  const { name, arguments: toolArgs } = request.params;
  try {
    switch (name) {
      case "list_flows": {
        const db = openDb();
        const flows = db.prepare("SELECT * FROM flows ORDER BY updated_at DESC").all().map(mapFlow);
        db.close();
        if (flows.length === 0) {
          return text("No flows saved yet. Use `node flowmind.ts learn <url>` to record your first flow.");
        }
        const rows = flows.map((f) => {
          let stepCount = 0;
          try {
            stepCount = (JSON.parse(f.graph).nodes || []).filter((n) => n.type === "action").length;
          } catch {
          }
          return { id: f.id.slice(0, 8), name: f.name, description: f.description || "", steps: stepCount, url: f.appUrl || "", updated: f.updatedAt };
        });
        return text(JSON.stringify({ total: flows.length, flows: rows }, null, 2));
      }
      case "get_flow": {
        const { flowId } = toolArgs;
        const db = openDb();
        const row = db.prepare("SELECT * FROM flows WHERE id LIKE ?").get(flowId + "%");
        db.close();
        if (!row) return error(`Flow not found: ${flowId}`);
        const flow = mapFlow(row);
        const graph = JSON.parse(flow.graph);
        const actionNodes = (graph.nodes || []).filter((n) => n.type === "action");
        return text(JSON.stringify({
          id: flow.id,
          name: flow.name,
          description: flow.description,
          appUrl: flow.appUrl,
          createdAt: flow.createdAt,
          updatedAt: flow.updatedAt,
          stepCount: actionNodes.length,
          steps: actionNodes.map((n, i) => ({
            step: i + 1,
            label: n.label,
            action: n.action,
            selector: n.selector || null,
            value: n.value ? "***" : null
            // mask values for privacy
          }))
        }, null, 2));
      }
      case "run_flow": {
        const { flowId } = toolArgs;
        const result = await executeFlow(flowId);
        return text(JSON.stringify({
          runId: result.runId,
          runIdShort: result.runId.slice(0, 8),
          status: result.status,
          duration: `${result.duration}ms`,
          stepsTotal: result.steps.length,
          stepsPassed: result.steps.filter((s) => s.status === "passed").length,
          stepsFailed: result.steps.filter((s) => s.status === "failed").length,
          steps: result.steps,
          errorMessage: result.errorMessage,
          screenshotsDir: result.screenshotsDir,
          hint: result.status === "failed" ? `Use get_run_result with runId "${result.runId.slice(0, 8)}" for full details. Set ANTHROPIC_API_KEY and run \`node flowmind.ts run:analyze ${result.runId.slice(0, 8)}\` for AI analysis.` : "All steps passed."
        }, null, 2));
      }
      case "get_run_result": {
        const { runId } = toolArgs;
        const db = openDb();
        const runRow = db.prepare("SELECT * FROM runs WHERE id LIKE ?").get(runId + "%");
        if (!runRow) {
          db.close();
          return error(`Run not found: ${runId}`);
        }
        const run = mapRun(runRow);
        const flowRow = db.prepare("SELECT * FROM flows WHERE id = ?").get(run.flowId);
        const flow = flowRow ? mapFlow(flowRow) : null;
        const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_number").all(run.id).map(mapStep);
        db.close();
        return text(JSON.stringify({
          runId: run.id,
          flowName: flow?.name || "Unknown",
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          duration: run.duration ? `${run.duration}ms` : null,
          errorMessage: run.errorMessage,
          aiSummary: run.summary || null,
          steps: steps.map((s) => ({
            step: s.stepNumber,
            name: s.name,
            action: s.action,
            selector: s.selector,
            status: s.status,
            duration: s.duration ? `${s.duration}ms` : null,
            errorMessage: s.errorMessage,
            screenshotPath: s.screenshotPath
          }))
        }, null, 2));
      }
      case "list_runs": {
        const { flowId, limit = 20 } = toolArgs || {};
        const db = openDb();
        const sql = flowId ? "SELECT r.*, f.name as flow_name FROM runs r LEFT JOIN flows f ON r.flow_id = f.id WHERE r.flow_id LIKE ? ORDER BY r.started_at DESC LIMIT ?" : "SELECT r.*, f.name as flow_name FROM runs r LEFT JOIN flows f ON r.flow_id = f.id ORDER BY r.started_at DESC LIMIT ?";
        const params = flowId ? [flowId + "%", limit] : [limit];
        const rows = db.prepare(sql).all(...params);
        db.close();
        return text(JSON.stringify({
          total: rows.length,
          runs: rows.map((r) => ({
            id: r.id.slice(0, 8),
            flowName: r.flow_name || "Unknown",
            status: r.status,
            startedAt: r.started_at,
            duration: r.duration ? `${r.duration}ms` : null,
            hasAiSummary: !!r.summary
          }))
        }, null, 2));
      }
      case "delete_flow": {
        const { flowId } = toolArgs;
        const db = openDb();
        const row = db.prepare("SELECT * FROM flows WHERE id LIKE ?").get(flowId + "%");
        if (!row) {
          db.close();
          return error(`Flow not found: ${flowId}`);
        }
        const flow = mapFlow(row);
        db.prepare("DELETE FROM flows WHERE id = ?").run(flow.id);
        db.close();
        return text(`Deleted flow "${flow.name}" (${flow.id.slice(0, 8)})`);
      }
      case "get_status": {
        const db = openDb();
        const flowCount = db.prepare("SELECT COUNT(*) as c FROM flows").get().c;
        const runCount = db.prepare("SELECT COUNT(*) as c FROM runs").get().c;
        const passedCount = db.prepare("SELECT COUNT(*) as c FROM runs WHERE status = 'passed'").get().c;
        const failedCount = db.prepare("SELECT COUNT(*) as c FROM runs WHERE status = 'failed'").get().c;
        db.close();
        return text(JSON.stringify({
          flows: flowCount,
          totalRuns: runCount,
          passed: passedCount,
          failed: failedCount,
          successRate: runCount > 0 ? `${Math.round(passedCount / runCount * 100)}%` : "N/A",
          dataPath: DATA_PATH,
          aiEnabled: !!process.env.ANTHROPIC_API_KEY
        }, null, 2));
      }
      default:
        return error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return error(err instanceof Error ? err.message : String(err));
  }
});
function text(content) {
  return { content: [{ type: "text", text: content }] };
}
function error(message) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
async function main() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Flowmind MCP Server running. Connect via Claude Desktop or any MCP client.\n");
}
main().catch((err) => {
  process.stderr.write(`Fatal: ${err}
`);
  process.exit(1);
});
