/**
 * SQLite Database Layer for Flowmind
 * 
 * Provides persistent storage for flows, runs, and artifacts.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID as uuidv4 } from 'crypto';

export interface FlowRecord {
  id: string;
  name: string;
  description: string | null;
  appUrl: string | null;
  graph: string; // JSON stringified graph
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunRecord {
  id: string;
  flowId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'stopped';
  startedAt: Date;
  completedAt: Date | null;
  duration: number | null;
  errorMessage: string | null;
  summary: string | null; // JSON stringified summary
}

export interface StepRecord {
  id: string;
  runId: string;
  stepNumber: number;
  name: string;
  action: string;
  selector: string | null;
  value: string | null;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  duration: number | null;
  errorMessage: string | null;
  screenshotPath: string | null;
  consoleLogs: string | null;
  networkLogs: string | null;
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  stepNumber: number | null;
  type: 'screenshot' | 'console-log' | 'network-log' | 'har' | 'other';
  path: string;
  contentType: string;
  createdAt: Date;
}

export interface SlotRecord {
  id: string;
  flowId: string;
  name: string;
  type: 'email' | 'password' | 'text' | 'number' | 'select' | 'hidden';
  label: string | null;
  defaultValue: string | null;
  required: boolean;
  order: number;
}

export class FlowmindDatabase {
  private db: Database.Database;
  private dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath || path.join(process.env.HOME || '.', '.flowmind', 'data');
    
    // Ensure directory exists
    fs.mkdirSync(this.dataPath, { recursive: true });
    
    const dbPath = path.join(this.dataPath, 'flowmind.db');
    this.db = new Database(dbPath);
    
    this.initialize();
  }

  private initialize() {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create tables
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

      CREATE TABLE IF NOT EXISTS slots (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        label TEXT,
        default_value TEXT,
        required INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
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
        console_logs TEXT,
        network_logs TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_number INTEGER,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_slots_flow ON slots(flow_id);
      CREATE INDEX IF NOT EXISTS idx_runs_flow ON runs(flow_id);
      CREATE INDEX IF NOT EXISTS idx_steps_run ON steps(run_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
    `);
  }

  // ============ FLOWS ============

  createFlow(data: { name: string; description?: string; appUrl?: string; graph?: object }): FlowRecord {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.name, data.description || null, data.appUrl || null, JSON.stringify(data.graph || {}), now, now);

    return this.getFlow(id)!;
  }

  getFlow(id: string): FlowRecord | null {
    const stmt = this.db.prepare('SELECT * FROM flows WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapFlow(row) : null;
  }

  listFlows(): FlowRecord[] {
    const stmt = this.db.prepare('SELECT * FROM flows ORDER BY updated_at DESC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map(this.mapFlow);
  }

  updateFlow(id: string, data: Partial<{ name: string; description: string; appUrl: string; graph: object }>): FlowRecord | null {
    const existing = this.getFlow(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.appUrl !== undefined) {
      updates.push('app_url = ?');
      values.push(data.appUrl);
    }
    if (data.graph !== undefined) {
      updates.push('graph = ?');
      values.push(JSON.stringify(data.graph));
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = this.db.prepare(`UPDATE flows SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getFlow(id);
  }

  deleteFlow(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM flows WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private mapFlow(row: Record<string, unknown>): FlowRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      appUrl: row.app_url as string | null,
      graph: row.graph as string,
      version: row.version as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  // ============ SLOTS ============

  createSlot(data: { flowId: string; name: string; type?: string; label?: string; defaultValue?: string; required?: boolean }): SlotRecord {
    const id = uuidv4();

    const maxOrder = this.db.prepare('SELECT MAX(sort_order) as max FROM slots WHERE flow_id = ?').get(data.flowId) as { max: number | null };
    const order = (maxOrder?.max ?? -1) + 1;

    const stmt = this.db.prepare(`
      INSERT INTO slots (id, flow_id, name, type, label, default_value, required, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.flowId, data.name, data.type || 'text', data.label || null, data.defaultValue || null, data.required ? 1 : 0, order);

    return this.getSlot(id)!;
  }

  getSlot(id: string): SlotRecord | null {
    const stmt = this.db.prepare('SELECT * FROM slots WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapSlot(row) : null;
  }

  listSlots(flowId: string): SlotRecord[] {
    const stmt = this.db.prepare('SELECT * FROM slots WHERE flow_id = ? ORDER BY sort_order');
    const rows = stmt.all(flowId) as Record<string, unknown>[];
    return rows.map(this.mapSlot);
  }

  updateSlot(id: string, data: Partial<{ name: string; type: string; label: string; defaultValue: string; required: boolean }>): SlotRecord | null {
    const existing = this.getSlot(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.type !== undefined) { updates.push('type = ?'); values.push(data.type); }
    if (data.label !== undefined) { updates.push('label = ?'); values.push(data.label); }
    if (data.defaultValue !== undefined) { updates.push('default_value = ?'); values.push(data.defaultValue); }
    if (data.required !== undefined) { updates.push('required = ?'); values.push(data.required ? 1 : 0); }

    values.push(id);

    if (updates.length > 0) {
      const stmt = this.db.prepare(`UPDATE slots SET ${updates.join(', ')} WHERE id = ?`);
      stmt.run(...values);
    }

    return this.getSlot(id);
  }

  deleteSlot(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM slots WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private mapSlot(row: Record<string, unknown>): SlotRecord {
    return {
      id: row.id as string,
      flowId: row.flow_id as string,
      name: row.name as string,
      type: row.type as SlotRecord['type'],
      label: row.label as string | null,
      defaultValue: row.default_value as string | null,
      required: Boolean(row.required),
      order: row.sort_order as number,
    };
  }

  // ============ RUNS ============

  createRun(flowId: string): RunRecord {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO runs (id, flow_id, status, started_at)
      VALUES (?, ?, 'running', ?)
    `);

    stmt.run(id, flowId, now);

    return this.getRun(id)!;
  }

  getRun(id: string): RunRecord | null {
    const stmt = this.db.prepare('SELECT * FROM runs WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRun(row) : null;
  }

  listRuns(flowId?: string, limit = 50): RunRecord[] {
    let sql = 'SELECT * FROM runs';
    const params: unknown[] = [];

    if (flowId) {
      sql += ' WHERE flow_id = ?';
      params.push(flowId);
    }

    sql += ' ORDER BY started_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map(this.mapRun);
  }

  updateRun(id: string, data: Partial<{ status: string; completedAt: Date; duration: number; errorMessage: string; summary: object }>): RunRecord | null {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.completedAt !== undefined) { updates.push('completed_at = ?'); values.push(data.completedAt.toISOString()); }
    if (data.duration !== undefined) { updates.push('duration = ?'); values.push(data.duration); }
    if (data.errorMessage !== undefined) { updates.push('error_message = ?'); values.push(data.errorMessage); }
    if (data.summary !== undefined) { updates.push('summary = ?'); values.push(JSON.stringify(data.summary)); }

    values.push(id);

    if (updates.length > 0) {
      const stmt = this.db.prepare(`UPDATE runs SET ${updates.join(', ')} WHERE id = ?`);
      stmt.run(...values);
    }

    return this.getRun(id);
  }

  deleteRun(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM runs WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private mapRun(row: Record<string, unknown>): RunRecord {
    return {
      id: row.id as string,
      flowId: row.flow_id as string,
      status: row.status as RunRecord['status'],
      startedAt: new Date(row.started_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
      duration: row.duration as number | null,
      errorMessage: row.error_message as string | null,
      summary: row.summary as string | null,
    };
  }

  // ============ STEPS ============

  createStep(data: { runId: string; stepNumber: number; name: string; action: string; selector?: string; value?: string }): StepRecord {
    const id = uuidv4();

    const stmt = this.db.prepare(`
      INSERT INTO steps (id, run_id, step_number, name, action, selector, value, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    stmt.run(id, data.runId, data.stepNumber, data.name, data.action, data.selector || null, data.value || null);

    return this.getStep(id)!;
  }

  getStep(id: string): StepRecord | null {
    const stmt = this.db.prepare('SELECT * FROM steps WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapStep(row) : null;
  }

  listSteps(runId: string): StepRecord[] {
    const stmt = this.db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY step_number');
    const rows = stmt.all(runId) as Record<string, unknown>[];
    return rows.map(this.mapStep);
  }

  updateStep(id: string, data: Partial<{ status: string; duration: number; errorMessage: string; screenshotPath: string; consoleLogs: string; networkLogs: string }>): StepRecord | null {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.duration !== undefined) { updates.push('duration = ?'); values.push(data.duration); }
    if (data.errorMessage !== undefined) { updates.push('error_message = ?'); values.push(data.errorMessage); }
    if (data.screenshotPath !== undefined) { updates.push('screenshot_path = ?'); values.push(data.screenshotPath); }
    if (data.consoleLogs !== undefined) { updates.push('console_logs = ?'); values.push(data.consoleLogs); }
    if (data.networkLogs !== undefined) { updates.push('network_logs = ?'); values.push(data.networkLogs); }

    values.push(id);

    if (updates.length > 0) {
      const stmt = this.db.prepare(`UPDATE steps SET ${updates.join(', ')} WHERE id = ?`);
      stmt.run(...values);
    }

    return this.getStep(id);
  }

  private mapStep(row: Record<string, unknown>): StepRecord {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      stepNumber: row.step_number as number,
      name: row.name as string,
      action: row.action as string,
      selector: row.selector as string | null,
      value: row.value as string | null,
      status: row.status as StepRecord['status'],
      duration: row.duration as number | null,
      errorMessage: row.error_message as string | null,
      screenshotPath: row.screenshot_path as string | null,
      consoleLogs: row.console_logs as string | null,
      networkLogs: row.network_logs as string | null,
    };
  }

  // ============ ARTIFACTS ============

  createArtifact(data: { runId: string; stepNumber?: number; type: string; path: string; contentType?: string }): ArtifactRecord {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO artifacts (id, run_id, step_number, type, path, content_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.runId, data.stepNumber || null, data.type, data.path, data.contentType || 'application/octet-stream', now);

    return this.getArtifact(id)!;
  }

  getArtifact(id: string): ArtifactRecord | null {
    const stmt = this.db.prepare('SELECT * FROM artifacts WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapArtifact(row) : null;
  }

  listArtifacts(runId: string, stepNumber?: number): ArtifactRecord[] {
    let sql = 'SELECT * FROM artifacts WHERE run_id = ?';
    const params: unknown[] = [runId];

    if (stepNumber !== undefined) {
      sql += ' AND step_number = ?';
      params.push(stepNumber);
    }

    sql += ' ORDER BY step_number, created_at';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map(this.mapArtifact);
  }

  deleteArtifact(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM artifacts WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private mapArtifact(row: Record<string, unknown>): ArtifactRecord {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      stepNumber: row.step_number as number | null,
      type: row.type as ArtifactRecord['type'],
      path: row.path as string,
      contentType: row.content_type as string,
      createdAt: new Date(row.created_at as string),
    };
  }

  // ============ UTILITIES ============

  close() {
    this.db.close();
  }

  // Get data path for storing screenshots etc
  getDataPath() {
    return this.dataPath;
  }

  // Get screenshots directory
  getScreenshotsPath(runId: string) {
    const dir = path.join(this.dataPath, 'screenshots', runId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

// Singleton instance
let dbInstance: FlowmindDatabase | null = null;

export function getDatabase(): FlowmindDatabase {
  if (!dbInstance) {
    dbInstance = new FlowmindDatabase();
  }
  return dbInstance;
}

export function initDatabase(dataPath?: string): FlowmindDatabase {
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = new FlowmindDatabase(dataPath);
  return dbInstance;
}
