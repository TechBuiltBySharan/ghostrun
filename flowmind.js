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
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        app_url TEXT,
        graph TEXT NOT NULL DEFAULT '{}',
        version TEXT NOT NULL DEFAULT '1.0.0',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        duration INTEGER,
        error_message TEXT,
        summary TEXT,
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        action TEXT NOT NULL,
        selector TEXT,
        value TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        duration INTEGER,
        error_message TEXT,
        screenshot_path TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );
    `);
  }
  createFlow(data) {
    const id = (0, import_uuid.v4)();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare(`INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, data.name, data.description || null, data.appUrl || null, JSON.stringify(data.graph || {}), now, now);
    return this.getFlow(id);
  }
  getFlow(id) {
    const row = this.db.prepare("SELECT * FROM flows WHERE id = ?").get(id);
    return row ? this.mapFlow(row) : null;
  }
  findFlowByPartialId(partialId) {
    const rows = this.db.prepare("SELECT * FROM flows WHERE id LIKE ?").all(partialId + "%");
    if (rows.length !== 1) return null;
    return this.mapFlow(rows[0]);
  }
  findFlowByName(name) {
    const rows = this.db.prepare("SELECT * FROM flows WHERE LOWER(name) LIKE ?").all(`%${name.toLowerCase()}%`);
    if (rows.length !== 1) return null;
    return this.mapFlow(rows[0]);
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
  mapFlow(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      appUrl: row.app_url,
      graph: row.graph,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  createRun(flowId) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO runs (id, flow_id, status, started_at) VALUES (?, ?, 'running', datetime('now'))`).run(id, flowId);
    return this.getRun(id);
  }
  getRun(id) {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    return row ? this.mapRun(row) : null;
  }
  findRunByPartialId(partialId) {
    const rows = this.db.prepare("SELECT * FROM runs WHERE id LIKE ?").all(partialId + "%");
    if (rows.length !== 1) return null;
    return this.mapRun(rows[0]);
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
  createStep(data) {
    const id = (0, import_uuid.v4)();
    this.db.prepare(`INSERT INTO steps (id, run_id, step_number, name, action, selector, value, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`).run(id, data.runId, data.stepNumber, data.name, data.action, data.selector || null, data.value || null);
    return this.getStep(id);
  }
  getStep(id) {
    const row = this.db.prepare("SELECT * FROM steps WHERE id = ?").get(id);
    return row ? this.mapStep(row) : null;
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
  mapRun(row) {
    return {
      id: row.id,
      flowId: row.flow_id,
      status: row.status,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      duration: row.duration,
      errorMessage: row.error_message,
      summary: row.summary
    };
  }
  mapStep(row) {
    return {
      id: row.id,
      runId: row.run_id,
      stepNumber: row.step_number,
      name: row.name,
      action: row.action,
      selector: row.selector,
      value: row.value,
      status: row.status,
      duration: row.duration,
      errorMessage: row.error_message,
      screenshotPath: row.screenshot_path
    };
  }
  getScreenshotsPath(runId) {
    const dir = path.join(DATA_PATH, "screenshots", runId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
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
  text = text.replace(/(api[_-]?key|apikey|api_secret)["\s:=]+["']?[a-zA-Z0-9_-]{20,}["']?/gi, "API_KEY=[TOKEN]");
  text = text.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, "[JWT]");
  text = text.replace(/\b(?:password|passwd|pwd)\s*[:=]\s*\S+/gi, "password=[REDACTED]");
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
  return text;
}
async function summarizeFailureWithAI(context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const stepsSummary = context.steps.map(
      (s) => `  Step ${s.stepNumber} [${s.status}]: ${s.name} (${s.action}${s.selector ? ` on "${s.selector}"` : ""})`
    ).join("\n");
    const prompt = `A web automation flow named "${context.flowName}" failed during execution.

Steps executed:
${stepsSummary}

Failed step: "${context.failedStep.name}"
Action: ${context.failedStep.action}${context.failedStep.selector ? ` on selector "${context.failedStep.selector}"` : ""}
Error: ${context.failedStep.errorMessage}

In 2-3 sentences, explain what likely went wrong and suggest how to fix it. Be specific and practical. Focus on actionable advice.`;
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }]
    });
    const content = message.content[0];
    return content.type === "text" ? content.text : null;
  } catch {
    return null;
  }
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
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
function waitForDone() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(import_chalk.default.gray('\n  Press ENTER or type "done" to finish recording:\n'));
    rl.on("line", (line) => {
      const cmd2 = line.trim().toLowerCase();
      if (cmd2 === "" || cmd2 === "done" || cmd2 === "stop" || cmd2 === "finish") {
        rl.close();
        resolve();
      }
    });
    rl.on("close", () => resolve());
  });
}
async function runInit() {
  printLogo();
  divider();
  success("Initialized at " + import_chalk.default.white(DATA_PATH));
  console.log();
  info("Run " + import_chalk.default.cyan("node flowmind.ts learn <url>") + " to start recording");
  console.log();
}
var RECORDER_SCRIPT = `
(function() {
  if (window.__flowmindInjected) return;
  window.__flowmindInjected = true;

  function getBestSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    // ID
    if (el.id && !el.id.match(/^\\d/)) return '#' + CSS.escape(el.id);
    // data-testid
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-cy');
    if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
    // name attribute
    const name = el.getAttribute('name');
    if (name) return '[name="' + CSS.escape(name) + '"]';
    // aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return '[aria-label="' + CSS.escape(ariaLabel) + '"]';
    // placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return '[placeholder="' + CSS.escape(placeholder) + '"]';
    // type for inputs
    const tag = el.tagName.toLowerCase();
    if (el.type && el.type !== 'text') return tag + '[type="' + el.type + '"]';
    // button/anchor text \u2014 use innerText to capture text inside child spans too
    if (tag === 'button' || tag === 'a') {
      const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
      if (text) return tag + ':has-text("' + text + '")';
    }
    // stable classes (skip utility/state classes)
    const unstable = /^(active|focus|hover|selected|disabled|open|close|show|hide|is-|has-|js-)/;
    const classes = Array.from(el.classList).filter(c => !unstable.test(c)).slice(0, 2);
    if (classes.length > 0) return tag + '.' + classes.map(c => CSS.escape(c)).join('.');
    return tag;
  }

  function isInteractable(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    return tag === 'button' || tag === 'a' || tag === 'select' ||
      el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' ||
      el.getAttribute('role') === 'menuitem' || el.getAttribute('role') === 'tab' ||
      el.onclick != null || el.getAttribute('tabindex') === '0';
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

  // Click capture
  let lastClickTime = 0;
  let lastClickSel = '';
  document.addEventListener('click', function(e) {
    let target = e.target;
    // Walk up to find meaningful interactable ancestor
    let node = target;
    for (let i = 0; i < 4; i++) {
      if (!node || node === document.body) break;
      if (isInteractable(node) || node.tagName === 'BUTTON' || node.tagName === 'A') { target = node; break; }
      node = node.parentElement;
    }
    // Skip raw input field clicks (captured as fill)
    if (isInputField(target)) return;
    const sel = getBestSelector(target);
    const now = Date.now();
    if (sel === lastClickSel && now - lastClickTime < 400) return;
    lastClickTime = now;
    lastClickSel = sel;
    const label = ((target.innerText || target.textContent || '').trim().replace(/\\s+/g, ' ')).slice(0, 40);
    window.__flowmindRecord({ type: 'click', selector: sel, label: label, url: window.location.href, timestamp: now });
  }, true);

  // Fill capture (on blur = when user leaves the field)
  document.addEventListener('blur', function(e) {
    const target = e.target;
    if (!isInputField(target)) return;
    const value = target.value;
    if (!value) return;
    const sel = getBestSelector(target);
    window.__flowmindRecord({ type: 'fill', selector: sel, value: value, url: window.location.href, timestamp: Date.now() });
  }, true);

  // Select capture
  document.addEventListener('change', function(e) {
    const target = e.target;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'select') {
      window.__flowmindRecord({ type: 'select', selector: getBestSelector(target), value: target.value, url: window.location.href, timestamp: Date.now() });
    }
    if (tag === 'input' && (target.type === 'checkbox' || target.type === 'radio')) {
      window.__flowmindRecord({ type: 'check', selector: getBestSelector(target), value: String(target.checked), url: window.location.href, timestamp: Date.now() });
    }
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
  info("Flow name: " + import_chalk.default.cyan(flowName));
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
    const sanitizedAction = { ...action, value: action.value ? sanitizePII(action.value) : action.value };
    capturedActions.push(sanitizedAction);
    const icons = { click: "\u{1F5B1} ", fill: "\u2328\uFE0F ", select: "\u{1F4CB}", navigate: "\u{1F310}", check: "\u2611\uFE0F " };
    const icon = icons[action.type] || "\u25CF";
    let label = "";
    if (action.type === "click") label = `click ${action.label ? import_chalk.default.white(`"${action.label}"`) : ""} ${import_chalk.default.gray(action.selector)}`;
    else if (action.type === "fill") label = `fill ${import_chalk.default.gray(action.selector)} = ${import_chalk.default.yellow(`"${sanitizedAction.value?.slice(0, 30)}"`)}`;
    else if (action.type === "select") label = `select ${import_chalk.default.gray(action.selector)} \u2192 ${import_chalk.default.yellow(action.value)}`;
    else if (action.type === "navigate") label = `navigate \u2192 ${import_chalk.default.cyan(action.url)}`;
    else if (action.type === "check") label = `check ${import_chalk.default.gray(action.selector)} (${action.value})`;
    else label = `${action.type} ${action.selector}`;
    process.stdout.write(`  ${import_chalk.default.green(icon)} ${label}
`);
  });
  await page.addInitScript(RECORDER_SCRIPT);
  let lastNavTime = 0;
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const navUrl = frame.url();
    if (navUrl === "about:blank" || navUrl === url) return;
    const now = Date.now();
    const lastAction = capturedActions[capturedActions.length - 1];
    if (lastAction && lastAction.type === "click" && now - lastAction.timestamp < 1500) return;
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
  if (!browserClosed) {
    await waitForDone().catch(() => {
    });
  }
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
    if (action.type === "navigate") {
      node = { id: nodeId, type: "action", label: `Navigate to ${action.url}`, action: "navigate", url: action.url };
    } else if (action.type === "click") {
      const label = action.label ? `Click "${action.label}"` : `Click ${action.selector}`;
      node = { id: nodeId, type: "action", label, action: "click", selector: action.selector };
    } else if (action.type === "fill") {
      node = { id: nodeId, type: "action", label: `Fill ${action.selector}`, action: "fill", selector: action.selector, value: action.value };
    } else if (action.type === "select") {
      node = { id: nodeId, type: "action", label: `Select ${action.value} in ${action.selector}`, action: "select", selector: action.selector, value: action.value };
    } else if (action.type === "check") {
      node = { id: nodeId, type: "action", label: `${action.value === "true" ? "Check" : "Uncheck"} ${action.selector}`, action: "check", selector: action.selector, value: action.value };
    } else {
      return;
    }
    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });
  nodes.push({ id: "end", type: "end", label: "End" });
  edges.push({ id: `e${capturedActions.length}`, source: prevId, target: "end" });
  db.updateFlow(flow.id, { graph: { nodes, edges, appUrl: url } });
  divider();
  console.log(import_chalk.default.bold("\n  Recording Complete\n"));
  success(`${capturedActions.length} actions recorded`);
  const actionCounts = capturedActions.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});
  Object.entries(actionCounts).forEach(([type, count]) => info(`  ${type}: ${count}`));
  console.log();
  info("Run with: " + import_chalk.default.green(`node flowmind.ts run ${flow.id.slice(0, 8)}`));
  console.log();
}
async function runFlow(id) {
  printLogo();
  divider();
  let flow = db.findFlowByPartialId(id);
  if (!flow) flow = db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  console.log(import_chalk.default.bold("\n  Running: ") + import_chalk.default.white(flow.name) + "\n");
  let graph;
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    errorMsg("Invalid graph");
    process.exit(1);
    return;
  }
  if (!graph.nodes || graph.nodes.length === 0) {
    warn("Empty flow \u2014 nothing to run.");
    return;
  }
  const run = db.createRun(flow.id);
  const screenshotsDir = db.getScreenshotsPath(run.id);
  const browser = await import_playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
  const actionNodes = graph.nodes.filter((n) => n.type === "action");
  let stepNum = 1;
  let failed = false;
  let failedStepInfo = null;
  const runStart = Date.now();
  for (const node of actionNodes) {
    const label = node.label;
    const action = node.action;
    console.log(import_chalk.default.cyan(`
  [${stepNum}/${actionNodes.length}] ${label}`));
    const step = db.createStep({
      runId: run.id,
      stepNumber: stepNum,
      name: label,
      action,
      selector: node.selector,
      value: node.value
    });
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
      db.updateStep(step.id, { status: "passed", duration, screenshotPath });
      console.log(import_chalk.default.green(`      \u2713 passed (${duration}ms)`));
    } catch (err) {
      const duration = Date.now() - t;
      const errorMessage = err instanceof Error ? err.message.split("\n")[0] : String(err);
      try {
        const screenshot = await page.screenshot();
        const screenshotPath = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
        fs.writeFileSync(screenshotPath, screenshot);
        db.updateStep(step.id, { status: "failed", duration, errorMessage, screenshotPath });
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
    const steps = db.listSteps(run.id);
    process.stdout.write(import_chalk.default.gray("\n  Analyzing failure...\n"));
    summary = await summarizeFailureWithAI({
      flowName: flow.name,
      steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
      failedStep: failedStepInfo
    });
  }
  db.updateRun(run.id, {
    status: failed ? "failed" : "passed",
    completedAt: /* @__PURE__ */ new Date(),
    duration: totalDuration,
    errorMessage: failedStepInfo?.errorMessage,
    summary: summary || void 0
  });
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
  console.log();
  info("Run ID: " + import_chalk.default.gray(run.id.slice(0, 8)));
  info("Screenshots: " + import_chalk.default.cyan(screenshotsDir));
  console.log();
}
async function runListFlows() {
  const flows = db.listFlows();
  console.log(import_chalk.default.bold("\n  Your Flows\n"));
  if (flows.length === 0) {
    warn("No flows. Create one: " + import_chalk.default.cyan("node flowmind.ts learn <url>"));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Name                          Steps  Updated"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(62)));
  for (const flow of flows) {
    let nodeCount = 0;
    try {
      nodeCount = JSON.parse(flow.graph).nodes?.filter((n) => n.type === "action").length || 0;
    } catch {
    }
    const id = flow.id.slice(0, 8);
    const name = flow.name.padEnd(28).slice(0, 28);
    const steps = nodeCount.toString().padEnd(6);
    const updated = flow.updatedAt.toLocaleDateString();
    console.log(`  ${import_chalk.default.gray(id)} ${import_chalk.default.white(name)} ${import_chalk.default.gray(steps)} ${import_chalk.default.gray(updated)}`);
  }
  console.log();
}
async function runDeleteFlow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const confirm = await askQuestion(`  Delete flow "${import_chalk.default.yellow(flow.name)}"? (y/N) `);
  if (confirm.toLowerCase() !== "y") {
    warn("Cancelled");
    return;
  }
  db.deleteFlow(flow.id);
  success(`Deleted flow: ${flow.name}`);
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
    const flowName = (flow?.name || "Unknown").padEnd(28).slice(0, 28);
    const id = run.id.slice(0, 8);
    const statusPad = run.status.padEnd(12);
    const duration = run.duration ? `${run.duration}ms` : "-";
    const statusColor = run.status === "passed" ? import_chalk.default.green : run.status === "failed" ? import_chalk.default.red : import_chalk.default.yellow;
    console.log(`  ${import_chalk.default.gray(id)} ${import_chalk.default.white(flowName)} ${statusColor(statusPad)} ${import_chalk.default.gray(duration)}`);
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
  console.log(import_chalk.default.bold(`
  Run: ${run.id.slice(0, 8)}
`));
  const border = "\u2500".repeat(56);
  const statusColor = run.status === "passed" ? import_chalk.default.green : run.status === "failed" ? import_chalk.default.red : import_chalk.default.yellow;
  console.log(import_chalk.default.gray(`  \u250C${border}\u2510`));
  console.log(import_chalk.default.gray("  \u2502 ") + `Flow:     ${(flow?.name || "Unknown").padEnd(44)}` + import_chalk.default.gray("\u2502"));
  console.log(import_chalk.default.gray("  \u2502 ") + `Status:   ${statusColor(run.status).padEnd(53)}` + import_chalk.default.gray("\u2502"));
  console.log(import_chalk.default.gray("  \u2502 ") + `Duration: ${(run.duration ? `${run.duration}ms` : "-").padEnd(44)}` + import_chalk.default.gray("\u2502"));
  console.log(import_chalk.default.gray(`  \u2514${border}\u2518`));
  if (run.summary) {
    console.log();
    console.log(import_chalk.default.yellow("  AI Analysis:"));
    console.log(import_chalk.default.white("  " + run.summary.split("\n").join("\n  ")));
  }
  console.log(import_chalk.default.bold("\n  Steps\n"));
  for (const step of steps) {
    const icon = step.status === "passed" ? import_chalk.default.green("\u2713") : step.status === "failed" ? import_chalk.default.red("\u2717") : import_chalk.default.gray("\u25CB");
    const duration = step.duration ? import_chalk.default.gray(`${step.duration}ms`) : "";
    console.log(`    ${import_chalk.default.gray(step.stepNumber.toString().padStart(2))}  ${icon}  ${import_chalk.default.white(step.name)} ${duration}`);
    if (step.status === "failed" && step.errorMessage) {
      console.log(`         ${import_chalk.default.red("\u2514\u2500 " + step.errorMessage.slice(0, 80))}`);
    }
    if (step.screenshotPath) {
      console.log(`         ${import_chalk.default.gray("\u{1F4F7} " + step.screenshotPath)}`);
    }
  }
  console.log();
}
async function runAnalyzeRun(id) {
  const run = db.findRunByPartialId(id);
  if (!run) {
    errorMsg("Run not found: " + id);
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    warn("ANTHROPIC_API_KEY not set. Set it to enable AI analysis.");
    console.log("  " + import_chalk.default.gray("export ANTHROPIC_API_KEY=your_key_here"));
    process.exit(1);
  }
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const failedStep = steps.find((s) => s.status === "failed");
  if (!failedStep) {
    info("Run passed \u2014 no failures to analyze.");
    return;
  }
  info("Analyzing failure with AI...");
  const summary = await summarizeFailureWithAI({
    flowName: flow?.name || "Unknown flow",
    steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
    failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || "Unknown error" }
  });
  if (summary) {
    db.updateRun(run.id, { summary });
    console.log();
    console.log(import_chalk.default.yellow("  AI Analysis:"));
    console.log(import_chalk.default.white("  " + summary.split("\n").join("\n  ")));
    console.log();
  } else {
    warn("AI analysis failed. Check your ANTHROPIC_API_KEY.");
  }
}
async function runExportFlow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const exportData = {
    version: "1.0.0",
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    flow: {
      name: flow.name,
      description: flow.description,
      appUrl: flow.appUrl,
      graph: JSON.parse(flow.graph)
    }
  };
  const filename = `${flow.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.flow.json`;
  fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
  success(`Exported to ${import_chalk.default.cyan(filename)}`);
  console.log();
}
async function runImportFlow(filepath) {
  if (!fs.existsSync(filepath)) {
    errorMsg("File not found: " + filepath);
    process.exit(1);
  }
  let exportData;
  try {
    exportData = JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    errorMsg("Invalid JSON file");
    process.exit(1);
    return;
  }
  const { flow } = exportData;
  const created = db.createFlow({ name: flow.name, description: flow.description, appUrl: flow.appUrl, graph: flow.graph });
  success(`Imported flow: ${import_chalk.default.white(flow.name)}`);
  info("ID: " + import_chalk.default.gray(created.id.slice(0, 8)));
  console.log();
}
async function runStatus() {
  printLogo();
  divider();
  const flows = db.listFlows();
  const runs = db.listRuns(void 0, 100);
  const passed = runs.filter((r) => r.status === "passed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  console.log(import_chalk.default.bold("\n  Statistics\n"));
  console.log("  " + import_chalk.default.gray("Flows:        ") + import_chalk.default.white(flows.length.toString()));
  console.log("  " + import_chalk.default.gray("Total Runs:   ") + import_chalk.default.white(runs.length.toString()));
  console.log("  " + import_chalk.default.gray("Passed:       ") + import_chalk.default.green(passed.toString()));
  console.log("  " + import_chalk.default.gray("Failed:       ") + import_chalk.default.red(failed.toString()));
  if (runs.length > 0) {
    const rate = Math.round(passed / runs.length * 100);
    const rateColor = rate >= 80 ? import_chalk.default.green : rate >= 50 ? import_chalk.default.yellow : import_chalk.default.red;
    console.log("  " + import_chalk.default.gray("Success Rate: ") + rateColor(`${rate}%`));
  }
  console.log();
  console.log("  " + import_chalk.default.gray("Data Path:    ") + import_chalk.default.white(DATA_PATH));
  const aiStatus = process.env.ANTHROPIC_API_KEY ? import_chalk.default.green("enabled") : import_chalk.default.gray("disabled (set ANTHROPIC_API_KEY)");
  console.log("  " + import_chalk.default.gray("AI Analysis:  ") + aiStatus);
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
    const pad = 32;
    console.log("  " + import_chalk.default.cyan("init").padEnd(pad) + import_chalk.default.gray("Initialize Flowmind"));
    console.log("  " + import_chalk.default.cyan("learn <url> [name]").padEnd(pad) + import_chalk.default.gray("Record a flow (real browser capture)"));
    console.log("  " + import_chalk.default.cyan("run <id|name>").padEnd(pad) + import_chalk.default.gray("Execute a flow"));
    console.log("  " + import_chalk.default.cyan("flow:list").padEnd(pad) + import_chalk.default.gray("List all flows"));
    console.log("  " + import_chalk.default.cyan("flow:delete <id|name>").padEnd(pad) + import_chalk.default.gray("Delete a flow"));
    console.log("  " + import_chalk.default.cyan("flow:export <id|name>").padEnd(pad) + import_chalk.default.gray("Export flow to JSON file"));
    console.log("  " + import_chalk.default.cyan("flow:import <file>").padEnd(pad) + import_chalk.default.gray("Import flow from JSON file"));
    console.log("  " + import_chalk.default.cyan("run:list").padEnd(pad) + import_chalk.default.gray("List recent runs"));
    console.log("  " + import_chalk.default.cyan("run:show <id>").padEnd(pad) + import_chalk.default.gray("Show run details + screenshots"));
    console.log("  " + import_chalk.default.cyan("run:analyze <id>").padEnd(pad) + import_chalk.default.gray("AI analysis of a failed run"));
    console.log("  " + import_chalk.default.cyan("status").padEnd(pad) + import_chalk.default.gray("Statistics and system info"));
    console.log();
    console.log("  " + import_chalk.default.gray("Set ANTHROPIC_API_KEY to enable AI failure analysis"));
    console.log();
    process.exit(0);
  }
  switch (cmd) {
    case "init":
      await runInit();
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
  db.close();
}
main().catch((err) => {
  errorMsg(String(err));
  process.exit(1);
});
