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

// flowmind.ts
var import_playwright = require("playwright");
var import_chalk = __toESM(require("chalk"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var readline = __toESM(require("readline"));
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_uuid = require("uuid");
var HOME_DIR = process.env.HOME || process.env.USERPROFILE || ".";
var DATA_PATH = path.join(HOME_DIR, ".flowmind");
var DB_PATH = path.join(DATA_PATH, "data", "flowmind.db");
var DatabaseManager = class {
  db;
  constructor() {
    fs.mkdirSync(path.join(DATA_PATH, "data"), { recursive: true });
    fs.mkdirSync(path.join(DATA_PATH, "screenshots"), { recursive: true });
    this.db = new import_better_sqlite3.default(DB_PATH);
    this.initialize();
  }
  initialize() {
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flows (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, app_url TEXT,
        graph TEXT NOT NULL DEFAULT '{}', version TEXT NOT NULL DEFAULT '1.0.0',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, flow_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT, duration INTEGER, error_message TEXT, summary TEXT,
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, step_number INTEGER NOT NULL,
        name TEXT NOT NULL, action TEXT NOT NULL, selector TEXT, value TEXT,
        status TEXT NOT NULL DEFAULT 'pending', duration INTEGER,
        error_message TEXT, screenshot_path TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, name TEXT NOT NULL,
        cron_expression TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT, last_run_status TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );
    `);
  }
  // ---- Flows ----
  createFlow(data) {
    const id = (0, import_uuid.v4)();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare(`INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, data.name, data.description || null, data.appUrl || null, JSON.stringify(data.graph || {}), now, now);
    return this.getFlow(id);
  }
  getFlow(id) {
    const r = this.db.prepare("SELECT * FROM flows WHERE id = ?").get(id);
    return r ? this.mapFlow(r) : null;
  }
  findFlowByPartialId(q) {
    const rows = this.db.prepare("SELECT * FROM flows WHERE id LIKE ?").all(q + "%");
    return rows.length === 1 ? this.mapFlow(rows[0]) : null;
  }
  findFlowByName(name) {
    const rows = this.db.prepare("SELECT * FROM flows WHERE LOWER(name) LIKE ?").all(`%${name.toLowerCase()}%`);
    return rows.length === 1 ? this.mapFlow(rows[0]) : null;
  }
  listFlows() {
    return this.db.prepare("SELECT * FROM flows ORDER BY updated_at DESC").all().map((r) => this.mapFlow(r));
  }
  updateFlow(id, data) {
    const updates = [];
    const values = [];
    if (data.name !== void 0) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.description !== void 0) {
      updates.push("description = ?");
      values.push(data.description);
    }
    if (data.appUrl !== void 0) {
      updates.push("app_url = ?");
      values.push(data.appUrl);
    }
    if (data.graph !== void 0) {
      updates.push("graph = ?");
      values.push(JSON.stringify(data.graph));
    }
    updates.push("updated_at = datetime('now')");
    values.push(id);
    this.db.prepare(`UPDATE flows SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getFlow(id);
  }
  deleteFlow(id) {
    return this.db.prepare("DELETE FROM flows WHERE id = ?").run(id).changes > 0;
  }
  mapFlow(r) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      appUrl: r.app_url,
      graph: r.graph,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at)
    };
  }
  // ---- Runs ----
  createRun(flowId) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO runs (id, flow_id, status, started_at) VALUES (?, ?, 'running', datetime('now'))`).run(id, flowId);
    return this.getRun(id);
  }
  getRun(id) {
    const r = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    return r ? this.mapRun(r) : null;
  }
  findRunByPartialId(q) {
    const rows = this.db.prepare("SELECT * FROM runs WHERE id LIKE ?").all(q + "%");
    return rows.length === 1 ? this.mapRun(rows[0]) : null;
  }
  listRuns(flowId, limit = 50) {
    const sql = flowId ? "SELECT * FROM runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT ?" : "SELECT * FROM runs ORDER BY started_at DESC LIMIT ?";
    const params = flowId ? [flowId, limit] : [limit];
    return this.db.prepare(sql).all(...params).map((r) => this.mapRun(r));
  }
  updateRun(id, data) {
    const updates = [];
    const values = [];
    if (data.status !== void 0) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.completedAt !== void 0) {
      updates.push("completed_at = ?");
      values.push(data.completedAt.toISOString());
    }
    if (data.duration !== void 0) {
      updates.push("duration = ?");
      values.push(data.duration);
    }
    if (data.errorMessage !== void 0) {
      updates.push("error_message = ?");
      values.push(data.errorMessage);
    }
    if (data.summary !== void 0) {
      updates.push("summary = ?");
      values.push(data.summary);
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE runs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getRun(id);
  }
  mapRun(r) {
    return {
      id: r.id,
      flowId: r.flow_id,
      status: r.status,
      startedAt: new Date(r.started_at),
      completedAt: r.completed_at ? new Date(r.completed_at) : null,
      duration: r.duration,
      errorMessage: r.error_message,
      summary: r.summary
    };
  }
  // ---- Steps ----
  createStep(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO steps (id, run_id, step_number, name, action, selector, value, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`).run(id, data.runId, data.stepNumber, data.name, data.action, data.selector || null, data.value || null);
    return this.getStep(id);
  }
  getStep(id) {
    const r = this.db.prepare("SELECT * FROM steps WHERE id = ?").get(id);
    return r ? this.mapStep(r) : null;
  }
  listSteps(runId) {
    return this.db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_number").all(runId).map((r) => this.mapStep(r));
  }
  updateStep(id, data) {
    const updates = [];
    const values = [];
    if (data.status !== void 0) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.duration !== void 0) {
      updates.push("duration = ?");
      values.push(data.duration);
    }
    if (data.errorMessage !== void 0) {
      updates.push("error_message = ?");
      values.push(data.errorMessage);
    }
    if (data.screenshotPath !== void 0) {
      updates.push("screenshot_path = ?");
      values.push(data.screenshotPath);
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE steps SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getStep(id);
  }
  mapStep(r) {
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
  getScreenshotsPath(runId) {
    const dir = path.join(DATA_PATH, "screenshots", runId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  // ---- Schedules ----
  createSchedule(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO schedules (id, flow_id, name, cron_expression) VALUES (?, ?, ?, ?)`).run(id, data.flowId, data.name, data.cronExpression);
    return this.getSchedule(id);
  }
  getSchedule(id) {
    const r = this.db.prepare("SELECT * FROM schedules WHERE id = ?").get(id);
    return r ? this.mapSchedule(r) : null;
  }
  listSchedules() {
    return this.db.prepare("SELECT s.*, f.name as flow_name FROM schedules s JOIN flows f ON s.flow_id = f.id ORDER BY s.created_at DESC").all().map((r) => this.mapSchedule(r));
  }
  deleteSchedule(id) {
    return this.db.prepare("DELETE FROM schedules WHERE id = ?").run(id).changes > 0;
  }
  updateScheduleLastRun(id, status) {
    this.db.prepare(`UPDATE schedules SET last_run_at = datetime('now'), last_run_status = ? WHERE id = ?`).run(status, id);
  }
  mapSchedule(r) {
    return {
      id: r.id,
      flowId: r.flow_id,
      flowName: r.flow_name,
      name: r.name,
      cronExpression: r.cron_expression,
      enabled: Boolean(r.enabled),
      lastRunAt: r.last_run_at ? new Date(r.last_run_at) : null,
      lastRunStatus: r.last_run_status
    };
  }
  close() {
    this.db.close();
  }
};
function sanitizePII(text) {
  if (!text) return text;
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  text = text.replace(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[PHONE]");
  text = text.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[CARD]");
  text = text.replace(/(api[_-]?key|apikey)["\s:=]+["']?[a-zA-Z0-9_-]{20,}["']?/gi, "API_KEY=[TOKEN]");
  text = text.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, "[JWT]");
  text = text.replace(/\b(?:password|passwd|pwd)\s*[:=]\s*\S+/gi, "password=[REDACTED]");
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
  return text;
}
async function isOllamaRunning() {
  const baseUrl = process.env.FLOWMIND_OLLAMA_URL || "http://localhost:11434";
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2e3) });
    if (!res.ok) return null;
    const data = await res.json();
    const preferred = process.env.FLOWMIND_OLLAMA_MODEL;
    if (preferred) return preferred;
    const models = data.models || [];
    const gemma = models.find((m) => m.name.startsWith("gemma"));
    return gemma?.name || models[0]?.name || null;
  } catch {
    return null;
  }
}
async function callOllama(prompt) {
  const baseUrl = process.env.FLOWMIND_OLLAMA_URL || "http://localhost:11434";
  const model = process.env.FLOWMIND_OLLAMA_MODEL || await isOllamaRunning();
  if (!model) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
      signal: AbortSignal.timeout(3e4)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      messages: [{ role: "user", content: prompt }]
    });
    const content = msg.content[0];
    return content.type === "text" ? content.text.trim() : null;
  } catch {
    return null;
  }
}
async function callAI(prompt) {
  const provider = process.env.FLOWMIND_AI_PROVIDER;
  if (provider !== "anthropic") {
    const result2 = await callOllama(prompt);
    if (result2) return { text: result2, provider: process.env.FLOWMIND_OLLAMA_MODEL || "ollama" };
    if (provider === "ollama") return null;
  }
  const result = await callAnthropic(prompt);
  if (result) return { text: result, provider: "claude" };
  return null;
}
function buildFailurePrompt(ctx) {
  const stepsSummary = ctx.steps.map(
    (s) => `  Step ${s.stepNumber} [${s.status}]: ${s.name} (${s.action}${s.selector ? ` on "${s.selector}"` : ""})`
  ).join("\n");
  return `A web automation flow named "${ctx.flowName}" failed.

Steps:
${stepsSummary}

Failed step: "${ctx.failedStep.name}"
Action: ${ctx.failedStep.action}${ctx.failedStep.selector ? ` on selector "${ctx.failedStep.selector}"` : ""}
Error: ${ctx.failedStep.errorMessage}

In 2-3 sentences, explain what likely went wrong and how to fix it. Be specific and practical.`;
}
function printLogo() {
  console.log(import_chalk.default.cyan(`
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551                                           \u2551
  \u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557      \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557    \u2588\u2588\u2557     \u2551
  \u2551   \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551    \u2588\u2588\u2551     \u2551
  \u2551   \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551 \u2588\u2557 \u2588\u2588\u2551     \u2551
  \u2551   \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2588\u2557\u2588\u2588\u2551     \u2551
  \u2551   \u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u255A\u2588\u2588\u2588\u2554\u2588\u2588\u2588\u2554\u255D     \u2551
  \u2551   \u255A\u2550\u255D     \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D  \u255A\u2550\u2550\u255D\u255A\u2550\u2550\u255D      \u2551
  \u2551                                           \u2551
  \u2551   Memory-driven Web Automation            \u2551
  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
  `));
}
function info(msg) {
  console.log(import_chalk.default.blue("  \u2192 ") + msg);
}
function success(msg) {
  console.log(import_chalk.default.green("  \u2713 ") + msg);
}
function errorMsg(msg) {
  console.log(import_chalk.default.red("  \u2717 ") + msg);
}
function warn(msg) {
  console.log(import_chalk.default.yellow("  \u26A0 ") + msg);
}
function divider() {
  console.log(import_chalk.default.cyan("\u2500".repeat(60)));
}
function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}
function waitForDone() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(import_chalk.default.gray('\n  Press ENTER or type "done" to finish recording:\n'));
    rl.on("line", (line) => {
      if (["", "done", "stop", "finish"].includes(line.trim().toLowerCase())) {
        rl.close();
        resolve();
      }
    });
    rl.on("close", () => resolve());
  });
}
var RECORDER_SCRIPT = `
(function() {
  if (window.__flowmindInjected) return;
  window.__flowmindInjected = true;

  function getBestSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    if (el.id && !el.id.match(/^\\d/)) return '#' + CSS.escape(el.id);
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-cy');
    if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
    const name = el.getAttribute('name');
    if (name) return '[name="' + CSS.escape(name) + '"]';
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return '[aria-label="' + CSS.escape(ariaLabel) + '"]';
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return '[placeholder="' + CSS.escape(placeholder) + '"]';
    const tag = el.tagName.toLowerCase();
    if (el.type && el.type !== 'text') return tag + '[type="' + el.type + '"]';
    if (tag === 'button' || tag === 'a') {
      const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
      if (text) return tag + ':has-text("' + text + '")';
    }
    const unstable = /^(active|focus|hover|selected|disabled|open|close|show|hide|is-|has-|js-)/;
    const classes = Array.from(el.classList).filter(c => !unstable.test(c)).slice(0, 2);
    if (classes.length > 0) return tag + '.' + classes.map(c => CSS.escape(c)).join('.');
    return tag;
  }

  function isInputField(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      return ['text','email','password','search','url','number','tel','date','time','datetime-local','month','week'].includes(t);
    }
    return false;
  }

  function isInteractable(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    return ['button','a','select'].includes(tag) || ['button','link','menuitem','tab','option'].includes(el.getAttribute('role') || '') || el.getAttribute('tabindex') === '0';
  }

  let lastClickTime = 0; let lastClickSel = '';
  document.addEventListener('click', function(e) {
    let target = e.target;
    let node = target;
    for (let i = 0; i < 4; i++) {
      if (!node || node === document.body) break;
      if (isInteractable(node)) { target = node; break; }
      node = node.parentElement;
    }
    if (isInputField(target)) return;
    const sel = getBestSelector(target);
    const now = Date.now();
    if (sel === lastClickSel && now - lastClickTime < 400) return;
    lastClickTime = now; lastClickSel = sel;
    const label = ((target.innerText || target.textContent || '').trim().replace(/\\s+/g, ' ')).slice(0, 40);
    window.__flowmindRecord({ type: 'click', selector: sel, label: label, url: window.location.href, timestamp: now });
  }, true);

  document.addEventListener('blur', function(e) {
    const target = e.target;
    if (!isInputField(target) || !target.value) return;
    window.__flowmindRecord({ type: 'fill', selector: getBestSelector(target), value: target.value, url: window.location.href, timestamp: Date.now() });
  }, true);

  document.addEventListener('change', function(e) {
    const target = e.target;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'select') window.__flowmindRecord({ type: 'select', selector: getBestSelector(target), value: target.value, url: window.location.href, timestamp: Date.now() });
    if (tag === 'input' && (target.type === 'checkbox' || target.type === 'radio'))
      window.__flowmindRecord({ type: 'check', selector: getBestSelector(target), value: String(target.checked), url: window.location.href, timestamp: Date.now() });
  }, true);
})();
`;
async function runLearn(url) {
  printLogo();
  divider();
  let flowName = args[2];
  if (!flowName) {
    console.log(import_chalk.default.cyan("\n  Enter flow name: "));
    flowName = await askQuestion("  > ");
  }
  if (!flowName) {
    errorMsg("Flow name required");
    process.exit(1);
  }
  info("Target URL: " + import_chalk.default.cyan(url));
  info("Flow name:  " + import_chalk.default.cyan(flowName));
  console.log();
  const flow = db.createFlow({ name: flowName, appUrl: url });
  const capturedActions = [];
  let browserClosed = false;
  const browser = await import_playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.exposeFunction("__flowmindRecord", (action) => {
    const last = capturedActions[capturedActions.length - 1];
    if (last && last.type === action.type && last.selector === action.selector && Date.now() - last.timestamp < 500) return;
    const sanitized = { ...action, value: action.value ? sanitizePII(action.value) : action.value };
    capturedActions.push(sanitized);
    const icons = { click: "\u{1F5B1} ", fill: "\u2328\uFE0F ", select: "\u{1F4CB}", navigate: "\u{1F310}", check: "\u2611\uFE0F " };
    let label = "";
    if (action.type === "click") label = `click ${action.label ? import_chalk.default.white(`"${action.label}"`) : ""} ${import_chalk.default.gray(action.selector)}`;
    else if (action.type === "fill") label = `fill ${import_chalk.default.gray(action.selector)} = ${import_chalk.default.yellow(`"${sanitized.value?.slice(0, 30)}"`)}`;
    else if (action.type === "select") label = `select ${import_chalk.default.gray(action.selector)} \u2192 ${import_chalk.default.yellow(action.value)}`;
    else if (action.type === "navigate") label = `navigate \u2192 ${import_chalk.default.cyan(action.url)}`;
    else if (action.type === "check") label = `check ${import_chalk.default.gray(action.selector)} (${action.value})`;
    process.stdout.write(`  ${import_chalk.default.green(icons[action.type] || "\u25CF")} ${label}
`);
  });
  await page.addInitScript(RECORDER_SCRIPT);
  let lastNavTime = 0;
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const navUrl = frame.url();
    if (navUrl === "about:blank" || navUrl === url) return;
    const now = Date.now();
    const last = capturedActions[capturedActions.length - 1];
    if (last && last.type === "click" && now - last.timestamp < 1500) return;
    if (now - lastNavTime < 300) return;
    lastNavTime = now;
    capturedActions.push({ type: "navigate", url: navUrl, timestamp: now });
    process.stdout.write(`  ${import_chalk.default.green("\u{1F310}")} navigate \u2192 ${import_chalk.default.cyan(navUrl)}
`);
  });
  browser.on("disconnected", () => {
    browserClosed = true;
  });
  console.log(import_chalk.default.bold("  Browser is open \u2014 interact with it normally.\n"));
  console.log(import_chalk.default.gray("  Every click, fill, and navigation is captured automatically.\n"));
  await page.goto(url);
  if (!browserClosed) await waitForDone().catch(() => {
  });
  if (!browserClosed) await browser.close();
  if (capturedActions.length === 0) {
    warn("No actions captured. Flow not saved.");
    db.deleteFlow(flow.id);
    process.exit(0);
  }
  const nodes = [{ id: "start", type: "start", label: "Start", url }];
  const edges = [];
  let prevId = "start";
  capturedActions.forEach((action, i) => {
    const nodeId = `step-${i + 1}`;
    let node;
    if (action.type === "navigate") node = { id: nodeId, type: "action", label: `Navigate to ${action.url}`, action: "navigate", url: action.url };
    else if (action.type === "click") node = { id: nodeId, type: "action", label: action.label ? `Click "${action.label}"` : `Click ${action.selector}`, action: "click", selector: action.selector };
    else if (action.type === "fill") node = { id: nodeId, type: "action", label: `Fill ${action.selector}`, action: "fill", selector: action.selector, value: action.value };
    else if (action.type === "select") node = { id: nodeId, type: "action", label: `Select "${action.value}" in ${action.selector}`, action: "select", selector: action.selector, value: action.value };
    else if (action.type === "check") node = { id: nodeId, type: "action", label: `${action.value === "true" ? "Check" : "Uncheck"} ${action.selector}`, action: "check", selector: action.selector, value: action.value };
    else return;
    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });
  nodes.push({ id: "end", type: "end", label: "End" });
  edges.push({ id: `e${capturedActions.length}`, source: prevId, target: "end" });
  db.updateFlow(flow.id, { graph: { nodes, edges, appUrl: url } });
  divider();
  success(`${capturedActions.length} actions recorded`);
  const counts = capturedActions.reduce((a, c) => {
    a[c.type] = (a[c.type] || 0) + 1;
    return a;
  }, {});
  Object.entries(counts).forEach(([t, n]) => info(`  ${t}: ${n}`));
  console.log();
  info("Run with: " + import_chalk.default.green(`node flowmind.js run ${flow.id.slice(0, 8)}`));
  console.log();
}
async function executeFlow(flowId) {
  let flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) {
    errorMsg("Flow not found: " + flowId);
    process.exit(1);
  }
  let graph;
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    errorMsg("Invalid graph");
    process.exit(1);
    return { passed: false, runId: "", duration: 0 };
  }
  if (!graph.nodes?.length) {
    warn("Empty flow.");
    return { passed: false, runId: "", duration: 0 };
  }
  const run = db.createRun(flow.id);
  const screenshotsDir = db.getScreenshotsPath(run.id);
  const browser = await import_playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
  const actionNodes = graph.nodes.filter((n) => n.type === "action");
  let stepNum = 1, failed = false;
  let failedStepInfo = null;
  const runStart = Date.now();
  for (const node of actionNodes) {
    const label = node.label, action = node.action;
    console.log(import_chalk.default.cyan(`
  [${stepNum}/${actionNodes.length}] ${label}`));
    const step = db.createStep({ runId: run.id, stepNumber: stepNum, name: label, action, selector: node.selector, value: node.value });
    const t = Date.now();
    try {
      await executeAction(page, action, node);
      if (action === "click") {
        await page.waitForLoadState("domcontentloaded", { timeout: 3e3 }).catch(() => {
        });
      }
      const duration = Date.now() - t;
      const screenshot = await page.screenshot();
      const sp = path.join(screenshotsDir, `step-${stepNum}.png`);
      fs.writeFileSync(sp, screenshot);
      db.updateStep(step.id, { status: "passed", duration, screenshotPath: sp });
      console.log(import_chalk.default.green(`      \u2713 passed (${duration}ms)`));
    } catch (err) {
      const duration = Date.now() - t;
      const errorMessage = err instanceof Error ? err.message.split("\n")[0] : String(err);
      try {
        const screenshot = await page.screenshot();
        const sp = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
        fs.writeFileSync(sp, screenshot);
        db.updateStep(step.id, { status: "failed", duration, errorMessage, screenshotPath: sp });
      } catch {
        db.updateStep(step.id, { status: "failed", duration, errorMessage });
      }
      console.log(import_chalk.default.red(`      \u2717 failed (${duration}ms)`));
      console.log(import_chalk.default.red(`        \u2514\u2500 ${errorMessage}`));
      failedStepInfo = { name: label, action, selector: node.selector, errorMessage };
      failed = true;
      break;
    }
    stepNum++;
  }
  await browser.close();
  const totalDuration = Date.now() - runStart;
  let summary = null;
  if (failed && failedStepInfo) {
    process.stdout.write(import_chalk.default.gray("\n  Analyzing failure...\n"));
    const steps = db.listSteps(run.id);
    const result = await callAI(buildFailurePrompt({ flowName: flow.name, steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })), failedStep: failedStepInfo }));
    if (result) {
      summary = result.text;
      process.stdout.write(import_chalk.default.gray(`  (via ${result.provider})
`));
    }
  }
  db.updateRun(run.id, { status: failed ? "failed" : "passed", completedAt: /* @__PURE__ */ new Date(), duration: totalDuration, errorMessage: failedStepInfo?.errorMessage, summary: summary || void 0 });
  divider();
  if (failed) {
    errorMsg("Flow failed");
    if (summary) {
      console.log();
      console.log(import_chalk.default.yellow("  AI Analysis:"));
      console.log(import_chalk.default.white("  " + summary.split("\n").join("\n  ")));
    }
  } else {
    success(`Flow passed! (${totalDuration}ms)`);
  }
  info("Run ID: " + import_chalk.default.gray(run.id.slice(0, 8)));
  info("Screenshots: " + import_chalk.default.cyan(screenshotsDir));
  console.log();
  return { passed: !failed, runId: run.id, duration: totalDuration };
}
async function executeAction(page, action, node) {
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
}
async function runFlow(id) {
  printLogo();
  divider();
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  console.log(import_chalk.default.bold("\n  Running: ") + import_chalk.default.white(flow.name) + "\n");
  await executeFlow(id);
}
async function runFixFlow(id) {
  printLogo();
  divider();
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  console.log(import_chalk.default.bold(`
  Fixing: ${flow.name}
`));
  console.log(import_chalk.default.gray("  Steps will replay automatically. When one fails,"));
  console.log(import_chalk.default.gray("  click the correct element in the browser.\n"));
  let graph;
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    errorMsg("Invalid graph");
    process.exit(1);
    return;
  }
  const actionNodes = graph.nodes.filter((n) => n.type === "action");
  if (!actionNodes.length) {
    warn("No action steps in this flow.");
    return;
  }
  let waitingForFix = false;
  let fixResolve = null;
  let fixesApplied = 0;
  const browser = await import_playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.exposeFunction("__flowmindRecord", (action) => {
    if (waitingForFix && fixResolve && action.type === "click") {
      fixResolve(action);
      fixResolve = null;
      waitingForFix = false;
    }
  });
  await page.addInitScript(RECORDER_SCRIPT);
  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
  for (let i = 0; i < actionNodes.length; i++) {
    const node = actionNodes[i];
    const label = node.label;
    console.log(import_chalk.default.cyan(`
  [${i + 1}/${actionNodes.length}] ${label}`));
    try {
      await executeAction(page, node.action, node);
      if (node.action === "click") await page.waitForLoadState("domcontentloaded", { timeout: 3e3 }).catch(() => {
      });
      console.log(import_chalk.default.green("      \u2713 passed"));
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      console.log(import_chalk.default.red(`      \u2717 failed: ${msg}`));
      console.log(import_chalk.default.yellow(`
      Current selector: ${import_chalk.default.white(node.selector || "(none)")}`));
      console.log(import_chalk.default.yellow("      Click the correct element in the browser..."));
      try {
        await page.evaluate((sel) => {
          document.querySelectorAll("[data-fm-highlight]").forEach((e) => e.removeAttribute("data-fm-highlight"));
          const el = document.querySelector(sel);
          if (el) {
            el.style.outline = "3px solid red";
            el.style.outlineOffset = "2px";
          }
        }, node.selector);
      } catch {
      }
      const captured = await new Promise((resolve) => {
        waitingForFix = true;
        fixResolve = resolve;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.on("line", (line) => {
          if (line.trim().toLowerCase() === "skip") {
            waitingForFix = false;
            fixResolve = null;
            rl.close();
            resolve({ type: "skip", timestamp: Date.now() });
          }
        });
        const origResolve = fixResolve;
        fixResolve = (a) => {
          rl.close();
          origResolve(a);
        };
      });
      if (captured.type === "skip") {
        warn("      Skipped \u2014 selector unchanged.");
        continue;
      }
      const oldSelector = node.selector;
      node.selector = captured.selector;
      if (node.label && typeof node.label === "string" && captured.label) {
      }
      console.log(import_chalk.default.green(`      \u2713 Updated: ${import_chalk.default.gray(oldSelector)} \u2192 ${import_chalk.default.white(captured.selector)}`));
      fixesApplied++;
      try {
        await executeAction(page, node.action, node);
        if (node.action === "click") await page.waitForLoadState("domcontentloaded", { timeout: 3e3 }).catch(() => {
        });
        console.log(import_chalk.default.green("      \u2713 Retry passed"));
      } catch (retryErr) {
        warn(`      Retry also failed: ${retryErr instanceof Error ? retryErr.message.split("\n")[0] : retryErr}`);
        warn("      Continuing anyway \u2014 you may need to fix this step again.");
      }
    }
  }
  await browser.close();
  if (fixesApplied > 0) {
    db.updateFlow(flow.id, { graph: { ...graph, nodes: graph.nodes } });
    divider();
    success(`${fixesApplied} selector${fixesApplied > 1 ? "s" : ""} fixed and saved.`);
    info(`Run: ${import_chalk.default.green(`node flowmind.js run ${flow.id.slice(0, 8)}`)}`);
  } else {
    divider();
    info("No fixes needed \u2014 all selectors work.");
  }
  console.log();
}
async function runDiff(runId1, runId2) {
  const run1 = db.findRunByPartialId(runId1);
  const run2 = db.findRunByPartialId(runId2);
  if (!run1) {
    errorMsg("Run not found: " + runId1);
    process.exit(1);
  }
  if (!run2) {
    errorMsg("Run not found: " + runId2);
    process.exit(1);
  }
  const steps1 = db.listSteps(run1.id);
  const steps2 = db.listSteps(run2.id);
  const flow = db.getFlow(run1.flowId);
  console.log(import_chalk.default.bold(`
  Screenshot Diff: ${flow?.name || "Unknown"}
`));
  console.log(`  ${import_chalk.default.gray("Run A:")} ${run1.id.slice(0, 8)} ${import_chalk.default.gray("(" + run1.status + ")")}`);
  console.log(`  ${import_chalk.default.gray("Run B:")} ${run2.id.slice(0, 8)} ${import_chalk.default.gray("(" + run2.status + ")")}
`);
  let PNG;
  let pixelmatch;
  try {
    const pngjs = await import("pngjs");
    PNG = pngjs.PNG;
    pixelmatch = (await import("pixelmatch")).default;
  } catch {
    errorMsg("Missing dependencies. Run: npm install pixelmatch pngjs");
    process.exit(1);
    return;
  }
  const diffDir = path.join(DATA_PATH, "diffs", `${run1.id.slice(0, 8)}_vs_${run2.id.slice(0, 8)}`);
  fs.mkdirSync(diffDir, { recursive: true });
  const maxSteps = Math.max(steps1.length, steps2.length);
  let changed = 0, same = 0, missing = 0;
  console.log(import_chalk.default.gray("  Step  Status    Diff %  Screenshot"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(58)));
  for (let i = 1; i <= maxSteps; i++) {
    const s1 = steps1.find((s) => s.stepNumber === i);
    const s2 = steps2.find((s) => s.stepNumber === i);
    const name = (s1?.name || s2?.name || `Step ${i}`).slice(0, 30);
    const p1 = s1?.screenshotPath;
    const p2 = s2?.screenshotPath;
    if (!p1 || !p2 || !fs.existsSync(p1) || !fs.existsSync(p2)) {
      console.log(`  ${import_chalk.default.gray(String(i).padStart(4))}  ${import_chalk.default.yellow("missing  ")}  ${import_chalk.default.gray("N/A    ")}  ${import_chalk.default.gray(name)}`);
      missing++;
      continue;
    }
    try {
      const img1 = PNG.sync.read(fs.readFileSync(p1));
      const img2 = PNG.sync.read(fs.readFileSync(p2));
      const w = Math.min(img1.width, img2.width);
      const h = Math.min(img1.height, img2.height);
      const diff = new PNG({ width: w, height: h });
      const numDiff = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
      const pct = (numDiff / (w * h) * 100).toFixed(1);
      const diffPath = path.join(diffDir, `step-${i}-diff.png`);
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
      const isChanged = parseFloat(pct) > 0.5;
      if (isChanged) changed++;
      else same++;
      const statusLabel = isChanged ? import_chalk.default.yellow("changed  ") : import_chalk.default.green("same     ");
      const pctLabel = isChanged ? import_chalk.default.yellow(pct.padStart(5) + "%") : import_chalk.default.gray(pct.padStart(5) + "%");
      console.log(`  ${import_chalk.default.gray(String(i).padStart(4))}  ${statusLabel}  ${pctLabel}  ${import_chalk.default.white(name)}`);
    } catch {
      console.log(`  ${import_chalk.default.gray(String(i).padStart(4))}  ${import_chalk.default.red("error    ")}  ${import_chalk.default.gray("N/A    ")}  ${import_chalk.default.gray(name)}`);
      missing++;
    }
  }
  console.log(import_chalk.default.gray("\n  " + "\u2500".repeat(58)));
  console.log(`  ${import_chalk.default.green(same + " same")}  ${import_chalk.default.yellow(changed + " changed")}  ${missing ? import_chalk.default.gray(missing + " missing") : ""}`);
  console.log(`
  ${import_chalk.default.gray("Diff images:")} ${import_chalk.default.cyan(diffDir)}
`);
}
async function runListFlows() {
  const flows = db.listFlows();
  console.log(import_chalk.default.bold("\n  Your Flows\n"));
  if (flows.length === 0) {
    warn("No flows. Create one: " + import_chalk.default.cyan("node flowmind.js learn <url>"));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Name                          Steps  Updated"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(62)));
  for (const flow of flows) {
    let steps = 0;
    try {
      steps = (JSON.parse(flow.graph).nodes || []).filter((n) => n.type === "action").length;
    } catch {
    }
    console.log(`  ${import_chalk.default.gray(flow.id.slice(0, 8))} ${import_chalk.default.white(flow.name.padEnd(28).slice(0, 28))} ${import_chalk.default.gray(String(steps).padEnd(6))} ${import_chalk.default.gray(flow.updatedAt.toLocaleDateString())}`);
  }
  console.log();
}
async function runDeleteFlow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const confirm = await askQuestion(`  Delete "${import_chalk.default.yellow(flow.name)}"? (y/N) `);
  if (confirm.toLowerCase() !== "y") {
    warn("Cancelled");
    return;
  }
  db.deleteFlow(flow.id);
  success(`Deleted: ${flow.name}`);
  console.log();
}
async function runExportFlow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const filename = `${flow.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.flow.json`;
  fs.writeFileSync(filename, JSON.stringify({ version: "1.0.0", exportedAt: (/* @__PURE__ */ new Date()).toISOString(), flow: { name: flow.name, description: flow.description, appUrl: flow.appUrl, graph: JSON.parse(flow.graph) } }, null, 2));
  success(`Exported to ${import_chalk.default.cyan(filename)}`);
  console.log();
}
async function runImportFlow(filepath) {
  if (!fs.existsSync(filepath)) {
    errorMsg("File not found: " + filepath);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    errorMsg("Invalid JSON");
    process.exit(1);
    return;
  }
  const created = db.createFlow({ name: data.flow.name, description: data.flow.description, appUrl: data.flow.appUrl, graph: data.flow.graph });
  success(`Imported: ${import_chalk.default.white(data.flow.name)}`);
  info("ID: " + import_chalk.default.gray(created.id.slice(0, 8)));
  console.log();
}
async function runListRuns() {
  const runs = db.listRuns(void 0, 20);
  console.log(import_chalk.default.bold("\n  Recent Runs\n"));
  if (runs.length === 0) {
    warn("No runs yet.");
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Flow                           Status       Duration"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(72)));
  for (const run of runs) {
    const flow = db.getFlow(run.flowId);
    const statusColor = run.status === "passed" ? import_chalk.default.green : run.status === "failed" ? import_chalk.default.red : import_chalk.default.yellow;
    console.log(`  ${import_chalk.default.gray(run.id.slice(0, 8))} ${import_chalk.default.white((flow?.name || "Unknown").padEnd(28).slice(0, 28))} ${statusColor(run.status.padEnd(12))} ${import_chalk.default.gray(run.duration ? run.duration + "ms" : "-")}`);
  }
  console.log();
}
async function runShowRun(id) {
  const run = db.findRunByPartialId(id);
  if (!run) {
    errorMsg("Run not found: " + id);
    process.exit(1);
  }
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const statusColor = run.status === "passed" ? import_chalk.default.green : run.status === "failed" ? import_chalk.default.red : import_chalk.default.yellow;
  console.log(import_chalk.default.bold(`
  Run: ${run.id.slice(0, 8)}
`));
  const b = "\u2500".repeat(56);
  console.log(import_chalk.default.gray(`  \u250C${b}\u2510`));
  console.log(import_chalk.default.gray("  \u2502 ") + `Flow:     ${(flow?.name || "Unknown").padEnd(44)}` + import_chalk.default.gray("\u2502"));
  console.log(import_chalk.default.gray("  \u2502 ") + `Status:   ${statusColor(run.status).padEnd(53)}` + import_chalk.default.gray("\u2502"));
  console.log(import_chalk.default.gray("  \u2502 ") + `Duration: ${(run.duration ? run.duration + "ms" : "-").padEnd(44)}` + import_chalk.default.gray("\u2502"));
  console.log(import_chalk.default.gray(`  \u2514${b}\u2518`));
  if (run.summary) {
    console.log();
    console.log(import_chalk.default.yellow("  AI Analysis:"));
    console.log(import_chalk.default.white("  " + run.summary.split("\n").join("\n  ")));
  }
  console.log(import_chalk.default.bold("\n  Steps\n"));
  for (const step of steps) {
    const icon = step.status === "passed" ? import_chalk.default.green("\u2713") : step.status === "failed" ? import_chalk.default.red("\u2717") : import_chalk.default.gray("\u25CB");
    console.log(`    ${import_chalk.default.gray(String(step.stepNumber).padStart(2))}  ${icon}  ${import_chalk.default.white(step.name)} ${import_chalk.default.gray(step.duration ? step.duration + "ms" : "")}`);
    if (step.status === "failed" && step.errorMessage) console.log(`         ${import_chalk.default.red("\u2514\u2500 " + step.errorMessage.slice(0, 80))}`);
    if (step.screenshotPath) console.log(`         ${import_chalk.default.gray("\u{1F4F7} " + step.screenshotPath)}`);
  }
  console.log();
}
async function runAnalyzeRun(id) {
  const run = db.findRunByPartialId(id);
  if (!run) {
    errorMsg("Run not found: " + id);
    process.exit(1);
  }
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const failedStep = steps.find((s) => s.status === "failed");
  if (!failedStep) {
    info("Run passed \u2014 no failures to analyze.");
    return;
  }
  info("Analyzing failure...");
  const result = await callAI(buildFailurePrompt({
    flowName: flow?.name || "Unknown",
    steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
    failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || "Unknown error" }
  }));
  if (result) {
    db.updateRun(run.id, { summary: result.text });
    console.log();
    console.log(import_chalk.default.yellow(`  AI Analysis ${import_chalk.default.gray("(via " + result.provider + ")")}:`));
    console.log(import_chalk.default.white("  " + result.text.split("\n").join("\n  ")));
    console.log();
  } else {
    warn("No AI provider available. Run Ollama locally or set ANTHROPIC_API_KEY.");
    console.log(import_chalk.default.gray("  brew install ollama && ollama pull gemma3:4b"));
  }
}
async function runScheduleAdd(id, cronExpr) {
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  let nodeCron;
  try {
    nodeCron = await import("node-cron");
  } catch {
    errorMsg("node-cron not installed. Run: npm install node-cron");
    process.exit(1);
    return;
  }
  if (!nodeCron.validate(cronExpr)) {
    errorMsg(`Invalid cron expression: "${cronExpr}"
  Example: "0 9 * * *" (daily at 9am)`);
    process.exit(1);
  }
  const schedule = db.createSchedule({ flowId: flow.id, name: flow.name, cronExpression: cronExpr });
  success(`Scheduled "${flow.name}"`);
  info(`Cron: ${import_chalk.default.cyan(cronExpr)}`);
  info(`ID:   ${import_chalk.default.gray(schedule.id.slice(0, 8))}`);
  console.log();
  console.log(import_chalk.default.gray("  Start the scheduler daemon with:"));
  console.log("  " + import_chalk.default.cyan("node flowmind.js serve"));
  console.log();
}
async function runScheduleList() {
  const schedules = db.listSchedules();
  console.log(import_chalk.default.bold("\n  Schedules\n"));
  if (schedules.length === 0) {
    warn("No schedules. Add one: " + import_chalk.default.cyan('node flowmind.js flow:schedule <id> "<cron>"'));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Flow                    Cron            Last Run      Status"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(78)));
  for (const s of schedules) {
    const lastRun = s.lastRunAt ? s.lastRunAt.toLocaleDateString() : import_chalk.default.gray("never");
    const statusColor = s.lastRunStatus === "passed" ? import_chalk.default.green : s.lastRunStatus === "failed" ? import_chalk.default.red : import_chalk.default.gray;
    const status = s.lastRunStatus ? statusColor(s.lastRunStatus) : import_chalk.default.gray("\u2014");
    console.log(`  ${import_chalk.default.gray(s.id.slice(0, 8))} ${import_chalk.default.white((s.flowName || s.name).padEnd(22).slice(0, 22))} ${import_chalk.default.cyan(s.cronExpression.padEnd(15))} ${String(lastRun).padEnd(13)} ${status}`);
  }
  console.log();
}
async function runScheduleRemove(id) {
  const schedules = db.listSchedules();
  const schedule = schedules.find((s) => s.id.startsWith(id));
  if (!schedule) {
    errorMsg("Schedule not found: " + id);
    process.exit(1);
  }
  db.deleteSchedule(schedule.id);
  success(`Removed schedule for "${schedule.name}"`);
  console.log();
}
async function runServe() {
  printLogo();
  divider();
  let nodeCron;
  try {
    nodeCron = await import("node-cron");
  } catch {
    errorMsg("node-cron not installed. Run: npm install node-cron");
    process.exit(1);
    return;
  }
  const schedules = db.listSchedules();
  if (schedules.length === 0) {
    warn("No schedules configured. Add one first:");
    info('node flowmind.js flow:schedule <id> "0 9 * * *"');
    process.exit(0);
  }
  console.log(import_chalk.default.bold(`
  Scheduler started \u2014 ${schedules.length} schedule${schedules.length > 1 ? "s" : ""} active
`));
  schedules.forEach((s) => info(`${s.name} \u2192 ${import_chalk.default.cyan(s.cronExpression)}`));
  console.log(import_chalk.default.gray("\n  Press Ctrl+C to stop.\n"));
  for (const schedule of schedules) {
    nodeCron.schedule(schedule.cronExpression, async () => {
      const ts = (/* @__PURE__ */ new Date()).toLocaleTimeString();
      console.log(import_chalk.default.cyan(`
  [${ts}] Running: ${schedule.name}`));
      try {
        const result = await executeFlow(schedule.flowId);
        db.updateScheduleLastRun(schedule.id, result.passed ? "passed" : "failed");
        console.log(result.passed ? import_chalk.default.green(`  \u2713 passed (${result.duration}ms)`) : import_chalk.default.red("  \u2717 failed"));
      } catch (err) {
        console.log(import_chalk.default.red(`  \u2717 error: ${err}`));
        db.updateScheduleLastRun(schedule.id, "failed");
      }
    });
  }
  process.on("SIGINT", () => {
    console.log("\n  Stopping...");
    db.close();
    process.exit(0);
  });
  await new Promise(() => {
  });
}
async function runStatus() {
  printLogo();
  divider();
  const flows = db.listFlows();
  const runs = db.listRuns(void 0, 100);
  const passed = runs.filter((r) => r.status === "passed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  console.log(import_chalk.default.bold("\n  Statistics\n"));
  console.log("  " + import_chalk.default.gray("Flows:        ") + import_chalk.default.white(String(flows.length)));
  console.log("  " + import_chalk.default.gray("Total Runs:   ") + import_chalk.default.white(String(runs.length)));
  console.log("  " + import_chalk.default.gray("Passed:       ") + import_chalk.default.green(String(passed)));
  console.log("  " + import_chalk.default.gray("Failed:       ") + import_chalk.default.red(String(failed)));
  if (runs.length > 0) {
    const rate = Math.round(passed / runs.length * 100);
    console.log("  " + import_chalk.default.gray("Success Rate: ") + (rate >= 80 ? import_chalk.default.green : rate >= 50 ? import_chalk.default.yellow : import_chalk.default.red)(`${rate}%`));
  }
  console.log();
  console.log("  " + import_chalk.default.gray("Data Path:    ") + import_chalk.default.white(DATA_PATH));
  const ollamaModel = await isOllamaRunning();
  if (ollamaModel) {
    console.log("  " + import_chalk.default.gray("AI Provider:  ") + import_chalk.default.green(`Ollama (${ollamaModel})`));
  } else if (process.env.ANTHROPIC_API_KEY) {
    console.log("  " + import_chalk.default.gray("AI Provider:  ") + import_chalk.default.cyan("Anthropic Claude"));
  } else {
    console.log("  " + import_chalk.default.gray("AI Provider:  ") + import_chalk.default.gray("none (run ollama locally or set ANTHROPIC_API_KEY)"));
  }
  console.log();
}
var args = process.argv.slice(2);
var cmd = args[0];
var db = new DatabaseManager();
async function main() {
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printLogo();
    divider();
    console.log();
    console.log(import_chalk.default.bold("  Commands\n"));
    const C = (s) => import_chalk.default.cyan(s);
    const G = (s) => import_chalk.default.gray(s);
    const pad = 36;
    console.log(`  ${C("init").padEnd(pad)}${G("Initialize Flowmind")}`);
    console.log(`  ${C("learn <url> [name]").padEnd(pad)}${G("Record a flow (real browser)")}`);
    console.log(`  ${C("run <id|name>").padEnd(pad)}${G("Execute a flow")}`);
    console.log(`  ${C("flow:list").padEnd(pad)}${G("List all flows")}`);
    console.log(`  ${C("flow:fix <id|name>").padEnd(pad)}${G("Repair broken selectors interactively")}`);
    console.log(`  ${C("flow:delete <id|name>").padEnd(pad)}${G("Delete a flow")}`);
    console.log(`  ${C("flow:export <id|name>").padEnd(pad)}${G("Export flow to JSON")}`);
    console.log(`  ${C("flow:import <file>").padEnd(pad)}${G("Import flow from JSON")}`);
    console.log(`  ${C('flow:schedule <id> "<cron>"').padEnd(pad)}${G('Schedule a flow (e.g. "0 9 * * *")')}`);
    console.log(`  ${C("schedule:list").padEnd(pad)}${G("List all schedules")}`);
    console.log(`  ${C("schedule:remove <id>").padEnd(pad)}${G("Remove a schedule")}`);
    console.log(`  ${C("serve").padEnd(pad)}${G("Start scheduler daemon")}`);
    console.log(`  ${C("run:list").padEnd(pad)}${G("List recent runs")}`);
    console.log(`  ${C("run:show <id>").padEnd(pad)}${G("Show run details + screenshots")}`);
    console.log(`  ${C("run:diff <id1> <id2>").padEnd(pad)}${G("Visual screenshot diff between two runs")}`);
    console.log(`  ${C("run:analyze <id>").padEnd(pad)}${G("AI analysis of a failed run [AI]")}`);
    console.log(`  ${C("status").padEnd(pad)}${G("Statistics and AI provider info")}`);
    console.log();
    console.log(`  ${G("[AI] = enhanced by AI if available (Ollama local or Anthropic cloud)")}`);
    console.log();
    process.exit(0);
  }
  switch (cmd) {
    case "init":
      console.log(import_chalk.default.green("  \u2713 Initialized at " + DATA_PATH));
      break;
    case "learn":
      if (!args[1]) {
        errorMsg("URL required");
        process.exit(1);
      }
      await runLearn(args[1]);
      break;
    case "run":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runFlow(args[1]);
      break;
    case "flow:list":
      await runListFlows();
      break;
    case "flow:fix":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runFixFlow(args[1]);
      break;
    case "flow:delete":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runDeleteFlow(args[1]);
      break;
    case "flow:export":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runExportFlow(args[1]);
      break;
    case "flow:import":
      if (!args[1]) {
        errorMsg("File path required");
        process.exit(1);
      }
      await runImportFlow(args[1]);
      break;
    case "flow:schedule":
      if (!args[1] || !args[2]) {
        errorMsg('Usage: flow:schedule <id|name> "<cron expression>"');
        process.exit(1);
      }
      await runScheduleAdd(args[1], args[2]);
      break;
    case "schedule:list":
      await runScheduleList();
      break;
    case "schedule:remove":
      if (!args[1]) {
        errorMsg("Schedule ID required");
        process.exit(1);
      }
      await runScheduleRemove(args[1]);
      break;
    case "serve":
      await runServe();
      break;
    case "run:list":
      await runListRuns();
      break;
    case "run:show":
      if (!args[1]) {
        errorMsg("Run ID required");
        process.exit(1);
      }
      await runShowRun(args[1]);
      break;
    case "run:diff":
      if (!args[1] || !args[2]) {
        errorMsg("Usage: run:diff <run1-id> <run2-id>");
        process.exit(1);
      }
      await runDiff(args[1], args[2]);
      break;
    case "run:analyze":
      if (!args[1]) {
        errorMsg("Run ID required");
        process.exit(1);
      }
      await runAnalyzeRun(args[1]);
      break;
    case "status":
      await runStatus();
      break;
    default:
      errorMsg("Unknown command: " + cmd);
      console.log("  Run without args for help.");
      process.exit(1);
  }
  if (cmd !== "serve") db.close();
}
main().catch((err) => {
  errorMsg(String(err));
  process.exit(1);
});
