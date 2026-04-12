#!/usr/bin/env node

/**
 * Flowmind CLI — Memory-driven Web Automation
 * v0.6.0
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
    fs.mkdirSync(path.join(DATA_PATH, 'sessions'), { recursive: true });
    this.db = new Database(DB_PATH);
    this.initialize();
    this.runMigrations();
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
      CREATE TABLE IF NOT EXISTS suites (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS suite_flows (
        id TEXT PRIMARY KEY, suite_id TEXT NOT NULL, flow_id TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (suite_id) REFERENCES suites(id) ON DELETE CASCADE,
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS baselines (
        id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, step_number INTEGER NOT NULL,
        screenshot_path TEXT NOT NULL, captured_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(flow_id, step_number)
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
      CREATE TABLE IF NOT EXISTS run_data (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        variable_name TEXT NOT NULL,
        variable_value TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        UNIQUE(run_id, variable_name),
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );
    `);
  }

  // ---- Flows ----
  createFlow(data: { name: string; description?: string; appUrl?: string; graph?: object; createdBy?: string }) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const createdBy = data.createdBy || 'human';
    this.db.prepare(`INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, data.name, data.description || null, data.appUrl || null, JSON.stringify(data.graph || {}), now, now, createdBy);
    return this.getFlow(id)!;
  }
  verifyFlow(id: string) { this.db.prepare('UPDATE flows SET verified = 1 WHERE id = ?').run(id); }
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
      createdAt: new Date(r.created_at as string), updatedAt: new Date(r.updated_at as string),
      createdBy: r.created_by as string || 'human',
      verified: Boolean(r.verified) };
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
  updateStep(id: string, data: Partial<{ status: string; duration: number; errorMessage: string; screenshotPath: string; diffPercent: number }>) {
    const updates: string[] = []; const values: unknown[] = [];
    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.duration !== undefined) { updates.push('duration = ?'); values.push(data.duration); }
    if (data.errorMessage !== undefined) { updates.push('error_message = ?'); values.push(data.errorMessage); }
    if (data.screenshotPath !== undefined) { updates.push('screenshot_path = ?'); values.push(data.screenshotPath); }
    if (data.diffPercent !== undefined) { updates.push('diff_percent = ?'); values.push(data.diffPercent); }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE steps SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getStep(id);
  }
  private mapStep(r: Record<string, unknown>) {
    return { id: r.id as string, runId: r.run_id as string, stepNumber: r.step_number as number,
      name: r.name as string, action: r.action as string, selector: r.selector as string | null,
      value: r.value as string | null, status: r.status as string, duration: r.duration as number | null,
      errorMessage: r.error_message as string | null, screenshotPath: r.screenshot_path as string | null,
      diffPercent: r.diff_percent as number | null };
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

  // ---- DB migrations ----
  private runMigrations() {
    try { this.db.exec('ALTER TABLE steps ADD COLUMN diff_percent REAL'); } catch {}
    try { this.db.exec("ALTER TABLE flows ADD COLUMN created_by TEXT NOT NULL DEFAULT 'human'"); } catch {}
    try { this.db.exec('ALTER TABLE flows ADD COLUMN verified INTEGER NOT NULL DEFAULT 0'); } catch {}
    try { this.db.exec("ALTER TABLE run_data ADD COLUMN captured_at TEXT DEFAULT (datetime('now'))"); } catch {}
  }

  // ---- Suites ----
  createSuite(data: { name: string; description?: string }) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO suites (id, name, description) VALUES (?, ?, ?)`).run(id, data.name, data.description || null);
    return this.getSuite(id)!;
  }
  getSuite(id: string) {
    const r = this.db.prepare('SELECT * FROM suites WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? { id: r.id as string, name: r.name as string, description: r.description as string | null, createdAt: new Date(r.created_at as string) } : null;
  }
  findSuiteByNameOrId(q: string) {
    const byId = this.db.prepare('SELECT * FROM suites WHERE id LIKE ?').all(q + '%') as Record<string, unknown>[];
    if (byId.length === 1) return this.getSuite(byId[0].id as string);
    const byName = this.db.prepare('SELECT * FROM suites WHERE LOWER(name) LIKE ?').all(`%${q.toLowerCase()}%`) as Record<string, unknown>[];
    if (byName.length === 1) return this.getSuite(byName[0].id as string);
    if (byName.length > 1) return this.getSuite(byName[0].id as string);
    return null;
  }
  listSuites() {
    return (this.db.prepare('SELECT * FROM suites ORDER BY created_at DESC').all() as Record<string, unknown>[]).map(r => ({ id: r.id as string, name: r.name as string, description: r.description as string | null, createdAt: new Date(r.created_at as string) }));
  }
  deleteSuite(id: string) { return this.db.prepare('DELETE FROM suites WHERE id = ?').run(id).changes > 0; }
  addFlowToSuite(suiteId: string, flowId: string) {
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM suite_flows WHERE suite_id = ?').get(suiteId) as { c: number }).c;
    const id = uuidv4();
    this.db.prepare(`INSERT INTO suite_flows (id, suite_id, flow_id, order_index) VALUES (?, ?, ?, ?)`).run(id, suiteId, flowId, count);
  }
  removeFlowFromSuite(suiteId: string, flowId: string) {
    this.db.prepare('DELETE FROM suite_flows WHERE suite_id = ? AND flow_id = ?').run(suiteId, flowId);
  }
  getSuiteFlows(suiteId: string) {
    return (this.db.prepare('SELECT sf.*, f.name as flow_name FROM suite_flows sf JOIN flows f ON sf.flow_id = f.id WHERE sf.suite_id = ? ORDER BY sf.order_index').all(suiteId) as Record<string, unknown>[]).map(r => ({ id: r.id as string, suiteId: r.suite_id as string, flowId: r.flow_id as string, flowName: r.flow_name as string, orderIndex: r.order_index as number }));
  }

  // ---- Baselines ----
  setBaseline(flowId: string, stepNumber: number, screenshotPath: string) {
    const existing = this.db.prepare('SELECT id FROM baselines WHERE flow_id = ? AND step_number = ?').get(flowId, stepNumber) as { id: string } | undefined;
    if (existing) {
      this.db.prepare('UPDATE baselines SET screenshot_path = ?, captured_at = datetime(\'now\') WHERE id = ?').run(screenshotPath, existing.id);
    } else {
      this.db.prepare('INSERT INTO baselines (id, flow_id, step_number, screenshot_path) VALUES (?, ?, ?, ?)').run(uuidv4(), flowId, stepNumber, screenshotPath);
    }
  }
  getBaseline(flowId: string, stepNumber: number) {
    return this.db.prepare('SELECT * FROM baselines WHERE flow_id = ? AND step_number = ?').get(flowId, stepNumber) as { id: string; flow_id: string; step_number: number; screenshot_path: string; captured_at: string } | undefined;
  }
  clearBaselines(flowId: string) { this.db.prepare('DELETE FROM baselines WHERE flow_id = ?').run(flowId); }
  listBaselines(flowId: string) {
    return (this.db.prepare('SELECT * FROM baselines WHERE flow_id = ? ORDER BY step_number').all(flowId) as Record<string, unknown>[]).map(r => ({ stepNumber: r.step_number as number, screenshotPath: r.screenshot_path as string, capturedAt: new Date(r.captured_at as string) }));
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

  // ---- Run Data (extracted variables) ----
  saveRunData(runId: string, stepNumber: number, variableName: string, value: string) {
    const id = uuidv4();
    this.db.prepare('INSERT OR REPLACE INTO run_data (id, run_id, step_number, variable_name, variable_value) VALUES (?,?,?,?,?)')
      .run(id, runId, stepNumber, variableName, value);
  }
  getRunData(runId: string): Array<{variableName: string; variableValue: string; stepNumber: number}> {
    return (this.db.prepare('SELECT * FROM run_data WHERE run_id = ? ORDER BY step_number').all(runId) as any[])
      .map(r => ({ variableName: r.variable_name, variableValue: r.variable_value, stepNumber: r.step_number }));
  }

  // ---- Flow Stats ----
  getFlowStats(flowId: string): { totalRuns: number; passRate: number; lastRunStatus: string | null; lastRunAt: string | null } {
    const r = this.db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='passed' THEN 1 ELSE 0 END) as passed, MAX(started_at) as last_run_at FROM runs WHERE flow_id = ?").get(flowId) as any;
    const last = this.db.prepare('SELECT status FROM runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT 1').get(flowId) as any;
    return {
      totalRuns: r?.total || 0,
      passRate: r?.total > 0 ? (r.passed || 0) / r.total : 0,
      lastRunStatus: last?.status || null,
      lastRunAt: r?.last_run_at || null,
    };
  }
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

function timeAgo(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return date.toLocaleDateString();
}

function passRateDots(rate: number, total: number): string {
  if (total === 0) return chalk.gray('no runs');
  const filled = Math.round(rate * 6);
  return chalk.green('●'.repeat(filled)) + chalk.gray('○'.repeat(6 - filled)) + chalk.gray(` ${Math.round(rate * 100)}%`);
}

function progressBar(current: number, total: number, width = 20): string {
  const filled = Math.round((current / total) * width);
  return chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(width - filled));
}

function getEnvLabel(url: string): { label: string; color: (s: string) => string } {
  if (!url) return { label: '', color: chalk.white };
  if (url.includes('localhost') || url.includes('127.0.0.1')) return { label: 'local', color: chalk.blue };
  if (url.includes('staging') || url.includes('stage') || url.includes('preprod')) return { label: 'staging', color: chalk.yellow };
  return { label: 'production', color: chalk.red };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

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
  type: string; selector?: string; value?: string; url?: string; label?: string; timestamp: number; assertType?: string;
}

// ============================================
// VARIABLES SUPPORT
// ============================================

function parseVars(argv: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  // Parse --var key=value from argv
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--var' && argv[i + 1]) {
      const eq = argv[i + 1].indexOf('=');
      if (eq !== -1) {
        vars[argv[i + 1].slice(0, eq)] = argv[i + 1].slice(eq + 1);
      }
      i++;
    }
  }
  // Also read .flowmind.env from CWD
  const envFile = path.join(process.cwd(), '.flowmind.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq !== -1) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key && !(key in vars)) vars[key] = val; // argv takes precedence
      }
    }
  }
  return vars;
}

function resolveVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{{${k}}}`);
}

// ============================================
// SESSION HELPERS
// ============================================

async function loadSession(context: import('playwright').BrowserContext, name: string) {
  const sessionPath = path.join(DATA_PATH, 'sessions', `${name}.json`);
  if (!fs.existsSync(sessionPath)) throw new Error(`Session not found: ${name}. Run with --save-session first.`);
  const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  await context.addCookies(cookies);
  return cookies.length;
}

async function saveSession(context: import('playwright').BrowserContext, name: string) {
  const cookies = await context.cookies();
  const sessionPath = path.join(DATA_PATH, 'sessions', `${name}.json`);
  fs.writeFileSync(sessionPath, JSON.stringify(cookies, null, 2));
  return cookies.length;
}

// ============================================
// COMMANDS — learn
// ============================================

async function runLearn(url: string, nameOverride?: string) {
  printLogo(); divider();
  let flowName = nameOverride || args[2];
  if (!flowName) { console.log(chalk.cyan('\n  Enter flow name: ')); flowName = await askQuestion('  > '); }
  if (!flowName) { errorMsg('Flow name required'); process.exit(1); }

  info('Target URL: ' + chalk.cyan(url));
  info('Flow name:  ' + chalk.cyan(flowName));
  console.log();

  const flow = db.createFlow({ name: flowName, appUrl: url, createdBy: 'human' });
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

  // Multi-tab support: capture actions from popups/new tabs
  context.on('page', async (newPage) => {
    capturedActions.push({ type: 'navigate', url: newPage.url(), timestamp: Date.now(), label: '[new tab]' });
    await newPage.exposeFunction('__flowmindRecord', (action: RecordedAction) => {
      const last = capturedActions[capturedActions.length - 1];
      if (last && last.type === action.type && last.selector === action.selector && Date.now() - last.timestamp < 500) return;
      const tabAction = { ...action, label: action.label ? `[popup] ${action.label}` : action.label };
      const sanitized = { ...tabAction, value: tabAction.value ? sanitizePII(tabAction.value) : tabAction.value };
      capturedActions.push(sanitized);
      process.stdout.write(`  ${chalk.cyan('[popup]')} ${sanitized.type} ${sanitized.label ? chalk.white(`"${sanitized.label}"`) : ''} ${chalk.gray(sanitized.selector || '')}\n`);
    });
    await newPage.addInitScript(RECORDER_SCRIPT);
    newPage.on('framenavigated', (frame) => {
      if (frame !== newPage.mainFrame()) return;
      const navUrl = frame.url();
      if (navUrl === 'about:blank') return;
      capturedActions.push({ type: 'navigate', url: navUrl, timestamp: Date.now(), label: '[popup nav]' });
      process.stdout.write(`  ${chalk.cyan('[popup]')} navigate → ${chalk.cyan(navUrl)}\n`);
    });
  });

  console.log(chalk.bgCyan.black.bold('  RECORDING  ') + chalk.bold(' 👤 human flow — browser is live\n'));
  console.log(chalk.gray('  Every click, fill, and navigation is captured automatically.'));
  console.log(chalk.gray('  Assertions: type  ') + chalk.cyan('a text:<expected>') + chalk.gray('  |  ') + chalk.cyan('a url:<path>') + chalk.gray('  |  ') + chalk.cyan('a title:<text>'));
  console.log(chalk.gray('  Done?       press ') + chalk.cyan('Enter') + chalk.gray(' or type ') + chalk.cyan('done') + chalk.gray('\n'));
  await page.goto(url);

  // Custom readline that supports assertion commands
  if (!browserClosed) {
    await new Promise<void>((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed || ['done', 'stop', 'finish'].includes(trimmed.toLowerCase())) {
          rl.close(); resolve(); return;
        }
        // Assertion commands: a text: <val>, a url: <val>, a el: <sel>, a title: <val>
        const assertMatch = trimmed.match(/^a (text|url|el|title):\s*(.+)$/i);
        if (assertMatch) {
          const assertType = assertMatch[1].toLowerCase();
          const assertValue = assertMatch[2].trim();
          const typeMap: Record<string, string> = { text: 'assert:text', url: 'assert:url', el: 'assert:element', title: 'assert:title' };
          const actionType = typeMap[assertType] || `assert:${assertType}`;
          const isEl = assertType === 'el';
          const action: RecordedAction = { type: actionType, timestamp: Date.now(), assertType, ...(isEl ? { selector: assertValue } : { value: assertValue }) };
          capturedActions.push(action);
          process.stdout.write(`  ${chalk.magenta('✓')} assertion added: ${chalk.yellow(actionType)} ${chalk.white(assertValue)}\n`);
        }
      });
      rl.on('close', () => resolve());
    }).catch(() => {});
  }
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
    else if (action.type.startsWith('assert:')) {
      const isEl = action.type === 'assert:element';
      node = { id: nodeId, type: 'action', label: `Assert ${action.type.replace('assert:', '')} "${isEl ? action.selector : action.value}"`, action: action.type, ...(isEl ? { selector: action.selector } : { value: action.value }) };
    }
    else return;
    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });
  nodes.push({ id: 'end', type: 'end', label: 'End' });
  edges.push({ id: `e${capturedActions.length}`, source: prevId, target: 'end' });
  db.updateFlow(flow.id, { graph: { nodes, edges, appUrl: url } });

  divider();
  console.log(chalk.bgGreen.black.bold('  SAVED  ') + chalk.bold(` ${capturedActions.length} actions recorded — 👤 human flow\n`));
  const counts = capturedActions.reduce((a, c) => { a[c.type] = (a[c.type] || 0) + 1; return a; }, {} as Record<string, number>);
  const actionIcons: Record<string, string> = { navigate: '🌐', click: '🖱 ', fill: '⌨️ ', select: '📋', check: '☑️ ', assert: '✅' };
  const countStrs = Object.entries(counts).map(([t, n]) => `${actionIcons[t] || '●'} ${n} ${t}`);
  console.log('  ' + countStrs.join(chalk.gray('  ·  ')));
  console.log();
  info(`Flow ID: ${chalk.gray(flow.id.slice(0, 8))}`);
  info(`Run:     ${chalk.green('node flowmind.js run ' + flow.id.slice(0, 8))}`);
  info(`Fix:     ${chalk.cyan('node flowmind.js flow:fix ' + flow.id.slice(0, 8))}`);
  console.log();
}

// ============================================
// COMMANDS — run
// ============================================

async function executeFlow(flowId: string, vars?: Record<string, string>, opts?: { sessionLoad?: string; sessionSave?: string; quiet?: boolean; jsonOutput?: boolean }): Promise<{ passed: boolean; runId: string; duration: number; extractedData: Record<string, string> }> {
  const log = (s: string) => { if (!opts?.jsonOutput && !opts?.quiet) process.stdout.write(s + '\n'); };

  let flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) { errorMsg('Flow not found: ' + flowId); process.exit(1); }

  let graph: { nodes: Record<string, unknown>[]; edges: object[]; appUrl?: string };
  try { graph = JSON.parse(flow.graph); } catch { errorMsg('Invalid graph'); process.exit(1); return { passed: false, runId: '', duration: 0, extractedData: {} }; }

  if (!graph.nodes?.length) { warn('Empty flow.'); return { passed: false, runId: '', duration: 0, extractedData: {} }; }

  if (!opts?.jsonOutput && vars && Object.keys(vars).length > 0) {
    console.log(chalk.gray('  Variables: ' + Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(', ')));
  }

  // Show run header with env + provenance
  const startUrl = graph.appUrl || flow.appUrl;
  const { label: envLabel, color: envColor } = getEnvLabel(startUrl || '');
  const creatorIcon = flow.createdBy === 'agent' ? chalk.magenta(' 🤖') : chalk.blue(' 👤');
  const verifiedBadge = flow.verified ? chalk.green(' ✓') : '';
  const provenanceStr = creatorIcon + verifiedBadge;
  if (!opts?.jsonOutput) {
    if (envLabel === 'production') {
      console.log(chalk.red('\n  ┌─────────────────────────────────────┐'));
      console.log(chalk.red('  │ ⚠ PRODUCTION ENVIRONMENT            │'));
      console.log(chalk.red('  └─────────────────────────────────────┘'));
    }
    console.log(chalk.bold('\n  Running: ') + chalk.white(flow.name) + provenanceStr);
    if (startUrl) console.log('  ' + chalk.gray('URL: ') + envColor(startUrl));
  }

  const run = db.createRun(flow.id);
  const screenshotsDir = db.getScreenshotsPath(run.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  if (opts?.sessionLoad) {
    try {
      const count = await loadSession(context, opts.sessionLoad);
      if (!opts?.quiet) info(`Session: ${chalk.cyan(opts.sessionLoad)} loaded (${count} cookies)`);
    } catch (e) { warn(String(e)); }
  }

  if (startUrl) await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const actionNodes = graph.nodes.filter(n => n.type === 'action') as Array<Record<string, unknown>>;
  let stepNum = 1, failed = false;
  let failedStepInfo: { name: string; action: string; selector?: string | null; errorMessage: string } | null = null;
  const runStart = Date.now();
  const runVars: Record<string, string> = { ...(vars || {}) };

  // Load pixelmatch for baseline diffs (optional)
  let PNG: typeof import('pngjs').PNG | null = null;
  let pixelmatch: ((img1: Uint8Array, img2: Uint8Array, output: Uint8Array | null, width: number, height: number, options?: object) => number) | null = null;
  try {
    const pngjs = await import('pngjs');
    PNG = pngjs.PNG;
    pixelmatch = (await import('pixelmatch')).default;
  } catch { /* optional */ }

  for (const node of actionNodes) {
    const label = node.label as string, action = node.action as string;
    const barStr = progressBar(stepNum, actionNodes.length);
    log(chalk.cyan(`\n  [${stepNum}/${actionNodes.length}]`) + ` ${barStr} ` + chalk.white(label));
    const step = db.createStep({ runId: run.id, stepNumber: stepNum, name: label, action, selector: node.selector as string | undefined, value: node.value as string | undefined });
    const t = Date.now();
    try {
      // Resolve vars in node fields using runVars (includes extracted vars)
      const resolvedNode = {
        ...node,
        url: node.url ? resolveVars(node.url as string, runVars) : node.url,
        value: node.value ? resolveVars(node.value as string, runVars) : node.value,
        selector: node.selector ? resolveVars(node.selector as string, runVars) : node.selector,
      };
      await executeAction(page, action, resolvedNode);
      // Auto wait-for-nav after clicks — resolves immediately if no navigation occurred
      if (action === 'click') {
        await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      }
      const duration = Date.now() - t;
      const screenshot = await page.screenshot();
      const sp = path.join(screenshotsDir, `step-${stepNum}.png`);
      fs.writeFileSync(sp, screenshot);

      // Visual baseline diff
      let diffPercent: number | undefined;
      const baseline = db.getBaseline(flow!.id, stepNum);
      if (baseline && PNG && pixelmatch && fs.existsSync(baseline.screenshot_path)) {
        try {
          const img1 = PNG.sync.read(fs.readFileSync(baseline.screenshot_path));
          const img2 = PNG.sync.read(screenshot);
          const w = Math.min(img1.width, img2.width);
          const h = Math.min(img1.height, img2.height);
          const diff = new PNG({ width: w, height: h });
          const numDiff = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
          diffPercent = parseFloat(((numDiff / (w * h)) * 100).toFixed(1));
          if (diffPercent > 5) {
            log(chalk.yellow(`      ~ visual change: ${diffPercent}%`));
          }
        } catch { /* skip diff on error */ }
      }

      db.updateStep(step.id, { status: 'passed', duration, screenshotPath: sp, ...(diffPercent !== undefined ? { diffPercent } : {}) });
      if (diffPercent !== undefined && diffPercent > 5) {
        db.updateStep(step.id, { errorMessage: `[DIFF:${diffPercent}%]` });
      }
      log(chalk.green(`      ✓ passed`) + chalk.gray(` (${duration}ms)`));

      // Handle extract action — save extracted data
      if (action === 'extract' && (resolvedNode as any).__extracted) {
        const extracted = (resolvedNode as any).__extracted as { variable: string; value: string };
        db.saveRunData(run.id, stepNum, extracted.variable, extracted.value);
        runVars[extracted.variable] = extracted.value;
        log(chalk.cyan(`      → extracted ${extracted.variable}: ${chalk.white(extracted.value.slice(0, 60))}`));
      }
    } catch (err) {
      const duration = Date.now() - t;
      let errorMessage = err instanceof Error ? err.message.split('\n')[0] : String(err);

      // Healing selectors: try AI-suggested selector on click/fill/select failures
      if (['click', 'fill', 'select'].includes(action)) {
        const healed = await attemptHeal(page, label, node.selector as string, action);
        if (healed) {
          try {
            const healedNode = { ...node, selector: healed };
            await executeAction(page, action, healedNode);
            if (action === 'click') await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
            const healDuration = Date.now() - t;
            const screenshot = await page.screenshot();
            const sp = path.join(screenshotsDir, `step-${stepNum}.png`);
            fs.writeFileSync(sp, screenshot);
            log(chalk.yellow(`      ~ healed selector: ${healed}`));
            db.updateStep(step.id, { status: 'passed', duration: healDuration, screenshotPath: sp, errorMessage: `[HEALED: ${healed}]` });
            log(chalk.green(`      ✓ passed after heal (${healDuration}ms)`));
            stepNum++;
            continue;
          } catch { /* healing also failed, fall through */ }
        }
      }

      try {
        const screenshot = await page.screenshot();
        const sp = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
        fs.writeFileSync(sp, screenshot);
        db.updateStep(step.id, { status: 'failed', duration, errorMessage, screenshotPath: sp });
      } catch { db.updateStep(step.id, { status: 'failed', duration, errorMessage }); }
      log(chalk.red(`      ✗ failed (${duration}ms)`));
      log(chalk.red(`        └─ ${errorMessage}`));
      failedStepInfo = { name: label, action, selector: node.selector as string | null, errorMessage };
      failed = true;
      break;
    }
    stepNum++;
  }

  if (opts?.sessionSave) {
    try {
      const count = await saveSession(context, opts.sessionSave);
      if (!opts?.quiet) success(`Session saved: ${chalk.cyan(opts.sessionSave)} (${count} cookies)`);
    } catch (e) { warn(`Could not save session: ${e}`); }
  }

  await browser.close();

  const totalDuration = Date.now() - runStart;
  let summary: string | null = null;
  if (failed && failedStepInfo) {
    if (!opts?.jsonOutput) process.stdout.write(chalk.gray('\n  Analyzing failure...\n'));
    const steps = db.listSteps(run.id);
    const result = await callAI(buildFailurePrompt({ flowName: flow.name, steps: steps.map(s => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })), failedStep: failedStepInfo }));
    if (result) {
      summary = result.text;
      if (!opts?.jsonOutput) process.stdout.write(chalk.gray(`  (via ${result.provider})\n`));
    }
  }

  db.updateRun(run.id, { status: failed ? 'failed' : 'passed', completedAt: new Date(), duration: totalDuration, errorMessage: failedStepInfo?.errorMessage, summary: summary || undefined });

  // Collect extracted data
  const extractedData: Record<string, string> = {};
  db.getRunData(run.id).forEach(d => { extractedData[d.variableName] = d.variableValue; });

  if (opts?.jsonOutput) {
    const steps = db.listSteps(run.id);
    console.log(JSON.stringify({
      passed: !failed, runId: run.id, flowId: flow.id, flowName: flow.name,
      duration: totalDuration, steps: steps.map(s => ({
        stepNumber: s.stepNumber, name: s.name, status: s.status, duration: s.duration,
        screenshotPath: s.screenshotPath, errorMessage: s.errorMessage
      })),
      extractedData, summary
    }));
    return { passed: !failed, runId: run.id, duration: totalDuration, extractedData };
  }

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
  return { passed: !failed, runId: run.id, duration: totalDuration, extractedData };
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
    case 'assert:text': {
      // Use first() to handle multiple matches, or fall back to body text check
      const val = node.value as string;
      const count = await page.getByText(val, { exact: false }).count();
      const visible = count > 0
        ? await page.getByText(val, { exact: false }).first().isVisible({ timeout: 5000 }).catch(() => false)
        : false;
      if (!visible) {
        // Final fallback: check raw body text
        const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
        if (!bodyText.includes(val)) throw new Error(`assert:text failed — "${val}" not visible on page`);
      }
      break;
    }
    case 'assert:url': {
      const currentUrl = page.url();
      if (!currentUrl.includes(node.value as string)) throw new Error(`assert:url failed — URL "${currentUrl}" does not contain "${node.value}"`);
      break;
    }
    case 'assert:element': {
      const count = await page.locator(node.selector as string).count();
      if (count === 0) throw new Error(`assert:element failed — selector "${node.selector}" not found`);
      break;
    }
    case 'assert:title': {
      const title = await page.title();
      if (!title.toLowerCase().includes((node.value as string).toLowerCase())) throw new Error(`assert:title failed — title "${title}" does not contain "${node.value}"`);
      break;
    }
    case 'assert:no-errors': {
      // Checked via console error tracking; just passes by default here
      break;
    }
  }
}

