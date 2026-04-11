#!/usr/bin/env node

/**
 * Flowmind CLI - Memory-driven Web Automation
 *
 * Records real browser interactions, replays flows with Playwright,
 * detects failures, sanitizes PII, and summarizes issues with AI.
 */

import { chromium } from 'playwright';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_PATH = path.join(HOME_DIR, '.flowmind');
const DB_PATH = path.join(DATA_PATH, 'data', 'flowmind.db');

// ============================================
// DATABASE
// ============================================

class DatabaseManager {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(path.join(DATA_PATH, 'data'), { recursive: true });
    fs.mkdirSync(path.join(DATA_PATH, 'screenshots'), { recursive: true });
    this.db = new Database(DB_PATH);
    this.initialize();
  }

  private initialize() {
    this.db.pragma('foreign_keys = ON');
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

  createFlow(data: { name: string; description?: string; appUrl?: string; graph?: object }) {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, data.name, data.description || null, data.appUrl || null, JSON.stringify(data.graph || {}), now, now);
    return this.getFlow(id)!;
  }

  getFlow(id: string) {
    const row = this.db.prepare('SELECT * FROM flows WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapFlow(row) : null;
  }

  findFlowByPartialId(partialId: string) {
    const rows = this.db.prepare('SELECT * FROM flows WHERE id LIKE ?').all(partialId + '%') as Record<string, unknown>[];
    if (rows.length !== 1) return null;
    return this.mapFlow(rows[0]);
  }

  findFlowByName(name: string) {
    const rows = this.db.prepare('SELECT * FROM flows WHERE LOWER(name) LIKE ?').all(`%${name.toLowerCase()}%`) as Record<string, unknown>[];
    if (rows.length !== 1) return null;
    return this.mapFlow(rows[0]);
  }

  listFlows() {
    return (this.db.prepare('SELECT * FROM flows ORDER BY updated_at DESC').all() as Record<string, unknown>[]).map(r => this.mapFlow(r));
  }

  updateFlow(id: string, data: Partial<{ name: string; description: string; appUrl: string; graph: object }>) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
    if (data.appUrl !== undefined) { updates.push('app_url = ?'); values.push(data.appUrl); }
    if (data.graph !== undefined) { updates.push('graph = ?'); values.push(JSON.stringify(data.graph)); }
    updates.push("updated_at = datetime('now')");
    values.push(id);
    this.db.prepare(`UPDATE flows SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getFlow(id);
  }

  deleteFlow(id: string) {
    return this.db.prepare('DELETE FROM flows WHERE id = ?').run(id).changes > 0;
  }

  private mapFlow(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      appUrl: row.app_url as string | null,
      graph: row.graph as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  createRun(flowId: string) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO runs (id, flow_id, status, started_at) VALUES (?, ?, 'running', datetime('now'))`).run(id, flowId);
    return this.getRun(id)!;
  }

  getRun(id: string) {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRun(row) : null;
  }

  findRunByPartialId(partialId: string) {
    const rows = this.db.prepare('SELECT * FROM runs WHERE id LIKE ?').all(partialId + '%') as Record<string, unknown>[];
    if (rows.length !== 1) return null;
    return this.mapRun(rows[0]);
  }

  listRuns(flowId?: string, limit = 50) {
    const sql = flowId
      ? 'SELECT * FROM runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT ?'
      : 'SELECT * FROM runs ORDER BY started_at DESC LIMIT ?';
    const params = flowId ? [flowId, limit] : [limit];
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => this.mapRun(r));
  }

  updateRun(id: string, data: Partial<{ status: string; completedAt: Date; duration: number; errorMessage: string; summary: string }>) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.completedAt !== undefined) { updates.push('completed_at = ?'); values.push(data.completedAt.toISOString()); }
    if (data.duration !== undefined) { updates.push('duration = ?'); values.push(data.duration); }
    if (data.errorMessage !== undefined) { updates.push('error_message = ?'); values.push(data.errorMessage); }
    if (data.summary !== undefined) { updates.push('summary = ?'); values.push(data.summary); }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE runs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getRun(id);
  }

  createStep(data: { runId: string; stepNumber: number; name: string; action: string; selector?: string; value?: string }) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO steps (id, run_id, step_number, name, action, selector, value, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .run(id, data.runId, data.stepNumber, data.name, data.action, data.selector || null, data.value || null);
    return this.getStep(id)!;
  }

  getStep(id: string) {
    const row = this.db.prepare('SELECT * FROM steps WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapStep(row) : null;
  }

  listSteps(runId: string) {
    return (this.db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY step_number').all(runId) as Record<string, unknown>[]).map(r => this.mapStep(r));
  }

  updateStep(id: string, data: Partial<{ status: string; duration: number; errorMessage: string; screenshotPath: string }>) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.duration !== undefined) { updates.push('duration = ?'); values.push(data.duration); }
    if (data.errorMessage !== undefined) { updates.push('error_message = ?'); values.push(data.errorMessage); }
    if (data.screenshotPath !== undefined) { updates.push('screenshot_path = ?'); values.push(data.screenshotPath); }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE steps SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getStep(id);
  }

  private mapRun(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      flowId: row.flow_id as string,
      status: row.status as string,
      startedAt: new Date(row.started_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
      duration: row.duration as number | null,
      errorMessage: row.error_message as string | null,
      summary: row.summary as string | null,
    };
  }

  private mapStep(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      stepNumber: row.step_number as number,
      name: row.name as string,
      action: row.action as string,
      selector: row.selector as string | null,
      value: row.value as string | null,
      status: row.status as string,
      duration: row.duration as number | null,
      errorMessage: row.error_message as string | null,
      screenshotPath: row.screenshot_path as string | null,
    };
  }

  getScreenshotsPath(runId: string) {
    const dir = path.join(DATA_PATH, 'screenshots', runId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  close() { this.db.close(); }
}

// ============================================
// PII SANITIZER
// ============================================

function sanitizePII(text: string): string {
  if (!text) return text;
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  text = text.replace(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
  text = text.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]');
  text = text.replace(/(api[_-]?key|apikey|api_secret)["\s:=]+["']?[a-zA-Z0-9_-]{20,}["']?/gi, 'API_KEY=[TOKEN]');
  text = text.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[JWT]');
  text = text.replace(/\b(?:password|passwd|pwd)\s*[:=]\s*\S+/gi, 'password=[REDACTED]');
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  return text;
}

// ============================================
// AI SUMMARIZATION
// ============================================

async function summarizeFailureWithAI(context: {
  flowName: string;
  steps: Array<{ stepNumber: number; name: string; action: string; selector?: string | null; status: string; errorMessage?: string | null }>;
  failedStep: { name: string; action: string; selector?: string | null; errorMessage: string };
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    // Dynamically import to avoid hard dep if not installed
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });

    const stepsSummary = context.steps.map(s =>
      `  Step ${s.stepNumber} [${s.status}]: ${s.name} (${s.action}${s.selector ? ` on "${s.selector}"` : ''})`
    ).join('\n');

    const prompt = `A web automation flow named "${context.flowName}" failed during execution.

Steps executed:
${stepsSummary}

Failed step: "${context.failedStep.name}"
Action: ${context.failedStep.action}${context.failedStep.selector ? ` on selector "${context.failedStep.selector}"` : ''}
Error: ${context.failedStep.errorMessage}

In 2-3 sentences, explain what likely went wrong and suggest how to fix it. Be specific and practical. Focus on actionable advice.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    return content.type === 'text' ? content.text : null;
  } catch {
    return null;
  }
}

// ============================================
// CLI HELPERS
// ============================================

function printLogo() {
  console.log(chalk.cyan(`
  ╔═══════════════════════════════════════════╗
  ║                                           ║
  ║   ███████╗██╗      ██████╗ ██╗    ██╗     ║
  ║   ██╔════╝██║     ██╔═══██╗██║    ██║     ║
  ║   █████╗  ██║     ██║   ██║██║ █╗ ██║     ║
  ║   ██╔══╝  ██║     ██║   ██║██║███╗██║     ║
  ║   ██║     ███████╗╚██████╔╝╚███╔███╔╝     ║
  ║   ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝      ║
  ║                                           ║
  ║   Memory-driven Web Automation            ║
  ╚═══════════════════════════════════════════╝
  `));
}

function info(msg: string) { console.log(chalk.blue('  → ') + msg); }
function success(msg: string) { console.log(chalk.green('  ✓ ') + msg); }
function errorMsg(msg: string) { console.log(chalk.red('  ✗ ') + msg); }
function warn(msg: string) { console.log(chalk.yellow('  ⚠ ') + msg); }
function divider() { console.log(chalk.cyan('─'.repeat(60))); }

function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer: string) => { rl.close(); resolve(answer.trim()); });
  });
}

function waitForDone(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(chalk.gray('\n  Press ENTER or type "done" to finish recording:\n'));
    rl.on('line', (line) => {
      const cmd = line.trim().toLowerCase();
      if (cmd === '' || cmd === 'done' || cmd === 'stop' || cmd === 'finish') {
        rl.close();
        resolve();
      }
    });
    rl.on('close', () => resolve());
  });
}

// ============================================
// COMMANDS
// ============================================

async function runInit() {
  printLogo();
  divider();
  success('Initialized at ' + chalk.white(DATA_PATH));
  console.log();
  info('Run ' + chalk.cyan('node flowmind.ts learn <url>') + ' to start recording');
  console.log();
}

// Browser-side selector generation script (injected as string to avoid TS/ESM issues)
const RECORDER_SCRIPT = `
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
    // button/anchor text — use innerText to capture text inside child spans too
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

interface RecordedAction {
  type: string;
  selector?: string;
  value?: string;
  url?: string;
  label?: string;
  timestamp: number;
}

async function runLearn(url: string) {
  printLogo();
  divider();

  let flowName = args[2];
  if (!flowName) {
    console.log(chalk.cyan('\n  Enter flow name: '));
    flowName = await askQuestion('  > ');
  }
  if (!flowName) { errorMsg('Flow name required'); process.exit(1); }

  info('Target URL: ' + chalk.cyan(url));
  info('Flow name: ' + chalk.cyan(flowName));
  console.log();

  const flow = db.createFlow({ name: flowName, appUrl: url });

  const capturedActions: RecordedAction[] = [];
  let browserClosed = false;

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Expose the recorder function BEFORE any navigation
  await page.exposeFunction('__flowmindRecord', (action: RecordedAction) => {
    // Deduplicate: skip fill events that are identical to the last one within 500ms
    const last = capturedActions[capturedActions.length - 1];
    if (last && last.type === action.type && last.selector === action.selector && Date.now() - last.timestamp < 500) return;

    const sanitizedAction = { ...action, value: action.value ? sanitizePII(action.value) : action.value };
    capturedActions.push(sanitizedAction);

    // Pretty print the captured action
    const icons: Record<string, string> = { click: '🖱 ', fill: '⌨️ ', select: '📋', navigate: '🌐', check: '☑️ ' };
    const icon = icons[action.type] || '●';
    let label = '';
    if (action.type === 'click') label = `click ${action.label ? chalk.white(`"${action.label}"`) : ''} ${chalk.gray(action.selector)}`;
    else if (action.type === 'fill') label = `fill ${chalk.gray(action.selector)} = ${chalk.yellow(`"${sanitizedAction.value?.slice(0, 30)}"`)}`;
    else if (action.type === 'select') label = `select ${chalk.gray(action.selector)} → ${chalk.yellow(action.value)}`;
    else if (action.type === 'navigate') label = `navigate → ${chalk.cyan(action.url)}`;
    else if (action.type === 'check') label = `check ${chalk.gray(action.selector)} (${action.value})`;
    else label = `${action.type} ${action.selector}`;

    process.stdout.write(`  ${chalk.green(icon)} ${label}\n`);
  });

  // Inject recorder script on every page load
  await page.addInitScript(RECORDER_SCRIPT);

  // Track navigations
  let lastNavTime = 0;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const navUrl = frame.url();
    if (navUrl === 'about:blank' || navUrl === url) return;

    const now = Date.now();
    const lastAction = capturedActions[capturedActions.length - 1];
    // Suppress nav events within 1.5s of a click (likely triggered by that click)
    if (lastAction && lastAction.type === 'click' && now - lastAction.timestamp < 1500) return;
    if (now - lastNavTime < 300) return;
    lastNavTime = now;

    capturedActions.push({ type: 'navigate', url: navUrl, timestamp: now });
    process.stdout.write(`  ${chalk.green('🌐')} navigate → ${chalk.cyan(navUrl)}\n`);
  });

  browser.on('disconnected', () => { browserClosed = true; });

  console.log(chalk.bold('  Browser is open — interact with it normally.\n'));
  console.log(chalk.gray('  Every click, fill, and navigation is captured automatically.\n'));

  await page.goto(url);

  // Wait for "done" or browser close
  if (!browserClosed) {
    await waitForDone().catch(() => {});
  }

  if (!browserClosed) await browser.close();

  if (capturedActions.length === 0) {
    warn('No actions captured. Flow not saved.');
    db.deleteFlow(flow.id);
    process.exit(0);
  }

  // Build graph from captured actions
  const nodes: object[] = [{ id: 'start', type: 'start', label: 'Start', url }];
  const edges: object[] = [];
  let prevId = 'start';

  capturedActions.forEach((action, i) => {
    const nodeId = `step-${i + 1}`;
    let node: Record<string, unknown>;

    if (action.type === 'navigate') {
      node = { id: nodeId, type: 'action', label: `Navigate to ${action.url}`, action: 'navigate', url: action.url };
    } else if (action.type === 'click') {
      const label = action.label ? `Click "${action.label}"` : `Click ${action.selector}`;
      node = { id: nodeId, type: 'action', label, action: 'click', selector: action.selector };
    } else if (action.type === 'fill') {
      node = { id: nodeId, type: 'action', label: `Fill ${action.selector}`, action: 'fill', selector: action.selector, value: action.value };
    } else if (action.type === 'select') {
      node = { id: nodeId, type: 'action', label: `Select ${action.value} in ${action.selector}`, action: 'select', selector: action.selector, value: action.value };
    } else if (action.type === 'check') {
      node = { id: nodeId, type: 'action', label: `${action.value === 'true' ? 'Check' : 'Uncheck'} ${action.selector}`, action: 'check', selector: action.selector, value: action.value };
    } else {
      return;
    }

    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });

  nodes.push({ id: 'end', type: 'end', label: 'End' });
  edges.push({ id: `e${capturedActions.length}`, source: prevId, target: 'end' });

  db.updateFlow(flow.id, { graph: { nodes, edges, appUrl: url } });

  divider();
  console.log(chalk.bold('\n  Recording Complete\n'));
  success(`${capturedActions.length} actions recorded`);
  const actionCounts = capturedActions.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {} as Record<string, number>);
  Object.entries(actionCounts).forEach(([type, count]) => info(`  ${type}: ${count}`));
  console.log();
  info('Run with: ' + chalk.green(`node flowmind.ts run ${flow.id.slice(0, 8)}`));
  console.log();
}

