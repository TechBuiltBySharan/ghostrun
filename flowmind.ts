#!/usr/bin/env node

/**
 * Flowmind CLI — Memory-driven Web Automation
 * v0.3.0
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
      CREATE TABLE IF NOT EXISTS explore_reports (
        id TEXT PRIMARY KEY, url TEXT NOT NULL, environment TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        report_path TEXT
      );
      CREATE TABLE IF NOT EXISTS explore_candidates (
        id TEXT PRIMARY KEY, report_id TEXT NOT NULL,
        name TEXT NOT NULL, description TEXT, route TEXT NOT NULL,
        screenshot_path TEXT, graph TEXT NOT NULL DEFAULT '{}',
        confirmed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (report_id) REFERENCES explore_reports(id) ON DELETE CASCADE
      );
    `);
  }

  // ---- Flows ----
  createFlow(data: { name: string; description?: string; appUrl?: string; graph?: object }) {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, data.name, data.description || null, data.appUrl || null, JSON.stringify(data.graph || {}), now, now);
    return this.getFlow(id)!;
  }
  getFlow(id: string) {
    const r = this.db.prepare('SELECT * FROM flows WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.mapFlow(r) : null;
  }
  findFlowByPartialId(q: string) {
    const rows = this.db.prepare('SELECT * FROM flows WHERE id LIKE ?').all(q + '%') as Record<string, unknown>[];
    return rows.length === 1 ? this.mapFlow(rows[0]) : null;
  }
  findFlowByName(name: string) {
    const rows = this.db.prepare('SELECT * FROM flows WHERE LOWER(name) LIKE ?').all(`%${name.toLowerCase()}%`) as Record<string, unknown>[];
    return rows.length === 1 ? this.mapFlow(rows[0]) : null;
  }
  listFlows() {
    return (this.db.prepare('SELECT * FROM flows ORDER BY updated_at DESC').all() as Record<string, unknown>[]).map(r => this.mapFlow(r));
  }
  updateFlow(id: string, data: Partial<{ name: string; description: string; appUrl: string; graph: object }>) {
    const updates: string[] = []; const values: unknown[] = [];
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
    if (data.appUrl !== undefined) { updates.push('app_url = ?'); values.push(data.appUrl); }
    if (data.graph !== undefined) { updates.push('graph = ?'); values.push(JSON.stringify(data.graph)); }
    updates.push("updated_at = datetime('now')"); values.push(id);
    this.db.prepare(`UPDATE flows SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getFlow(id);
  }
  deleteFlow(id: string) { return this.db.prepare('DELETE FROM flows WHERE id = ?').run(id).changes > 0; }
  private mapFlow(r: Record<string, unknown>) {
    return { id: r.id as string, name: r.name as string, description: r.description as string | null,
      appUrl: r.app_url as string | null, graph: r.graph as string,
      createdAt: new Date(r.created_at as string), updatedAt: new Date(r.updated_at as string) };
  }

  // ---- Runs ----
  createRun(flowId: string) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO runs (id, flow_id, status, started_at) VALUES (?, ?, 'running', datetime('now'))`).run(id, flowId);
    return this.getRun(id)!;
  }
  getRun(id: string) {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.mapRun(r) : null;
  }
  findRunByPartialId(q: string) {
    const rows = this.db.prepare('SELECT * FROM runs WHERE id LIKE ?').all(q + '%') as Record<string, unknown>[];
    return rows.length === 1 ? this.mapRun(rows[0]) : null;
  }
  listRuns(flowId?: string, limit = 50) {
    const sql = flowId ? 'SELECT * FROM runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT ?' : 'SELECT * FROM runs ORDER BY started_at DESC LIMIT ?';
    const params = flowId ? [flowId, limit] : [limit];
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => this.mapRun(r));
  }
  updateRun(id: string, data: Partial<{ status: string; completedAt: Date; duration: number; errorMessage: string; summary: string }>) {
    const updates: string[] = []; const values: unknown[] = [];
    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.completedAt !== undefined) { updates.push('completed_at = ?'); values.push(data.completedAt.toISOString()); }
    if (data.duration !== undefined) { updates.push('duration = ?'); values.push(data.duration); }
    if (data.errorMessage !== undefined) { updates.push('error_message = ?'); values.push(data.errorMessage); }
    if (data.summary !== undefined) { updates.push('summary = ?'); values.push(data.summary); }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE runs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getRun(id);
  }
  private mapRun(r: Record<string, unknown>) {
    return { id: r.id as string, flowId: r.flow_id as string, status: r.status as string,
      startedAt: new Date(r.started_at as string), completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
      duration: r.duration as number | null, errorMessage: r.error_message as string | null, summary: r.summary as string | null };
  }

  // ---- Steps ----
  createStep(data: { runId: string; stepNumber: number; name: string; action: string; selector?: string; value?: string }) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO steps (id, run_id, step_number, name, action, selector, value, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .run(id, data.runId, data.stepNumber, data.name, data.action, data.selector || null, data.value || null);
    return this.getStep(id)!;
  }
  getStep(id: string) {
    const r = this.db.prepare('SELECT * FROM steps WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.mapStep(r) : null;
  }
  listSteps(runId: string) {
    return (this.db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY step_number').all(runId) as Record<string, unknown>[]).map(r => this.mapStep(r));
  }
  updateStep(id: string, data: Partial<{ status: string; duration: number; errorMessage: string; screenshotPath: string }>) {
    const updates: string[] = []; const values: unknown[] = [];
    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.duration !== undefined) { updates.push('duration = ?'); values.push(data.duration); }
    if (data.errorMessage !== undefined) { updates.push('error_message = ?'); values.push(data.errorMessage); }
    if (data.screenshotPath !== undefined) { updates.push('screenshot_path = ?'); values.push(data.screenshotPath); }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE steps SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getStep(id);
  }
  private mapStep(r: Record<string, unknown>) {
    return { id: r.id as string, runId: r.run_id as string, stepNumber: r.step_number as number,
      name: r.name as string, action: r.action as string, selector: r.selector as string | null,
      value: r.value as string | null, status: r.status as string, duration: r.duration as number | null,
      errorMessage: r.error_message as string | null, screenshotPath: r.screenshot_path as string | null };
  }
  getScreenshotsPath(runId: string) {
    const dir = path.join(DATA_PATH, 'screenshots', runId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ---- Schedules ----
  createSchedule(data: { flowId: string; name: string; cronExpression: string }) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO schedules (id, flow_id, name, cron_expression) VALUES (?, ?, ?, ?)`)
      .run(id, data.flowId, data.name, data.cronExpression);
    return this.getSchedule(id)!;
  }
  getSchedule(id: string) {
    const r = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.mapSchedule(r) : null;
  }
  listSchedules() {
    return (this.db.prepare('SELECT s.*, f.name as flow_name FROM schedules s JOIN flows f ON s.flow_id = f.id ORDER BY s.created_at DESC').all() as Record<string, unknown>[]).map(r => this.mapSchedule(r));
  }
  deleteSchedule(id: string) { return this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id).changes > 0; }
  updateScheduleLastRun(id: string, status: string) {
    this.db.prepare(`UPDATE schedules SET last_run_at = datetime('now'), last_run_status = ? WHERE id = ?`).run(status, id);
  }
  private mapSchedule(r: Record<string, unknown>) {
    return { id: r.id as string, flowId: r.flow_id as string, flowName: r.flow_name as string | undefined,
      name: r.name as string, cronExpression: r.cron_expression as string, enabled: Boolean(r.enabled),
      lastRunAt: r.last_run_at ? new Date(r.last_run_at as string) : null, lastRunStatus: r.last_run_status as string | null };
  }

  // ---- Explore Reports ----
  createExploreReport(url: string, environment: string) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO explore_reports (id, url, environment, status) VALUES (?, ?, ?, 'pending')`).run(id, url, environment);
    return this.getExploreReport(id)!;
  }
  getExploreReport(id: string) {
    const r = this.db.prepare('SELECT * FROM explore_reports WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? { id: r.id as string, url: r.url as string, environment: r.environment as string, status: r.status as string, reportPath: r.report_path as string | null } : null;
  }
  findExploreReportByPartialId(q: string) {
    const rows = this.db.prepare('SELECT * FROM explore_reports WHERE id LIKE ?').all(q + '%') as Record<string, unknown>[];
    if (rows.length !== 1) return null;
    const r = rows[0];
    return { id: r.id as string, url: r.url as string, environment: r.environment as string, status: r.status as string, reportPath: r.report_path as string | null };
  }
  updateExploreReport(id: string, data: { status?: string; reportPath?: string }) {
    const updates: string[] = []; const values: unknown[] = [];
    if (data.status) { updates.push('status = ?'); values.push(data.status); }
    if (data.reportPath) { updates.push('report_path = ?'); values.push(data.reportPath); }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE explore_reports SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  createExploreCandidate(data: { reportId: string; name: string; description: string; route: string; screenshotPath?: string; graph: object }) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO explore_candidates (id, report_id, name, description, route, screenshot_path, graph) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, data.reportId, data.name, data.description, data.route, data.screenshotPath || null, JSON.stringify(data.graph));
    return id;
  }
  listExploreCandidates(reportId: string) {
    return (this.db.prepare('SELECT * FROM explore_candidates WHERE report_id = ? ORDER BY rowid').all(reportId) as Record<string, unknown>[])
      .map(r => ({ id: r.id as string, reportId: r.report_id as string, name: r.name as string, description: r.description as string, route: r.route as string, screenshotPath: r.screenshot_path as string | null, graph: r.graph as string, confirmed: Boolean(r.confirmed) }));
  }
  confirmExploreCandidate(id: string) {
    this.db.prepare('UPDATE explore_candidates SET confirmed = 1 WHERE id = ?').run(id);
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
  text = text.replace(/(api[_-]?key|apikey)["\s:=]+["']?[a-zA-Z0-9_-]{20,}["']?/gi, 'API_KEY=[TOKEN]');
  text = text.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[JWT]');
  text = text.replace(/\b(?:password|passwd|pwd)\s*[:=]\s*\S+/gi, 'password=[REDACTED]');
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  return text;
}

// ============================================
// AI — Ollama-first, Anthropic fallback
// ============================================

async function isOllamaRunning(): Promise<string | null> {
  const baseUrl = process.env.FLOWMIND_OLLAMA_URL || 'http://localhost:11434';
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json() as { models?: Array<{ name: string }> };
    const preferred = process.env.FLOWMIND_OLLAMA_MODEL;
    if (preferred) return preferred;
    // Prefer gemma models, then any available model
    const models = data.models || [];
    const gemma = models.find(m => m.name.startsWith('gemma'));
    return gemma?.name || models[0]?.name || null;
  } catch {
    return null;
  }
}

async function callOllama(prompt: string): Promise<string | null> {
  const baseUrl = process.env.FLOWMIND_OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.FLOWMIND_OLLAMA_MODEL || await isOllamaRunning();
  if (!model) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

async function callAnthropic(prompt: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = msg.content[0];
    return content.type === 'text' ? content.text.trim() : null;
  } catch {
    return null;
  }
}

async function callAI(prompt: string): Promise<{ text: string; provider: string } | null> {
  const provider = process.env.FLOWMIND_AI_PROVIDER; // 'ollama' | 'anthropic' | undefined = auto

  if (provider !== 'anthropic') {
    const result = await callOllama(prompt);
    if (result) return { text: result, provider: process.env.FLOWMIND_OLLAMA_MODEL || 'ollama' };
    if (provider === 'ollama') return null;
  }

  const result = await callAnthropic(prompt);
  if (result) return { text: result, provider: 'claude' };

  return null;
}

function buildFailurePrompt(ctx: {
  flowName: string;
  steps: Array<{ stepNumber: number; name: string; action: string; selector?: string | null; status: string; errorMessage?: string | null }>;
  failedStep: { name: string; action: string; selector?: string | null; errorMessage: string };
}): string {
  const stepsSummary = ctx.steps.map(s =>
    `  Step ${s.stepNumber} [${s.status}]: ${s.name} (${s.action}${s.selector ? ` on "${s.selector}"` : ''})`
  ).join('\n');
  return `A web automation flow named "${ctx.flowName}" failed during a browser test.

Steps run:
${stepsSummary}

Failed step: "${ctx.failedStep.name}"
Action: ${ctx.failedStep.action}${ctx.failedStep.selector ? ` on selector "${ctx.failedStep.selector}"` : ''}
Error: ${ctx.failedStep.errorMessage}

Respond in exactly this format (no extra text):

WHAT FAILED
<one sentence describing which step failed and what it was trying to do>

WHY IT FAILED
<one or two sentences on the likely root cause — selector broken, page changed, timing issue, etc.>

HOW TO FIX IT
<one or two specific, actionable steps the developer can take right now>`;
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
    rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
  });
}

function waitForDone(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(chalk.gray('\n  Press ENTER or type "done" to finish recording:\n'));
    rl.on('line', (line) => {
      if (['', 'done', 'stop', 'finish'].includes(line.trim().toLowerCase())) { rl.close(); resolve(); }
    });
    rl.on('close', () => resolve());
  });
}

// ============================================
// BROWSER RECORDER SCRIPT (injected into pages)
// ============================================

const RECORDER_SCRIPT = `
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

interface RecordedAction {
  type: string; selector?: string; value?: string; url?: string; label?: string; timestamp: number;
}

// ============================================
// COMMANDS — learn
// ============================================

async function runLearn(url: string) {
  printLogo(); divider();
  let flowName = args[2];
  if (!flowName) { console.log(chalk.cyan('\n  Enter flow name: ')); flowName = await askQuestion('  > '); }
  if (!flowName) { errorMsg('Flow name required'); process.exit(1); }

  info('Target URL: ' + chalk.cyan(url));
  info('Flow name:  ' + chalk.cyan(flowName));
  console.log();

  const flow = db.createFlow({ name: flowName, appUrl: url });
  const capturedActions: RecordedAction[] = [];
  let browserClosed = false;

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.exposeFunction('__flowmindRecord', (action: RecordedAction) => {
    const last = capturedActions[capturedActions.length - 1];
    if (last && last.type === action.type && last.selector === action.selector && Date.now() - last.timestamp < 500) return;
    const sanitized = { ...action, value: action.value ? sanitizePII(action.value) : action.value };
    capturedActions.push(sanitized);
    const icons: Record<string, string> = { click: '🖱 ', fill: '⌨️ ', select: '📋', navigate: '🌐', check: '☑️ ' };
    let label = '';
    if (action.type === 'click') label = `click ${action.label ? chalk.white(`"${action.label}"`) : ''} ${chalk.gray(action.selector)}`;
    else if (action.type === 'fill') label = `fill ${chalk.gray(action.selector)} = ${chalk.yellow(`"${sanitized.value?.slice(0, 30)}"`)}`;
    else if (action.type === 'select') label = `select ${chalk.gray(action.selector)} → ${chalk.yellow(action.value)}`;
    else if (action.type === 'navigate') label = `navigate → ${chalk.cyan(action.url)}`;
    else if (action.type === 'check') label = `check ${chalk.gray(action.selector)} (${action.value})`;
    process.stdout.write(`  ${chalk.green(icons[action.type] || '●')} ${label}\n`);
  });

  await page.addInitScript(RECORDER_SCRIPT);

  let lastNavTime = 0;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const navUrl = frame.url();
    if (navUrl === 'about:blank' || navUrl === url) return;
    const now = Date.now();
    const last = capturedActions[capturedActions.length - 1];
    if (last && last.type === 'click' && now - last.timestamp < 1500) return;
    if (now - lastNavTime < 300) return;
    lastNavTime = now;
    capturedActions.push({ type: 'navigate', url: navUrl, timestamp: now });
    process.stdout.write(`  ${chalk.green('🌐')} navigate → ${chalk.cyan(navUrl)}\n`);
  });

  browser.on('disconnected', () => { browserClosed = true; });

  console.log(chalk.bold('  Browser is open — interact with it normally.\n'));
  console.log(chalk.gray('  Every click, fill, and navigation is captured automatically.\n'));
  await page.goto(url);
  if (!browserClosed) await waitForDone().catch(() => {});
  if (!browserClosed) await browser.close();

  if (capturedActions.length === 0) {
    warn('No actions captured. Flow not saved.');
    db.deleteFlow(flow.id);
    process.exit(0);
  }

  const nodes: object[] = [{ id: 'start', type: 'start', label: 'Start', url }];
  const edges: object[] = [];
  let prevId = 'start';
  capturedActions.forEach((action, i) => {
    const nodeId = `step-${i + 1}`;
    let node: Record<string, unknown>;
    if (action.type === 'navigate') node = { id: nodeId, type: 'action', label: `Navigate to ${action.url}`, action: 'navigate', url: action.url };
    else if (action.type === 'click') node = { id: nodeId, type: 'action', label: action.label ? `Click "${action.label}"` : `Click ${action.selector}`, action: 'click', selector: action.selector };
    else if (action.type === 'fill') node = { id: nodeId, type: 'action', label: `Fill ${action.selector}`, action: 'fill', selector: action.selector, value: action.value };
    else if (action.type === 'select') node = { id: nodeId, type: 'action', label: `Select "${action.value}" in ${action.selector}`, action: 'select', selector: action.selector, value: action.value };
    else if (action.type === 'check') node = { id: nodeId, type: 'action', label: `${action.value === 'true' ? 'Check' : 'Uncheck'} ${action.selector}`, action: 'check', selector: action.selector, value: action.value };
    else return;
    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });
  nodes.push({ id: 'end', type: 'end', label: 'End' });
  edges.push({ id: `e${capturedActions.length}`, source: prevId, target: 'end' });
  db.updateFlow(flow.id, { graph: { nodes, edges, appUrl: url } });

  divider();
  success(`${capturedActions.length} actions recorded`);
  const counts = capturedActions.reduce((a, c) => { a[c.type] = (a[c.type] || 0) + 1; return a; }, {} as Record<string, number>);
  Object.entries(counts).forEach(([t, n]) => info(`  ${t}: ${n}`));
  console.log();
  info('Run with: ' + chalk.green(`node flowmind.js run ${flow.id.slice(0, 8)}`));
  console.log();
}

// ============================================
// COMMANDS — run
// ============================================

async function executeFlow(flowId: string): Promise<{ passed: boolean; runId: string; duration: number }> {
  let flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) { errorMsg('Flow not found: ' + flowId); process.exit(1); }

  let graph: { nodes: Record<string, unknown>[]; edges: object[]; appUrl?: string };
  try { graph = JSON.parse(flow.graph); } catch { errorMsg('Invalid graph'); process.exit(1); return { passed: false, runId: '', duration: 0 }; }

  if (!graph.nodes?.length) { warn('Empty flow.'); return { passed: false, runId: '', duration: 0 }; }

  const run = db.createRun(flow.id);
  const screenshotsDir = db.getScreenshotsPath(run.id);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const actionNodes = graph.nodes.filter(n => n.type === 'action') as Array<Record<string, unknown>>;
  let stepNum = 1, failed = false;
  let failedStepInfo: { name: string; action: string; selector?: string | null; errorMessage: string } | null = null;
  const runStart = Date.now();

  for (const node of actionNodes) {
    const label = node.label as string, action = node.action as string;
    console.log(chalk.cyan(`\n  [${stepNum}/${actionNodes.length}] ${label}`));
    const step = db.createStep({ runId: run.id, stepNumber: stepNum, name: label, action, selector: node.selector as string | undefined, value: node.value as string | undefined });
    const t = Date.now();
    try {
      await executeAction(page, action, node);
      // Auto wait-for-nav after clicks — resolves immediately if no navigation occurred
      if (action === 'click') {
        await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      }
      const duration = Date.now() - t;
      const screenshot = await page.screenshot();
      const sp = path.join(screenshotsDir, `step-${stepNum}.png`);
      fs.writeFileSync(sp, screenshot);
      db.updateStep(step.id, { status: 'passed', duration, screenshotPath: sp });
      console.log(chalk.green(`      ✓ passed (${duration}ms)`));
    } catch (err) {
      const duration = Date.now() - t;
      const errorMessage = err instanceof Error ? err.message.split('\n')[0] : String(err);
      try {
        const screenshot = await page.screenshot();
        const sp = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
        fs.writeFileSync(sp, screenshot);
        db.updateStep(step.id, { status: 'failed', duration, errorMessage, screenshotPath: sp });
      } catch { db.updateStep(step.id, { status: 'failed', duration, errorMessage }); }
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
  let summary: string | null = null;
  if (failed && failedStepInfo) {
    process.stdout.write(chalk.gray('\n  Analyzing failure...\n'));
    const steps = db.listSteps(run.id);
    const result = await callAI(buildFailurePrompt({ flowName: flow.name, steps: steps.map(s => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })), failedStep: failedStepInfo }));
    if (result) {
      summary = result.text;
      process.stdout.write(chalk.gray(`  (via ${result.provider})\n`));
    }
  }

  db.updateRun(run.id, { status: failed ? 'failed' : 'passed', completedAt: new Date(), duration: totalDuration, errorMessage: failedStepInfo?.errorMessage, summary: summary || undefined });

  divider();
  if (failed) {
    errorMsg('Flow failed');
    if (summary) {
      console.log();
      console.log(chalk.bgRed.white.bold('  FAILURE REPORT  '));
      console.log();
      for (const line of summary.split('\n')) {
        const trimmed = line.trim();
        if (/^(WHAT FAILED|WHY IT FAILED|HOW TO FIX IT)$/.test(trimmed)) {
          console.log(chalk.yellow.bold('  ' + trimmed));
        } else if (trimmed) {
          console.log(chalk.white('    ' + trimmed));
        }
      }
      console.log();
    }
  } else {
    success(`Flow passed! (${totalDuration}ms)`);
  }
  info('Run ID: ' + chalk.gray(run.id.slice(0, 8)));
  info('Screenshots: ' + chalk.cyan(screenshotsDir));
  console.log();
  return { passed: !failed, runId: run.id, duration: totalDuration };
}

async function executeAction(page: import('playwright').Page, action: string, node: Record<string, unknown>) {
  switch (action) {
    case 'navigate': await page.goto((node.url || node.value) as string, { waitUntil: 'domcontentloaded', timeout: 15000 }); break;
    case 'click':    await page.click(node.selector as string, { timeout: 10000 }); break;
    case 'fill':     await page.fill(node.selector as string, sanitizePII((node.value as string) || ''), { timeout: 10000 }); break;
    case 'select':   await page.selectOption(node.selector as string, (node.value as string) || '', { timeout: 10000 }); break;
    case 'check':
      if (node.value === 'true') await page.check(node.selector as string, { timeout: 10000 });
      else await page.uncheck(node.selector as string, { timeout: 10000 });
      break;
    case 'wait':     await page.waitForSelector(node.selector as string, { timeout: 10000 }); break;
    case 'press':    await page.press(node.selector as string, (node.value as string) || 'Enter'); break;
  }
}

async function runFlow(id: string) {
  printLogo(); divider();
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  console.log(chalk.bold('\n  Running: ') + chalk.white(flow.name) + '\n');
  await executeFlow(id);
}

// ============================================
// COMMANDS — flow:fix (interactive selector repair)
// ============================================

async function runFixFlow(id: string) {
  printLogo(); divider();
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }

  console.log(chalk.bold(`\n  Fixing: ${flow.name}\n`));
  console.log(chalk.gray('  Steps will replay automatically. When one fails,'));
  console.log(chalk.gray('  click the correct element in the browser.\n'));

  let graph: { nodes: Record<string, unknown>[]; appUrl?: string; edges?: object[] };
  try { graph = JSON.parse(flow.graph); } catch { errorMsg('Invalid graph'); process.exit(1); return; }

  const actionNodes = graph.nodes.filter(n => n.type === 'action') as Array<Record<string, unknown>>;
  if (!actionNodes.length) { warn('No action steps in this flow.'); return; }

  let waitingForFix = false;
  let fixResolve: ((action: RecordedAction) => void) | null = null;
  let fixesApplied = 0;

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.exposeFunction('__flowmindRecord', (action: RecordedAction) => {
    if (waitingForFix && fixResolve && action.type === 'click') {
      fixResolve(action);
      fixResolve = null;
      waitingForFix = false;
    }
  });
  await page.addInitScript(RECORDER_SCRIPT);

  const startUrl = graph.appUrl || flow.appUrl;
  if (startUrl) await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

  for (let i = 0; i < actionNodes.length; i++) {
    const node = actionNodes[i];
    const label = node.label as string;
    console.log(chalk.cyan(`\n  [${i + 1}/${actionNodes.length}] ${label}`));

    try {
      await executeAction(page, node.action as string, node);
      if (node.action === 'click') await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      console.log(chalk.green('      ✓ passed'));
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.log(chalk.red(`      ✗ failed: ${msg}`));
      console.log(chalk.yellow(`\n      Current selector: ${chalk.white(node.selector || '(none)')}`));
      console.log(chalk.yellow('      Click the correct element in the browser...'));

      // Highlight broken element area if possible
      try {
        await page.evaluate((sel: string) => {
          document.querySelectorAll('[data-fm-highlight]').forEach(e => e.removeAttribute('data-fm-highlight'));
          const el = document.querySelector(sel);
          if (el) { (el as HTMLElement).style.outline = '3px solid red'; (el as HTMLElement).style.outlineOffset = '2px'; }
        }, node.selector as string);
      } catch {}

      // Wait for user to click the right element
      const captured = await new Promise<RecordedAction>((resolve) => {
        waitingForFix = true;
        fixResolve = resolve;
        // Also allow skipping via terminal
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.on('line', (line) => {
          if (line.trim().toLowerCase() === 'skip') {
            waitingForFix = false;
            fixResolve = null;
            rl.close();
            resolve({ type: 'skip', timestamp: Date.now() });
          }
        });
        // Close rl once resolved from browser
        const origResolve = fixResolve!;
        fixResolve = (a) => { rl.close(); origResolve(a); };
      });

      if (captured.type === 'skip') {
        warn('      Skipped — selector unchanged.');
        continue;
      }

      const oldSelector = node.selector;
      node.selector = captured.selector;
      if (node.label && typeof node.label === 'string' && captured.label) {
        // Update label to reflect new target
      }
      console.log(chalk.green(`      ✓ Updated: ${chalk.gray(oldSelector)} → ${chalk.white(captured.selector)}`));
      fixesApplied++;

      // Retry the action with new selector
      try {
        await executeAction(page, node.action as string, node);
        if (node.action === 'click') await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        console.log(chalk.green('      ✓ Retry passed'));
      } catch (retryErr) {
        warn(`      Retry also failed: ${retryErr instanceof Error ? retryErr.message.split('\n')[0] : retryErr}`);
        warn('      Continuing anyway — you may need to fix this step again.');
      }
    }
  }

  await browser.close();

  if (fixesApplied > 0) {
    db.updateFlow(flow.id, { graph: { ...graph, nodes: graph.nodes } });
    divider();
    success(`${fixesApplied} selector${fixesApplied > 1 ? 's' : ''} fixed and saved.`);
    info(`Run: ${chalk.green(`node flowmind.js run ${flow.id.slice(0, 8)}`)}`);
  } else {
    divider();
    info('No fixes needed — all selectors work.');
  }
  console.log();
}

// ============================================
// COMMANDS — run:diff (screenshot diff)
// ============================================

async function runDiff(runId1: string, runId2: string) {
  const run1 = db.findRunByPartialId(runId1);
  const run2 = db.findRunByPartialId(runId2);
  if (!run1) { errorMsg('Run not found: ' + runId1); process.exit(1); }
  if (!run2) { errorMsg('Run not found: ' + runId2); process.exit(1); }

  const steps1 = db.listSteps(run1.id);
  const steps2 = db.listSteps(run2.id);
  const flow = db.getFlow(run1.flowId);

  console.log(chalk.bold(`\n  Screenshot Diff: ${flow?.name || 'Unknown'}\n`));
  console.log(`  ${chalk.gray('Run A:')} ${run1.id.slice(0, 8)} ${chalk.gray('(' + run1.status + ')')}`);
  console.log(`  ${chalk.gray('Run B:')} ${run2.id.slice(0, 8)} ${chalk.gray('(' + run2.status + ')')}\n`);

  // Dynamic imports — only needed for this command
  let PNG: typeof import('pngjs').PNG;
  let pixelmatch: typeof import('pixelmatch').default;
  try {
    const pngjs = await import('pngjs');
    PNG = pngjs.PNG;
    pixelmatch = (await import('pixelmatch')).default;
  } catch {
    errorMsg('Missing dependencies. Run: npm install pixelmatch pngjs');
    process.exit(1);
    return;
  }

  const diffDir = path.join(DATA_PATH, 'diffs', `${run1.id.slice(0, 8)}_vs_${run2.id.slice(0, 8)}`);
  fs.mkdirSync(diffDir, { recursive: true });

  const maxSteps = Math.max(steps1.length, steps2.length);
  let changed = 0, same = 0, missing = 0;

  console.log(chalk.gray('  Step  Status    Diff %  Screenshot'));
  console.log(chalk.gray('  ' + '─'.repeat(58)));

  for (let i = 1; i <= maxSteps; i++) {
    const s1 = steps1.find(s => s.stepNumber === i);
    const s2 = steps2.find(s => s.stepNumber === i);
    const name = (s1?.name || s2?.name || `Step ${i}`).slice(0, 30);

    const p1 = s1?.screenshotPath;
    const p2 = s2?.screenshotPath;

    if (!p1 || !p2 || !fs.existsSync(p1) || !fs.existsSync(p2)) {
      console.log(`  ${chalk.gray(String(i).padStart(4))}  ${chalk.yellow('missing  ')}  ${chalk.gray('N/A    ')}  ${chalk.gray(name)}`);
      missing++;
      continue;
    }

    try {
      const img1 = PNG.sync.read(fs.readFileSync(p1));
      const img2 = PNG.sync.read(fs.readFileSync(p2));
      // Handle different dimensions — use min
      const w = Math.min(img1.width, img2.width);
      const h = Math.min(img1.height, img2.height);
      const diff = new PNG({ width: w, height: h });

      const numDiff = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
      const pct = ((numDiff / (w * h)) * 100).toFixed(1);
      const diffPath = path.join(diffDir, `step-${i}-diff.png`);
      fs.writeFileSync(diffPath, PNG.sync.write(diff));

      const isChanged = parseFloat(pct) > 0.5;
      if (isChanged) changed++; else same++;

      const statusLabel = isChanged ? chalk.yellow('changed  ') : chalk.green('same     ');
      const pctLabel = isChanged ? chalk.yellow(pct.padStart(5) + '%') : chalk.gray(pct.padStart(5) + '%');
      console.log(`  ${chalk.gray(String(i).padStart(4))}  ${statusLabel}  ${pctLabel}  ${chalk.white(name)}`);
    } catch {
      console.log(`  ${chalk.gray(String(i).padStart(4))}  ${chalk.red('error    ')}  ${chalk.gray('N/A    ')}  ${chalk.gray(name)}`);
      missing++;
    }
  }

  console.log(chalk.gray('\n  ' + '─'.repeat(58)));
  console.log(`  ${chalk.green(same + ' same')}  ${chalk.yellow(changed + ' changed')}  ${missing ? chalk.gray(missing + ' missing') : ''}`);
  console.log(`\n  ${chalk.gray('Diff images:')} ${chalk.cyan(diffDir)}\n`);
}

// ============================================
// COMMANDS — flow management
// ============================================

async function runListFlows() {
  const flows = db.listFlows();
  console.log(chalk.bold('\n  Your Flows\n'));
  if (flows.length === 0) { warn('No flows. Create one: ' + chalk.cyan('node flowmind.js learn <url>')); console.log(); return; }
  console.log(chalk.gray('  ID        Name                          Steps  Updated'));
  console.log(chalk.gray('  ' + '─'.repeat(62)));
  for (const flow of flows) {
    let steps = 0;
    try { steps = (JSON.parse(flow.graph).nodes || []).filter((n: Record<string, unknown>) => n.type === 'action').length; } catch {}
    console.log(`  ${chalk.gray(flow.id.slice(0, 8))} ${chalk.white(flow.name.padEnd(28).slice(0, 28))} ${chalk.gray(String(steps).padEnd(6))} ${chalk.gray(flow.updatedAt.toLocaleDateString())}`);
  }
  console.log();
}

async function runDeleteFlow(id: string) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  const confirm = await askQuestion(`  Delete "${chalk.yellow(flow.name)}"? (y/N) `);
  if (confirm.toLowerCase() !== 'y') { warn('Cancelled'); return; }
  db.deleteFlow(flow.id);
  success(`Deleted: ${flow.name}`);
  console.log();
}

async function runExportFlow(id: string) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  const filename = `${flow.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.flow.json`;
  fs.writeFileSync(filename, JSON.stringify({ version: '1.0.0', exportedAt: new Date().toISOString(), flow: { name: flow.name, description: flow.description, appUrl: flow.appUrl, graph: JSON.parse(flow.graph) } }, null, 2));
  success(`Exported to ${chalk.cyan(filename)}`);
  console.log();
}

async function runImportFlow(filepath: string) {
  if (!fs.existsSync(filepath)) { errorMsg('File not found: ' + filepath); process.exit(1); }
  let data: { flow: { name: string; description?: string; appUrl?: string; graph: object } };
  try { data = JSON.parse(fs.readFileSync(filepath, 'utf8')); } catch { errorMsg('Invalid JSON'); process.exit(1); return; }
  const created = db.createFlow({ name: data.flow.name, description: data.flow.description, appUrl: data.flow.appUrl, graph: data.flow.graph });
  success(`Imported: ${chalk.white(data.flow.name)}`);
  info('ID: ' + chalk.gray(created.id.slice(0, 8)));
  console.log();
}

// ============================================
// COMMANDS — run management
// ============================================

async function runListRuns() {
  const runs = db.listRuns(undefined, 20);
  console.log(chalk.bold('\n  Recent Runs\n'));
  if (runs.length === 0) { warn('No runs yet.'); console.log(); return; }
  console.log(chalk.gray('  ID        Flow                           Status       Duration'));
  console.log(chalk.gray('  ' + '─'.repeat(72)));
  for (const run of runs) {
    const flow = db.getFlow(run.flowId);
    const statusColor = run.status === 'passed' ? chalk.green : run.status === 'failed' ? chalk.red : chalk.yellow;
    console.log(`  ${chalk.gray(run.id.slice(0, 8))} ${chalk.white((flow?.name || 'Unknown').padEnd(28).slice(0, 28))} ${statusColor(run.status.padEnd(12))} ${chalk.gray(run.duration ? run.duration + 'ms' : '-')}`);
  }
  console.log();
}

async function runShowRun(id: string) {
  const run = db.findRunByPartialId(id);
  if (!run) { errorMsg('Run not found: ' + id); process.exit(1); }
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const statusColor = run.status === 'passed' ? chalk.green : run.status === 'failed' ? chalk.red : chalk.yellow;
  console.log(chalk.bold(`\n  Run: ${run.id.slice(0, 8)}\n`));
  const b = '─'.repeat(56);
  console.log(chalk.gray(`  ┌${b}┐`));
  console.log(chalk.gray('  │ ') + `Flow:     ${(flow?.name || 'Unknown').padEnd(44)}` + chalk.gray('│'));
  console.log(chalk.gray('  │ ') + `Status:   ${statusColor(run.status).padEnd(53)}` + chalk.gray('│'));
  console.log(chalk.gray('  │ ') + `Duration: ${(run.duration ? run.duration + 'ms' : '-').padEnd(44)}` + chalk.gray('│'));
  console.log(chalk.gray(`  └${b}┘`));
  console.log(chalk.bold('\n  Steps\n'));
  for (const step of steps) {
    const icon = step.status === 'passed' ? chalk.green('✓') : step.status === 'failed' ? chalk.red('✗') : chalk.gray('○');
    console.log(`    ${chalk.gray(String(step.stepNumber).padStart(2))}  ${icon}  ${chalk.white(step.name)} ${chalk.gray(step.duration ? step.duration + 'ms' : '')}`);
    if (step.status === 'failed' && step.errorMessage) console.log(`         ${chalk.red('└─ ' + step.errorMessage.slice(0, 80))}`);
    if (step.screenshotPath) console.log(`         ${chalk.gray('📷 ' + step.screenshotPath)}`);
  }

  // Show or auto-generate AI analysis for failed runs
  if (run.status === 'failed') {
    let summary = run.summary;
    if (!summary) {
      process.stdout.write(chalk.gray('\n  Analyzing failure...\n'));
      const failedStep = steps.find(s => s.status === 'failed');
      if (failedStep) {
        const result = await callAI(buildFailurePrompt({
          flowName: flow?.name || 'Unknown',
          steps: steps.map(s => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
          failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || 'Unknown error' },
        }));
        if (result) {
          summary = result.text;
          db.updateRun(run.id, { summary });
        }
      }
    }
    if (summary) {
      console.log();
      console.log(chalk.bgRed.white.bold('  FAILURE REPORT  '));
      console.log();
      for (const line of summary.split('\n')) {
        const trimmed = line.trim();
        if (/^(WHAT FAILED|WHY IT FAILED|HOW TO FIX IT)$/.test(trimmed)) {
          console.log(chalk.yellow.bold('  ' + trimmed));
        } else if (trimmed) {
          console.log(chalk.white('    ' + trimmed));
        }
      }
    } else {
      console.log();
      warn('No AI provider available for analysis. Run Ollama locally or set ANTHROPIC_API_KEY.');
    }
  }
  console.log();
}

async function runAnalyzeRun(id: string) {
  const run = db.findRunByPartialId(id);
  if (!run) { errorMsg('Run not found: ' + id); process.exit(1); }
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const failedStep = steps.find(s => s.status === 'failed');
  if (!failedStep) { info('Run passed — no failures to analyze.'); return; }

  info('Analyzing failure...');
  const result = await callAI(buildFailurePrompt({
    flowName: flow?.name || 'Unknown',
    steps: steps.map(s => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
    failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || 'Unknown error' },
  }));

  if (result) {
    db.updateRun(run.id, { summary: result.text });
    console.log();
    console.log(chalk.yellow(`  AI Analysis ${chalk.gray('(via ' + result.provider + ')')}:`));
    console.log(chalk.white('  ' + result.text.split('\n').join('\n  ')));
    console.log();
  } else {
    warn('No AI provider available. Run Ollama locally or set ANTHROPIC_API_KEY.');
    console.log(chalk.gray('  brew install ollama && ollama pull gemma3:4b'));
  }
}

// ============================================
// COMMANDS — scheduling
// ============================================

async function runScheduleAdd(id: string, cronExpr: string) {
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }

  // Validate cron expression
  let nodeCron: typeof import('node-cron');
  try { nodeCron = await import('node-cron'); } catch { errorMsg('node-cron not installed. Run: npm install node-cron'); process.exit(1); return; }
  if (!nodeCron.validate(cronExpr)) { errorMsg(`Invalid cron expression: "${cronExpr}"\n  Example: "0 9 * * *" (daily at 9am)`); process.exit(1); }

  const schedule = db.createSchedule({ flowId: flow.id, name: flow.name, cronExpression: cronExpr });
  success(`Scheduled "${flow.name}"`);
  info(`Cron: ${chalk.cyan(cronExpr)}`);
  info(`ID:   ${chalk.gray(schedule.id.slice(0, 8))}`);
  console.log();
  console.log(chalk.gray('  Start the scheduler daemon with:'));
  console.log('  ' + chalk.cyan('node flowmind.js serve'));
  console.log();
}

async function runScheduleList() {
  const schedules = db.listSchedules();
  console.log(chalk.bold('\n  Schedules\n'));
  if (schedules.length === 0) { warn('No schedules. Add one: ' + chalk.cyan('node flowmind.js flow:schedule <id> "<cron>"')); console.log(); return; }
  console.log(chalk.gray('  ID        Flow                    Cron            Last Run      Status'));
  console.log(chalk.gray('  ' + '─'.repeat(78)));
  for (const s of schedules) {
    const lastRun = s.lastRunAt ? s.lastRunAt.toLocaleDateString() : chalk.gray('never');
    const statusColor = s.lastRunStatus === 'passed' ? chalk.green : s.lastRunStatus === 'failed' ? chalk.red : chalk.gray;
    const status = s.lastRunStatus ? statusColor(s.lastRunStatus) : chalk.gray('—');
    console.log(`  ${chalk.gray(s.id.slice(0, 8))} ${chalk.white((s.flowName || s.name).padEnd(22).slice(0, 22))} ${chalk.cyan(s.cronExpression.padEnd(15))} ${String(lastRun).padEnd(13)} ${status}`);
  }
  console.log();
}

async function runScheduleRemove(id: string) {
  const schedules = db.listSchedules();
  const schedule = schedules.find(s => s.id.startsWith(id));
  if (!schedule) { errorMsg('Schedule not found: ' + id); process.exit(1); }
  db.deleteSchedule(schedule.id);
  success(`Removed schedule for "${schedule.name}"`);
  console.log();
}

async function runServe() {
  printLogo(); divider();
  let nodeCron: typeof import('node-cron');
  try { nodeCron = await import('node-cron'); } catch { errorMsg('node-cron not installed. Run: npm install node-cron'); process.exit(1); return; }

  const schedules = db.listSchedules();
  if (schedules.length === 0) {
    warn('No schedules configured. Add one first:');
    info('node flowmind.js flow:schedule <id> "0 9 * * *"');
    process.exit(0);
  }

  console.log(chalk.bold(`\n  Scheduler started — ${schedules.length} schedule${schedules.length > 1 ? 's' : ''} active\n`));
  schedules.forEach(s => info(`${s.name} → ${chalk.cyan(s.cronExpression)}`));
  console.log(chalk.gray('\n  Press Ctrl+C to stop.\n'));

  for (const schedule of schedules) {
    nodeCron.schedule(schedule.cronExpression, async () => {
      const ts = new Date().toLocaleTimeString();
      console.log(chalk.cyan(`\n  [${ts}] Running: ${schedule.name}`));
      try {
        const result = await executeFlow(schedule.flowId);
        db.updateScheduleLastRun(schedule.id, result.passed ? 'passed' : 'failed');
        console.log(result.passed ? chalk.green(`  ✓ passed (${result.duration}ms)`) : chalk.red('  ✗ failed'));
      } catch (err) {
        console.log(chalk.red(`  ✗ error: ${err}`));
        db.updateScheduleLastRun(schedule.id, 'failed');
      }
    });
  }

  // Keep alive — close db only on exit
  process.on('SIGINT', () => { console.log('\n  Stopping...'); db.close(); process.exit(0); });
  await new Promise(() => {}); // run forever
}

// ============================================
// COMMANDS — status + ai:status
// ============================================

async function runStatus() {
  printLogo(); divider();
  const flows = db.listFlows();
  const runs = db.listRuns(undefined, 100);
  const passed = runs.filter(r => r.status === 'passed').length;
  const failed = runs.filter(r => r.status === 'failed').length;

  console.log(chalk.bold('\n  Statistics\n'));
  console.log('  ' + chalk.gray('Flows:        ') + chalk.white(String(flows.length)));
  console.log('  ' + chalk.gray('Total Runs:   ') + chalk.white(String(runs.length)));
  console.log('  ' + chalk.gray('Passed:       ') + chalk.green(String(passed)));
  console.log('  ' + chalk.gray('Failed:       ') + chalk.red(String(failed)));
  if (runs.length > 0) {
    const rate = Math.round((passed / runs.length) * 100);
    console.log('  ' + chalk.gray('Success Rate: ') + (rate >= 80 ? chalk.green : rate >= 50 ? chalk.yellow : chalk.red)(`${rate}%`));
  }

  console.log();
  console.log('  ' + chalk.gray('Data Path:    ') + chalk.white(DATA_PATH));

  // AI provider detection
  const ollamaModel = await isOllamaRunning();
  if (ollamaModel) {
    console.log('  ' + chalk.gray('AI Provider:  ') + chalk.green(`Ollama (${ollamaModel})`));
  } else if (process.env.ANTHROPIC_API_KEY) {
    console.log('  ' + chalk.gray('AI Provider:  ') + chalk.cyan('Anthropic Claude'));
  } else {
    console.log('  ' + chalk.gray('AI Provider:  ') + chalk.gray('none (run ollama locally or set ANTHROPIC_API_KEY)'));
  }
  console.log();
}

// ============================================
// DESKTOP APP
// ============================================

async function runDesktopApp() {
  const { execFile } = await import('child_process');
  const electronBin = path.join(__dirname, 'node_modules', '.bin', 'electron');
  const mainJs = path.join(__dirname, 'apps', 'electron', 'main.js');

  if (!fs.existsSync(mainJs)) {
    errorMsg('Desktop app not found at: ' + mainJs);
    process.exit(1);
  }

  info('Launching FlowMind desktop...');
  const child = (execFile as Function)(electronBin, [mainJs], {
    detached: true,
    stdio: 'ignore',
    cwd: __dirname,
  });
  child.unref();
  success('Desktop app launched.');
}

// ============================================
// EXPLORE
// ============================================

interface PageData {
  url: string;
  title: string;
  headings: string[];
  links: string[];
  screenshotPath: string | null;
}

interface FlowCandidate {
  name: string;
  description: string;
  route: string;
}

async function bfsCrawl(
  startUrl: string,
  screenshotsDir: string,
  maxPages: number,
  onProgress: (visited: number, current: string) => void
): Promise<PageData[]> {
  const origin = new URL(startUrl).origin;
  const normalize = (u: string) => u.replace(/#.*$/, '').replace(/\/$/, '') || '/';
  const visited = new Set<string>();
  const queue = [normalize(startUrl)];
  const pages: PageData[] = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    const key = normalize(url);
    if (visited.has(key)) continue;
    visited.add(key);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      onProgress(pages.length + 1, url);

      const title = await page.title().catch(() => '');
      const headings = await page.$$eval('h1,h2,h3', els => els.slice(0, 8).map(e => (e as HTMLElement).innerText.trim()).filter(Boolean)).catch(() => [] as string[]);
      const links = await page.$$eval('a[href]', (els, orig) =>
        els.map(e => (e as HTMLAnchorElement).href)
           .filter(h => h && h.startsWith(orig) && !h.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf)(\?|$)/i)),
        origin
      ).catch(() => [] as string[]);

      const ssPath = path.join(screenshotsDir, `page-${pages.length + 1}.jpg`);
      await page.screenshot({ path: ssPath, type: 'jpeg', quality: 60 }).catch(() => {});
      const ssExists = fs.existsSync(ssPath);

      pages.push({ url, title, headings, links, screenshotPath: ssExists ? ssPath : null });

      for (const link of links) {
        const norm = normalize(link);
        if (!visited.has(norm) && !queue.includes(norm)) queue.push(norm);
      }
    } catch {
      // skip unreachable pages silently
    }
  }

  await browser.close();
  return pages;
}

async function analyzePages(pages: PageData[]): Promise<FlowCandidate[]> {
  const candidates: FlowCandidate[] = [];
  const BATCH = 5;

  for (let i = 0; i < pages.length; i += BATCH) {
    const batch = pages.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async page => {
      const prompt = `You are analyzing a web page to suggest automation test flows.

Page URL: ${page.url}
Page title: ${page.title}
Headings: ${page.headings.join(' | ') || 'none'}
Links found: ${page.links.slice(0, 10).join(', ') || 'none'}

Suggest 1-3 automation flows a developer would want to test on this page.
Respond ONLY with valid JSON array, no other text:
[{"name":"Flow Name","description":"One sentence description of what to test","route":"${page.url}"}]`;

      const result = await callAI(prompt);
      if (!result) return [];
      try {
        const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
        return Array.isArray(parsed) ? parsed as FlowCandidate[] : [];
      } catch {
        // Fallback: treat as single candidate
        return [{ name: page.title || 'Page Check', description: 'Verify page loads correctly', route: page.url }];
      }
    }));

    for (const results of batchResults) candidates.push(...results);

    // Small delay between batches to avoid overwhelming Ollama
    if (i + BATCH < pages.length) await new Promise(r => setTimeout(r, 300));
  }

  return candidates;
}

function generateExploreHtml(report: { id: string; url: string; environment: string }, pages: PageData[], candidates: FlowCandidate[]): string {
  const thumbs = pages.map((p, i) => {
    let imgTag = '<div class="no-screenshot">No screenshot</div>';
    if (p.screenshotPath && fs.existsSync(p.screenshotPath)) {
      const b64 = fs.readFileSync(p.screenshotPath).toString('base64');
      imgTag = `<img src="data:image/jpeg;base64,${b64}" alt="${p.title}" loading="lazy">`;
    }
    return `
    <div class="page-card">
      <div class="page-thumb">${imgTag}</div>
      <div class="page-info">
        <div class="page-num">#${i + 1}</div>
        <div class="page-title">${escapeHtml(p.title || '(no title)')}</div>
        <a class="page-url" href="${escapeHtml(p.url)}" target="_blank">${escapeHtml(p.url.replace(new URL(report.url).origin, ''))}</a>
        <div class="page-meta">${p.headings.slice(0, 2).map(h => `<span class="heading-pill">${escapeHtml(h)}</span>`).join('')}</div>
      </div>
    </div>`;
  }).join('');

  const candidateCards = candidates.map((c, i) => `
    <div class="candidate-card" data-id="${i}">
      <label class="candidate-check">
        <input type="checkbox" class="confirm-cb" data-route="${escapeHtml(c.route)}" data-name="${escapeHtml(c.name)}" checked>
        <span class="candidate-name">${escapeHtml(c.name)}</span>
      </label>
      <div class="candidate-desc">${escapeHtml(c.description)}</div>
      <div class="candidate-route">${escapeHtml(c.route)}</div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FlowMind Explore Report — ${escapeHtml(report.url)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.5; }
  a { color: #58a6ff; }
  .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 24px 32px; display: flex; align-items: center; gap: 16px; }
  .logo { font-size: 22px; font-weight: 700; color: #58a6ff; letter-spacing: -0.5px; }
  .header-meta { font-size: 13px; color: #8b949e; }
  .env-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px; }
  .env-prod { background: #3d0014; color: #ff7b7b; }
  .env-staging { background: #1a2d00; color: #7ee787; }
  .env-preprod { background: #271e00; color: #e3b341; }
  .env-local { background: #0d1d3b; color: #79c0ff; }
  .main { max-width: 1200px; margin: 0 auto; padding: 32px; }
  .section-title { font-size: 18px; font-weight: 600; color: #f0f6fc; margin-bottom: 4px; }
  .section-sub { font-size: 13px; color: #8b949e; margin-bottom: 20px; }
  .stats-row { display: flex; gap: 16px; margin-bottom: 40px; flex-wrap: wrap; }
  .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 24px; min-width: 140px; }
  .stat-num { font-size: 28px; font-weight: 700; color: #f0f6fc; }
  .stat-label { font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
  section { margin-bottom: 48px; }
  .page-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .page-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
  .page-thumb { height: 160px; overflow: hidden; background: #0d1117; display: flex; align-items: center; justify-content: center; }
  .page-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .no-screenshot { font-size: 12px; color: #484f58; }
  .page-info { padding: 12px; }
  .page-num { font-size: 11px; color: #484f58; margin-bottom: 4px; }
  .page-title { font-size: 14px; font-weight: 600; color: #f0f6fc; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .page-url { font-size: 12px; color: #58a6ff; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
  .page-meta { display: flex; flex-wrap: wrap; gap: 4px; }
  .heading-pill { background: #1f2d3d; color: #79c0ff; font-size: 11px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; overflow: hidden; max-width: 120px; text-overflow: ellipsis; }
  .candidate-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
  .candidate-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; transition: border-color 0.15s; }
  .candidate-card:has(.confirm-cb:checked) { border-color: #238636; }
  .candidate-check { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .confirm-cb { width: 16px; height: 16px; margin-top: 2px; accent-color: #238636; flex-shrink: 0; cursor: pointer; }
  .candidate-name { font-size: 15px; font-weight: 600; color: #f0f6fc; }
  .candidate-desc { font-size: 13px; color: #8b949e; margin: 8px 0 8px 26px; }
  .candidate-route { font-size: 12px; color: #58a6ff; margin-left: 26px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .confirm-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #161b22; border-top: 1px solid #30363d; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
  .confirm-bar-left { font-size: 14px; color: #8b949e; }
  .confirm-bar-left strong { color: #f0f6fc; }
  .confirm-btn { background: #238636; color: #fff; border: none; border-radius: 6px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  .confirm-btn:hover { background: #2ea043; }
  .cmd-box { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 12px 16px; font-family: monospace; font-size: 13px; color: #7ee787; margin-top: 8px; word-break: break-all; }
  .copy-btn { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; margin-left: 8px; }
  .copy-btn:hover { background: #30363d; }
  body { padding-bottom: 80px; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">⚡ FlowMind</div>
  <div class="header-meta">
    Explore Report · <a href="${escapeHtml(report.url)}" target="_blank">${escapeHtml(report.url)}</a>
    <span class="env-badge env-${report.environment}">${report.environment}</span>
  </div>
</div>
<div class="main">
  <div class="stats-row">
    <div class="stat-card"><div class="stat-num">${pages.length}</div><div class="stat-label">Pages crawled</div></div>
    <div class="stat-card"><div class="stat-num">${candidates.length}</div><div class="stat-label">Flow candidates</div></div>
    <div class="stat-card"><div class="stat-num">${new Set(pages.map(p => new URL(p.url).pathname.split('/')[1] || '/')).size}</div><div class="stat-label">Unique sections</div></div>
  </div>

  <section>
    <div class="section-title">Flow Candidates</div>
    <div class="section-sub">AI-suggested flows based on your site's pages. Check the ones you want to save.</div>
    <div class="candidate-grid">${candidateCards}</div>
  </section>

  <section>
    <div class="section-title">Pages Crawled</div>
    <div class="section-sub">${pages.length} page${pages.length !== 1 ? 's' : ''} discovered from <strong>${escapeHtml(report.url)}</strong></div>
    <div class="page-grid">${thumbs}</div>
  </section>

  <section>
    <div class="section-title">Confirm Selected Flows</div>
    <div class="section-sub">After reviewing above, run this command to import selected flows:</div>
    <div class="cmd-box" id="cmd-box">node flowmind.js explore:confirm ${report.id.slice(0, 8)}<button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('cmd-text').textContent)">Copy</button></div>
    <span id="cmd-text" style="display:none">node flowmind.js explore:confirm ${report.id.slice(0, 8)}</span>
  </section>
</div>
<div class="confirm-bar">
  <div class="confirm-bar-left"><strong id="selected-count">${candidates.length}</strong> flows selected</div>
  <button class="confirm-btn" onclick="copyConfirmCmd()">Copy confirm command</button>
</div>
<script>
  const cbs = document.querySelectorAll('.confirm-cb');
  const countEl = document.getElementById('selected-count');
  function updateCount() { countEl.textContent = [...cbs].filter(c => c.checked).length; }
  cbs.forEach(cb => cb.addEventListener('change', updateCount));
  function copyConfirmCmd() {
    navigator.clipboard.writeText('node flowmind.js explore:confirm ${report.id.slice(0, 8)}');
    const btn = document.querySelector('.confirm-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy confirm command'; }, 1500);
  }
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function runExplore(url: string) {
  const clack = await import('@clack/prompts');
  const { intro, select, text, password, confirm, spinner, isCancel, outro, note } = clack;

  intro(chalk.cyan(' FlowMind Explorer '));

  // Step 1: Environment
  const env = await select({
    message: 'Environment type:',
    options: [
      { value: 'local',   label: 'Local',   hint: 'localhost / 127.0.0.1' },
      { value: 'staging', label: 'Staging', hint: 'staging.yourapp.com' },
      { value: 'preprod', label: 'Pre-prod', hint: 'pre.yourapp.com' },
      { value: 'prod',    label: 'Production', hint: 'yourapp.com' },
    ],
    initialValue: url.includes('localhost') || url.includes('127.0.0.1') ? 'local' : 'prod',
  });
  if (isCancel(env)) { outro('Cancelled.'); return; }

  // Step 2: Login
  const needsLogin = await confirm({ message: 'Does this site require login to explore?' });
  if (isCancel(needsLogin)) { outro('Cancelled.'); return; }

  let loginCreds: { username: string; loginPassword: string } | null = null;
  if (needsLogin) {
    const username = await text({ message: 'Username / email:', validate: v => !v ? 'Required' : undefined });
    if (isCancel(username)) { outro('Cancelled.'); return; }
    const loginPassword = await password({ message: 'Password:', validate: v => !v ? 'Required' : undefined });
    if (isCancel(loginPassword)) { outro('Cancelled.'); return; }
    loginCreds = { username: username as string, loginPassword: loginPassword as string };
  }

  // Step 3: Max pages
  const maxPagesStr = await text({
    message: 'Max pages to crawl:',
    initialValue: '30',
    validate: v => (!v || isNaN(Number(v)) || Number(v) < 1) ? 'Enter a number >= 1' : undefined,
  });
  if (isCancel(maxPagesStr)) { outro('Cancelled.'); return; }
  const maxPages = Math.min(parseInt(maxPagesStr as string, 10), 100);

  // Create report record
  const report = db.createExploreReport(url, env as string);
  const exploreDir = path.join(DATA_PATH, 'explore', report.id);
  fs.mkdirSync(exploreDir, { recursive: true });

  // Step 4: Login if needed (headed browser, user confirms when logged in)
  let cookiesJson: string | null = null;
  if (loginCreds) {
    note('A browser will open. Log in, then come back and press Enter.', 'Login Required');
    const loginBrowser = await chromium.launch({ headless: false });
    const loginPage = await loginBrowser.newPage();
    await loginPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    // Try to auto-fill if standard form fields exist
    try {
      await loginPage.fill('input[type="email"], input[name="email"], input[name="username"]', loginCreds.username, { timeout: 3000 });
      await loginPage.fill('input[type="password"]', loginCreds.loginPassword, { timeout: 3000 });
    } catch { /* fields not found, user fills manually */ }

    await new Promise<void>(resolve => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(chalk.cyan('\n  Press Enter once you are logged in... '), () => { rl.close(); resolve(); });
    });

    const cookies = await loginPage.context().cookies();
    cookiesJson = JSON.stringify(cookies);
    await loginBrowser.close();
  }

  // Step 5: BFS crawl
  console.log();
  const s = spinner();
  s.start('Crawling pages...');
  let crawlCount = 0;

  const pages = await bfsCrawl(url, exploreDir, maxPages, (visited, current) => {
    crawlCount = visited;
    s.message(`Crawling... ${visited} pages found — ${new URL(current).pathname}`);
  });

  s.stop(`Crawled ${pages.length} pages`);

  if (pages.length === 0) {
    outro(chalk.red('No pages could be crawled. Check the URL and try again.'));
    return;
  }

  // Step 6: AI analysis
  const hasAI = !!(await isOllamaRunning()) || !!process.env.ANTHROPIC_API_KEY;
  let candidates: FlowCandidate[] = [];

  if (hasAI) {
    const s2 = spinner();
    s2.start('Analyzing pages with AI...');
    candidates = await analyzePages(pages);
    s2.stop(`${candidates.length} flow candidates identified`);
  } else {
    // Fallback: one candidate per page
    candidates = pages.map(p => ({
      name: p.title || `Check ${new URL(p.url).pathname}`,
      description: `Verify ${p.url} loads correctly`,
      route: p.url,
    }));
    note('No AI available — generated basic candidates. Set up Ollama or ANTHROPIC_API_KEY for smarter suggestions.', 'Note');
  }

  // Deduplicate by route
  const seen = new Set<string>();
  candidates = candidates.filter(c => {
    if (seen.has(c.route)) return false;
    seen.add(c.route);
    return true;
  });

  // Save candidates to DB
  for (const c of candidates) {
    const pageForRoute = pages.find(p => p.url === c.route);
    db.createExploreCandidate({
      reportId: report.id,
      name: c.name,
      description: c.description,
      route: c.route,
      screenshotPath: pageForRoute?.screenshotPath || undefined,
      graph: {
        nodes: [{ id: 'n1', type: 'action', action: 'navigate', url: c.route, name: `Navigate to ${c.name}` }],
        edges: [],
      },
    });
  }

  // Step 7: Generate HTML report
  const s3 = spinner();
  s3.start('Generating report...');
  const reportHtml = generateExploreHtml(report, pages, candidates);
  const reportPath = path.join(exploreDir, 'report.html');
  fs.writeFileSync(reportPath, reportHtml, 'utf-8');
  db.updateExploreReport(report.id, { status: 'complete', reportPath });
  s3.stop('Report generated');

  // Done
  console.log();
  note(
    [
      `  Pages crawled:      ${chalk.white(String(pages.length))}`,
      `  Flow candidates:    ${chalk.white(String(candidates.length))}`,
      `  Report:             ${chalk.cyan(reportPath)}`,
      '',
      `  Open the report in your browser to review candidates,`,
      `  then run:`,
      `    ${chalk.cyan('node flowmind.js explore:confirm ' + report.id.slice(0, 8))}`,
    ].join('\n'),
    'Explore Complete'
  );
  outro('');
}