// ============================================
// HEALING SELECTORS
// ============================================

async function attemptHeal(page: import('playwright').Page, label: string, selector: string, _action: string): Promise<string | null> {
  if (!selector) return null;
  process.stdout.write(chalk.yellow('      ~ attempting selector heal...\n'));

  // Strategy 1: Text-based heuristics — extract meaningful words from label
  // e.g. "Click Login link" → "Login", "Fill email field" → "email"
  const cleaned = label
    .replace(/^(click|tap|press|fill|type in|type|select|check|uncheck|submit|go to|navigate to)\s+/i, '')
    .replace(/\s+(link|button|field|input|checkbox|dropdown|option|element|btn|tab|menu|item)$/i, '')
    .trim();

  const textCandidates: Array<[string, string]> = [
    [`a:has-text("${cleaned}")`, 'text-link'],
    [`button:has-text("${cleaned}")`, 'text-button'],
    [`:has-text("${cleaned}") >> visible=true`, 'text-any'],
    // Try partial label words
    ...cleaned.split(/\s+/).filter(w => w.length > 2).slice(0, 3).flatMap(word => [
      [`a:has-text("${word}")`, 'word-link'],
      [`button:has-text("${word}")`, 'word-button'],
    ] as Array<[string, string]>),
  ];

  for (const [candidate, strategy] of textCandidates) {
    try {
      const count = await page.locator(candidate).count();
      if (count > 0) {
        process.stdout.write(chalk.yellow(`      ~ healed via ${strategy}: ${candidate}\n`));
        return candidate;
      }
    } catch { /* invalid selector syntax, skip */ }
  }

  // Strategy 2: AI-based heal (only if AI available)
  const hasAI = !!(await isOllamaRunning()) || !!process.env.ANTHROPIC_API_KEY;
  if (!hasAI) return null;
  try {
    const pageTitle = await page.title().catch(() => '');
    const elementsHtml = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role="button"]'));
      return els.slice(0, 30).map(el => {
        const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' ');
        const text = (el as HTMLElement).innerText?.trim().slice(0, 40) || '';
        return `<${el.tagName.toLowerCase()} ${attrs}>${text}</${el.tagName.toLowerCase()}>`;
      }).join('\n');
    }).catch(() => '');

    const prompt = `Given these interactive elements on a web page, return ONLY the CSS selector (no explanation) for: "${label}"

Page: ${pageTitle}
Elements:
${elementsHtml}

Return just the selector, like: a[href="/login"]`;

    const result = await callAI(prompt);
    if (result?.text) {
      const healed = result.text.trim().replace(/^['"`]|['"`]$/g, '').split('\n')[0].trim();
      if (healed && !healed.includes(' ') && healed.length < 100) {
        // Validate it actually finds something on page
        const count = await page.locator(healed).count().catch(() => 0);
        if (count > 0) return healed;
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function runFlow(id: string, vars?: Record<string, string>) {
  printLogo(); divider();
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  console.log(chalk.bold('\n  Running: ') + chalk.white(flow.name) + '\n');
  await executeFlow(id, vars);
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
      // Show AI healing suggestion
      const aiSuggestion = await attemptHeal(page, node.label as string, node.selector as string, node.action as string);
      if (aiSuggestion) console.log(chalk.yellow(`      AI suggests: ${chalk.white(aiSuggestion)}`));
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
  const humanCount = flows.filter(f => f.createdBy === 'human').length;
  const agentCount = flows.filter(f => f.createdBy === 'agent').length;

  console.log(chalk.bold('\n  Flows'));
  if (flows.length > 0) {
    const parts: string[] = [];
    if (humanCount > 0) parts.push(chalk.blue(`${humanCount} human`));
    if (agentCount > 0) parts.push(chalk.magenta(`${agentCount} agent`));
    console.log(chalk.gray('  ' + parts.join(chalk.gray(' · '))) + '\n');
  } else {
    console.log();
  }

  if (flows.length === 0) { warn('No flows. Create one: ' + chalk.cyan('node flowmind.js learn <url>')); console.log(); return; }

  console.log(chalk.gray('  ID        By  Name                       Env         Steps  Pass rate      Updated'));
  console.log(chalk.gray('  ' + '─'.repeat(82)));

  for (const flow of flows) {
    let steps = 0;
    try { steps = (JSON.parse(flow.graph).nodes || []).filter((n: Record<string, unknown>) => n.type === 'action').length; } catch {}
    const runs = db.listRuns(flow.id, 20);
    const passRate = runs.length > 0 ? runs.filter(r => r.status === 'passed').length / runs.length : -1;
    const rateStr = passRate < 0 ? chalk.gray('no runs      ') : passRateDots(passRate, runs.length);
    const creatorIcon = flow.createdBy === 'agent' ? chalk.magenta('🤖') : chalk.blue('👤');
    const env = getEnvLabel(flow.appUrl || '');
    const envBadge = env.label ? env.color(`[${env.label}]`) : '          ';
    const namePad = flow.name.length > 24 ? flow.name.slice(0, 23) + '…' : flow.name.padEnd(24);
    console.log(`  ${chalk.gray(flow.id.slice(0, 8))} ${creatorIcon}  ${chalk.white(namePad)}  ${envBadge.padEnd(env.label ? 11 : 10)}  ${chalk.gray(String(steps).padEnd(5))}  ${rateStr}  ${chalk.gray(timeAgo(flow.updatedAt))}`);
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
  console.log(chalk.gray('  ID        Flow                         Status   Duration    When'));
  console.log(chalk.gray('  ' + '─'.repeat(70)));
  for (const run of runs) {
    const flow = db.getFlow(run.flowId);
    const icon = run.status === 'passed' ? chalk.green('✓') : run.status === 'failed' ? chalk.red('✗') : chalk.yellow('…');
    const statusStr = run.status === 'passed' ? chalk.green('passed') : run.status === 'failed' ? chalk.red('failed') : chalk.yellow(run.status);
    const durStr = run.duration ? (run.duration >= 1000 ? (run.duration / 1000).toFixed(1) + 's' : run.duration + 'ms') : '—';
    const when = run.startedAt ? timeAgo(run.startedAt) : '';
    console.log(`  ${chalk.gray(run.id.slice(0, 8))} ${icon} ${chalk.white((flow?.name || 'Unknown').padEnd(27).slice(0, 27))} ${statusStr.padEnd(12)} ${chalk.gray(durStr.padEnd(11))} ${chalk.gray(when)}`);
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
    const diffStr = step.diffPercent && step.diffPercent > 0 ? chalk.yellow(` ~${step.diffPercent}%`) : '';
    console.log(`    ${chalk.gray(String(step.stepNumber).padStart(2))}  ${icon}  ${chalk.white(step.name)} ${chalk.gray(step.duration ? step.duration + 'ms' : '')}${diffStr}`);
    if (step.errorMessage && step.errorMessage.startsWith('[DIFF:')) console.log(`         ${chalk.yellow('└─ ' + step.errorMessage)}`);
    else if (step.errorMessage && step.errorMessage.startsWith('[HEALED:')) console.log(`         ${chalk.yellow('└─ ' + step.errorMessage)}`);
    else if (step.status === 'failed' && step.errorMessage) console.log(`         ${chalk.red('└─ ' + step.errorMessage.slice(0, 80))}`);
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
  const humanFlows = flows.filter(f => f.createdBy === 'human').length;
  const agentFlows = flows.filter(f => f.createdBy === 'agent').length;

  console.log(chalk.bold('\n  Statistics\n'));

  // Flows with creator breakdown
  const creatorStr = flows.length > 0
    ? chalk.gray(' (') + chalk.blue(`${humanFlows} 👤`) + chalk.gray(' · ') + chalk.magenta(`${agentFlows} 🤖`) + chalk.gray(')')
    : '';
  console.log('  ' + chalk.gray('Flows:        ') + chalk.white(String(flows.length)) + creatorStr);
  console.log('  ' + chalk.gray('Total Runs:   ') + chalk.white(String(runs.length)));
  console.log('  ' + chalk.gray('Passed:       ') + chalk.green(String(passed)));
  console.log('  ' + chalk.gray('Failed:       ') + chalk.red(String(failed)));
  if (runs.length > 0) {
    const rate = Math.round((passed / runs.length) * 100);
    const rateColor = rate >= 80 ? chalk.green : rate >= 50 ? chalk.yellow : chalk.red;
    const bar = progressBar(passed, runs.length, 16);
    console.log('  ' + chalk.gray('Success Rate: ') + rateColor(`${rate}%`) + chalk.gray('  ') + bar);
  }

  // Recent run sparkline (last 10)
  if (runs.length > 0) {
    const recent = runs.slice(0, 10).reverse();
    const spark = recent.map(r => r.status === 'passed' ? chalk.green('▪') : chalk.red('▪')).join('');
    console.log('  ' + chalk.gray('Last 10 runs: ') + spark);
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
    db.createFlow({ name: c.name, description: c.description, appUrl: c.route, graph: JSON.parse(c.graph), createdBy: 'agent' });
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
// COMMANDS — test suites
// ============================================

async function runSuiteCreate(name: string) {
  const suite = db.createSuite({ name });
  success(`Suite created: ${chalk.white(suite.name)}`);
  info('ID: ' + chalk.gray(suite.id.slice(0, 8)));
  console.log();
}

async function runSuiteAdd(suiteName: string, flowName: string) {
  const suite = db.findSuiteByNameOrId(suiteName);
  if (!suite) { errorMsg('Suite not found: ' + suiteName); process.exit(1); }
  const flow = db.findFlowByPartialId(flowName) || db.findFlowByName(flowName);
  if (!flow) { errorMsg('Flow not found: ' + flowName); process.exit(1); }
  db.addFlowToSuite(suite.id, flow.id);
  success(`Added "${flow.name}" to suite "${suite.name}"`);
  console.log();
}

async function runSuiteList() {
  const suites = db.listSuites();
  console.log(chalk.bold('\n  Test Suites\n'));
  if (suites.length === 0) { warn('No suites. Create one: ' + chalk.cyan('node flowmind.js suite:create <name>')); console.log(); return; }
  console.log(chalk.gray('  ID        Name                          Flows'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  for (const suite of suites) {
    const flows = db.getSuiteFlows(suite.id);
    console.log(`  ${chalk.gray(suite.id.slice(0, 8))} ${chalk.white(suite.name.padEnd(28).slice(0, 28))} ${chalk.gray(String(flows.length))}`);
  }
  console.log();
}

async function runSuiteShow(name: string) {
  const suite = db.findSuiteByNameOrId(name);
  if (!suite) { errorMsg('Suite not found: ' + name); process.exit(1); }
  const flows = db.getSuiteFlows(suite.id);
  console.log(chalk.bold(`\n  Suite: ${suite.name}\n`));
  if (flows.length === 0) { warn('No flows in this suite.'); console.log(); return; }
  console.log(chalk.gray('  #   Flow Name'));
  console.log(chalk.gray('  ' + '─'.repeat(44)));
  flows.forEach((f, i) => console.log(`  ${chalk.gray(String(i + 1).padStart(2))}  ${chalk.white(f.flowName)}`));
  console.log();
}

async function runSuiteRun(name: string, vars?: Record<string, string>) {
  printLogo(); divider();
  const suite = db.findSuiteByNameOrId(name);
  if (!suite) { errorMsg('Suite not found: ' + name); process.exit(1); }
  const flows = db.getSuiteFlows(suite.id);
  if (flows.length === 0) { warn('No flows in this suite.'); return; }

  console.log(chalk.bold(`\n  Suite: ${suite.name}\n`));
  const lineWidth = 45;
  console.log(chalk.gray('  ' + '─'.repeat(lineWidth)));

  const results: Array<{ index: number; name: string; passed: boolean; duration: number; error?: string }> = [];
  const suiteStart = Date.now();

  for (let i = 0; i < flows.length; i++) {
    const sf = flows[i];
    process.stdout.write(`   ${chalk.gray(String(i + 1))}  ${chalk.white(sf.flowName.padEnd(22).slice(0, 22))}  `);
    try {
      const result = await executeFlow(sf.flowId, vars);
      const dur = result.duration;
      process.stdout.write(result.passed ? chalk.green('✓') : chalk.red('✗'));
      process.stdout.write('  ' + chalk.gray(dur + 'ms') + '\n');
      results.push({ index: i + 1, name: sf.flowName, passed: result.passed, duration: dur });
    } catch (err) {
      process.stdout.write(chalk.red('✗') + '  ' + chalk.gray('error') + '\n');
      results.push({ index: i + 1, name: sf.flowName, passed: false, duration: 0, error: String(err) });
    }
  }

  const totalDuration = Date.now() - suiteStart;
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  console.log(chalk.gray('  ' + '─'.repeat(lineWidth)));
  console.log();
  console.log(`  ${chalk.green(passed + '/' + results.length + ' passed')}  · Total: ${chalk.gray((totalDuration / 1000).toFixed(1) + 's')}`);
  console.log();

  if (failed > 0) {
    console.log(chalk.bold('  Failed:'));
    results.filter(r => !r.passed).forEach(r => console.log(`    ${chalk.red('✗')} ${chalk.white(r.name)}${r.error ? ' — ' + chalk.gray(r.error.slice(0, 60)) : ''}`));
    console.log();
    process.exitCode = 1;
  }
}

// ============================================
// COMMANDS — baselines
// ============================================

async function runBaselineSet(id: string) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }

  info(`Setting baselines for: ${chalk.white(flow.name)}`);
  const result = await executeFlow(flow.id);
  if (!result.runId) { errorMsg('Flow run failed, no baselines set.'); return; }

  const steps = db.listSteps(result.runId);
  let count = 0;
  const baselinesDir = path.join(DATA_PATH, 'baselines', flow.id);
  fs.mkdirSync(baselinesDir, { recursive: true });

  for (const step of steps) {
    if (step.screenshotPath && fs.existsSync(step.screenshotPath)) {
      const dest = path.join(baselinesDir, `step-${step.stepNumber}.png`);
      fs.copyFileSync(step.screenshotPath, dest);
      db.setBaseline(flow.id, step.stepNumber, dest);
      count++;
    }
  }
  success(`Baseline set: ${count} screenshots saved`);
  info(`Path: ${chalk.cyan(baselinesDir)}`);
  console.log();
}

async function runBaselineClear(id: string) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  db.clearBaselines(flow.id);
  success(`Baselines cleared for: ${chalk.white(flow.name)}`);
  console.log();
}

async function runBaselineShow(id: string) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  const baselines = db.listBaselines(flow.id);
  console.log(chalk.bold(`\n  Baselines: ${flow.name}\n`));
  if (baselines.length === 0) { warn('No baselines. Run: ' + chalk.cyan('node flowmind.js baseline:set ' + id)); console.log(); return; }
  for (const b of baselines) {
    console.log(`  Step ${chalk.gray(String(b.stepNumber).padStart(2))}  ${chalk.cyan(b.screenshotPath)}  ${chalk.gray(b.capturedAt.toLocaleDateString())}`);
  }
  console.log();
}

// ============================================
// COMMANDS — natural language create
// ============================================

async function runCreate(description?: string) {
  printLogo(); divider();

  if (!description) {
    description = await askQuestion(chalk.cyan('\n  Describe the automation flow: '));
    if (!description) { errorMsg('Description required'); process.exit(1); }
  }

  const baseUrl = await askQuestion(chalk.cyan('  Base URL for this flow (e.g. http://localhost:3000): '));
  if (!baseUrl) { errorMsg('Base URL required'); process.exit(1); }

  const hasAI = !!(await isOllamaRunning()) || !!process.env.ANTHROPIC_API_KEY;
  if (!hasAI) { errorMsg('No AI provider available. Run Ollama locally or set ANTHROPIC_API_KEY.'); process.exit(1); }

  info('Generating flow from description...');

  const prompt = `Convert this automation test description into a Playwright test flow.

Description: "${description}"
Base URL: "${baseUrl}"

Output ONLY a valid JSON array of steps, no other text:
[
  {"name": "Step name", "action": "navigate|click|fill|select|assert:text|assert:url|assert:element", "url": "...", "selector": "...", "value": "..."}
]

Rules:
- Use "navigate" for page navigation (include full URL)
- Use "click" for button/link clicks (guess a reasonable selector)
- Use "fill" for text inputs (include the test value)
- Use "assert:text" to verify text appears on page
- Use "assert:url" to verify URL contains a string
- Only include fields relevant to each action
- selector and url fields must be CSS selectors or full URLs`;

  const result = await callAI(prompt);
  if (!result) { errorMsg('AI failed to generate flow.'); process.exit(1); }

  let steps: Array<{ name: string; action: string; url?: string; selector?: string; value?: string }>;
  try {
    const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim();
    steps = JSON.parse(cleaned);
    if (!Array.isArray(steps)) throw new Error('Not an array');
  } catch {
    errorMsg('AI returned invalid JSON. Try again with a clearer description.');
    console.log(chalk.gray('  AI response: ' + result.text.slice(0, 200)));
    process.exit(1);
    return;
  }

  // Generate a clean short flow name via AI
  let flowName = 'Generated Flow';
  {
    const nameResult = await callAI(`Give a short (2-5 words) flow name for this automation: "${description}". Reply with ONLY the name, title-cased, no punctuation. Examples: "Login Flow", "Checkout Guest", "Search Products".`);
    if (nameResult?.text) {
      const candidate = nameResult.text.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40);
      if (candidate.length >= 3) flowName = candidate;
    }
    if (flowName === 'Generated Flow') {
      // Fallback: title-case the first 5 words of description
      flowName = description.trim().split(/\s+/).slice(0, 5).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  const nodes: object[] = [{ id: 'start', type: 'start', label: 'Start', url: baseUrl }];
  const edges: object[] = [];
  let prevId = 'start';

  steps.forEach((step, i) => {
    const nodeId = `step-${i + 1}`;
    const node: Record<string, unknown> = { id: nodeId, type: 'action', label: step.name, action: step.action };
    if (step.url) node.url = step.url;
    if (step.selector) node.selector = step.selector;
    if (step.value) node.value = step.value;
    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });

  nodes.push({ id: 'end', type: 'end', label: 'End' });
  edges.push({ id: `e${steps.length}`, source: prevId, target: 'end' });

  const flow = db.createFlow({ name: flowName, description, appUrl: baseUrl, graph: { nodes, edges, appUrl: baseUrl }, createdBy: 'agent' });

  divider();
  success(`Flow created: ${chalk.white(flowName)}`);
  info(`Creator: ${chalk.magenta('🤖 agent')}`);
  info(`Steps: ${chalk.white(String(steps.length))}`);
  info(`Run with: ${chalk.green('node flowmind.js run ' + flow.id.slice(0, 8))}`);
  console.log();
}

// ============================================
// COMMANDS — code:scan
// ============================================

async function runCodeScan(dir: string) {
  printLogo(); divider();
  if (!fs.existsSync(dir)) { errorMsg('Directory not found: ' + dir); process.exit(1); }

  info(`Scanning: ${chalk.cyan(dir)}`);

  // Detect framework
  let framework = 'Generic';
  if (fs.existsSync(path.join(dir, 'next.config.js')) || fs.existsSync(path.join(dir, 'next.config.ts'))) {
    framework = 'Next.js';
  } else if (fs.existsSync(path.join(dir, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.dependencies?.express || pkg.devDependencies?.express) framework = 'Express';
    } catch {}
  }
  info(`Framework: ${chalk.cyan(framework)}`);

  const routes: string[] = [];

  if (framework === 'Next.js') {
    // Walk app/ or pages/ directory
    const appDir = path.join(dir, 'app');
    const pagesDir = path.join(dir, 'pages');
    const rootDir = fs.existsSync(appDir) ? appDir : fs.existsSync(pagesDir) ? pagesDir : null;
    if (rootDir) {
      const walkDir = (d: string, base: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) { walkDir(full, base); continue; }
          if (/^(page|route)\.(tsx?|jsx?)$/.test(entry.name)) {
            const rel = path.dirname(full).replace(base, '').replace(/\\/g, '/') || '/';
            const route = rel || '/';
            if (!routes.includes(route)) routes.push(route);
          }
        }
      };
      walkDir(rootDir, rootDir);
    }
  } else if (framework === 'Express') {
    // Grep for route patterns
    const walkFiles = (d: string): string[] => {
      const files: string[] = [];
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(entry.name)) { files.push(...walkFiles(full)); }
        else if (entry.isFile() && /\.(js|ts)$/.test(entry.name)) files.push(full);
      }
      return files;
    };
    for (const file of walkFiles(dir)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const matches = content.matchAll(/(?:app|router)\.\w+\(['"]([/][^'"]*)['"]/g);
        for (const m of matches) { if (!routes.includes(m[1])) routes.push(m[1]); }
      } catch {}
    }
  } else {
    // Generic: grep all JS/TS files for URL-like patterns
    const walkFiles = (d: string): string[] => {
      const files: string[] = [];
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(entry.name)) { files.push(...walkFiles(full)); }
        else if (entry.isFile() && /\.(js|ts|tsx|jsx)$/.test(entry.name)) files.push(full);
      }
      return files;
    };
    for (const file of walkFiles(dir)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const matches = content.matchAll(/['"]([/][a-z][a-z0-9\-/]*)['"]/gi);
        for (const m of matches) { if (!routes.includes(m[1])) routes.push(m[1]); }
      } catch {}
    }
  }

  if (routes.length === 0) {
    warn('No routes discovered. Try a different directory or framework.');
    return;
  }

  const baseUrl = await askQuestion(chalk.cyan('\n  Base URL for this app? (e.g. http://localhost:3000): '));
  if (!baseUrl) { errorMsg('Base URL required'); process.exit(1); }

  console.log(chalk.bold('\n  Discovered Routes\n'));
  console.log(chalk.gray('  Route                          Flow'));
  console.log(chalk.gray('  ' + '─'.repeat(55)));

  let created = 0;
  for (const route of routes.slice(0, 50)) {
    const fullUrl = baseUrl.replace(/\/$/, '') + route;
    const flowName = `Check ${route}`;
    const nodes = [
      { id: 'start', type: 'start', label: 'Start', url: fullUrl },
      { id: 'step-1', type: 'action', label: `Navigate to ${route}`, action: 'navigate', url: fullUrl },
      { id: 'step-2', type: 'action', label: `Assert URL contains ${route}`, action: 'assert:url', value: route },
      { id: 'end', type: 'end', label: 'End' },
    ];
    const edges = [
      { id: 'e0', source: 'start', target: 'step-1' },
      { id: 'e1', source: 'step-1', target: 'step-2' },
      { id: 'e2', source: 'step-2', target: 'end' },
    ];
    db.createFlow({ name: flowName, appUrl: fullUrl, graph: { nodes, edges, appUrl: fullUrl }, createdBy: 'agent' });
    created++;
    console.log(`  ${chalk.white(route.padEnd(30))} ${chalk.green('✓ ' + flowName)}`);
  }

  console.log();
  success(`Found ${routes.length} routes → created ${created} draft flows`);
  info(`Run: ${chalk.green('node flowmind.js flow:list')}`);
  console.log();
}

// ============================================
// COMMANDS — template store
// ============================================

interface TemplateManifest {
  name: string;
  description: string;
  tags: string[];
  variables: string[];
  flow: { name: string; description?: string; appUrl: string; graph: object };
}

function getTemplatesDir(): string {
  // Check bundled templates next to binary first, then adjacent to CWD
  const candidates = [
    path.join(__dirname, 'templates'),
    path.join(process.cwd(), 'templates'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]; // fallback even if missing
}

async function runStoreList() {
  const dir = getTemplatesDir();
  if (!fs.existsSync(dir)) { errorMsg('Templates directory not found at ' + dir); return; }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.flow.json'));
  if (files.length === 0) { warn('No templates found.'); return; }

  console.log(chalk.bold('\n  Flow Templates\n'));
  console.log(chalk.gray('  Name                     Tags                    Variables'));
  console.log(chalk.gray('  ' + '─'.repeat(72)));

  for (const file of files) {
    try {
      const t: TemplateManifest = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const slug = file.replace('.flow.json', '');
      const tags = (t.tags || []).slice(0, 3).map(g => chalk.cyan(g)).join(chalk.gray(', '));
      const vars = (t.variables || []).map(v => chalk.yellow(`{{${v}}}`)).join(chalk.gray(', '));
      console.log(`  ${chalk.white(slug.padEnd(24))} ${tags.padEnd(30)} ${vars}`);
      console.log(`  ${chalk.gray(' '.repeat(24))} ${chalk.gray(t.description.slice(0, 60))}`);
    } catch {}
  }
  console.log();
  console.log(chalk.gray('  Install with: node flowmind.js store install <name>'));
  console.log(chalk.gray('  Variables:   node flowmind.js run <flow-name> --var BASE_URL=https://...'));
  console.log();
}

async function runStoreInstall(slug: string) {
  const dir = getTemplatesDir();
  const file = path.join(dir, slug.endsWith('.flow.json') ? slug : slug + '.flow.json');
  if (!fs.existsSync(file)) {
    errorMsg(`Template not found: ${slug}`);
    info('Available templates: ' + chalk.cyan('node flowmind.js store list'));
    process.exit(1);
  }
  let t: TemplateManifest;
  try { t = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { errorMsg('Invalid template file'); process.exit(1); return; }

  // Check if already installed
  const existing = db.findFlowByName(t.flow.name);
  if (existing) {
    warn(`Flow "${t.flow.name}" already installed (id: ${existing.id.slice(0, 8)})`);
    const overwrite = await askQuestion(chalk.cyan('  Overwrite? (y/N) '));
    if (overwrite.toLowerCase() !== 'y') { info('Skipped.'); return; }
    db.deleteFlow(existing.id);
  }

  const flow = db.createFlow({ name: t.flow.name, description: t.flow.description, appUrl: t.flow.appUrl, graph: t.flow.graph, createdBy: 'agent' });

  divider();
  success(`Template installed: ${chalk.white(t.flow.name)}`);
  info(`ID: ${chalk.gray(flow.id.slice(0, 8))}`);
  if (t.variables?.length) {
    console.log();
    console.log(chalk.bold('  Variables required:\n'));
    for (const v of t.variables) {
      console.log(`  ${chalk.yellow('{{' + v + '}}')}  →  ${chalk.gray('--var ' + v + '=<value>')}`);
    }
    console.log();
    console.log(chalk.gray('  Or set them in .flowmind.env:\n'));
    for (const v of t.variables) {
      console.log(chalk.gray(`  ${v}=your-value`));
    }
    console.log();
    info(`Run with: ${chalk.green(`node flowmind.js run "${t.flow.name}" --var BASE_URL=https://...`)}`);
  } else {
    info(`Run with: ${chalk.green(`node flowmind.js run ${flow.id.slice(0, 8)}`)}`);
  }
  console.log();
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
  const failed = runs.length - passed;
  const humanFlows = flows.filter(f => f.createdBy === 'human').length;
  const agentFlows = flows.filter(f => f.createdBy === 'agent').length;
  const ollamaModel = await isOllamaRunning();
  const aiProvider = ollamaModel ? `Ollama (${ollamaModel})` : process.env.ANTHROPIC_API_KEY ? 'Anthropic' : 'none';

  intro(chalk.cyan(' FlowMind — Memory-driven Web Automation '));

  const passRateBar = runs.length > 0 ? progressBar(passed, runs.length, 12) : '';
  const passRatePct = runs.length > 0 ? `  ${Math.round(passed / runs.length * 100)}%` : '';
  const flowsLine = flows.length > 0
    ? `  Flows:    ${chalk.white(String(flows.length))}  (${chalk.blue(`${humanFlows} 👤`)}  ${chalk.magenta(`${agentFlows} 🤖`)})`
    : `  Flows:    ${chalk.white('0')}`;

  note(
    [
      flowsLine,
      `  Runs:     ${chalk.white(String(runs.length))}  ${chalk.green(String(passed) + ' passed')}  ${failed > 0 ? chalk.red(String(failed) + ' failed') : chalk.gray('0 failed')}`,
      runs.length > 0 ? `  Rate:     ${passRateBar}${chalk.gray(passRatePct)}` : '',
      `  AI:       ${ollamaModel ? chalk.green(aiProvider) : process.env.ANTHROPIC_API_KEY ? chalk.cyan(aiProvider) : chalk.gray('none — run Ollama or set ANTHROPIC_API_KEY')}`,
    ].filter(Boolean).join('\n'),
    'Status'
  );

  while (true) {
    const action = await select({
      message: 'What do you want to do?',
      options: [
        { value: 'run',      label: '▶  Run a flow',              hint: flows.length > 0 ? `${flows.length} saved` : 'no flows yet' },
        { value: 'record',   label: '⏺  Record a new flow',       hint: 'opens real browser' },
        { value: 'suite',    label: '🧪 Run a test suite',          hint: 'run multiple flows' },
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

    // ── SUITE ───────────────────────────────────────────────
    else if (action === 'suite') {
      const suites = db.listSuites();
      if (suites.length === 0) {
        log.warn('No suites. Create one with: node flowmind.js suite:create <name>');
        continue;
      }
      const { select: sel2, isCancel: isCan2 } = await import('@clack/prompts');
      const suiteChoice = await sel2({
        message: 'Which suite?',
        options: suites.map(s => ({ value: s.id, label: s.name })),
      });
      if (isCan2(suiteChoice)) continue;
      console.log();
      await runSuiteRun(suiteChoice as string);
      console.log();
      await _pause();
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
const globalVars = parseVars(process.argv.slice(2));
const db = new DatabaseManager();

async function main() {
  if (!cmd) {
    await runInteractive();
    db.close();
    return;
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printLogo(); divider(); console.log();
    const C = (s: string) => chalk.cyan(s.padEnd(34));
    const G = (s: string) => chalk.gray(s);
    const H = (s: string) => { console.log(chalk.bold.white('  ' + s)); console.log(chalk.gray('  ' + '─'.repeat(55))); };

    H('Record & Run');
    console.log(`  ${C('learn <url> [name]')}${G('Record a new flow (opens real browser)')}`);
    console.log(`  ${C('run <id|name> [--var k=v]')}${G('Execute a flow headlessly')}`);
    console.log(`  ${C('create [description]')}${G('Generate flow from natural language  🤖 AI')}`);
    console.log(`  ${C('code:scan <directory>')}${G('Scan codebase, create draft flows    🤖 AI')}`);
    console.log();

    H('Flow Management');
    console.log(`  ${C('flow:list')}${G('List all flows with creator + pass rate')}`);
    console.log(`  ${C('flow:fix <id|name>')}${G('Interactively repair broken selectors')}`);
    console.log(`  ${C('flow:delete <id|name>')}${G('Delete a flow')}`);
    console.log(`  ${C('flow:export <id|name>')}${G('Export flow to .flow.json')}`);
    console.log(`  ${C('flow:import <file>')}${G('Import flow from .flow.json')}`);
    console.log();

    H('Scheduling');
    console.log(`  ${C('flow:schedule <id> "<cron>"')}${G('Schedule a flow  e.g. "0 9 * * *"')}`);
    console.log(`  ${C('schedule:list')}${G('List all schedules')}`);
    console.log(`  ${C('schedule:remove <id>')}${G('Remove a schedule')}`);
    console.log(`  ${C('serve')}${G('Start the scheduler daemon')}`);
    console.log();

    H('Test Suites');
    console.log(`  ${C('suite:create <name>')}${G('Create a test suite')}`);
    console.log(`  ${C('suite:add <suite> <flow>')}${G('Add a flow to a suite')}`);
    console.log(`  ${C('suite:list')}${G('List all suites')}`);
    console.log(`  ${C('suite:show <suite>')}${G('Show flows in a suite')}`);
    console.log(`  ${C('suite:run <suite> [--var k=v]')}${G('Run all flows in a suite')}`);
    console.log();

    H('Visual Baselines');
    console.log(`  ${C('baseline:set <flow-id>')}${G('Capture reference screenshots')}`);
    console.log(`  ${C('baseline:clear <flow-id>')}${G('Clear baselines for a flow')}`);
    console.log(`  ${C('baseline:show <flow-id>')}${G('List baseline screenshots')}`);
    console.log();

    H('Run History & Analysis');
    console.log(`  ${C('run:list')}${G('List recent runs with status + timing')}`);
    console.log(`  ${C('run:show <id>')}${G('Full step details + screenshots')}`);
    console.log(`  ${C('run:diff <id1> <id2>')}${G('Pixel-diff screenshots between two runs')}`);
    console.log(`  ${C('run:analyze <id>')}${G('Plain-English failure analysis          🤖 AI')}`);
    console.log();

    H('Template Store');
    console.log(`  ${C('store list')}${G('Browse 10+ ready-made flow templates')}`);
    console.log(`  ${C('store install <name>')}${G('Install a template (sets {{variables}})')}`);
    console.log();

    H('Exploration & System');
    console.log(`  ${C('explore <url>')}${G('Auto-discover flows via BFS crawl       🤖 AI')}`);
    console.log(`  ${C('explore:confirm <report-id>')}${G('Save confirmed flows from explore')}`);
    console.log(`  ${C('status')}${G('Stats, creator breakdown, AI provider')}`);
    console.log(`  ${C('app')}${G('Open Electron desktop viewer')}`);
    console.log();
    console.log(chalk.gray('  🤖 AI  = enhanced by AI (Ollama local or ANTHROPIC_API_KEY)'));
    console.log(chalk.gray('  👤     = human-recorded   🤖 = agent/AI-generated'));
    console.log(chalk.gray('  Variables: --var key=value  or  .flowmind.env file in CWD'));
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
      await runFlow(args[1], globalVars); break;
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
    case 'suite:create':
      if (!args[1]) { errorMsg('Suite name required'); process.exit(1); }
      await runSuiteCreate(args[1]); break;
    case 'suite:add':
      if (!args[1] || !args[2]) { errorMsg('Usage: suite:add <suite> <flow>'); process.exit(1); }
      await runSuiteAdd(args[1], args[2]); break;
    case 'suite:list':      await runSuiteList(); break;
    case 'suite:show':
      if (!args[1]) { errorMsg('Suite name or ID required'); process.exit(1); }
      await runSuiteShow(args[1]); break;
    case 'suite:run':
      if (!args[1]) { errorMsg('Suite name or ID required'); process.exit(1); }
      await runSuiteRun(args[1], globalVars); break;
    case 'baseline:set':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runBaselineSet(args[1]); break;
    case 'baseline:clear':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runBaselineClear(args[1]); break;
    case 'baseline:show':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runBaselineShow(args[1]); break;
    case 'create':          await runCreate(args[1]); break;
    case 'code:scan':
      if (!args[1]) { errorMsg('Directory required'); process.exit(1); }
      await runCodeScan(args[1]); break;
    case 'store':
    case 'store:list':       await runStoreList(); break;
    case 'store:install':
      if (!args[1]) { errorMsg('Template name required. Run store:list to see options.'); process.exit(1); }
      await runStoreInstall(args[1]); break;
    default:
      errorMsg('Unknown command: ' + cmd);
      console.log('  Run without args for help.');
      process.exit(1);
  }

  if (cmd !== 'serve') db.close();
}

main().catch(err => { errorMsg(String(err)); process.exit(1); });