async function runFlow(id: string) {
  printLogo();
  divider();

  // Support lookup by name or partial ID
  let flow = db.findFlowByPartialId(id);
  if (!flow) flow = db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }

  console.log(chalk.bold('\n  Running: ') + chalk.white(flow.name) + '\n');

  let graph: { nodes: Record<string, unknown>[]; edges: object[]; appUrl?: string };
  try { graph = JSON.parse(flow.graph); } catch { errorMsg('Invalid graph'); process.exit(1); return; }

  if (!graph.nodes || graph.nodes.length === 0) { warn('Empty flow — nothing to run.'); return; }

  const run = db.createRun(flow.id);
  const screenshotsDir = db.getScreenshotsPath(run.id);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const actionNodes = graph.nodes.filter(n => n.type === 'action') as Array<Record<string, unknown>>;
  let stepNum = 1;
  let failed = false;
  let failedStepInfo: { name: string; action: string; selector?: string | null; errorMessage: string } | null = null;

  const runStart = Date.now();

  for (const node of actionNodes) {
    const label = node.label as string;
    const action = node.action as string;
    console.log(chalk.cyan(`\n  [${stepNum}/${actionNodes.length}] ${label}`));

    const step = db.createStep({
      runId: run.id,
      stepNumber: stepNum,
      name: label,
      action,
      selector: node.selector as string | undefined,
      value: node.value as string | undefined,
    });

    const t = Date.now();
    try {
      switch (action) {
        case 'navigate':
          await page.goto((node.url || node.value) as string, { waitUntil: 'domcontentloaded', timeout: 15000 });
          break;
        case 'click':
          await page.click(node.selector as string, { timeout: 10000 });
          break;
        case 'fill':
          await page.fill(node.selector as string, sanitizePII((node.value as string) || ''), { timeout: 10000 });
          break;
        case 'select':
          await page.selectOption(node.selector as string, (node.value as string) || '', { timeout: 10000 });
          break;
        case 'check':
          if (node.value === 'true') await page.check(node.selector as string, { timeout: 10000 });
          else await page.uncheck(node.selector as string, { timeout: 10000 });
          break;
        case 'wait':
          await page.waitForSelector(node.selector as string, { timeout: 10000 });
          break;
        case 'press':
          await page.press(node.selector as string, (node.value as string) || 'Enter');
          break;
      }

      const duration = Date.now() - t;
      const screenshot = await page.screenshot();
      const screenshotPath = path.join(screenshotsDir, `step-${stepNum}.png`);
      fs.writeFileSync(screenshotPath, screenshot);
      db.updateStep(step.id, { status: 'passed', duration, screenshotPath });
      console.log(chalk.green(`      ✓ passed (${duration}ms)`));

    } catch (err) {
      const duration = Date.now() - t;
      const errorMessage = err instanceof Error ? err.message.split('\n')[0] : String(err);
      try {
        const screenshot = await page.screenshot();
        const screenshotPath = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
        fs.writeFileSync(screenshotPath, screenshot);
        db.updateStep(step.id, { status: 'failed', duration, errorMessage, screenshotPath });
      } catch {
        db.updateStep(step.id, { status: 'failed', duration, errorMessage });
      }
      console.log(chalk.red(`      ✗ failed (${duration}ms)`));
      console.log(chalk.red(`        └─ ${errorMessage}`));
      failedStepInfo = { name: label, action, selector: node.selector as string | null, errorMessage };
      failed = true;
      break;
    }
    stepNum++;
  }

  await browser.close();

  const totalDuration = Date.now() - runStart;

  // AI summarization if key available
  let summary: string | null = null;
  if (failed && failedStepInfo) {
    const steps = db.listSteps(run.id);
    process.stdout.write(chalk.gray('\n  Analyzing failure...\n'));
    summary = await summarizeFailureWithAI({
      flowName: flow.name,
      steps: steps.map(s => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
      failedStep: failedStepInfo,
    });
  }

  db.updateRun(run.id, {
    status: failed ? 'failed' : 'passed',
    completedAt: new Date(),
    duration: totalDuration,
    errorMessage: failedStepInfo?.errorMessage,
    summary: summary || undefined,
  });

  divider();
  if (failed) {
    errorMsg('Flow failed');
    if (summary) {
      console.log();
      console.log(chalk.yellow('  AI Analysis:'));
      console.log(chalk.white('  ' + summary.split('\n').join('\n  ')));
    }
  } else {
    success(`Flow passed! (${totalDuration}ms)`);
  }
  console.log();
  info('Run ID: ' + chalk.gray(run.id.slice(0, 8)));
  info('Screenshots: ' + chalk.cyan(screenshotsDir));
  console.log();
}