async function runExploreConfirm(reportId: string) {
  const clack = await import('@clack/prompts');
  const { intro, multiselect, isCancel, outro, spinner, note } = clack;

  const report = db.findExploreReportByPartialId(reportId);
  if (!report) { errorMsg('Report not found: ' + reportId); process.exit(1); }

  const candidates = db.listExploreCandidates(report.id);
  if (candidates.length === 0) { warn('No candidates found for this report.'); return; }

  intro(chalk.cyan(' Confirm Flows '));

  if (report.reportPath) {
    note(`Report: ${chalk.cyan(report.reportPath)}`, 'Tip: open in browser to review with screenshots');
  }

  const chosen = await multiselect({
    message: `Select flows to save (${candidates.length} candidates):`,
    options: candidates.map(c => ({
      value: c.id,
      label: c.name,
      hint: c.route.replace(report.url, '') || '/',
    })),
    required: false,
  });

  if (isCancel(chosen) || (chosen as string[]).length === 0) {
    outro('No flows saved.');
    return;
  }

  const s = spinner();
  s.start('Saving flows...');

  const selected = chosen as string[];
  for (const id of selected) {
    const c = candidates.find(x => x.id === id)!;
    db.createFlow({ name: c.name, description: c.description, appUrl: c.route, graph: JSON.parse(c.graph) });
    db.confirmExploreCandidate(c.id);
  }
  db.updateExploreReport(report.id, { status: 'confirmed' });

  s.stop(`${selected.length} flow${selected.length !== 1 ? 's' : ''} saved`);

  const saved = selected.map(id => candidates.find(c => c.id === id)!.name);
  note(
    saved.map(n => `  ${chalk.green('✓')} ${n}`).join('\n'),
    'Saved Flows'
  );
  note(
    `Run any flow with:\n  ${chalk.cyan('node flowmind.js run <name>')}`,
    'Next Step'
  );
  outro('');
}

