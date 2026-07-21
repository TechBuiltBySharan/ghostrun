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
var import_child_process = require("child_process");
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// project-scope.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function resolveProjectRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    const config = path.join(dir, ".ghostrun", "config.json");
    if (fs.existsSync(config)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function buildProjectPaths(root) {
  const ghostrunPath = path.join(root, ".ghostrun");
  return {
    root,
    ghostrunPath,
    configPath: path.join(ghostrunPath, "config.json"),
    projectJsonPath: path.join(ghostrunPath, "project.json"),
    dbPath: path.join(ghostrunPath, "data", "ghostrun.db"),
    screenshotsPath: path.join(ghostrunPath, "screenshots"),
    sessionsPath: path.join(ghostrunPath, "sessions"),
    flowsBrowser: path.join(ghostrunPath, "flows", "browser"),
    flowsApi: path.join(ghostrunPath, "flows", "api"),
    flowsGenerated: path.join(ghostrunPath, "flows", "generated"),
    fixturesSql: path.join(ghostrunPath, "fixtures", "sql"),
    servicesPath: path.join(ghostrunPath, "services"),
    webhooksPath: path.join(ghostrunPath, "services", "webhooks")
  };
}

// mcp-server.ts
var HOME_DIR = process.env.HOME || process.env.USERPROFILE || ".";
var DATA_PATH = path2.join(HOME_DIR, ".ghostrun");
function resolveDbPath() {
  const root = resolveProjectRoot(process.cwd());
  if (root) return buildProjectPaths(root).dbPath;
  return path2.join(DATA_PATH, "data", "ghostrun.db");
}
var GHOSTRUN_BIN = path2.join(__dirname, "ghostrun.js");
function openDb() {
  const DB_PATH = resolveDbPath();
  if (!fs2.existsSync(DB_PATH)) return null;
  const db = new import_better_sqlite3.default(DB_PATH, { readonly: true });
  db.pragma("foreign_keys = ON");
  return db;
}
function mapFlow(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    appUrl: r.app_url,
    graph: r.graph,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}
function mapRun(r) {
  return {
    id: r.id,
    flowId: r.flow_id,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    duration: r.duration,
    errorMessage: r.error_message,
    summary: r.summary
  };
}
function mapStep(r) {
  return {
    id: r.id,
    runId: r.run_id,
    stepNumber: r.step_number,
    name: r.name,
    action: r.action,
    selector: r.selector,
    value: r.value,
    status: r.status,
    duration: r.duration,
    errorMessage: r.error_message,
    screenshotPath: r.screenshot_path
  };
}
function runFlowViaCli(flowId, vars) {
  return new Promise((resolve2, reject) => {
    const varArgs = [];
    if (vars) {
      for (const [k, v] of Object.entries(vars)) varArgs.push("--var", `${k}=${v}`);
    }
    const proc = (0, import_child_process.spawn)("node", [GHOSTRUN_BIN, "run", flowId, "--output", "json", ...varArgs], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", () => {
      const jsonLine = stdout.split("\n").find((l) => l.trim().startsWith("{"));
      if (jsonLine) {
        try {
          resolve2(JSON.parse(jsonLine));
          return;
        } catch {
        }
      }
      reject(new Error(`ghostrun run failed: ${stderr || stdout || "(no output)"}`));
    });
    proc.on("error", (err) => reject(new Error(`Failed to spawn ghostrun: ${err.message}`)));
  });
}
function runCliJson(args) {
  return new Promise((resolve2, reject) => {
    const proc = (0, import_child_process.spawn)("node", [GHOSTRUN_BIN, ...args], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", () => {
      const jsonLine = stdout.split("\n").filter((l) => {
        const trimmed = l.trim();
        return trimmed.startsWith("{") || trimmed.startsWith("[");
      }).at(-1);
      if (jsonLine) {
        try {
          resolve2(JSON.parse(jsonLine));
          return;
        } catch {
        }
      }
      reject(new Error(stderr || stdout || "GhostRun command produced no JSON output"));
    });
    proc.on("error", (err) => reject(new Error(`Failed to spawn ghostrun: ${err.message}`)));
  });
}
function runScrapeViaCli(url, options) {
  const args = ["scrape", url, "--output", "json"];
  if (options?.maxPages) args.push("--max-pages", String(options.maxPages));
  if (options?.selector) args.push("--selector", options.selector);
  return runCliJson(args);
}
function runScrapeAndFlowViaCli(url, flowId, vars, options) {
  const args = ["scrape:run", url, "--flow", flowId, "--output", "json"];
  if (options?.maxPages) args.push("--max-pages", String(options.maxPages));
  if (options?.selector) args.push("--selector", options.selector);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) args.push("--var", `${k}=${v}`);
  }
  return runCliJson(args);
}
var server = new import_server.Server(
  { name: "ghostrun", version: "1.1.0" },
  { capabilities: { tools: {} } }
);
server.setRequestHandler(import_types.ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_flows",
      description: "List all saved GhostRun flows with their IDs, names, step counts, and last updated date. Works for both browser automation flows and API test flows.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "get_flow",
      description: "Get detailed information about a specific GhostRun flow, including all action steps with their selectors and values.",
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
      description: "Execute a GhostRun flow. Handles browser automation flows (Playwright), pure API test flows (no browser needed), and hybrid flows. Returns run ID, pass/fail status, per-step results, extracted data, and error details.",
      inputSchema: {
        type: "object",
        properties: {
          flowId: { type: "string", description: "Flow ID or first 8 characters of it (also accepts flow name)" },
          vars: {
            type: "object",
            description: 'Optional key=value variables to inject into the flow (e.g. { "username": "alice", "env": "staging" })',
            additionalProperties: { type: "string" }
          }
        },
        required: ["flowId"]
      }
    },
    {
      name: "scrape_website",
      description: "Scrape a website with optional Crawlee support and return structured page data for agent workflows: title, headings, links, forms, buttons, text, and selected content.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to scrape" },
          maxPages: { type: "number", description: "Maximum pages to scrape (default 1)" },
          selector: { type: "string", description: "Optional CSS selector for targeted content extraction" },
          waitFor: { type: "string", description: "Reserved for future wait conditions" }
        },
        required: ["url"]
      }
    },
    {
      name: "get_scrape_result",
      description: "Fetch a saved scrape result by ID, including the structured JSON dataset and artifact path.",
      inputSchema: {
        type: "object",
        properties: {
          scrapeId: { type: "string", description: "Scrape ID or first 8 characters of it" }
        },
        required: ["scrapeId"]
      }
    },
    {
      name: "scrape_and_run_flow",
      description: "Scrape a website first, then run a GhostRun flow. Useful for AI agents that need page context and a test result in one tool call.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to scrape before running the flow" },
          flowId: { type: "string", description: "Flow ID or name to run after scraping" },
          maxPages: { type: "number", description: "Maximum pages to scrape (default 1)" },
          selector: { type: "string", description: "Optional CSS selector for targeted content extraction" },
          vars: {
            type: "object",
            description: "Optional key=value variables to inject into the flow",
            additionalProperties: { type: "string" }
          }
        },
        required: ["url", "flowId"]
      }
    },
    {
      name: "get_run_result",
      description: "Get detailed results of a previous flow run: step-by-step status, timing, error messages, extracted data, AI failure summary, and screenshot paths.",
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
      description: "List recent flow runs with status, duration, and flow name. Optionally filter by flow ID.",
      inputSchema: {
        type: "object",
        properties: {
          flowId: { type: "string", description: "Optional: filter runs to a specific flow" },
          limit: { type: "number", description: "Max results to return (default 20)" }
        }
      }
    },
    {
      name: "delete_flow",
      description: "Delete a GhostRun flow and all its run history.",
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
      description: "Get GhostRun system statistics: total flows, total runs, pass/fail counts, success rate, and data path.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "list_profiles",
      description: "List all saved GhostRun profiles (environment configs) in the current project's .ghostrun/profiles/ directory.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "list_suites",
      description: "List all saved GhostRun test suites in the current project's .ghostrun/suites/ directory.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "run_suite",
      description: "Run a GhostRun test suite by name, optionally with a named profile. Returns suite results as JSON.",
      inputSchema: {
        type: "object",
        properties: {
          suiteName: { type: "string", description: "Name of the suite to run (matches filename without .json)" },
          profile: { type: "string", description: "Optional profile name to use when running the suite" }
        },
        required: ["suiteName"]
      }
    },
    {
      name: "list_repair_proposals",
      description: "List all AI-generated repair proposals for failing flows in the current project's .ghostrun/proposals/repairs/ directory.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "get_repair_proposal",
      description: "Get the full content of a specific repair proposal by ID (prefix match supported).",
      inputSchema: {
        type: "object",
        properties: {
          proposalId: { type: "string", description: "Proposal ID or prefix to match" }
        },
        required: ["proposalId"]
      }
    },
    {
      name: "get_ai_usage",
      description: "Get a summary of AI token and cost usage across all GhostRun sessions from the current project's .ghostrun/ai/usage/ directory.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "author_flow",
      description: "Generate a GhostRun flow from a natural language description using project profile context. Saves the flow and returns flow ID, steps, and run hint.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "Plain-language description of the flow to generate" },
          baseUrl: { type: "string", description: "Optional base URL. Uses active profile baseUrl when omitted." },
          profile: { type: "string", description: "Optional profile name for context and baseUrl resolution" },
          preview: { type: "boolean", description: "If true, return generated flow without saving" }
        },
        required: ["description"]
      }
    }
  ]
}));
server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
  const { name, arguments: toolArgs } = request.params;
  try {
    switch (name) {
      case "list_flows": {
        const db = openDb();
        if (!db) return text("No flows yet. Record your first flow with: ghostrun learn <url>");
        const flows = db.prepare("SELECT * FROM flows ORDER BY updated_at DESC").all().map(mapFlow);
        db.close();
        if (flows.length === 0) return text("No flows saved yet. Use `ghostrun learn <url>` to record your first flow.");
        const rows = flows.map((f) => {
          let stepCount = 0;
          let isApiFlow = false;
          try {
            const nodes = (JSON.parse(f.graph).nodes || []).filter((n) => n.type === "action");
            stepCount = nodes.length;
            const apiActions = /* @__PURE__ */ new Set(["http:request", "assert:response", "set:variable", "extract:json", "env:switch"]);
            isApiFlow = nodes.length > 0 && nodes.every((n) => apiActions.has(n.action));
          } catch {
          }
          return { id: f.id.slice(0, 8), name: f.name, description: f.description || "", steps: stepCount, type: isApiFlow ? "api" : "browser", url: f.appUrl || "", updated: f.updatedAt };
        });
        return text(JSON.stringify({ total: flows.length, flows: rows }, null, 2));
      }
      case "get_flow": {
        const { flowId } = toolArgs;
        const db = openDb();
        if (!db) return error("No database found. Run `ghostrun init` first.");
        const row = db.prepare("SELECT * FROM flows WHERE id LIKE ? OR name = ?").get(flowId + "%", flowId);
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
            value: n.value ? "***" : null,
            url: n.url || null
          }))
        }, null, 2));
      }
      case "run_flow": {
        const { flowId, vars } = toolArgs;
        let result;
        try {
          result = await runFlowViaCli(flowId, vars);
        } catch (err) {
          return error(err instanceof Error ? err.message : String(err));
        }
        return text(JSON.stringify({
          runId: result.runId,
          runIdShort: result.runId?.slice(0, 8),
          status: result.passed ? "passed" : "failed",
          flowName: result.flowName,
          duration: result.duration ? `${result.duration}ms` : null,
          stepsTotal: result.steps?.length ?? 0,
          stepsPassed: result.steps?.filter((s) => s.status === "passed").length ?? 0,
          stepsFailed: result.steps?.filter((s) => s.status === "failed").length ?? 0,
          extractedData: result.extractedData || {},
          scrapeDiagnostics: result.scrapeDiagnostics || [],
          steps: result.steps,
          errorMessage: result.steps?.find((s) => s.errorMessage)?.errorMessage ?? null,
          hint: !result.passed ? `Run failed. Use get_run_result with runId "${result.runId?.slice(0, 8)}" for details.` : "All steps passed."
        }, null, 2));
      }
      case "scrape_website": {
        const { url, maxPages, selector, waitFor } = toolArgs;
        try {
          const result = await runScrapeViaCli(url, { maxPages, selector, waitFor });
          return text(JSON.stringify(result, null, 2));
        } catch (err) {
          return error(err instanceof Error ? err.message : String(err));
        }
      }
      case "get_scrape_result": {
        const { scrapeId } = toolArgs;
        const db = openDb();
        if (!db) return error("No database found.");
        let row;
        try {
          row = db.prepare("SELECT * FROM scrape_runs WHERE id LIKE ? ORDER BY created_at DESC LIMIT 1").get(scrapeId + "%");
        } catch {
          db.close();
          return error("No scrape history found. Run scrape_website first.");
        }
        db.close();
        if (!row) return error(`Scrape not found: ${scrapeId}`);
        const resultPath = row.result_path;
        let data = null;
        if (resultPath && fs2.existsSync(resultPath)) {
          try {
            data = JSON.parse(fs2.readFileSync(resultPath, "utf8"));
          } catch {
          }
        }
        return text(JSON.stringify({
          scrapeId: row.id,
          status: row.status,
          url: row.url,
          reason: row.reason,
          pagesCount: row.pages_count,
          resultPath,
          errorMessage: row.error_message,
          data
        }, null, 2));
      }
      case "scrape_and_run_flow": {
        const { url, flowId, vars, maxPages, selector } = toolArgs;
        try {
          const result = await runScrapeAndFlowViaCli(url, flowId, vars, { maxPages, selector });
          return text(JSON.stringify(result, null, 2));
        } catch (err) {
          return error(err instanceof Error ? err.message : String(err));
        }
      }
      case "get_run_result": {
        const { runId } = toolArgs;
        const db = openDb();
        if (!db) return error("No database found.");
        const runRow = db.prepare("SELECT * FROM runs WHERE id LIKE ?").get(runId + "%");
        if (!runRow) {
          db.close();
          return error(`Run not found: ${runId}`);
        }
        const run = mapRun(runRow);
        const flowRow = db.prepare("SELECT * FROM flows WHERE id = ?").get(run.flowId);
        const flow = flowRow ? mapFlow(flowRow) : null;
        const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_number").all(run.id).map(mapStep);
        let scrapeDiagnostics = [];
        try {
          scrapeDiagnostics = db.prepare("SELECT * FROM scrape_runs WHERE run_id = ? ORDER BY created_at DESC").all(run.id);
        } catch {
        }
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
          scrapeDiagnostics: scrapeDiagnostics.map((s) => ({
            scrapeId: s.id,
            reason: s.reason,
            status: s.status,
            pagesCount: s.pages_count,
            resultPath: s.result_path
          })),
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
        if (!db) return text('{ "runs": [] }');
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
        if (!db) return error("No database found.");
        const row = db.prepare("SELECT * FROM flows WHERE id LIKE ? OR name = ?").get(flowId + "%", flowId);
        if (!row) {
          db.close();
          return error(`Flow not found: ${flowId}`);
        }
        const flow = mapFlow(row);
        const writeDb = new import_better_sqlite3.default(resolveDbPath());
        writeDb.prepare("DELETE FROM flows WHERE id = ?").run(flow.id);
        writeDb.close();
        db.close();
        return text(`Deleted flow "${flow.name}" (${flow.id.slice(0, 8)})`);
      }
      case "get_status": {
        const db = openDb();
        if (!db) return text(JSON.stringify({ flows: 0, totalRuns: 0, passed: 0, failed: 0, successRate: "N/A", dataPath: DATA_PATH, aiEnabled: !!process.env.ANTHROPIC_API_KEY }, null, 2));
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
      case "list_profiles": {
        const profilesDir = path2.join(process.cwd(), ".ghostrun", "profiles");
        if (!fs2.existsSync(profilesDir)) return text(JSON.stringify({ total: 0, profiles: [] }, null, 2));
        const files = fs2.readdirSync(profilesDir).filter((f) => f.endsWith(".json"));
        const profiles = files.map((f) => {
          try {
            const content = JSON.parse(fs2.readFileSync(path2.join(profilesDir, f), "utf8"));
            return { name: path2.basename(f, ".json"), ...content };
          } catch {
            return { name: path2.basename(f, ".json"), error: "Failed to parse" };
          }
        });
        return text(JSON.stringify({ total: profiles.length, profiles }, null, 2));
      }
      case "list_suites": {
        const suitesDir = path2.join(process.cwd(), ".ghostrun", "suites");
        if (!fs2.existsSync(suitesDir)) return text(JSON.stringify({ total: 0, suites: [] }, null, 2));
        const files = fs2.readdirSync(suitesDir).filter((f) => f.endsWith(".json"));
        const suites = files.map((f) => {
          try {
            const content = JSON.parse(fs2.readFileSync(path2.join(suitesDir, f), "utf8"));
            return { name: path2.basename(f, ".json"), ...content };
          } catch {
            return { name: path2.basename(f, ".json"), error: "Failed to parse" };
          }
        });
        return text(JSON.stringify({ total: suites.length, suites }, null, 2));
      }
      case "run_suite": {
        const { suiteName, profile } = toolArgs;
        const args = ["suite:run", suiteName, "--output", "json"];
        if (profile) args.push("--profile", profile);
        try {
          const result = await runCliJson(args);
          return text(JSON.stringify(result, null, 2));
        } catch (err) {
          return error(err instanceof Error ? err.message : String(err));
        }
      }
      case "list_repair_proposals": {
        const repairsDir = path2.join(process.cwd(), ".ghostrun", "proposals", "repairs");
        if (!fs2.existsSync(repairsDir)) return text(JSON.stringify({ total: 0, proposals: [] }, null, 2));
        const files = fs2.readdirSync(repairsDir).filter((f) => f.endsWith(".json"));
        const proposals = files.map((f) => {
          try {
            const content = JSON.parse(fs2.readFileSync(path2.join(repairsDir, f), "utf8"));
            return {
              id: content.id ?? path2.basename(f, ".json"),
              status: content.status ?? null,
              flowName: content.flowName ?? null,
              createdAt: content.createdAt ?? null
            };
          } catch {
            return { id: path2.basename(f, ".json"), status: null, flowName: null, createdAt: null };
          }
        });
        return text(JSON.stringify({ total: proposals.length, proposals }, null, 2));
      }
      case "get_repair_proposal": {
        const { proposalId } = toolArgs;
        const repairsDir = path2.join(process.cwd(), ".ghostrun", "proposals", "repairs");
        if (!fs2.existsSync(repairsDir)) return error("No repair proposals directory found.");
        const files = fs2.readdirSync(repairsDir).filter((f) => f.endsWith(".json"));
        const match = files.find((f) => path2.basename(f, ".json").startsWith(proposalId) || f.startsWith(proposalId));
        if (!match) return error(`Repair proposal not found: ${proposalId}`);
        try {
          const content = JSON.parse(fs2.readFileSync(path2.join(repairsDir, match), "utf8"));
          return text(JSON.stringify(content, null, 2));
        } catch {
          return error(`Failed to read repair proposal: ${match}`);
        }
      }
      case "get_ai_usage": {
        const usageDir = path2.join(process.cwd(), ".ghostrun", "ai", "usage");
        if (!fs2.existsSync(usageDir)) return text(JSON.stringify({ totalTokens: 0, totalCost: 0, sessions: 0, lastSessions: [] }, null, 2));
        const files = fs2.readdirSync(usageDir).filter((f) => f.endsWith(".json")).sort();
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCost = 0;
        const sessions = [];
        for (const f of files) {
          try {
            const record = JSON.parse(fs2.readFileSync(path2.join(usageDir, f), "utf8"));
            totalInputTokens += record.inputTokens || 0;
            totalOutputTokens += record.outputTokens || 0;
            totalCost += record.cost || 0;
            sessions.push(record);
          } catch {
          }
        }
        const lastSessions = sessions.slice(-10).map((s) => ({
          sessionId: s.sessionId ?? s.id ?? null,
          model: s.model ?? null,
          inputTokens: s.inputTokens ?? 0,
          outputTokens: s.outputTokens ?? 0,
          cost: s.cost ?? 0,
          createdAt: s.createdAt ?? s.timestamp ?? null
        }));
        return text(JSON.stringify({
          totalInputTokens,
          totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          totalCost: Math.round(totalCost * 1e6) / 1e6,
          sessions: sessions.length,
          lastSessions
        }, null, 2));
      }
      case "author_flow": {
        const { description, baseUrl, profile, preview } = toolArgs;
        if (!description?.trim()) return error("description is required");
        const cliArgs = ["author", "create", description.trim(), "--output", "json"];
        if (baseUrl) cliArgs.push("--base-url", baseUrl);
        if (profile) cliArgs.push("--profile", profile);
        if (preview) cliArgs.push("--preview");
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
function text(content) {
  return { content: [{ type: "text", text: content }] };
}
function error(message) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
async function main() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("GhostRun MCP Server running. Connect via Claude Desktop or any MCP client.\n");
}
main().catch((err) => {
  process.stderr.write(`Fatal: ${err}
`);
  process.exit(1);
});