async function runListFlows() {
  const flows = db.listFlows();
  console.log(chalk.bold('\n  Your Flows\n'));
  if (flows.length === 0) {
    warn('No flows. Create one: ' + chalk.cyan('node flowmind.ts learn <url>'));
    console.log();
    return;
  }
  console.log(chalk.gray('  ID        Name                          Steps  Updated'));
  console.log(chalk.gray('  ' + '─'.repeat(62)));
  for (const flow of flows) {
    let nodeCount = 0;
    try { nodeCount = (JSON.parse(flow.graph).nodes?.filter((n: Record<string,unknown>) => n.type === 'action').length) || 0; } catch {}
    const id = flow.id.slice(0, 8);
    const name = flow.name.padEnd(28).slice(0, 28);
    const steps = nodeCount.toString().padEnd(6);
    const updated = flow.updatedAt.toLocaleDateString();
    console.log(`  ${chalk.gray(id)} ${chalk.white(name)} ${chalk.gray(steps)} ${chalk.gray(updated)}`);
  }
  console.log();
}

async function runDeleteFlow(id: string) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }

  const confirm = await askQuestion(`  Delete flow "${chalk.yellow(flow.name)}"? (y/N) `);
  if (confirm.toLowerCase() !== 'y') { warn('Cancelled'); return; }

  db.deleteFlow(flow.id);
  success(`Deleted flow: ${flow.name}`);
  console.log();
}