// ============================================
// INTERACTIVE MODE
// ============================================

async function runInteractive() {
  const clack = await import('@clack/prompts');
  const { intro, outro, select, text, confirm, spinner, isCancel, note, log } = clack;

  console.clear();
  printLogo();

  const flows = db.listFlows();
  const runs = db.listRuns(undefined, 100);
  const passed = runs.filter(r => r.status === 'passed').length;
  const ollamaModel = await isOllamaRunning();
  const aiProvider = ollamaModel ? `Ollama (${ollamaModel})` : process.env.ANTHROPIC_API_KEY ? 'Anthropic' : 'none';

  intro(chalk.cyan(' FlowMind — Memory-driven Web Automation '));

  note(
    [
      `  Flows:    ${chalk.white(String(flows.length))}     Runs: ${chalk.white(String(runs.length))}`,
      `  Passed:   ${chalk.green(String(passed))}     Failed: ${chalk.red(String(runs.length - passed))}`,
      `  AI:       ${ollamaModel ? chalk.green(aiProvider) : process.env.ANTHROPIC_API_KEY ? chalk.cyan(aiProvider) : chalk.gray(aiProvider)}`,
    ].join('\n'),
    'Status'
  );

  while (true) {
    const action = await select({
      message: 'What do you want to do?',
      options: [
        { value: 'run',      label: '▶  Run a flow',              hint: flows.length > 0 ? `${flows.length} saved` : 'no flows yet' },
        { value: 'record',   label: '⏺  Record a new flow',       hint: 'opens real browser' },
        { value: 'reports',  label: '📋 View run reports',         hint: runs.length > 0 ? `${runs.length} runs` : 'no runs yet' },
        { value: 'explore',  label: '🔍 Explore a URL',            hint: 'auto-discover flows with AI' },
        { value: 'schedule', label: '🕐 Manage schedules',         hint: 'cron-based automation' },
        { value: 'status',   label: '📊 System status',            hint: 'stats + AI provider' },
        { value: 'app',      label: '🖥  Open desktop app',          hint: 'Electron UI' },
        { value: 'exit',     label: '✕  Exit' },
      ],
    });

    if (isCancel(action) || action === 'exit') {
      outro(chalk.gray('Bye.'));
      process.exit(0);
    }

    // ── RUN A FLOW ──────────────────────────────────────────
    if (action === 'run') {
      const currentFlows = db.listFlows();
      if (currentFlows.length === 0) {
        log.warn('No flows saved yet. Record one first.');
        continue;
      }
      const flowChoice = await select({
        message: 'Which flow?',
        options: currentFlows.map(f => ({
          value: f.id,
          label: f.name,
          hint: f.appUrl || '',
        })),
      });
      if (isCancel(flowChoice)) continue;

      console.log();
      await runFlow(flowChoice as string);
      console.log();
      await _pause();
    }

    // ── RECORD ──────────────────────────────────────────────
    else if (action === 'record') {
      const url = await text({
        message: 'URL to record:',
        placeholder: 'https://yourapp.com',
        validate: v => (!v || !v.startsWith('http')) ? 'Enter a valid URL starting with http' : undefined,
      });
      if (isCancel(url)) continue;

      const name = await text({
        message: 'Flow name:',
        placeholder: 'e.g. Login Flow',
        defaultValue: new URL(url as string).hostname,
      });
      if (isCancel(name)) continue;

      console.log();
      await runLearn(url as string, name as string);
    }

    // ── REPORTS ─────────────────────────────────────────────
    else if (action === 'reports') {
      const recentRuns = db.listRuns(undefined, 20);
      if (recentRuns.length === 0) {
        log.warn('No runs yet. Run a flow first.');
        continue;
      }
      const runChoice = await select({
        message: 'Which run?',
        options: recentRuns.map(r => {
          const flow = db.getFlow(r.flowId);
          const icon = r.status === 'passed' ? chalk.green('✓') : chalk.red('✗');
          const dur = r.duration ? ` ${r.duration}ms` : '';
          return {
            value: r.id,
            label: `${icon}  ${flow?.name || 'Unknown'}${dur}`,
            hint: r.id.slice(0, 8),
          };
        }),
      });
      if (isCancel(runChoice)) continue;

      console.log();
      await runShowRun((runChoice as string).slice(0, 8));
      console.log();
      await _pause();
    }

    // ── EXPLORE ─────────────────────────────────────────────
    else if (action === 'explore') {
      const url = await text({
        message: 'URL to explore:',
        placeholder: 'https://yourapp.com',
        validate: v => (!v || !v.startsWith('http')) ? 'Enter a valid URL starting with http' : undefined,
      });
      if (isCancel(url)) continue;

      console.log();
      await runExplore(url as string);
      console.log();
      await _pause();
    }

    // ── SCHEDULES ───────────────────────────────────────────
    else if (action === 'schedule') {
      const schedAction = await select({
        message: 'Schedule management:',
        options: [
          { value: 'list',   label: 'List schedules' },
          { value: 'add',    label: 'Add a schedule' },
          { value: 'remove', label: 'Remove a schedule' },
          { value: 'back',   label: '← Back' },
        ],
      });
      if (isCancel(schedAction) || schedAction === 'back') continue;

      if (schedAction === 'list') {
        console.log();
        await runScheduleList();
        console.log();
        await _pause();
      } else if (schedAction === 'add') {
        const currentFlows = db.listFlows();
        if (currentFlows.length === 0) { log.warn('No flows to schedule.'); continue; }
        const flowChoice = await select({
          message: 'Which flow?',
          options: currentFlows.map(f => ({ value: f.id, label: f.name })),
        });
        if (isCancel(flowChoice)) continue;
        const cron = await text({
          message: 'Cron expression:',
          placeholder: '0 9 * * *  (daily at 9am)',
          validate: v => !v ? 'Required' : undefined,
        });
        if (isCancel(cron)) continue;
        await runScheduleAdd(flowChoice as string, cron as string);
      } else if (schedAction === 'remove') {
        const schedules = db.listSchedules();
        if (schedules.length === 0) { log.warn('No schedules.'); continue; }
        const schedChoice = await select({
          message: 'Which schedule?',
          options: schedules.map(s => ({ value: s.id, label: `${s.name} → ${s.cronExpression}` })),
        });
        if (isCancel(schedChoice)) continue;
        await runScheduleRemove(schedChoice as string);
      }
    }

    // ── APP ─────────────────────────────────────────────────
    else if (action === 'app') {
      await runDesktopApp();
    }

    // ── STATUS ──────────────────────────────────────────────
    else if (action === 'status') {
      console.log();
      await runStatus();
      console.log();
      await _pause();
    }
  }
}

