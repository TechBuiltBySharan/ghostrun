import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
export const DATA_PATH = path.join(HOME_DIR, '.ghostrun');
const DB_PATH = path.join(DATA_PATH, 'data', 'ghostrun.db');

export class DatabaseManager {
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
      CREATE TABLE IF NOT EXISTS environments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        base_url TEXT,
        variables TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS api_responses (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        status_code INTEGER,
        response_time_ms INTEGER,
        response_headers TEXT,
        response_body TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS perf_runs (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL,
        flow_name TEXT NOT NULL,
        config TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        total_requests INTEGER,
        success_requests INTEGER,
        failed_requests INTEGER,
        avg_rps REAL,
        p50_ms INTEGER,
        p95_ms INTEGER,
        p99_ms INTEGER,
        min_ms INTEGER,
        max_ms INTEGER,
        per_step_stats TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
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
  //
  // Uses SQLite's built-in PRAGMA user_version as a schema version counter.
  // Each migration runs exactly once: we read the current version, apply every
  // migration whose index is >= that version (in order), then write the new version.
  //
  // HOW TO ADD A NEW MIGRATION:
  //   1. Append a new string to the MIGRATIONS array below.
  //   2. That's it. The runner handles the rest.
  //
  // Never edit or reorder existing entries — just append.

  private static readonly MIGRATIONS: string[] = [
    // v1: add diff_percent to steps
    'ALTER TABLE steps ADD COLUMN diff_percent REAL',
    // v2: add created_by to flows
    "ALTER TABLE flows ADD COLUMN created_by TEXT NOT NULL DEFAULT 'human'",
    // v3: add verified flag to flows
    'ALTER TABLE flows ADD COLUMN verified INTEGER NOT NULL DEFAULT 0',
    // v4: add captured_at to run_data
    "ALTER TABLE run_data ADD COLUMN captured_at TEXT DEFAULT (datetime('now'))",
    // v5: environments table
    `CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, base_url TEXT,
      variables TEXT NOT NULL DEFAULT '{}', is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // v6: api_responses table
    `CREATE TABLE IF NOT EXISTS api_responses (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, step_number INTEGER NOT NULL,
      method TEXT NOT NULL, url TEXT NOT NULL, status_code INTEGER,
      response_time_ms INTEGER, response_headers TEXT, response_body TEXT,
      error_message TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // v7: perf_runs table
    `CREATE TABLE IF NOT EXISTS perf_runs (
      id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, flow_name TEXT NOT NULL,
      config TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running',
      total_requests INTEGER, success_requests INTEGER, failed_requests INTEGER,
      avg_rps REAL, p50_ms INTEGER, p95_ms INTEGER, p99_ms INTEGER,
      min_ms INTEGER, max_ms INTEGER, per_step_stats TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
    )`,
    // --- add new migrations below this line ---
  ];

  // Number of migrations that existed before we introduced versioning.
  // Existing databases have these applied already (via old try/catch approach)
  // but their user_version is 0. We detect this and fast-forward rather than
  // re-running them (which would throw "duplicate column" errors).
  private static readonly LEGACY_MIGRATION_COUNT = 7;

  private columnExists(table: string, column: string): boolean {
    const cols = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    return cols.some(c => c.name === column);
  }

  private runMigrations() {
    let currentVersion = (this.db.pragma('user_version', { simple: true }) as number) ?? 0;

    // Bootstrap: if user_version is 0 but the DB already has columns from the
    // old try/catch migration approach, fast-forward to avoid re-running them.
    if (currentVersion === 0 && this.columnExists('steps', 'diff_percent')) {
      currentVersion = DatabaseManager.LEGACY_MIGRATION_COUNT;
      this.db.pragma(`user_version = ${currentVersion}`);
    }

    if (currentVersion >= DatabaseManager.MIGRATIONS.length) return;

    const applyAll = this.db.transaction(() => {
      for (let i = currentVersion; i < DatabaseManager.MIGRATIONS.length; i++) {
        this.db.exec(DatabaseManager.MIGRATIONS[i]);
      }
      this.db.pragma(`user_version = ${DatabaseManager.MIGRATIONS.length}`);
    });

    applyAll();
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
  listExploreReports() {
    return (this.db.prepare('SELECT * FROM explore_reports ORDER BY rowid DESC LIMIT 20').all() as Record<string, unknown>[])
      .map(r => ({ id: r.id as string, url: r.url as string, status: r.status as string, reportPath: r.report_path as string | null, createdAt: r.created_at as string | null }));
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

  // ---- Environments ----
  createEnvironment(data: { name: string; baseUrl?: string; variables?: Record<string, string> }) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO environments (id, name, base_url, variables) VALUES (?, ?, ?, ?)`)
      .run(id, data.name, data.baseUrl || null, JSON.stringify(data.variables || {}));
    return this.getEnvironment(id)!;
  }
  getEnvironment(id: string) {
    const r = this.db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.mapEnvironment(r) : null;
  }
  findEnvironmentByName(name: string) {
    const r = this.db.prepare('SELECT * FROM environments WHERE LOWER(name) = ?').get(name.toLowerCase()) as Record<string, unknown> | undefined;
    return r ? this.mapEnvironment(r) : null;
  }
  listEnvironments() {
    return (this.db.prepare('SELECT * FROM environments ORDER BY name').all() as Record<string, unknown>[]).map(r => this.mapEnvironment(r));
  }
  updateEnvironment(id: string, data: Partial<{ name: string; baseUrl: string; variables: Record<string, string> }>) {
    const updates: string[] = []; const values: unknown[] = [];
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.baseUrl !== undefined) { updates.push('base_url = ?'); values.push(data.baseUrl); }
    if (data.variables !== undefined) { updates.push('variables = ?'); values.push(JSON.stringify(data.variables)); }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE environments SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getEnvironment(id);
  }
  deleteEnvironment(id: string) { return this.db.prepare('DELETE FROM environments WHERE id = ?').run(id).changes > 0; }
  setActiveEnvironment(id: string) {
    this.db.prepare('UPDATE environments SET is_active = 0').run();
    this.db.prepare('UPDATE environments SET is_active = 1 WHERE id = ?').run(id);
  }
  getActiveEnvironment() {
    const r = this.db.prepare('SELECT * FROM environments WHERE is_active = 1 LIMIT 1').get() as Record<string, unknown> | undefined;
    return r ? this.mapEnvironment(r) : null;
  }
  private mapEnvironment(r: Record<string, unknown>) {
    return {
      id: r.id as string, name: r.name as string, baseUrl: r.base_url as string | null,
      variables: JSON.parse(r.variables as string || '{}') as Record<string, string>,
      isActive: Boolean(r.is_active), createdAt: new Date(r.created_at as string)
    };
  }

  // ---- API Responses ----
  saveApiResponse(data: { runId: string; stepNumber: number; method: string; url: string; statusCode?: number; responseTimeMs?: number; responseHeaders?: Record<string, string>; responseBody?: string; errorMessage?: string }) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO api_responses (id, run_id, step_number, method, url, status_code, response_time_ms, response_headers, response_body, error_message) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, data.runId, data.stepNumber, data.method, data.url,
        data.statusCode ?? null, data.responseTimeMs ?? null,
        data.responseHeaders ? JSON.stringify(data.responseHeaders) : null,
        data.responseBody ?? null, data.errorMessage ?? null);
    return id;
  }
  getApiResponses(runId: string) {
    return (this.db.prepare('SELECT * FROM api_responses WHERE run_id = ? ORDER BY step_number').all(runId) as Record<string, unknown>[]).map(r => ({
      id: r.id as string, runId: r.run_id as string, stepNumber: r.step_number as number,
      method: r.method as string, url: r.url as string,
      statusCode: r.status_code as number | null,
      responseTimeMs: r.response_time_ms as number | null,
      responseHeaders: r.response_headers ? JSON.parse(r.response_headers as string) : null,
      responseBody: r.response_body as string | null,
      errorMessage: r.error_message as string | null
    }));
  }

  // ---- Perf Runs ----
  createPerfRun(data: { flowId: string; flowName: string; config: object }) {
    const id = uuidv4();
    this.db.prepare(`INSERT INTO perf_runs (id, flow_id, flow_name, config, status) VALUES (?, ?, ?, ?, 'running')`)
      .run(id, data.flowId, data.flowName, JSON.stringify(data.config));
    return id;
  }
  updatePerfRun(id: string, data: {
    status?: string; totalRequests?: number; successRequests?: number; failedRequests?: number;
    avgRps?: number; p50?: number; p95?: number; p99?: number; minMs?: number; maxMs?: number;
    perStepStats?: object;
  }) {
    const updates: string[] = []; const values: unknown[] = [];
    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.totalRequests !== undefined) { updates.push('total_requests = ?'); values.push(data.totalRequests); }
    if (data.successRequests !== undefined) { updates.push('success_requests = ?'); values.push(data.successRequests); }
    if (data.failedRequests !== undefined) { updates.push('failed_requests = ?'); values.push(data.failedRequests); }
    if (data.avgRps !== undefined) { updates.push('avg_rps = ?'); values.push(data.avgRps); }
    if (data.p50 !== undefined) { updates.push('p50_ms = ?'); values.push(data.p50); }
    if (data.p95 !== undefined) { updates.push('p95_ms = ?'); values.push(data.p95); }
    if (data.p99 !== undefined) { updates.push('p99_ms = ?'); values.push(data.p99); }
    if (data.minMs !== undefined) { updates.push('min_ms = ?'); values.push(data.minMs); }
    if (data.maxMs !== undefined) { updates.push('max_ms = ?'); values.push(data.maxMs); }
    if (data.perStepStats !== undefined) { updates.push('per_step_stats = ?'); values.push(JSON.stringify(data.perStepStats)); }
    if (data.status === 'done' || data.status === 'failed') {
      updates.push("completed_at = datetime('now')");
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE perf_runs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  getPerfRun(id: string) {
    const r = this.db.prepare('SELECT * FROM perf_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.mapPerfRun(r) : null;
  }
  findPerfRunByPartialId(q: string) {
    const rows = this.db.prepare('SELECT * FROM perf_runs WHERE id LIKE ?').all(q + '%') as Record<string, unknown>[];
    return rows.length >= 1 ? this.mapPerfRun(rows[0]) : null;
  }
  listPerfRuns(limit = 20) {
    return (this.db.prepare('SELECT * FROM perf_runs ORDER BY started_at DESC LIMIT ?').all(limit) as Record<string, unknown>[]).map(r => this.mapPerfRun(r));
  }
  private mapPerfRun(r: Record<string, unknown>) {
    return {
      id: r.id as string, flowId: r.flow_id as string, flowName: r.flow_name as string,
      config: JSON.parse(r.config as string),
      status: r.status as string,
      totalRequests: r.total_requests as number | null,
      successRequests: r.success_requests as number | null,
      failedRequests: r.failed_requests as number | null,
      avgRps: r.avg_rps as number | null,
      p50: r.p50_ms as number | null,
      p95: r.p95_ms as number | null,
      p99: r.p99_ms as number | null,
      minMs: r.min_ms as number | null,
      maxMs: r.max_ms as number | null,
      perStepStats: r.per_step_stats ? JSON.parse(r.per_step_stats as string) : null,
      startedAt: new Date(r.started_at as string),
      completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
    };
  }
}