async function runListRuns() {
  const runs = db.listRuns(undefined, 20);
  console.log(chalk.bold('\n  Recent Runs\n'));
  if (runs.length === 0) { warn('No runs yet.'); console.log(); return; }

  console.log(chalk.gray('  ID        Flow                           Status       Duration'));
  console.log(chalk.gray('  ' + '─'.repeat(72)));
  for (const run of runs) {
    const flow = db.getFlow(run.flowId);
    const flowName = (flow?.name || 'Unknown').padEnd(28).slice(0, 28);
    const id = run.id.slice(0, 8);
    const statusPad = run.status.padEnd(12);
    const duration = run.duration ? `${run.duration}ms` : '-';
    const statusColor = run.status === 'passed' ? chalk.green : run.status === 'failed' ? chalk.red : chalk.yellow;
    console.log(`  ${chalk.gray(id)} ${chalk.white(flowName)} ${statusColor(statusPad)} ${chalk.gray(duration)}`);
  }
  console.log();
}

async function runShowRun(id: string) {
  const run = db.findRunByPartialId(id);
  if (!run) { errorMsg('Run not found: ' + id); process.exit(1); }

  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);

  console.log(chalk.bold(`\n  Run: ${run.id.slice(0, 8)}\n`));
  const border = '─'.repeat(56);
  const statusColor = run.status === 'passed' ? chalk.green : run.status === 'failed' ? chalk.red : chalk.yellow;
  console.log(chalk.gray(`  ┌${border}┐`));
  console.log(chalk.gray('  │ ') + `Flow:     ${(flow?.name || 'Unknown').padEnd(44)}` + chalk.gray('│'));
  console.log(chalk.gray('  │ ') + `Status:   ${statusColor(run.status).padEnd(53)}` + chalk.gray('│'));
  console.log(chalk.gray('  │ ') + `Duration: ${(run.duration ? `${run.duration}ms` : '-').padEnd(44)}` + chalk.gray('│'));
  console.log(chalk.gray(`  └${border}┘`));

  if (run.summary) {
    console.log();
    console.log(chalk.yellow('  AI Analysis:'));
    console.log(chalk.white('  ' + run.summary.split('\n').join('\n  ')));
  }

  console.log(chalk.bold('\n  Steps\n'));
  for (const step of steps) {
    const icon = step.status === 'passed' ? chalk.green('✓') : step.status === 'failed' ? chalk.red('✗') : chalk.gray('○');
    const duration = step.duration ? chalk.gray(`${step.duration}ms`) : '';
    console.log(`    ${chalk.gray(step.stepNumber.toString().padStart(2))}  ${icon}  ${chalk.white(step.name)} ${duration}`);
    if (step.status === 'failed' && step.errorMessage) {
      console.log(`         ${chalk.red('└─ ' + step.errorMessage.slice(0, 80))}`);
    }
    if (step.screenshotPath) {
      console.log(`         ${chalk.gray('📷 ' + step.screenshotPath)}`);
    }
  }
  console.log();
}