function _pause(): Promise<void> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.gray('  Press Enter to continue...'), () => { rl.close(); resolve(); });
  });
}

// ============================================
// MAIN
// ============================================

const args = process.argv.slice(2);
const cmd = args[0];
const db = new DatabaseManager();

async function main() {
  if (!cmd) {
    await runInteractive();
    db.close();
    return;
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printLogo(); divider(); console.log();
    console.log(chalk.bold('  Commands\n'));
    const C = (s: string) => chalk.cyan(s);
    const G = (s: string) => chalk.gray(s);
    const pad = 36;
    console.log(`  ${C('init').padEnd(pad)}${G('Initialize Flowmind')}`);
    console.log(`  ${C('learn <url> [name]').padEnd(pad)}${G('Record a flow (real browser)')}`);
    console.log(`  ${C('run <id|name>').padEnd(pad)}${G('Execute a flow')}`);
    console.log(`  ${C('flow:list').padEnd(pad)}${G('List all flows')}`);
    console.log(`  ${C('flow:fix <id|name>').padEnd(pad)}${G('Repair broken selectors interactively')}`);
    console.log(`  ${C('flow:delete <id|name>').padEnd(pad)}${G('Delete a flow')}`);
    console.log(`  ${C('flow:export <id|name>').padEnd(pad)}${G('Export flow to JSON')}`);
    console.log(`  ${C('flow:import <file>').padEnd(pad)}${G('Import flow from JSON')}`);
    console.log(`  ${C('flow:schedule <id> "<cron>"').padEnd(pad)}${G('Schedule a flow (e.g. "0 9 * * *")')}`);
    console.log(`  ${C('schedule:list').padEnd(pad)}${G('List all schedules')}`);
    console.log(`  ${C('schedule:remove <id>').padEnd(pad)}${G('Remove a schedule')}`);
    console.log(`  ${C('serve').padEnd(pad)}${G('Start scheduler daemon')}`);
    console.log(`  ${C('run:list').padEnd(pad)}${G('List recent runs')}`);
    console.log(`  ${C('run:show <id>').padEnd(pad)}${G('Show run details + screenshots')}`);
    console.log(`  ${C('run:diff <id1> <id2>').padEnd(pad)}${G('Visual screenshot diff between two runs')}`);
    console.log(`  ${C('run:analyze <id>').padEnd(pad)}${G('AI analysis of a failed run [AI]')}`);
    console.log(`  ${C('status').padEnd(pad)}${G('Statistics and AI provider info')}`);
    console.log();
    console.log(`  ${G('[AI] = enhanced by AI if available (Ollama local or Anthropic cloud)')}`);
    console.log();
    process.exit(0);
  }

  switch (cmd) {
    case 'init':            console.log(chalk.green('  ✓ Initialized at ' + DATA_PATH)); break;
    case 'learn':
      if (!args[1]) { errorMsg('URL required'); process.exit(1); }
      await runLearn(args[1]); break;
    case 'run':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runFlow(args[1]); break;
    case 'flow:list':       await runListFlows(); break;
    case 'flow:fix':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runFixFlow(args[1]); break;
    case 'flow:delete':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runDeleteFlow(args[1]); break;
    case 'flow:export':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runExportFlow(args[1]); break;
    case 'flow:import':
      if (!args[1]) { errorMsg('File path required'); process.exit(1); }
      await runImportFlow(args[1]); break;
    case 'flow:schedule':
      if (!args[1] || !args[2]) { errorMsg('Usage: flow:schedule <id|name> "<cron expression>"'); process.exit(1); }
      await runScheduleAdd(args[1], args[2]); break;
    case 'schedule:list':   await runScheduleList(); break;
    case 'schedule:remove':
      if (!args[1]) { errorMsg('Schedule ID required'); process.exit(1); }
      await runScheduleRemove(args[1]); break;
    case 'serve':           await runServe(); break;
    case 'run:list':        await runListRuns(); break;
    case 'run:show':
      if (!args[1]) { errorMsg('Run ID required'); process.exit(1); }
      await runShowRun(args[1]); break;
    case 'run:diff':
      if (!args[1] || !args[2]) { errorMsg('Usage: run:diff <run1-id> <run2-id>'); process.exit(1); }
      await runDiff(args[1], args[2]); break;
    case 'run:analyze':
      if (!args[1]) { errorMsg('Run ID required'); process.exit(1); }
      await runAnalyzeRun(args[1]); break;
    case 'explore':
      if (!args[1]) { errorMsg('URL required'); process.exit(1); }
      await runExplore(args[1]); break;
    case 'explore:confirm':
      if (!args[1]) { errorMsg('Report ID required'); process.exit(1); }
      await runExploreConfirm(args[1]); break;
    case 'app':             await runDesktopApp(); break;
    case 'status':          await runStatus(); break;
    default:
      errorMsg('Unknown command: ' + cmd);
      console.log('  Run without args for help.');
      process.exit(1);
  }

  if (cmd !== 'serve') db.close();
}

main().catch(err => { errorMsg(String(err)); process.exit(1); });