async function runAnalyzeRun(id: string) {
  const run = db.findRunByPartialId(id);
  if (!run) { errorMsg('Run not found: ' + id); process.exit(1); }

  if (!process.env.ANTHROPIC_API_KEY) {
    warn('ANTHROPIC_API_KEY not set. Set it to enable AI analysis.');
    console.log('  ' + chalk.gray('export ANTHROPIC_API_KEY=your_key_here'));
    process.exit(1);
  }

  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const failedStep = steps.find(s => s.status === 'failed');

  if (!failedStep) {
    info('Run passed — no failures to analyze.');
    return;
  }

  info('Analyzing failure with AI...');
  const summary = await summarizeFailureWithAI({
    flowName: flow?.name || 'Unknown flow',
    steps: steps.map(s => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
    failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || 'Unknown error' },
  });

  if (summary) {
    db.updateRun(run.id, { summary });
    console.log();
    console.log(chalk.yellow('  AI Analysis:'));
    console.log(chalk.white('  ' + summary.split('\n').join('\n  ')));
    console.log();
  } else {
    warn('AI analysis failed. Check your ANTHROPIC_API_KEY.');
  }
}

async function runExportFlow(id: string) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }

  const exportData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    flow: {
      name: flow.name,
      description: flow.description,
      appUrl: flow.appUrl,
      graph: JSON.parse(flow.graph),
    },
  };

  const filename = `${flow.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.flow.json`;
  fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
  success(`Exported to ${chalk.cyan(filename)}`);
  console.log();
}

async function runImportFlow(filepath: string) {
  if (!fs.existsSync(filepath)) { errorMsg('File not found: ' + filepath); process.exit(1); }

  let exportData: { flow: { name: string; description?: string; appUrl?: string; graph: object } };
  try {
    exportData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {
    errorMsg('Invalid JSON file');
    process.exit(1);
    return;
  }

  const { flow } = exportData;
  const created = db.createFlow({ name: flow.name, description: flow.description, appUrl: flow.appUrl, graph: flow.graph });
  success(`Imported flow: ${chalk.white(flow.name)}`);
  info('ID: ' + chalk.gray(created.id.slice(0, 8)));
  console.log();
}

async function runStatus() {
  printLogo();
  divider();
  const flows = db.listFlows();
  const runs = db.listRuns(undefined, 100);
  const passed = runs.filter(r => r.status === 'passed').length;
  const failed = runs.filter(r => r.status === 'failed').length;

  console.log(chalk.bold('\n  Statistics\n'));
  console.log('  ' + chalk.gray('Flows:        ') + chalk.white(flows.length.toString()));
  console.log('  ' + chalk.gray('Total Runs:   ') + chalk.white(runs.length.toString()));
  console.log('  ' + chalk.gray('Passed:       ') + chalk.green(passed.toString()));
  console.log('  ' + chalk.gray('Failed:       ') + chalk.red(failed.toString()));
  if (runs.length > 0) {
    const rate = Math.round((passed / runs.length) * 100);
    const rateColor = rate >= 80 ? chalk.green : rate >= 50 ? chalk.yellow : chalk.red;
    console.log('  ' + chalk.gray('Success Rate: ') + rateColor(`${rate}%`));
  }
  console.log();
  console.log('  ' + chalk.gray('Data Path:    ') + chalk.white(DATA_PATH));
  const aiStatus = process.env.ANTHROPIC_API_KEY ? chalk.green('enabled') : chalk.gray('disabled (set ANTHROPIC_API_KEY)');
  console.log('  ' + chalk.gray('AI Analysis:  ') + aiStatus);
  console.log();
}

// ============================================
// MAIN
// ============================================

const args = process.argv.slice(2);
const cmd = args[0];
const db = new DatabaseManager();

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printLogo();
    divider();
    console.log();
    console.log(chalk.bold('  Commands\n'));
    const pad = 32;
    console.log('  ' + chalk.cyan('init').padEnd(pad) + chalk.gray('Initialize Flowmind'));
    console.log('  ' + chalk.cyan('learn <url> [name]').padEnd(pad) + chalk.gray('Record a flow (real browser capture)'));
    console.log('  ' + chalk.cyan('run <id|name>').padEnd(pad) + chalk.gray('Execute a flow'));
    console.log('  ' + chalk.cyan('flow:list').padEnd(pad) + chalk.gray('List all flows'));
    console.log('  ' + chalk.cyan('flow:delete <id|name>').padEnd(pad) + chalk.gray('Delete a flow'));
    console.log('  ' + chalk.cyan('flow:export <id|name>').padEnd(pad) + chalk.gray('Export flow to JSON file'));
    console.log('  ' + chalk.cyan('flow:import <file>').padEnd(pad) + chalk.gray('Import flow from JSON file'));
    console.log('  ' + chalk.cyan('run:list').padEnd(pad) + chalk.gray('List recent runs'));
    console.log('  ' + chalk.cyan('run:show <id>').padEnd(pad) + chalk.gray('Show run details + screenshots'));
    console.log('  ' + chalk.cyan('run:analyze <id>').padEnd(pad) + chalk.gray('AI analysis of a failed run'));
    console.log('  ' + chalk.cyan('status').padEnd(pad) + chalk.gray('Statistics and system info'));
    console.log();
    console.log('  ' + chalk.gray('Set ANTHROPIC_API_KEY to enable AI failure analysis'));
    console.log();
    process.exit(0);
  }

  switch (cmd) {
    case 'init':            await runInit(); break;
    case 'learn':
      if (!args[1]) { errorMsg('URL required'); process.exit(1); }
      await runLearn(args[1]); break;
    case 'run':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runFlow(args[1]); break;
    case 'flow:list':       await runListFlows(); break;
    case 'flow:delete':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runDeleteFlow(args[1]); break;
    case 'flow:export':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runExportFlow(args[1]); break;
    case 'flow:import':
      if (!args[1]) { errorMsg('File path required'); process.exit(1); }
      await runImportFlow(args[1]); break;
    case 'run:list':        await runListRuns(); break;
    case 'run:show':
      if (!args[1]) { errorMsg('Run ID required'); process.exit(1); }
      await runShowRun(args[1]); break;
    case 'run:analyze':
      if (!args[1]) { errorMsg('Run ID required'); process.exit(1); }
      await runAnalyzeRun(args[1]); break;
    case 'status':          await runStatus(); break;
    default:
      errorMsg('Unknown command: ' + cmd);
      console.log('  Run without args for help.');
      process.exit(1);
  }

  db.close();
}

main().catch(err => { errorMsg(String(err)); process.exit(1); });
