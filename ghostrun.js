#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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

// packages/vault/src/keychain.ts
function getKeychain(service) {
  return new NodeKeychain(service);
}
var NodeKeychain;
var init_keychain = __esm({
  "packages/vault/src/keychain.ts"() {
    "use strict";
    NodeKeychain = class {
      service;
      useNative = false;
      keytar = null;
      constructor(service) {
        this.service = service;
        this.tryLoadKeytar();
      }
      /**
       * Try to load keytar
       */
      async tryLoadKeytar() {
        try {
          this.keytar = await import("keytar");
          this.useNative = true;
        } catch {
          console.warn("keytar not available, using in-memory storage");
          this.useNative = false;
        }
      }
      /**
       * Get a password from keychain
       */
      async getPassword(service, account) {
        if (this.useNative && this.keytar) {
          return this.keytar.getPassword(service, account || this.service);
        }
        return this.getFromMemory(service, account);
      }
      /**
       * Set a password in keychain
       */
      async setPassword(service, account, password) {
        if (this.useNative && this.keytar) {
          await this.keytar.setPassword(service, account, password);
          return;
        }
        this.setInMemory(service, account, password);
      }
      /**
       * Delete a password from keychain
       */
      async deletePassword(service, account) {
        if (this.useNative && this.keytar) {
          return this.keytar.deletePassword(service, account);
        }
        return this.deleteFromMemory(service, account);
      }
      /**
       * Find passwords in keychain
       */
      async findPasswords(service) {
        if (this.useNative && this.keytar) {
          const credentials = await this.keytar.findCredentials(service);
          return credentials;
        }
        return this.findFromMemory(service);
      }
      // In-memory fallback storage
      memory = /* @__PURE__ */ new Map();
      getMemoryKey(service, account) {
        return `${service}:${account}`;
      }
      getFromMemory(service, account) {
        const key = this.getMemoryKey(service, account || this.service);
        return this.memory.get(key) || null;
      }
      setInMemory(service, account, password) {
        const key = this.getMemoryKey(service, account);
        this.memory.set(key, password);
      }
      deleteFromMemory(service, account) {
        const key = this.getMemoryKey(service, account);
        return this.memory.delete(key);
      }
      findFromMemory(service) {
        const results = [];
        const prefix = `${service}:`;
        for (const [key, password] of this.memory.entries()) {
          if (key.startsWith(prefix)) {
            const account = key.slice(prefix.length);
            results.push({ account, password });
          }
        }
        return results;
      }
    };
  }
});

// packages/vault/src/vault.ts
var vault_exports = {};
__export(vault_exports, {
  Vault: () => Vault,
  createVault: () => createVault,
  deleteCredential: () => deleteCredential,
  getCredential: () => getCredential,
  listCredentials: () => listCredentials,
  storeCredential: () => storeCredential,
  vault: () => vault
});
function createVault(config) {
  return new Vault(config);
}
async function storeCredential(credential) {
  return vault.store(credential);
}
async function getCredential(id) {
  return vault.get(id);
}
async function listCredentials() {
  return vault.list();
}
async function deleteCredential(id) {
  return vault.delete(id);
}
var DEFAULT_CONFIG, Vault, vault;
var init_vault = __esm({
  "packages/vault/src/vault.ts"() {
    "use strict";
    init_keychain();
    DEFAULT_CONFIG = {
      serviceName: "ghostrun",
      useKeychain: true,
      fallbackToFile: true,
      encryptionKey: ""
      // Will use machine-derived key if not provided
    };
    Vault = class {
      config;
      keychain = null;
      credentials = /* @__PURE__ */ new Map();
      isInitialized = false;
      constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
      }
      /**
       * Initialize the vault
       */
      async initialize() {
        if (this.isInitialized) return;
        if (this.config.useKeychain) {
          try {
            this.keychain = getKeychain(this.config.serviceName);
          } catch (error) {
            console.warn("Keychain not available, falling back to file storage:", error);
            this.keychain = null;
          }
        }
        await this.loadCredentials();
        this.isInitialized = true;
      }
      /**
       * Store a credential
       */
      async store(credential) {
        await this.ensureInitialized();
        const now = /* @__PURE__ */ new Date();
        const newCredential = {
          ...credential,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now
        };
        if (this.keychain && credential.password) {
          await this.keychain.setPassword(
            this.config.serviceName,
            newCredential.id,
            credential.password
          );
        }
        const credentialForStorage = { ...newCredential, password: void 0 };
        this.credentials.set(newCredential.id, credentialForStorage);
        await this.persistCredentials();
        return newCredential;
      }
      /**
       * Get a credential
       */
      async get(id) {
        await this.ensureInitialized();
        const credential = this.credentials.get(id);
        if (!credential) return null;
        if (this.keychain) {
          try {
            const password = await this.keychain.getPassword(
              this.config.serviceName,
              id
            );
            return { ...credential, password: password || void 0 };
          } catch {
            return credential;
          }
        }
        return credential;
      }
      /**
       * Get credential by name
       */
      async getByName(name) {
        await this.ensureInitialized();
        for (const credential of this.credentials.values()) {
          if (credential.name === name) {
            return this.get(credential.id);
          }
        }
        return null;
      }
      /**
       * List all credentials (without passwords)
       */
      async list() {
        await this.ensureInitialized();
        return Array.from(this.credentials.values());
      }
      /**
       * Update a credential
       */
      async update(id, updates) {
        await this.ensureInitialized();
        const existing = this.credentials.get(id);
        if (!existing) return null;
        const updated = {
          ...existing,
          ...updates,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: /* @__PURE__ */ new Date()
        };
        if (this.keychain && updates.password) {
          await this.keychain.setPassword(
            this.config.serviceName,
            id,
            updates.password
          );
          updated.password = void 0;
        }
        this.credentials.set(id, updated);
        await this.persistCredentials();
        return this.get(id);
      }
      /**
       * Delete a credential
       */
      async delete(id) {
        await this.ensureInitialized();
        if (this.keychain) {
          try {
            await this.keychain.deletePassword(this.config.serviceName, id);
          } catch {
          }
        }
        const deleted = this.credentials.delete(id);
        if (deleted) {
          await this.persistCredentials();
        }
        return deleted;
      }
      /**
       * Search credentials
       */
      async search(query) {
        await this.ensureInitialized();
        const results = [];
        for (const credential of this.credentials.values()) {
          let matches = true;
          if (query.name && !credential.name.toLowerCase().includes(query.name.toLowerCase())) {
            matches = false;
          }
          if (query.url && credential.url && !credential.url.includes(query.url)) {
            matches = false;
          }
          if (query.tag && !credential.tags.includes(query.tag)) {
            matches = false;
          }
          if (matches) {
            results.push(credential);
          }
        }
        return results;
      }
      /**
       * Ensure vault is initialized
       */
      async ensureInitialized() {
        if (!this.isInitialized) {
          await this.initialize();
        }
      }
      /**
       * Load credentials from storage
       */
      async loadCredentials() {
        const fs5 = await import("fs");
        const path5 = await import("path");
        const configDir = path5.join(process.env.HOME || ".", ".ghostrun", "vault");
        const metaPath = path5.join(configDir, "credentials.meta.json");
        if (fs5.existsSync(metaPath)) {
          try {
            const content = await fs5.promises.readFile(metaPath, "utf-8");
            const data = JSON.parse(content);
            for (const cred of data) {
              this.credentials.set(cred.id, {
                ...cred,
                createdAt: new Date(cred.createdAt),
                updatedAt: new Date(cred.updatedAt)
              });
            }
          } catch (error) {
            console.error("Failed to load credentials:", error);
          }
        }
      }
      /**
       * Persist credentials to storage
       */
      async persistCredentials() {
        const fs5 = await import("fs");
        const path5 = await import("path");
        const configDir = path5.join(process.env.HOME || ".", ".ghostrun", "vault");
        if (!fs5.existsSync(configDir)) {
          fs5.mkdirSync(configDir, { recursive: true });
        }
        const metaPath = path5.join(configDir, "credentials.meta.json");
        const data = Array.from(this.credentials.values()).map((cred) => ({
          ...cred,
          password: void 0
          // Never write password to file
        }));
        await fs5.promises.writeFile(metaPath, JSON.stringify(data, null, 2), "utf-8");
      }
      /**
       * Export credentials (encrypted)
       */
      async exportCredentials() {
        const credentials = await this.list();
        return JSON.stringify(credentials, null, 2);
      }
      /**
       * Import credentials
       */
      async importCredentials(json) {
        const data = JSON.parse(json);
        let imported = 0;
        for (const cred of data) {
          await this.store(cred);
          imported++;
        }
        return imported;
      }
    };
    vault = createVault();
  }
});

// ghostrun.ts
var import_playwright = require("playwright");
var import_chalk = __toESM(require("chalk"));
var fs4 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var readline = __toESM(require("readline"));
var import_crypto4 = require("crypto");

// packages/database/src/manager.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_crypto = require("crypto");
var HOME_DIR = process.env.HOME || process.env.USERPROFILE || ".";
var DATA_PATH = path.join(HOME_DIR, ".ghostrun");
var DEFAULT_DB_PATH = path.join(DATA_PATH, "data", "ghostrun.db");
var DatabaseManager = class _DatabaseManager {
  db;
  screenshotsBase;
  sessionsBase;
  flowSyncHook;
  setFlowSyncHook(hook) {
    this.flowSyncHook = hook;
  }
  constructor(options = {}) {
    const dbPath = options.dbPath || DEFAULT_DB_PATH;
    this.screenshotsBase = options.screenshotsPath || path.join(DATA_PATH, "screenshots");
    this.sessionsBase = options.sessionsPath || path.join(DATA_PATH, "sessions");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(this.screenshotsBase, { recursive: true });
    fs.mkdirSync(this.sessionsBase, { recursive: true });
    this.db = new import_better_sqlite3.default(dbPath);
    this.initialize();
    this.runMigrations();
  }
  getDbPath() {
    return this.db.name;
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
      CREATE TABLE IF NOT EXISTS scrape_runs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        reason TEXT,
        max_pages INTEGER NOT NULL DEFAULT 1,
        selector TEXT,
        pages_count INTEGER NOT NULL DEFAULT 0,
        result_path TEXT,
        run_id TEXT,
        step_number INTEGER,
        explore_report_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
    `);
  }
  // ---- Flows ----
  createFlow(data) {
    const id = (0, import_crypto.randomUUID)();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const createdBy = data.createdBy || "human";
    this.db.prepare(`INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.name, data.description || null, data.appUrl || null, JSON.stringify(data.graph || {}), now, now, createdBy);
    const flow = this.getFlow(id);
    this.flowSyncHook?.("create", flow);
    return flow;
  }
  verifyFlow(id) {
    this.db.prepare("UPDATE flows SET verified = 1 WHERE id = ?").run(id);
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
    const lower = name.toLowerCase();
    const rows = this.db.prepare("SELECT * FROM flows WHERE LOWER(name) LIKE ?").all(`%${lower}%`);
    if (rows.length === 0) return null;
    const exact = rows.find((r) => r.name.toLowerCase() === lower);
    if (exact) return this.mapFlow(exact);
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
    const flow = this.getFlow(id);
    if (flow) this.flowSyncHook?.("update", flow);
    return flow;
  }
  deleteFlow(id) {
    const flow = this.getFlow(id);
    const ok = this.db.prepare("DELETE FROM flows WHERE id = ?").run(id).changes > 0;
    if (ok && flow) this.flowSyncHook?.("delete", flow);
    return ok;
  }
  mapFlow(r) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      appUrl: r.app_url,
      graph: r.graph,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      createdBy: r.created_by || "human",
      verified: Boolean(r.verified)
    };
  }
  // ---- Runs ----
  createRun(flowId) {
    const id = (0, import_crypto.randomUUID)();
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
    const id = (0, import_crypto.randomUUID)();
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
    if (data.diffPercent !== void 0) {
      updates.push("diff_percent = ?");
      values.push(data.diffPercent);
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
      screenshotPath: r.screenshot_path,
      diffPercent: r.diff_percent
    };
  }
  getScreenshotsPath(runId) {
    const dir = path.join(this.screenshotsBase, runId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  // ---- Schedules ----
  createSchedule(data) {
    const id = (0, import_crypto.randomUUID)();
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
  static MIGRATIONS = [
    // v1: add diff_percent to steps
    "ALTER TABLE steps ADD COLUMN diff_percent REAL",
    // v2: add created_by to flows
    "ALTER TABLE flows ADD COLUMN created_by TEXT NOT NULL DEFAULT 'human'",
    // v3: add verified flag to flows
    "ALTER TABLE flows ADD COLUMN verified INTEGER NOT NULL DEFAULT 0",
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
    // v8: scrape_runs table
    `CREATE TABLE IF NOT EXISTS scrape_runs (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running',
      reason TEXT, max_pages INTEGER NOT NULL DEFAULT 1, selector TEXT,
      pages_count INTEGER NOT NULL DEFAULT 0, result_path TEXT, run_id TEXT,
      step_number INTEGER, explore_report_id TEXT, error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
    )`
    // --- add new migrations below this line ---
  ];
  // Number of migrations that existed before we introduced versioning.
  // Existing databases have these applied already (via old try/catch approach)
  // but their user_version is 0. We detect this and fast-forward rather than
  // re-running them (which would throw "duplicate column" errors).
  static LEGACY_MIGRATION_COUNT = 7;
  columnExists(table, column) {
    const cols = this.db.pragma(`table_info(${table})`);
    return cols.some((c) => c.name === column);
  }
  runMigrations() {
    let currentVersion = this.db.pragma("user_version", { simple: true }) ?? 0;
    if (currentVersion === 0 && this.columnExists("steps", "diff_percent")) {
      currentVersion = _DatabaseManager.LEGACY_MIGRATION_COUNT;
      this.db.pragma(`user_version = ${currentVersion}`);
    }
    if (currentVersion >= _DatabaseManager.MIGRATIONS.length) return;
    const applyAll = this.db.transaction(() => {
      for (let i = currentVersion; i < _DatabaseManager.MIGRATIONS.length; i++) {
        this.db.exec(_DatabaseManager.MIGRATIONS[i]);
      }
      this.db.pragma(`user_version = ${_DatabaseManager.MIGRATIONS.length}`);
    });
    applyAll();
  }
  // ---- Suites ----
  createSuite(data) {
    const id = (0, import_crypto.randomUUID)();
    this.db.prepare(`INSERT INTO suites (id, name, description) VALUES (?, ?, ?)`).run(id, data.name, data.description || null);
    return this.getSuite(id);
  }
  getSuite(id) {
    const r = this.db.prepare("SELECT * FROM suites WHERE id = ?").get(id);
    return r ? { id: r.id, name: r.name, description: r.description, createdAt: new Date(r.created_at) } : null;
  }
  findSuiteByNameOrId(q) {
    const byId = this.db.prepare("SELECT * FROM suites WHERE id LIKE ?").all(q + "%");
    if (byId.length === 1) return this.getSuite(byId[0].id);
    const byName = this.db.prepare("SELECT * FROM suites WHERE LOWER(name) LIKE ?").all(`%${q.toLowerCase()}%`);
    if (byName.length === 1) return this.getSuite(byName[0].id);
    if (byName.length > 1) return this.getSuite(byName[0].id);
    return null;
  }
  listSuites() {
    return this.db.prepare("SELECT * FROM suites ORDER BY created_at DESC").all().map((r) => ({ id: r.id, name: r.name, description: r.description, createdAt: new Date(r.created_at) }));
  }
  deleteSuite(id) {
    return this.db.prepare("DELETE FROM suites WHERE id = ?").run(id).changes > 0;
  }
  addFlowToSuite(suiteId, flowId) {
    const count = this.db.prepare("SELECT COUNT(*) as c FROM suite_flows WHERE suite_id = ?").get(suiteId).c;
    const id = (0, import_crypto.randomUUID)();
    this.db.prepare(`INSERT INTO suite_flows (id, suite_id, flow_id, order_index) VALUES (?, ?, ?, ?)`).run(id, suiteId, flowId, count);
  }
  removeFlowFromSuite(suiteId, flowId) {
    this.db.prepare("DELETE FROM suite_flows WHERE suite_id = ? AND flow_id = ?").run(suiteId, flowId);
  }
  getSuiteFlows(suiteId) {
    return this.db.prepare("SELECT sf.*, f.name as flow_name FROM suite_flows sf JOIN flows f ON sf.flow_id = f.id WHERE sf.suite_id = ? ORDER BY sf.order_index").all(suiteId).map((r) => ({ id: r.id, suiteId: r.suite_id, flowId: r.flow_id, flowName: r.flow_name, orderIndex: r.order_index }));
  }
  // ---- Baselines ----
  setBaseline(flowId, stepNumber, screenshotPath) {
    const existing = this.db.prepare("SELECT id FROM baselines WHERE flow_id = ? AND step_number = ?").get(flowId, stepNumber);
    if (existing) {
      this.db.prepare("UPDATE baselines SET screenshot_path = ?, captured_at = datetime('now') WHERE id = ?").run(screenshotPath, existing.id);
    } else {
      this.db.prepare("INSERT INTO baselines (id, flow_id, step_number, screenshot_path) VALUES (?, ?, ?, ?)").run((0, import_crypto.randomUUID)(), flowId, stepNumber, screenshotPath);
    }
  }
  getBaseline(flowId, stepNumber) {
    return this.db.prepare("SELECT * FROM baselines WHERE flow_id = ? AND step_number = ?").get(flowId, stepNumber);
  }
  clearBaselines(flowId) {
    this.db.prepare("DELETE FROM baselines WHERE flow_id = ?").run(flowId);
  }
  listBaselines(flowId) {
    return this.db.prepare("SELECT * FROM baselines WHERE flow_id = ? ORDER BY step_number").all(flowId).map((r) => ({ stepNumber: r.step_number, screenshotPath: r.screenshot_path, capturedAt: new Date(r.captured_at) }));
  }
  // ---- Explore Reports ----
  createExploreReport(url, environment) {
    const id = (0, import_crypto.randomUUID)();
    this.db.prepare(`INSERT INTO explore_reports (id, url, environment, status) VALUES (?, ?, ?, 'pending')`).run(id, url, environment);
    return this.getExploreReport(id);
  }
  getExploreReport(id) {
    const r = this.db.prepare("SELECT * FROM explore_reports WHERE id = ?").get(id);
    return r ? { id: r.id, url: r.url, environment: r.environment, status: r.status, reportPath: r.report_path } : null;
  }
  listExploreReports() {
    return this.db.prepare("SELECT * FROM explore_reports ORDER BY rowid DESC LIMIT 20").all().map((r) => ({ id: r.id, url: r.url, status: r.status, reportPath: r.report_path, createdAt: r.created_at }));
  }
  findExploreReportByPartialId(q) {
    const rows = this.db.prepare("SELECT * FROM explore_reports WHERE id LIKE ?").all(q + "%");
    if (rows.length !== 1) return null;
    const r = rows[0];
    return { id: r.id, url: r.url, environment: r.environment, status: r.status, reportPath: r.report_path };
  }
  updateExploreReport(id, data) {
    const updates = [];
    const values = [];
    if (data.status) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.reportPath) {
      updates.push("report_path = ?");
      values.push(data.reportPath);
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE explore_reports SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
  createExploreCandidate(data) {
    const id = (0, import_crypto.randomUUID)();
    this.db.prepare(`INSERT INTO explore_candidates (id, report_id, name, description, route, screenshot_path, graph) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, data.reportId, data.name, data.description, data.route, data.screenshotPath || null, JSON.stringify(data.graph));
    return id;
  }
  listExploreCandidates(reportId) {
    return this.db.prepare("SELECT * FROM explore_candidates WHERE report_id = ? ORDER BY rowid").all(reportId).map((r) => ({ id: r.id, reportId: r.report_id, name: r.name, description: r.description, route: r.route, screenshotPath: r.screenshot_path, graph: r.graph, confirmed: Boolean(r.confirmed) }));
  }
  confirmExploreCandidate(id) {
    this.db.prepare("UPDATE explore_candidates SET confirmed = 1 WHERE id = ?").run(id);
  }
  // ---- Scrape Runs ----
  createScrapeRun(data) {
    const id = (0, import_crypto.randomUUID)();
    this.db.prepare(`INSERT INTO scrape_runs
      (id, url, reason, max_pages, selector, run_id, step_number, explore_report_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.url,
      data.reason || null,
      data.maxPages || 1,
      data.selector || null,
      data.runId || null,
      data.stepNumber || null,
      data.exploreReportId || null
    );
    return this.getScrapeRun(id);
  }
  updateScrapeRun(id, data) {
    const updates = [];
    const values = [];
    if (data.status !== void 0) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.pagesCount !== void 0) {
      updates.push("pages_count = ?");
      values.push(data.pagesCount);
    }
    if (data.resultPath !== void 0) {
      updates.push("result_path = ?");
      values.push(data.resultPath);
    }
    if (data.errorMessage !== void 0) {
      updates.push("error_message = ?");
      values.push(data.errorMessage);
    }
    if (data.status === "complete" || data.status === "failed") updates.push("completed_at = datetime('now')");
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE scrape_runs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getScrapeRun(id);
  }
  getScrapeRun(id) {
    const r = this.db.prepare("SELECT * FROM scrape_runs WHERE id = ?").get(id);
    return r ? this.mapScrapeRun(r) : null;
  }
  findScrapeRunByPartialId(q) {
    const rows = this.db.prepare("SELECT * FROM scrape_runs WHERE id LIKE ? ORDER BY created_at DESC").all(q + "%");
    return rows.length >= 1 ? this.mapScrapeRun(rows[0]) : null;
  }
  listScrapeRuns(limit = 20) {
    return this.db.prepare("SELECT * FROM scrape_runs ORDER BY created_at DESC LIMIT ?").all(limit).map((r) => this.mapScrapeRun(r));
  }
  listScrapeRunsForRun(runId) {
    return this.db.prepare("SELECT * FROM scrape_runs WHERE run_id = ? ORDER BY created_at DESC").all(runId).map((r) => this.mapScrapeRun(r));
  }
  listScrapeRunsForExplore(reportId) {
    return this.db.prepare("SELECT * FROM scrape_runs WHERE explore_report_id = ? ORDER BY created_at DESC").all(reportId).map((r) => this.mapScrapeRun(r));
  }
  mapScrapeRun(r) {
    return {
      id: r.id,
      url: r.url,
      status: r.status,
      reason: r.reason,
      maxPages: r.max_pages,
      selector: r.selector,
      pagesCount: r.pages_count,
      resultPath: r.result_path,
      runId: r.run_id,
      stepNumber: r.step_number,
      exploreReportId: r.explore_report_id,
      errorMessage: r.error_message,
      createdAt: new Date(r.created_at),
      completedAt: r.completed_at ? new Date(r.completed_at) : null
    };
  }
  close() {
    this.db.close();
  }
  // ---- Run Data (extracted variables) ----
  saveRunData(runId, stepNumber, variableName, value) {
    const id = (0, import_crypto.randomUUID)();
    this.db.prepare("INSERT OR REPLACE INTO run_data (id, run_id, step_number, variable_name, variable_value) VALUES (?,?,?,?,?)").run(id, runId, stepNumber, variableName, value);
  }
  getRunData(runId) {
    return this.db.prepare("SELECT * FROM run_data WHERE run_id = ? ORDER BY step_number").all(runId).map((r) => ({ variableName: r.variable_name, variableValue: r.variable_value, stepNumber: r.step_number }));
  }
  // ---- Flow Stats ----
  getFlowStats(flowId) {
    const r = this.db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='passed' THEN 1 ELSE 0 END) as passed, MAX(started_at) as last_run_at FROM runs WHERE flow_id = ?").get(flowId);
    const last = this.db.prepare("SELECT status FROM runs WHERE flow_id = ? ORDER BY started_at DESC LIMIT 1").get(flowId);
    return {
      totalRuns: r?.total || 0,
      passRate: r?.total > 0 ? (r.passed || 0) / r.total : 0,
      lastRunStatus: last?.status || null,
      lastRunAt: r?.last_run_at || null
    };
  }
  // ---- Environments ----
  createEnvironment(data) {
    const id = (0, import_crypto.randomUUID)();
    this.db.prepare(`INSERT INTO environments (id, name, base_url, variables) VALUES (?, ?, ?, ?)`).run(id, data.name, data.baseUrl || null, JSON.stringify(data.variables || {}));
    return this.getEnvironment(id);
  }
  getEnvironment(id) {
    const r = this.db.prepare("SELECT * FROM environments WHERE id = ?").get(id);
    return r ? this.mapEnvironment(r) : null;
  }
  findEnvironmentByName(name) {
    const r = this.db.prepare("SELECT * FROM environments WHERE LOWER(name) = ?").get(name.toLowerCase());
    return r ? this.mapEnvironment(r) : null;
  }
  listEnvironments() {
    return this.db.prepare("SELECT * FROM environments ORDER BY name").all().map((r) => this.mapEnvironment(r));
  }
  updateEnvironment(id, data) {
    const updates = [];
    const values = [];
    if (data.name !== void 0) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.baseUrl !== void 0) {
      updates.push("base_url = ?");
      values.push(data.baseUrl);
    }
    if (data.variables !== void 0) {
      updates.push("variables = ?");
      values.push(JSON.stringify(data.variables));
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE environments SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return this.getEnvironment(id);
  }
  deleteEnvironment(id) {
    return this.db.prepare("DELETE FROM environments WHERE id = ?").run(id).changes > 0;
  }
  setActiveEnvironment(id) {
    this.db.prepare("UPDATE environments SET is_active = 0").run();
    this.db.prepare("UPDATE environments SET is_active = 1 WHERE id = ?").run(id);
  }
  getActiveEnvironment() {
    const r = this.db.prepare("SELECT * FROM environments WHERE is_active = 1 LIMIT 1").get();
    return r ? this.mapEnvironment(r) : null;
  }
  mapEnvironment(r) {
    return {
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      variables: JSON.parse(r.variables || "{}"),
      isActive: Boolean(r.is_active),
      createdAt: new Date(r.created_at)
    };
  }
  // ---- API Responses ----
  saveApiResponse(data) {
    const id = (0, import_crypto.randomUUID)();
    this.db.prepare(`INSERT INTO api_responses (id, run_id, step_number, method, url, status_code, response_time_ms, response_headers, response_body, error_message) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      id,
      data.runId,
      data.stepNumber,
      data.method,
      data.url,
      data.statusCode ?? null,
      data.responseTimeMs ?? null,
      data.responseHeaders ? JSON.stringify(data.responseHeaders) : null,
      data.responseBody ?? null,
      data.errorMessage ?? null
    );
    return id;
  }
  getApiResponses(runId) {
    return this.db.prepare("SELECT * FROM api_responses WHERE run_id = ? ORDER BY step_number").all(runId).map((r) => ({
      id: r.id,
      runId: r.run_id,
      stepNumber: r.step_number,
      method: r.method,
      url: r.url,
      statusCode: r.status_code,
      responseTimeMs: r.response_time_ms,
      responseHeaders: r.response_headers ? JSON.parse(r.response_headers) : null,
      responseBody: r.response_body,
      errorMessage: r.error_message
    }));
  }
  // ---- Perf Runs ----
  createPerfRun(data) {
    const id = (0, import_crypto.randomUUID)();
    this.db.prepare(`INSERT INTO perf_runs (id, flow_id, flow_name, config, status) VALUES (?, ?, ?, ?, 'running')`).run(id, data.flowId, data.flowName, JSON.stringify(data.config));
    return id;
  }
  updatePerfRun(id, data) {
    const updates = [];
    const values = [];
    if (data.status !== void 0) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.totalRequests !== void 0) {
      updates.push("total_requests = ?");
      values.push(data.totalRequests);
    }
    if (data.successRequests !== void 0) {
      updates.push("success_requests = ?");
      values.push(data.successRequests);
    }
    if (data.failedRequests !== void 0) {
      updates.push("failed_requests = ?");
      values.push(data.failedRequests);
    }
    if (data.avgRps !== void 0) {
      updates.push("avg_rps = ?");
      values.push(data.avgRps);
    }
    if (data.p50 !== void 0) {
      updates.push("p50_ms = ?");
      values.push(data.p50);
    }
    if (data.p95 !== void 0) {
      updates.push("p95_ms = ?");
      values.push(data.p95);
    }
    if (data.p99 !== void 0) {
      updates.push("p99_ms = ?");
      values.push(data.p99);
    }
    if (data.minMs !== void 0) {
      updates.push("min_ms = ?");
      values.push(data.minMs);
    }
    if (data.maxMs !== void 0) {
      updates.push("max_ms = ?");
      values.push(data.maxMs);
    }
    if (data.perStepStats !== void 0) {
      updates.push("per_step_stats = ?");
      values.push(JSON.stringify(data.perStepStats));
    }
    if (data.status === "done" || data.status === "failed") {
      updates.push("completed_at = datetime('now')");
    }
    values.push(id);
    if (updates.length > 0) this.db.prepare(`UPDATE perf_runs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
  getPerfRun(id) {
    const r = this.db.prepare("SELECT * FROM perf_runs WHERE id = ?").get(id);
    return r ? this.mapPerfRun(r) : null;
  }
  findPerfRunByPartialId(q) {
    const rows = this.db.prepare("SELECT * FROM perf_runs WHERE id LIKE ?").all(q + "%");
    return rows.length >= 1 ? this.mapPerfRun(rows[0]) : null;
  }
  listPerfRuns(limit = 20) {
    return this.db.prepare("SELECT * FROM perf_runs ORDER BY started_at DESC LIMIT ?").all(limit).map((r) => this.mapPerfRun(r));
  }
  mapPerfRun(r) {
    return {
      id: r.id,
      flowId: r.flow_id,
      flowName: r.flow_name,
      config: JSON.parse(r.config),
      status: r.status,
      totalRequests: r.total_requests,
      successRequests: r.success_requests,
      failedRequests: r.failed_requests,
      avgRps: r.avg_rps,
      p50: r.p50_ms,
      p95: r.p95_ms,
      p99: r.p99_ms,
      minMs: r.min_ms,
      maxMs: r.max_ms,
      perStepStats: r.per_step_stats ? JSON.parse(r.per_step_stats) : null,
      startedAt: new Date(r.started_at),
      completedAt: r.completed_at ? new Date(r.completed_at) : null
    };
  }
};

// run-report-v2.ts
var import_crypto2 = require("crypto");
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function formatReportDuration(ms) {
  if (!ms) return "\u2014";
  if (ms >= 1e3) return (ms / 1e3).toFixed(2) + "s";
  return ms + "ms";
}
function computeFlowGraphHash(graph) {
  if (!graph) return null;
  return (0, import_crypto2.createHash)("sha256").update(graph).digest("hex").slice(0, 8);
}
function computePassRate(runs) {
  if (runs.length === 0) return 0;
  const passed = runs.filter((r) => r.status === "passed").length;
  return Math.round(passed / runs.length * 100);
}
function buildRunHistorySparklineHtml(runs, currentRunId) {
  if (runs.length === 0) return "";
  const chronological = [...runs].reverse();
  const passRate = computePassRate(runs);
  const bars = chronological.map((r) => {
    const color = r.status === "passed" ? "#56d364" : r.status === "failed" ? "#f85149" : "#484f58";
    const isCurrent = currentRunId && r.id === currentRunId;
    return `<span class="history-bar${isCurrent ? " current" : ""}" style="background:${color}" title="${escapeHtml(r.status)}"></span>`;
  }).join("");
  return `<section class="panel history-panel" aria-labelledby="history-heading">
  <h2 id="history-heading">History</h2>
  <p class="panel-sub">${passRate}% pass rate \xB7 last ${runs.length} run${runs.length === 1 ? "" : "s"} on this flow</p>
  <div class="history-sparkline" role="img" aria-label="Pass/fail history: ${passRate}% pass rate over ${runs.length} runs">${bars}</div>
</section>`;
}
function buildRepairDiffPreview(proposal) {
  if (proposal.currentSelector && proposal.proposedSelector) {
    return `- ${proposal.currentSelector}
+ ${proposal.proposedSelector}`;
  }
  if (proposal.currentValue !== void 0 && proposal.proposedValue !== void 0) {
    return `- ${proposal.currentValue}
+ ${proposal.proposedValue}`;
  }
  if (proposal.rationale) return proposal.rationale;
  return "Review proposal JSON for suggested changes.";
}
function buildRepairPanelHtml(proposals) {
  if (proposals.length === 0) return "";
  const cards = proposals.map((p) => {
    const type = p.repairType || "repair";
    const diff = buildRepairDiffPreview(p);
    const applyCmd = `ghostrun repair apply ${p.id.slice(0, 8)}`;
    const showCmd = `ghostrun repair show ${p.id.slice(0, 8)}`;
    return `<article class="repair-card">
      <header class="repair-card-header">
        <span class="repair-type">${escapeHtml(type)}</span>
        <span class="repair-status">${escapeHtml(p.status)}</span>
        ${p.stepNumber != null ? `<span class="repair-step">Step ${p.stepNumber}</span>` : ""}
      </header>
      <pre class="repair-diff">${escapeHtml(diff)}</pre>
      <div class="repair-commands">
        <code>${escapeHtml(showCmd)}</code>
        <code>${escapeHtml(applyCmd)}</code>
      </div>
    </article>`;
  }).join("\n");
  return `<section class="panel repair-panel" aria-labelledby="repair-heading">
  <h2 id="repair-heading">Repair proposals</h2>
  <p class="panel-sub">${proposals.length} proposal${proposals.length === 1 ? "" : "s"} linked to this run</p>
  ${cards}
</section>`;
}
function buildNextStepsPanelHtml(params) {
  const rows = [
    { label: "Rerun flow", command: params.rerunCommand },
    { label: "List repairs", command: params.repairListCommand },
    { label: "Report path", command: params.reportPath }
  ];
  if (params.applyRepairCommand) {
    rows.splice(1, 0, { label: "Apply repair", command: params.applyRepairCommand });
  }
  const items = rows.map(
    (r) => `<li><span class="cmd-label">${escapeHtml(r.label)}</span><code class="cmd-value">${escapeHtml(r.command)}</code></li>`
  ).join("\n");
  return `<section class="panel next-steps-panel" aria-labelledby="next-steps-heading">
  <h2 id="next-steps-heading">Next steps</h2>
  <ul class="command-list">${items}</ul>
</section>`;
}
function buildIntentBlockHtml(intent) {
  if (!intent) return "";
  return `<section class="panel intent-panel" aria-labelledby="intent-heading">
  <h2 id="intent-heading">Intent</h2>
  <p class="intent-text">${escapeHtml(intent)}</p>
</section>`;
}
function buildFailurePanelHtml(failure) {
  const screenshotHtml = failure.screenshotSrc ? `<img class="failure-screenshot" src="${escapeHtml(failure.screenshotSrc)}" alt="Screenshot at failed step ${failure.stepNumber}" />` : '<p class="failure-missing-shot">No screenshot captured for this step.</p>';
  const selectorHtml = failure.selector ? `<div class="failure-meta-row"><span class="failure-meta-label">Selector</span><code>${escapeHtml(failure.selector)}</code></div>` : "";
  return `<section class="panel failure-panel" aria-labelledby="failure-heading">
  <h2 id="failure-heading">Failure</h2>
  <p class="panel-sub">Step ${failure.stepNumber}: ${escapeHtml(failure.action)} \u2014 ${escapeHtml(failure.name)}</p>
  ${screenshotHtml}
  <pre class="failure-error">${escapeHtml(failure.error)}</pre>
  ${selectorHtml}
</section>`;
}
var RUN_REPORT_V2_STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080c10;color:#cdd9e5;font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;line-height:1.6;padding:32px 40px 48px}
.report{max-width:960px;margin:0 auto}
.hero{background:linear-gradient(180deg,#0d1117 0%,#080c10 100%);border:1px solid #30363d;border-radius:14px;padding:24px 28px;margin-bottom:24px}
.hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.hero h1{font-size:26px;color:#f0f6fc;font-weight:600;line-height:1.25}
.status-badge{display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.status-badge.passed{background:#122117;color:#56d364;border:1px solid #238636}
.status-badge.failed{background:#1c0f0f;color:#f85149;border:1px solid #da3633}
.status-badge.running,.status-badge.other{background:#161b22;color:#e3b341;border:1px solid #484f58}
.headline{background:#160b0b;border:1px solid #f8514966;border-radius:10px;padding:14px 18px;margin:14px 0 0;color:#ffb4b4;font-size:15px;line-height:1.5}
.hero-meta{color:#768390;font-size:13px;display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px}
.hero-meta span{white-space:nowrap}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:24px}
.stat{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:14px 18px}
.stat-val{font-size:22px;font-weight:600;color:#f0f6fc}
.stat-label{font-size:11px;color:#768390;text-transform:uppercase;letter-spacing:.05em;margin-top:4px}
.panel{background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:20px 22px;margin-bottom:20px}
.panel h2{font-size:15px;color:#f0f6fc;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.panel-sub{color:#768390;font-size:13px;margin-bottom:14px}
.intent-text{color:#cdd9e5;font-size:15px;line-height:1.55}
.history-sparkline{display:flex;align-items:flex-end;gap:3px;height:32px;padding:4px 0}
.history-bar{flex:1;min-width:4px;max-width:14px;height:100%;border-radius:2px;opacity:.85}
.history-bar.current{outline:2px solid #f0f6fc;outline-offset:1px;opacity:1}
.repair-card{background:#080c10;border:1px solid #30363d;border-radius:8px;padding:14px 16px;margin-bottom:12px}
.repair-card:last-child{margin-bottom:0}
.repair-card-header{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:10px;font-size:12px}
.repair-type{color:#39d0d8;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.repair-status{color:#768390}
.repair-step{color:#e3b341}
.repair-diff{background:#160b0b;border:1px solid #30363d;border-radius:6px;padding:10px 12px;font-family:ui-monospace,monospace;font-size:12px;color:#ffb4b4;white-space:pre-wrap;margin-bottom:10px}
.repair-commands{display:flex;flex-wrap:wrap;gap:8px}
.repair-commands code{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:4px 8px;font-size:12px;color:#79c0ff}
.command-list{list-style:none;display:flex;flex-direction:column;gap:10px}
.command-list li{display:flex;flex-direction:column;gap:4px}
.cmd-label{font-size:11px;color:#768390;text-transform:uppercase;letter-spacing:.05em}
.cmd-value{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:8px 10px;font-family:ui-monospace,monospace;font-size:13px;color:#79c0ff;word-break:break-all}
.failure-screenshot{width:100%;max-height:420px;object-fit:contain;display:block;border-radius:8px;border:1px solid #30363d;background:#000;margin-bottom:14px}
.failure-missing-shot{color:#768390;font-size:13px;font-style:italic;margin-bottom:14px}
.failure-error{background:#160b0b;border:1px solid #30363d;border-radius:8px;padding:12px 14px;font-family:ui-monospace,monospace;font-size:13px;color:#f85149;white-space:pre-wrap;margin-bottom:10px}
.failure-meta-row{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;font-size:13px}
.failure-meta-label{color:#768390;min-width:72px}
.failure-meta-row code{color:#39d0d8;font-family:ui-monospace,monospace}
.timeline{margin-bottom:24px}
.timeline h2{font-size:15px;color:#f0f6fc;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px}
.steps{display:flex;flex-direction:column;gap:8px}
.step{background:#0d1117;border:1px solid #30363d;border-radius:8px;overflow:hidden}
.step.failed{border-color:#f85149;box-shadow:0 0 0 1px #f8514933}
.step.passed{border-color:#21262d}
.step-header{display:flex;align-items:center;gap:10px;padding:12px 16px;font-family:ui-monospace,monospace;font-size:13px}
.step-icon{font-size:16px;min-width:20px}
.step-num{color:#768390;min-width:24px}
.step-action{color:#39d0d8;min-width:120px}
.step-label{color:#f0f6fc;flex:1}
.step-dur{color:#768390;font-size:12px;text-align:right}
.step-error{padding:10px 16px 12px 50px;color:#f85149;font-size:13px;font-family:ui-monospace,monospace;background:#160b0b;border-top:1px solid #30363d}
.step-screenshot{width:100%;max-height:320px;object-fit:contain;display:block;border-top:1px solid #30363d;background:#000}
footer.report-footer{margin-top:32px;padding-top:16px;border-top:1px solid #21262d;color:#768390;font-size:12px;display:flex;flex-wrap:wrap;gap:8px 16px}
`;

// project-scope.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var import_crypto3 = require("crypto");
var activePaths = null;
function resolveProjectRoot(startDir = process.cwd()) {
  let dir = path2.resolve(startDir);
  while (true) {
    const config = path2.join(dir, ".ghostrun", "config.json");
    if (fs2.existsSync(config)) return dir;
    const parent = path2.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function buildProjectPaths(root) {
  const ghostrunPath = path2.join(root, ".ghostrun");
  return {
    root,
    ghostrunPath,
    configPath: path2.join(ghostrunPath, "config.json"),
    projectJsonPath: path2.join(ghostrunPath, "project.json"),
    dbPath: path2.join(ghostrunPath, "data", "ghostrun.db"),
    screenshotsPath: path2.join(ghostrunPath, "screenshots"),
    sessionsPath: path2.join(ghostrunPath, "sessions"),
    flowsBrowser: path2.join(ghostrunPath, "flows", "browser"),
    flowsApi: path2.join(ghostrunPath, "flows", "api"),
    flowsGenerated: path2.join(ghostrunPath, "flows", "generated"),
    fixturesSql: path2.join(ghostrunPath, "fixtures", "sql"),
    servicesPath: path2.join(ghostrunPath, "services"),
    webhooksPath: path2.join(ghostrunPath, "services", "webhooks")
  };
}
function initProjectContext(startDir = process.cwd()) {
  const root = resolveProjectRoot(startDir) || path2.resolve(startDir);
  activePaths = buildProjectPaths(root);
  return activePaths;
}
function getProjectPaths() {
  if (!activePaths) return initProjectContext();
  return activePaths;
}
function ensureProjectDirs(paths = getProjectPaths()) {
  const dirs = [
    paths.ghostrunPath,
    path2.dirname(paths.dbPath),
    paths.screenshotsPath,
    paths.sessionsPath,
    paths.flowsBrowser,
    paths.flowsApi,
    paths.flowsGenerated,
    paths.fixturesSql,
    paths.servicesPath,
    paths.webhooksPath,
    path2.join(paths.ghostrunPath, "profiles"),
    path2.join(paths.ghostrunPath, "proposals", "repairs"),
    path2.join(paths.ghostrunPath, "runs"),
    path2.join(paths.ghostrunPath, "reports"),
    path2.join(paths.ghostrunPath, "auth", "storage-state"),
    path2.join(paths.ghostrunPath, "auth", "secrets"),
    path2.join(paths.ghostrunPath, "ai", "sessions")
  ];
  for (const d of dirs) fs2.mkdirSync(d, { recursive: true });
}
function ensureProjectJson(projectName) {
  const paths = getProjectPaths();
  if (fs2.existsSync(paths.projectJsonPath)) return;
  const id = (0, import_crypto3.createHash)("sha256").update(paths.root).digest("hex").slice(0, 16);
  fs2.writeFileSync(
    paths.projectJsonPath,
    JSON.stringify({
      id,
      name: projectName || path2.basename(paths.root),
      root: paths.root,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      schemaVersion: "1"
    }, null, 2)
  );
}
function flowSlug(name) {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "flow";
}
function flowFilePath(flow, kind = "browser") {
  const paths = getProjectPaths();
  const dir = kind === "api" ? paths.flowsApi : kind === "generated" ? paths.flowsGenerated : paths.flowsBrowser;
  return path2.join(dir, `${flowSlug(flow.name)}-${flow.id.slice(0, 8)}.flow.json`);
}
function writeFlowFile(flow) {
  const paths = getProjectPaths();
  ensureProjectDirs(paths);
  let graph;
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    graph = {};
  }
  const kind = flow.createdBy === "agent" ? "generated" : "browser";
  const filePath = flowFilePath({ id: flow.id, name: flow.name, createdBy: flow.createdBy }, kind);
  const payload = {
    version: "1.1.0",
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    flow: {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      appUrl: flow.appUrl,
      graph,
      createdBy: flow.createdBy
    }
  };
  fs2.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}
function deleteFlowFile(flowId, flowName) {
  const paths = getProjectPaths();
  for (const dir of [paths.flowsBrowser, paths.flowsApi, paths.flowsGenerated]) {
    if (!fs2.existsSync(dir)) continue;
    for (const f of fs2.readdirSync(dir)) {
      if (f.includes(flowId.slice(0, 8))) {
        fs2.unlinkSync(path2.join(dir, f));
      }
    }
  }
}
function listFlowFiles() {
  const paths = getProjectPaths();
  const out = [];
  for (const dir of [paths.flowsBrowser, paths.flowsApi, paths.flowsGenerated]) {
    if (!fs2.existsSync(dir)) continue;
    out.push(...fs2.readdirSync(dir).filter((f) => f.endsWith(".flow.json")).map((f) => path2.join(dir, f)));
  }
  return out;
}
function syncFlowsFromDisk(upsert, findByName, update) {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  for (const filePath of listFlowFiles()) {
    try {
      const raw = JSON.parse(fs2.readFileSync(filePath, "utf8"));
      const f = raw.flow;
      if (!f?.name || !f.graph) {
        skipped++;
        continue;
      }
      const existing = findByName(f.name);
      if (existing) {
        update(existing.id, {
          description: f.description || void 0,
          appUrl: f.appUrl || void 0,
          graph: f.graph
        });
        updated++;
      } else {
        upsert({
          name: f.name,
          description: f.description || void 0,
          appUrl: f.appUrl || void 0,
          graph: f.graph,
          createdBy: f.createdBy
        });
        imported++;
      }
    } catch {
      skipped++;
    }
  }
  return { imported, updated, skipped };
}
function copyDevServicesTemplate() {
  const paths = getProjectPaths();
  ensureProjectDirs(paths);
  const dest = path2.join(paths.servicesPath, "dev.compose.yml");
  if (fs2.existsSync(dest)) return dest;
  const content = `# GhostRun Service Bridge \u2014 optional local Mailpit, Redis, Postgres
# All services are optional. Most SaaS QA uses profile auth + shared credentials instead.
# Usage (Mailpit only): docker compose -f .ghostrun/services/dev.compose.yml --profile mailpit up -d
services:
  mailpit:
    profiles: ["mailpit", "full"]
    image: axllent/mailpit:latest
    ports:
      - "8025:8025"
      - "1025:1025"
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1
  redis:
    profiles: ["full"]
    image: redis:7-alpine
    ports:
      - "6379:6379"
  postgres:
    profiles: ["full"]
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ghostrun
      POSTGRES_PASSWORD: ghostrun
      POSTGRES_DB: ghostrun_test
    ports:
      - "5433:5432"
`;
  fs2.writeFileSync(dest, content);
  return dest;
}
function updateProjectGitignore() {
  const paths = getProjectPaths();
  const gitignorePath = path2.join(paths.ghostrunPath, ".gitignore");
  const lines = [
    "runs/",
    "reports/",
    "screenshots/",
    "sessions/",
    "data/ghostrun.db",
    "data/*.db",
    "auth/secrets/",
    "auth/storage-state/*.json",
    "services/webhooks/*.json",
    "ai/sessions/",
    "*.local.json",
    ".env"
  ];
  fs2.writeFileSync(gitignorePath, lines.join("\n") + "\n");
}

// account-scope.ts
var DEFAULT_SAAS_ACCOUNT_IDS = ["superadmin", "admin", "manager", "guest"];
function buildDefaultSaaSAccounts(loginFlow, emailDomain = "yourapp.com") {
  const accounts = {};
  for (const id of DEFAULT_SAAS_ACCOUNT_IDS) {
    const secrets = secretNamesForAccount(id);
    accounts[id] = buildAccountFromSecrets({
      id,
      label: id === "superadmin" ? "Super admin" : id.charAt(0).toUpperCase() + id.slice(1),
      email: `qa-${id}@${emailDomain}`,
      emailSecret: secrets.email,
      passwordSecret: secrets.password,
      loginFlow
    });
  }
  return accounts;
}
var DEFAULT_EMAIL_VAR = "testEmail";
function normalizeAccountId(id) {
  return id.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "default";
}
function listAccountIds(profile) {
  return Object.keys(profile.accounts || {}).sort();
}
function getProfileAccount(profile, accountId) {
  const key = normalizeAccountId(accountId);
  return profile.accounts?.[key] || profile.accounts?.[accountId] || null;
}
function resolveSelectedAccountKey(profile, argv = []) {
  if (!profile?.accounts || Object.keys(profile.accounts).length === 0) return null;
  const flagIdx = argv.indexOf("--account");
  if (flagIdx !== -1 && argv[flagIdx + 1]) {
    return normalizeAccountId(argv[flagIdx + 1]);
  }
  if (process.env.GHOSTRUN_ACCOUNT) {
    return normalizeAccountId(process.env.GHOSTRUN_ACCOUNT);
  }
  if (profile.defaultAccount) {
    return normalizeAccountId(profile.defaultAccount);
  }
  return null;
}
async function resolveAccountEmail(account, runVars, resolveSecret) {
  const emailVar = account.emailVar || DEFAULT_EMAIL_VAR;
  if (runVars[emailVar]) return runVars[emailVar];
  if (account.email) return account.email;
  if (account.emailSecret) {
    const fromSecret = await resolveSecret(account.emailSecret);
    if (fromSecret) return fromSecret;
  }
  if (runVars.testEmail) return runVars.testEmail;
  if (runVars.accountEmail) return runVars.accountEmail;
  return void 0;
}
async function applyProfileAccount(profile, accountId, runVars, resolveSecret) {
  const account = getProfileAccount(profile, accountId);
  if (!account) {
    throw new Error(
      `Account "${accountId}" not found on profile "${profile.name}". Defined: ${listAccountIds(profile).join(", ") || "(none)"}. Use: ghostrun profile accounts list ${profile.name}`
    );
  }
  if (!account.passwordSecret) {
    throw new Error(`Account "${accountId}" on profile "${profile.name}" requires passwordSecret`);
  }
  const emailVar = account.emailVar || DEFAULT_EMAIL_VAR;
  const email = await resolveAccountEmail(account, runVars, resolveSecret);
  runVars.accountType = accountId;
  runVars.accountLabel = account.label || accountId;
  if (email) {
    runVars.accountEmail = email;
    runVars[emailVar] = email;
    runVars.testEmail = email;
    runVars.PROFILE_AUTH_USERNAME = email;
    runVars.AUTH_USERNAME = email;
  }
  const password = await resolveSecret(account.passwordSecret);
  if (password) {
    runVars[account.passwordSecret] = password;
    runVars.PROFILE_AUTH_PASSWORD = password;
  }
  for (const [k, v] of Object.entries(account.metadata || {})) {
    if (!(k in runVars)) runVars[k] = v;
  }
  return { accountId, account, email };
}
function getEffectiveAuthForAccount(profile, accountId) {
  const base = profile.auth || { strategy: "none" };
  if (!accountId) return base;
  const account = getProfileAccount(profile, accountId);
  if (!account) return base;
  return {
    ...base,
    loginFlow: account.loginFlow || base.loginFlow,
    usernameVar: account.emailVar || base.usernameVar || DEFAULT_EMAIL_VAR,
    usernameSecret: account.emailSecret || base.usernameSecret,
    passwordSecret: account.passwordSecret || base.passwordSecret,
    otpSecret: base.otpSecret,
    otpVar: base.otpVar
  };
}
function buildAccountFromSecrets(opts) {
  const emailVar = `${normalizeAccountId(opts.id)}Email`;
  return {
    label: opts.label || opts.id,
    email: opts.email,
    emailVar,
    emailSecret: opts.emailSecret || `STAGING_${opts.id.replace(/-/g, "_").toUpperCase()}_EMAIL`,
    passwordSecret: opts.passwordSecret,
    loginFlow: opts.loginFlow
  };
}
function secretNamesForAccount(accountId) {
  const slug = accountId.replace(/-/g, "_").toUpperCase();
  return {
    email: `STAGING_${slug}_EMAIL`,
    password: `STAGING_${slug}_PASSWORD`
  };
}

// service-bridge.ts
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
var http = __toESM(require("http"));
var crypto2 = __toESM(require("crypto"));
var hookServer = null;
function isEmailBridgeEnabled(services) {
  const provider = services?.email?.provider;
  if (provider === "none") return false;
  if (services?.email?.apiUrl) return true;
  if (provider === "mailpit" || provider === "mailhog") return true;
  return !!process.env.GHOSTRUN_MAILPIT_URL;
}
function isWebhookBridgeEnabled(services) {
  if (services?.webhook?.provider === "none") return false;
  return services?.webhook?.provider === "local" || !!services?.webhook?.baseUrl;
}
function resolveEmailApiUrl(services) {
  if (!isEmailBridgeEnabled(services)) return null;
  return services?.email?.apiUrl || process.env.GHOSTRUN_MAILPIT_URL || "http://localhost:8025";
}
async function fetchMailpitMessages(apiUrl) {
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/v1/messages?limit=50`, {
    signal: AbortSignal.timeout(5e3)
  });
  if (!res.ok) throw new Error(`Mailpit API HTTP ${res.status}`);
  const data = await res.json();
  return data.messages || [];
}
async function fetchMailpitMessage(apiUrl, id) {
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/v1/message/${id}`, {
    signal: AbortSignal.timeout(5e3)
  });
  if (!res.ok) throw new Error(`Mailpit message ${id} not found`);
  return res.json();
}
function matchEmailMessage(messages, opts) {
  const toLower = opts.to?.toLowerCase();
  const sub = opts.subjectContains?.toLowerCase();
  const from = opts.fromContains?.toLowerCase();
  for (const m of messages) {
    if (toLower) {
      const recipients = (m.To || []).map((t) => t.Address.toLowerCase());
      if (!recipients.some((r) => r.includes(toLower)) && !m.To?.some((t) => t.Address.toLowerCase() === toLower)) {
        continue;
      }
    }
    if (sub && !m.Subject.toLowerCase().includes(sub)) continue;
    if (from && !m.From?.Address?.toLowerCase().includes(from)) continue;
    return m;
  }
  return null;
}
function extractFirstUrl(text) {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[).,;]+$/, "") : null;
}
function extractOtpCode(text, length = 6) {
  const match = text.match(new RegExp(`\\b(\\d{${length}})\\b`));
  return match ? match[1] : null;
}
async function waitForEmail(services, opts) {
  const apiUrl = resolveEmailApiUrl(services);
  if (!apiUrl) {
    throw new Error(
      "email:wait requires profile.services.email (Mailpit). Optional \u2014 use form/storage-state auth with profile secrets instead, or add services.email to your profile."
    );
  }
  const timeout = opts.timeoutMs ?? services?.email?.timeoutMs ?? 3e4;
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeout) {
    try {
      const messages = await fetchMailpitMessages(apiUrl);
      const hit = matchEmailMessage(messages, opts);
      if (hit) {
        const full = await fetchMailpitMessage(apiUrl, hit.ID);
        return { message: hit, body: full.Text || "", html: full.HTML || "" };
      }
      lastError = `No matching email (checked ${messages.length} messages)`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`email:wait timed out after ${timeout}ms \u2014 ${lastError}`);
}
function sanitizeInboxSnapshot(messages, limit = 5) {
  return messages.slice(0, limit).map(
    (m) => `- [${m.Created}] ${m.Subject} \u2192 ${(m.To || []).map((t) => t.Address).join(", ")}`
  ).join("\n");
}
function webhookStoreDir() {
  const dir = getProjectPaths().webhooksPath;
  fs3.mkdirSync(dir, { recursive: true });
  return dir;
}
function listWebhookCaptures(limit = 20) {
  const dir = webhookStoreDir();
  return fs3.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit).map((f) => JSON.parse(fs3.readFileSync(path3.join(dir, f), "utf8")));
}
function saveWebhookCapture(capture) {
  const file = path3.join(webhookStoreDir(), `${capture.receivedAt.replace(/[:.]/g, "-")}-${capture.id.slice(0, 8)}.json`);
  fs3.writeFileSync(file, JSON.stringify(capture, null, 2));
}
function matchWebhookCapture(captures, pathPattern) {
  const norm = pathPattern.startsWith("/") ? pathPattern : `/${pathPattern}`;
  return captures.find((c) => c.path === norm || c.path.endsWith(norm)) || null;
}
async function waitForWebhook(services, opts) {
  const timeout = opts.timeoutMs ?? 3e4;
  const start = Date.now();
  const pattern = opts.path;
  while (Date.now() - start < timeout) {
    const hit = matchWebhookCapture(listWebhookCaptures(50), pattern);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 1e3));
  }
  throw new Error(`webhook:wait timed out after ${timeout}ms for path ${pattern}`);
}
function startHookCatcher(port = 8787) {
  return new Promise((resolve3, reject) => {
    if (hookServer) {
      resolve3({ port, url: `http://localhost:${port}` });
      return;
    }
    const server = http.createServer((req, res) => {
      if (req.method === "GET" && (req.url === "/hooks/health" || req.url === "/health")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "ghostrun-hook-catcher" }));
        return;
      }
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const capture = {
          id: `${Date.now()}`,
          path: req.url || "/",
          method: req.method || "POST",
          headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
          body: body.slice(0, 65536),
          receivedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        saveWebhookCapture(capture);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, id: capture.id }));
      });
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      hookServer = server;
      resolve3({ port, url: `http://127.0.0.1:${port}` });
    });
  });
}
async function runServicesDoctor(services) {
  const results = [];
  if (!services || !isEmailBridgeEnabled(services) && !isWebhookBridgeEnabled(services) && !services.postgres?.connectionSecret) {
    results.push({
      name: "Service Bridge",
      ok: true,
      detail: "Not configured \u2014 using profile auth (form, storage-state, bearer) and env secrets"
    });
    return results;
  }
  if (isEmailBridgeEnabled(services)) {
    const apiUrl = resolveEmailApiUrl(services);
    try {
      const msgs = await fetchMailpitMessages(apiUrl);
      results.push({ name: "Mailpit (optional)", ok: true, detail: `${msgs.length} message(s), API ${apiUrl}` });
    } catch (e) {
      results.push({
        name: "Mailpit (optional)",
        ok: false,
        detail: `${e instanceof Error ? e.message : e} \u2014 optional: docker compose -f .ghostrun/services/dev.compose.yml up -d mailpit`
      });
    }
  }
  if (isWebhookBridgeEnabled(services)) {
    const hookPort = 8787;
    try {
      const res = await fetch(`http://127.0.0.1:${hookPort}/hooks/health`, { signal: AbortSignal.timeout(2e3) });
      results.push({ name: "Hook catcher (optional)", ok: res.ok, detail: `http://127.0.0.1:${hookPort}` });
    } catch {
      results.push({
        name: "Hook catcher (optional)",
        ok: false,
        detail: "Not running \u2014 ghostrun services hook --daemon (optional)"
      });
    }
  }
  if (services?.postgres?.connectionSecret) {
    const url = process.env[services.postgres.connectionSecret];
    results.push({
      name: "Postgres",
      ok: !!url,
      detail: url ? "Connection secret env var set" : `Missing env ${services.postgres.connectionSecret}`
    });
  }
  return results;
}
async function runSqlFixtures(fixtures, connectionSecret) {
  const url = process.env[connectionSecret];
  if (!url) throw new Error(`Environment variable ${connectionSecret} not set for postgres fixtures`);
  let pg;
  try {
    pg = await import("pg");
  } catch {
    throw new Error("Install pg for SQL fixtures: npm install pg (or run fixtures manually)");
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const fixture of fixtures) {
      if (!fs3.existsSync(fixture)) throw new Error(`Fixture not found: ${fixture}`);
      const sql = fs3.readFileSync(fixture, "utf8");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}
async function withPgClient(connectionSecret, fn) {
  const url = process.env[connectionSecret];
  if (!url) throw new Error(`Environment variable ${connectionSecret} not set for postgres`);
  let pg;
  try {
    pg = await import("pg");
  } catch {
    throw new Error("Install pg for db:* actions: npm install pg");
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn((sql, params) => client.query(sql, params));
  } finally {
    await client.end();
  }
}
async function runDbQuery(connectionSecret, sql, params = []) {
  return withPgClient(connectionSecret, async (query) => {
    const result = await query(sql, params);
    return result.rows || [];
  });
}
async function assertDbQuery(connectionSecret, sql, expected, opts = {}) {
  const assertType = opts.assertType || "scalar";
  const rows = await runDbQuery(connectionSecret, sql, opts.params || []);
  if (assertType === "empty") {
    if (rows.length !== 0) {
      throw new Error(`db:assert expected 0 rows, got ${rows.length}: ${JSON.stringify(rows).slice(0, 200)}`);
    }
    return;
  }
  if (assertType === "count") {
    const expectedCount = parseInt(expected, 10);
    if (rows.length !== expectedCount) {
      throw new Error(`db:assert count expected ${expectedCount}, got ${rows.length}`);
    }
    return;
  }
  if (assertType === "contains") {
    const haystack = JSON.stringify(rows);
    if (!haystack.includes(expected)) {
      throw new Error(`db:assert contains expected "${expected}" not found in ${haystack.slice(0, 200)}`);
    }
    return;
  }
  if (rows.length === 0) {
    throw new Error(`db:assert scalar expected "${expected}" but query returned 0 rows`);
  }
  const firstRow = rows[0];
  const firstVal = Object.values(firstRow)[0];
  const actual = firstVal === null || firstVal === void 0 ? "" : String(firstVal);
  if (actual !== expected) {
    throw new Error(`db:assert scalar expected "${expected}", got "${actual}"`);
  }
}
function getJsonPath(obj, dotPath) {
  const parts = dotPath.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === void 0 || typeof cur !== "object") return void 0;
    cur = cur[part];
  }
  return cur;
}
function parseWebhookJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
function assertWebhookPayload(body, assertions) {
  const parsed = parseWebhookJson(body);
  for (const a of assertions) {
    const actual = getJsonPath(parsed, a.path);
    const op = a.op || (a.expected === void 0 ? "exists" : "equals");
    if (op === "exists") {
      if (actual === void 0 || actual === null) {
        throw new Error(`webhook:assert path "${a.path}" does not exist`);
      }
      continue;
    }
    const actualStr = actual === null || actual === void 0 ? "" : String(actual);
    if (op === "contains") {
      if (!actualStr.includes(a.expected || "")) {
        throw new Error(`webhook:assert path "${a.path}" expected to contain "${a.expected}", got "${actualStr}"`);
      }
    } else if (actualStr !== (a.expected || "")) {
      throw new Error(`webhook:assert path "${a.path}" expected "${a.expected}", got "${actualStr}"`);
    }
  }
}
function verifyWebhookSignature(capture, opts) {
  const headerName = (opts.headerName || "x-webhook-signature").toLowerCase();
  const algorithm = opts.algorithm || "sha256";
  const provided = Object.entries(capture.headers).find(([k]) => k.toLowerCase() === headerName)?.[1];
  if (!provided) {
    throw new Error(`assert:webhook-signature: header "${opts.headerName || "X-Webhook-Signature"}" not found`);
  }
  let signature = provided.trim();
  if (opts.prefix && signature.startsWith(opts.prefix)) {
    signature = signature.slice(opts.prefix.length);
  }
  const hmac = crypto2.createHmac(algorithm, opts.secret);
  hmac.update(capture.body, "utf8");
  const expected = hmac.digest("hex");
  const normalizedProvided = signature.toLowerCase();
  const normalizedExpected = expected.toLowerCase();
  if (normalizedProvided !== normalizedExpected) {
    throw new Error(`assert:webhook-signature: HMAC ${algorithm} mismatch (header ${headerName})`);
  }
}
function resolveWebhookCapture(captures, opts) {
  if (opts.path) {
    const hit = matchWebhookCapture(captures, opts.path);
    if (!hit) throw new Error(`webhook:assert: no capture for path ${opts.path}`);
    return hit;
  }
  if (opts.body !== void 0) {
    return {
      id: "inline",
      path: "/",
      method: "POST",
      headers: {},
      body: opts.body,
      receivedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  throw new Error("webhook:assert requires path or a captured webhook body variable");
}

// ghostrun.ts
var HOME_DIR2 = process.env.HOME || process.env.USERPROFILE || ".";
var DATA_PATH2 = path4.join(HOME_DIR2, ".ghostrun");
var GLOBAL_CONFIG_PATH = path4.join(DATA_PATH2, "config.json");
var SCRAPES_PATH = path4.join(DATA_PATH2, "scrapes");
function refreshProjectConstants() {
  const p = getProjectPaths();
  PROJECT_GHOSTRUN_PATH = p.ghostrunPath;
  PROJECT_CONFIG_PATH = p.configPath;
  return { ghostrunPath: p.ghostrunPath, configPath: p.configPath };
}
var PROJECT_GHOSTRUN_PATH = path4.join(process.cwd(), ".ghostrun");
var PROJECT_CONFIG_PATH = path4.join(PROJECT_GHOSTRUN_PATH, "config.json");
var EVIDENCE_SCHEMA_VERSION = "1.3";
var LEGACY_COMMAND_MAP = {
  "repair:list": "ghostrun repair list",
  "repair:show": "ghostrun repair show <id>",
  "repair:apply": "ghostrun repair apply <id>",
  "profile:list": "ghostrun profile list",
  "profile:show": "ghostrun profile show <name>",
  "profile:create": "ghostrun profile create <name>",
  "profile:use": "ghostrun profile use <name>",
  "profile:set": "ghostrun profile set <name> <key> <value>",
  "profile:delete": "ghostrun profile delete <name>",
  "run:show": "ghostrun report show <run-id>",
  "run:diff": "ghostrun report diff <run1> <run2>",
  "run:analyze": "ghostrun report analyze <run-id>",
  "run:list": "ghostrun report list",
  "flow:schedule": 'ghostrun monitor schedule add <id> "<cron>"',
  "schedule:list": "ghostrun monitor schedule list",
  "schedule:remove": "ghostrun monitor schedule remove <id>",
  "create": 'ghostrun author create "<description>"',
  "ai:usage": "ghostrun ai usage",
  "ai:status": "ghostrun ai status",
  "ai:sessions": "ghostrun ai sessions"
};
function rejectLegacyCommand(cmd2) {
  const replacement = LEGACY_COMMAND_MAP[cmd2];
  if (!replacement) return;
  errorMsg(`Command "${cmd2}" was removed in GhostRun v1.3.0.
  Use: ${replacement}`);
  process.exit(1);
}
function getSchedulerPidPath() {
  return path4.join(PROJECT_GHOSTRUN_PATH, "scheduler.pid");
}
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function defaultConfig() {
  return {
    project: {
      name: path4.basename(process.cwd()),
      workspaceVersion: "1"
    },
    interactionMode: "assist",
    features: {
      crawlee: { enabled: false }
    },
    ai: {
      provider: "auto",
      trackUsage: true,
      storeSanitizedTranscripts: true
    },
    policies: {
      allowAutoRepairApply: false,
      allowAiInCi: "summary-only",
      requireApprovalForFlowMutation: true,
      requireApprovalForSecretUse: true,
      autoImproveEnabled: false,
      maxAutoImproveIterations: 3,
      maxRepairAttemptsPerRun: 2,
      maxSameFailureRepeats: 2,
      visualDiffThresholdPercent: 5
    },
    integrations: {
      github: { enabled: false, labels: ["ghostrun", "qa-failure"], createOn: ["ci-failure"] },
      linear: { enabled: false, label: "ghostrun", createOn: ["ci-failure"] }
    }
  };
}
function readSingleConfig(filePath) {
  try {
    if (!fs4.existsSync(filePath)) return {};
    return JSON.parse(fs4.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}
function readConfig() {
  const base = defaultConfig();
  const globalConfig = readSingleConfig(GLOBAL_CONFIG_PATH);
  const projectConfig = readSingleConfig(PROJECT_CONFIG_PATH);
  return {
    ...base,
    ...globalConfig,
    ...projectConfig,
    project: { ...base.project, ...globalConfig.project || {}, ...projectConfig.project || {} },
    features: {
      ...base.features,
      ...globalConfig.features || {},
      ...projectConfig.features || {},
      crawlee: {
        ...base.features?.crawlee || {},
        ...(globalConfig.features || {}).crawlee || {},
        ...(projectConfig.features || {}).crawlee || {}
      }
    },
    ai: { ...base.ai, ...globalConfig.ai || {}, ...projectConfig.ai || {} },
    policies: { ...base.policies, ...globalConfig.policies || {}, ...projectConfig.policies || {} },
    integrations: {
      ...base.integrations,
      ...globalConfig.integrations || {},
      ...projectConfig.integrations || {},
      github: {
        ...base.integrations?.github || {},
        ...(globalConfig.integrations || {}).github || {},
        ...(projectConfig.integrations || {}).github || {}
      },
      linear: {
        ...base.integrations?.linear || {},
        ...(globalConfig.integrations || {}).linear || {},
        ...(projectConfig.integrations || {}).linear || {}
      }
    }
  };
}
function writeConfig(config, scope = "project") {
  const configPath = scope === "global" ? GLOBAL_CONFIG_PATH : PROJECT_CONFIG_PATH;
  fs4.mkdirSync(path4.dirname(configPath), { recursive: true });
  fs4.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
function ensureProjectWorkspace() {
  initProjectContext();
  refreshProjectConstants();
  const paths = getProjectPaths();
  ensureProjectDirs(paths);
  copyDevServicesTemplate();
  updateProjectGitignore();
  ensureProjectJson(readConfig().project?.name);
  if (!fs4.existsSync(PROJECT_CONFIG_PATH)) writeConfig(defaultConfig(), "project");
  const secretsReadme = path4.join(PROJECT_GHOSTRUN_PATH, "auth", "secrets", "README.txt");
  if (!fs4.existsSync(secretsReadme)) {
    fs4.writeFileSync(secretsReadme, [
      "Store local secret files here (gitignored).",
      "Prefer environment variables or your CI secret store when possible.",
      'Example: echo "my-token" > STAGING_API_TOKEN.txt',
      ""
    ].join("\n"));
  }
}
function getInteractionMode() {
  return readConfig().interactionMode || "assist";
}
function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}
function shortHash(input) {
  return (0, import_crypto4.createHash)("sha256").update(input).digest("hex").slice(0, 24);
}
function recordAiSession(entry) {
  ensureProjectWorkspace();
  const record = {
    id: (0, import_crypto4.randomUUID)(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...entry
  };
  const filePath = path4.join(PROJECT_GHOSTRUN_PATH, "ai", "sessions", `${record.timestamp.replace(/[:.]/g, "-")}-${record.id.slice(0, 8)}.json`);
  fs4.writeFileSync(filePath, JSON.stringify(record, null, 2));
}
function listAiSessions(limit = 50) {
  const dir = path4.join(PROJECT_GHOSTRUN_PATH, "ai", "sessions");
  if (!fs4.existsSync(dir)) return [];
  return fs4.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit).map((f) => {
    try {
      return JSON.parse(fs4.readFileSync(path4.join(dir, f), "utf8"));
    } catch {
      return null;
    }
  }).filter((x) => Boolean(x));
}
function aggregateAiUsage() {
  const sessions = listAiSessions(5e3);
  const byProvider = {};
  let calls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsd = 0;
  for (const session of sessions) {
    calls++;
    inputTokens += session.usage.inputTokens || 0;
    outputTokens += session.usage.outputTokens || 0;
    totalTokens += session.usage.totalTokens || 0;
    estimatedCostUsd += session.usage.estimatedCostUsd || 0;
    const key = `${session.provider}:${session.model}`;
    byProvider[key] = byProvider[key] || { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
    byProvider[key].calls++;
    byProvider[key].inputTokens += session.usage.inputTokens || 0;
    byProvider[key].outputTokens += session.usage.outputTokens || 0;
    byProvider[key].totalTokens += session.usage.totalTokens || 0;
    byProvider[key].estimatedCostUsd += session.usage.estimatedCostUsd || 0;
  }
  return { calls, inputTokens, outputTokens, totalTokens, estimatedCostUsd, byProvider, sessions };
}
function getProfilesDir() {
  ensureProjectWorkspace();
  return path4.join(PROJECT_GHOSTRUN_PATH, "profiles");
}
function profilePath(name) {
  return path4.join(getProfilesDir(), `${name}.json`);
}
function listProfiles() {
  const dir = getProfilesDir();
  if (!fs4.existsSync(dir)) return [];
  return fs4.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
    try {
      return JSON.parse(fs4.readFileSync(path4.join(dir, f), "utf8"));
    } catch {
      return null;
    }
  }).filter((x) => Boolean(x));
}
function getProfile(name) {
  const filePath = profilePath(name);
  if (!fs4.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs4.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}
function saveProfile(profile) {
  fs4.writeFileSync(profilePath(profile.name), JSON.stringify(profile, null, 2));
}
function deleteProfile(name) {
  const filePath = profilePath(name);
  if (!fs4.existsSync(filePath)) return false;
  fs4.unlinkSync(filePath);
  return true;
}
function getSelectedProfileName(argv = process.argv.slice(2)) {
  const idx = argv.indexOf("--profile");
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return readConfig().activeProfile || null;
}
function getSelectedProfile(argv = process.argv.slice(2)) {
  const name = getSelectedProfileName(argv);
  return name ? getProfile(name) : null;
}
function getProjectSecretsDir() {
  ensureProjectWorkspace();
  const dir = path4.join(PROJECT_GHOSTRUN_PATH, "auth", "secrets");
  fs4.mkdirSync(dir, { recursive: true });
  return dir;
}
function sessionFilePath(name) {
  return path4.join(DATA_PATH2, "sessions", `${name}.json`);
}
function getProjectStorageStateDir() {
  ensureProjectWorkspace();
  const dir = path4.join(PROJECT_GHOSTRUN_PATH, "auth", "storage-state");
  fs4.mkdirSync(dir, { recursive: true });
  return dir;
}
function normalizeSecretEnvKey(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}
function errorSignature(message) {
  return (message || "unknown").replace(/\d+ms/g, "Nms").replace(/[0-9a-f]{8,}/gi, "[id]").slice(0, 160);
}
function getRecentFailureRepeatCount(flowId, errorMessage) {
  const signature = errorSignature(errorMessage);
  return db.listRuns(flowId, 50).filter(
    (run) => run.status === "failed" && errorSignature(run.errorMessage || "") === signature
  ).length;
}
function getSelectorRepairAttemptCount(proposal) {
  return listRepairProposals(500).filter(
    (item) => item.flowId === proposal.flowId && item.nodeId === proposal.nodeId && item.status === "applied"
  ).length;
}
function getRepairType(proposal) {
  if (proposal.repairType) return proposal.repairType;
  if (proposal.proposedSelector) return "selector";
  if (proposal.proposedValue && ["assert:text", "assert:title", "assert:url", "assert:response", "assert:status"].includes(proposal.action || "")) {
    return "assertion";
  }
  if (proposal.action === "wait" || proposal.action === "wait:ms") return "wait";
  if (proposal.action === "navigate") return "url";
  if (proposal.repairType === "visual" || proposal.errorMessage?.includes("[DIFF:")) return "visual";
  return "config";
}
async function postMonitorWebhook(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.log(import_chalk.default.yellow(`  notify webhook failed: HTTP ${res.status}`));
    }
  } catch (err) {
    console.log(import_chalk.default.yellow(`  notify webhook error: ${err instanceof Error ? err.message : String(err)}`));
  }
}
async function postSlackAlert(webhookUrl, text) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      console.log(import_chalk.default.yellow(`  Slack notify failed: HTTP ${res.status}`));
    }
  } catch (err) {
    console.log(import_chalk.default.yellow(`  Slack notify error: ${err instanceof Error ? err.message : String(err)}`));
  }
}
function resolveMonitorNotificationTargets(extraArgs, profile) {
  const webhookUrl = parseFlagValue(extraArgs, "--notify-webhook") || profile?.metadata?.notifyWebhook || process.env.GHOSTRUN_NOTIFY_WEBHOOK;
  const slackWebhook = process.env.GHOSTRUN_SLACK_WEBHOOK || profile?.metadata?.slackWebhook;
  const thresholdRaw = parseFlagValue(extraArgs, "--notify-after") || profile?.metadata?.notifyAfterFailures || "3";
  const threshold = Math.max(1, parseInt(thresholdRaw, 10) || 3);
  const disabled = extraArgs.includes("--no-notify") || profile?.metadata?.notifyOnFailure === "false";
  return {
    webhookUrl: webhookUrl || void 0,
    slackWebhook: slackWebhook || void 0,
    threshold,
    enabled: !disabled && Boolean(webhookUrl || slackWebhook)
  };
}
async function sendMonitorAlert(opts) {
  const payload = {
    event: "ghostrun.monitor.alert",
    flowId: opts.flow.id,
    flowName: opts.flow.name,
    profile: opts.profileName || null,
    consecutiveFailures: opts.consecutiveFailures,
    error: opts.error || null,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (opts.webhookUrl) await postMonitorWebhook(opts.webhookUrl, payload);
  if (opts.slackWebhook) {
    const text = `:rotating_light: GhostRun monitor alert: *${opts.flow.name}* failed ${opts.consecutiveFailures}x in a row${opts.error ? `
> ${opts.error}` : ""}`;
    await postSlackAlert(opts.slackWebhook, text);
  }
}
function buildAuthorContext(profileName) {
  const hints = [];
  if (profileName) {
    const profile = getProfile(profileName);
    if (profile?.baseUrl) hints.push(`Active profile "${profileName}" baseUrl: ${profile.baseUrl}`);
    if (profile?.variables && Object.keys(profile.variables).length) {
      hints.push(`Profile variables: ${Object.keys(profile.variables).join(", ")}`);
    }
  }
  const flows = db.listFlows().slice(0, 8);
  if (flows.length) {
    hints.push(`Existing flow patterns: ${flows.map((f) => f.name).join(", ")}`);
  }
  const scrapesDir = SCRAPES_PATH;
  if (fs4.existsSync(scrapesDir)) {
    const recentScrapes = fs4.readdirSync(scrapesDir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 2);
    for (const file of recentScrapes) {
      try {
        const scrape = JSON.parse(fs4.readFileSync(path4.join(scrapesDir, file), "utf8"));
        const page = scrape.pages?.[0];
        if (page?.forms?.length) {
          hints.push(`Recent form selectors on ${page.url}: ${page.forms[0].fields.slice(0, 4).map((f) => f.selector).join(", ")}`);
        }
      } catch {
      }
    }
  }
  return hints.length ? `
Project context:
${hints.map((h) => `- ${h}`).join("\n")}` : "";
}
function detectFlakyFlows(limit = 10) {
  const flaky = [];
  for (const flow of db.listFlows()) {
    const runs = db.listRuns(flow.id, limit);
    if (runs.length < 4) continue;
    const statuses = runs.map((r) => r.status);
    if (!statuses.includes("passed") || !statuses.includes("failed")) continue;
    let transitions = 0;
    for (let i = 1; i < statuses.length; i++) {
      if (statuses[i] !== statuses[i - 1]) transitions++;
    }
    if (transitions >= 2) flaky.push(flow.name);
  }
  return flaky;
}
async function createFailureRepairProposal(params) {
  const { action, errorMessage, page, node, flow, runId, stepNum, selectedProfile } = params;
  if (["assert:text", "assert:title", "assert:url"].includes(action)) {
    let actualValue = "";
    if (page) {
      if (action === "assert:text") {
        actualValue = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => "");
      } else if (action === "assert:title") {
        actualValue = await page.title().catch(() => "");
      } else if (action === "assert:url") {
        actualValue = page.url();
      }
    }
    const expected = String(node.value || "");
    let proposed = expected;
    if (action === "assert:text" && actualValue) {
      const lines = actualValue.split("\n").map((l) => l.trim()).filter(Boolean);
      const candidate = lines.find((l) => l.length > 3 && l.length < 80);
      if (candidate) proposed = candidate;
    } else if (action === "assert:title" && actualValue) {
      proposed = actualValue.split(" ").slice(0, 5).join(" ");
    } else if (action === "assert:url" && actualValue) {
      try {
        proposed = new URL(actualValue).pathname;
      } catch {
        proposed = actualValue;
      }
    }
    if (proposed === expected) return null;
    return createRepairProposal({
      source: "ai-heal",
      repairType: "assertion",
      flowId: flow.id,
      flowName: flow.name,
      runId,
      nodeId: String(node.id || ""),
      stepNumber: stepNum,
      action,
      currentValue: expected,
      proposedValue: proposed,
      errorMessage,
      rationale: `Assertion failed. Expected "${expected}" but observed "${actualValue.slice(0, 120)}". Review whether the expected value should be updated.`
    });
  }
  if (action === "wait" || errorMessage.toLowerCase().includes("timeout")) {
    return createRepairProposal({
      source: "ai-heal",
      repairType: "wait",
      flowId: flow.id,
      flowName: flow.name,
      runId,
      nodeId: String(node.id || ""),
      stepNumber: stepNum,
      action,
      currentSelector: node.selector,
      currentValue: "10000",
      proposedValue: "20000",
      errorMessage,
      rationale: "Step timed out waiting for an element. Consider increasing wait time or switching to wait:text / wait:url."
    });
  }
  if (action === "navigate" && /404|net::ERR|Navigation|ENOTFOUND/i.test(errorMessage)) {
    const profileHint = selectedProfile?.baseUrl ? `Check profile baseUrl (${selectedProfile.baseUrl}) or update the flow URL.` : "Set baseUrl in your active profile.";
    return createRepairProposal({
      source: "ai-heal",
      repairType: "url",
      flowId: flow.id,
      flowName: flow.name,
      runId,
      nodeId: String(node.id || ""),
      stepNumber: stepNum,
      action,
      currentValue: String(node.url || node.value || ""),
      proposedValue: selectedProfile?.baseUrl || "",
      errorMessage,
      rationale: `Navigation failed. ${profileHint}`
    });
  }
  return null;
}
async function resolveSecretValue(ref) {
  if (!ref) return void 0;
  const envCandidates = [ref, normalizeSecretEnvKey(ref)];
  for (const key of envCandidates) {
    if (process.env[key]) return process.env[key];
  }
  const fileCandidates = [
    path4.join(getProjectSecretsDir(), ref),
    path4.join(getProjectSecretsDir(), `${ref}.txt`)
  ];
  for (const filePath of fileCandidates) {
    if (!fs4.existsSync(filePath)) continue;
    const value = fs4.readFileSync(filePath, "utf8").trim();
    if (value) return value;
  }
  try {
    const vaultModule = await Promise.resolve().then(() => (init_vault(), vault_exports));
    const vault2 = vaultModule.createVault();
    const credential = await vault2.getByName(ref);
    if (credential?.password) return credential.password;
  } catch {
  }
  return void 0;
}
function resolveStorageStatePath(profile) {
  const raw = profile.auth?.storageState?.trim();
  if (!raw) {
    const fallback = path4.join(getProjectStorageStateDir(), `${profile.name}.json`);
    return fs4.existsSync(fallback) ? fallback : void 0;
  }
  const filePath = path4.isAbsolute(raw) ? raw : path4.join(process.cwd(), raw);
  if (fs4.existsSync(filePath)) return filePath;
  const projectPath = path4.join(getProjectStorageStateDir(), raw.endsWith(".json") ? raw : `${raw}.json`);
  return fs4.existsSync(projectPath) ? projectPath : void 0;
}
async function resolveProfileAuth(profile, runVars, flowId, opts) {
  const accountId = opts?.accountId ?? null;
  const auth = getEffectiveAuthForAccount(profile, accountId);
  const strategy = auth?.strategy || profile.auth?.strategy || "none";
  if (strategy === "none") return null;
  const injectedVars = {};
  const usernameVar = auth?.usernameVar || profile.auth?.usernameVar;
  const resolvedUsername = profile.auth?.username || (usernameVar ? runVars[usernameVar] : void 0) || runVars.accountEmail || runVars.testEmail || await resolveSecretValue(auth?.usernameSecret || profile.auth?.usernameSecret) || runVars.PROFILE_AUTH_USERNAME || runVars.AUTH_USERNAME;
  if (resolvedUsername) {
    injectedVars.PROFILE_AUTH_USERNAME = resolvedUsername;
    if (usernameVar && !runVars[usernameVar]) {
      injectedVars[usernameVar] = resolvedUsername;
    }
    if (!runVars.testEmail) injectedVars.testEmail = resolvedUsername;
    if (!runVars.accountEmail) injectedVars.accountEmail = resolvedUsername;
  }
  switch (strategy) {
    case "storage-state": {
      const storageStatePath = resolveStorageStatePath(profile);
      if (!storageStatePath) {
        throw new Error(`Profile "${profile.name}" uses storage-state auth but no storage state file was found.`);
      }
      return {
        strategy: "storage-state",
        summary: accountId ? `storage-state:${path4.basename(storageStatePath)} (${accountId})` : `storage-state:${path4.basename(storageStatePath)}`,
        browserContextOptions: { storageState: storageStatePath },
        injectedVars
      };
    }
    case "basic-auth": {
      const password = await resolveSecretValue(auth?.passwordSecret || profile.auth?.passwordSecret);
      if (!resolvedUsername || !password) {
        throw new Error(`Profile "${profile.name}"${accountId ? ` account "${accountId}"` : ""} needs email and password for basic-auth.`);
      }
      injectedVars.PROFILE_AUTH_PASSWORD = password;
      return {
        strategy: "basic-auth",
        summary: accountId ? `basic-auth (${accountId})` : "basic-auth",
        browserContextOptions: {
          httpCredentials: { username: resolvedUsername, password }
        },
        apiAuth: { type: "basic", username: resolvedUsername, password },
        injectedVars
      };
    }
    case "bearer-token": {
      const token = await resolveSecretValue(auth?.tokenSecret || profile.auth?.tokenSecret || auth?.passwordSecret);
      if (!token) {
        throw new Error(`Profile "${profile.name}" needs tokenSecret for bearer-token auth.`);
      }
      injectedVars.PROFILE_AUTH_TOKEN = token;
      return {
        strategy: "bearer-token",
        summary: accountId ? `bearer-token (${accountId})` : "bearer-token",
        browserContextOptions: {
          extraHTTPHeaders: { Authorization: `Bearer ${token}` }
        },
        apiAuth: { type: "bearer", token },
        injectedVars
      };
    }
    case "form": {
      const loginFlow = auth?.loginFlow || profile.auth?.loginFlow;
      if (!loginFlow) {
        throw new Error(`Profile "${profile.name}" uses form auth but has no auth.loginFlow configured.`);
      }
      const password = await resolveSecretValue(auth?.passwordSecret || profile.auth?.passwordSecret);
      if (!resolvedUsername) {
        throw new Error(
          `Profile "${profile.name}"${accountId ? ` account "${accountId}"` : ""} needs an email for form login. Set email on the account, emailSecret env var, or variables.testEmail.`
        );
      }
      if (!password) {
        throw new Error(
          `Profile "${profile.name}"${accountId ? ` account "${accountId}"` : ""} needs password secret "${auth?.passwordSecret || profile.auth?.passwordSecret}".`
        );
      }
      injectedVars.PROFILE_AUTH_PASSWORD = password;
      const passKey = auth?.passwordSecret || profile.auth?.passwordSecret;
      if (passKey && !runVars[passKey]) {
        injectedVars[passKey] = password;
      }
      const sessionLoadName = `profile-auth-${flowId.slice(0, 8)}-${shortHash(`${profile.name}:${accountId || "default"}:${Date.now()}`)}`;
      const authRun = await executeFlow(loginFlow, { ...runVars, ...injectedVars }, {
        visible: opts?.visible,
        quiet: true,
        ci: opts?.ci,
        allowAiSummary: false,
        sessionSave: sessionLoadName,
        skipProfileAuth: true
      });
      if (!authRun.passed) {
        throw new Error(`Profile login flow failed${accountId ? ` (${accountId})` : ""}: ${authRun.error || "authentication run failed"}`);
      }
      return {
        strategy: "form",
        summary: accountId ? `form:${loginFlow} (${accountId})` : `form:${loginFlow}`,
        sessionLoadName,
        injectedVars
      };
    }
    case "otp-bypass": {
      const loginFlow = auth?.loginFlow || profile.auth?.loginFlow;
      if (!loginFlow) {
        throw new Error(`Profile "${profile.name}" uses otp-bypass auth but has no auth.loginFlow configured.`);
      }
      const otpVar = auth?.otpVar || profile.auth?.otpVar || "testOtp";
      const otpSecret = auth?.otpSecret || profile.auth?.otpSecret || "STAGING_TEST_OTP";
      const otpFromEnv = await resolveSecretValue(otpSecret);
      const testOtp = otpFromEnv || process.env[otpSecret] || "000000";
      injectedVars[otpVar] = testOtp;
      injectedVars.testOtp = testOtp;
      injectedVars.PROFILE_AUTH_OTP = testOtp;
      if (otpSecret && !runVars[otpSecret]) injectedVars[otpSecret] = testOtp;
      if (resolvedUsername) {
        injectedVars.testPhone = resolvedUsername;
        injectedVars.accountPhone = resolvedUsername;
      }
      const sessionLoadName = `profile-auth-${flowId.slice(0, 8)}-${shortHash(`${profile.name}:${accountId || "default"}:otp:${Date.now()}`)}`;
      const authRun = await executeFlow(loginFlow, { ...runVars, ...injectedVars }, {
        visible: opts?.visible,
        quiet: true,
        ci: opts?.ci,
        allowAiSummary: false,
        sessionSave: sessionLoadName,
        skipProfileAuth: true
      });
      if (!authRun.passed) {
        throw new Error(`Profile OTP login flow failed${accountId ? ` (${accountId})` : ""}: ${authRun.error || "authentication run failed"}`);
      }
      return {
        strategy: "otp-bypass",
        summary: accountId ? `otp-bypass:${loginFlow} (${accountId})` : `otp-bypass:${loginFlow}`,
        sessionLoadName,
        injectedVars
      };
    }
    default:
      return null;
  }
}
function isProductionLike(profile, startUrl) {
  if (profile?.name?.toLowerCase() === "production") return true;
  if (profile?.metadata?.tier?.toLowerCase() === "production") return true;
  if (!startUrl) return false;
  return getEnvLabel(startUrl).label === "production";
}
function getRepairProposalsDir() {
  ensureProjectWorkspace();
  return path4.join(PROJECT_GHOSTRUN_PATH, "proposals", "repairs");
}
function writeRepairProposal(proposal) {
  const filePath = path4.join(getRepairProposalsDir(), `${proposal.createdAt.replace(/[:.]/g, "-")}-${proposal.id.slice(0, 8)}.json`);
  fs4.writeFileSync(filePath, JSON.stringify(proposal, null, 2));
}
function countRepairProposalsForRun(runId) {
  return listRepairProposals(200).filter((p) => p.runId === runId).length;
}
function createRepairProposal(data) {
  const maxAttempts = readConfig().policies?.maxRepairAttemptsPerRun ?? 2;
  if (data.runId && countRepairProposalsForRun(data.runId) >= maxAttempts) {
    return null;
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const proposal = {
    id: (0, import_crypto4.randomUUID)(),
    createdAt: now,
    updatedAt: now,
    status: "proposed",
    ...data
  };
  writeRepairProposal(proposal);
  return proposal;
}
function listRepairProposals(limit = 50) {
  const dir = getRepairProposalsDir();
  if (!fs4.existsSync(dir)) return [];
  return fs4.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit).map((f) => {
    try {
      return JSON.parse(fs4.readFileSync(path4.join(dir, f), "utf8"));
    } catch {
      return null;
    }
  }).filter((x) => Boolean(x));
}
function findRepairProposal(id) {
  const dir = getRepairProposalsDir();
  if (!fs4.existsSync(dir)) return null;
  for (const file of fs4.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse()) {
    const filePath = path4.join(dir, file);
    try {
      const proposal = JSON.parse(fs4.readFileSync(filePath, "utf8"));
      if (proposal.id.startsWith(id)) return { proposal, filePath };
    } catch {
    }
  }
  return null;
}
function updateRepairProposal(id, updates) {
  const found = findRepairProposal(id);
  if (!found) return null;
  const next = {
    ...found.proposal,
    ...updates,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  fs4.writeFileSync(found.filePath, JSON.stringify(next, null, 2));
  return next;
}
function getImproveReportsDir() {
  ensureProjectWorkspace();
  return path4.join(PROJECT_GHOSTRUN_PATH, "reports", "improve");
}
function saveImproveReport(report) {
  fs4.mkdirSync(getImproveReportsDir(), { recursive: true });
  const filePath = path4.join(getImproveReportsDir(), `${report.createdAt.replace(/[:.]/g, "-")}-${report.id.slice(0, 8)}.json`);
  fs4.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}
function isCrawleeEnabled() {
  return readConfig().features?.crawlee?.enabled === true;
}
function setCrawleeEnabled(enabled) {
  const config = readConfig();
  config.features = config.features || {};
  config.features.crawlee = { ...config.features.crawlee || {}, enabled };
  writeConfig(config, "project");
}
async function loadCrawlee() {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)");
    return await dynamicImport("crawlee");
  } catch {
    throw new Error("Crawlee is not installed. Run: npm install crawlee");
  }
}
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
function sanitizeStoredValue(value, label, selector) {
  if (!value) return value;
  const context = `${label || ""} ${selector || ""}`.toLowerCase();
  if (/(password|passwd|pwd|token|secret|auth)/.test(context)) {
    return "[REDACTED]";
  }
  return sanitizePII(value);
}
function resolveVarsDeep(value, ctx) {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx.variables[k] ?? "");
  }
  if (Array.isArray(value)) return value.map((v) => resolveVarsDeep(v, ctx));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveVarsDeep(v, ctx);
    return out;
  }
  return value;
}
function getJsonPath2(obj, path5) {
  const parts = path5.replace(/^\$\.?/, "").split(/\.|\[(\d+)\]/).filter((p) => p !== void 0 && p !== "");
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === void 0) return void 0;
    if (typeof cur === "object") cur = cur[part];
    else return void 0;
  }
  return cur;
}
async function executeHttpRequest(node, ctx, runId, stepNumber) {
  const method = (node.method || "GET").toUpperCase();
  const url = resolveVarsDeep(node.url, ctx);
  if (!url) throw new Error("http:request requires a url");
  const rawHeaders = node.headers || {};
  const headers = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    headers[k] = resolveVarsDeep(v, ctx);
  }
  const auth = node.auth;
  if (auth?.type === "bearer" && auth.token) {
    headers["Authorization"] = `Bearer ${resolveVarsDeep(auth.token, ctx)}`;
  } else if (auth?.type === "basic" && auth.username) {
    const creds = Buffer.from(`${resolveVarsDeep(auth.username, ctx)}:${resolveVarsDeep(auth.password || "", ctx)}`).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  } else if (auth?.type === "apikey" && auth.key) {
    const headerName = auth.header || "X-API-Key";
    headers[headerName] = resolveVarsDeep(auth.key, ctx);
  } else if (!headers["Authorization"] && ctx.profileAuth?.type === "bearer" && ctx.profileAuth.token) {
    headers["Authorization"] = `Bearer ${ctx.profileAuth.token}`;
  } else if (!headers["Authorization"] && ctx.profileAuth?.type === "basic" && ctx.profileAuth.username) {
    const creds = Buffer.from(`${ctx.profileAuth.username}:${ctx.profileAuth.password || ""}`).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  }
  let body;
  if (node.body && ["POST", "PUT", "PATCH"].includes(method)) {
    const resolvedBody = resolveVarsDeep(node.body, ctx);
    body = typeof resolvedBody === "string" ? resolvedBody : JSON.stringify(resolvedBody);
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  }
  const start = Date.now();
  let response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch (e) {
    db.saveApiResponse({ runId, stepNumber, method, url, errorMessage: String(e) });
    throw new Error(`HTTP request failed: ${e}`);
  }
  const responseTimeMs = Date.now() - start;
  const responseHeaders = {};
  response.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });
  let bodyText = "";
  let bodyJson = null;
  try {
    bodyText = await response.text();
  } catch {
  }
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
  }
  ctx.lastResponse = {
    status: response.status,
    headers: responseHeaders,
    body: bodyJson ?? bodyText,
    bodyText,
    responseTimeMs,
    url,
    method
  };
  const sanitizedResponseHeaders = Object.fromEntries(
    Object.entries(responseHeaders).map(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"].includes(lowerKey)) {
        return [key, "[REDACTED]"];
      }
      return [key, sanitizePII(value)];
    })
  );
  db.saveApiResponse({
    runId,
    stepNumber,
    method,
    url,
    statusCode: response.status,
    responseTimeMs,
    responseHeaders: sanitizedResponseHeaders,
    responseBody: sanitizePII(bodyText.slice(0, 1e4))
  });
  const extract = node.extract;
  if (extract && bodyJson) {
    for (const [varName, jsonPath] of Object.entries(extract)) {
      const val = getJsonPath2(bodyJson, jsonPath);
      if (val !== void 0) {
        ctx.variables[varName] = String(val);
        db.saveRunData(runId, stepNumber, varName, sanitizePII(String(val)));
      }
    }
  }
}
async function executeApiAssert(node, ctx) {
  const lastResp = ctx.lastResponse;
  if (!lastResp) throw new Error("assert:response \u2014 no HTTP response in context (run http:request first)");
  const assertType = node.assert || "status";
  const expected = node.expected !== void 0 ? resolveVarsDeep(node.expected, ctx) : void 0;
  switch (assertType) {
    case "status": {
      const exp = Number(expected ?? 200);
      if (lastResp.status !== exp) {
        throw new Error(`Expected status ${exp}, got ${lastResp.status} \u2014 ${lastResp.url}`);
      }
      break;
    }
    case "status:range": {
      const min = Number(node.min ?? 200), max = Number(node.max ?? 299);
      if (lastResp.status < min || lastResp.status > max) {
        throw new Error(`Status ${lastResp.status} outside range [${min}-${max}]`);
      }
      break;
    }
    case "body:contains": {
      const needle = String(expected ?? "");
      if (!lastResp.bodyText.includes(needle)) {
        throw new Error(`Response body does not contain "${needle}"`);
      }
      break;
    }
    case "body:equals": {
      const expStr = typeof expected === "object" ? JSON.stringify(expected) : String(expected ?? "");
      const gotStr = typeof lastResp.body === "object" ? JSON.stringify(lastResp.body) : lastResp.bodyText;
      if (gotStr !== expStr) {
        throw new Error(`Response body mismatch.
Expected: ${expStr.slice(0, 200)}
Got:      ${gotStr.slice(0, 200)}`);
      }
      break;
    }
    case "json:path": {
      const jpath = node.path || "";
      const val = getJsonPath2(lastResp.body, jpath);
      const exp = resolveVarsDeep(node.expected, ctx);
      if (String(val) !== String(exp)) {
        throw new Error(`JSON path "${jpath}": expected "${exp}", got "${val}"`);
      }
      break;
    }
    case "json:exists": {
      const jpath = node.path || "";
      const val = getJsonPath2(lastResp.body, jpath);
      if (val === void 0 || val === null) {
        throw new Error(`JSON path "${jpath}" does not exist in response`);
      }
      break;
    }
    case "header": {
      const headerName = (node.header || "").toLowerCase();
      const headerVal = lastResp.headers[headerName];
      if (expected !== void 0 && String(headerVal) !== String(expected)) {
        throw new Error(`Header "${headerName}": expected "${expected}", got "${headerVal}"`);
      } else if (!headerVal) {
        throw new Error(`Header "${headerName}" not present in response`);
      }
      break;
    }
    case "time": {
      const maxMs = Number(expected ?? 2e3);
      if (lastResp.responseTimeMs > maxMs) {
        throw new Error(`Response took ${lastResp.responseTimeMs}ms, expected < ${maxMs}ms`);
      }
      break;
    }
    default:
      throw new Error(`Unknown assert type: "${assertType}"`);
  }
}
function executeSetVariable(node, ctx, runId, stepNumber) {
  const varName = node.variable;
  const value = resolveVarsDeep(node.value, ctx);
  if (!varName) throw new Error("set:variable requires a variable name");
  ctx.variables[varName] = String(value ?? "");
  db.saveRunData(runId, stepNumber, varName, sanitizePII(String(value ?? "")));
}
function executeExtractJson(node, ctx, runId, stepNumber) {
  const varName = node.variable;
  const jsonPath = node.path;
  if (!varName || !jsonPath) throw new Error("extract:json requires variable and path");
  if (!ctx.lastResponse) throw new Error("extract:json \u2014 no HTTP response in context");
  const val = getJsonPath2(ctx.lastResponse.body, jsonPath);
  if (val === void 0) throw new Error(`JSON path "${jsonPath}" not found in response`);
  ctx.variables[varName] = String(val);
  db.saveRunData(runId, stepNumber, varName, sanitizePII(String(val)));
}
function calcPercentile(sortedMs, pct) {
  if (!sortedMs.length) return 0;
  const idx = Math.ceil(pct / 100 * sortedMs.length) - 1;
  return sortedMs[Math.max(0, Math.min(idx, sortedMs.length - 1))];
}
function calcStats(samples, durationMs) {
  const httpSamples = samples.filter((s) => s.isHttp);
  const total = httpSamples.length;
  const success2 = httpSamples.filter((s) => s.success).length;
  const failed = total - success2;
  const durations = httpSamples.map((s) => s.duration).sort((a, b) => a - b);
  return {
    total,
    success: success2,
    failed,
    errorRate: total > 0 ? parseFloat((failed / total * 100).toFixed(1)) : 0,
    avgRps: parseFloat((total / (durationMs / 1e3)).toFixed(1)),
    p50: calcPercentile(durations, 50),
    p95: calcPercentile(durations, 95),
    p99: calcPercentile(durations, 99),
    min: durations[0] ?? 0,
    max: durations[durations.length - 1] ?? 0
  };
}
async function runApiStepDirect(node, action, ctx, timeoutMs) {
  const API_ONLY_ACTIONS = /* @__PURE__ */ new Set([
    "http:request",
    "assert:response",
    "assert:status",
    "assert:body",
    "assert:header",
    "assert:time",
    "set:variable",
    "extract:json",
    "env:switch",
    "email:wait",
    "email:extract-link",
    "email:extract-otp",
    "webhook:wait",
    "webhook:assert",
    "assert:webhook-signature",
    "services:seed",
    "db:query",
    "db:assert"
  ]);
  if (!API_ONLY_ACTIONS.has(action)) return;
  if (action === "http:request") {
    const method = (node.method || "GET").toUpperCase();
    const url = resolveVarsDeep(node.url, ctx);
    const rawHeaders = node.headers || {};
    const headers = {};
    for (const [k, v] of Object.entries(rawHeaders)) headers[k] = resolveVarsDeep(v, ctx);
    const auth = node.auth;
    if (auth?.type === "bearer" && auth.token) {
      headers["Authorization"] = `Bearer ${resolveVarsDeep(auth.token, ctx)}`;
    } else if (auth?.type === "basic" && auth.username) {
      const creds = Buffer.from(`${resolveVarsDeep(auth.username, ctx)}:${resolveVarsDeep(auth.password || "", ctx)}`).toString("base64");
      headers["Authorization"] = `Basic ${creds}`;
    } else if (auth?.type === "apikey" && auth.key) {
      headers[auth.header || "X-API-Key"] = resolveVarsDeep(auth.key, ctx);
    }
    let body;
    if (node.body && ["POST", "PUT", "PATCH"].includes(method)) {
      const resolved = resolveVarsDeep(node.body, ctx);
      body = typeof resolved === "string" ? resolved : JSON.stringify(resolved);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t = Date.now();
    let response;
    try {
      response = await fetch(url, { method, headers, body, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const responseTimeMs = Date.now() - t;
    let bodyText = "";
    let bodyJson = null;
    try {
      bodyText = await response.text();
    } catch {
    }
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
    }
    ctx.lastResponse = {
      status: response.status,
      headers: {},
      body: bodyJson ?? bodyText,
      bodyText,
      responseTimeMs,
      url,
      method
    };
    const extract = node.extract;
    if (extract && bodyJson) {
      for (const [varName, jp] of Object.entries(extract)) {
        const val = getJsonPath2(bodyJson, jp);
        if (val !== void 0) ctx.variables[varName] = String(val);
      }
    }
  } else if (action.startsWith("assert:")) {
    await executeApiAssert(node, ctx);
  } else if (action === "set:variable") {
    const varName = node.variable;
    if (varName) ctx.variables[varName] = String(resolveVarsDeep(node.value, ctx) ?? "");
  } else if (action === "extract:json") {
    const varName = node.variable;
    const jp = node.path;
    if (varName && jp && ctx.lastResponse) {
      const val = getJsonPath2(ctx.lastResponse.body, jp);
      if (val !== void 0) ctx.variables[varName] = String(val);
    }
  }
}
async function runVU(vuId, actionNodes, baseVars, endTime, samples, timeoutMs) {
  while (Date.now() < endTime) {
    const ctx = { variables: { ...baseVars } };
    for (const node of actionNodes) {
      if (Date.now() >= endTime) return;
      const action = node.action;
      const label = node.label || action;
      const t = Date.now();
      try {
        const resolvedNode = {
          ...node,
          url: node.url ? resolveVarsDeep(node.url, ctx) : node.url,
          value: node.value ? resolveVarsDeep(node.value, ctx) : node.value
        };
        await runApiStepDirect(resolvedNode, action, ctx, timeoutMs);
        const isHttp = action === "http:request";
        const httpSuccess = isHttp ? (ctx.lastResponse?.status ?? 0) < 400 : true;
        samples.push({ label, duration: Date.now() - t, success: httpSuccess, vuId, isHttp });
      } catch {
        const isHttp = action === "http:request";
        samples.push({ label, duration: Date.now() - t, success: false, vuId, isHttp });
        break;
      }
    }
  }
}
async function runPerfTest(flowId, config) {
  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) throw new Error("Flow not found: " + flowId);
  const graph = JSON.parse(flow.graph);
  const API_ONLY = /* @__PURE__ */ new Set([
    "http:request",
    "assert:response",
    "assert:status",
    "assert:body",
    "assert:header",
    "assert:time",
    "set:variable",
    "extract:json",
    "env:switch"
  ]);
  const actionNodes = (graph.nodes || []).filter((n) => n.type === "action");
  const apiNodes = actionNodes.filter((n) => API_ONLY.has(n.action));
  if (!apiNodes.length) throw new Error("No API steps found in this flow. perf:run only supports API flows.");
  const baseVars = {};
  const activeEnv = db.getActiveEnvironment();
  if (activeEnv) Object.assign(baseVars, activeEnv.variables);
  const perfRunId = db.createPerfRun({ flowId: flow.id, flowName: flow.name, config });
  const samples = [];
  const testStart = Date.now();
  const endTime = testStart + config.duration;
  const vuPromises = [];
  const rampDelay = config.vus > 1 ? config.rampUp / (config.vus - 1) : 0;
  for (let i = 0; i < config.vus; i++) {
    const delay = Math.round(i * rampDelay);
    vuPromises.push(
      new Promise((resolve3) => setTimeout(resolve3, delay)).then(
        () => runVU(i, apiNodes, baseVars, endTime, samples, config.timeout)
      )
    );
  }
  await Promise.all(vuPromises);
  const actualDuration = Date.now() - testStart;
  const stats = calcStats(samples, actualDuration);
  const perStep = {};
  const stepLabels = [...new Set(samples.map((s) => s.label))];
  for (const label of stepLabels) {
    const stepSamples = samples.filter((s) => s.label === label);
    const isHttpStep = stepSamples.some((s) => s.isHttp);
    if (isHttpStep) {
      perStep[label] = calcStats(stepSamples, actualDuration);
    } else {
      const total = stepSamples.length;
      const success2 = stepSamples.filter((s) => s.success).length;
      const failed = total - success2;
      const durations = stepSamples.map((s) => s.duration).sort((a, b) => a - b);
      perStep[label] = {
        total,
        success: success2,
        failed,
        errorRate: total > 0 ? parseFloat((failed / total * 100).toFixed(1)) : 0,
        avgRps: parseFloat((total / (actualDuration / 1e3)).toFixed(1)),
        p50: calcPercentile(durations, 50),
        p95: calcPercentile(durations, 95),
        p99: calcPercentile(durations, 99),
        min: durations[0] ?? 0,
        max: durations[durations.length - 1] ?? 0
      };
    }
  }
  db.updatePerfRun(perfRunId, {
    status: "done",
    totalRequests: stats.total,
    successRequests: stats.success,
    failedRequests: stats.failed,
    avgRps: stats.avgRps,
    p50: stats.p50,
    p95: stats.p95,
    p99: stats.p99,
    minMs: stats.min,
    maxMs: stats.max,
    perStepStats: perStep
  });
  const checkSamples = samples.filter((s) => !s.isHttp);
  const checksTotal = checkSamples.length;
  const checksFailed = checkSamples.filter((s) => !s.success).length;
  return { stats, checksTotal, checksFailed, perStep, perfRunId };
}
function generateK6Script(flowName, actionNodes, config) {
  const lines = [];
  const durationSec = Math.round(config.duration / 1e3);
  lines.push(`import http from 'k6/http';`);
  lines.push(`import { check, sleep } from 'k6';`);
  lines.push(`import { Trend } from 'k6/metrics';`);
  lines.push(``);
  lines.push(`// Generated by GhostRun from flow: "${flowName}"`);
  lines.push(`// Run with: k6 run <this-file>`);
  lines.push(``);
  lines.push(`export const options = {`);
  lines.push(`  stages: [`);
  lines.push(`    { duration: '${Math.max(5, Math.round(durationSec * 0.2))}s', target: ${config.vus} },`);
  lines.push(`    { duration: '${Math.max(10, Math.round(durationSec * 0.6))}s', target: ${config.vus} },`);
  lines.push(`    { duration: '${Math.max(5, Math.round(durationSec * 0.2))}s', target: 0 },`);
  lines.push(`  ],`);
  lines.push(`  thresholds: {`);
  lines.push(`    http_req_duration: ['p(95)<${config.p95threshold}'],`);
  lines.push(`    http_req_failed: ['rate<${(config.errorThreshold / 100).toFixed(2)}'],`);
  lines.push(`  },`);
  lines.push(`};`);
  lines.push(``);
  const httpSteps = actionNodes.filter((n) => n.action === "http:request");
  for (const node of httpSteps) {
    const varName = k6VarName(node.label || "request");
    lines.push(`const ${varName}Duration = new Trend('${varName}_duration');`);
  }
  if (httpSteps.length) lines.push(``);
  lines.push(`export default function () {`);
  lines.push(`  let res;`);
  const declaredVars = /* @__PURE__ */ new Set();
  let lastHttpVarName = "res";
  let lastHttpNodeLabel = "";
  for (const node of actionNodes) {
    const action = node.action;
    if (action === "set:variable") {
      const varName = node.variable;
      const val = toK6Value(node.value);
      if (!declaredVars.has(varName)) {
        lines.push(`  let ${varName} = ${val};`);
        declaredVars.add(varName);
      } else {
        lines.push(`  ${varName} = ${val};`);
      }
    } else if (action === "http:request") {
      const method = (node.method || "GET").toUpperCase();
      const url = toK6Value(node.url);
      const metricVar = k6VarName(node.label || "request") + "Duration";
      lastHttpNodeLabel = node.label || "";
      lastHttpVarName = `r${httpSteps.indexOf(node) + 1}`;
      const paramParts = [];
      const headerEntries = [];
      const rawHeaders = node.headers || {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        headerEntries.push(`'${k}': ${toK6Value(v)}`);
      }
      const auth = node.auth;
      if (auth?.type === "bearer") {
        headerEntries.push(`'Authorization': \`Bearer \${${toK6Var(auth.token || "")}}\``);
      } else if (auth?.type === "basic") {
        headerEntries.push(`'Authorization': 'Basic ' + btoa(\`\${${toK6Var(auth.username || "")}}:\${${toK6Var(auth.password || "")}}\`)`);
      } else if (auth?.type === "apikey") {
        headerEntries.push(`'${auth.header || "X-API-Key"}': ${toK6Value(auth.key || "")}`);
      }
      if (headerEntries.length) {
        paramParts.push(`headers: { ${headerEntries.join(", ")} }`);
      }
      const paramStr = paramParts.length ? `, { ${paramParts.join(", ")} }` : "";
      if (["GET", "DELETE", "HEAD"].includes(method)) {
        lines.push(`  const ${lastHttpVarName} = http.${method.toLowerCase()}(${url}${paramStr});`);
      } else {
        const bodyVal = node.body ? toK6Value(node.body) : "null";
        const hasContentType = headerEntries.some((h) => h.includes("Content-Type"));
        const ctHeader = hasContentType ? "" : `, headers: { 'Content-Type': 'application/json' }`;
        const bodyStr = `JSON.stringify(${bodyVal})`;
        const pStr = paramParts.length ? `, { ${paramParts.join(", ")}${ctHeader} }` : `, { headers: { 'Content-Type': 'application/json' } }`;
        lines.push(`  const ${lastHttpVarName} = http.${method.toLowerCase()}(${url}, ${bodyStr}${pStr});`);
      }
      lines.push(`  ${metricVar}.add(${lastHttpVarName}.timings.duration);`);
      const extract = node.extract;
      if (extract) {
        for (const [varName, jp] of Object.entries(extract)) {
          const jsonKey = jp.replace(/^\$\.?/, "");
          if (!declaredVars.has(varName)) {
            lines.push(`  let ${varName} = ${lastHttpVarName}.json('${jsonKey}');`);
            declaredVars.add(varName);
          } else {
            lines.push(`  ${varName} = ${lastHttpVarName}.json('${jsonKey}');`);
          }
        }
      }
    } else if (action === "assert:response" || action.startsWith("assert:")) {
      const assertType = node.assert || "status";
      const checkLabel = node.label || `assert ${assertType}`;
      let checkFn = "";
      switch (assertType) {
        case "status":
          checkFn = `(r) => r.status === ${node.expected ?? 200}`;
          break;
        case "body:contains":
          checkFn = `(r) => r.body.includes(${JSON.stringify(node.expected ?? "")})`;
          break;
        case "json:path": {
          const jp = (node.path || "").replace(/^\$\.?/, "");
          checkFn = `(r) => String(r.json('${jp}')) === ${JSON.stringify(String(node.expected ?? ""))}`;
          break;
        }
        case "json:exists": {
          const jp = (node.path || "").replace(/^\$\.?/, "");
          checkFn = `(r) => r.json('${jp}') !== null`;
          break;
        }
        case "header":
          checkFn = `(r) => r.headers['${node.header ?? ""}'] !== undefined`;
          break;
        case "time":
          checkFn = `(r) => r.timings.duration < ${node.expected ?? 2e3}`;
          break;
        default:
          checkFn = `() => true /* ${assertType} */`;
      }
      lines.push(`  check(${lastHttpVarName}, { ${JSON.stringify(checkLabel)}: ${checkFn} });`);
    } else if (action === "extract:json") {
      const varName = node.variable;
      const jp = (node.path || "").replace(/^\$\.?/, "");
      if (!declaredVars.has(varName)) {
        lines.push(`  let ${varName} = ${lastHttpVarName}.json('${jp}');`);
        declaredVars.add(varName);
      } else {
        lines.push(`  ${varName} = ${lastHttpVarName}.json('${jp}');`);
      }
    }
  }
  lines.push(`  sleep(0.1);`);
  lines.push(`}`);
  return lines.join("\n");
}
function k6VarName(label) {
  return label.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_").toLowerCase() || "step";
}
function toK6Value(val) {
  if (typeof val === "string") {
    if (val.includes("{{")) {
      const converted = val.replace(/\{\{(\w+)\}\}/g, (_, k) => `\${${k}}`);
      return `\`${converted}\``;
    }
    return JSON.stringify(val);
  }
  if (typeof val === "object" && val !== null) {
    const entries = Object.entries(val).map(([k, v]) => `${JSON.stringify(k)}: ${toK6Value(v)}`).join(", ");
    return `{ ${entries} }`;
  }
  return JSON.stringify(val);
}
function toK6Var(val) {
  if (val.match(/^\{\{(\w+)\}\}$/)) return val.replace(/^\{\{(\w+)\}\}$/, "$1");
  return JSON.stringify(val);
}
function getOllamaTimeoutMs(defaultMs) {
  const raw = process.env.GHOSTRUN_OLLAMA_TIMEOUT_MS;
  if (!raw) return defaultMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}
var lastAiError = null;
function setAiError(reason, detail) {
  lastAiError = { reason, detail };
}
function getLastAiError() {
  return lastAiError;
}
async function isOllamaRunning() {
  const baseUrl = process.env.GHOSTRUN_OLLAMA_URL || "http://localhost:11434";
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2e3) });
    if (!res.ok) return null;
    const data = await res.json();
    const preferred = process.env.GHOSTRUN_OLLAMA_MODEL;
    if (preferred) return preferred;
    const models = data.models || [];
    const gemma = models.find((m) => m.name.startsWith("gemma"));
    return gemma?.name || models[0]?.name || null;
  } catch {
    return null;
  }
}
async function callOllama(prompt) {
  const baseUrl = process.env.GHOSTRUN_OLLAMA_URL || "http://localhost:11434";
  const model = process.env.GHOSTRUN_OLLAMA_MODEL || await isOllamaRunning();
  if (!model) {
    setAiError("no-provider", "No Ollama model available (is Ollama running?)");
    return null;
  }
  const timeoutMs = getOllamaTimeoutMs(3e4);
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      setAiError("http-error", `Ollama returned HTTP ${res.status} ${res.statusText}`.trim());
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    if (!text) setAiError("empty-response", "Ollama returned an empty response");
    return text;
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    setAiError(
      isTimeout ? "timeout" : "connection-refused",
      isTimeout ? `Ollama request timed out after ${timeoutMs}ms \u2014 CPU-only inference can be slower than this; set GHOSTRUN_OLLAMA_TIMEOUT_MS to raise the limit` : `Could not reach Ollama at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    setAiError("no-api-key", "ANTHROPIC_API_KEY is not set");
    return null;
  }
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const model = "claude-3-5-haiku-20241022";
    const msg = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    });
    const content = msg.content[0];
    const text = content.type === "text" ? content.text.trim() : null;
    const inputTokens = Number(msg.usage?.input_tokens || 0);
    const outputTokens = Number(msg.usage?.output_tokens || 0);
    return {
      text,
      model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      }
    };
  } catch (err) {
    setAiError("anthropic-error", err instanceof Error ? err.message : String(err));
    return null;
  }
}
async function callAI(prompt, options) {
  const startedAt = Date.now();
  const config = readConfig();
  const provider = process.env.GHOSTRUN_AI_PROVIDER;
  const interactionMode = getInteractionMode();
  const promptSanitized = sanitizePII(prompt).slice(0, 4e3);
  lastAiError = null;
  if (provider !== "anthropic") {
    const result2 = await callOllama(prompt);
    if (result2) {
      const model = process.env.GHOSTRUN_OLLAMA_MODEL || "ollama";
      const usage = {
        inputTokens: estimateTokens(prompt),
        outputTokens: estimateTokens(result2),
        totalTokens: estimateTokens(prompt) + estimateTokens(result2)
      };
      if (config.ai?.trackUsage !== false) {
        recordAiSession({
          mode: options?.mode || "general",
          provider: "ollama",
          model,
          interactionMode,
          durationMs: Date.now() - startedAt,
          usage,
          promptHash: shortHash(promptSanitized),
          promptPreview: promptSanitized.slice(0, 600),
          responsePreview: sanitizePII(result2).slice(0, 600),
          metadata: options?.metadata
        });
      }
      return { text: result2, provider: "ollama", model, usage };
    }
    if (provider === "ollama") return null;
  }
  const ollamaFailure = getLastAiError();
  const result = await callAnthropic(prompt);
  if (result?.text) {
    if (config.ai?.trackUsage !== false) {
      recordAiSession({
        mode: options?.mode || "general",
        provider: "anthropic",
        model: result.model,
        interactionMode,
        durationMs: Date.now() - startedAt,
        usage: result.usage,
        promptHash: shortHash(promptSanitized),
        promptPreview: promptSanitized.slice(0, 600),
        responsePreview: sanitizePII(result.text).slice(0, 600),
        metadata: options?.metadata
      });
    }
    return { text: result.text, provider: "anthropic", model: result.model, usage: result.usage };
  }
  if (ollamaFailure && ollamaFailure.reason !== "no-provider") {
    const anthropicFailure = getLastAiError();
    const anthropicNote = anthropicFailure?.reason === "no-api-key" ? "" : ` (Anthropic fallback also failed: ${anthropicFailure?.detail})`;
    setAiError(ollamaFailure.reason, `${ollamaFailure.detail}${anthropicNote}`);
  }
  return null;
}
function buildFailurePrompt(ctx) {
  const stepsSummary = ctx.steps.map(
    (s) => `  Step ${s.stepNumber} [${s.status}]: ${s.name} (${s.action}${s.selector ? ` on "${s.selector}"` : ""})`
  ).join("\n");
  const errorType = categorizeError(ctx.failedStep.errorMessage);
  const selectorHint = ctx.failedStep.selector ? detectSelectorIssue(ctx.failedStep.selector, ctx.failedStep.errorMessage) : "";
  return `You are a web automation expert analyzing why a browser test failed.

Flow: "${ctx.flowName}"
Completed steps:
${stepsSummary}

Failed step: "${ctx.failedStep.name}"
Action: ${ctx.failedStep.action}${ctx.failedStep.selector ? `
Selector: "${ctx.failedStep.selector}"` : ""}
Error: ${ctx.failedStep.errorMessage}

Error category detected: ${errorType}
${selectorHint ? `Selector analysis: ${selectorHint}` : ""}
${ctx.scrapeContext ? `
Page scrape context:
${ctx.scrapeContext}` : ""}

Respond in EXACTLY this format (no extra text, no markdown):

WHAT FAILED
<specific description of what step failed and what it was trying to accomplish>

WHY IT FAILED  
<2-3 sentences explaining the root cause \u2014 be specific about whether this is a selector issue, timing, page structure change, network issue, or assertion mismatch>

HOW TO FIX IT
<2-3 actionable steps the developer can take to resolve this \u2014 include specific suggestions for selectors or timing if applicable>`;
}
function categorizeError(errorMessage) {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("not found") || msg.includes("timeout") || msg.includes("locator")) {
    return "ELEMENT_NOT_FOUND - Selector may be broken or element not loaded";
  }
  if (msg.includes("not visible") || msg.includes("hidden")) {
    return "ELEMENT_NOT_VISIBLE - Element exists but is not interactable";
  }
  if (msg.includes("disabled") || msg.includes("not actionable")) {
    return "ELEMENT_DISABLED - Element is present but not clickable";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to load")) {
    return "NETWORK_ERROR - Page or resource failed to load";
  }
  if (msg.includes("assert") || msg.includes("expected")) {
    return "ASSERTION_FAILED - Expected condition not met";
  }
  return "UNKNOWN_ERROR - Review error message for details";
}
function detectSelectorIssue(selector, errorMessage) {
  const issues = [];
  const msg = errorMessage.toLowerCase();
  if (selector.includes("//") && msg.includes("not found")) {
    issues.push("- XPath selectors are fragile; consider using CSS or data attributes");
  }
  if (selector.includes("text=") || selector.includes(":has-text")) {
    issues.push("- Text-based selectors break when UI text changes");
  }
  if (selector.includes("nth") || selector.includes("[1]") || selector.includes("[2]")) {
    issues.push("- Positional selectors are brittle; element order may have changed");
  }
  if (selector.match(/[.#][\w-]+(?<!\w)/) && !selector.includes("data-testid") && !selector.includes("data-cy")) {
    issues.push("- CSS class selectors may change with UI updates; consider data-testid attributes");
  }
  if (selector.includes(" ") && selector.includes("//")) {
    issues.push("- Complex XPath may be too specific; try shorter path");
  }
  return issues.join("\n");
}
function printLogo() {
  console.log(import_chalk.default.cyan(`
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551                                              \u2551
  \u2551   \u2591\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2591\u2588\u2588\u2557  \u2588\u2588\u2557\u2591\u2588\u2588\u2588\u2588\u2588\u2557\u2591\u2591\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2551
  \u2551   \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2591\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D \u2551
  \u2551   \u2588\u2588\u2551\u2591\u2591\u2588\u2588\u2557\u2591\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551\u2591\u2591\u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2557\u2591   \u2588\u2588\u2551    \u2551
  \u2551   \u2588\u2588\u2551\u2591\u2591\u255A\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551\u2591\u2591\u2588\u2588\u2551\u2591\u255A\u2550\u2550\u2550\u2588\u2588\u2557   \u2588\u2588\u2551    \u2551
  \u2551   \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D   \u2588\u2588\u2551    \u2551
  \u2551   \u2591\u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D    \u255A\u2550\u255D    \u2551
  \u2551                                              \u2551
  \u2551   \u{1F47B}  Record once. Replay as a ghost.        \u2551
  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
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
function timeAgo(dateStr) {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const sec = Math.floor((Date.now() - date.getTime()) / 1e3);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return date.toLocaleDateString();
}
function passRateDots(rate, total) {
  if (total === 0) return import_chalk.default.gray("no runs");
  const filled = Math.round(rate * 6);
  return import_chalk.default.green("\u25CF".repeat(filled)) + import_chalk.default.gray("\u25CB".repeat(6 - filled)) + import_chalk.default.gray(` ${Math.round(rate * 100)}%`);
}
function progressBar(current, total, width = 20) {
  const filled = Math.round(current / total * width);
  return import_chalk.default.cyan("\u2588".repeat(filled)) + import_chalk.default.gray("\u2591".repeat(width - filled));
}
function getEnvLabel(url) {
  if (!url) return { label: "", color: import_chalk.default.white };
  if (url.includes("localhost") || url.includes("127.0.0.1")) return { label: "local", color: import_chalk.default.blue };
  if (url.includes("staging") || url.includes("stage") || url.includes("preprod")) return { label: "staging", color: import_chalk.default.yellow };
  return { label: "production", color: import_chalk.default.red };
}
var sharedRl = null;
var pendingLines = [];
var lineWaiters = [];
function getSharedReadline() {
  if (!sharedRl) {
    sharedRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    sharedRl.on("line", (line) => {
      const waiter = lineWaiters.shift();
      if (waiter) waiter(line);
      else pendingLines.push(line);
    });
    sharedRl.on("close", () => {
      sharedRl = null;
    });
  }
  return sharedRl;
}
function closeSharedReadline() {
  if (sharedRl) {
    sharedRl.close();
    sharedRl = null;
  }
  pendingLines = [];
  lineWaiters = [];
}
function askQuestion(question) {
  getSharedReadline();
  process.stdout.write(question);
  const queued = pendingLines.shift();
  const linePromise = queued !== void 0 ? Promise.resolve(queued) : new Promise((resolve3) => lineWaiters.push(resolve3));
  return linePromise.then((line) => line.trim());
}
async function confirmAction(question, defaultAnswer = false) {
  const mode = getInteractionMode();
  if (mode === "auto") {
    info(`Auto mode: ${question.trim()} -> ${defaultAnswer ? "yes" : "no"}`);
    return defaultAnswer;
  }
  const answer = (await askQuestion(question)).toLowerCase();
  if (!answer) return defaultAnswer;
  return answer === "y" || answer === "yes";
}
var RECORDER_SCRIPT = `
(function() {
  if (window.__ghostrunInjected) return;
  window.__ghostrunInjected = true;

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
    window.__ghostrunRecord({ type: 'click', selector: sel, label: label, url: window.location.href, timestamp: now });
  }, true);

  document.addEventListener('blur', function(e) {
    const target = e.target;
    if (!isInputField(target) || !target.value) return;
    window.__ghostrunRecord({ type: 'fill', selector: getBestSelector(target), value: target.value, url: window.location.href, timestamp: Date.now() });
  }, true);

  document.addEventListener('change', function(e) {
    const target = e.target;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'select') window.__ghostrunRecord({ type: 'select', selector: getBestSelector(target), value: target.value, url: window.location.href, timestamp: Date.now() });
    if (tag === 'input' && (target.type === 'checkbox' || target.type === 'radio'))
      window.__ghostrunRecord({ type: 'check', selector: getBestSelector(target), value: String(target.checked), url: window.location.href, timestamp: Date.now() });
  }, true);
})();
`;
function parseVars(argv) {
  const vars = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--var" && argv[i + 1]) {
      const eq = argv[i + 1].indexOf("=");
      if (eq !== -1) {
        vars[argv[i + 1].slice(0, eq)] = argv[i + 1].slice(eq + 1);
      }
      i++;
    }
  }
  const profile = getSelectedProfile(argv);
  if (profile?.variables) {
    for (const [key, val] of Object.entries(profile.variables)) {
      if (!(key in vars)) vars[key] = val;
    }
  }
  if (profile?.baseUrl) {
    if (!("BASE_URL" in vars)) vars.BASE_URL = profile.baseUrl;
    if (!("__baseUrl" in vars)) vars.__baseUrl = profile.baseUrl;
  }
  const envFile = path4.join(process.cwd(), ".ghostrun.env");
  if (fs4.existsSync(envFile)) {
    const lines = fs4.readFileSync(envFile, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq !== -1) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key && !(key in vars)) vars[key] = val;
      }
    }
  }
  return vars;
}
function resolveVars(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] !== void 0 ? vars[k] : `{{${k}}}`);
}
async function loadSession(context, name) {
  const sessionPath = sessionFilePath(name);
  if (!fs4.existsSync(sessionPath)) throw new Error(`Session not found: ${name}. Run with --save-session first.`);
  const cookies = JSON.parse(fs4.readFileSync(sessionPath, "utf-8"));
  await context.addCookies(cookies);
  return cookies.length;
}
async function saveSession(context, name) {
  const cookies = await context.cookies();
  const sessionPath = sessionFilePath(name);
  fs4.writeFileSync(sessionPath, JSON.stringify(cookies, null, 2));
  fs4.chmodSync(sessionPath, 384);
  return cookies.length;
}
function parseFlagValue(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("--") ? argv[idx + 1] : void 0;
}
function parseNumberFlag(argv, flag, fallback, max) {
  const raw = parseFlagValue(argv, flag);
  const n = raw ? parseInt(raw, 10) : fallback;
  return Math.max(1, Math.min(Number.isFinite(n) ? n : fallback, max));
}
function summarizeScrapePage(page) {
  const pieces = [
    page.title ? `Title: ${page.title}` : "",
    page.headings.length ? `Headings: ${page.headings.slice(0, 6).join(" | ")}` : "",
    page.buttons.length ? `Buttons: ${page.buttons.slice(0, 8).map((b) => b.text).filter(Boolean).join(" | ")}` : "",
    page.forms.length ? `Forms: ${page.forms.map((f) => f.fields.map((field) => field.label || field.name || field.placeholder || field.type).filter(Boolean).join(", ")).filter(Boolean).join(" | ")}` : "",
    page.text ? `Text: ${page.text.slice(0, 800)}` : ""
  ].filter(Boolean);
  return pieces.join("\n");
}
function extractScrapeText(result) {
  if (!result?.pages?.length) return void 0;
  return summarizeScrapePage(result.pages[0]);
}
async function runCrawleeScrape(url, options = {}) {
  if (options.requireEnabled !== false && !isCrawleeEnabled()) {
    throw new Error("Crawlee scraping is not enabled. Run `ghostrun init` and enable website scraping.");
  }
  const maxPages = Math.max(1, Math.min(options.maxPages || 1, 100));
  const reason = options.reason || "manual";
  const scrape = db.createScrapeRun({
    url,
    reason,
    maxPages,
    selector: options.selector,
    runId: options.runId,
    stepNumber: options.stepNumber,
    exploreReportId: options.exploreReportId
  });
  const scrapeDir = path4.join(SCRAPES_PATH, scrape.id);
  fs4.mkdirSync(scrapeDir, { recursive: true });
  const resultPath = path4.join(scrapeDir, "result.json");
  process.env.CRAWLEE_STORAGE_DIR = path4.join(scrapeDir, "crawlee-storage");
  const pages = [];
  try {
    const crawlee = await loadCrawlee();
    const { PlaywrightCrawler } = crawlee;
    if (options.quiet && crawlee.log && crawlee.LogLevel) {
      crawlee.log.setLevel(crawlee.LogLevel.OFF);
    }
    const inputHost = new URL(url).hostname;
    const allowedHosts = /* @__PURE__ */ new Set([inputHost, inputHost.startsWith("www.") ? inputHost.slice(4) : `www.${inputHost}`]);
    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: maxPages,
      requestHandlerTimeoutSecs: 30,
      async requestHandler({ request, page, enqueueLinks }) {
        await page.waitForLoadState("domcontentloaded", { timeout: 15e3 }).catch(() => {
        });
        await page.waitForLoadState("networkidle", { timeout: 5e3 }).catch(() => {
        });
        await page.waitForSelector("body", { state: "visible", timeout: 5e3 }).catch(() => {
        });
        await page.waitForTimeout(500).catch(() => {
        });
        const selectedSelector = options.selector || "";
        const scraped = await page.evaluate((selector) => {
          function cleanText(value) {
            return (value || "").replace(/\s+/g, " ").trim();
          }
          function bestSelector(el) {
            if (el.id && !/^\d/.test(el.id)) return `#${CSS.escape(el.id)}`;
            const testId = el.getAttribute("data-testid") || el.getAttribute("data-test-id") || el.getAttribute("data-cy");
            if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
            const name = el.name;
            if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
            const aria = el.getAttribute("aria-label");
            if (aria) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
            const text = cleanText(el.innerText || el.textContent).slice(0, 40);
            if ((el.tagName === "BUTTON" || el.tagName === "A") && text) return `${el.tagName.toLowerCase()}:has-text("${text.replace(/"/g, '\\"')}")`;
            return el.tagName.toLowerCase();
          }
          function labelFor(input) {
            const id = input.id;
            if (id) {
              const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
              if (label) return cleanText(label.innerText);
            }
            const parent = input.closest("label");
            if (parent) return cleanText(parent.innerText);
            return "";
          }
          function fieldFor(input) {
            return {
              type: input.type || input.tagName.toLowerCase(),
              name: input.name || "",
              placeholder: input.placeholder || "",
              label: labelFor(input),
              selector: bestSelector(input),
              required: input.required || false
            };
          }
          const forms = Array.from(document.querySelectorAll("form")).slice(0, 10).map((form, i) => {
            const fields = Array.from(form.querySelectorAll('input:not([type="hidden"]), textarea, select')).slice(0, 30).map(fieldFor);
            const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
            return {
              selector: bestSelector(form) || `form:nth-of-type(${i + 1})`,
              fields,
              submitText: submit ? cleanText(submit.innerText || submit.value) : "",
              submitSelector: submit ? bestSelector(submit) : null
            };
          }).filter((f) => f.fields.length > 0 || f.submitText);
          const selected = selector ? Array.from(document.querySelectorAll(selector)).slice(0, 20).map((el) => ({
            selector,
            text: cleanText(el.innerText || el.textContent).slice(0, 5e3),
            html: el.outerHTML.slice(0, 5e3)
          })) : [];
          return {
            url: location.href,
            title: document.title || "",
            description: document.querySelector('meta[name="description"]')?.content || "",
            headings: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 20).map((h) => cleanText(h.innerText)).filter(Boolean),
            links: Array.from(document.querySelectorAll("a[href]")).slice(0, 100).map((a) => ({
              text: cleanText(a.innerText || a.textContent).slice(0, 120),
              href: a.href
            })).filter((a) => a.href),
            forms,
            buttons: Array.from(document.querySelectorAll('button, [role="button"], a.btn, a[class*="button"], a[class*="cta"]')).slice(0, 80).map((btn) => ({
              text: cleanText(btn.innerText || btn.textContent).slice(0, 120),
              selector: bestSelector(btn)
            })).filter((b) => b.text),
            selected,
            text: cleanText(document.body?.innerText || "").slice(0, 12e3)
          };
        }, selectedSelector);
        pages.push(scraped);
        await enqueueLinks({
          strategy: "same-domain",
          transformRequestFunction: (req) => {
            try {
              const host = new URL(req.url).hostname;
              const noAsset = !req.url.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|mp4|webp)(\?|$)/i);
              return allowedHosts.has(host) && noAsset ? req : false;
            } catch {
              return false;
            }
          }
        }).catch(() => {
        });
        if (!options.quiet) {
          console.log(import_chalk.default.gray(`  scraped ${pages.length}/${maxPages}: ${request.loadedUrl || request.url}`));
        }
      },
      failedRequestHandler({ request, error }) {
        if (!options.quiet) warn(`Scrape skipped ${request.url}: ${error?.message || error}`);
      }
    });
    await crawler.run([url]);
    const result = {
      id: scrape.id,
      url,
      status: "complete",
      reason,
      maxPages,
      selector: options.selector,
      pages,
      resultPath,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    fs4.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    db.updateScrapeRun(scrape.id, { status: "complete", pagesCount: pages.length, resultPath });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result = {
      id: scrape.id,
      url,
      status: "failed",
      reason,
      maxPages,
      selector: options.selector,
      pages,
      resultPath,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    fs4.writeFileSync(resultPath, JSON.stringify({ ...result, errorMessage: message }, null, 2));
    db.updateScrapeRun(scrape.id, { status: "failed", pagesCount: pages.length, resultPath, errorMessage: message });
    throw new Error(message);
  }
}
function readScrapeResult(resultPath) {
  if (!resultPath || !fs4.existsSync(resultPath)) return null;
  try {
    return JSON.parse(fs4.readFileSync(resultPath, "utf8"));
  } catch {
    return null;
  }
}
async function acquireInteractiveBrowser(cdpEndpoint) {
  if (cdpEndpoint) {
    let browser2;
    try {
      browser2 = await import_playwright.chromium.connectOverCDP(cdpEndpoint);
    } catch {
      errorMsg(`Could not attach to a browser at ${cdpEndpoint} \u2014 is it running with --remote-debugging-port?`);
      process.exit(1);
    }
    const existingContexts = browser2.contexts();
    const context2 = existingContexts[0] ?? await browser2.newContext();
    const existingPages = context2.pages();
    const page2 = existingPages[existingPages.length - 1] ?? await context2.newPage();
    return { browser: browser2, context: context2, page: page2, isAttached: true };
  }
  const browser = await import_playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  return { browser, context, page, isAttached: false };
}
async function runLearn(url, nameOverride, opts) {
  printLogo();
  divider();
  let flowName = nameOverride || args[2];
  if (!flowName) {
    console.log(import_chalk.default.cyan("\n  Enter flow name: "));
    flowName = await askQuestion("  > ");
  }
  if (!flowName) {
    errorMsg("Flow name required");
    process.exit(1);
  }
  const { browser, context, page, isAttached } = await acquireInteractiveBrowser(opts?.cdpEndpoint);
  const explicitUrl = !!url;
  if (!url) url = page.url();
  info("Target URL: " + import_chalk.default.cyan(url));
  info("Flow name:  " + import_chalk.default.cyan(flowName));
  if (isAttached) info("Browser:    " + import_chalk.default.magenta("attached via CDP \u2014 recording in your existing tab"));
  console.log();
  const flow = db.createFlow({ name: flowName, appUrl: url, createdBy: "human" });
  const capturedActions = [];
  let browserClosed = false;
  try {
    await page.exposeFunction("__ghostrunRecord", (action) => {
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
    await page.evaluate(RECORDER_SCRIPT).catch(() => {
    });
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
    context.on("page", async (newPage) => {
      capturedActions.push({ type: "navigate", url: newPage.url(), timestamp: Date.now(), label: "[new tab]" });
      await newPage.exposeFunction("__ghostrunRecord", (action) => {
        const last = capturedActions[capturedActions.length - 1];
        if (last && last.type === action.type && last.selector === action.selector && Date.now() - last.timestamp < 500) return;
        const tabAction = { ...action, label: action.label ? `[popup] ${action.label}` : action.label };
        const sanitized = { ...tabAction, value: tabAction.value ? sanitizePII(tabAction.value) : tabAction.value };
        capturedActions.push(sanitized);
        process.stdout.write(`  ${import_chalk.default.cyan("[popup]")} ${sanitized.type} ${sanitized.label ? import_chalk.default.white(`"${sanitized.label}"`) : ""} ${import_chalk.default.gray(sanitized.selector || "")}
`);
      });
      await newPage.addInitScript(RECORDER_SCRIPT);
      newPage.on("framenavigated", (frame) => {
        if (frame !== newPage.mainFrame()) return;
        const navUrl = frame.url();
        if (navUrl === "about:blank") return;
        capturedActions.push({ type: "navigate", url: navUrl, timestamp: Date.now(), label: "[popup nav]" });
        process.stdout.write(`  ${import_chalk.default.cyan("[popup]")} navigate \u2192 ${import_chalk.default.cyan(navUrl)}
`);
      });
    });
    console.log(import_chalk.default.bgCyan.black.bold("  RECORDING  ") + import_chalk.default.bold(" \u{1F464} human flow \u2014 browser is live\n"));
    console.log(import_chalk.default.gray("  Every click, fill, and navigation is captured automatically."));
    console.log(import_chalk.default.gray("  Assertions: type  ") + import_chalk.default.cyan("a text:<expected>") + import_chalk.default.gray("  |  ") + import_chalk.default.cyan("a url:<path>") + import_chalk.default.gray("  |  ") + import_chalk.default.cyan("a title:<text>"));
    console.log(import_chalk.default.gray("  Done?       press ") + import_chalk.default.cyan("Enter") + import_chalk.default.gray(" or type ") + import_chalk.default.cyan("done") + import_chalk.default.gray("\n"));
    if (explicitUrl || !isAttached) await page.goto(url);
    if (!browserClosed) {
      closeSharedReadline();
      await new Promise((resolve3) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.on("line", (line) => {
          const trimmed = line.trim();
          if (!trimmed || ["done", "stop", "finish"].includes(trimmed.toLowerCase())) {
            rl.close();
            resolve3();
            return;
          }
          const assertMatch = trimmed.match(/^a (text|url|el|title):\s*(.+)$/i);
          if (assertMatch) {
            const assertType = assertMatch[1].toLowerCase();
            const assertValue = assertMatch[2].trim();
            const typeMap = { text: "assert:text", url: "assert:url", el: "assert:element", title: "assert:title" };
            const actionType = typeMap[assertType] || `assert:${assertType}`;
            const isEl = assertType === "el";
            const action = { type: actionType, timestamp: Date.now(), assertType, ...isEl ? { selector: assertValue } : { value: assertValue } };
            capturedActions.push(action);
            process.stdout.write(`  ${import_chalk.default.magenta("\u2713")} assertion added: ${import_chalk.default.yellow(actionType)} ${import_chalk.default.white(assertValue)}
`);
          }
        });
        rl.on("close", () => resolve3());
      }).catch(() => {
      });
    }
    if (!browserClosed && !isAttached) await browser.close();
    else if (isAttached) info("Detached \u2014 your browser session was left running.");
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
      else if (action.type === "click") node = { id: nodeId, type: "action", label: action.label ? `Click "${action.label}"` : `Click ${action.selector}`, action: "click", selector: action.selector, intent: action.label ? `Click "${action.label}"` : `Click ${action.selector}` };
      else if (action.type === "fill") node = { id: nodeId, type: "action", label: `Fill ${action.selector}`, action: "fill", selector: action.selector, value: action.value };
      else if (action.type === "select") node = { id: nodeId, type: "action", label: `Select "${action.value}" in ${action.selector}`, action: "select", selector: action.selector, value: action.value };
      else if (action.type === "check") node = { id: nodeId, type: "action", label: `${action.value === "true" ? "Check" : "Uncheck"} ${action.selector}`, action: "check", selector: action.selector, value: action.value };
      else if (action.type.startsWith("assert:")) {
        const isEl = action.type === "assert:element";
        node = { id: nodeId, type: "action", label: `Assert ${action.type.replace("assert:", "")} "${isEl ? action.selector : action.value}"`, action: action.type, ...isEl ? { selector: action.selector } : { value: action.value } };
      } else return;
      nodes.push(node);
      edges.push({ id: `e${i}`, source: prevId, target: nodeId });
      prevId = nodeId;
    });
    nodes.push({ id: "end", type: "end", label: "End" });
    edges.push({ id: `e${capturedActions.length}`, source: prevId, target: "end" });
    db.updateFlow(flow.id, { graph: { nodes, edges, appUrl: url } });
    divider();
    console.log(import_chalk.default.bgGreen.black.bold("  SAVED  ") + import_chalk.default.bold(` ${capturedActions.length} actions recorded \u2014 \u{1F464} human flow
`));
    const counts = capturedActions.reduce((a, c) => {
      a[c.type] = (a[c.type] || 0) + 1;
      return a;
    }, {});
    const actionIcons = { navigate: "\u{1F310}", click: "\u{1F5B1} ", fill: "\u2328\uFE0F ", select: "\u{1F4CB}", check: "\u2611\uFE0F ", assert: "\u2705" };
    const countStrs = Object.entries(counts).map(([t, n]) => `${actionIcons[t] || "\u25CF"} ${n} ${t}`);
    console.log("  " + countStrs.join(import_chalk.default.gray("  \xB7  ")));
    console.log();
    info(`Flow ID: ${import_chalk.default.gray(flow.id.slice(0, 8))}`);
    info(`Run:     ${import_chalk.default.green("ghostrun run " + flow.id.slice(0, 8))}`);
    info(`Fix:     ${import_chalk.default.cyan("ghostrun flow:fix " + flow.id.slice(0, 8))}`);
    console.log();
    if (isAttached) process.exit(0);
  } catch (err) {
    db.deleteFlow(flow.id);
    throw err;
  }
}
async function executeFlow(flowId, vars, opts) {
  const log = (s) => {
    if (!opts?.jsonOutput && !opts?.quiet) process.stdout.write(s + "\n");
  };
  const projectConfig = readConfig();
  const baselineMode = opts?.baseline ?? process.argv.includes("--baseline");
  const visualThreshold = opts?.visualThreshold ?? (() => {
    const raw = parseFlagValue(process.argv, "--baseline-threshold");
    return raw ? parseFloat(raw) : projectConfig.policies?.visualDiffThresholdPercent ?? 5;
  })();
  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
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
    return { passed: false, runId: "", duration: 0, extractedData: {} };
  }
  if (!graph.nodes?.length) {
    warn("Empty flow.");
    return { passed: false, runId: "", duration: 0, extractedData: {} };
  }
  if (!opts?.jsonOutput && vars && Object.keys(vars).length > 0) {
    console.log(import_chalk.default.gray("  Variables: " + Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(", ")));
  }
  const run = db.createRun(flow.id);
  const screenshotsDir = db.getScreenshotsPath(run.id);
  const actionNodes = graph.nodes.filter((n) => n.type === "action");
  let stepNum = 1, failed = false;
  let failedStepInfo = null;
  let failureScrapeContext;
  const scrapeDiagnostics = [];
  const runStart = Date.now();
  const runVars = { ...vars || {} };
  const selectedProfile = getSelectedProfile();
  let resolvedProfileAuth = null;
  let profileSessionLoadName = opts?.sessionLoad;
  let cleanupProfileSession = false;
  const activeEnv = db.getActiveEnvironment();
  if (activeEnv) {
    Object.assign(runVars, activeEnv.variables);
    if (activeEnv.baseUrl && !runVars["__baseUrl"]) runVars["__baseUrl"] = activeEnv.baseUrl;
    if (activeEnv.baseUrl && !runVars["baseUrl"]) runVars["baseUrl"] = activeEnv.baseUrl;
  }
  if (selectedProfile?.variables) Object.assign(runVars, selectedProfile.variables);
  const accountKey = selectedProfile ? resolveSelectedAccountKey(selectedProfile, process.argv) : null;
  if (selectedProfile && accountKey) {
    try {
      const applied = await applyProfileAccount(selectedProfile, accountKey, runVars, resolveSecretValue);
      if (!opts?.jsonOutput && !opts?.quiet) {
        console.log("  " + import_chalk.default.gray("Account: ") + import_chalk.default.cyan(`${applied.accountId}`) + (applied.email ? import_chalk.default.gray(` (${applied.email})`) : ""));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errorMsg(msg);
      db.updateRun(run.id, { status: "failed", completedAt: /* @__PURE__ */ new Date(), duration: Date.now() - runStart, errorMessage: msg });
      return { passed: false, runId: run.id, duration: Date.now() - runStart, extractedData: {}, error: msg };
    }
  }
  if (vars && Object.keys(vars).length > 0) {
    Object.assign(runVars, vars);
  }
  if (selectedProfile?.baseUrl) {
    if (!runVars["BASE_URL"]) runVars["BASE_URL"] = selectedProfile.baseUrl;
    if (!runVars["__baseUrl"]) runVars["__baseUrl"] = selectedProfile.baseUrl;
    if (!runVars["baseUrl"]) runVars["baseUrl"] = selectedProfile.baseUrl;
  }
  const startUrl = runVars["__baseUrl"] || graph.appUrl || flow.appUrl;
  const { label: envLabel, color: envColor } = getEnvLabel(startUrl || "");
  const creatorIcon = flow.createdBy === "agent" ? import_chalk.default.magenta(" \u{1F916}") : import_chalk.default.blue(" \u{1F464}");
  const verifiedBadge = flow.verified ? import_chalk.default.green(" \u2713") : "";
  const provenanceStr = creatorIcon + verifiedBadge;
  if (!opts?.jsonOutput && !opts?.quiet) {
    if (envLabel === "production") {
      console.log(import_chalk.default.red("\n  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510"));
      console.log(import_chalk.default.red("  \u2502 \u26A0 PRODUCTION ENVIRONMENT            \u2502"));
      console.log(import_chalk.default.red("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518"));
    }
    console.log(import_chalk.default.bold("\n  Running: ") + import_chalk.default.white(flow.name) + provenanceStr);
    if (startUrl) console.log("  " + import_chalk.default.gray("URL: ") + envColor(startUrl));
    if (selectedProfile?.name) console.log("  " + import_chalk.default.gray("Profile: ") + import_chalk.default.cyan(selectedProfile.name));
  }
  try {
    if (selectedProfile && !opts?.skipProfileAuth) {
      resolvedProfileAuth = await resolveProfileAuth(selectedProfile, runVars, flow.id, {
        ci: opts?.ci,
        visible: opts?.visible,
        quiet: opts?.quiet,
        accountId: accountKey
      });
      if (resolvedProfileAuth?.injectedVars) Object.assign(runVars, resolvedProfileAuth.injectedVars);
      if (!profileSessionLoadName && resolvedProfileAuth?.sessionLoadName) {
        profileSessionLoadName = resolvedProfileAuth.sessionLoadName;
        cleanupProfileSession = true;
      }
      if (!opts?.jsonOutput && !opts?.quiet && resolvedProfileAuth) {
        console.log("  " + import_chalk.default.gray("Auth: ") + import_chalk.default.cyan(resolvedProfileAuth.summary));
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - runStart;
    db.updateRun(run.id, {
      status: "failed",
      completedAt: /* @__PURE__ */ new Date(),
      duration,
      errorMessage
    });
    writeEvidenceBundle(run.id, { ci: opts?.ci });
    if (opts?.jsonOutput) {
      console.log(JSON.stringify({
        passed: false,
        runId: run.id,
        flowId: flow.id,
        flowName: flow.name,
        duration,
        error: errorMessage,
        extractedData: {},
        scrapeDiagnostics
      }));
    } else {
      errorMsg(errorMessage);
    }
    return { passed: false, runId: run.id, duration, extractedData: {}, error: errorMessage, scrapeDiagnostics };
  }
  const ctx = {
    variables: runVars,
    environmentName: activeEnv?.name,
    profileAuth: resolvedProfileAuth?.apiAuth,
    profileServices: selectedProfile?.services
  };
  const API_ONLY_ACTIONS = /* @__PURE__ */ new Set([
    "http:request",
    "assert:response",
    "assert:status",
    "assert:body",
    "assert:header",
    "assert:time",
    "set:variable",
    "extract:json",
    "env:switch",
    "email:wait",
    "email:extract-link",
    "email:extract-otp",
    "webhook:wait",
    "webhook:assert",
    "assert:webhook-signature",
    "services:seed",
    "db:query",
    "db:assert"
  ]);
  const hasBrowserActions = actionNodes.some((n) => !API_ONLY_ACTIONS.has(n.action));
  let browser = null;
  let browserCtx = null;
  let page = null;
  if (hasBrowserActions) {
    browser = await import_playwright.chromium.launch({ headless: !opts?.visible });
    const videoDir = opts?.video ? path4.join(PROJECT_GHOSTRUN_PATH, "runs", run.id) : void 0;
    if (videoDir && !fs4.existsSync(videoDir)) fs4.mkdirSync(videoDir, { recursive: true });
    browserCtx = await browser.newContext({
      ...resolvedProfileAuth?.browserContextOptions || {},
      ...videoDir ? { recordVideo: { dir: videoDir } } : {}
    });
    if (opts?.trace) {
      await browserCtx.tracing.start({ screenshots: true, snapshots: true });
    }
    page = await browserCtx.newPage();
    if (profileSessionLoadName) {
      try {
        const count = await loadSession(browserCtx, profileSessionLoadName);
        if (!opts?.quiet) info(`Session: ${import_chalk.default.cyan(profileSessionLoadName)} loaded (${count} cookies)`);
      } catch (e) {
        warn(String(e));
      }
    }
    if (startUrl) await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 15e3 });
  }
  let PNG = null;
  let pixelmatch = null;
  try {
    const pngjs = await import("pngjs");
    PNG = pngjs.PNG;
    pixelmatch = (await import("pixelmatch")).default;
  } catch {
  }
  for (const node of actionNodes) {
    const label = node.label || node.action || "Step " + stepNum, action = node.action;
    const barStr = progressBar(stepNum, actionNodes.length);
    log(import_chalk.default.cyan(`
  [${stepNum}/${actionNodes.length}]`) + ` ${barStr} ` + import_chalk.default.white(label));
    opts?.onStep?.(stepNum - 1, action, node.selector);
    const sanitizedStepValue = typeof node.value === "string" ? sanitizeStoredValue(node.value, label, node.selector) : void 0;
    const step = db.createStep({
      runId: run.id,
      stepNumber: stepNum,
      name: label,
      action,
      selector: node.selector,
      value: sanitizedStepValue
    });
    const t = Date.now();
    try {
      const resolvedNode = {
        ...node,
        url: node.url ? resolveVars(node.url, runVars) : node.url,
        value: node.value ? resolveVars(node.value, runVars) : node.value,
        selector: node.selector ? resolveVars(node.selector, runVars) : node.selector
      };
      await executeAction(page, action, resolvedNode, ctx, run.id, stepNum);
      if (action === "click" && page) {
        await page.waitForLoadState("domcontentloaded", { timeout: 3e3 }).catch(() => {
        });
      }
      const duration = Date.now() - t;
      const isApiAction = API_ONLY_ACTIONS.has(action);
      if (!isApiAction && page) {
        const screenshot = await page.screenshot();
        const sp = path4.join(screenshotsDir, `step-${stepNum}.png`);
        fs4.writeFileSync(sp, screenshot);
        let diffPercent;
        const baseline = db.getBaseline(flow.id, stepNum);
        if (baseline && PNG && pixelmatch && fs4.existsSync(baseline.screenshot_path)) {
          try {
            const img1 = PNG.sync.read(fs4.readFileSync(baseline.screenshot_path));
            const img2 = PNG.sync.read(screenshot);
            const w = Math.min(img1.width, img2.width);
            const h = Math.min(img1.height, img2.height);
            const diff = new PNG({ width: w, height: h });
            const numDiff = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
            diffPercent = parseFloat((numDiff / (w * h) * 100).toFixed(1));
            if (diffPercent > visualThreshold) {
              log(import_chalk.default.yellow(`      ~ visual change: ${diffPercent}% (threshold ${visualThreshold}%)`));
            }
          } catch {
          }
        }
        if (diffPercent !== void 0 && diffPercent > visualThreshold) {
          const proposal = createRepairProposal({
            source: "ai-heal",
            repairType: "visual",
            flowId: flow.id,
            flowName: flow.name,
            runId: run.id,
            nodeId: String(node.id || ""),
            stepNumber: stepNum,
            action,
            currentValue: `${diffPercent}%`,
            proposedValue: `Re-capture baseline: ghostrun baseline:set ${flow.name}`,
            errorMessage: `[DIFF:${diffPercent}%]`,
            rationale: `Visual regression on step ${stepNum}: ${diffPercent}% pixel diff exceeds threshold ${visualThreshold}%. Update baseline after intentional UI change with baseline:set.`
          });
          if (proposal) log(import_chalk.default.yellow(`      ~ visual repair proposal: ${proposal.id.slice(0, 8)}`));
          if (baselineMode) {
            throw new Error(`Visual regression ${diffPercent}% > ${visualThreshold}% on step ${stepNum}`);
          }
        }
        db.updateStep(step.id, { status: "passed", duration, screenshotPath: sp, ...diffPercent !== void 0 ? { diffPercent } : {} });
        if (diffPercent !== void 0 && diffPercent > visualThreshold && !baselineMode) {
          db.updateStep(step.id, { errorMessage: `[DIFF:${diffPercent}%]` });
        }
      } else {
        db.updateStep(step.id, { status: "passed", duration });
      }
      log(import_chalk.default.green(`      \u2713 passed`) + import_chalk.default.gray(` (${duration}ms)`));
      if (action === "extract" && resolvedNode.__extracted) {
        const extracted = resolvedNode.__extracted;
        db.saveRunData(run.id, stepNum, extracted.variable, sanitizePII(extracted.value));
        runVars[extracted.variable] = extracted.value;
        log(import_chalk.default.cyan(`      \u2192 extracted ${extracted.variable}: ${import_chalk.default.white(extracted.value.slice(0, 60))}`));
      }
    } catch (err) {
      const duration = Date.now() - t;
      const errorMessage = err instanceof Error ? err.message.split("\n")[0] : String(err);
      if (["click", "fill", "select"].includes(action) && page) {
        const healed = await attemptHeal(page, label, node.selector, action);
        if (healed) {
          const proposal = createRepairProposal({
            source: "ai-heal",
            repairType: "selector",
            flowId: flow.id,
            flowName: flow.name,
            runId: run.id,
            nodeId: String(node.id || ""),
            stepNumber: stepNum,
            action,
            currentSelector: node.selector,
            proposedSelector: healed,
            errorMessage,
            rationale: "Generated from failed execution using selector repair heuristics and optional AI."
          });
          if (proposal) {
            log(import_chalk.default.yellow(`      ~ repair proposal: ${proposal.id.slice(0, 8)} -> ${healed}`));
            const autoApply = autoApplySelectorRepairProposal(proposal, {
              ci: opts?.ci,
              profile: selectedProfile,
              startUrl: startUrl || void 0,
              currentSelector: node.selector
            });
            if (autoApply.applied) {
              log(import_chalk.default.green(`      ~ auto-applied selector repair: ${proposal.id.slice(0, 8)}`));
            } else if (readConfig().policies?.allowAutoRepairApply && getInteractionMode() === "auto") {
              log(import_chalk.default.gray(`      ~ auto-apply blocked: ${autoApply.reason}`));
            }
          } else {
            log(import_chalk.default.gray(`      ~ repair proposal skipped: run attempt limit reached`));
          }
        }
      }
      if (page) {
        const extraProposal = await createFailureRepairProposal({
          action,
          errorMessage,
          page,
          node,
          flow,
          runId: run.id,
          stepNum,
          selectedProfile
        });
        if (extraProposal) {
          log(import_chalk.default.yellow(`      ~ repair proposal (${extraProposal.repairType}): ${extraProposal.id.slice(0, 8)}`));
        }
      }
      try {
        if (page) {
          const screenshot = await page.screenshot();
          const sp = path4.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
          fs4.writeFileSync(sp, screenshot);
          db.updateStep(step.id, { status: "failed", duration, errorMessage, screenshotPath: sp });
        } else {
          db.updateStep(step.id, { status: "failed", duration, errorMessage });
        }
      } catch {
        db.updateStep(step.id, { status: "failed", duration, errorMessage });
      }
      if (page && isCrawleeEnabled()) {
        try {
          log(import_chalk.default.gray("      \u2192 scraping failed page for diagnostics..."));
          const scrape = await runCrawleeScrape(page.url(), {
            maxPages: 1,
            reason: "run-failure",
            runId: run.id,
            stepNumber: stepNum,
            quiet: true,
            requireEnabled: false
          });
          failureScrapeContext = extractScrapeText(scrape);
          scrapeDiagnostics.push({ scrapeId: scrape.id, resultPath: scrape.resultPath, reason: scrape.reason });
          log(import_chalk.default.gray(`      \u2192 scrape diagnostic: ${scrape.id.slice(0, 8)}`));
        } catch (scrapeErr) {
          log(import_chalk.default.gray(`      \u2192 scrape diagnostic skipped: ${scrapeErr instanceof Error ? scrapeErr.message : scrapeErr}`));
        }
      }
      log(import_chalk.default.red(`      \u2717 failed (${duration}ms)`));
      log(import_chalk.default.red(`        \u2514\u2500 ${errorMessage}`));
      failedStepInfo = { name: label, action, selector: node.selector, errorMessage };
      opts?.onError?.(errorMessage);
      failed = true;
      break;
    }
    stepNum++;
  }
  if (opts?.sessionSave && browserCtx) {
    try {
      const count = await saveSession(browserCtx, opts.sessionSave);
      if (!opts?.quiet) success(`Session saved: ${import_chalk.default.cyan(opts.sessionSave)} (${count} cookies)`);
    } catch (e) {
      warn(`Could not save session: ${e}`);
    }
  }
  let traceOutputPath = null;
  if (opts?.trace && browserCtx) {
    traceOutputPath = path4.join(PROJECT_GHOSTRUN_PATH, "runs", run.id, "trace.zip");
    const traceDir = path4.dirname(traceOutputPath);
    if (!fs4.existsSync(traceDir)) fs4.mkdirSync(traceDir, { recursive: true });
    try {
      await browserCtx.tracing.stop({ path: traceOutputPath });
    } catch {
    }
  }
  const videoRecordDir = opts?.video ? path4.join(PROJECT_GHOSTRUN_PATH, "runs", run.id) : null;
  if (browser) await browser.close();
  if (cleanupProfileSession && profileSessionLoadName) {
    const tempSessionPath = sessionFilePath(profileSessionLoadName);
    if (fs4.existsSync(tempSessionPath)) {
      try {
        fs4.unlinkSync(tempSessionPath);
      } catch {
      }
    }
  }
  const totalDuration = Date.now() - runStart;
  let summary = null;
  if (failed && failedStepInfo && opts?.allowAiSummary !== false) {
    if (!opts?.jsonOutput) process.stdout.write(import_chalk.default.gray("\n  Analyzing failure...\n"));
    const steps = db.listSteps(run.id);
    const result = await callAI(buildFailurePrompt({ flowName: flow.name, steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })), failedStep: failedStepInfo, scrapeContext: failureScrapeContext }), { mode: "summary", metadata: { flowId: flow.id, runId: run.id } });
    if (result) {
      summary = result.text;
      if (!opts?.jsonOutput) process.stdout.write(import_chalk.default.gray(`  (via ${result.provider})
`));
    }
  }
  db.updateRun(run.id, { status: failed ? "failed" : "passed", completedAt: /* @__PURE__ */ new Date(), duration: totalDuration, errorMessage: failedStepInfo?.errorMessage, summary: summary || void 0 });
  writeEvidenceBundle(run.id, { ci: opts?.ci });
  const extractedData = {};
  db.getRunData(run.id).forEach((d) => {
    extractedData[d.variableName] = d.variableValue;
  });
  if (opts?.jsonOutput) {
    const steps = db.listSteps(run.id);
    console.log(JSON.stringify({
      passed: !failed,
      runId: run.id,
      flowId: flow.id,
      flowName: flow.name,
      duration: totalDuration,
      steps: steps.map((s) => ({
        stepNumber: s.stepNumber,
        name: s.name,
        status: s.status,
        duration: s.duration,
        screenshotPath: s.screenshotPath,
        errorMessage: s.errorMessage
      })),
      extractedData,
      summary,
      scrapeDiagnostics
    }));
    return { passed: !failed, runId: run.id, duration: totalDuration, extractedData, error: failedStepInfo?.errorMessage, scrapeDiagnostics };
  }
  divider();
  if (failed) {
    errorMsg("Flow failed");
    if (summary) {
      console.log();
      console.log(import_chalk.default.bgRed.white.bold("  FAILURE REPORT  "));
      console.log();
      for (const line of summary.split("\n")) {
        const trimmed = line.trim();
        if (/^(WHAT FAILED|WHY IT FAILED|HOW TO FIX IT)$/.test(trimmed)) {
          console.log(import_chalk.default.yellow.bold("  " + trimmed));
        } else if (trimmed) {
          console.log(import_chalk.default.white("    " + trimmed));
        }
      }
      console.log();
    }
  } else {
    success(`Flow passed! (${totalDuration}ms)`);
  }
  info("Run ID: " + import_chalk.default.gray(run.id.slice(0, 8)));
  info("Screenshots: " + import_chalk.default.cyan(screenshotsDir));
  if (videoRecordDir) {
    info("Video: " + import_chalk.default.cyan(videoRecordDir));
  }
  if (traceOutputPath && fs4.existsSync(traceOutputPath)) {
    info("Trace: " + import_chalk.default.cyan(traceOutputPath));
    info("View:  " + import_chalk.default.gray("npx playwright show-trace " + traceOutputPath));
  }
  if (scrapeDiagnostics.length > 0) {
    info("Scrape diagnostic: " + import_chalk.default.cyan(scrapeDiagnostics[0].resultPath || scrapeDiagnostics[0].scrapeId));
  }
  console.log();
  return { passed: !failed, runId: run.id, duration: totalDuration, extractedData, error: failedStepInfo?.errorMessage, scrapeDiagnostics };
}
async function executeAction(page, action, node, ctx, runId, stepNumber) {
  const p = page;
  switch (action) {
    case "navigate":
      await p.goto(node.url || node.value, { waitUntil: "domcontentloaded", timeout: 15e3 });
      break;
    case "click":
      await p.click(node.selector, { timeout: 1e4 });
      break;
    case "fill":
      await p.fill(node.selector, node.value || "", { timeout: 1e4 });
      break;
    case "select":
      await p.selectOption(node.selector, node.value || "", { timeout: 1e4 });
      break;
    case "check":
      if (node.value === "true") await p.check(node.selector, { timeout: 1e4 });
      else await p.uncheck(node.selector, { timeout: 1e4 });
      break;
    case "wait":
      await p.waitForSelector(node.selector, { timeout: 1e4 });
      break;
    case "press":
      await p.press(node.selector, node.value || "Enter");
      break;
    case "assert:text": {
      const val = node.value;
      const count = await p.getByText(val, { exact: false }).count();
      const visible = count > 0 ? await p.getByText(val, { exact: false }).first().isVisible({ timeout: 5e3 }).catch(() => false) : false;
      if (!visible) {
        const bodyText = await p.evaluate(() => document.body.innerText).catch(() => "");
        if (!bodyText.includes(val)) throw new Error(`assert:text failed \u2014 "${val}" not visible on page`);
      }
      break;
    }
    case "assert:url": {
      const currentUrl = p.url();
      if (!currentUrl.includes(node.value)) throw new Error(`assert:url failed \u2014 URL "${currentUrl}" does not contain "${node.value}"`);
      break;
    }
    case "assert:element": {
      const count = await p.locator(node.selector).count();
      if (count === 0) throw new Error(`assert:element failed \u2014 selector "${node.selector}" not found`);
      break;
    }
    case "assert:title": {
      const title = await p.title();
      if (!title.toLowerCase().includes(node.value.toLowerCase())) throw new Error(`assert:title failed \u2014 title "${title}" does not contain "${node.value}"`);
      break;
    }
    case "assert:no-errors": {
      break;
    }
    case "extract": {
      const variable = node.variable || "extracted";
      const selector = node.selector;
      let extractedValue = "";
      if (selector) {
        try {
          extractedValue = await p.locator(selector).first().innerText({ timeout: 1e4 });
        } catch {
          extractedValue = await p.locator(selector).first().getAttribute("value") || "";
        }
      } else if (node.attribute && node.selector) {
        extractedValue = await p.locator(node.selector).first().getAttribute(node.attribute) || "";
      }
      node.__extracted = { variable, value: extractedValue.trim() };
      break;
    }
    case "scroll:bottom":
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 1500));
      break;
    case "scroll:up":
      await p.evaluate(() => window.scrollTo(0, 0));
      break;
    case "scroll:load": {
      const times = parseInt(node.value || "5", 10);
      for (let i = 0; i < times; i++) {
        const prevHeight = await p.evaluate(() => document.body.scrollHeight);
        await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise((r) => setTimeout(r, 2e3));
        const newHeight = await p.evaluate(() => document.body.scrollHeight);
        if (newHeight === prevHeight) break;
      }
      break;
    }
    case "next:page": {
      const nextSel = node.selector || 'a[rel="next"], [aria-label="Next page"], [aria-label="Next"], button:has-text("Next"), .next-page, .pagination-next';
      await p.click(nextSel, { timeout: 1e4 });
      await p.waitForLoadState("domcontentloaded", { timeout: 15e3 });
      break;
    }
    case "hover":
      await p.hover(node.selector, { timeout: 1e4 });
      break;
    case "screenshot":
      break;
    // ── Additional interactions ────────────────────────────────────────
    case "dblclick":
      await p.dblclick(node.selector, { timeout: 1e4 });
      break;
    case "type": {
      const delay = parseInt(node.delay || "50", 10);
      await p.type(node.selector, node.value || "", { delay });
      break;
    }
    case "clear":
      await p.fill(node.selector, "", { timeout: 1e4 });
      break;
    case "upload": {
      const files = (node.value || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (files.length === 0) throw new Error("upload: no file paths specified in value");
      await p.setInputFiles(node.selector, files, { timeout: 1e4 });
      break;
    }
    case "focus":
      await p.focus(node.selector, { timeout: 1e4 });
      break;
    case "drag": {
      const target = node.value;
      if (!target) throw new Error("drag: value must be the target selector");
      const source = await p.locator(node.selector).first().boundingBox();
      const dest = await p.locator(target).first().boundingBox();
      if (!source || !dest) throw new Error("drag: source or target element not found");
      await p.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await p.mouse.down();
      await p.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 10 });
      await p.mouse.up();
      break;
    }
    case "keyboard": {
      const key = node.value || "Enter";
      if (node.selector) {
        await p.press(node.selector, key);
      } else {
        await p.keyboard.press(key);
      }
      break;
    }
    case "reload":
      await p.reload({ waitUntil: "domcontentloaded", timeout: 15e3 });
      break;
    case "back":
      await p.goBack({ waitUntil: "domcontentloaded", timeout: 15e3 });
      break;
    case "forward":
      await p.goForward({ waitUntil: "domcontentloaded", timeout: 15e3 });
      break;
    case "wait:text": {
      const waitVal = node.value;
      await p.waitForFunction(
        (text) => document.body.innerText.includes(text),
        waitVal,
        { timeout: 15e3 }
      );
      break;
    }
    case "wait:url": {
      const urlPattern = node.value;
      await p.waitForURL((url) => url.toString().includes(urlPattern), { timeout: 15e3 });
      break;
    }
    case "wait:ms": {
      const ms = parseInt(node.value || "1000", 10);
      await new Promise((r) => setTimeout(r, Math.min(ms, 3e4)));
      break;
    }
    case "scroll:element": {
      await p.locator(node.selector).first().scrollIntoViewIfNeeded({ timeout: 1e4 });
      break;
    }
    case "eval": {
      const script = node.value;
      if (!script) throw new Error("eval: value must be a JavaScript expression");
      await p.evaluate(new Function(script));
      break;
    }
    case "iframe:enter": {
      const frame = p.frameLocator(node.selector);
      p.__activeFrame = frame;
      break;
    }
    case "iframe:exit":
      p.__activeFrame = null;
      break;
    case "assert:visible": {
      const maxRetries = 2;
      const retryTimeout = 8e3;
      let lastError = "";
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await p.locator(node.selector).first().waitFor({ state: "visible", timeout: retryTimeout });
          const isVisible2 = await p.locator(node.selector).first().isVisible({ timeout: 5e3 });
          if (isVisible2) break;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          if (attempt < maxRetries) await p.waitForTimeout(1e3);
        }
      }
      const isVisible = await p.locator(node.selector).first().isVisible({ timeout: 5e3 }).catch(() => false);
      if (!isVisible) throw new Error(`assert:visible failed \u2014 "${node.selector}" is not visible (tried ${maxRetries + 1}x with smart wait)`);
      break;
    }
    case "assert:hidden": {
      const maxRetries = 2;
      const retryTimeout = 4e3;
      let lastError = "";
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await p.locator(node.selector).first().waitFor({ state: "hidden", timeout: retryTimeout });
          const isHidden2 = await p.locator(node.selector).first().isHidden({ timeout: 5e3 });
          if (isHidden2) break;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          if (attempt < maxRetries) await p.waitForTimeout(500);
        }
      }
      const isHidden = await p.locator(node.selector).first().isHidden({ timeout: 5e3 }).catch(() => true);
      if (!isHidden) throw new Error(`assert:hidden failed \u2014 "${node.selector}" is visible but expected hidden`);
      break;
    }
    case "assert:value": {
      const maxRetries = 2;
      const retryTimeout = 8e3;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await p.locator(node.selector).first().waitFor({ state: "attached", timeout: retryTimeout });
          const inputVal2 = await p.inputValue(node.selector, { timeout: 5e3 });
          if (inputVal2.includes(node.value)) break;
        } catch (e) {
          if (attempt < maxRetries) await p.waitForTimeout(500);
        }
      }
      const inputVal = await p.inputValue(node.selector, { timeout: 1e4 });
      if (!inputVal.includes(node.value)) throw new Error(`assert:value failed \u2014 input value "${inputVal}" does not contain "${node.value}"`);
      break;
    }
    case "assert:count": {
      const expected = parseInt(node.value, 10);
      await p.locator(node.selector).first().waitFor({ state: "attached", timeout: 1e4 }).catch(() => {
      });
      const actual = await p.locator(node.selector).count();
      if (actual !== expected) throw new Error(`assert:count failed \u2014 found ${actual} elements, expected ${expected}`);
      break;
    }
    case "assert:attr": {
      const [attrName, ...rest] = (node.value || "").split("=");
      const expected = rest.join("=");
      const maxRetries = 2;
      const retryTimeout = 8e3;
      let actual = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await p.locator(node.selector).first().waitFor({ state: "attached", timeout: retryTimeout });
          actual = await p.locator(node.selector).first().getAttribute(attrName, { timeout: 5e3 });
          if (actual !== null) break;
        } catch (e) {
          if (attempt < maxRetries) await p.waitForTimeout(500);
        }
      }
      if (actual === null) throw new Error(`assert:attr failed \u2014 attribute "${attrName}" not found on "${node.selector}"`);
      if (!actual.includes(expected)) throw new Error(`assert:attr failed \u2014 "${attrName}" is "${actual}", expected to contain "${expected}"`);
      break;
    }
    case "cookie:set": {
      const parts = (node.value || "").split(";");
      const [cookieName, cookieVal] = parts[0].split("=");
      const domain = parts.find((cp) => cp.trim().startsWith("domain="))?.split("=")[1] || new URL(p.url()).hostname;
      await p.context().addCookies([{ name: cookieName.trim(), value: cookieVal?.trim() || "", domain, path: "/" }]);
      break;
    }
    case "cookie:clear":
      await p.context().clearCookies();
      break;
    case "storage:set": {
      const eqIdx = (node.value || "").indexOf("=");
      if (eqIdx === -1) throw new Error('storage:set: value must be "key=value"');
      const key = node.value.slice(0, eqIdx);
      const val = node.value.slice(eqIdx + 1);
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [key, val]);
      break;
    }
    case "assert:not-text": {
      const bodyText = await p.evaluate(() => document.body.innerText).catch(() => "");
      if (bodyText.includes(node.value)) throw new Error(`assert:not-text failed \u2014 "${node.value}" IS present on page (expected absent)`);
      break;
    }
    case "http:request":
      if (!ctx) throw new Error("http:request requires execution context");
      await executeHttpRequest(node, ctx, runId, stepNumber);
      break;
    case "assert:response":
    case "assert:status":
    case "assert:body":
    case "assert:header":
    case "assert:time":
      if (!ctx) throw new Error("assert actions require execution context");
      await executeApiAssert(node, ctx);
      break;
    case "set:variable":
      if (!ctx) throw new Error("set:variable requires execution context");
      executeSetVariable(node, ctx, runId, stepNumber);
      break;
    case "extract:json":
      if (!ctx) throw new Error("extract:json requires execution context");
      executeExtractJson(node, ctx, runId, stepNumber);
      break;
    case "env:switch": {
      const envName = resolveVarsDeep(node.environment, ctx);
      const env = db.findEnvironmentByName(envName);
      if (!env) throw new Error(`Environment "${envName}" not found`);
      db.setActiveEnvironment(env.id);
      if (ctx) {
        ctx.environmentName = env.name;
        for (const [k, v] of Object.entries(env.variables)) ctx.variables[k] = v;
        if (env.baseUrl) {
          ctx.variables["__baseUrl"] = env.baseUrl;
          ctx.variables["baseUrl"] = env.baseUrl;
        }
      }
      break;
    }
    case "email:wait": {
      if (!ctx) throw new Error("email:wait requires execution context");
      const to = resolveVarsDeep(
        node.to || node.selector || ctx.variables["accountEmail"] || ctx.variables["testEmail"] || "",
        ctx
      );
      const subjectContains = resolveVarsDeep(node.subject || node.value || "", ctx);
      const timeoutMs = node.timeoutMs ? parseInt(String(node.timeoutMs), 10) : void 0;
      const result = await waitForEmail(ctx.profileServices, {
        to: to || void 0,
        subjectContains: subjectContains || void 0,
        timeoutMs
      });
      const varName = node.variable || "lastEmailBody";
      ctx.variables[varName] = result.body;
      ctx.variables[`${varName}Subject`] = result.message.Subject;
      ctx.variables[`${varName}Id`] = result.message.ID;
      if (result.html) ctx.variables[`${varName}Html`] = result.html;
      node.__extracted = { variable: varName, value: result.body.slice(0, 200) };
      break;
    }
    case "email:extract-link": {
      if (!ctx) throw new Error("email:extract-link requires execution context");
      const sourceVar = node.variable || "lastEmailBody";
      const source = ctx.variables[sourceVar] || ctx.variables[`${sourceVar}Html`] || "";
      const link = extractFirstUrl(source);
      if (!link) throw new Error(`email:extract-link: no URL found in ${sourceVar}`);
      const outVar = node.to || node.selector || "magicLink";
      ctx.variables[outVar] = link;
      node.__extracted = { variable: outVar, value: link };
      break;
    }
    case "email:extract-otp": {
      if (!ctx) throw new Error("email:extract-otp requires execution context");
      const sourceVar = node.variable || "lastEmailBody";
      const source = ctx.variables[sourceVar] || "";
      const length = parseInt(node.value || "6", 10);
      const code = extractOtpCode(source, length);
      if (!code) throw new Error(`email:extract-otp: no ${length}-digit code in ${sourceVar}`);
      const outVar = node.to || "otpCode";
      ctx.variables[outVar] = code;
      node.__extracted = { variable: outVar, value: code };
      break;
    }
    case "email:click-link": {
      if (!page) throw new Error("email:click-link requires a browser page");
      if (!ctx) throw new Error("email:click-link requires execution context");
      const linkVar = node.variable || "magicLink";
      let url = ctx.variables[linkVar];
      if (!url) {
        const sourceVar = node.value || "lastEmailBody";
        url = extractFirstUrl(ctx.variables[sourceVar] || ctx.variables[`${sourceVar}Html`] || "") || "";
      }
      if (!url) throw new Error(`email:click-link: set ${linkVar} or run email:extract-link first`);
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 2e4 });
      break;
    }
    case "webhook:wait": {
      if (!ctx) throw new Error("webhook:wait requires execution context");
      const hookPath = resolveVarsDeep(node.path || node.value || node.selector || "", ctx);
      if (!hookPath) throw new Error("webhook:wait requires path (value or path field)");
      const timeoutMs = node.timeoutMs ? parseInt(String(node.timeoutMs), 10) : void 0;
      const capture = await waitForWebhook(ctx.profileServices, { path: hookPath, timeoutMs });
      const varName = node.variable || "lastWebhookBody";
      ctx.variables[varName] = capture.body;
      ctx.variables[`${varName}Path`] = capture.path;
      ctx.variables[`${varName}Headers`] = JSON.stringify(capture.headers);
      ctx.variables[`${varName}CaptureId`] = capture.id;
      node.__extracted = { variable: varName, value: capture.body.slice(0, 200) };
      break;
    }
    case "webhook:assert": {
      if (!ctx) throw new Error("webhook:assert requires execution context");
      const bodyVar = node.variable || "lastWebhookBody";
      const hookPath = resolveVarsDeep(node.path || "", ctx);
      const bodyFromVar = ctx.variables[bodyVar];
      const capture = resolveWebhookCapture(listWebhookCaptures(50), {
        path: hookPath || void 0,
        body: bodyFromVar
      });
      const assertionsRaw = node.assertions;
      if (assertionsRaw?.length) {
        assertWebhookPayload(capture.body, assertionsRaw.map((a) => ({
          path: resolveVarsDeep(a.path, ctx),
          expected: a.expected !== void 0 ? resolveVarsDeep(a.expected, ctx) : void 0,
          op: a.op
        })));
      } else {
        const jsonPath = resolveVarsDeep(node.value || node.path || "", ctx);
        const expected = resolveVarsDeep(node.expected || "", ctx);
        if (!jsonPath) throw new Error("webhook:assert requires assertions array or value (JSON path) + expected");
        assertWebhookPayload(capture.body, [{ path: jsonPath, expected, op: node.op }]);
      }
      break;
    }
    case "assert:webhook-signature": {
      if (!ctx) throw new Error("assert:webhook-signature requires execution context");
      const bodyVar = node.variable || "lastWebhookBody";
      const hookPath = resolveVarsDeep(node.path || "", ctx);
      const bodyFromVar = ctx.variables[bodyVar];
      const headersJson = ctx.variables[`${bodyVar}Headers`];
      let capture = resolveWebhookCapture(listWebhookCaptures(50), {
        path: hookPath || void 0,
        body: bodyFromVar
      });
      if (headersJson && bodyFromVar) {
        try {
          capture = { ...capture, headers: JSON.parse(headersJson) };
        } catch {
        }
      }
      const secretRef = node.secretSecret || node.secret || "WEBHOOK_HMAC_SECRET";
      const secret = await resolveSecretValue(secretRef) || process.env[secretRef];
      if (!secret) throw new Error(`assert:webhook-signature: secret not found (${secretRef})`);
      verifyWebhookSignature(capture, {
        secret,
        headerName: node.header || "X-Webhook-Signature",
        algorithm: node.algorithm || "sha256",
        prefix: node.prefix || void 0
      });
      break;
    }
    case "db:query": {
      if (!ctx) throw new Error("db:query requires execution context");
      const pg = ctx.profileServices?.postgres;
      if (!pg?.connectionSecret) throw new Error("db:query requires profile.services.postgres.connectionSecret");
      const sql = resolveVarsDeep(node.value || node.sql || "", ctx);
      if (!sql) throw new Error("db:query requires value or sql field");
      const paramsRaw = node.params || [];
      const params = paramsRaw.map((p2) => resolveVarsDeep(p2, ctx));
      const rows = await runDbQuery(pg.connectionSecret, sql, params);
      const varName = node.variable || "queryResult";
      ctx.variables[varName] = JSON.stringify(rows);
      ctx.variables[`${varName}Count`] = String(rows.length);
      if (rows.length > 0) {
        const firstVal = Object.values(rows[0])[0];
        ctx.variables[`${varName}Scalar`] = firstVal === null || firstVal === void 0 ? "" : String(firstVal);
      }
      node.__extracted = { variable: varName, value: JSON.stringify(rows).slice(0, 200) };
      break;
    }
    case "db:assert": {
      if (!ctx) throw new Error("db:assert requires execution context");
      const pg = ctx.profileServices?.postgres;
      if (!pg?.connectionSecret) throw new Error("db:assert requires profile.services.postgres.connectionSecret");
      const sql = resolveVarsDeep(node.value || node.sql || "", ctx);
      if (!sql) throw new Error("db:assert requires value or sql field");
      const expected = resolveVarsDeep(node.expected || "", ctx);
      const assertType = node.assertType || node.assert || "scalar";
      const paramsRaw = node.params || [];
      const params = paramsRaw.map((p2) => resolveVarsDeep(p2, ctx));
      await assertDbQuery(pg.connectionSecret, sql, expected, { assertType, params });
      break;
    }
    case "services:seed": {
      if (!ctx) throw new Error("services:seed requires execution context");
      const pg = ctx.profileServices?.postgres;
      if (!pg?.connectionSecret) throw new Error("services:seed requires profile.services.postgres.connectionSecret");
      const paths = getProjectPaths();
      const fixtures = (pg.fixtures || []).map(
        (f) => path4.isAbsolute(f) ? f : path4.join(paths.fixturesSql, f)
      );
      if (fixtures.length === 0) throw new Error("services:seed: no fixtures listed in profile.services.postgres.fixtures");
      await runSqlFixtures(fixtures, pg.connectionSecret);
      break;
    }
  }
}
async function attemptHeal(page, label, selector, _action) {
  if (!selector) return null;
  process.stdout.write(import_chalk.default.yellow("      ~ attempting selector heal...\n"));
  const cleaned = label.replace(/^(click|tap|press|fill|type in|type|select|check|uncheck|submit|go to|navigate to)\s+/i, "").replace(/\s+(link|button|field|input|checkbox|dropdown|option|element|btn|tab|menu|item)$/i, "").trim();
  const textCandidates = [
    [`a:has-text("${cleaned}")`, "text-link"],
    [`button:has-text("${cleaned}")`, "text-button"],
    [`:has-text("${cleaned}") >> visible=true`, "text-any"],
    // Try partial label words
    ...cleaned.split(/\s+/).filter((w) => w.length > 2).slice(0, 3).flatMap((word) => [
      [`a:has-text("${word}")`, "word-link"],
      [`button:has-text("${word}")`, "word-button"]
    ])
  ];
  for (const [candidate, strategy] of textCandidates) {
    try {
      const count = await page.locator(candidate).count();
      if (count > 0) {
        process.stdout.write(import_chalk.default.yellow(`      ~ healed via ${strategy}: ${candidate}
`));
        return candidate;
      }
    } catch {
    }
  }
  const hasAI = !!await isOllamaRunning() || !!process.env.ANTHROPIC_API_KEY;
  if (!hasAI) return null;
  try {
    const pageTitle = await page.title().catch(() => "");
    const elementsHtml = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role="button"]'));
      return els.slice(0, 30).map((el) => {
        const attrs = Array.from(el.attributes).map((a) => `${a.name}="${a.value}"`).join(" ");
        const text = el.innerText?.trim().slice(0, 40) || "";
        return `<${el.tagName.toLowerCase()} ${attrs}>${text}</${el.tagName.toLowerCase()}>`;
      }).join("\n");
    }).catch(() => "");
    const prompt = `You are a web automation selector expert. Given a label and page elements, return the most robust CSS selector.

Label requested: "${label}"
Page title: ${pageTitle}

Available elements:
${elementsHtml}

Guidelines:
- Prefer selectors with data-testid or data-* attributes (most stable)
- Prefer id attributes (second most stable)
- Prefer semantic selectors like [role="button"] or [role="link"]
- Avoid XPath (XPath is fragile and breaks on DOM changes)
- Avoid text-based selectors (they break when UI text changes)
- Avoid positional selectors like :nth-child (they break when layout changes)
- If no good selector exists, return the text of a nearby stable element

Return ONLY the selector string, nothing else. Example formats:
  #submit-button
  [data-testid="login-btn"]
  [role="button"]:has-text("Submit")
  a[href*="/login"]`;
    const result = await callAI(prompt, { mode: "repair", metadata: { selector, step: label } });
    if (result?.text) {
      const healed = result.text.trim().replace(/^['"`]|['"`]$/g, "").split("\n")[0].trim();
      if (healed && !healed.includes(" ") && healed.length < 100) {
        const count = await page.locator(healed).count().catch(() => 0);
        if (count > 0) return healed;
      }
    }
  } catch {
  }
  return null;
}
async function runFlow(id, vars) {
  const visible = process.argv.includes("--visible");
  const ciMode = process.argv.includes("--ci");
  const outputIdx = process.argv.indexOf("--output");
  const jsonOutput = outputIdx !== -1 && process.argv[outputIdx + 1] === "json";
  const video = process.argv.includes("--video");
  const trace = process.argv.includes("--trace");
  const baseline = process.argv.includes("--baseline");
  const thresholdRaw = parseFlagValue(process.argv, "--baseline-threshold");
  const visualThreshold = thresholdRaw ? parseFloat(thresholdRaw) : void 0;
  const config = readConfig();
  const allowAiSummary = !ciMode || (config.policies?.allowAiInCi || "summary-only") !== "off";
  if (!jsonOutput) {
    printLogo();
    divider();
  }
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  if (!jsonOutput) {
    console.log(import_chalk.default.bold("\n  Running: ") + import_chalk.default.white(flow.name) + (visible ? import_chalk.default.yellow(" [visible]") : "") + (ciMode ? import_chalk.default.cyan(" [ci]") : "") + (baseline ? import_chalk.default.magenta(" [baseline]") : "") + (video ? import_chalk.default.magenta(" [video]") : "") + (trace ? import_chalk.default.blue(" [trace]") : "") + "\n");
  }
  const result = await executeFlow(id, vars, { visible, jsonOutput, ci: ciMode, allowAiSummary, video, trace, baseline, visualThreshold });
  if (!result?.passed) process.exit(1);
  return result?.runId || null;
}
async function runFixFlow(id) {
  printLogo();
  divider();
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
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
  await page.exposeFunction("__ghostrunRecord", (action) => {
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
      const aiSuggestion = await attemptHeal(page, node.label, node.selector, node.action);
      if (aiSuggestion) console.log(import_chalk.default.yellow(`      AI suggests: ${import_chalk.default.white(aiSuggestion)}`));
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
      const captured = await new Promise((resolve3) => {
        waitingForFix = true;
        fixResolve = resolve3;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.on("line", (line) => {
          if (line.trim().toLowerCase() === "skip") {
            waitingForFix = false;
            fixResolve = null;
            rl.close();
            resolve3({ type: "skip", timestamp: Date.now() });
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
    info(`Run: ${import_chalk.default.green(`ghostrun run ${flow.id.slice(0, 8)}`)}`);
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
  const diffDir = path4.join(DATA_PATH2, "diffs", `${run1.id.slice(0, 8)}_vs_${run2.id.slice(0, 8)}`);
  fs4.mkdirSync(diffDir, { recursive: true });
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
    if (!p1 || !p2 || !fs4.existsSync(p1) || !fs4.existsSync(p2)) {
      console.log(`  ${import_chalk.default.gray(String(i).padStart(4))}  ${import_chalk.default.yellow("missing  ")}  ${import_chalk.default.gray("N/A    ")}  ${import_chalk.default.gray(name)}`);
      missing++;
      continue;
    }
    try {
      const img1 = PNG.sync.read(fs4.readFileSync(p1));
      const img2 = PNG.sync.read(fs4.readFileSync(p2));
      const w = Math.min(img1.width, img2.width);
      const h = Math.min(img1.height, img2.height);
      const diff = new PNG({ width: w, height: h });
      const numDiff = pixelmatch(img1.data, img2.data, diff.data, w, h, { threshold: 0.1 });
      const pct = (numDiff / (w * h) * 100).toFixed(1);
      const diffPath = path4.join(diffDir, `step-${i}-diff.png`);
      fs4.writeFileSync(diffPath, PNG.sync.write(diff));
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
  const humanCount = flows.filter((f) => f.createdBy === "human").length;
  const agentCount = flows.filter((f) => f.createdBy === "agent").length;
  console.log(import_chalk.default.bold("\n  Flows"));
  if (flows.length > 0) {
    const parts = [];
    if (humanCount > 0) parts.push(import_chalk.default.blue(`${humanCount} human`));
    if (agentCount > 0) parts.push(import_chalk.default.magenta(`${agentCount} agent`));
    console.log(import_chalk.default.gray("  " + parts.join(import_chalk.default.gray(" \xB7 "))) + "\n");
  } else {
    console.log();
  }
  if (flows.length === 0) {
    warn("No flows. Create one: " + import_chalk.default.cyan("ghostrun learn <url>"));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        By  Name                       Env         Steps  Pass rate      Updated"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(82)));
  for (const flow of flows) {
    let steps = 0;
    try {
      steps = (JSON.parse(flow.graph).nodes || []).filter((n) => n.type === "action").length;
    } catch {
    }
    const runs = db.listRuns(flow.id, 20);
    const passRate = runs.length > 0 ? runs.filter((r) => r.status === "passed").length / runs.length : -1;
    const rateStr = passRate < 0 ? import_chalk.default.gray("no runs      ") : passRateDots(passRate, runs.length);
    const creatorIcon = flow.createdBy === "agent" ? import_chalk.default.magenta("\u{1F916}") : import_chalk.default.blue("\u{1F464}");
    const env = getEnvLabel(flow.appUrl || "");
    const envBadge = env.label ? env.color(`[${env.label}]`) : "          ";
    const namePad = flow.name.length > 24 ? flow.name.slice(0, 23) + "\u2026" : flow.name.padEnd(24);
    console.log(`  ${import_chalk.default.gray(flow.id.slice(0, 8))} ${creatorIcon}  ${import_chalk.default.white(namePad)}  ${envBadge.padEnd(env.label ? 11 : 10)}  ${import_chalk.default.gray(String(steps).padEnd(5))}  ${rateStr}  ${import_chalk.default.gray(timeAgo(flow.updatedAt))}`);
  }
  console.log();
}
async function runDeleteFlow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const confirm = await confirmAction(`  Delete "${import_chalk.default.yellow(flow.name)}"? (y/N) `, false);
  if (!confirm) {
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
  fs4.writeFileSync(filename, JSON.stringify({ version: "1.0.0", exportedAt: (/* @__PURE__ */ new Date()).toISOString(), flow: { name: flow.name, description: flow.description, appUrl: flow.appUrl, graph: JSON.parse(flow.graph) } }, null, 2));
  success(`Exported to ${import_chalk.default.cyan(filename)}`);
  console.log();
}
async function runImportFlow(filepath) {
  if (!fs4.existsSync(filepath)) {
    errorMsg("File not found: " + filepath);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(fs4.readFileSync(filepath, "utf8"));
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
async function runRenameFlow(id, newName) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  db.updateFlow(flow.id, { name: newName });
  success(`Renamed "${import_chalk.default.gray(flow.name)}" \u2192 "${import_chalk.default.white(newName)}"`);
  console.log();
}
async function runCloneFlow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const newName = flow.name + " (copy)";
  const created = db.createFlow({ name: newName, description: flow.description ?? void 0, appUrl: flow.appUrl ?? void 0, graph: JSON.parse(flow.graph) });
  success(`Cloned "${import_chalk.default.gray(flow.name)}" \u2192 "${import_chalk.default.white(newName)}"`);
  info("New ID: " + import_chalk.default.gray(created.id.slice(0, 8)));
  console.log();
}
function parseCurlTokens(input) {
  const tokens = [];
  let cur = "";
  let inSingle = false, inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if ((ch === " " || ch === "\n" || ch === "	") && !inSingle && !inDouble) {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
      continue;
    }
    if (ch === "\\" && !inSingle) {
      i++;
      if (i < input.length) cur += input[i];
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}
async function runFlowFromCurl(curlStr) {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  Import from curl\n"));
  let input = curlStr || "";
  if (!input.trim()) {
    console.log(import_chalk.default.gray("  Paste your curl command (multi-line OK, end with empty line):\n"));
    const lines = [];
    while (true) {
      const line = await askQuestion("  > ");
      if (!line.trim()) break;
      lines.push(line.replace(/\\$/, "").trim());
    }
    input = lines.join(" ");
  }
  input = input.replace(/^curl\s+/, "").trim();
  if (!input) {
    errorMsg("No curl command provided");
    process.exit(1);
  }
  const tokens = parseCurlTokens(input);
  let method = "GET";
  let url = "";
  const headers = {};
  let body;
  let bearerToken = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") {
      method = tokens[++i]?.toUpperCase() || "GET";
      continue;
    }
    if (t === "-H" || t === "--header") {
      const h = tokens[++i] || "";
      const colon = h.indexOf(":");
      if (colon > 0) {
        const k = h.slice(0, colon).trim();
        const v = h.slice(colon + 1).trim();
        if (k.toLowerCase() === "authorization" && v.toLowerCase().startsWith("bearer ")) {
          bearerToken = v.slice(7).trim();
        } else {
          headers[k] = v;
        }
      }
      continue;
    }
    if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      const raw = tokens[++i] || "";
      if (method === "GET") method = "POST";
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
      continue;
    }
    if (t === "-u" || t === "--user") {
      const creds = tokens[++i] || "";
      const encoded = Buffer.from(creds).toString("base64");
      headers["Authorization"] = `Basic ${encoded}`;
      continue;
    }
    if (t === "--url") {
      url = tokens[++i] || "";
      continue;
    }
    if (t === "-s" || t === "--silent" || t === "-v" || t === "--verbose" || t === "-i" || t === "--include" || t === "-L" || t === "--location" || t === "--compressed") continue;
    if (t === "-o" || t === "--output" || t === "--max-time" || t === "--connect-timeout" || t === "--proxy") {
      i++;
      continue;
    }
    if (!t.startsWith("-") && !url) url = t;
  }
  if (!url) {
    errorMsg("Could not find URL in curl command");
    process.exit(1);
  }
  const urlPath = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  const defaultName = `${method} ${urlPath.split("/").filter(Boolean).slice(-1)[0] || urlPath}`;
  const name = await askQuestion(import_chalk.default.cyan(`
  Flow name [${defaultName}]: `));
  const flowName = name.trim() || defaultName;
  const nodes = [];
  const nodeId = () => (0, import_crypto4.randomUUID)();
  const httpNode = {
    id: nodeId(),
    type: "action",
    action: "http:request",
    method,
    url,
    label: `${method} ${urlPath}`
  };
  if (Object.keys(headers).length) httpNode.headers = headers;
  if (body !== void 0) httpNode.body = body;
  if (bearerToken) httpNode.auth = { type: "bearer", token: bearerToken };
  nodes.push(httpNode);
  nodes.push({ id: nodeId(), type: "action", action: "assert:response", assert: "status", expected: 200, label: "Assert status 200" });
  const isJson = headers["Content-Type"]?.includes("json") || headers["content-type"]?.includes("json") || typeof body === "object";
  if (isJson || !body && method === "GET") {
    nodes.push({ id: nodeId(), type: "action", action: "assert:response", assert: "time", expected: 2e3, label: "Assert response < 2000ms" });
  }
  const graph = { nodes, edges: [] };
  const created = db.createFlow({ name: flowName, description: `Imported from curl: ${method} ${url}`, graph });
  console.log();
  success(`Flow created: ${import_chalk.default.white(flowName)}`);
  info(`ID: ${import_chalk.default.gray(created.id.slice(0, 8))}`);
  console.log(import_chalk.default.gray(`
  Nodes created:`));
  for (const n of nodes) console.log(import_chalk.default.gray(`    ${n.label}`));
  console.log(import_chalk.default.gray(`
  Run with: ghostrun run "${flowName}"`));
  console.log(import_chalk.default.gray(`  Add more steps: ghostrun api:learn`));
  console.log();
}
function parseYamlValue(s) {
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s.replace(/^["']|["']$/g, "");
}
function parseSimpleYaml(text) {
  const lines = text.split("\n");
  const root = {};
  const stack = [{ obj: root, indent: -1 }];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.search(/\S/);
    const trimmed = line.trim();
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (trimmed.startsWith("- ")) {
      const val = trimmed.slice(2).trim();
      if (Array.isArray(parent)) {
        const parsed = parseYamlValue(val);
        parent.push(parsed);
      }
      continue;
    }
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;
    const key = trimmed.slice(0, colonIdx).trim().replace(/^["']|["']$/g, "");
    const rest = trimmed.slice(colonIdx + 1).trim();
    if (!Array.isArray(parent)) {
      if (rest === "" || rest === "|" || rest === ">") {
        const child = {};
        parent[key] = child;
        stack.push({ obj: child, indent });
      } else if (rest === "-" || rest.startsWith("- ")) {
        const arr = [];
        parent[key] = arr;
        stack.push({ obj: arr, indent });
      } else {
        parent[key] = parseYamlValue(rest);
      }
    }
  }
  return root;
}
async function runFlowFromSpec(filepath) {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  Import from OpenAPI Spec\n"));
  if (!fs4.existsSync(filepath)) {
    errorMsg("File not found: " + filepath);
    process.exit(1);
  }
  let spec;
  const raw = fs4.readFileSync(filepath, "utf8").trim();
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      spec = JSON.parse(raw);
    } catch {
      errorMsg("Invalid JSON");
      process.exit(1);
      return;
    }
  } else {
    spec = parseSimpleYaml(raw);
  }
  const version = spec.openapi || spec.swagger || "2";
  const specInfo = spec.info || {};
  const title = specInfo.title || path4.basename(filepath, path4.extname(filepath));
  const servers = spec.servers || [];
  const baseUrl = servers[0]?.url || (spec.host ? `https://${spec.host}${spec.basePath || ""}` : "");
  const paths = spec.paths || {};
  console.log(import_chalk.default.gray(`  Spec: ${title} (OpenAPI ${version})`));
  console.log(import_chalk.default.gray(`  Base URL: ${baseUrl || "(not set \u2014 use environment variables)"}`));
  console.log(import_chalk.default.gray(`  Paths: ${Object.keys(paths).length}
`));
  if (Object.keys(paths).length === 0) {
    errorMsg("No paths found in spec");
    process.exit(1);
  }
  const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
  const tagGroups = {};
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      const tags2 = op.tags || ["default"];
      const tag = tags2[0] || "default";
      if (!tagGroups[tag]) tagGroups[tag] = [];
      tagGroups[tag].push({ path: pathKey, method, op });
    }
  }
  const tags = Object.keys(tagGroups);
  console.log(import_chalk.default.gray(`  Tags found: ${tags.join(", ")}`));
  console.log(import_chalk.default.cyan("\n  Options:"));
  console.log(import_chalk.default.gray("  1 \u2014 One flow per tag group (recommended)"));
  console.log(import_chalk.default.gray("  2 \u2014 One flow per endpoint"));
  console.log(import_chalk.default.gray("  3 \u2014 Single flow with all endpoints"));
  const choice = (await askQuestion("\n  Choice [1]: ")).trim() || "1";
  const flowsToCreate = [];
  const nodeId = () => (0, import_crypto4.randomUUID)();
  function makeHttpNode(method, pathKey, op, bUrl) {
    const resolvedUrl = bUrl ? `${bUrl.replace(/\/$/, "")}${pathKey}` : pathKey;
    const summary = op.summary || `${method.toUpperCase()} ${pathKey}`;
    const node = {
      id: nodeId(),
      type: "action",
      action: "http:request",
      method: method.toUpperCase(),
      url: resolvedUrl,
      label: summary
    };
    const requestBody = op.requestBody;
    if (requestBody) {
      const content = requestBody.content;
      if (content?.["application/json"]) {
        const schema = content["application/json"]?.schema;
        if (schema?.example) node.body = schema.example;
        else if (schema?.properties) {
          const body = {};
          for (const prop of Object.keys(schema.properties)) body[prop] = `{{${prop}}}`;
          node.body = body;
        }
        node.headers = { "Content-Type": "application/json" };
      }
    }
    const pathParams = (op.parameters || []).filter((p) => p.in === "path");
    if (pathParams.length) {
      let urlStr = node.url;
      for (const p of pathParams) {
        urlStr = urlStr.replace(`{${p.name}}`, `{{${p.name}}}`);
      }
      node.url = urlStr;
    }
    return node;
  }
  function makeAssertNode(successCode = 200) {
    return { id: nodeId(), type: "action", action: "assert:response", assert: "status", expected: successCode, label: `Assert status ${successCode}` };
  }
  if (choice === "1") {
    for (const [tag, ops] of Object.entries(tagGroups)) {
      const nodes = [];
      for (const { path: pathKey, method, op } of ops) {
        nodes.push(makeHttpNode(method, pathKey, op, baseUrl));
        const responses = op.responses || {};
        const successCode = Object.keys(responses).find((c) => Number(c) >= 200 && Number(c) < 300);
        nodes.push(makeAssertNode(successCode ? Number(successCode) : 200));
      }
      flowsToCreate.push({ name: `${title} \u2014 ${tag}`, description: `Auto-generated from OpenAPI spec: ${title}`, nodes });
    }
  } else if (choice === "2") {
    for (const [tag, ops] of Object.entries(tagGroups)) {
      for (const { path: pathKey, method, op } of ops) {
        const summary = op.summary || `${method.toUpperCase()} ${pathKey}`;
        const nodes = [];
        nodes.push(makeHttpNode(method, pathKey, op, baseUrl));
        const responses = op.responses || {};
        const successCode = Object.keys(responses).find((c) => Number(c) >= 200 && Number(c) < 300);
        nodes.push(makeAssertNode(successCode ? Number(successCode) : 200));
        flowsToCreate.push({ name: summary, description: `${tag}: ${method.toUpperCase()} ${pathKey}`, nodes });
      }
    }
  } else {
    const nodes = [];
    for (const [, ops] of Object.entries(tagGroups)) {
      for (const { path: pathKey, method, op } of ops) {
        nodes.push(makeHttpNode(method, pathKey, op, baseUrl));
        nodes.push(makeAssertNode(200));
      }
    }
    flowsToCreate.push({ name: title, description: `Auto-generated from OpenAPI spec: ${filepath}`, nodes });
  }
  console.log();
  for (const f of flowsToCreate) {
    const created = db.createFlow({ name: f.name, description: f.description, appUrl: baseUrl || void 0, graph: { nodes: f.nodes, edges: [] } });
    success(`Created: ${import_chalk.default.white(f.name)} ${import_chalk.default.gray("(" + f.nodes.length + " steps, id: " + created.id.slice(0, 8) + ")")}`);
  }
  console.log(import_chalk.default.gray(`
  ${flowsToCreate.length} flow(s) created. Run with: ghostrun run "<name>"`));
  if (baseUrl) console.log(import_chalk.default.gray(`  Base URL: ${baseUrl}`));
  else console.log(import_chalk.default.gray(`  Tip: set base URL with: ghostrun env:create dev <base-url>`));
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
  console.log(import_chalk.default.gray("  ID        Flow                         Status   Duration    When"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(70)));
  for (const run of runs) {
    const flow = db.getFlow(run.flowId);
    const icon = run.status === "passed" ? import_chalk.default.green("\u2713") : run.status === "failed" ? import_chalk.default.red("\u2717") : import_chalk.default.yellow("\u2026");
    const statusStr = run.status === "passed" ? import_chalk.default.green("passed") : run.status === "failed" ? import_chalk.default.red("failed") : import_chalk.default.yellow(run.status);
    const durStr = run.duration ? run.duration >= 1e3 ? (run.duration / 1e3).toFixed(1) + "s" : run.duration + "ms" : "\u2014";
    const when = run.startedAt ? timeAgo(run.startedAt) : "";
    console.log(`  ${import_chalk.default.gray(run.id.slice(0, 8))} ${icon} ${import_chalk.default.white((flow?.name || "Unknown").padEnd(27).slice(0, 27))} ${statusStr.padEnd(12)} ${import_chalk.default.gray(durStr.padEnd(11))} ${import_chalk.default.gray(when)}`);
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
  console.log(import_chalk.default.bold("\n  Steps\n"));
  for (const step of steps) {
    const icon = step.status === "passed" ? import_chalk.default.green("\u2713") : step.status === "failed" ? import_chalk.default.red("\u2717") : import_chalk.default.gray("\u25CB");
    const diffStr = step.diffPercent && step.diffPercent > 0 ? import_chalk.default.yellow(` ~${step.diffPercent}%`) : "";
    console.log(`    ${import_chalk.default.gray(String(step.stepNumber).padStart(2))}  ${icon}  ${import_chalk.default.white(step.name)} ${import_chalk.default.gray(step.duration ? step.duration + "ms" : "")}${diffStr}`);
    if (step.errorMessage && step.errorMessage.startsWith("[DIFF:")) console.log(`         ${import_chalk.default.yellow("\u2514\u2500 " + step.errorMessage)}`);
    else if (step.errorMessage && step.errorMessage.startsWith("[HEALED:")) console.log(`         ${import_chalk.default.yellow("\u2514\u2500 " + step.errorMessage)}`);
    else if (step.status === "failed" && step.errorMessage) console.log(`         ${import_chalk.default.red("\u2514\u2500 " + step.errorMessage.slice(0, 80))}`);
    if (step.screenshotPath) console.log(`         ${import_chalk.default.gray("\u{1F4F7} " + step.screenshotPath)}`);
  }
  const scrapeDiagnostics = db.listScrapeRunsForRun(run.id);
  if (scrapeDiagnostics.length > 0) {
    console.log(import_chalk.default.bold("\n  Scrape Diagnostics\n"));
    for (const s of scrapeDiagnostics) {
      console.log(`    ${import_chalk.default.gray(s.id.slice(0, 8))}  ${import_chalk.default.white(s.reason || "diagnostic")}  ${import_chalk.default.gray(s.resultPath || "")}`);
    }
  }
  if (run.status === "failed") {
    let summary = run.summary;
    if (!summary) {
      process.stdout.write(import_chalk.default.gray("\n  Analyzing failure...\n"));
      const failedStep = steps.find((s) => s.status === "failed");
      if (failedStep) {
        const result = await callAI(buildFailurePrompt({
          flowName: flow?.name || "Unknown",
          steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
          failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || "Unknown error" }
        }), { mode: "summary", metadata: { flowId: flow?.id || "", runId: run.id } });
        if (result) {
          summary = result.text;
          db.updateRun(run.id, { summary });
        }
      }
    }
    if (summary) {
      console.log();
      console.log(import_chalk.default.bgRed.white.bold("  FAILURE REPORT  "));
      console.log();
      for (const line of summary.split("\n")) {
        const trimmed = line.trim();
        if (/^(WHAT FAILED|WHY IT FAILED|HOW TO FIX IT)$/.test(trimmed)) {
          console.log(import_chalk.default.yellow.bold("  " + trimmed));
        } else if (trimmed) {
          console.log(import_chalk.default.white("    " + trimmed));
        }
      }
    } else {
      console.log();
      warn("No AI provider available for analysis. Run Ollama locally or set ANTHROPIC_API_KEY.");
    }
  }
  console.log();
}
function buildFailureHeadline(flowName, failedStep) {
  const err = failedStep.errorMessage.slice(0, 120);
  return `Step ${failedStep.stepNumber}: ${failedStep.action} failed in "${flowName}" \u2014 ${err}`;
}
function getRunEvidenceDir(runId) {
  return path4.join(PROJECT_GHOSTRUN_PATH, "runs", runId);
}
function buildFailureV1(params) {
  const headline = buildFailureHeadline(params.flowName, {
    stepNumber: params.failedStep.number,
    action: params.failedStep.action,
    name: params.failedStep.name,
    errorMessage: params.failedStep.error
  });
  return {
    schemaVersion: "1.0",
    runId: params.runId,
    flowId: params.flowId,
    flowName: params.flowName,
    profile: params.profile,
    status: params.status,
    headline,
    intent: params.failedStep.name,
    failedStep: params.failedStep,
    context: {
      similarFailures30d: params.similarFailures30d ?? 0,
      repairProposalId: params.repairProposalId
    },
    actions: {
      rerun: `ghostrun run ${params.flowName}${params.profile ? ` --profile ${params.profile}` : ""}`,
      openReport: "report.html",
      viewProposals: "ghostrun repair list",
      ...params.repairProposalId ? { applyRepair: `ghostrun repair apply ${params.repairProposalId.slice(0, 8)}` } : {}
    },
    integrations: {}
  };
}
var GITHUB_ISSUE_DEFAULT_LABEL = "ghostrun";
function githubIssueDedupMarker(runId, flowId) {
  return `ghostrun-run:${runId}
ghostrun-flow:${flowId}`;
}
function issueBodyHasDedupMarker(body, runId, flowId) {
  return body.includes(`ghostrun-run:${runId}`) && body.includes(`ghostrun-flow:${flowId}`);
}
function shouldCreateGitHubIssue(config, trigger) {
  const gh = config.integrations?.github;
  if (!gh?.enabled) return false;
  const createOn = gh.createOn;
  if (!createOn?.length) return true;
  return createOn.includes(trigger);
}
function formatGitHubIssueBody(failure, manifest) {
  const runId = String(failure.runId || manifest.runId || "\u2014");
  const flowId = String(failure.flowId || manifest.flowId || "\u2014");
  const flowName = String(failure.flowName || manifest.flowName || "\u2014");
  const profile = String(failure.profile ?? manifest.profile ?? "\u2014");
  const failed = failure.failedStep;
  const actions = failure.actions;
  const headline = String(failure.headline || "Test failed");
  const lines = [
    "## GhostRun failure",
    "",
    `**${headline}**`,
    "",
    "| | |",
    "|---|---|",
    `| Flow | ${flowName} |`,
    `| Profile | ${profile} |`,
    `| Run | \`${runId}\` |`,
    `| Flow ID | \`${flowId}\` |`,
    "",
    "### Failed step",
    "",
    "```",
    `Step ${failed?.number ?? "?"}: ${failed?.action ?? "unknown"}`,
    String(failed?.error || "Unknown error"),
    "```",
    "",
    "### Commands",
    "",
    "```bash",
    actions?.rerun || `ghostrun run ${flowName}`,
    actions?.viewProposals || "ghostrun repair list",
    "```",
    "",
    "<!-- ghostrun-integration:v1 -->",
    githubIssueDedupMarker(runId, flowId),
    "",
    "_Created by GhostRun `report publish --create-issues`_"
  ];
  return lines.join("\n");
}
function formatGitHubIssueTitle(failure) {
  const headline = String(failure.headline || "");
  const flowName = String(failure.flowName || "flow");
  const title = headline ? `[GhostRun] ${headline}` : `[GhostRun] ${flowName} failed`;
  return title.length > 256 ? title.slice(0, 253) + "..." : title;
}
function getGitHubToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
}
function resolveGitHubIssueLabels(config) {
  const configured = config.integrations?.github?.labels;
  if (configured?.length) return configured;
  return [GITHUB_ISSUE_DEFAULT_LABEL];
}
async function githubRestFetch(token, url, init) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
}
async function findOpenGitHubIssueForFailure(owner, repo, token, runId, flowId, labels) {
  const labelParam = labels.map((l) => encodeURIComponent(l)).join(",");
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100&labels=${labelParam}`;
  const res = await githubRestFetch(token, url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issues search failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const issues = await res.json();
  for (const issue of issues) {
    if (issue.pull_request) continue;
    if (issueBodyHasDedupMarker(issue.body || "", runId, flowId)) {
      return { number: issue.number, html_url: issue.html_url };
    }
  }
  return null;
}
function patchFailureGitHubIssueUrl(failurePath, issueUrl) {
  const failure = JSON.parse(fs4.readFileSync(failurePath, "utf8"));
  const integrations = failure.integrations || {};
  integrations.githubIssue = issueUrl;
  failure.integrations = integrations;
  fs4.writeFileSync(failurePath, JSON.stringify(failure, null, 2));
}
async function createGitHubIssueFromFailure(failure, manifest, config, opts) {
  const gh = config.integrations?.github;
  if (!gh?.enabled) return { created: false, skipped: "disabled" };
  if (!gh.owner || !gh.repo) return { created: false, skipped: "config" };
  const token = getGitHubToken();
  if (!token) {
    throw new Error("GITHUB_TOKEN or GH_TOKEN not set.");
  }
  const runId = String(failure.runId || manifest.runId || "");
  const flowId = String(failure.flowId || manifest.flowId || "");
  if (!runId || !flowId) {
    throw new Error("failure.v1.json missing runId or flowId.");
  }
  const labels = resolveGitHubIssueLabels(config);
  const existing = await findOpenGitHubIssueForFailure(
    gh.owner,
    gh.repo,
    token,
    runId,
    flowId,
    labels
  );
  if (existing) {
    const paths2 = [opts?.publishFailurePath, opts?.evidenceFailurePath].filter(
      (p) => !!p && fs4.existsSync(p)
    );
    for (const p of paths2) patchFailureGitHubIssueUrl(p, existing.html_url);
    return {
      created: false,
      skipped: "duplicate",
      issueUrl: existing.html_url,
      issueNumber: existing.number
    };
  }
  const body = formatGitHubIssueBody(failure, manifest);
  const title = formatGitHubIssueTitle(failure);
  const createRes = await githubRestFetch(
    token,
    `https://api.github.com/repos/${gh.owner}/${gh.repo}/issues`,
    {
      method: "POST",
      body: JSON.stringify({ title, body, labels })
    }
  );
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`GitHub issue create failed (${createRes.status}): ${text.slice(0, 300)}`);
  }
  const created = await createRes.json();
  const paths = [opts?.publishFailurePath, opts?.evidenceFailurePath].filter(
    (p) => !!p && fs4.existsSync(p)
  );
  for (const p of paths) patchFailureGitHubIssueUrl(p, created.html_url);
  return {
    created: true,
    issueUrl: created.html_url,
    issueNumber: created.number
  };
}
function writeEvidenceBundle(runId, opts) {
  ensureProjectWorkspace();
  const run = db.getRun(runId);
  if (!run) return "";
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(runId);
  const evidenceDir = getRunEvidenceDir(runId);
  fs4.mkdirSync(evidenceDir, { recursive: true });
  const profile = readConfig().activeProfile || null;
  const flowName = flow?.name || run.flowId;
  const pkgVersion = (() => {
    try {
      const pkgPath = path4.join(path4.dirname(fs4.realpathSync(process.argv[1])), "package.json");
      return JSON.parse(fs4.readFileSync(pkgPath, "utf8")).version;
    } catch {
      return "unknown";
    }
  })();
  const stepsJsonl = steps.map((s) => JSON.stringify({
    stepNumber: s.stepNumber,
    name: s.name,
    action: s.action,
    status: s.status,
    duration: s.duration,
    selector: s.selector,
    errorMessage: s.errorMessage,
    screenshot: s.screenshotPath
  })).join("\n");
  fs4.writeFileSync(path4.join(evidenceDir, "steps.jsonl"), stepsJsonl + (stepsJsonl ? "\n" : ""));
  const screenshotRefs = [];
  for (const step of steps) {
    if (step.screenshotPath && fs4.existsSync(step.screenshotPath)) {
      const dest = path4.join(evidenceDir, "screenshots", path4.basename(step.screenshotPath));
      fs4.mkdirSync(path4.dirname(dest), { recursive: true });
      fs4.copyFileSync(step.screenshotPath, dest);
      screenshotRefs.push(path4.relative(evidenceDir, dest));
    }
  }
  const failedStep = steps.find((s) => s.status === "failed");
  let failurePath;
  let headline;
  if (run.status === "failed" && failedStep) {
    const proposals = listRepairProposals(20).filter((p) => p.runId === runId);
    const failure = buildFailureV1({
      runId: run.id,
      flowId: run.flowId,
      flowName,
      profile,
      status: run.status,
      durationMs: run.duration || 0,
      failedStep: {
        number: failedStep.stepNumber,
        action: failedStep.action || "unknown",
        name: failedStep.name,
        selector: failedStep.selector,
        durationMs: failedStep.duration || 0,
        error: failedStep.errorMessage || run.errorMessage || "Unknown error",
        screenshot: screenshotRefs.find((r) => r.includes(String(failedStep.stepNumber))) || screenshotRefs[0]
      },
      repairProposalId: proposals[0]?.id,
      similarFailures30d: getRecentFailureRepeatCount(run.flowId, failedStep.errorMessage || "")
    });
    headline = failure.headline;
    failurePath = path4.join(evidenceDir, "failure.v1.json");
    fs4.writeFileSync(failurePath, JSON.stringify(failure, null, 2));
  }
  const reportPath = path4.join(evidenceDir, "report.html");
  generateRunReportSync(runId, reportPath, headline);
  const manifest = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    ghostrunVersion: pkgVersion,
    publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    runId: run.id,
    flowId: run.flowId,
    flowName,
    profile,
    status: run.status,
    ci: !!opts?.ci,
    durationMs: run.duration || 0,
    headline: headline || (run.status === "passed" ? `Flow "${flowName}" passed` : void 0),
    artifacts: {
      report: "report.html",
      steps: "steps.jsonl",
      failure: failurePath ? "failure.v1.json" : void 0,
      screenshots: screenshotRefs
    }
  };
  const manifestPath = path4.join(evidenceDir, "manifest.json");
  fs4.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}
function generateRunReportSync(runId, outFile, headlineOverride) {
  const run = db.findRunByPartialId(runId) || db.getRun(runId);
  if (!run) return;
  const html = buildRunReportHtml(runId, headlineOverride);
  if (html) fs4.writeFileSync(outFile, html);
}
function resolveStepScreenshotSrc(step, evidenceDir) {
  const bundled = step.screenshotPath ? path4.join(evidenceDir, "screenshots", path4.basename(step.screenshotPath)) : null;
  if (bundled && fs4.existsSync(bundled)) {
    return `screenshots/${path4.basename(bundled)}`;
  }
  if (step.screenshotPath && fs4.existsSync(step.screenshotPath)) {
    return `screenshots/${path4.basename(step.screenshotPath)}`;
  }
  return null;
}
function loadFailureV1ForRun(runId) {
  const failurePath = path4.join(getRunEvidenceDir(runId), "failure.v1.json");
  if (!fs4.existsSync(failurePath)) return null;
  try {
    return JSON.parse(fs4.readFileSync(failurePath, "utf8"));
  } catch {
    return null;
  }
}
function resolveRepairProposalsForRun(runId, failureV1) {
  let proposals = listRepairProposals(20).filter((p) => p.runId === runId);
  if (proposals.length === 0 && failureV1?.context && typeof failureV1.context === "object") {
    const repairProposalId = failureV1.context.repairProposalId;
    if (repairProposalId) {
      const found = findRepairProposal(repairProposalId);
      if (found) proposals = [found.proposal];
    }
  }
  return proposals.map((p) => ({
    id: p.id,
    repairType: getRepairType(p),
    status: p.status,
    stepNumber: p.stepNumber,
    currentSelector: p.currentSelector,
    proposedSelector: p.proposedSelector,
    currentValue: p.currentValue,
    proposedValue: p.proposedValue,
    rationale: p.rationale,
    action: p.action
  }));
}
function getGhostrunPkgVersion() {
  try {
    const pkgPath = path4.join(path4.dirname(fs4.realpathSync(process.argv[1])), "package.json");
    return JSON.parse(fs4.readFileSync(pkgPath, "utf8")).version;
  } catch {
    return "unknown";
  }
}
function buildRunReportHtml(runId, headlineOverride) {
  const run = db.findRunByPartialId(runId) || db.getRun(runId);
  if (!run) return null;
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const scrapeDiagnostics = db.listScrapeRunsForRun(run.id);
  const evidenceDir = getRunEvidenceDir(run.id);
  const failureV1 = loadFailureV1ForRun(run.id);
  const profile = failureV1?.profile ?? readConfig().activeProfile ?? null;
  const failedStep = steps.find((s) => s.status === "failed");
  const headline = headlineOverride || failureV1?.headline || (failedStep ? buildFailureHeadline(flow?.name || runId, {
    stepNumber: failedStep.stepNumber,
    action: failedStep.action || "step",
    name: failedStep.name,
    errorMessage: failedStep.errorMessage || run.errorMessage || "Unknown error"
  }) : void 0);
  const statusColor = run.status === "passed" ? "#56d364" : run.status === "failed" ? "#f85149" : "#e3b341";
  const statusBadgeClass = run.status === "passed" || run.status === "failed" ? run.status : "other";
  const durStr = formatReportDuration(run.duration);
  const flowHash = computeFlowGraphHash(flow?.graph);
  const pkgVersion = getGhostrunPkgVersion();
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const stepsHtml = steps.map((step, i) => {
    const icon = step.status === "passed" ? "\u2713" : step.status === "failed" ? "\u2717" : "\u25CB";
    const color = step.status === "passed" ? "#56d364" : step.status === "failed" ? "#f85149" : "#e3b341";
    const dur = formatReportDuration(step.duration);
    const errHtml = step.errorMessage ? `<div class="step-error">${escapeHtml(step.errorMessage)}</div>` : "";
    const shotSrc = resolveStepScreenshotSrc(step, evidenceDir);
    const screenshotHtml = shotSrc ? `<img class="step-screenshot" src="${escapeHtml(shotSrc)}" loading="lazy" alt="Step ${i + 1} screenshot" />` : "";
    return `<div class="step ${step.status}">
      <div class="step-header">
        <span class="step-icon" style="color:${color}">${icon}</span>
        <span class="step-num">${i + 1}</span>
        <span class="step-action">${escapeHtml(step.action || "")}</span>
        <span class="step-label">${escapeHtml(step.name || "")}</span>
        <span class="step-dur">${dur}</span>
      </div>
      ${errHtml}${screenshotHtml}
    </div>`;
  }).join("\n");
  const scrapeHtml = scrapeDiagnostics.length ? `<section class="panel"><h2>Scrape diagnostics</h2>${scrapeDiagnostics.map(
    (s) => `<div class="step"><div class="step-header"><span class="step-action">${escapeHtml(s.reason || "diagnostic")}</span><span class="step-label">${escapeHtml(s.resultPath || s.id)}</span></div></div>`
  ).join("\n")}</section>` : "";
  const headlineHtml = headline ? `<div class="headline">${escapeHtml(headline)}</div>` : "";
  const historyRuns = db.listRuns(run.flowId, 30);
  const historyHtml = buildRunHistorySparklineHtml(
    historyRuns.map((r) => ({ id: r.id, status: r.status })),
    run.id
  );
  const repairProposals = run.status === "failed" ? resolveRepairProposalsForRun(run.id, failureV1) : [];
  const repairHtml = buildRepairPanelHtml(repairProposals);
  const flowName = flow?.name || runId;
  const failureActions = failureV1?.actions;
  const nextStepsHtml = buildNextStepsPanelHtml({
    rerunCommand: failureActions?.rerun || `ghostrun run ${flowName}${profile ? ` --profile ${profile}` : ""}`,
    repairListCommand: failureActions?.viewProposals || "ghostrun repair list",
    reportPath: failureActions?.openReport || "report.html",
    applyRepairCommand: failureActions?.applyRepair || (repairProposals[0] ? `ghostrun repair apply ${repairProposals[0].id.slice(0, 8)}` : void 0)
  });
  const intent = failureV1?.intent || failedStep?.name || "";
  const intentHtml = buildIntentBlockHtml(intent);
  let failurePanelHtml = "";
  if (run.status === "failed" && failedStep) {
    const failedShot = resolveStepScreenshotSrc(failedStep, evidenceDir);
    failurePanelHtml = buildFailurePanelHtml({
      stepNumber: failedStep.stepNumber,
      action: failedStep.action || "step",
      name: failedStep.name,
      error: failedStep.errorMessage || run.errorMessage || "Unknown error",
      selector: failedStep.selector,
      screenshotSrc: failedShot
    });
  }
  const passedCount = steps.filter((s) => s.status === "passed").length;
  const failedCount = steps.filter((s) => s.status === "failed").length;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GhostRun Report \u2014 ${escapeHtml(flowName)}</title>
<style>${RUN_REPORT_V2_STYLES}</style>
</head>
<body>
<div class="report">
<section class="hero" aria-labelledby="report-title">
  <div class="hero-top">
    <h1 id="report-title">${escapeHtml(flowName)}</h1>
    <span class="status-badge ${statusBadgeClass}">${run.status.toUpperCase()}</span>
  </div>
  ${headlineHtml}
  <div class="hero-meta">
    <span>Run ${run.id.slice(0, 8)}</span>
    <span>${new Date(run.startedAt).toLocaleString()}</span>
    ${profile ? `<span>Profile ${escapeHtml(profile)}</span>` : ""}
    <span>Duration ${durStr}</span>
    ${flowHash ? `<span>Flow hash ${flowHash}</span>` : ""}
  </div>
</section>

<div class="summary">
  <div class="stat"><div class="stat-val" style="color:${statusColor}">${run.status.toUpperCase()}</div><div class="stat-label">Status</div></div>
  <div class="stat"><div class="stat-val">${durStr}</div><div class="stat-label">Duration</div></div>
  <div class="stat"><div class="stat-val">${passedCount}</div><div class="stat-label">Passed</div></div>
  <div class="stat"><div class="stat-val" style="color:${failedCount ? "#f85149" : "#56d364"}">${failedCount}</div><div class="stat-label">Failed</div></div>
</div>

${nextStepsHtml}
${failurePanelHtml}
${intentHtml}
${repairHtml}
${historyHtml}

<section class="timeline" aria-labelledby="timeline-heading">
  <h2 id="timeline-heading">Timeline</h2>
  <div class="steps">${stepsHtml}</div>
</section>

${scrapeHtml}

<footer class="report-footer">
  <span>GhostRun ${escapeHtml(pkgVersion)}</span>
  <span>Evidence schema ${EVIDENCE_SCHEMA_VERSION}</span>
  <span>Generated ${generatedAt}</span>
</footer>
</div>
</body></html>`;
}
async function generateRunReport(runId, outFile) {
  const html = buildRunReportHtml(runId);
  if (!html) return;
  fs4.writeFileSync(outFile, html);
  success(`HTML report: ${import_chalk.default.cyan(outFile)}`);
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
  const latestScrape = db.listScrapeRunsForRun(run.id)[0];
  const scrapeContext = extractScrapeText(readScrapeResult(latestScrape?.resultPath || null));
  const result = await callAI(buildFailurePrompt({
    flowName: flow?.name || "Unknown",
    steps: steps.map((s) => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
    failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || "Unknown error" },
    scrapeContext
  }), { mode: "summary", metadata: { flowId: flow?.id || "", runId: run.id } });
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
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
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
  console.log("  " + import_chalk.default.cyan("ghostrun monitor daemon"));
  console.log("  " + import_chalk.default.gray("(or: ghostrun serve --daemon)"));
  console.log();
}
async function runMonitorCommand(monitorArgs) {
  const sub = monitorArgs[0];
  if (!sub) {
    printLogo();
    divider();
    console.log(import_chalk.default.bold("\n  GhostRun Monitor\n"));
    console.log(`  ${import_chalk.default.cyan("ghostrun monitor <flow> --interval 60s")}     ${import_chalk.default.gray("Poll a flow on an interval")}`);
    console.log(`  ${import_chalk.default.cyan("ghostrun monitor daemon")}                  ${import_chalk.default.gray("Run cron schedules (PID file)")}`);
    console.log(`  ${import_chalk.default.cyan("ghostrun monitor schedule list")}             ${import_chalk.default.gray("List cron schedules")}`);
    console.log(`  ${import_chalk.default.cyan('ghostrun monitor schedule add <id> "<cron>"')} ${import_chalk.default.gray("Add schedule")}`);
    console.log(`  ${import_chalk.default.cyan("ghostrun monitor schedule remove <id>")}      ${import_chalk.default.gray("Remove schedule")}`);
    console.log();
    return;
  }
  if (sub === "daemon") {
    await runServe(["--daemon", ...monitorArgs.slice(1)]);
    return;
  }
  if (sub === "schedule") {
    const action = monitorArgs[1] || "list";
    if (action === "list") {
      await runScheduleList();
      return;
    }
    if (action === "add") {
      if (!monitorArgs[2] || !monitorArgs[3]) {
        errorMsg('Usage: ghostrun monitor schedule add <flow-id> "<cron>"');
        process.exit(1);
      }
      await runScheduleAdd(monitorArgs[2], monitorArgs[3]);
      return;
    }
    if (action === "remove") {
      if (!monitorArgs[2]) {
        errorMsg("Schedule ID required");
        process.exit(1);
      }
      await runScheduleRemove(monitorArgs[2]);
      return;
    }
    errorMsg("Unknown schedule action. Use: list, add, remove");
    process.exit(1);
  }
  await runMonitor(sub, monitorArgs.slice(1));
}
async function runScheduleList() {
  const schedules = db.listSchedules();
  console.log(import_chalk.default.bold("\n  Schedules\n"));
  if (schedules.length === 0) {
    warn("No schedules. Add one: " + import_chalk.default.cyan('ghostrun monitor schedule add <id> "<cron>"'));
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
async function runServe(serveArgs = []) {
  const withUI = serveArgs.includes("--ui");
  const daemon = serveArgs.includes("--daemon");
  const portIdx = serveArgs.indexOf("--port");
  const port = portIdx !== -1 ? parseInt(serveArgs[portIdx + 1], 10) || 3e3 : 3e3;
  if (withUI) {
    await runServeDashboard(port);
    return;
  }
  ensureProjectWorkspace();
  const pidPath = getSchedulerPidPath();
  if (daemon) {
    if (fs4.existsSync(pidPath)) {
      const existingPid = parseInt(fs4.readFileSync(pidPath, "utf8"), 10);
      if (!Number.isNaN(existingPid) && isProcessRunning(existingPid)) {
        errorMsg(`Scheduler already running (PID ${existingPid}). Stop it first or remove ${pidPath}`);
        process.exit(1);
      }
      fs4.unlinkSync(pidPath);
    }
    fs4.writeFileSync(pidPath, String(process.pid));
    const cleanupPid = () => {
      try {
        if (fs4.existsSync(pidPath)) fs4.unlinkSync(pidPath);
      } catch {
      }
    };
    process.on("SIGINT", cleanupPid);
    process.on("SIGTERM", cleanupPid);
    process.on("exit", cleanupPid);
  }
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
    info('ghostrun monitor schedule add <id> "0 9 * * *"');
    process.exit(0);
  }
  console.log(import_chalk.default.bold(`
  Scheduler started \u2014 ${schedules.length} schedule${schedules.length > 1 ? "s" : ""} active
`));
  if (daemon) info(`PID file: ${import_chalk.default.cyan(pidPath)}`);
  schedules.forEach((s) => info(`${s.name} \u2192 ${import_chalk.default.cyan(s.cronExpression)}`));
  console.log(import_chalk.default.gray("\n  Press Ctrl+C to stop.\n"));
  console.log(import_chalk.default.gray("  Production tip: use GitHub Actions schedule for always-on monitoring.\n"));
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
async function runServeDashboard(port) {
  const http2 = await import("http");
  const { EventEmitter } = await import("events");
  const { spawn } = await import("child_process");
  const logBus = new EventEmitter();
  logBus.setMaxListeners(100);
  const sseClients = /* @__PURE__ */ new Set();
  const commandHistory = [];
  const allowedDashboardCommands = /* @__PURE__ */ new Set([
    "status",
    "flow:list",
    "env:list",
    "suite:list",
    "perf:list",
    "scrape:list",
    "store",
    "run",
    "report",
    "monitor"
  ]);
  function broadcast(event, data) {
    const msg = `event: ${event}
data: ${JSON.stringify(data)}

`;
    for (const res of sseClients) {
      try {
        res.write(msg);
      } catch {
      }
    }
  }
  const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>GhostRun Dashboard</title>
<style>
  :root {
    --bg: #080c10;
    --surface: #0d1117;
    --border: #21262d;
    --text: #e6edf3;
    --muted: #8b949e;
    --dim: #6e7681;
    --cyan: #39d0d8;
    --green: #3fb950;
    --red: #f85149;
    --yellow: #d29922;
    --font-mono: 'JetBrains Mono', 'Fira Code', Menlo, monospace;
    --font-ui: system-ui, -apple-system, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-ui);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  /* NAV */
  nav {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 24px;
    height: 52px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }
  .nav-logo { font-size: 20px; }
  .nav-title {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 700;
    color: var(--cyan);
    letter-spacing: -0.5px;
  }
  .nav-title span { color: var(--text); }
  .nav-badge {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--dim);
    background: rgba(57,208,216,0.08);
    border: 1px solid rgba(57,208,216,0.2);
    border-radius: 4px;
    padding: 2px 8px;
  }
  /* TABS */
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    padding: 0 24px;
    flex-shrink: 0;
  }
  .tab {
    padding: 10px 18px;
    font-size: 13px;
    cursor: pointer;
    color: var(--muted);
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    user-select: none;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }
  /* MAIN */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px;
    gap: 20px;
    overflow-y: auto;
  }
  .panel-hidden { display: none !important; }
  /* STATS ROW */
  .stats-row {
    display: flex;
    gap: 12px;
  }
  .stat-card {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 20px;
  }
  .stat-label {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--dim);
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--font-mono);
    line-height: 1;
  }
  .stat-value.cyan { color: var(--cyan); }
  .stat-value.green { color: var(--green); }
  .stat-value.red { color: var(--red); }
  /* SECTION HEADER */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    font-family: var(--font-mono);
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  /* FLOW TABLE */
  .flow-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .flow-table th {
    text-align: left;
    padding: 10px 16px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--dim);
    letter-spacing: 1px;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
    background: rgba(255,255,255,0.02);
  }
  .flow-table td {
    padding: 12px 16px;
    font-size: 13px;
    border-bottom: 1px solid rgba(33,38,45,0.6);
    vertical-align: middle;
  }
  .flow-table tr:last-child td { border-bottom: none; }
  .flow-table tr:hover td { background: rgba(255,255,255,0.02); }
  .flow-name { font-family: var(--font-mono); color: var(--text); font-weight: 600; }
  .flow-steps { color: var(--dim); font-size: 12px; }
  .flow-actions { display: flex; gap: 8px; }
  .btn {
    padding: 5px 12px;
    border-radius: 5px;
    border: 1px solid;
    font-size: 12px;
    font-family: var(--font-mono);
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    background: transparent;
  }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-run { color: var(--green); border-color: rgba(63,185,80,0.3); }
  .btn-run:hover:not(:disabled) { background: rgba(63,185,80,0.1); }
  .btn-delete { color: var(--red); border-color: rgba(248,81,73,0.3); }
  .btn-delete:hover:not(:disabled) { background: rgba(248,81,73,0.08); }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-family: var(--font-mono);
    font-weight: 600;
  }
  .badge-pass { background: rgba(63,185,80,0.12); color: var(--green); border: 1px solid rgba(63,185,80,0.25); }
  .badge-fail { background: rgba(248,81,73,0.1); color: var(--red); border: 1px solid rgba(248,81,73,0.2); }
  .badge-running { background: rgba(57,208,216,0.1); color: var(--cyan); border: 1px solid rgba(57,208,216,0.2); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
  /* RUNS TABLE */
  .runs-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .runs-table th {
    text-align: left;
    padding: 10px 16px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--dim);
    letter-spacing: 1px;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
    background: rgba(255,255,255,0.02);
  }
  .runs-table td {
    padding: 10px 16px;
    font-size: 12.5px;
    font-family: var(--font-mono);
    border-bottom: 1px solid rgba(33,38,45,0.6);
    color: var(--muted);
  }
  .runs-table tr:last-child td { border-bottom: none; }
  /* LIVE LOG */
  .log-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    height: 360px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .log-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: rgba(255,255,255,0.02);
  }
  .log-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dim); }
  .log-dot.active { background: var(--green); box-shadow: 0 0 6px rgba(63,185,80,0.5); animation: pulse 1.2s ease-in-out infinite; }
  .log-title { font-family: var(--font-mono); font-size: 12px; color: var(--muted); }
  .log-clear { margin-left: auto; font-size: 11px; color: var(--dim); cursor: pointer; }
  .log-clear:hover { color: var(--muted); }
  .log-body {
    flex: 1;
    padding: 12px 16px;
    overflow-y: auto;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.7;
    color: var(--muted);
  }
  .log-line { padding: 1px 0; }
  .log-pass { color: var(--green); }
  .log-fail { color: var(--red); }
  .log-info { color: var(--cyan); }
  .log-step { color: var(--text); }
  /* CHAT */
  .chat-container {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 170px);
  }
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 16px;
  }
  .chat-msg {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .chat-role {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--dim);
    min-width: 52px;
    padding-top: 10px;
    flex-shrink: 0;
  }
  .chat-role.ghost { color: var(--cyan); }
  .chat-bubble {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    line-height: 1.65;
    color: var(--text);
    white-space: pre-wrap;
    max-width: 720px;
  }
  .chat-bubble.ghost {
    background: rgba(57,208,216,0.06);
    border-color: rgba(57,208,216,0.2);
  }
  .chat-input-row {
    display: flex;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .chat-input {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .chat-input:focus { border-color: rgba(57,208,216,0.5); }
  .chat-send {
    padding: 10px 18px;
    background: rgba(57,208,216,0.1);
    border: 1px solid rgba(57,208,216,0.3);
    border-radius: 8px;
    color: var(--cyan);
    font-family: var(--font-mono);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .chat-send:hover { background: rgba(57,208,216,0.18); }
  .chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
  /* Scrollbars */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
  /* Empty state */
  .empty {
    padding: 40px;
    text-align: center;
    color: var(--dim);
    font-family: var(--font-mono);
    font-size: 13px;
  }
</style>
</head>
<body>
<nav>
  <span class="nav-logo">\u{1F47B}</span>
  <span class="nav-title">Ghost<span>Run</span></span>
  <span class="nav-badge" id="version-badge">v\u2014</span>
</nav>
<div class="tabs">
  <div class="tab active" data-tab="flows">Flows</div>
  <div class="tab" data-tab="runs">Run History</div>
  <div class="tab" data-tab="commands">Commands</div>
  <div class="tab" data-tab="chat">Chat</div>
</div>
<div class="main">

  <!-- FLOWS TAB -->
  <div id="tab-flows">
    <div id="stats-row" class="stats-row"></div>
    <div>
      <div class="section-header">
        <span class="section-title">Flows</span>
        <span style="font-size:12px;color:var(--dim);font-family:var(--font-mono);" id="flow-count"></span>
      </div>
      <table class="flow-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Steps</th>
            <th>Last Run</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="flow-tbody"></tbody>
      </table>
    </div>
    <div>
      <div class="section-header">
        <span class="section-title">Live Log</span>
      </div>
      <div class="log-container">
        <div class="log-header">
          <div class="log-dot" id="log-dot"></div>
          <span class="log-title" id="log-status">Idle</span>
          <span class="log-clear" onclick="clearLog()">clear</span>
        </div>
        <div class="log-body" id="log-body"><div class="log-line" style="color:var(--dim)">\u2014 waiting for a run \u2014</div></div>
      </div>
    </div>
  </div>

  <!-- RUNS TAB -->
  <div id="tab-runs" class="panel-hidden">
    <div class="section-header"><span class="section-title">Recent Runs</span></div>
    <table class="runs-table">
      <thead>
        <tr><th>Flow</th><th>Status</th><th>Duration</th><th>Steps</th><th>Date</th></tr>
      </thead>
      <tbody id="runs-tbody"></tbody>
    </table>
  </div>

  <!-- COMMANDS TAB -->
  <div id="tab-commands" class="panel-hidden">
    <div class="section-header"><span class="section-title">CLI Commands</span></div>
    <div class="log-container" style="height:auto;min-height:180px;margin-bottom:16px;">
      <div class="log-header">
        <span class="log-title">Run allowlisted commands through GhostRun</span>
      </div>
      <div style="display:flex;gap:10px;padding:14px;align-items:center;flex-wrap:wrap;">
        <select id="command-select" class="chat-input" style="max-width:220px;"></select>
        <input id="command-args" class="chat-input" placeholder="optional args, e.g. flow-id --output json" />
        <button id="command-run" class="chat-send" onclick="runCommand()">Run</button>
      </div>
      <pre id="command-output" class="log-body" style="height:180px;white-space:pre-wrap;">Select a command and run it.</pre>
    </div>
    <table class="runs-table">
      <thead>
        <tr><th>Command</th><th>Status</th><th>Duration</th><th>When</th><th>Output</th></tr>
      </thead>
      <tbody id="commands-tbody"></tbody>
    </table>
  </div>

  <!-- CHAT TAB -->
  <div id="tab-chat" class="panel-hidden">
    <div class="chat-container">
      <div class="chat-messages" id="chat-messages">
        <div class="chat-msg">
          <span class="chat-role ghost">Ghost \u203A</span>
          <div class="chat-bubble ghost">\u{1F44B} Hi! I'm your GhostRun assistant. Ask me about your flows, run history, or say "run &lt;flow name&gt;" to execute a flow.</div>
        </div>
      </div>
      <div class="chat-input-row">
        <input class="chat-input" id="chat-input" placeholder="Ask anything about your flows..." />
        <button class="chat-send" id="chat-send" onclick="sendChat()">Send</button>
      </div>
    </div>
  </div>
</div>

<script>
// \u2500\u2500\u2500 Tab switching \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const id = t.dataset.tab;
    ['flows','runs','commands','chat'].forEach(tab => {
      const el = document.getElementById('tab-' + tab);
      if (tab === id) el.classList.remove('panel-hidden');
      else el.classList.add('panel-hidden');
    });
    if (id === 'runs') loadRuns();
    if (id === 'commands') loadCommands();
  });
});

// \u2500\u2500\u2500 Load flows \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function loadFlows() {
  const r = await fetch('/api/flows');
  const data = await r.json();
  renderStats(data.stats);
  renderFlows(data.flows);
  document.getElementById('version-badge').textContent = 'v' + data.version;
}

function renderStats(stats) {
  const el = document.getElementById('stats-row');
  el.innerHTML = \`
    <div class="stat-card"><div class="stat-label">Total Flows</div><div class="stat-value cyan">\${stats.flows}</div></div>
    <div class="stat-card"><div class="stat-label">Total Runs</div><div class="stat-value">\${stats.runs}</div></div>
    <div class="stat-card"><div class="stat-label">Passed</div><div class="stat-value green">\${stats.passed}</div></div>
    <div class="stat-card"><div class="stat-label">Failed</div><div class="stat-value red">\${stats.failed}</div></div>
  \`;
}

function renderFlows(flows) {
  const tbody = document.getElementById('flow-tbody');
  document.getElementById('flow-count').textContent = flows.length + ' total';
  if (!flows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No flows yet. Use <code>ghostrun flow:record</code> to create one.</td></tr>';
    return;
  }
  tbody.innerHTML = flows.map(f => \`
    <tr>
      <td><span class="flow-name">\${f.name}</span></td>
      <td><span class="flow-steps">\${f.steps} steps</span></td>
      <td><span style="color:var(--dim);font-size:12px">\${f.lastRun ? timeAgo(f.lastRun) : '\u2014'}</span></td>
      <td id="status-\${f.id}">\${f.lastStatus ? badgeHtml(f.lastStatus) : '<span style="color:var(--dim)">\u2014</span>'}</td>
      <td>
        <div class="flow-actions">
          <button class="btn btn-run" id="run-btn-\${f.id}" onclick="runFlow('\${f.id}','\${f.name}')">\u25B6 Run</button>
          <button class="btn btn-delete" onclick="deleteFlow('\${f.id}','\${f.name}')">\u2715</button>
        </div>
      </td>
    </tr>
  \`).join('');
}

// \u2500\u2500\u2500 Commands tab \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function loadCommands() {
  const r = await fetch('/api/commands');
  const data = await r.json();
  const select = document.getElementById('command-select');
  select.innerHTML = data.allowed.map(cmd => '<option value="' + cmd + '">' + cmd + '</option>').join('');
  renderCommandHistory(data.history);
}

function renderCommandHistory(history) {
  const tbody = document.getElementById('commands-tbody');
  window.__commandHistory = history;
  if (!history.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No dashboard commands run yet.</td></tr>';
    return;
  }
  tbody.innerHTML = history.map(item => \`
    <tr>
      <td>\${item.command} \${(item.args || []).join(' ')}</td>
      <td>\${badgeHtml(item.status)}</td>
      <td>\${item.duration ? item.duration + 'ms' : '\u2014'}</td>
      <td>\${item.startedAt ? timeAgo(item.startedAt) : '\u2014'}</td>
      <td><button class="btn btn-run" onclick="showCommandOutput('\${item.id}')">Output</button></td>
    </tr>
  \`).join('');
}

async function runCommand() {
  const command = document.getElementById('command-select').value;
  const argsText = document.getElementById('command-args').value.trim();
  const button = document.getElementById('command-run');
  button.disabled = true;
  document.getElementById('command-output').textContent = 'Running ' + command + (argsText ? ' ' + argsText : '') + '...';
  try {
    const r = await fetch('/api/commands/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command, args: argsText ? argsText.split(/\\s+/) : [] })
    });
    const data = await r.json();
    document.getElementById('command-output').textContent = data.output || data.error || '(no output)';
    await loadCommands();
  } catch (err) {
    document.getElementById('command-output').textContent = 'Error: ' + err.message;
  }
  button.disabled = false;
}

function showCommandOutput(id) {
  const item = (window.__commandHistory || []).find(x => x.id === id);
  document.getElementById('command-output').textContent = item ? item.output : '(not found)';
}

function badgeHtml(status) {
  if (status === 'passed') return '<span class="badge badge-pass">\u2713 passed</span>';
  if (status === 'failed') return '<span class="badge badge-fail">\u2717 failed</span>';
  if (status === 'running') return '<span class="badge badge-running">\u27F3 running</span>';
  return \`<span style="color:var(--dim)">\${status}</span>\`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h/24) + 'd ago';
}

// \u2500\u2500\u2500 Run a flow \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let activeRun = null;
async function runFlow(id, name) {
  const btn = document.getElementById('run-btn-' + id);
  const statusEl = document.getElementById('status-' + id);
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.innerHTML = badgeHtml('running');
  clearLog();
  appendLog('info', '\u25B6 Starting: ' + name);
  document.getElementById('log-dot').classList.add('active');
  document.getElementById('log-status').textContent = 'Running: ' + name;

  const es = new EventSource('/api/run?id=' + id);
  activeRun = es;
  es.addEventListener('log', e => {
    const d = JSON.parse(e.data);
    appendLog(d.type || 'step', d.message);
  });
  es.addEventListener('done', e => {
    const d = JSON.parse(e.data);
    appendLog(d.passed ? 'pass' : 'fail',
      d.passed ? '\u2713 Flow passed (' + d.duration + 'ms)' : '\u2717 Flow failed: ' + (d.error || 'unknown'));
    if (statusEl) statusEl.innerHTML = badgeHtml(d.passed ? 'passed' : 'failed');
    if (btn) btn.disabled = false;
    document.getElementById('log-dot').classList.remove('active');
    document.getElementById('log-status').textContent = d.passed ? '\u2713 Passed' : '\u2717 Failed';
    es.close();
    activeRun = null;
    loadFlows();
  });
  es.addEventListener('error', () => {
    appendLog('fail', '\u2717 Connection lost');
    if (btn) btn.disabled = false;
    document.getElementById('log-dot').classList.remove('active');
    document.getElementById('log-status').textContent = 'Error';
    es.close();
    activeRun = null;
  });
}

// \u2500\u2500\u2500 Delete flow \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function deleteFlow(id, name) {
  if (!confirm('Delete flow "' + name + '"?')) return;
  await fetch('/api/flows/' + id, { method: 'DELETE' });
  loadFlows();
}

// \u2500\u2500\u2500 Load runs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function loadRuns() {
  const r = await fetch('/api/runs');
  const runs = await r.json();
  const tbody = document.getElementById('runs-tbody');
  if (!runs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No runs yet.</td></tr>';
    return;
  }
  tbody.innerHTML = runs.map(r => \`
    <tr>
      <td>\${r.flowName || r.flowId}</td>
      <td>\${badgeHtml(r.status)}</td>
      <td>\${r.duration ? r.duration + 'ms' : '\u2014'}</td>
      <td>\${r.stepsTotal || '\u2014'}</td>
      <td>\${r.createdAt ? timeAgo(r.createdAt) : '\u2014'}</td>
    </tr>
  \`).join('');
}

// \u2500\u2500\u2500 Log helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function appendLog(type, msg) {
  const body = document.getElementById('log-body');
  const line = document.createElement('div');
  line.className = 'log-line' + (type === 'pass' ? ' log-pass' : type === 'fail' ? ' log-fail' : type === 'info' ? ' log-info' : ' log-step');
  line.textContent = msg;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}
function clearLog() {
  document.getElementById('log-body').innerHTML = '';
  document.getElementById('log-dot').classList.remove('active');
  document.getElementById('log-status').textContent = 'Idle';
}

// \u2500\u2500\u2500 Chat \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

async function sendChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  sendBtn.disabled = true;

  addChatMsg('you', text);
  const ghostEl = addChatMsg('ghost', '\u2026');

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await r.json();
    ghostEl.textContent = data.reply || '(no response)';
    if (data.runResult) {
      const line = document.createElement('div');
      line.style.cssText = 'margin-top:8px;font-size:11px;font-family:var(--font-mono);color:' + (data.runResult.passed ? 'var(--green)' : 'var(--red)');
      line.textContent = data.runResult.passed ? '\u2713 Flow passed (' + data.runResult.duration + 'ms)' : '\u2717 Flow failed';
      ghostEl.appendChild(line);
    }
  } catch (err) {
    ghostEl.textContent = 'Error: ' + err.message;
  }
  sendBtn.disabled = false;
}

function addChatMsg(role, text) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = '<span class="chat-role ' + (role === 'ghost' ? 'ghost' : '') + '">' + (role === 'ghost' ? 'Ghost \u203A' : 'You   \u203A') + '</span>' +
    '<div class="chat-bubble ' + (role === 'ghost' ? 'ghost' : '') + '"></div>';
  const bubble = div.querySelector('.chat-bubble');
  bubble.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

// \u2500\u2500\u2500 Init \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
loadFlows();
setInterval(loadFlows, 10000); // refresh every 10s
</script>
</body>
</html>`;
  function parseJsonBody(req) {
    return new Promise((resolve3, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
        if (body.length > 64e3) {
          reject(new Error("Request body too large"));
          req.destroy();
        }
      });
      req.on("end", () => {
        try {
          resolve3(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on("error", reject);
    });
  }
  function normalizeDashboardCommand(command, args2) {
    let normalizedCommand = command.trim();
    let normalizedArgs = args2.map((a) => String(a).trim()).filter(Boolean);
    if (normalizedCommand === "store:list") {
      normalizedCommand = "store";
      normalizedArgs = ["list", ...normalizedArgs];
    }
    if (normalizedCommand === "run:list") {
      normalizedCommand = "report";
      normalizedArgs = ["list", ...normalizedArgs];
    }
    if (normalizedCommand === "schedule:list") {
      normalizedCommand = "monitor";
      normalizedArgs = ["schedule", "list", ...normalizedArgs];
    }
    if (!allowedDashboardCommands.has(normalizedCommand)) {
      throw new Error(`Command is not allowed from the dashboard: ${command}`);
    }
    if (normalizedCommand === "store" && normalizedArgs[0] !== "list") {
      throw new Error("Only `store list` is allowed from the dashboard.");
    }
    if (normalizedCommand === "run" && normalizedArgs.length === 0) {
      throw new Error("Run requires a flow ID or name.");
    }
    if (normalizedArgs.length > 8) {
      throw new Error("Too many arguments.");
    }
    for (const arg of normalizedArgs) {
      if (!/^[\w:./=@-]+$/.test(arg)) {
        throw new Error(`Argument contains unsupported characters: ${arg}`);
      }
    }
    return { command: normalizedCommand, args: normalizedArgs };
  }
  function runDashboardCommand(command, args2) {
    const normalized = normalizeDashboardCommand(command, args2);
    const record = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      command: normalized.command === "store" && normalized.args[0] === "list" ? "store:list" : normalized.command,
      args: normalized.command === "store" && normalized.args[0] === "list" ? normalized.args.slice(1) : normalized.args,
      status: "running",
      exitCode: null,
      duration: null,
      output: "",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      completedAt: null
    };
    commandHistory.unshift(record);
    commandHistory.splice(50);
    return new Promise((resolve3) => {
      const started = Date.now();
      const child = spawn(process.execPath, [process.argv[1], normalized.command, ...normalized.args], {
        cwd: process.cwd(),
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.on("error", (err) => {
        record.status = "failed";
        record.exitCode = 1;
        record.duration = Date.now() - started;
        record.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        record.output = err.message;
        resolve3(record);
      });
      child.on("close", (code) => {
        record.exitCode = code;
        record.status = code === 0 ? "passed" : "failed";
        record.duration = Date.now() - started;
        record.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        record.output = output.slice(-2e4);
        resolve3(record);
      });
    });
  }
  const server = http2.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const path5 = url.pathname;
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "GET" && path5 === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DASHBOARD_HTML);
      return;
    }
    if (req.method === "GET" && path5 === "/api/flows") {
      const flows = db.listFlows();
      const runs = db.listRuns(void 0, 500);
      const lastRunMap = {};
      for (const r of runs) {
        if (!lastRunMap[r.flowId]) lastRunMap[r.flowId] = r;
      }
      const flowData = flows.map((f) => {
        const lastRun = lastRunMap[f.id];
        const steps = (() => {
          try {
            return JSON.parse(f.graph || "{}").nodes?.length ?? 0;
          } catch {
            return 0;
          }
        })();
        return {
          id: f.id,
          name: f.name,
          steps,
          lastRun: lastRun?.createdAt,
          lastStatus: lastRun?.status
        };
      });
      const passed = runs.filter((r) => r.status === "passed").length;
      const failed = runs.filter((r) => r.status === "failed").length;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        flows: flowData,
        stats: { flows: flows.length, runs: runs.length, passed, failed },
        version: "1.0.0"
      }));
      return;
    }
    if (req.method === "DELETE" && path5.startsWith("/api/flows/")) {
      const id = path5.replace("/api/flows/", "");
      try {
        db.deleteFlow(id);
        res.writeHead(200);
        res.end('{"ok":true}');
      } catch {
        res.writeHead(404);
        res.end('{"error":"not found"}');
      }
      return;
    }
    if (req.method === "GET" && path5 === "/api/runs") {
      const flows = db.listFlows();
      const flowMap = {};
      flows.forEach((f) => {
        flowMap[f.id] = f.name;
      });
      const runs = db.listRuns(void 0, 100);
      const runsWithName = runs.map((r) => ({ ...r, flowName: flowMap[r.flowId] || r.flowId }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(runsWithName));
      return;
    }
    if (req.method === "GET" && path5 === "/api/commands") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        allowed: ["status", "flow:list", "run:list", "env:list", "suite:list", "schedule:list", "perf:list", "scrape:list", "store:list", "run"],
        history: commandHistory
      }));
      return;
    }
    if (req.method === "POST" && path5 === "/api/commands/run") {
      try {
        const body = await parseJsonBody(req);
        const command = String(body.command || "");
        const args2 = Array.isArray(body.args) ? body.args.map(String) : [];
        const result = await runDashboardCommand(command, args2);
        res.writeHead(result.status === "passed" ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (req.method === "GET" && path5 === "/api/run") {
      let sendEvent = function(event, data) {
        res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
      };
      const flowId = url.searchParams.get("id");
      if (!flowId) {
        res.writeHead(400);
        res.end("Missing id");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      const flow = db.getFlow(flowId);
      if (!flow) {
        sendEvent("done", { passed: false, error: "Flow not found", duration: 0 });
        res.end();
        return;
      }
      const startTime = Date.now();
      try {
        const parsedGraph = JSON.parse(flow.graph || "{}");
        const nodes = parsedGraph.nodes || [];
        sendEvent("log", { type: "info", message: `Flow: ${flow.name} (${nodes.length} steps)` });
        const result = await executeFlow(flowId, void 0, {
          onStep: (stepIdx, action, selector) => {
            sendEvent("log", { type: "step", message: `  [${stepIdx + 1}] ${action}${selector ? " \u2192 " + selector : ""}` });
          },
          onError: (msg) => {
            sendEvent("log", { type: "fail", message: "  \u2717 " + msg });
          }
        });
        sendEvent("done", { passed: result.passed, duration: result.duration, error: result.error });
      } catch (err) {
        sendEvent("done", { passed: false, error: err.message, duration: Date.now() - startTime });
      }
      res.end();
      return;
    }
    if (req.method === "POST" && path5 === "/api/chat") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const { message } = JSON.parse(body);
          const flows = db.listFlows();
          const runs = db.listRuns(void 0, 20);
          const runMatch = message.toLowerCase().match(/^run\s+(.+)$/);
          if (runMatch) {
            const query = runMatch[1].trim().toLowerCase();
            const found = flows.find((f) => f.name.toLowerCase().includes(query) || f.id === query);
            if (found) {
              try {
                const result = await executeFlow(found.id);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                  reply: `Running "${found.name}"...`,
                  runResult: { passed: result.passed, duration: result.duration, error: result.error }
                }));
              } catch (err) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ reply: `Error running flow: ${err.message}`, runResult: { passed: false } }));
              }
              return;
            }
          }
          const flowList = flows.map((f) => `- ${f.name} (id: ${f.id})`).join("\n");
          const recentRuns = runs.slice(0, 10).map((r) => {
            const f = flows.find((fl) => fl.id === r.flowId);
            return `- ${f?.name || r.flowId}: ${r.status} (${r.duration}ms) at ${r.startedAt}`;
          }).join("\n");
          const systemPrompt = `You are GhostRun's assistant. GhostRun is a browser automation CLI tool.
Current flows:
${flowList || "(none)"}
Recent runs:
${recentRuns || "(none)"}
Answer briefly and helpfully. To run a flow, the user can type "run <flow-name>".`;
          let reply = "";
          try {
            const ollamaRes = await fetch("http://localhost:11434/api/chat", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                model: "gemma3:4b",
                stream: false,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: message }
                ]
              }),
              signal: AbortSignal.timeout(getOllamaTimeoutMs(15e3))
            });
            const d = await ollamaRes.json();
            reply = d.message?.content || "(no response)";
          } catch {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (apiKey) {
              try {
                const Anthropic = (await import("@anthropic-ai/sdk")).default;
                const client = new Anthropic({ apiKey });
                const msg = await client.messages.create({
                  model: "claude-3-5-haiku-20241022",
                  max_tokens: 512,
                  system: systemPrompt,
                  messages: [{ role: "user", content: message }]
                });
                reply = msg.content[0].text || "(no response)";
              } catch {
                reply = "AI is not available. Install Ollama: https://ollama.ai";
              }
            } else {
              reply = "AI is not available. Install Ollama (https://ollama.ai) or set ANTHROPIC_API_KEY.";
            }
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ reply }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });
  server.listen(port, () => {
    printLogo();
    divider();
    console.log(import_chalk.default.bold(`
  Dashboard running at: `) + import_chalk.default.cyan(`http://localhost:${port}`));
    console.log(import_chalk.default.gray("  Press Ctrl+C to stop.\n"));
  });
  process.on("SIGINT", () => {
    console.log("\n  Stopping...");
    server.close();
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
  const humanFlows = flows.filter((f) => f.createdBy === "human").length;
  const agentFlows = flows.filter((f) => f.createdBy === "agent").length;
  console.log(import_chalk.default.bold("\n  Statistics\n"));
  const creatorStr = flows.length > 0 ? import_chalk.default.gray(" (") + import_chalk.default.blue(`${humanFlows} \u{1F464}`) + import_chalk.default.gray(" \xB7 ") + import_chalk.default.magenta(`${agentFlows} \u{1F916}`) + import_chalk.default.gray(")") : "";
  console.log("  " + import_chalk.default.gray("Flows:        ") + import_chalk.default.white(String(flows.length)) + creatorStr);
  console.log("  " + import_chalk.default.gray("Total Runs:   ") + import_chalk.default.white(String(runs.length)));
  console.log("  " + import_chalk.default.gray("Passed:       ") + import_chalk.default.green(String(passed)));
  console.log("  " + import_chalk.default.gray("Failed:       ") + import_chalk.default.red(String(failed)));
  if (runs.length > 0) {
    const rate = Math.round(passed / runs.length * 100);
    const rateColor = rate >= 80 ? import_chalk.default.green : rate >= 50 ? import_chalk.default.yellow : import_chalk.default.red;
    const bar = progressBar(passed, runs.length, 16);
    console.log("  " + import_chalk.default.gray("Success Rate: ") + rateColor(`${rate}%`) + import_chalk.default.gray("  ") + bar);
  }
  if (runs.length > 0) {
    const recent = runs.slice(0, 10).reverse();
    const spark = recent.map((r) => r.status === "passed" ? import_chalk.default.green("\u25AA") : import_chalk.default.red("\u25AA")).join("");
    console.log("  " + import_chalk.default.gray("Last 10 runs: ") + spark);
  }
  console.log();
  console.log("  " + import_chalk.default.gray("Data Path:    ") + import_chalk.default.white(DATA_PATH2));
  console.log("  " + import_chalk.default.gray("Project Path: ") + import_chalk.default.white(PROJECT_GHOSTRUN_PATH));
  console.log("  " + import_chalk.default.gray("Mode:         ") + import_chalk.default.white(getInteractionMode()));
  console.log("  " + import_chalk.default.gray("Profile:      ") + import_chalk.default.white(readConfig().activeProfile || "(none)"));
  console.log("  " + import_chalk.default.gray("Auto-improve: ") + import_chalk.default.white(readConfig().policies?.autoImproveEnabled ? "enabled" : "disabled"));
  console.log("  " + import_chalk.default.gray("Loop Guard:   ") + import_chalk.default.white(`iter=${readConfig().policies?.maxAutoImproveIterations ?? 3}, repeats=${readConfig().policies?.maxSameFailureRepeats ?? 2}`));
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
async function runAiStatus() {
  printLogo();
  divider();
  ensureProjectWorkspace();
  const config = readConfig();
  const ollamaModel = await isOllamaRunning();
  const provider = ollamaModel ? `Ollama (${ollamaModel})` : process.env.ANTHROPIC_API_KEY ? "Anthropic" : "none";
  const usage = aggregateAiUsage();
  console.log(import_chalk.default.bold("\n  AI Status\n"));
  console.log("  " + import_chalk.default.gray("Interaction:  ") + import_chalk.default.white(config.interactionMode || "assist"));
  console.log("  " + import_chalk.default.gray("Configured:   ") + import_chalk.default.white(config.ai?.provider || "auto"));
  console.log("  " + import_chalk.default.gray("Available:    ") + (provider === "none" ? import_chalk.default.gray(provider) : import_chalk.default.green(provider)));
  console.log("  " + import_chalk.default.gray("Track Usage:  ") + import_chalk.default.white(config.ai?.trackUsage === false ? "no" : "yes"));
  console.log("  " + import_chalk.default.gray("Store Logs:   ") + import_chalk.default.white(config.ai?.storeSanitizedTranscripts === false ? "no" : "yes"));
  console.log("  " + import_chalk.default.gray("CI Policy:    ") + import_chalk.default.white(config.policies?.allowAiInCi || "summary-only"));
  console.log("  " + import_chalk.default.gray("Sessions:     ") + import_chalk.default.white(String(usage.calls)));
  console.log("  " + import_chalk.default.gray("Tokens:       ") + import_chalk.default.white(String(usage.totalTokens)));
  console.log();
}
async function runAiUsage() {
  printLogo();
  divider();
  ensureProjectWorkspace();
  const usage = aggregateAiUsage();
  console.log(import_chalk.default.bold("\n  AI Usage\n"));
  console.log(`  Calls:         ${import_chalk.default.white(String(usage.calls))}`);
  console.log(`  Input tokens:  ${import_chalk.default.white(String(usage.inputTokens))}`);
  console.log(`  Output tokens: ${import_chalk.default.white(String(usage.outputTokens))}`);
  console.log(`  Total tokens:  ${import_chalk.default.white(String(usage.totalTokens))}`);
  if (usage.estimatedCostUsd > 0) {
    console.log(`  Est. cost:     ${import_chalk.default.white("$" + usage.estimatedCostUsd.toFixed(4))}`);
  }
  const providerKeys = Object.keys(usage.byProvider);
  if (providerKeys.length > 0) {
    console.log(import_chalk.default.bold("\n  By Provider\n"));
    for (const key of providerKeys) {
      const row = usage.byProvider[key];
      console.log(`  ${import_chalk.default.cyan(key.padEnd(30))} ${import_chalk.default.white(String(row.calls).padStart(4))} calls  ${import_chalk.default.gray(String(row.totalTokens) + " tokens")}`);
    }
  }
  console.log();
}
async function runAiSessions(limitArg) {
  printLogo();
  divider();
  ensureProjectWorkspace();
  const limit = limitArg ? Math.max(1, parseInt(limitArg, 10) || 10) : 10;
  const sessions = listAiSessions(limit);
  console.log(import_chalk.default.bold(`
  AI Sessions (${sessions.length})
`));
  if (sessions.length === 0) {
    warn("No AI sessions recorded yet.");
    console.log();
    return;
  }
  for (const session of sessions) {
    console.log(`  ${import_chalk.default.gray(session.id.slice(0, 8))}  ${import_chalk.default.cyan(session.mode.padEnd(10))}  ${import_chalk.default.white(session.provider.padEnd(10))}  ${import_chalk.default.gray(session.model)}  ${import_chalk.default.white(String(session.usage.totalTokens || 0).padStart(6))} tok  ${import_chalk.default.gray(timeAgo(session.timestamp))}`);
    console.log(`           ${import_chalk.default.gray(session.promptPreview.slice(0, 120).replace(/\s+/g, " "))}`);
  }
  console.log();
}
async function runConfigMode(mode) {
  const config = readConfig();
  if (!mode) {
    printLogo();
    divider();
    console.log(import_chalk.default.bold("\n  Interaction Mode\n"));
    console.log("  " + import_chalk.default.white(config.interactionMode || "assist"));
    console.log();
    return;
  }
  if (mode !== "assist" && mode !== "auto") {
    errorMsg('Mode must be "assist" or "auto"');
    process.exit(1);
  }
  config.interactionMode = mode;
  writeConfig(config, "project");
  success(`Interaction mode set to: ${mode}`);
}
async function runProfileList() {
  printLogo();
  divider();
  const config = readConfig();
  const profiles = listProfiles();
  console.log(import_chalk.default.bold(`
  Profiles (${profiles.length})
`));
  if (profiles.length === 0) {
    warn("No profiles found. Create one: ghostrun profile create staging https://staging.example.com");
    console.log();
    return;
  }
  for (const profile of profiles) {
    const active = config.activeProfile === profile.name ? import_chalk.default.green(" *") : "  ";
    const auth = profile.auth?.strategy || "none";
    const acctCount = listAccountIds(profile).length;
    const acctHint = acctCount > 0 ? import_chalk.default.gray(`  ${acctCount} account(s)`) : "";
    console.log(`  ${import_chalk.default.white(profile.name)}${active}  ${import_chalk.default.gray((profile.baseUrl || "\u2014").padEnd(36).slice(0, 36))}  ${import_chalk.default.cyan(auth)}${acctHint}`);
  }
  console.log();
}
async function runProfileShow(name) {
  printLogo();
  divider();
  const profile = getProfile(name);
  if (!profile) {
    errorMsg("Profile not found: " + name);
    process.exit(1);
  }
  console.log(import_chalk.default.bold(`
  Profile: ${profile.name}
`));
  console.log(`  Base URL: ${import_chalk.default.white(profile.baseUrl || "\u2014")}`);
  console.log(`  Auth:     ${import_chalk.default.white(profile.auth?.strategy || "none")}`);
  if (profile.auth?.loginFlow) console.log(`  Login:    ${import_chalk.default.white(profile.auth.loginFlow)}`);
  if (profile.auth?.storageState) console.log(`  State:    ${import_chalk.default.white(profile.auth.storageState)}`);
  if (profile.auth?.usernameVar) console.log(`  User Var: ${import_chalk.default.white(profile.auth.usernameVar)}`);
  if (profile.auth?.usernameSecret) console.log(`  User Sec: ${import_chalk.default.white(profile.auth.usernameSecret)}`);
  if (profile.auth?.passwordSecret) console.log(`  Pass Sec: ${import_chalk.default.white(profile.auth.passwordSecret)}`);
  if (profile.auth?.tokenSecret) console.log(`  Token:    ${import_chalk.default.white(profile.auth.tokenSecret)}`);
  const accountIds = listAccountIds(profile);
  if (accountIds.length) {
    console.log(import_chalk.default.bold("\n  Accounts:\n"));
    for (const id of accountIds) {
      const acc = getProfileAccount(profile, id);
      const def = profile.defaultAccount === id ? import_chalk.default.green(" (default)") : "";
      console.log(`  ${import_chalk.default.cyan(id)}${def}  ${import_chalk.default.gray(acc.label || "")}`);
      console.log(`    emailVar: ${import_chalk.default.yellow(acc.emailVar || "testEmail")}  passwordSecret: ${import_chalk.default.yellow(acc.passwordSecret)}`);
      if (acc.emailSecret) console.log(`    emailSecret: ${import_chalk.default.yellow(acc.emailSecret)}`);
      if (acc.loginFlow) console.log(`    loginFlow: ${import_chalk.default.white(acc.loginFlow)}`);
    }
    console.log(import_chalk.default.gray("\n  Run: ghostrun run <flow> --profile " + profile.name + " --account <id>"));
  }
  const vars = profile.variables || {};
  console.log(`  Vars:     ${import_chalk.default.white(String(Object.keys(vars).length))}`);
  for (const [key, value] of Object.entries(vars)) {
    console.log(`    ${import_chalk.default.yellow(key)}=${import_chalk.default.gray(value)}`);
  }
  console.log();
}
async function runProfileCreate(name, baseUrl) {
  ensureProjectWorkspace();
  if (getProfile(name)) {
    errorMsg(`Profile already exists: ${name}`);
    process.exit(1);
  }
  const profile = {
    name,
    baseUrl: baseUrl || "",
    variables: {},
    auth: { strategy: "none" },
    metadata: {}
  };
  saveProfile(profile);
  success(`Created profile: ${name}`);
  if (baseUrl) info(`Base URL: ${baseUrl}`);
}
async function runProfileUse(name) {
  const profile = getProfile(name);
  if (!profile) {
    errorMsg("Profile not found: " + name);
    process.exit(1);
  }
  const config = readConfig();
  config.activeProfile = name;
  writeConfig(config, "project");
  success(`Active profile set to: ${name}`);
}
async function runProfileSet(name, key, value) {
  const profile = getProfile(name);
  if (!profile) {
    errorMsg("Profile not found: " + name);
    process.exit(1);
  }
  if (key === "baseUrl") {
    profile.baseUrl = value;
  } else if (key.startsWith("auth.")) {
    profile.auth = profile.auth || {};
    profile.auth[key.slice(5)] = value;
  } else if (key.startsWith("meta.")) {
    profile.metadata = profile.metadata || {};
    profile.metadata[key.slice(5)] = value;
  } else {
    profile.variables = profile.variables || {};
    profile.variables[key] = value;
  }
  saveProfile(profile);
  success(`Updated profile "${name}": ${key}`);
}
async function runProfileDelete(name) {
  const profile = getProfile(name);
  if (!profile) {
    errorMsg("Profile not found: " + name);
    process.exit(1);
  }
  const approved = await confirmAction(`  Delete profile "${import_chalk.default.yellow(name)}"? (y/N) `, false);
  if (!approved) {
    warn("Cancelled.");
    return;
  }
  deleteProfile(name);
  const config = readConfig();
  if (config.activeProfile === name) {
    delete config.activeProfile;
    writeConfig(config, "project");
  }
  success(`Deleted profile: ${name}`);
}
async function runProfileAccountAdd(profileName, accountId, opts) {
  const profile = getProfile(profileName);
  if (!profile) {
    errorMsg("Profile not found: " + profileName);
    process.exit(1);
  }
  const id = normalizeAccountId(accountId);
  const secrets = secretNamesForAccount(id);
  const passSecret = opts.passwordSecret || secrets.password;
  const account = buildAccountFromSecrets({
    id,
    label: opts.label || id,
    email: opts.email,
    emailSecret: opts.emailSecret || secrets.email,
    passwordSecret: passSecret,
    loginFlow: opts.loginFlow
  });
  profile.accounts = profile.accounts || {};
  profile.accounts[id] = account;
  if (opts.default || !profile.defaultAccount) profile.defaultAccount = id;
  if (!profile.auth || profile.auth.strategy === "none") {
    profile.auth = {
      strategy: "form",
      loginFlow: opts.loginFlow || profile.auth?.loginFlow || "login",
      usernameVar: account.emailVar || "testEmail"
    };
  }
  saveProfile(profile);
  success(`Added account "${id}" to profile "${profileName}"`);
  info(`Email var: ${account.emailVar}  \u2192 export ${account.emailSecret}=...`);
  info(`Password:  export ${account.passwordSecret}=...`);
  info(`Run: ghostrun run <flow> --profile ${profileName} --account ${id}`);
}
async function runProfileAccountsList(profileName) {
  const profile = getProfile(profileName);
  if (!profile) {
    errorMsg("Profile not found: " + profileName);
    process.exit(1);
  }
  const ids = listAccountIds(profile);
  console.log(import_chalk.default.bold(`
  Accounts on profile "${profileName}" (${ids.length})
`));
  if (!ids.length) {
    warn("No accounts defined. Add one: ghostrun profile account add staging admin --email qa-admin@co.com");
    console.log();
    return;
  }
  for (const id of ids) {
    const acc = getProfileAccount(profile, id);
    const def = profile.defaultAccount === id ? import_chalk.default.green(" (default)") : "";
    console.log(`  ${import_chalk.default.cyan(id)}${def}  ${import_chalk.default.gray(acc.label || "")}`);
    console.log(`    ${import_chalk.default.yellow(acc.emailVar || "testEmail")}  password: ${import_chalk.default.yellow(acc.passwordSecret)}`);
    if (acc.emailSecret) console.log(`    email env: ${import_chalk.default.yellow(acc.emailSecret)}`);
  }
  console.log();
}
async function runProfileAccountShow(profileName, accountId) {
  const profile = getProfile(profileName);
  if (!profile) {
    errorMsg("Profile not found: " + profileName);
    process.exit(1);
  }
  const acc = getProfileAccount(profile, accountId);
  if (!acc) {
    errorMsg(`Account not found: ${accountId}. Defined: ${listAccountIds(profile).join(", ") || "(none)"}`);
    process.exit(1);
  }
  console.log(import_chalk.default.bold(`
  Account: ${normalizeAccountId(accountId)} (${profileName})
`));
  console.log(JSON.stringify(acc, null, 2));
  console.log();
}
async function setupProfileAccountsInteractive(staging, clack) {
  const { confirm, text, isCancel, note } = clack;
  const addAccounts = await confirm({
    message: "Configure QA accounts (superadmin, admin, manager, guest)?",
    initialValue: true
  });
  if (isCancel(addAccounts) || !addAccounts) return;
  const loginFlow = await text({
    message: "Login flow name (record this first if missing):",
    placeholder: "login",
    defaultValue: "login"
  });
  const flowName = !isCancel(loginFlow) && loginFlow ? String(loginFlow) : "login";
  staging.auth = {
    strategy: "form",
    loginFlow: flowName,
    usernameVar: "testEmail"
  };
  const useDefaults = await confirm({
    message: "Create all four roles now (superadmin, admin, manager, guest)?",
    initialValue: true
  });
  if (!isCancel(useDefaults) && useDefaults) {
    const domain = await text({
      message: "Email domain for QA users:",
      placeholder: "yourapp.com",
      defaultValue: "yourapp.com"
    });
    const emailDomain = !isCancel(domain) && domain ? String(domain) : "yourapp.com";
    staging.accounts = buildDefaultSaaSAccounts(flowName, emailDomain);
    staging.defaultAccount = "manager";
    staging.metadata = { ...staging.metadata, accountTypes: DEFAULT_SAAS_ACCOUNT_IDS.join(",") };
    saveProfile(staging);
    const lines2 = DEFAULT_SAAS_ACCOUNT_IDS.map((id) => {
      const a = staging.accounts[id];
      return `  export ${a.emailSecret}='qa-${id}@${emailDomain}'
  export ${a.passwordSecret}='...'`;
    });
    note(
      `Set passwords (emails are suggested defaults):
${lines2.join("\n")}

Run by role:
  ghostrun run <flow> --profile staging --account superadmin`,
      "Accounts: superadmin, admin, manager, guest"
    );
    return;
  }
  let addMore = true;
  while (addMore) {
    const role = await text({
      message: "Account type id (superadmin, admin, manager, guest, \u2026):",
      placeholder: "manager",
      validate: (v) => !v || !v.trim() ? "Required" : void 0
    });
    if (isCancel(role) || !role) break;
    const id = normalizeAccountId(String(role));
    const email = await text({
      message: `Email for "${id}":`,
      placeholder: `qa-${id}@yourapp.com`,
      validate: (v) => !v || !v.includes("@") ? "Enter a valid email" : void 0
    });
    if (isCancel(email) || !email) break;
    const secrets = secretNamesForAccount(id);
    const account = buildAccountFromSecrets({
      id,
      label: id,
      email: String(email),
      emailSecret: secrets.email,
      passwordSecret: secrets.password,
      loginFlow: flowName
    });
    staging.accounts = staging.accounts || {};
    staging.accounts[id] = account;
    if (!staging.defaultAccount) staging.defaultAccount = id;
    const another = await confirm({ message: "Add another account type?", initialValue: false });
    addMore = !isCancel(another) && !!another;
  }
  saveProfile(staging);
  const lines = listAccountIds(staging).map((id) => {
    const a = staging.accounts[id];
    return `  export ${a.emailSecret}='...'
  export ${a.passwordSecret}='...'`;
  });
  note(
    `Set secrets before running flows:
${lines.join("\n")}

Run as a role:
  ghostrun run checkout --profile staging --account admin`,
    "Multi-account staging"
  );
}
async function runImprove() {
  printLogo();
  divider();
  ensureProjectWorkspace();
  const config = readConfig();
  const runs = db.listRuns(void 0, 50);
  const proposals = listRepairProposals(50);
  const sessions = listAiSessions(50);
  const activeProfile = config.activeProfile;
  const findings = [];
  const actions = [];
  const safeguards = [];
  const repeatedFailures = /* @__PURE__ */ new Map();
  for (const run of runs.filter((r) => r.status === "failed")) {
    const key = (run.errorMessage || "unknown").slice(0, 120);
    repeatedFailures.set(key, (repeatedFailures.get(key) || 0) + 1);
  }
  const maxRepeats = config.policies?.maxSameFailureRepeats ?? 2;
  const repeatedEntries = Array.from(repeatedFailures.entries()).filter(([, count]) => count > 1);
  if (repeatedEntries.length > 0) {
    for (const [message, count] of repeatedEntries.slice(0, 5)) {
      findings.push(`Repeated failure (${count}x): ${message}`);
      if (count >= maxRepeats) safeguards.push(`Same failure exceeded repeat threshold (${maxRepeats}): ${message}`);
    }
  }
  const openProposals = proposals.filter((p) => p.status === "proposed");
  if (openProposals.length > 0) {
    findings.push(`${openProposals.length} open repair proposal(s) available.`);
    actions.push(`Review with: ghostrun repair list`);
  }
  const staleProposals = openProposals.filter((p) => Date.now() - new Date(p.createdAt).getTime() > 7 * 864e5);
  if (staleProposals.length > 0) {
    findings.push(`${staleProposals.length} repair proposal(s) are older than 7 days.`);
    actions.push("Review stale proposals with: ghostrun repair list");
  }
  const neverRunFlows = [];
  const highFailureFlows = [];
  const alwaysPassFlows = [];
  for (const flow of db.listFlows()) {
    const stats = db.getFlowStats(flow.id);
    if (stats.totalRuns === 0) neverRunFlows.push(flow.name);
    else if (stats.totalRuns >= 5 && stats.passRate < 80) {
      highFailureFlows.push({ name: flow.name, rate: stats.passRate, runs: stats.totalRuns });
    } else if (stats.totalRuns >= 10 && stats.passRate === 100) {
      alwaysPassFlows.push(flow.name);
    }
  }
  if (neverRunFlows.length) {
    findings.push(`${neverRunFlows.length} flow(s) have never been run: ${neverRunFlows.slice(0, 5).join(", ")}`);
    actions.push("Add never-run flows to a smoke suite or remove dead assets.");
  }
  if (highFailureFlows.length) {
    for (const item of highFailureFlows.slice(0, 5)) {
      findings.push(`High failure rate (${item.rate.toFixed(0)}% over ${item.runs} runs): ${item.name}`);
    }
    actions.push("Inspect high-failure flows with ghostrun report show and ghostrun repair list");
  }
  if (alwaysPassFlows.length) {
    findings.push(`${alwaysPassFlows.length} flow(s) always pass \u2014 possible coverage gaps: ${alwaysPassFlows.slice(0, 5).join(", ")}`);
  }
  const flakyFlows = detectFlakyFlows();
  if (flakyFlows.length) {
    findings.push(`Flaky flows detected: ${flakyFlows.slice(0, 5).join(", ")}`);
    actions.push("Stabilize flaky flows with stronger waits or isolated setup steps.");
  }
  const aiUsage = aggregateAiUsage();
  const authorSessions = sessions.filter((s) => s.mode === "author" || s.mode === "create");
  if (authorSessions.length >= 5) {
    findings.push(`AI authoring used ${authorSessions.length} times recently (~$${aiUsage.estimatedCostUsd.toFixed(2)} estimated).`);
  }
  if (!activeProfile) {
    findings.push("No active profile is set.");
    actions.push("Create and select a profile for staging or production runs.");
  }
  if (runs.length === 0) {
    findings.push("No runs recorded yet.");
    actions.push("Run a smoke flow before using improve.");
  }
  if (sessions.length === 0) {
    findings.push("No AI sessions recorded yet.");
  }
  const blocked = safeguards.length > 0 && config.policies?.autoImproveEnabled;
  let summary;
  const prompt = [
    "You are improving a local-first test automation project.",
    "Summarize the highest-value next actions in 4 bullet points max.",
    "Do not suggest infinite retry loops.",
    "",
    `Auto improve enabled: ${config.policies?.autoImproveEnabled ? "yes" : "no"}`,
    `Active profile: ${activeProfile || "none"}`,
    `Open repair proposals: ${openProposals.length}`,
    `Recent failed runs: ${runs.filter((r) => r.status === "failed").length}`,
    "",
    "Findings:",
    ...findings.map((f) => `- ${f}`),
    "",
    "Safeguards:",
    ...safeguards.length ? safeguards.map((s) => `- ${s}`) : ["- none"]
  ].join("\n");
  if (config.policies?.autoImproveEnabled && !blocked) {
    const ai = await callAI(prompt, { mode: "improve", metadata: { profile: activeProfile || "", openProposals: String(openProposals.length) } });
    if (ai?.text) summary = ai.text;
  }
  const report = {
    id: (0, import_crypto4.randomUUID)(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: blocked ? "blocked" : "generated",
    autoImproveEnabled: Boolean(config.policies?.autoImproveEnabled),
    interactionMode: getInteractionMode(),
    activeProfile: activeProfile || void 0,
    findings,
    actions,
    summary,
    safeguards
  };
  const reportPath = saveImproveReport(report);
  const markdownPath = path4.join(path4.dirname(reportPath), `${path4.basename(reportPath, ".json")}.md`);
  const markdown = [
    "# GhostRun Improve Report",
    "",
    `- Generated: ${report.createdAt}`,
    `- Profile: ${activeProfile || "(none)"}`,
    `- Open repair proposals: ${openProposals.length}`,
    `- Stale proposals (>7d): ${staleProposals.length}`,
    `- High-failure flows: ${highFailureFlows.length}`,
    `- Never-run flows: ${neverRunFlows.length}`,
    `- Flaky flows: ${flakyFlows.length}`,
    "",
    "## Findings",
    ...findings.length ? findings.map((f) => `- ${f}`) : ["- none"],
    "",
    "## Suggested Actions",
    ...actions.length ? actions.map((a) => `- ${a}`) : ["- none"],
    ...summary ? ["", "## AI Summary", summary] : []
  ].join("\n");
  fs4.writeFileSync(markdownPath, markdown);
  console.log(import_chalk.default.bold("\n  Improve Report\n"));
  console.log(`  Status:     ${blocked ? import_chalk.default.red("blocked") : import_chalk.default.green("generated")}`);
  console.log(`  Profile:    ${import_chalk.default.white(activeProfile || "(none)")}`);
  console.log(`  Open fixes: ${import_chalk.default.white(String(openProposals.length))}`);
  console.log(`  Failures:   ${import_chalk.default.white(String(runs.filter((r) => r.status === "failed").length))}`);
  if (findings.length) {
    console.log(import_chalk.default.bold("\n  Findings"));
    for (const finding of findings) console.log(`  - ${finding}`);
  }
  if (actions.length) {
    console.log(import_chalk.default.bold("\n  Suggested Actions"));
    for (const action of actions) console.log(`  - ${action}`);
  }
  if (summary) {
    console.log(import_chalk.default.bold("\n  AI Summary"));
    for (const line of summary.split("\n")) {
      if (line.trim()) console.log(`  ${line}`);
    }
  }
  if (safeguards.length) {
    console.log(import_chalk.default.bold("\n  Safeguards"));
    for (const s of safeguards) console.log(`  - ${import_chalk.default.yellow(s)}`);
  }
  console.log();
  info(`Saved: ${import_chalk.default.cyan(reportPath)}`);
  info(`Markdown: ${import_chalk.default.cyan(markdownPath)}`);
  console.log();
}
async function runRepairList() {
  printLogo();
  divider();
  const proposals = listRepairProposals(50);
  console.log(import_chalk.default.bold(`
  Repair Proposals (${proposals.length})
`));
  if (proposals.length === 0) {
    warn("No repair proposals found.");
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Type       Status     Flow                       Step  Proposal"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(86)));
  for (const proposal of proposals) {
    const statusColor = proposal.status === "applied" ? import_chalk.default.green : proposal.status === "rejected" ? import_chalk.default.red : import_chalk.default.yellow;
    const repairType = getRepairType(proposal);
    const proposalText = proposal.proposedSelector || proposal.proposedValue || proposal.rationale?.slice(0, 24) || "\u2014";
    console.log(`  ${import_chalk.default.gray(proposal.id.slice(0, 8))}  ${import_chalk.default.white(repairType.padEnd(10))} ${statusColor(proposal.status.padEnd(10))} ${import_chalk.default.white((proposal.flowName || "").padEnd(26).slice(0, 26))} ${import_chalk.default.gray(String(proposal.stepNumber || "\u2014").padStart(4))}  ${import_chalk.default.cyan(String(proposalText).slice(0, 26))}`);
  }
  console.log();
}
async function runRepairShow(id) {
  printLogo();
  divider();
  const found = findRepairProposal(id);
  if (!found) {
    errorMsg("Repair proposal not found: " + id);
    process.exit(1);
  }
  const proposal = found.proposal;
  const repairType = getRepairType(proposal);
  console.log(import_chalk.default.bold(`
  Repair Proposal: ${proposal.id.slice(0, 8)}
`));
  console.log(`  Type:      ${import_chalk.default.white(repairType)}`);
  console.log(`  Flow:      ${import_chalk.default.white(proposal.flowName)}`);
  console.log(`  Status:    ${import_chalk.default.white(proposal.status)}`);
  console.log(`  Step:      ${import_chalk.default.white(String(proposal.stepNumber || "\u2014"))}`);
  console.log(`  Action:    ${import_chalk.default.white(proposal.action || "\u2014")}`);
  if (proposal.currentSelector) console.log(`  Selector:  ${import_chalk.default.gray(proposal.currentSelector)} \u2192 ${import_chalk.default.cyan(proposal.proposedSelector || "\u2014")}`);
  if (proposal.currentValue || proposal.proposedValue) {
    console.log(`  Value:     ${import_chalk.default.gray(proposal.currentValue || "\u2014")} \u2192 ${import_chalk.default.cyan(proposal.proposedValue || "\u2014")}`);
  }
  if (proposal.errorMessage) console.log(`  Error:     ${import_chalk.default.red(proposal.errorMessage)}`);
  if (proposal.rationale) console.log(`  Why:       ${import_chalk.default.gray(proposal.rationale)}`);
  if (proposal.runId) console.log(`  Run:       ${import_chalk.default.gray(proposal.runId.slice(0, 8))}`);
  console.log();
}
function applyRepairProposal(id, mode = "interactive") {
  const found = findRepairProposal(id);
  if (!found) return { ok: false, message: `Repair proposal not found: ${id}` };
  const proposal = found.proposal;
  if (!proposal.flowId || !proposal.nodeId) {
    return { ok: false, message: "Repair proposal is missing flow or node information." };
  }
  const repairType = getRepairType(proposal);
  if (repairType === "config" || repairType === "url" || repairType === "visual") {
    if (repairType === "visual") {
      updateRepairProposal(proposal.id, {
        status: "applied",
        rationale: `${proposal.rationale || ""} Acknowledged \u2014 re-run ghostrun baseline:set after UI changes.`
      });
      return {
        ok: true,
        message: `Visual proposal acknowledged. Re-capture baselines: ghostrun baseline:set "${proposal.flowName}"`,
        flowName: proposal.flowName
      };
    }
    return {
      ok: false,
      message: repairType === "url" ? "URL/config repairs must be applied manually to the profile or flow URL." : "Configuration repairs must be applied manually."
    };
  }
  const flow = db.getFlow(proposal.flowId);
  if (!flow) return { ok: false, message: "Flow not found for proposal." };
  let graph;
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    return { ok: false, message: "Flow graph is invalid." };
  }
  const node = graph.nodes.find((n) => String(n.id) === proposal.nodeId);
  if (!node) return { ok: false, message: "Target node not found in flow." };
  switch (repairType) {
    case "selector":
      if (!proposal.proposedSelector) return { ok: false, message: "Selector repair proposal is incomplete." };
      node.selector = proposal.proposedSelector;
      break;
    case "assertion":
      if (!proposal.proposedValue) return { ok: false, message: "Assertion repair proposal is incomplete." };
      node.value = proposal.proposedValue;
      break;
    case "wait":
      node.action = "wait:ms";
      node.value = proposal.proposedValue || "20000";
      break;
    default:
      return { ok: false, message: `Unsupported repair type: ${repairType}` };
  }
  db.updateFlow(flow.id, { graph });
  const rationale = proposal.rationale ? `${proposal.rationale} ${mode === "auto" ? "Auto-applied by GhostRun after policy and loop-guard checks." : "Applied by user review."}` : mode === "auto" ? "Auto-applied by GhostRun after policy and loop-guard checks." : "Applied by user review.";
  updateRepairProposal(proposal.id, { status: "applied", rationale });
  return { ok: true, message: `Applied ${repairType} repair proposal to flow "${flow.name}"`, flowName: flow.name };
}
function applySelectorRepairProposal(id, mode = "interactive") {
  return applyRepairProposal(id, mode);
}
function autoApplySelectorRepairProposal(proposal, context) {
  const config = readConfig();
  const interactionMode = getInteractionMode();
  if (!config.policies?.allowAutoRepairApply) {
    return { applied: false, reason: "config disallows auto-apply" };
  }
  if (interactionMode !== "auto") {
    return { applied: false, reason: "interaction mode is assist" };
  }
  if (context.ci) {
    return { applied: false, reason: "CI mode forbids flow mutation" };
  }
  if (isProductionLike(context.profile, context.startUrl)) {
    return { applied: false, reason: "production-like targets require review" };
  }
  if (!proposal.flowId || !proposal.nodeId || !proposal.proposedSelector) {
    return { applied: false, reason: "proposal is incomplete" };
  }
  if (context.currentSelector && proposal.currentSelector && context.currentSelector !== proposal.currentSelector) {
    return { applied: false, reason: "flow selector changed after proposal creation" };
  }
  const attemptCount = getSelectorRepairAttemptCount({ flowId: proposal.flowId, nodeId: proposal.nodeId });
  const maxAttempts = config.policies?.maxRepairAttemptsPerRun ?? 2;
  if (attemptCount >= maxAttempts) {
    return { applied: false, reason: `selector repair attempt limit reached (${maxAttempts})` };
  }
  const repeatCount = getRecentFailureRepeatCount(proposal.flowId, proposal.errorMessage || "");
  const maxRepeats = config.policies?.maxSameFailureRepeats ?? 2;
  if (repeatCount >= maxRepeats) {
    return { applied: false, reason: `same failure repeat limit reached (${maxRepeats})` };
  }
  const result = applySelectorRepairProposal(proposal.id, "auto");
  return result.ok ? { applied: true } : { applied: false, reason: result.message };
}
async function runRepairApply(id) {
  const found = findRepairProposal(id);
  if (!found) {
    errorMsg("Repair proposal not found: " + id);
    process.exit(1);
  }
  const proposal = found.proposal;
  const repairType = getRepairType(proposal);
  if (!proposal.flowId || !proposal.nodeId) {
    errorMsg("Repair proposal is missing flow or node information.");
    process.exit(1);
  }
  const flow = db.getFlow(proposal.flowId);
  if (!flow) {
    errorMsg("Flow not found for proposal.");
    process.exit(1);
  }
  console.log(import_chalk.default.bold(`
  Apply Repair Proposal ${proposal.id.slice(0, 8)}
`));
  console.log(`  Type:     ${import_chalk.default.white(repairType)}`);
  console.log(`  Flow:     ${import_chalk.default.white(flow.name)}`);
  if (proposal.proposedSelector) {
    console.log(`  Selector: ${import_chalk.default.gray(proposal.currentSelector || "\u2014")} \u2192 ${import_chalk.default.cyan(proposal.proposedSelector)}`);
  }
  if (proposal.proposedValue) {
    console.log(`  Value:    ${import_chalk.default.gray(proposal.currentValue || "\u2014")} \u2192 ${import_chalk.default.cyan(proposal.proposedValue)}`);
  }
  if (repairType === "url" || repairType === "config") {
    warn("This proposal must be applied manually to the profile or flow URL.");
    if (proposal.rationale) console.log(import_chalk.default.gray(`  Hint: ${proposal.rationale}`));
    return;
  }
  if (repairType === "visual") {
    console.log(import_chalk.default.bold(`
  Visual Regression Proposal ${proposal.id.slice(0, 8)}
`));
    console.log(`  Flow:     ${import_chalk.default.white(flow.name)}`);
    console.log(`  Diff:     ${import_chalk.default.yellow(proposal.currentValue || "\u2014")}`);
    console.log(import_chalk.default.gray(`  ${proposal.proposedValue || "Run ghostrun baseline:set after intentional UI changes."}`));
    const approved2 = await confirmAction(import_chalk.default.cyan("  Acknowledge and mark applied? (Y/n) "), true);
    if (!approved2) {
      warn("Cancelled.");
      return;
    }
    const result2 = applyRepairProposal(proposal.id, "interactive");
    if (!result2.ok) {
      errorMsg(result2.message);
      process.exit(1);
    }
    success(result2.message);
    return;
  }
  console.log();
  const approved = await confirmAction(import_chalk.default.cyan(`  Apply this ${repairType} change? (Y/n) `), true);
  if (!approved) {
    warn("Cancelled.");
    return;
  }
  const result = applyRepairProposal(proposal.id, "interactive");
  if (!result.ok) {
    errorMsg(result.message);
    process.exit(1);
  }
  success(result.message);
}
function pageSignalScore(page) {
  return page.interactives.forms.length * 4 + page.interactives.searchInputs.length * 3 + page.interactives.standaloneInputs.length * 2 + page.interactives.ctaButtons.length + Math.min(page.links.length, 8) * 0.25;
}
function shouldUseScrapeForExplore(pages, candidates) {
  if (!isCrawleeEnabled()) return false;
  if (pages.length === 0 || candidates.length === 0) return true;
  const usefulPages = pages.filter((p) => pageSignalScore(p) >= 2).length;
  const genericButtonCount = pages.reduce((sum, p) => sum + p.interactives.ctaButtons.filter((b) => /^(learn more|read more|submit|continue|next|start|open|click)$/i.test(b.text.trim())).length, 0);
  const totalButtons = pages.reduce((sum, p) => sum + p.interactives.ctaButtons.length, 0);
  const hasSpaHints = pages.some((p) => p.spaIndicators?.hasRouter || p.spaIndicators?.hasVueApp || p.spaIndicators?.hasNgApp || p.spaIndicators?.hasLoadingState);
  return usefulPages === 0 || totalButtons > 0 && genericButtonCount / totalButtons > 0.6 || hasSpaHints && candidates.length < 2;
}
function pageDataFromScrapedPage(p) {
  const searchInputs = p.forms.flatMap((form) => form.fields).filter(
    (field) => field.type === "search" || /search|query|find/i.test(`${field.name} ${field.placeholder} ${field.label}`)
  );
  const forms = p.forms.map((form) => ({
    selector: form.selector,
    method: "get",
    fields: form.fields,
    submitSelector: form.submitSelector,
    submitText: form.submitText || "Submit"
  }));
  return {
    url: p.url,
    title: p.title,
    headings: p.headings,
    links: p.links.map((l) => l.href),
    screenshotPath: null,
    interactives: {
      forms,
      searchInputs,
      standaloneInputs: [],
      ctaButtons: p.buttons
    },
    spaIndicators: {
      hasRouter: /react|next|router|__next|vite|app/i.test(p.text.slice(0, 2e3)),
      hasVueApp: /vue|data-v-/.test(p.text.slice(0, 2e3)),
      hasNgApp: /ng-|angular/i.test(p.text.slice(0, 2e3)),
      hasLoadingState: /loading|spinner|skeleton/i.test(p.text.slice(0, 2e3))
    }
  };
}
async function bfsCrawl(startUrl, screenshotsDir, maxPages, onProgress) {
  const normalize = (u) => {
    try {
      const parsed = new URL(u);
      return parsed.origin + parsed.pathname.replace(/\/$/, "");
    } catch {
      return u;
    }
  };
  const visited = /* @__PURE__ */ new Set();
  const queued = /* @__PURE__ */ new Set();
  const queue = [normalize(startUrl)];
  queued.add(normalize(startUrl));
  const pages = [];
  const allowedHosts = /* @__PURE__ */ new Set();
  const inputHost = new URL(startUrl).hostname;
  allowedHosts.add(inputHost);
  allowedHosts.add(inputHost.startsWith("www.") ? inputHost.slice(4) : "www." + inputHost);
  const browser = await import_playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift();
    const key = normalize(url);
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 2e4 });
      const actualHost = new URL(page.url()).hostname;
      allowedHosts.add(actualHost);
      allowedHosts.add(actualHost.startsWith("www.") ? actualHost.slice(4) : "www." + actualHost);
      await page.waitForLoadState("networkidle", { timeout: 5e3 }).catch(() => {
      });
      await page.waitForSelector("body", { state: "visible", timeout: 5e3 }).catch(() => {
      });
      await page.waitForTimeout(1e3).catch(() => {
      });
      onProgress(pages.length + 1, page.url());
      const title = await page.title().catch(() => "");
      const headings = await page.$$eval(
        "h1,h2,h3",
        (els) => els.slice(0, 8).map((e) => e.innerText.trim()).filter(Boolean)
      ).catch(() => []);
      const links = await page.$$eval(
        "a[href]",
        (els) => els.map((e) => e.href).filter(Boolean)
      ).catch(() => []);
      const sameHostLinks = links.filter((h) => {
        try {
          const u = new URL(h);
          const host = u.hostname;
          const noAsset = !h.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|mp4|webp)(\?|$)/i);
          const isSameSite = [...allowedHosts].some((ah) => host === ah);
          return isSameSite && noAsset;
        } catch {
          return false;
        }
      });
      const interactives = await page.evaluate(() => {
        function isDynamicId(id) {
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || /^[0-9a-f]{16,}$/i.test(id) || /^[a-z]+-[0-9a-f]{6,}$/i.test(id) || /^\d+$/.test(id);
        }
        function bestSelector(el) {
          if (el.id && !isDynamicId(el.id)) return `#${el.id}`;
          const name = el.name;
          if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
          const placeholder = el.placeholder;
          if (placeholder) return `${el.tagName.toLowerCase()}[placeholder="${placeholder}"]`;
          const type = el.type;
          if (type && type !== "text") return `${el.tagName.toLowerCase()}[type="${type}"]`;
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
            const idx = siblings.indexOf(el);
            if (idx >= 0) return `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`;
          }
          return el.tagName.toLowerCase();
        }
        function labelFor(input) {
          const id = input.id;
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl) return lbl.innerText.trim();
          }
          const parent = input.closest("label");
          if (parent) {
            const clone = parent.cloneNode(true);
            clone.querySelectorAll("input,textarea,select").forEach((e) => e.remove());
            return clone.innerText.trim();
          }
          const prev = input.previousElementSibling;
          if (prev && prev.tagName === "LABEL") return prev.innerText.trim();
          return "";
        }
        function toField(inp) {
          const type = inp.type || inp.tagName.toLowerCase();
          return {
            type,
            id: inp.id || "",
            name: inp.name || "",
            placeholder: inp.placeholder || "",
            label: labelFor(inp),
            selector: bestSelector(inp),
            required: inp.required || false
          };
        }
        const forms = [];
        document.querySelectorAll("form").forEach((form, fi) => {
          const fields = [];
          form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select').forEach((inp) => {
            fields.push(toField(inp));
          });
          if (fields.length === 0) return;
          const formText = (form.textContent || "").toLowerCase();
          const formAction = (form.action || "").toLowerCase();
          const firstField = fields[0];
          const isSubscribeWidget = fields.length === 1 && firstField.type === "email" && (/subscribe|newsletter|notify/i.test(formText) || /subscribe|newsletter/i.test(formAction) || /subscribe|newsletter/i.test(form.id || "") || /subscribe|newsletter/i.test(firstField.id || "") || /subscribe|newsletter/i.test(firstField.name || "") || /subscribe|newsletter/i.test(firstField.placeholder || "") || /subscribe|newsletter/i.test((form.parentElement?.textContent || "").slice(0, 200).toLowerCase()));
          if (isSubscribeWidget) return;
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
          const rawId = form.id && !isDynamicId(form.id) ? form.id : null;
          const formSel = rawId ? `#${rawId}` : form.className ? `form.${form.className.split(" ")[0]}` : `form:nth-of-type(${fi + 1})`;
          forms.push({
            selector: formSel,
            method: form.method || "get",
            fields,
            submitSelector: submitBtn ? bestSelector(submitBtn) : null,
            submitText: submitBtn ? submitBtn.innerText.trim() : "Submit"
          });
        });
        const searchInputs = [];
        document.querySelectorAll('input[type="search"], input[placeholder*="search" i], input[placeholder*="find" i], input[name*="search" i], input[name*="query" i], input[aria-label*="search" i]').forEach((inp) => {
          searchInputs.push(toField(inp));
        });
        const standaloneInputs = [];
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="search"])').forEach((inp) => {
          if (!inp.closest("form")) standaloneInputs.push(toField(inp));
        });
        const ctaButtons = [];
        document.querySelectorAll('button, a.btn, a[class*="button"], a[class*="cta"]').forEach((btn) => {
          const text = btn.innerText.trim();
          if (!text || text.length > 60) return;
          if (/menu|close|open|toggle|collapse|expand/i.test(text)) return;
          const style = window.getComputedStyle(btn);
          if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) return;
          ctaButtons.push({ text, selector: bestSelector(btn) });
        });
        const spaIndicators = {
          hasRouter: !!document.querySelector('[data-reactroot], [data-rid], [id^="__"]'),
          hasVueApp: !!document.querySelector("[data-v-app], #app[data-v-]"),
          hasNgApp: !!document.querySelector("[ng-app], [data-ng-app]"),
          // Check for dynamic loading indicators (loading spinners, skeletons)
          hasLoadingState: !!document.querySelector('[class*="loading"], [class*="skeleton"], [class*="spinner"]')
        };
        return { forms, searchInputs, standaloneInputs: standaloneInputs.slice(0, 5), ctaButtons: ctaButtons.slice(0, 8), spaIndicators };
      }).catch(() => ({ forms: [], searchInputs: [], standaloneInputs: [], ctaButtons: [], spaIndicators: void 0 }));
      const ssPath = path4.join(screenshotsDir, `page-${pages.length + 1}.jpg`);
      await page.screenshot({ path: ssPath, type: "jpeg", quality: 60 }).catch(() => {
      });
      const ssExists = fs4.existsSync(ssPath);
      pages.push({
        url: page.url(),
        title,
        headings,
        links: sameHostLinks,
        screenshotPath: ssExists ? ssPath : null,
        interactives,
        spaIndicators: interactives.spaIndicators
      });
      for (const link of sameHostLinks) {
        const norm = normalize(link);
        if (!visited.has(norm) && !queued.has(norm)) {
          queue.push(norm);
          queued.add(norm);
        }
      }
    } catch (err) {
      const errorMsg2 = err instanceof Error ? err.message : String(err);
      if (pages.length < 5) {
        console.log(import_chalk.default.yellow(`  Warning: Skipped ${url} \u2014 ${errorMsg2}`));
      }
    }
  }
  await browser.close();
  return pages;
}
function deduplicatePages(pages) {
  function urlPattern(url) {
    try {
      const u = new URL(url);
      const pattern = u.pathname.replace(/\/[a-z0-9_-]+[_-]\d+\/?/g, "/*-N/").replace(/\/\d+\/?/g, "/N/").replace(/\/page-\d+\/?/g, "/page-N/").replace(/\/[0-9a-f]{8,}\/?/g, "/HASH/");
      return u.hostname + pattern;
    } catch {
      return url;
    }
  }
  const seenPatterns = /* @__PURE__ */ new Map();
  for (const p of pages) {
    const pat = urlPattern(p.url);
    const existing = seenPatterns.get(pat);
    if (!existing) {
      seenPatterns.set(pat, p);
    } else {
      const score = (d) => d.interactives.forms.length * 4 + d.interactives.searchInputs.length * 3 + d.interactives.standaloneInputs.length * 2 + d.interactives.ctaButtons.length;
      if (score(p) > score(existing)) seenPatterns.set(pat, p);
    }
  }
  return Array.from(seenPatterns.values());
}
function buildStepsFromInteractives(p) {
  const flows = [];
  const nav = { action: "navigate", url: p.url, label: `Open ${p.title || new URL(p.url).pathname}` };
  if (p.interactives.searchInputs.length > 0) {
    const inp = p.interactives.searchInputs[0];
    flows.push([
      nav,
      { action: "fill", selector: inp.selector, value: "{{searchQuery}}", label: "Enter search query" },
      { action: "keyboard", selector: inp.selector, value: "Enter", label: "Submit search" },
      { action: "assert:visible", selector: "body", label: "Verify results loaded" }
    ]);
  }
  for (const form of p.interactives.forms.slice(0, 2)) {
    if (form.fields.length === 0) continue;
    const steps = [nav];
    for (const f of form.fields) {
      if (f.type === "file") continue;
      const inferredVarName = (() => {
        const t = f.type.toLowerCase();
        const combined = `${f.name} ${f.placeholder} ${f.label}`.toLowerCase();
        if (t === "email" || /email|e-mail/.test(combined)) return "email";
        if (t === "password" || /password|passwd/.test(combined)) return "password";
        if (t === "tel" || /phone|mobile|tel/.test(combined)) return "phone";
        if (/search|query|keyword/.test(combined)) return "searchQuery";
        if (/subject|topic/.test(combined)) return "subject";
        if (/message|comment|feedback|body/.test(combined)) return "message";
        if (/first.?name/.test(combined)) return "firstName";
        if (/last.?name/.test(combined)) return "lastName";
        if (/^name|full.?name|your name/.test(combined)) return "name";
        if (/username|user_name/.test(combined)) return "username";
        if (/address/.test(combined)) return "address";
        if (/city/.test(combined)) return "city";
        if (/zip|postal/.test(combined)) return "zipCode";
        if (/country/.test(combined)) return "country";
        if (/title/.test(combined)) return "title";
        const raw = (f.name || f.label || f.placeholder || f.type).replace(/@.*$/, "");
        return raw.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value";
      })();
      const varName = inferredVarName;
      const action = f.type === "select" ? "select" : f.type === "checkbox" || f.type === "radio" ? "check" : "fill";
      const scopedSelector = form.selector && !form.selector.startsWith("form:nth") ? `${form.selector} ${f.selector}` : f.selector;
      const usedSelectors = steps.map((s) => s.selector);
      const baseSelector = scopedSelector.trim();
      const dupCount = usedSelectors.filter((s) => s === baseSelector).length;
      const finalSelector = dupCount > 0 ? `${baseSelector}:nth-of-type(${dupCount + 1})` : baseSelector;
      steps.push({
        action,
        selector: finalSelector,
        value: action === "check" || f.type === "radio" ? "true" : `{{${varName}}}`,
        label: f.label || f.name || f.placeholder || f.type
      });
    }
    if (form.submitSelector) {
      const scopedSubmit = form.selector && form.submitSelector ? `${form.selector} ${form.submitSelector}` : form.submitSelector || 'button[type="submit"]';
      steps.push({ action: "click", selector: scopedSubmit.trim(), label: form.submitText || "Submit" });
    }
    steps.push({ action: "assert:visible", selector: "body", label: "Verify submission" });
    const hasInputStep = steps.some((s) => ["fill", "select", "check"].includes(s.action));
    if (hasInputStep) flows.push(steps);
  }
  if (flows.length === 0 && p.interactives.ctaButtons.length > 0) {
    const cta = p.interactives.ctaButtons[0];
    flows.push([
      nav,
      { action: "click", selector: cta.selector, label: `Click "${cta.text}"` },
      { action: "assert:visible", selector: "body", label: "Verify action completed" }
    ]);
  }
  return flows;
}
async function analyzePages(pages) {
  const candidates = [];
  const deduplicated = deduplicatePages(pages);
  const BATCH = 5;
  for (let i = 0; i < deduplicated.length; i += BATCH) {
    const batch = deduplicated.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (p) => {
      const stepGroups = buildStepsFromInteractives(p);
      if (stepGroups.length === 0) return [];
      const results = [];
      for (const steps of stepGroups) {
        const stepSummary = steps.map((s) => `${s.action}${s.value ? "(" + s.value + ")" : s.selector ? "(" + s.selector + ")" : ""}`).join(" \u2192 ");
        const interactiveHint = [
          p.interactives.searchInputs.length > 0 ? "has search bar" : "",
          p.interactives.forms.length > 0 ? `has ${p.interactives.forms.length} form(s) with fields: ${p.interactives.forms[0].fields.map((f) => f.label || f.name || f.type).join(", ")}` : "",
          p.interactives.ctaButtons.length > 0 ? `CTAs: ${p.interactives.ctaButtons.slice(0, 3).map((b) => b.text).join(", ")}` : ""
        ].filter(Boolean).join("; ");
        const prompt = `Page: ${p.url}
Title: "${p.title}"
Interactive elements: ${interactiveHint || "none"}
Automation steps: ${stepSummary}

Give this automation flow a short name (3-6 words) and one sentence description.
Reply with ONLY this JSON, nothing else: {"name": "...", "description": "..."}`;
        let name = p.title || new URL(p.url).pathname;
        let description = `Automated interaction on ${p.title || p.url}`;
        const result = await callAI(prompt, { mode: "author", metadata: { source: "explore" } });
        if (result) {
          try {
            const match = result.text.replace(/```json\n?|\n?```/g, "").match(/\{[^{}]+\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (typeof parsed.name === "string" && parsed.name.length > 0) name = parsed.name;
              if (typeof parsed.description === "string" && parsed.description.length > 0) description = parsed.description;
            }
          } catch {
          }
        }
        results.push({ name, description, route: p.url, steps });
      }
      return results;
    }));
    for (const r of batchResults) candidates.push(...r);
    if (i + BATCH < deduplicated.length) await new Promise((r) => setTimeout(r, 300));
  }
  return candidates;
}
function generateExploreHtml(report, pages, candidates) {
  const thumbs = pages.map((p, i) => {
    let imgTag = '<div class="no-screenshot">No screenshot</div>';
    if (p.screenshotPath && fs4.existsSync(p.screenshotPath)) {
      const b64 = fs4.readFileSync(p.screenshotPath).toString("base64");
      imgTag = `<img src="data:image/jpeg;base64,${b64}" alt="${p.title}" loading="lazy">`;
    }
    return `
    <div class="page-card">
      <div class="page-thumb">${imgTag}</div>
      <div class="page-info">
        <div class="page-num">#${i + 1}</div>
        <div class="page-title">${escapeHtml(p.title || "(no title)")}</div>
        <a class="page-url" href="${escapeHtml(p.url)}" target="_blank">${escapeHtml(p.url.replace(new URL(report.url).origin, ""))}</a>
        <div class="page-meta">${p.headings.slice(0, 2).map((h) => `<span class="heading-pill">${escapeHtml(h)}</span>`).join("")}</div>
      </div>
    </div>`;
  }).join("");
  const candidateCards = candidates.map((c, i) => {
    const stepsHtml = c.steps && c.steps.length > 0 ? `<div class="flow-steps">
          ${c.steps.map((s, si) => {
      const hasVar = s.value && s.value.includes("{{");
      return `<div class="flow-step">
              <span class="step-num">${si + 1}</span>
              <span class="step-action">${escapeHtml(s.action)}</span>
              ${s.url ? `<span class="step-selector">${escapeHtml(s.url)}</span>` : ""}
              ${s.selector ? `<span class="step-selector">${escapeHtml(s.selector)}</span>` : ""}
              ${s.value ? `<span class="step-value ${hasVar ? "is-var" : ""}">${escapeHtml(s.value)}</span>` : ""}
            </div>`;
    }).join("")}
        </div>` : "";
    return `
    <div class="candidate-card" data-id="${i}">
      <label class="candidate-check">
        <input type="checkbox" class="confirm-cb" data-route="${escapeHtml(c.route)}" data-name="${escapeHtml(c.name)}" checked>
        <span class="candidate-name">${escapeHtml(c.name)}</span>
      </label>
      <div class="candidate-desc">${escapeHtml(c.description || "")}</div>
      <div class="candidate-route">${escapeHtml(c.route)}</div>
      ${stepsHtml}
    </div>`;
  }).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GhostRun Explore Report \u2014 ${escapeHtml(report.url)}</title>
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
  .candidate-route { font-size: 12px; color: #58a6ff; margin-left: 26px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 10px; }
  .flow-steps { margin: 10px 0 0 0; background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  .flow-step { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-family: monospace; flex-wrap: wrap; }
  .step-num { color: #484f58; min-width: 16px; }
  .step-action { color: #79c0ff; font-weight: 600; }
  .step-selector { color: #8b949e; overflow: hidden; text-overflow: ellipsis; max-width: 200px; white-space: nowrap; }
  .step-value { color: #7ee787; }
  .step-value.is-var { color: #e3b341; font-style: italic; }
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
  <div class="logo">\u26A1 GhostRun</div>
  <div class="header-meta">
    Explore Report \xB7 <a href="${escapeHtml(report.url)}" target="_blank">${escapeHtml(report.url)}</a>
    <span class="env-badge env-${report.environment}">${report.environment}</span>
  </div>
</div>
<div class="main">
  <div class="stats-row">
    <div class="stat-card"><div class="stat-num">${pages.length}</div><div class="stat-label">Pages crawled</div></div>
    <div class="stat-card"><div class="stat-num">${candidates.length}</div><div class="stat-label">Flow candidates</div></div>
    <div class="stat-card"><div class="stat-num">${new Set(pages.map((p) => new URL(p.url).pathname.split("/")[1] || "/")).size}</div><div class="stat-label">Unique sections</div></div>
  </div>

  <section>
    <div class="section-title">Flow Candidates</div>
    <div class="section-sub">AI-suggested flows based on your site's pages. Check the ones you want to save.</div>
    <div class="candidate-grid">${candidateCards}</div>
  </section>

  <section>
    <div class="section-title">Pages Crawled</div>
    <div class="section-sub">${pages.length} page${pages.length !== 1 ? "s" : ""} discovered from <strong>${escapeHtml(report.url)}</strong></div>
    <div class="page-grid">${thumbs}</div>
  </section>

  <section>
    <div class="section-title">Confirm Selected Flows</div>
    <div class="section-sub">After reviewing above, run this command to import selected flows:</div>
    <div class="cmd-box" id="cmd-box">ghostrun explore:confirm ${report.id.slice(0, 8)}<button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('cmd-text').textContent)">Copy</button></div>
    <span id="cmd-text" style="display:none">ghostrun explore:confirm ${report.id.slice(0, 8)}</span>
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
    navigator.clipboard.writeText('ghostrun explore:confirm ${report.id.slice(0, 8)}');
    const btn = document.querySelector('.confirm-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy confirm command'; }, 1500);
  }
</script>
</body>
</html>`;
}
async function runExplore(url) {
  const clack = await import("@clack/prompts");
  const { intro, select, text, password, confirm, spinner, isCancel, outro, note } = clack;
  intro(import_chalk.default.cyan(" GhostRun Explorer "));
  const env = await select({
    message: "Environment type:",
    options: [
      { value: "local", label: "Local", hint: "localhost / 127.0.0.1" },
      { value: "staging", label: "Staging", hint: "staging.yourapp.com" },
      { value: "preprod", label: "Pre-prod", hint: "pre.yourapp.com" },
      { value: "prod", label: "Production", hint: "yourapp.com" }
    ],
    initialValue: url.includes("localhost") || url.includes("127.0.0.1") ? "local" : "prod"
  });
  if (isCancel(env)) {
    outro("Cancelled.");
    return;
  }
  const needsLogin = await confirm({ message: "Does this site require login to explore?" });
  if (isCancel(needsLogin)) {
    outro("Cancelled.");
    return;
  }
  let loginCreds = null;
  if (needsLogin) {
    const username = await text({ message: "Username / email:", validate: (v) => !v ? "Required" : void 0 });
    if (isCancel(username)) {
      outro("Cancelled.");
      return;
    }
    const loginPassword = await password({ message: "Password:", validate: (v) => !v ? "Required" : void 0 });
    if (isCancel(loginPassword)) {
      outro("Cancelled.");
      return;
    }
    loginCreds = { username, loginPassword };
  }
  const maxPagesStr = await text({
    message: "Max pages to crawl:",
    initialValue: "30",
    validate: (v) => !v || isNaN(Number(v)) || Number(v) < 1 ? "Enter a number >= 1" : void 0
  });
  if (isCancel(maxPagesStr)) {
    outro("Cancelled.");
    return;
  }
  const maxPages = Math.min(parseInt(maxPagesStr, 10), 100);
  const report = db.createExploreReport(url, env);
  const exploreDir = path4.join(DATA_PATH2, "explore", report.id);
  fs4.mkdirSync(exploreDir, { recursive: true });
  let cookiesJson = null;
  if (loginCreds) {
    note("A browser will open. Log in, then come back and press Enter.", "Login Required");
    const loginBrowser = await import_playwright.chromium.launch({ headless: false });
    const loginPage = await loginBrowser.newPage();
    await loginPage.goto(url, { waitUntil: "domcontentloaded", timeout: 15e3 }).catch(() => {
    });
    try {
      await loginPage.fill('input[type="email"], input[name="email"], input[name="username"]', loginCreds.username, { timeout: 3e3 });
      await loginPage.fill('input[type="password"]', loginCreds.loginPassword, { timeout: 3e3 });
    } catch {
    }
    await new Promise((resolve3) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(import_chalk.default.cyan("\n  Press Enter once you are logged in... "), () => {
        rl.close();
        resolve3();
      });
    });
    const cookies = await loginPage.context().cookies();
    cookiesJson = JSON.stringify(cookies);
    await loginBrowser.close();
  }
  console.log();
  const s = spinner();
  s.start("Crawling pages...");
  let crawlCount = 0;
  const pages = await bfsCrawl(url, exploreDir, maxPages, (visited, current) => {
    crawlCount = visited;
    s.message(`Crawling... ${visited} pages found \u2014 ${new URL(current).pathname}`);
  });
  s.stop(`Crawled ${pages.length} pages`);
  if (pages.length === 0) {
    outro(import_chalk.default.red("No pages could be crawled. Check the URL and try again."));
    return;
  }
  const hasAI = !!await isOllamaRunning() || !!process.env.ANTHROPIC_API_KEY;
  let candidates = [];
  if (hasAI) {
    const s2 = spinner();
    const uniquePageCount = deduplicatePages(pages).length;
    s2.start(`Analyzing ${uniquePageCount} unique page templates (deduped from ${pages.length})...`);
    candidates = await analyzePages(pages);
    s2.stop(`${candidates.length} flow candidates identified from ${uniquePageCount} unique page templates`);
  } else {
    for (const p of deduplicatePages(pages)) {
      for (const steps of buildStepsFromInteractives(p)) {
        const firstInteractive = steps.find((s2) => s2.action !== "navigate" && s2.action !== "assert:visible");
        const name = p.title ? `${p.title} \u2014 ${firstInteractive?.action || "check"}` : `Check ${new URL(p.url).pathname}`;
        candidates.push({ name, description: `Automated flow on ${p.title || p.url}`, route: p.url, steps });
      }
    }
    note("No AI available \u2014 generated flows from detected page elements. Set up Ollama or ANTHROPIC_API_KEY for better names.", "Note");
  }
  if (shouldUseScrapeForExplore(pages, candidates)) {
    const sScrape = spinner();
    sScrape.start("Explorer confidence is low \u2014 using Crawlee scrape fallback...");
    try {
      const scrape = await runCrawleeScrape(url, {
        maxPages: Math.min(Math.max(1, maxPages), 3),
        reason: "explore-fallback",
        exploreReportId: report.id,
        quiet: true,
        requireEnabled: false
      });
      const scrapePages = scrape.pages.map(pageDataFromScrapedPage);
      const combinedPages = deduplicatePages([...pages, ...scrapePages]);
      const scrapeCandidates = hasAI ? await analyzePages(combinedPages) : combinedPages.flatMap(
        (p) => buildStepsFromInteractives(p).map((steps) => ({
          name: p.title ? `${p.title} \u2014 ${steps.find((s2) => s2.action !== "navigate")?.action || "check"}` : `Check ${new URL(p.url).pathname}`,
          description: `Automated flow enriched by Crawlee scrape on ${p.title || p.url}`,
          route: p.url,
          steps
        }))
      );
      pages.push(...scrapePages.filter((sp) => !pages.some((p) => p.url === sp.url)));
      candidates = [...candidates, ...scrapeCandidates];
      sScrape.stop(`Crawlee fallback added ${scrape.pages.length} scraped page${scrape.pages.length !== 1 ? "s" : ""}`);
    } catch (err) {
      sScrape.stop("Crawlee fallback skipped");
      note(err instanceof Error ? err.message : String(err), "Scrape fallback unavailable");
    }
  }
  const seenRoutes = /* @__PURE__ */ new Set();
  candidates = candidates.filter((c) => {
    if (seenRoutes.has(c.route)) return false;
    seenRoutes.add(c.route);
    return true;
  });
  const seenFingerprints = /* @__PURE__ */ new Set();
  candidates = candidates.filter((c) => {
    const fingerprint = (c.steps || []).filter((s2) => s2.action !== "navigate" && s2.action !== "assert:visible").map((s2) => `${s2.action}:${s2.selector || ""}:${s2.value || ""}`).sort().join("|");
    if (!fingerprint) return true;
    if (seenFingerprints.has(fingerprint)) return false;
    seenFingerprints.add(fingerprint);
    return true;
  });
  for (const c of candidates) {
    const pageForRoute = pages.find((p) => p.url === c.route);
    const steps = c.steps && c.steps.length > 0 ? c.steps : [
      { action: "navigate", url: c.route, label: `Open ${c.name}` },
      { action: "assert:visible", selector: "body", label: "Verify page loaded" }
    ];
    const nodes = steps.map((step, idx) => ({
      id: `n${idx + 1}`,
      type: "action",
      action: step.action,
      ...step.url ? { url: step.url } : {},
      ...step.selector ? { selector: step.selector } : {},
      ...step.value ? { value: step.value } : {},
      name: step.label || `${step.action}${step.selector ? " " + step.selector : ""}`
    }));
    db.createExploreCandidate({
      reportId: report.id,
      name: c.name,
      description: c.description,
      route: c.route,
      screenshotPath: pageForRoute?.screenshotPath || void 0,
      graph: { nodes, edges: [] }
    });
  }
  const s3 = spinner();
  s3.start("Generating report...");
  const reportHtml = generateExploreHtml(report, pages, candidates);
  const reportPath = path4.join(exploreDir, "report.html");
  fs4.writeFileSync(reportPath, reportHtml, "utf-8");
  db.updateExploreReport(report.id, { status: "complete", reportPath });
  s3.stop("Report generated");
  console.log();
  note(
    [
      `  Pages crawled:      ${import_chalk.default.white(String(pages.length))}`,
      `  Flow candidates:    ${import_chalk.default.white(String(candidates.length))}`,
      `  Report:             ${import_chalk.default.cyan(reportPath)}`,
      "",
      `  Open the report in your browser to review candidates,`,
      `  then run:`,
      `    ${import_chalk.default.cyan("ghostrun explore:confirm " + report.id.slice(0, 8))}`
    ].join("\n"),
    "Explore Complete"
  );
  outro("");
}
async function runExploreConfirm(reportId) {
  const clack = await import("@clack/prompts");
  const { intro, multiselect, isCancel, outro, spinner, note } = clack;
  const report = db.findExploreReportByPartialId(reportId);
  if (!report) {
    errorMsg("Report not found: " + reportId);
    process.exit(1);
  }
  const candidates = db.listExploreCandidates(report.id);
  if (candidates.length === 0) {
    warn("No candidates found for this report.");
    return;
  }
  intro(import_chalk.default.cyan(" Confirm Flows "));
  if (report.reportPath) {
    note(`Report: ${import_chalk.default.cyan(report.reportPath)}`, "Tip: open in browser to review with screenshots");
  }
  const chosen = await multiselect({
    message: `Select flows to save (${candidates.length} candidates):`,
    options: candidates.map((c) => ({
      value: c.id,
      label: c.name,
      hint: c.route.replace(report.url, "") || "/"
    })),
    required: false
  });
  if (isCancel(chosen) || chosen.length === 0) {
    outro("No flows saved.");
    return;
  }
  const s = spinner();
  s.start("Saving flows...");
  const selected = chosen;
  for (const id of selected) {
    const c = candidates.find((x) => x.id === id);
    db.createFlow({ name: c.name, description: c.description, appUrl: c.route, graph: JSON.parse(c.graph), createdBy: "agent" });
    db.confirmExploreCandidate(c.id);
  }
  db.updateExploreReport(report.id, { status: "confirmed" });
  s.stop(`${selected.length} flow${selected.length !== 1 ? "s" : ""} saved`);
  const saved = selected.map((id) => candidates.find((c) => c.id === id).name);
  note(
    saved.map((n) => `  ${import_chalk.default.green("\u2713")} ${n}`).join("\n"),
    "Saved Flows"
  );
  note(
    `Run any flow with:
  ${import_chalk.default.cyan("ghostrun run <name>")}`,
    "Next Step"
  );
  outro("");
}
async function runExploreList() {
  const reports = db.listExploreReports();
  if (reports.length === 0) {
    info("No explore sessions found. Run: ghostrun explore <url>");
    return;
  }
  console.log(import_chalk.default.bold("\n  Explore Sessions\n"));
  const header = `  ${"ID".padEnd(10)}${"URL".padEnd(45)}${"Status".padEnd(12)}${"Report"}`;
  console.log(import_chalk.default.gray(header));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(90)));
  for (const r of reports) {
    const id = import_chalk.default.cyan(r.id.slice(0, 8));
    const url = r.url.slice(0, 43).padEnd(45);
    const status = (r.status === "complete" ? import_chalk.default.green("complete") : import_chalk.default.yellow(r.status)).padEnd(20);
    const report = r.reportPath ? import_chalk.default.gray("open " + r.reportPath) : import_chalk.default.gray("\u2014");
    console.log(`  ${id}  ${url}  ${status}  ${report}`);
  }
  console.log();
  console.log(import_chalk.default.gray(`  Confirm a session: ghostrun explore:confirm <id>`));
  console.log();
}
async function runSuiteCreate(name) {
  const suite = db.createSuite({ name });
  success(`Suite created: ${import_chalk.default.white(suite.name)}`);
  info("ID: " + import_chalk.default.gray(suite.id.slice(0, 8)));
  console.log();
}
async function runSuiteAdd(suiteName, flowName) {
  const suite = db.findSuiteByNameOrId(suiteName);
  if (!suite) {
    errorMsg("Suite not found: " + suiteName);
    process.exit(1);
  }
  const flow = db.findFlowByPartialId(flowName) || db.findFlowByName(flowName);
  if (!flow) {
    errorMsg("Flow not found: " + flowName);
    process.exit(1);
  }
  db.addFlowToSuite(suite.id, flow.id);
  success(`Added "${flow.name}" to suite "${suite.name}"`);
  console.log();
}
async function runSuiteList() {
  const suites = db.listSuites();
  console.log(import_chalk.default.bold("\n  Test Suites\n"));
  if (suites.length === 0) {
    warn("No suites. Create one: " + import_chalk.default.cyan("ghostrun suite:create <name>"));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Name                          Flows"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(50)));
  for (const suite of suites) {
    const flows = db.getSuiteFlows(suite.id);
    console.log(`  ${import_chalk.default.gray(suite.id.slice(0, 8))} ${import_chalk.default.white(suite.name.padEnd(28).slice(0, 28))} ${import_chalk.default.gray(String(flows.length))}`);
  }
  console.log();
}
async function runSuiteShow(name) {
  const suite = db.findSuiteByNameOrId(name);
  if (!suite) {
    errorMsg("Suite not found: " + name);
    process.exit(1);
  }
  const flows = db.getSuiteFlows(suite.id);
  console.log(import_chalk.default.bold(`
  Suite: ${suite.name}
`));
  if (flows.length === 0) {
    warn("No flows in this suite.");
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  #   Flow Name"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(44)));
  flows.forEach((f, i) => console.log(`  ${import_chalk.default.gray(String(i + 1).padStart(2))}  ${import_chalk.default.white(f.flowName)}`));
  console.log();
}
async function runSuiteRun(name, vars) {
  printLogo();
  divider();
  const suite = db.findSuiteByNameOrId(name);
  if (!suite) {
    errorMsg("Suite not found: " + name);
    process.exit(1);
  }
  const flows = db.getSuiteFlows(suite.id);
  if (flows.length === 0) {
    warn("No flows in this suite.");
    return;
  }
  const parallelMode = process.argv.includes("--parallel");
  console.log(import_chalk.default.bold(`
  Suite: ${suite.name}${parallelMode ? import_chalk.default.gray("  [parallel]") : ""}
`));
  const lineWidth = 45;
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(lineWidth)));
  const results = [];
  const suiteStart = Date.now();
  if (parallelMode) {
    const settled = await Promise.all(
      flows.map(
        (sf, i) => executeFlow(sf.flowId, vars, { quiet: true }).then((result) => ({ index: i + 1, name: sf.flowName, passed: result.passed, duration: result.duration })).catch((err) => ({ index: i + 1, name: sf.flowName, passed: false, duration: 0, error: String(err) }))
      )
    );
    results.push(...settled);
    results.forEach((r) => {
      const status = r.passed ? import_chalk.default.green("\u2713") : import_chalk.default.red("\u2717");
      console.log(`   ${import_chalk.default.gray(String(r.index))}  ${import_chalk.default.white(r.name.padEnd(22).slice(0, 22))}  ${status}  ${import_chalk.default.gray(r.duration + "ms")}`);
    });
  } else {
    for (let i = 0; i < flows.length; i++) {
      const sf = flows[i];
      process.stdout.write(`   ${import_chalk.default.gray(String(i + 1))}  ${import_chalk.default.white(sf.flowName.padEnd(22).slice(0, 22))}  `);
      try {
        const result = await executeFlow(sf.flowId, vars);
        const dur = result.duration;
        process.stdout.write(result.passed ? import_chalk.default.green("\u2713") : import_chalk.default.red("\u2717"));
        process.stdout.write("  " + import_chalk.default.gray(dur + "ms") + "\n");
        results.push({ index: i + 1, name: sf.flowName, passed: result.passed, duration: dur });
      } catch (err) {
        process.stdout.write(import_chalk.default.red("\u2717") + "  " + import_chalk.default.gray("error") + "\n");
        results.push({ index: i + 1, name: sf.flowName, passed: false, duration: 0, error: String(err) });
      }
    }
  }
  const totalDuration = Date.now() - suiteStart;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(lineWidth)));
  console.log();
  console.log(`  ${import_chalk.default.green(passed + "/" + results.length + " passed")}  \xB7 Total: ${import_chalk.default.gray((totalDuration / 1e3).toFixed(1) + "s")}`);
  console.log();
  if (failed > 0) {
    console.log(import_chalk.default.bold("  Failed:"));
    results.filter((r) => !r.passed).forEach((r) => console.log(`    ${import_chalk.default.red("\u2717")} ${import_chalk.default.white(r.name)}${r.error ? " \u2014 " + import_chalk.default.gray(r.error.slice(0, 60)) : ""}`));
    console.log();
    process.exitCode = 1;
  }
}
async function runBaselineSet(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  info(`Setting baselines for: ${import_chalk.default.white(flow.name)}`);
  const result = await executeFlow(flow.id);
  if (!result.runId) {
    errorMsg("Flow run failed, no baselines set.");
    return;
  }
  const steps = db.listSteps(result.runId);
  let count = 0;
  const baselinesDir = path4.join(DATA_PATH2, "baselines", flow.id);
  fs4.mkdirSync(baselinesDir, { recursive: true });
  for (const step of steps) {
    if (step.screenshotPath && fs4.existsSync(step.screenshotPath)) {
      const dest = path4.join(baselinesDir, `step-${step.stepNumber}.png`);
      fs4.copyFileSync(step.screenshotPath, dest);
      db.setBaseline(flow.id, step.stepNumber, dest);
      count++;
    }
  }
  success(`Baseline set: ${count} screenshots saved`);
  info(`Path: ${import_chalk.default.cyan(baselinesDir)}`);
  console.log();
}
async function runBaselineClear(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  db.clearBaselines(flow.id);
  success(`Baselines cleared for: ${import_chalk.default.white(flow.name)}`);
  console.log();
}
async function runBaselineShow(id) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) {
    errorMsg("Flow not found: " + id);
    process.exit(1);
  }
  const baselines = db.listBaselines(flow.id);
  console.log(import_chalk.default.bold(`
  Baselines: ${flow.name}
`));
  if (baselines.length === 0) {
    warn("No baselines. Run: " + import_chalk.default.cyan("ghostrun baseline:set " + id));
    console.log();
    return;
  }
  for (const b of baselines) {
    console.log(`  Step ${import_chalk.default.gray(String(b.stepNumber).padStart(2))}  ${import_chalk.default.cyan(b.screenshotPath)}  ${import_chalk.default.gray(b.capturedAt.toLocaleDateString())}`);
  }
  console.log();
}
function findInvalidStepUrl(rawUrl, baseUrl) {
  const resolved = rawUrl.replace(/\{\{(baseUrl|__baseUrl|BASE_URL)\}\}/g, baseUrl);
  if (/\{\{\w+\}\}/.test(resolved)) return `unresolved template variable in "${rawUrl}"`;
  if (/^https?:\/\//i.test(resolved)) {
    try {
      new URL(resolved);
      return null;
    } catch {
      return `not a valid URL: "${rawUrl}"`;
    }
  }
  if (resolved.startsWith("/")) {
    try {
      new URL(resolved, baseUrl);
      return null;
    } catch {
      return `not a valid path: "${rawUrl}"`;
    }
  }
  return `not a full URL, {{baseUrl}} path, or "/" path: "${rawUrl}"`;
}
async function runCreate(description, extraArgs = []) {
  const jsonOutput = parseFlagValue(extraArgs, "--output") === "json" || extraArgs.includes("--json");
  const preview = extraArgs.includes("--preview");
  const noSave = preview || extraArgs.includes("--no-save");
  const profileName = parseFlagValue(extraArgs, "--profile") || readConfig().activeProfile || void 0;
  if (!jsonOutput) {
    printLogo();
    divider();
  }
  if (!description) {
    const positional = extraArgs.filter((a) => !a.startsWith("--") && extraArgs.indexOf(a) === extraArgs.lastIndexOf(a));
    description = positional.join(" ").trim();
  }
  if (!description) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: "Description required" }));
      process.exit(1);
    }
    description = await askQuestion(import_chalk.default.cyan("\n  Describe the automation flow: "));
    if (!description) {
      errorMsg("Description required");
      process.exit(1);
    }
  }
  let baseUrl = parseFlagValue(extraArgs, "--base-url");
  if (!baseUrl && profileName) {
    baseUrl = getProfile(profileName)?.baseUrl;
  }
  if (!baseUrl) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: "Base URL required. Pass --base-url or --profile with baseUrl." }));
      process.exit(1);
    }
    baseUrl = await askQuestion(import_chalk.default.cyan("  Base URL for this flow (e.g. http://localhost:3000): "));
    if (!baseUrl) {
      errorMsg("Base URL required");
      process.exit(1);
    }
  }
  const hasAI = !!await isOllamaRunning() || !!process.env.ANTHROPIC_API_KEY;
  if (!hasAI) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: "No AI provider available. Set ANTHROPIC_API_KEY or run Ollama." }));
      process.exit(1);
    }
    errorMsg("No AI provider available. Run Ollama locally or set ANTHROPIC_API_KEY.");
    process.exit(1);
  }
  if (!jsonOutput) info("Generating flow from description...");
  const authorContext = buildAuthorContext(profileName);
  const prompt = `Convert this automation test description into a Playwright test flow.

Description: "${description}"
Base URL: "${baseUrl}"
${authorContext}

Output ONLY a valid JSON array of steps, no other text:
[
  {"name": "Step name", "action": "navigate|click|fill|select|assert:text|assert:url|assert:element", "url": "...", "selector": "...", "value": "..."}
]

Rules:
- Use "navigate" for page navigation (include full URL or {{baseUrl}} paths)
- Use "click" for button/link clicks (guess a reasonable selector)
- Use "fill" for text inputs (include the test value)
- Use "assert:text" to verify text appears on page
- Use "assert:url" to verify URL contains a string
- Only include fields relevant to each action
- selector and url fields must be CSS selectors or full URLs`;
  const result = await callAI(prompt, { mode: "author", metadata: { source: "create", profile: profileName || "" } });
  if (!result) {
    const aiError = getLastAiError();
    const message = aiError ? `AI failed to generate flow: ${aiError.detail}` : "AI failed to generate flow.";
    if (jsonOutput) {
      console.log(JSON.stringify({ error: message, reason: aiError?.reason || null }));
      process.exit(1);
    }
    errorMsg(message);
    process.exit(1);
  }
  let steps;
  try {
    const cleaned = result.text.replace(/```json\n?|\n?```/g, "").trim();
    steps = JSON.parse(cleaned);
    if (!Array.isArray(steps)) throw new Error("Not an array");
  } catch {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: "AI returned invalid JSON.", preview: result.text.slice(0, 200) }));
      process.exit(1);
    }
    errorMsg("AI returned invalid JSON. Try again with a clearer description.");
    console.log(import_chalk.default.gray("  AI response: " + result.text.slice(0, 200)));
    process.exit(1);
    return;
  }
  const urlProblems = steps.map((step, i) => step.url ? { step, i, problem: findInvalidStepUrl(step.url, baseUrl) } : null).filter((x) => !!x?.problem);
  if (urlProblems.length > 0) {
    const details = urlProblems.map(({ step, i, problem }) => `Step ${i + 1} ("${step.name}"): ${problem}`);
    if (jsonOutput) {
      console.log(JSON.stringify({ error: "AI generated a flow with invalid step URLs.", details }));
      process.exit(1);
    }
    errorMsg("AI generated a flow with invalid step URLs \u2014 not saving a broken flow.");
    details.forEach((d) => console.log(import_chalk.default.gray("  " + d)));
    console.log(import_chalk.default.gray("  Try a clearer description, or use --preview to inspect the raw AI output."));
    process.exit(1);
    return;
  }
  let flowName = "Generated Flow";
  {
    const nameResult = await callAI(`Give a short (2-5 words) flow name for this automation: "${description}". Reply with ONLY the name, title-cased, no punctuation. Examples: "Login Flow", "Checkout Guest", "Search Products".`, { mode: "author", metadata: { source: "flow-naming" } });
    if (nameResult?.text) {
      const candidate = nameResult.text.replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 40);
      if (candidate.length >= 3) flowName = candidate;
    }
    if (flowName === "Generated Flow") {
      flowName = description.trim().split(/\s+/).slice(0, 5).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  const nodes = [{ id: "start", type: "start", label: "Start", url: baseUrl }];
  const edges = [];
  let prevId = "start";
  steps.forEach((step, i) => {
    const nodeId = `step-${i + 1}`;
    const node = { id: nodeId, type: "action", label: step.name, action: step.action };
    if (step.url) node.url = step.url;
    if (step.selector) node.selector = step.selector;
    if (step.value) node.value = step.value;
    nodes.push(node);
    edges.push({ id: `e${i}`, source: prevId, target: nodeId });
    prevId = nodeId;
  });
  nodes.push({ id: "end", type: "end", label: "End" });
  edges.push({ id: `e${steps.length}`, source: prevId, target: "end" });
  const graph = { nodes, edges, appUrl: baseUrl };
  if (preview || noSave) {
    const payload = { preview: true, name: flowName, description, baseUrl, steps, graph };
    if (jsonOutput) {
      console.log(JSON.stringify(payload));
      return;
    }
    divider();
    info("Preview generated flow (not saved):");
    console.log(JSON.stringify(payload, null, 2));
    const saveApproved = await confirmAction(import_chalk.default.cyan("\n  Save this flow? (Y/n) "), true);
    if (!saveApproved) {
      warn("Preview only \u2014 flow not saved.");
      return;
    }
  }
  const flow = db.createFlow({ name: flowName, description, appUrl: baseUrl, graph, createdBy: "agent" });
  if (jsonOutput) {
    console.log(JSON.stringify({
      flowId: flow.id,
      flowIdShort: flow.id.slice(0, 8),
      name: flowName,
      description,
      baseUrl,
      stepCount: steps.length,
      steps,
      runHint: `ghostrun run ${flow.id.slice(0, 8)}`
    }));
    return;
  }
  divider();
  success(`Flow created: ${import_chalk.default.white(flowName)}`);
  info(`Creator: ${import_chalk.default.magenta("\u{1F916} agent")}`);
  info(`Steps: ${import_chalk.default.white(String(steps.length))}`);
  info(`Run with: ${import_chalk.default.green("ghostrun run " + flow.id.slice(0, 8))}`);
  console.log();
}
async function runCodeScan(dir) {
  printLogo();
  divider();
  if (!fs4.existsSync(dir)) {
    errorMsg("Directory not found: " + dir);
    process.exit(1);
  }
  info(`Scanning: ${import_chalk.default.cyan(dir)}`);
  let framework = "Generic";
  if (fs4.existsSync(path4.join(dir, "next.config.js")) || fs4.existsSync(path4.join(dir, "next.config.ts"))) {
    framework = "Next.js";
  } else if (fs4.existsSync(path4.join(dir, "package.json"))) {
    try {
      const pkg = JSON.parse(fs4.readFileSync(path4.join(dir, "package.json"), "utf8"));
      if (pkg.dependencies?.express || pkg.devDependencies?.express) framework = "Express";
    } catch {
    }
  }
  info(`Framework: ${import_chalk.default.cyan(framework)}`);
  const routes = [];
  if (framework === "Next.js") {
    const appDir = path4.join(dir, "app");
    const pagesDir = path4.join(dir, "pages");
    const rootDir = fs4.existsSync(appDir) ? appDir : fs4.existsSync(pagesDir) ? pagesDir : null;
    if (rootDir) {
      const walkDir = (d, base) => {
        for (const entry of fs4.readdirSync(d, { withFileTypes: true })) {
          const full = path4.join(d, entry.name);
          if (entry.isDirectory()) {
            walkDir(full, base);
            continue;
          }
          if (/^(page|route)\.(tsx?|jsx?)$/.test(entry.name)) {
            const rel = path4.dirname(full).replace(base, "").replace(/\\/g, "/") || "/";
            const route = rel || "/";
            if (!routes.includes(route)) routes.push(route);
          }
        }
      };
      walkDir(rootDir, rootDir);
    }
  } else if (framework === "Express") {
    const walkFiles = (d) => {
      const files = [];
      for (const entry of fs4.readdirSync(d, { withFileTypes: true })) {
        const full = path4.join(d, entry.name);
        if (entry.isDirectory() && !["node_modules", ".git", "dist", "build"].includes(entry.name)) {
          files.push(...walkFiles(full));
        } else if (entry.isFile() && /\.(js|ts)$/.test(entry.name)) files.push(full);
      }
      return files;
    };
    for (const file of walkFiles(dir)) {
      try {
        const content = fs4.readFileSync(file, "utf8");
        const matches = content.matchAll(/(?:app|router)\.\w+\(['"]([/][^'"]*)['"]/g);
        for (const m of matches) {
          if (!routes.includes(m[1])) routes.push(m[1]);
        }
      } catch {
      }
    }
  } else {
    const walkFiles = (d) => {
      const files = [];
      for (const entry of fs4.readdirSync(d, { withFileTypes: true })) {
        const full = path4.join(d, entry.name);
        if (entry.isDirectory() && !["node_modules", ".git", "dist", "build"].includes(entry.name)) {
          files.push(...walkFiles(full));
        } else if (entry.isFile() && /\.(js|ts|tsx|jsx)$/.test(entry.name)) files.push(full);
      }
      return files;
    };
    for (const file of walkFiles(dir)) {
      try {
        const content = fs4.readFileSync(file, "utf8");
        const matches = content.matchAll(/['"]([/][a-z][a-z0-9\-/]*)['"]/gi);
        for (const m of matches) {
          if (!routes.includes(m[1])) routes.push(m[1]);
        }
      } catch {
      }
    }
  }
  if (routes.length === 0) {
    warn("No routes discovered. Try a different directory or framework.");
    return;
  }
  const baseUrl = await askQuestion(import_chalk.default.cyan("\n  Base URL for this app? (e.g. http://localhost:3000): "));
  if (!baseUrl) {
    errorMsg("Base URL required");
    process.exit(1);
  }
  console.log(import_chalk.default.bold("\n  Discovered Routes\n"));
  console.log(import_chalk.default.gray("  Route                          Flow"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(55)));
  let created = 0;
  for (const route of routes.slice(0, 50)) {
    const fullUrl = baseUrl.replace(/\/$/, "") + route;
    const flowName = `Check ${route}`;
    const nodes = [
      { id: "start", type: "start", label: "Start", url: fullUrl },
      { id: "step-1", type: "action", label: `Navigate to ${route}`, action: "navigate", url: fullUrl },
      { id: "step-2", type: "action", label: `Assert URL contains ${route}`, action: "assert:url", value: route },
      { id: "end", type: "end", label: "End" }
    ];
    const edges = [
      { id: "e0", source: "start", target: "step-1" },
      { id: "e1", source: "step-1", target: "step-2" },
      { id: "e2", source: "step-2", target: "end" }
    ];
    db.createFlow({ name: flowName, appUrl: fullUrl, graph: { nodes, edges, appUrl: fullUrl }, createdBy: "agent" });
    created++;
    console.log(`  ${import_chalk.default.white(route.padEnd(30))} ${import_chalk.default.green("\u2713 " + flowName)}`);
  }
  console.log();
  success(`Found ${routes.length} routes \u2192 created ${created} draft flows`);
  info(`Run: ${import_chalk.default.green("ghostrun flow:list")}`);
  console.log();
}
function getTemplatesDir() {
  const candidates = [
    path4.join(__dirname, "templates"),
    path4.join(process.cwd(), "templates")
  ];
  for (const c of candidates) {
    if (fs4.existsSync(c)) return c;
  }
  return candidates[0];
}
async function runStoreList() {
  const dir = getTemplatesDir();
  if (!fs4.existsSync(dir)) {
    errorMsg("Templates directory not found at " + dir);
    return;
  }
  const files = fs4.readdirSync(dir).filter((f) => f.endsWith(".flow.json"));
  if (files.length === 0) {
    warn("No templates found.");
    return;
  }
  console.log(import_chalk.default.bold("\n  Flow Templates\n"));
  console.log(import_chalk.default.gray("  Name                     Tags                    Variables"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(72)));
  for (const file of files) {
    try {
      const t = JSON.parse(fs4.readFileSync(path4.join(dir, file), "utf8"));
      const slug = file.replace(".flow.json", "");
      const tags = (t.tags || []).slice(0, 3).map((g) => import_chalk.default.cyan(g)).join(import_chalk.default.gray(", "));
      const vars = (t.variables || []).map((v) => import_chalk.default.yellow(`{{${v}}}`)).join(import_chalk.default.gray(", "));
      console.log(`  ${import_chalk.default.white(slug.padEnd(24))} ${tags.padEnd(30)} ${vars}`);
      console.log(`  ${import_chalk.default.gray(" ".repeat(24))} ${import_chalk.default.gray(t.description.slice(0, 60))}`);
    } catch {
    }
  }
  console.log();
  console.log(import_chalk.default.gray("  Install with: ghostrun store install <name>"));
  console.log(import_chalk.default.gray("  Variables:   ghostrun run <flow-name> --var BASE_URL=https://..."));
  console.log();
}
async function runStoreInstall(slug) {
  const dir = getTemplatesDir();
  const file = path4.join(dir, slug.endsWith(".flow.json") ? slug : slug + ".flow.json");
  if (!fs4.existsSync(file)) {
    errorMsg(`Template not found: ${slug}`);
    info("Available templates: " + import_chalk.default.cyan("ghostrun store list"));
    process.exit(1);
  }
  let t;
  try {
    t = JSON.parse(fs4.readFileSync(file, "utf8"));
  } catch {
    errorMsg("Invalid template file");
    process.exit(1);
    return;
  }
  const existing = db.findFlowByName(t.flow.name);
  if (existing) {
    warn(`Flow "${t.flow.name}" already installed (id: ${existing.id.slice(0, 8)})`);
    const overwrite = await confirmAction(import_chalk.default.cyan("  Overwrite? (y/N) "), false);
    if (!overwrite) {
      info("Skipped.");
      return;
    }
    db.deleteFlow(existing.id);
  }
  const flow = db.createFlow({ name: t.flow.name, description: t.flow.description, appUrl: t.flow.appUrl, graph: t.flow.graph, createdBy: "agent" });
  divider();
  success(`Template installed: ${import_chalk.default.white(t.flow.name)}`);
  info(`ID: ${import_chalk.default.gray(flow.id.slice(0, 8))}`);
  if (t.variables?.length) {
    console.log();
    console.log(import_chalk.default.bold("  Variables required:\n"));
    for (const v of t.variables) {
      console.log(`  ${import_chalk.default.yellow("{{" + v + "}}")}  \u2192  ${import_chalk.default.gray("--var " + v + "=<value>")}`);
    }
    console.log();
    console.log(import_chalk.default.gray("  Or set them in .ghostrun.env:\n"));
    for (const v of t.variables) {
      console.log(import_chalk.default.gray(`  ${v}=your-value`));
    }
    console.log();
    info(`Run with: ${import_chalk.default.green(`ghostrun run "${t.flow.name}" --var BASE_URL=https://...`)}`);
  } else {
    info(`Run with: ${import_chalk.default.green(`ghostrun run ${flow.id.slice(0, 8)}`)}`);
  }
  console.log();
}
async function runInit(extraArgs = []) {
  const nonInteractive = extraArgs.includes("--yes") || extraArgs.includes("-y") || extraArgs.includes("--ci");
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  GhostRun Setup Wizard\n"));
  fs4.mkdirSync(path4.join(DATA_PATH2, "data"), { recursive: true });
  fs4.mkdirSync(path4.join(DATA_PATH2, "screenshots"), { recursive: true });
  fs4.mkdirSync(path4.join(DATA_PATH2, "sessions"), { recursive: true });
  success("Data directory ready: " + import_chalk.default.cyan(DATA_PATH2));
  ensureProjectWorkspace();
  success("Project workspace ready: " + import_chalk.default.cyan(PROJECT_GHOSTRUN_PATH));
  const { execSync } = require("child_process");
  let chromiumOk = false;
  try {
    execSync(`node -e "require('playwright')"`, { stdio: "ignore" });
    chromiumOk = true;
    success("Playwright: installed");
  } catch {
    warn("Playwright not found");
  }
  if (!chromiumOk) {
    const installPw = nonInteractive || await confirmAction(import_chalk.default.cyan("  Install Playwright + Chromium? (Y/n) "), true);
    if (installPw) {
      console.log(import_chalk.default.gray("  Running: npm install playwright...\n"));
      try {
        execSync("npm install playwright", { stdio: "inherit", cwd: __dirname });
        execSync("npx playwright install chromium", { stdio: "inherit" });
        success("Playwright + Chromium installed");
      } catch {
        errorMsg("Installation failed. Run manually: npm install playwright && npx playwright install chromium");
      }
    }
  } else {
    try {
      execSync("npx playwright install chromium --dry-run", { stdio: "ignore" });
    } catch {
      const installBrowser = nonInteractive || await confirmAction(import_chalk.default.cyan("  Chromium browser not found. Install it? (Y/n) "), true);
      if (installBrowser) {
        execSync("npx playwright install chromium", { stdio: "inherit" });
        success("Chromium installed");
      }
    }
  }
  console.log();
  const ollamaModel = await isOllamaRunning();
  if (ollamaModel) {
    success("AI: Ollama running \u2014 " + import_chalk.default.cyan(ollamaModel));
  } else if (process.env.ANTHROPIC_API_KEY) {
    success("AI: Anthropic API key detected");
  } else {
    warn("No AI provider found");
    console.log();
    console.log(import_chalk.default.bold("  Choose an AI provider:\n"));
    console.log(`  ${import_chalk.default.green("A)")} Ollama ${import_chalk.default.gray("(recommended \u2014 free, fully local, no internet needed)")}`);
    console.log(import_chalk.default.gray("     brew install ollama && ollama pull gemma3:4b && ollama serve\n"));
    console.log(`  ${import_chalk.default.cyan("B)")} Anthropic ${import_chalk.default.gray("(cloud \u2014 needs API key)")}`);
    console.log(import_chalk.default.gray("     export ANTHROPIC_API_KEY=sk-ant-...\n"));
    const choice = nonInteractive ? false : await confirmAction(import_chalk.default.cyan("  Try to start Ollama now? (y/N) "), false);
    if (choice) {
      try {
        const { spawn: sp } = require("child_process");
        sp("ollama", ["serve"], { detached: true, stdio: "ignore" }).unref();
        await new Promise((r) => setTimeout(r, 2e3));
        const modelCheck = await isOllamaRunning();
        if (modelCheck) success("Ollama started: " + import_chalk.default.cyan(modelCheck));
        else {
          warn("Ollama started but no model found. Pull one:");
          console.log(import_chalk.default.cyan("  ollama pull gemma3:4b"));
        }
      } catch {
        warn("Could not start Ollama. Install it from https://ollama.com");
      }
    }
  }
  console.log();
  if (isCrawleeEnabled()) {
    success("Scraping: Crawlee enabled");
  } else {
    const enableScraping = nonInteractive ? false : await confirmAction(import_chalk.default.cyan("  Enable optional website scraping with Crawlee? (y/N) "), false);
    if (enableScraping) {
      try {
        await loadCrawlee();
        setCrawleeEnabled(true);
        success("Scraping: Crawlee enabled");
      } catch {
        warn("Crawlee package not found. Install it, then rerun init:");
        console.log(import_chalk.default.cyan("  npm install crawlee"));
      }
    }
  }
  console.log();
  const envFile = path4.join(process.cwd(), ".ghostrun.env");
  if (!fs4.existsSync(envFile)) {
    fs4.writeFileSync(envFile, [
      "# GhostRun variables \u2014 used as {{VARIABLE}} in flows",
      "# BASE_URL=https://your-app.com",
      "# EMAIL=test@example.com",
      "# PASSWORD=secret",
      ""
    ].join("\n"));
    info(".ghostrun.env template created in current directory");
  } else {
    info(".ghostrun.env already exists");
  }
  const projectConfig = readConfig();
  info(`Interaction mode: ${projectConfig.interactionMode || "assist"}`);
  info(`AI usage tracking: ${projectConfig.ai?.trackUsage === false ? "disabled" : "enabled"}`);
  info("Run `ghostrun audit` to check for secret leaks before committing");
  divider();
  console.log(import_chalk.default.bold.green("\n  Setup complete!\n"));
  console.log("  " + import_chalk.default.gray("Record a flow:   ") + import_chalk.default.cyan("ghostrun learn https://your-app.com"));
  console.log("  " + import_chalk.default.gray("Run a flow:      ") + import_chalk.default.cyan("ghostrun run <name>"));
  console.log("  " + import_chalk.default.gray("Run (visible):   ") + import_chalk.default.cyan("ghostrun run <name> --visible"));
  if (isCrawleeEnabled()) {
    console.log("  " + import_chalk.default.gray("Scrape a site:   ") + import_chalk.default.cyan("ghostrun scrape https://your-app.com --output json"));
  }
  console.log("  " + import_chalk.default.gray("Ask the bot:     ") + import_chalk.default.cyan("ghostrun chat"));
  console.log("  " + import_chalk.default.gray("Browse templates:") + import_chalk.default.cyan("ghostrun store list"));
  console.log();
}
async function runMonitorOnce(flowId) {
  printLogo();
  divider();
  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) {
    errorMsg("Flow not found: " + flowId);
    process.exit(1);
  }
  const outputIdx = process.argv.indexOf("--output");
  const jsonOutput = outputIdx !== -1 && process.argv[outputIdx + 1] === "json";
  console.log(import_chalk.default.bold("\n  Monitor: ") + import_chalk.default.white(flow.name) + "\n");
  const previousRuns = db.listRuns(flow.id, 2);
  const prevData = {};
  if (previousRuns.length > 0) {
    db.getRunData(previousRuns[0].id).forEach((d) => {
      prevData[d.variableName] = d.variableValue;
    });
  }
  const result = await executeFlow(flow.id, globalVars, { jsonOutput: false, quiet: false });
  const extractedData = result.extractedData;
  if (Object.keys(extractedData).length === 0) {
    console.log();
    warn("No data extracted. Add extract: actions to your flow to capture data.");
    console.log(import_chalk.default.gray("  Flow JSON example:"));
    console.log(import_chalk.default.gray('  { "action": "extract", "variable": "price", "selector": ".price" }'));
    console.log();
    return;
  }
  divider();
  console.log(import_chalk.default.bold("\n  Extracted Data\n"));
  let hasChanges = false;
  for (const [key, value] of Object.entries(extractedData)) {
    const prev = prevData[key];
    if (prev !== void 0 && prev !== value) {
      console.log(`  ${import_chalk.default.yellow("~")} ${import_chalk.default.white(key.padEnd(20))} ${import_chalk.default.gray(prev.slice(0, 40))} ${import_chalk.default.yellow("\u2192")} ${import_chalk.default.yellow(value.slice(0, 40))}`);
      hasChanges = true;
    } else {
      console.log(`  ${import_chalk.default.green("=")} ${import_chalk.default.white(key.padEnd(20))} ${import_chalk.default.cyan(value.slice(0, 60))}`);
    }
  }
  console.log();
  if (Object.keys(prevData).length > 0) {
    if (hasChanges) {
      console.log(import_chalk.default.yellow.bold("  \u26A0 Changes detected since last run"));
    } else {
      console.log(import_chalk.default.green("  \u2713 No changes since last run"));
    }
  } else {
    console.log(import_chalk.default.gray("  (no previous run to compare \u2014 run again to see changes)"));
  }
  if (jsonOutput) {
    console.log("\n" + JSON.stringify({ flowId: flow.id, flowName: flow.name, runId: result.runId, extractedData, hasChanges }, null, 2));
  }
  console.log();
}
async function runScrapeCommand(url, extraArgs = []) {
  const maxPages = parseNumberFlag(extraArgs, "--max-pages", 1, 100);
  const selector = parseFlagValue(extraArgs, "--selector");
  const jsonOutput = parseFlagValue(extraArgs, "--output") === "json" || extraArgs.includes("--json");
  if (!jsonOutput) {
    printLogo();
    divider();
    console.log(import_chalk.default.bold("\n  Scrape Website\n"));
    info("URL: " + import_chalk.default.cyan(url));
    info("Max pages: " + import_chalk.default.white(String(maxPages)));
    if (selector) info("Selector: " + import_chalk.default.white(selector));
    console.log();
  }
  try {
    const result = await runCrawleeScrape(url, { maxPages, selector, reason: "manual", quiet: jsonOutput });
    if (jsonOutput) {
      console.log(JSON.stringify({
        scrapeId: result.id,
        status: result.status,
        url: result.url,
        pages: result.pages.length,
        resultPath: result.resultPath,
        data: result.pages
      }));
      return;
    }
    success(`Scraped ${result.pages.length} page${result.pages.length !== 1 ? "s" : ""}`);
    info("Scrape ID: " + import_chalk.default.gray(result.id.slice(0, 8)));
    info("Result: " + import_chalk.default.cyan(result.resultPath));
    const first = result.pages[0];
    if (first) {
      console.log();
      console.log(import_chalk.default.bold("  Preview\n"));
      if (first.title) console.log("  " + import_chalk.default.gray("Title:   ") + import_chalk.default.white(first.title));
      if (first.headings.length) console.log("  " + import_chalk.default.gray("Headings: ") + first.headings.slice(0, 4).join(import_chalk.default.gray(" \xB7 ")));
      if (first.buttons.length) console.log("  " + import_chalk.default.gray("Buttons: ") + first.buttons.slice(0, 6).map((b) => b.text).join(import_chalk.default.gray(" \xB7 ")));
    }
    console.log();
  } catch (err) {
    if (jsonOutput) {
      console.log(JSON.stringify({ status: "failed", error: err instanceof Error ? err.message : String(err) }));
    } else {
      errorMsg(err instanceof Error ? err.message : String(err));
    }
    process.exitCode = 1;
  }
}
async function runScrapeAndFlowCommand(url, extraArgs = []) {
  const flowId = parseFlagValue(extraArgs, "--flow");
  if (!flowId) {
    errorMsg("Usage: scrape:run <url> --flow <id|name> [--max-pages N] [--output json]");
    process.exit(1);
  }
  const maxPages = parseNumberFlag(extraArgs, "--max-pages", 1, 100);
  const selector = parseFlagValue(extraArgs, "--selector");
  const jsonOutput = parseFlagValue(extraArgs, "--output") === "json" || extraArgs.includes("--json");
  let scrapeResult = null;
  try {
    scrapeResult = await runCrawleeScrape(url, { maxPages, selector, reason: "scrape-run", quiet: jsonOutput });
    const runResult = await executeFlow(flowId, globalVars, { jsonOutput, quiet: jsonOutput });
    if (jsonOutput) {
      console.log(JSON.stringify({
        scrape: {
          scrapeId: scrapeResult.id,
          status: scrapeResult.status,
          pages: scrapeResult.pages.length,
          resultPath: scrapeResult.resultPath,
          data: scrapeResult.pages
        },
        run: runResult
      }));
      return;
    }
    divider();
    success(`Scraped ${scrapeResult.pages.length} page${scrapeResult.pages.length !== 1 ? "s" : ""} and ran flow`);
    info("Scrape ID: " + import_chalk.default.gray(scrapeResult.id.slice(0, 8)));
    info("Run ID: " + import_chalk.default.gray(runResult.runId.slice(0, 8)));
    console.log();
  } catch (err) {
    if (jsonOutput) {
      console.log(JSON.stringify({
        scrape: scrapeResult ? { scrapeId: scrapeResult.id, resultPath: scrapeResult.resultPath } : null,
        status: "failed",
        error: err instanceof Error ? err.message : String(err)
      }));
    } else {
      errorMsg(err instanceof Error ? err.message : String(err));
    }
    process.exitCode = 1;
  }
}
async function runScrapeList() {
  const scrapes = db.listScrapeRuns(20);
  console.log(import_chalk.default.bold("\n  Scrapes\n"));
  if (scrapes.length === 0) {
    warn("No scrapes found. Run: " + import_chalk.default.cyan("ghostrun scrape <url>"));
    console.log();
    return;
  }
  console.log(import_chalk.default.gray("  ID        Status     Pages  Reason          URL"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(86)));
  for (const s of scrapes) {
    const status = s.status === "complete" ? import_chalk.default.green("complete") : s.status === "failed" ? import_chalk.default.red("failed") : import_chalk.default.yellow(s.status);
    console.log(`  ${import_chalk.default.gray(s.id.slice(0, 8))}  ${status.padEnd(18)} ${import_chalk.default.white(String(s.pagesCount).padEnd(5))}  ${import_chalk.default.gray((s.reason || "").padEnd(14).slice(0, 14))} ${import_chalk.default.cyan(s.url.slice(0, 44))}`);
  }
  console.log();
}
async function runScrapeShow(id) {
  const scrape = db.findScrapeRunByPartialId(id);
  if (!scrape) {
    errorMsg("Scrape not found: " + id);
    process.exit(1);
  }
  const result = readScrapeResult(scrape.resultPath);
  console.log(JSON.stringify({
    scrapeId: scrape.id,
    status: scrape.status,
    url: scrape.url,
    reason: scrape.reason,
    maxPages: scrape.maxPages,
    selector: scrape.selector,
    pagesCount: scrape.pagesCount,
    resultPath: scrape.resultPath,
    runId: scrape.runId,
    stepNumber: scrape.stepNumber,
    exploreReportId: scrape.exploreReportId,
    errorMessage: scrape.errorMessage,
    data: result?.pages || []
  }, null, 2));
}
async function runChat() {
  printLogo();
  divider();
  const ollamaModel = await isOllamaRunning();
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  if (!ollamaModel && !hasAnthropic) {
    errorMsg("No AI provider available for chat.");
    console.log(import_chalk.default.gray("\n  Option A (free + local): brew install ollama && ollama pull gemma3:4b && ollama serve"));
    console.log(import_chalk.default.gray("  Option B (cloud):        export ANTHROPIC_API_KEY=sk-ant-...\n"));
    process.exit(1);
  }
  const providerLabel = ollamaModel ? import_chalk.default.green(`Ollama (${ollamaModel})`) : import_chalk.default.cyan("Anthropic");
  console.log(import_chalk.default.bold("\n  \u{1F47B} GhostRun Chat\n"));
  console.log("  " + import_chalk.default.gray("Powered by ") + providerLabel + import_chalk.default.gray("  \xB7  type ") + import_chalk.default.cyan("exit") + import_chalk.default.gray(" to quit"));
  console.log("  " + import_chalk.default.gray('Ask about flows, failures, commands, or say "run <flow-name>"'));
  console.log();
  divider();
  function buildSystemPrompt() {
    const flows = db.listFlows();
    const recentRuns = db.listRuns(void 0, 10);
    const flowsList = flows.length > 0 ? flows.map((f) => {
      const stats = db.getFlowStats(f.id);
      return `- "${f.name}" (id:${f.id.slice(0, 8)}, url:${f.appUrl || "N/A"}, ${stats.totalRuns} runs, ${Math.round(stats.passRate * 100)}% pass rate, by:${f.createdBy})`;
    }).join("\n") : "(no flows yet)";
    const runsList = recentRuns.length > 0 ? recentRuns.map((r) => {
      const fl = db.getFlow(r.flowId);
      const dur = r.duration ? `${(r.duration / 1e3).toFixed(1)}s` : "?";
      const when = timeAgo(r.startedAt);
      const note = r.summary ? ` \u2014 ${r.summary.split("\n")[0].slice(0, 60)}` : "";
      return `- ${r.status === "passed" ? "\u2713" : "\u2717"} "${fl?.name || "Unknown"}" ${when} (${dur})${note}`;
    }).join("\n") : "(no runs yet)";
    return `You are GhostRun Assistant \u2014 an embedded AI helper for GhostRun, a memory-driven web automation CLI.

GhostRun lets developers record browser flows and replay them headlessly for testing, monitoring, and data extraction. Uses Playwright + SQLite. AI (Ollama/Anthropic) powers failure analysis, flow generation, and this chat.

## Important Response Rules
1. Be concise and practical \u2014 developers prefer direct answers
2. If asked to RUN an existing flow, respond with exactly: [RUN: <flow-name>]
3. Never invent flow names, IDs, or commands \u2014 only reference what exists in the lists below
4. If you don't know something, say so \u2014 don't guess
5. When suggesting fixes, be specific and actionable

## Core Commands
- ghostrun learn <url>          \u2014 Record a flow (real browser)
- ghostrun run <id|name>        \u2014 Run headlessly
- ghostrun run <name> --visible \u2014 Run with visible browser (for debugging)
- ghostrun run <name> --output json \u2014 JSON output with extracted data
- ghostrun flow:list            \u2014 List flows with pass rates
- ghostrun report list          \u2014 Recent runs
- ghostrun report show <id>     \u2014 Per-step details + screenshots
- ghostrun report analyze <id>  \u2014 AI failure analysis
- ghostrun flow:fix <id>        \u2014 Fix broken selectors interactively
- ghostrun author create <desc> \u2014 Generate flow from description
- ghostrun chat                 \u2014 This chat interface
- ghostrun init                 \u2014 Setup wizard
- ghostrun status               \u2014 Stats + AI provider info
- ghostrun serve --ui           \u2014 Web dashboard at http://localhost:3000

## Flow Actions Supported
navigate, reload, back, forward,
click, dblclick, fill, type, clear, select, check, focus, hover,
drag, keyboard, upload,
wait, wait:text, wait:url, wait:ms,
scroll, scroll:element, scroll:bottom, scroll:load,
assert:visible, assert:hidden, assert:text, assert:not-text, assert:value, assert:count, assert:attr,
extract, screenshot, eval

## Variables
Use {{VAR_NAME}} in flows. Pass with --var KEY=value or .ghostrun.env file in CWD.

## Creator Types
\u{1F464} human = recorded live \xB7 \u{1F916} agent = AI-generated (via create/explore)

## YOUR FLOWS RIGHT NOW
${flowsList}

## RECENT RUN HISTORY
${runsList}

When a flow fails, check if recent runs have the same issue. Suggest specific fixes based on the error patterns.`;
  }
  const conversationHistory = [];
  async function* streamResponse(userMessage) {
    conversationHistory.push({ role: "user", content: userMessage });
    if (ollamaModel) {
      const baseUrl = process.env.GHOSTRUN_OLLAMA_URL || "http://localhost:11434";
      let fullResponse = "";
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [
              { role: "system", content: buildSystemPrompt() },
              ...conversationHistory
            ],
            stream: true
          }),
          signal: AbortSignal.timeout(getOllamaTimeoutMs(9e4))
        });
        if (!res.ok || !res.body) {
          yield "(Ollama unavailable \u2014 is it running?)";
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              const chunk = data.message?.content || "";
              if (chunk) {
                yield chunk;
                fullResponse += chunk;
              }
              if (data.done) {
                conversationHistory.push({ role: "assistant", content: fullResponse });
                return;
              }
            } catch {
            }
          }
        }
        if (fullResponse) conversationHistory.push({ role: "assistant", content: fullResponse });
      } catch (err) {
        yield `
(Error: ${err instanceof Error ? err.message : err})`;
      }
    } else {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      try {
        const msg = await client.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1024,
          system: buildSystemPrompt(),
          messages: conversationHistory.map((m) => ({ role: m.role, content: m.content }))
        });
        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "(no response)";
        conversationHistory.push({ role: "assistant", content: text });
        yield text;
      } catch (err) {
        yield `(Anthropic error: ${err instanceof Error ? err.message : err})`;
      }
    }
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const askUser = () => new Promise((resolve3) => {
    process.stdout.write(import_chalk.default.cyan("\n  You  \u203A "));
    rl.once("line", resolve3);
  });
  while (true) {
    let input;
    try {
      input = (await askUser()).trim();
    } catch {
      break;
    }
    if (!input || ["exit", "quit", "q", ":q", "bye"].includes(input.toLowerCase())) {
      console.log(import_chalk.default.gray("\n  Goodbye! \u{1F47B}\n"));
      rl.close();
      break;
    }
    process.stdout.write(import_chalk.default.magenta("  Ghost \u203A "));
    let fullResponse = "";
    for await (const chunk of streamResponse(input)) {
      process.stdout.write(chunk);
      fullResponse += chunk;
    }
    process.stdout.write("\n");
    const runMatch = fullResponse.match(/\[RUN:\s*([^\]]+)\]/i);
    if (runMatch) {
      const flowQuery = runMatch[1].trim();
      const targetFlow = db.findFlowByPartialId(flowQuery) || db.findFlowByName(flowQuery);
      if (targetFlow) {
        process.stdout.write(import_chalk.default.cyan(`
  Run "${targetFlow.name}"? (y/N) `));
        const confirm = await new Promise((resolve3) => rl.once("line", resolve3));
        if (confirm.trim().toLowerCase() === "y") {
          console.log();
          const result = await executeFlow(targetFlow.id, globalVars);
          console.log();
          const resultSummary = result.passed ? `Flow "${targetFlow.name}" passed in ${result.duration}ms.` : `Flow "${targetFlow.name}" failed in ${result.duration}ms.`;
          conversationHistory.push({ role: "user", content: `[SYSTEM: ${resultSummary}]` });
        }
      } else {
        warn(`Flow not found: "${flowQuery}"`);
      }
    }
  }
}
function detectHomeState() {
  const globalReady = fs4.existsSync(path4.join(DATA_PATH2, "data", "ghostrun.db"));
  const projectReady = fs4.existsSync(PROJECT_CONFIG_PATH);
  const flows = db.listFlows();
  const profilesDir = path4.join(PROJECT_GHOSTRUN_PATH, "profiles");
  const profileCount = fs4.existsSync(profilesDir) ? fs4.readdirSync(profilesDir).filter((f) => f.endsWith(".json")).length : 0;
  const openRepairs = listRepairProposals(50).filter((p) => p.status === "proposed").length;
  const recentRuns = db.listRuns(void 0, 10);
  const lastFail = recentRuns.find((r) => r.status === "failed");
  const config = readConfig();
  return {
    globalReady,
    projectReady,
    hasFlows: flows.length > 0,
    flowCount: flows.length,
    hasProfiles: profileCount > 0,
    profileCount,
    openRepairs,
    lastFailedRun: lastFail ? { id: lastFail.id, flowName: db.getFlow(lastFail.flowId)?.name || "Unknown" } : null,
    cwd: process.cwd(),
    projectName: config.project?.name || null,
    activeProfile: config.activeProfile || null
  };
}
async function runSetupFunnel(state) {
  const clack = await import("@clack/prompts");
  const { intro, confirm, isCancel, note, outro, text } = clack;
  if (!state.globalReady) {
    console.clear();
    printLogo();
    intro(import_chalk.default.cyan(" Welcome to GhostRun "));
    note(
      "First-time setup installs Playwright Chromium and creates ~/.ghostrun/\nYou only do this once per machine.",
      "Setup required"
    );
    const setup = await confirm({ message: "Set up GhostRun now?", initialValue: true });
    if (isCancel(setup) || !setup) {
      outro("Run ghostrun init when you are ready.");
      process.exit(0);
    }
    console.log();
    await runInit(["--yes"]);
    return runSetupFunnel(detectHomeState());
  }
  if (!state.projectReady) {
    console.clear();
    printLogo();
    intro(import_chalk.default.cyan(" New project "));
    note(
      `No ${import_chalk.default.cyan(".ghostrun/")} in:
  ${state.cwd}

Flows, profiles, baselines, and CI artifacts live here \u2014 commit .ghostrun/ to git (exclude secrets).`,
      "Project workspace"
    );
    const initProject = await confirm({ message: "Initialize GhostRun in this folder?", initialValue: true });
    if (isCancel(initProject) || !initProject) {
      outro("Open your app repo and run ghostrun again, or run ghostrun init.");
      process.exit(0);
    }
    ensureProjectWorkspace();
    const config = readConfig();
    if (!config.project?.name) {
      const name = await text({
        message: "Project name (for reports):",
        placeholder: path4.basename(state.cwd),
        defaultValue: path4.basename(state.cwd)
      });
      if (!isCancel(name) && name) {
        config.project = { ...config.project, name: String(name), workspaceVersion: "1" };
        writeConfig(config);
      }
    }
    if (!state.hasProfiles) {
      const addProfile = await confirm({ message: "Create a staging profile with a base URL?", initialValue: true });
      if (!isCancel(addProfile) && addProfile) {
        const baseUrl = await text({
          message: "Staging / app URL:",
          placeholder: "https://staging.yourapp.com",
          validate: (v) => !v || !v.startsWith("http") ? "Enter a URL starting with http" : void 0
        });
        if (!isCancel(baseUrl) && baseUrl) {
          await runProfileCreate("staging", String(baseUrl));
          const staging = getProfile("staging");
          if (staging) {
            await setupProfileAccountsInteractive(staging, { confirm, text, isCancel, note });
            const useMailpit = await confirm({
              message: "Enable Mailpit for magic-link email flows? (optional \u2014 skip if you use password login)",
              initialValue: false
            });
            if (!isCancel(useMailpit) && useMailpit) {
              staging.services = {
                ...staging.services,
                email: { provider: "mailpit", apiUrl: "http://localhost:8025", timeoutMs: 45e3 }
              };
              saveProfile(staging);
              copyDevServicesTemplate();
              note(
                "Start Mailpit when needed:\n  docker compose -f .ghostrun/services/dev.compose.yml --profile mailpit up -d",
                "Optional email"
              );
            }
          }
          await runProfileUse("staging");
        }
      }
    }
  }
}
async function runHome() {
  let state = detectHomeState();
  await runSetupFunnel(state);
  state = detectHomeState();
  await runInteractive(state);
}
async function runInteractive(initialState) {
  const clack = await import("@clack/prompts");
  const { intro, outro, select, text, isCancel, note, log } = clack;
  console.clear();
  printLogo();
  const flows = db.listFlows();
  const runs = db.listRuns(void 0, 100);
  const passed = runs.filter((r) => r.status === "passed").length;
  const failed = runs.length - passed;
  const humanFlows = flows.filter((f) => f.createdBy === "human").length;
  const agentFlows = flows.filter((f) => f.createdBy === "agent").length;
  const ollamaModel = await isOllamaRunning();
  const aiProvider = ollamaModel ? `Ollama (${ollamaModel})` : process.env.ANTHROPIC_API_KEY ? "Anthropic" : "none";
  const activeProfile = readConfig().activeProfile || "(none)";
  intro(import_chalk.default.cyan(" GhostRun \u2014 your QA agent "));
  let homeState = initialState || detectHomeState();
  const hints = [];
  if (!homeState.hasFlows) hints.push("\u2192 Record your first flow to get started");
  if (homeState.hasFlows && !homeState.activeProfile) hints.push("\u2192 Set a profile: ghostrun profile use staging");
  if (homeState.lastFailedRun) hints.push(`\u2192 Last failure: ${homeState.lastFailedRun.flowName}`);
  if (homeState.openRepairs > 0) hints.push(`\u2192 ${homeState.openRepairs} repair proposal(s) waiting for review`);
  if (hints.length) {
    note(hints.map((h) => `  ${h}`).join("\n"), "Suggested");
  }
  const passRateBar = runs.length > 0 ? progressBar(passed, runs.length, 12) : "";
  const passRatePct = runs.length > 0 ? `  ${Math.round(passed / runs.length * 100)}%` : "";
  const flowsLine = flows.length > 0 ? `  Flows:    ${import_chalk.default.white(String(flows.length))}  (${import_chalk.default.blue(`${humanFlows} \u{1F464}`)}  ${import_chalk.default.magenta(`${agentFlows} \u{1F916}`)})` : `  Flows:    ${import_chalk.default.white("0")}`;
  note(
    [
      flowsLine,
      `  Runs:     ${import_chalk.default.white(String(runs.length))}  ${import_chalk.default.green(String(passed) + " passed")}  ${failed > 0 ? import_chalk.default.red(String(failed) + " failed") : import_chalk.default.gray("0 failed")}`,
      runs.length > 0 ? `  Rate:     ${passRateBar}${import_chalk.default.gray(passRatePct)}` : "",
      `  Profile:  ${import_chalk.default.cyan(activeProfile)}`,
      `  AI:       ${ollamaModel ? import_chalk.default.green(aiProvider) : process.env.ANTHROPIC_API_KEY ? import_chalk.default.cyan(aiProvider) : import_chalk.default.gray("none \u2014 run Ollama or set ANTHROPIC_API_KEY")}`
    ].filter(Boolean).join("\n"),
    "Status"
  );
  while (true) {
    homeState = detectHomeState();
    const menuOptions = [];
    if (homeState.lastFailedRun) {
      menuOptions.push({
        value: "last-failure",
        label: "\u{1F534} Review last failure",
        hint: homeState.lastFailedRun.flowName
      });
    }
    if (homeState.openRepairs > 0) {
      menuOptions.push({
        value: "repair",
        label: "\u{1F6E0}  Review repair proposals",
        hint: `${homeState.openRepairs} open`
      });
    }
    if (!homeState.hasFlows) {
      menuOptions.push({
        value: "author",
        label: "\u270D  Record your first flow",
        hint: "opens browser \u2014 no commands to memorize"
      });
    } else {
      menuOptions.push({
        value: "run",
        label: "\u25B6  Run a flow",
        hint: `${homeState.flowCount} saved`
      });
      menuOptions.push({
        value: "author",
        label: "\u270D  Create or capture flows",
        hint: "record, generate, explore, API"
      });
    }
    menuOptions.push(
      { value: "suite", label: "\u{1F9EA} Run a test suite", hint: "multiple flows" },
      { value: "profiles", label: "\u{1F5C2}  Manage profiles", hint: homeState.activeProfile || "none set" },
      { value: "improve", label: "\u{1F4C8} Improve & analyze", hint: "flaky flows, gaps" },
      { value: "reports", label: "\u{1F4CB} View run reports", hint: runs.length > 0 ? `${runs.length} runs` : "no runs yet" },
      { value: "monitor", label: "\u{1F550} Monitor & schedules", hint: "interval + cron" },
      { value: "services", label: "\u{1F4EC} Service Bridge", hint: "optional \u2014 Mailpit, webhooks" },
      { value: "doctor", label: "\u{1FA7A} Health check", hint: "doctor + audit" },
      { value: "chat", label: "\u{1F4AC} Ask GhostRun Bot", hint: "natural language" },
      { value: "serve", label: "\u{1F310}  Web dashboard", hint: "local UI" },
      { value: "exit", label: "\u2715  Exit" }
    );
    const action = await select({
      message: "What do you want to do?",
      options: menuOptions
    });
    if (isCancel(action) || action === "exit") {
      outro(import_chalk.default.gray("Bye."));
      process.exit(0);
    }
    if (action === "last-failure" && homeState.lastFailedRun) {
      console.log();
      await runShowRun(homeState.lastFailedRun.id.slice(0, 8));
      const evidenceReport = path4.join(getRunEvidenceDir(homeState.lastFailedRun.id), "report.html");
      if (fs4.existsSync(evidenceReport)) {
        log.info(`Full report: ${evidenceReport}`);
      }
      console.log();
      await _pause();
      continue;
    }
    if (action === "doctor") {
      console.log();
      await runDoctor();
      await runSecurityAudit(false);
      console.log();
      await _pause();
      continue;
    }
    if (action === "services") {
      const svc = await select({
        message: "Service Bridge:",
        options: [
          { value: "doctor", label: "Health check (Mailpit + hooks)" },
          { value: "inbox", label: "Show Mailpit inbox" },
          { value: "hooks", label: "List webhook captures" },
          { value: "up", label: "Show docker compose command" },
          { value: "back", label: "\u2190 Back" }
        ]
      });
      if (isCancel(svc) || svc === "back") continue;
      console.log();
      if (svc === "up") await runServicesCommand(["up"]);
      else await runServicesCommand([svc]);
      await _pause();
      continue;
    }
    if (action === "monitor") {
      const mon = await select({
        message: "Monitoring:",
        options: [
          { value: "schedule-list", label: "List schedules" },
          { value: "schedule-add", label: "Add schedule" },
          { value: "daemon", label: "Start scheduler daemon" },
          { value: "back", label: "\u2190 Back" }
        ]
      });
      if (isCancel(mon) || mon === "back") continue;
      if (mon === "schedule-list") {
        console.log();
        await runScheduleList();
        await _pause();
      } else if (mon === "daemon") {
        console.log();
        await runServe(["--daemon"]);
      } else if (mon === "schedule-add") {
        const flowsNow = db.listFlows();
        if (!flowsNow.length) {
          log.warn("Record a flow first.");
          continue;
        }
        const fc = await select({ message: "Flow:", options: flowsNow.map((f) => ({ value: f.id, label: f.name })) });
        if (isCancel(fc)) continue;
        const cron = await text({ message: "Cron expression:", placeholder: "0 9 * * *", defaultValue: "0 9 * * *" });
        if (isCancel(cron)) continue;
        const flow = db.getFlow(fc);
        if (flow) await runScheduleAdd(flow.name, String(cron));
        await _pause();
      }
      continue;
    }
    if (action === "run") {
      const currentFlows = db.listFlows();
      if (currentFlows.length === 0) {
        log.warn("No flows saved yet. Record one first.");
        continue;
      }
      const flowChoice = await select({
        message: "Which flow?",
        options: currentFlows.map((f) => ({
          value: f.id,
          label: f.name,
          hint: f.appUrl || ""
        }))
      });
      if (isCancel(flowChoice)) continue;
      console.log();
      await runFlow(flowChoice);
      console.log();
      await _pause();
    } else if (action === "author") {
      const authorAction = await select({
        message: "How do you want to create a flow?",
        options: [
          { value: "record", label: "Record browser flow", hint: "capture clicks and fills" },
          { value: "generate", label: "Generate from description", hint: "AI draft flow" },
          { value: "explore", label: "Explore a URL", hint: "discover candidate flows" },
          { value: "api", label: "Build API flow", hint: "interactive HTTP flow builder" },
          { value: "back", label: "\u2190 Back" }
        ]
      });
      if (isCancel(authorAction) || authorAction === "back") continue;
      if (authorAction === "record") {
        const url = await text({
          message: "URL to record:",
          placeholder: "https://yourapp.com",
          validate: (v) => !v || !v.startsWith("http") ? "Enter a valid URL starting with http" : void 0
        });
        if (isCancel(url)) continue;
        const name = await text({
          message: "Flow name:",
          placeholder: "e.g. Login Flow",
          defaultValue: new URL(url).hostname
        });
        if (isCancel(name)) continue;
        console.log();
        await runLearn(url, name);
      } else if (authorAction === "generate") {
        const description = await text({
          message: "Describe the flow:",
          placeholder: "Login as admin and verify dashboard loads",
          validate: (v) => !v ? "Description required" : void 0
        });
        if (isCancel(description)) continue;
        console.log();
        await runCreate(description);
      } else if (authorAction === "explore") {
        const url = await text({
          message: "URL to explore:",
          placeholder: "https://yourapp.com",
          validate: (v) => !v || !v.startsWith("http") ? "Enter a valid URL starting with http" : void 0
        });
        if (isCancel(url)) continue;
        console.log();
        await runExplore(url);
        await _pause();
      } else if (authorAction === "api") {
        console.log();
        await runApiLearn();
      }
    } else if (action === "suite") {
      const suites = db.listSuites();
      if (suites.length === 0) {
        log.warn("No suites. Create one with: ghostrun suite:create <name>");
        continue;
      }
      const { select: sel2, isCancel: isCan2 } = await import("@clack/prompts");
      const suiteChoice = await sel2({
        message: "Which suite?",
        options: suites.map((s) => ({ value: s.id, label: s.name }))
      });
      if (isCan2(suiteChoice)) continue;
      console.log();
      await runSuiteRun(suiteChoice);
      console.log();
      await _pause();
    } else if (action === "reports") {
      const recentRuns = db.listRuns(void 0, 20);
      if (recentRuns.length === 0) {
        log.warn("No runs yet. Run a flow first.");
        continue;
      }
      const runChoice = await select({
        message: "Which run?",
        options: recentRuns.map((r) => {
          const flow = db.getFlow(r.flowId);
          const icon = r.status === "passed" ? import_chalk.default.green("\u2713") : import_chalk.default.red("\u2717");
          const dur = r.duration ? ` ${r.duration}ms` : "";
          return {
            value: r.id,
            label: `${icon}  ${flow?.name || "Unknown"}${dur}`,
            hint: r.id.slice(0, 8)
          };
        })
      });
      if (isCancel(runChoice)) continue;
      console.log();
      await runShowRun(runChoice.slice(0, 8));
      console.log();
      await _pause();
    } else if (action === "repair") {
      const repairAction = await select({
        message: "Repair proposals:",
        options: [
          { value: "list", label: "List proposals" },
          { value: "apply", label: "Apply a proposal" },
          { value: "back", label: "\u2190 Back" }
        ]
      });
      if (isCancel(repairAction) || repairAction === "back") continue;
      if (repairAction === "list") {
        console.log();
        await runRepairList();
        await _pause();
      } else if (repairAction === "apply") {
        const proposals = listRepairProposals(20).filter((p) => p.status === "proposed");
        if (proposals.length === 0) {
          log.warn("No open repair proposals.");
          continue;
        }
        const choice = await select({
          message: "Which repair proposal?",
          options: proposals.map((p) => ({
            value: p.id,
            label: `${p.flowName} \xB7 step ${p.stepNumber || "\u2014"}`,
            hint: (p.proposedSelector || "").slice(0, 40)
          }))
        });
        if (isCancel(choice)) continue;
        console.log();
        await runRepairApply(choice);
        await _pause();
      }
    } else if (action === "profiles") {
      const profileAction = await select({
        message: "Profile management:",
        options: [
          { value: "list", label: "List profiles" },
          { value: "create", label: "Create profile" },
          { value: "use", label: "Use profile" },
          { value: "show", label: "Show profile" },
          { value: "back", label: "\u2190 Back" }
        ]
      });
      if (isCancel(profileAction) || profileAction === "back") continue;
      if (profileAction === "list") {
        console.log();
        await runProfileList();
        await _pause();
      } else if (profileAction === "create") {
        const name = await text({ message: "Profile name:", placeholder: "staging", validate: (v) => !v ? "Required" : void 0 });
        if (isCancel(name)) continue;
        const url = await text({ message: "Base URL (optional):", placeholder: "https://staging.example.com" });
        if (isCancel(url)) continue;
        await runProfileCreate(name, url || void 0);
      } else if (profileAction === "use") {
        const profiles = listProfiles();
        if (profiles.length === 0) {
          log.warn("No profiles found.");
          continue;
        }
        const choice = await select({ message: "Which profile?", options: profiles.map((p) => ({ value: p.name, label: p.name, hint: p.baseUrl || "" })) });
        if (isCancel(choice)) continue;
        await runProfileUse(choice);
      } else if (profileAction === "show") {
        const profiles = listProfiles();
        if (profiles.length === 0) {
          log.warn("No profiles found.");
          continue;
        }
        const choice = await select({ message: "Which profile?", options: profiles.map((p) => ({ value: p.name, label: p.name, hint: p.baseUrl || "" })) });
        if (isCancel(choice)) continue;
        console.log();
        await runProfileShow(choice);
        await _pause();
      }
    } else if (action === "improve") {
      console.log();
      await runImprove();
      await _pause();
    } else if (action === "schedule") {
      const schedAction = await select({
        message: "Schedule management:",
        options: [
          { value: "list", label: "List schedules" },
          { value: "add", label: "Add a schedule" },
          { value: "remove", label: "Remove a schedule" },
          { value: "back", label: "\u2190 Back" }
        ]
      });
      if (isCancel(schedAction) || schedAction === "back") continue;
      if (schedAction === "list") {
        console.log();
        await runScheduleList();
        console.log();
        await _pause();
      } else if (schedAction === "add") {
        const currentFlows = db.listFlows();
        if (currentFlows.length === 0) {
          log.warn("No flows to schedule.");
          continue;
        }
        const flowChoice = await select({
          message: "Which flow?",
          options: currentFlows.map((f) => ({ value: f.id, label: f.name }))
        });
        if (isCancel(flowChoice)) continue;
        const cron = await text({
          message: "Cron expression:",
          placeholder: "0 9 * * *  (daily at 9am)",
          validate: (v) => !v ? "Required" : void 0
        });
        if (isCancel(cron)) continue;
        await runScheduleAdd(flowChoice, cron);
      } else if (schedAction === "remove") {
        const schedules = db.listSchedules();
        if (schedules.length === 0) {
          log.warn("No schedules.");
          continue;
        }
        const schedChoice = await select({
          message: "Which schedule?",
          options: schedules.map((s) => ({ value: s.id, label: `${s.name} \u2192 ${s.cronExpression}` }))
        });
        if (isCancel(schedChoice)) continue;
        await runScheduleRemove(schedChoice);
      }
    } else if (action === "chat") {
      console.log();
      await runChat();
    } else if (action === "status") {
      console.log();
      await runStatus();
      console.log();
      await _pause();
    }
  }
}
function _pause() {
  return new Promise((resolve3) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(import_chalk.default.gray("  Press Enter to continue..."), () => {
      rl.close();
      resolve3();
    });
  });
}
async function runApiLearn() {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  API Flow Builder\n"));
  console.log(import_chalk.default.gray("  Build HTTP test flows interactively.\n"));
  const name = await askQuestion(import_chalk.default.cyan("  Flow name: "));
  if (!name.trim()) {
    errorMsg("Name required");
    process.exit(1);
  }
  const nodes = [];
  let stepIdx = 1;
  console.log(import_chalk.default.gray("\n  Add steps. Available types:"));
  console.log(import_chalk.default.gray("  http      \u2014 HTTP request (GET/POST/PUT/DELETE/PATCH)"));
  console.log(import_chalk.default.gray("  assert    \u2014 Assert response (status/body/header/time)"));
  console.log(import_chalk.default.gray("  extract   \u2014 Extract JSON value to variable"));
  console.log(import_chalk.default.gray("  set       \u2014 Set variable"));
  console.log(import_chalk.default.gray("  done      \u2014 Finish and save\n"));
  while (true) {
    const type = (await askQuestion(import_chalk.default.cyan(`  Step ${stepIdx} type [http/assert/extract/set/done]: `))).trim().toLowerCase();
    if (type === "done" || type === "") break;
    if (type === "http") {
      const method = (await askQuestion("    Method [GET]: ")).trim().toUpperCase() || "GET";
      const url = (await askQuestion("    URL: ")).trim();
      if (!url) {
        warn("URL required, skipping.");
        continue;
      }
      const label = (await askQuestion(`    Label [${method} ${url.split("/").slice(-1)[0] || url}]: `)).trim() || `${method} ${url.split("/").slice(-1)[0] || url}`;
      const headersStr = (await askQuestion("    Headers (key:value, comma-sep, or blank): ")).trim();
      const headers = {};
      if (headersStr) {
        for (const h of headersStr.split(",")) {
          const [k, ...v] = h.split(":");
          if (k && v.length) headers[k.trim()] = v.join(":").trim();
        }
      }
      const bodyStr = (await askQuestion("    Body JSON (or blank): ")).trim();
      const extractStr = (await askQuestion("    Extract vars (varName=$.path, comma-sep, or blank): ")).trim();
      const extract = {};
      if (extractStr) {
        for (const e of extractStr.split(",")) {
          const [k, v] = e.split("=");
          if (k && v) extract[k.trim()] = v.trim();
        }
      }
      nodes.push({
        id: (0, import_crypto4.randomUUID)(),
        type: "action",
        action: "http:request",
        method,
        url,
        label,
        headers: Object.keys(headers).length ? headers : void 0,
        body: bodyStr ? JSON.parse(bodyStr) : void 0,
        extract: Object.keys(extract).length ? extract : void 0
      });
    } else if (type === "assert") {
      const assertType = (await askQuestion("    Assert type [status/body:contains/json:path/time]: ")).trim() || "status";
      let node = { id: (0, import_crypto4.randomUUID)(), type: "action", action: "assert:response", assert: assertType, label: `Assert ${assertType}` };
      if (assertType === "status") {
        const exp = (await askQuestion("    Expected status [200]: ")).trim() || "200";
        node = { ...node, expected: Number(exp), label: `Assert status ${exp}` };
      } else if (assertType === "body:contains") {
        const exp = (await askQuestion("    Body must contain: ")).trim();
        node = { ...node, expected: exp, label: `Assert body contains "${exp}"` };
      } else if (assertType === "json:path") {
        const p = (await askQuestion("    JSON path (e.g. $.user.id): ")).trim();
        const exp = (await askQuestion("    Expected value: ")).trim();
        node = { ...node, path: p, expected: exp, label: `Assert ${p} = ${exp}` };
      } else if (assertType === "time") {
        const maxMs = (await askQuestion("    Max response time ms [2000]: ")).trim() || "2000";
        node = { ...node, expected: Number(maxMs), label: `Assert response < ${maxMs}ms` };
      }
      nodes.push(node);
    } else if (type === "extract") {
      const varName = (await askQuestion("    Variable name: ")).trim();
      const p = (await askQuestion("    JSON path (e.g. $.id): ")).trim();
      nodes.push({ id: (0, import_crypto4.randomUUID)(), type: "action", action: "extract:json", variable: varName, path: p, label: `Extract ${varName} from ${p}` });
    } else if (type === "set") {
      const varName = (await askQuestion("    Variable name: ")).trim();
      const val = (await askQuestion("    Value: ")).trim();
      nodes.push({ id: (0, import_crypto4.randomUUID)(), type: "action", action: "set:variable", variable: varName, value: val, label: `Set ${varName} = ${val}` });
    } else {
      warn(`Unknown type "${type}". Try: http, assert, extract, set, done`);
      continue;
    }
    stepIdx++;
  }
  if (!nodes.length) {
    warn("No steps added. Flow not saved.");
    return;
  }
  const flow = db.createFlow({ name, description: `API flow with ${nodes.length} step(s)`, createdBy: "human", graph: { nodes, edges: [], appUrl: void 0 } });
  success(`API flow created: ${import_chalk.default.white(flow.name)} (${import_chalk.default.gray(flow.id.slice(0, 8))})`);
  console.log(import_chalk.default.gray(`  ${nodes.length} step(s). Run with: ghostrun run "${name}"`));
  console.log();
}
async function runEnvCreate(name, extraArgs) {
  printLogo();
  divider();
  let baseUrl = extraArgs[0] || "";
  if (!baseUrl) baseUrl = (await askQuestion(import_chalk.default.cyan("  Base URL (optional, press Enter to skip): "))).trim();
  const env = db.createEnvironment({ name, baseUrl: baseUrl || void 0 });
  success(`Environment created: ${import_chalk.default.white(name)} (${import_chalk.default.gray(env.id.slice(0, 8))})`);
  if (baseUrl) info(`Base URL: ${import_chalk.default.cyan(baseUrl)}`);
  info(`Add variables: ghostrun env:set ${name} KEY value`);
  console.log();
}
async function runEnvList() {
  printLogo();
  divider();
  const envs = db.listEnvironments();
  if (!envs.length) {
    warn("No environments. Create one: ghostrun env:create <name>");
    return;
  }
  console.log(import_chalk.default.bold("\n  Environments\n"));
  for (const e of envs) {
    const active = e.isActive ? import_chalk.default.green(" \u25CF active") : "";
    const varCount = Object.keys(e.variables).length;
    console.log(`  ${import_chalk.default.white(e.name.padEnd(20))}${active}  ${import_chalk.default.gray(varCount + " vars")}${e.baseUrl ? "  " + import_chalk.default.cyan(e.baseUrl) : ""}`);
  }
  console.log();
}
async function runEnvSet(envName, key, value) {
  let env = db.findEnvironmentByName(envName);
  if (!env) {
    env = db.createEnvironment({ name: envName });
    info(`Created environment: ${envName}`);
  }
  const vars = { ...env.variables, [key]: value };
  db.updateEnvironment(env.id, { variables: vars });
  success(`Set ${import_chalk.default.white(key)} = ${import_chalk.default.cyan(value)} in environment ${import_chalk.default.white(envName)}`);
  console.log();
}
async function runEnvUse(envName) {
  const env = db.findEnvironmentByName(envName);
  if (!env) {
    errorMsg(`Environment "${envName}" not found. Create it: ghostrun env:create ${envName}`);
    process.exit(1);
  }
  db.setActiveEnvironment(env.id);
  success(`Active environment: ${import_chalk.default.white(envName)}`);
  if (env.baseUrl) info(`Base URL: ${import_chalk.default.cyan(env.baseUrl)}`);
  const varCount = Object.keys(env.variables).length;
  if (varCount) info(`${varCount} variables loaded`);
  console.log();
}
async function runEnvShow(envName) {
  const env = db.findEnvironmentByName(envName);
  if (!env) {
    errorMsg(`Environment "${envName}" not found`);
    process.exit(1);
  }
  printLogo();
  divider();
  console.log(import_chalk.default.bold(`
  Environment: ${env.name}`) + (env.isActive ? import_chalk.default.green(" \u25CF active") : ""));
  if (env.baseUrl) console.log(`  Base URL: ${import_chalk.default.cyan(env.baseUrl)}`);
  const vars = env.variables;
  if (Object.keys(vars).length === 0) {
    console.log(import_chalk.default.gray("  No variables set."));
  } else {
    console.log(import_chalk.default.bold("\n  Variables:"));
    for (const [k, v] of Object.entries(vars)) {
      const masked = k.toLowerCase().includes("secret") || k.toLowerCase().includes("password") || k.toLowerCase().includes("token") ? "*".repeat(Math.min(v.length, 8)) : v;
      console.log(`    ${import_chalk.default.white(k.padEnd(24))} ${import_chalk.default.cyan(masked)}`);
    }
  }
  console.log();
}
async function runEnvDelete(envName) {
  const env = db.findEnvironmentByName(envName);
  if (!env) {
    errorMsg(`Environment "${envName}" not found`);
    process.exit(1);
  }
  db.deleteEnvironment(env.id);
  success(`Deleted environment: ${envName}`);
  console.log();
}
async function runVarDump(runId) {
  const run = db.findRunByPartialId(runId) || db.getRun(runId);
  if (!run) {
    errorMsg("Run not found: " + runId);
    process.exit(1);
  }
  printLogo();
  divider();
  const data = db.getRunData(run.id);
  const apiResps = db.getApiResponses(run.id);
  console.log(import_chalk.default.bold(`
  Variables from run ${import_chalk.default.gray(run.id.slice(0, 8))}
`));
  if (!data.length) {
    console.log(import_chalk.default.gray("  No variables extracted in this run."));
  } else {
    for (const d of data) {
      console.log(`  Step ${d.stepNumber.toString().padStart(2)}  ${import_chalk.default.white(d.variableName.padEnd(24))} ${import_chalk.default.cyan(d.variableValue.slice(0, 80))}`);
    }
  }
  if (apiResps.length) {
    console.log(import_chalk.default.bold("\n  API Calls:\n"));
    for (const r of apiResps) {
      const statusColor = r.statusCode && r.statusCode < 400 ? import_chalk.default.green : import_chalk.default.red;
      console.log(`  Step ${r.stepNumber.toString().padStart(2)}  ${import_chalk.default.white((r.method || "???").padEnd(7))} ${import_chalk.default.gray(r.url.slice(0, 60))}  ${r.statusCode ? statusColor(String(r.statusCode)) : import_chalk.default.red("ERR")}  ${r.responseTimeMs ? import_chalk.default.gray(r.responseTimeMs + "ms") : ""}`);
    }
  }
  console.log();
}
function parsePerfArgs(extraArgs) {
  const get = (flag, def) => {
    const idx = extraArgs.indexOf(flag);
    if (idx === -1) return def;
    const raw = extraArgs[idx + 1] || "";
    return parseInt(raw.replace(/[^0-9]/g, "")) || def;
  };
  const getDurationMs = (flag, defSec) => {
    const idx = extraArgs.indexOf(flag);
    if (idx === -1) return defSec * 1e3;
    const raw = extraArgs[idx + 1] || String(defSec);
    const num = parseInt(raw.replace(/[^0-9]/g, "")) || defSec;
    if (raw.endsWith("ms")) return num;
    return num * 1e3;
  };
  return {
    vus: get("--vus", 10),
    duration: getDurationMs("--duration", 30),
    rampUp: getDurationMs("--ramp-up", 5),
    timeout: getDurationMs("--timeout", 10)
  };
}
function renderPerfStats(stats, checksTotal, checksFailed, perStep, flowName, config) {
  const errColor = stats.errorRate > 5 ? import_chalk.default.red : stats.errorRate > 1 ? import_chalk.default.yellow : import_chalk.default.green;
  const p95Color = stats.p95 > 1e3 ? import_chalk.default.red : stats.p95 > 500 ? import_chalk.default.yellow : import_chalk.default.green;
  const checkPassRate = checksTotal > 0 ? parseFloat(((checksTotal - checksFailed) / checksTotal * 100).toFixed(1)) : 100;
  const checkColor = checksFailed > 0 ? import_chalk.default.red : import_chalk.default.green;
  divider();
  console.log(import_chalk.default.bold.white("\n  PERFORMANCE RESULTS") + import_chalk.default.gray(` \u2014 ${flowName}`));
  console.log(import_chalk.default.gray(`  VUs: ${config.vus}  Duration: ${config.duration / 1e3}s  Ramp-up: ${config.rampUp / 1e3}s
`));
  const w = 46;
  const line = (label, val) => `  \u2502  ${label.padEnd(22)}${val.padStart(w - 26)}  \u2502`;
  console.log(`  \u250C${"\u2500".repeat(w)}\u2510`);
  console.log(`  \u2502  ${"Summary".padEnd(w - 2)}\u2502`);
  console.log(`  \u251C${"\u2500".repeat(w)}\u2524`);
  console.log(line("HTTP Requests", import_chalk.default.white(stats.total.toLocaleString())));
  console.log(line("Throughput", import_chalk.default.cyan(stats.avgRps + " req/s")));
  console.log(line("HTTP Success", import_chalk.default.green(`${(100 - stats.errorRate).toFixed(1)}%  (${stats.success.toLocaleString()})`)));
  console.log(line("HTTP Errors", errColor(`${stats.errorRate}%  (${stats.failed.toLocaleString()})`)));
  if (checksTotal > 0) {
    console.log(line("Checks Passed", checkColor(`${checkPassRate}%  (${(checksTotal - checksFailed).toLocaleString()} / ${checksTotal.toLocaleString()})`)));
    if (checksFailed > 0) console.log(line("Checks Failed", import_chalk.default.red(`${checksFailed.toLocaleString()} assertion failures`)));
  }
  console.log(`  \u251C${"\u2500".repeat(w)}\u2524`);
  console.log(`  \u2502  ${"Latency".padEnd(w - 2)}\u2502`);
  console.log(`  \u251C${"\u2500".repeat(w)}\u2524`);
  console.log(line("p50  (median)", import_chalk.default.green(stats.p50 + "ms")));
  console.log(line("p95", p95Color(stats.p95 + "ms")));
  console.log(line("p99", stats.p99 > 2e3 ? import_chalk.default.red(stats.p99 + "ms") : import_chalk.default.yellow(stats.p99 + "ms")));
  console.log(line("min / max", import_chalk.default.gray(`${stats.min}ms / ${stats.max}ms`)));
  console.log(`  \u2514${"\u2500".repeat(w)}\u2518`);
  const stepNames = Object.keys(perStep);
  if (stepNames.length > 1) {
    console.log(import_chalk.default.bold("\n  Per Step:\n"));
    console.log(import_chalk.default.gray(`  ${"Step".padEnd(38)} ${"Req".padStart(6)} ${"p50".padStart(7)} ${"p95".padStart(7)} ${"Err%".padStart(6)}`));
    console.log(import_chalk.default.gray("  " + "\u2500".repeat(68)));
    for (const [label, s] of Object.entries(perStep)) {
      const errPct = s.errorRate;
      const errStr = errPct > 0 ? import_chalk.default.red(errPct.toFixed(1) + "%") : import_chalk.default.green("0%");
      const p95Str = s.p95 > 500 ? import_chalk.default.yellow(s.p95 + "ms") : import_chalk.default.green(s.p95 + "ms");
      const truncLabel = label.length > 37 ? label.slice(0, 34) + "..." : label;
      console.log(`  ${import_chalk.default.white(truncLabel.padEnd(38))} ${s.total.toString().padStart(6)} ${String(s.p50 + "ms").padStart(7)} ${p95Str.padStart(7)} ${errStr.padStart(6)}`);
    }
  }
  console.log();
}
async function runPerfRun(flowId, extraArgs) {
  const config = parsePerfArgs(extraArgs);
  printLogo();
  divider();
  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) {
    errorMsg("Flow not found: " + flowId);
    process.exit(1);
  }
  console.log(import_chalk.default.bold(`
  Load Test: ${import_chalk.default.white(flow.name)}`));
  console.log(import_chalk.default.gray(`  VUs: ${config.vus}  Duration: ${config.duration / 1e3}s  Ramp-up: ${config.rampUp / 1e3}s  Timeout: ${config.timeout / 1e3}s
`));
  const startTime = Date.now();
  const totalMs = config.duration;
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.min(100, Math.round(elapsed / totalMs * 100));
    const filled = Math.round(pct / 5);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(20 - filled);
    process.stdout.write(`\r  [${bar}] ${pct}%  ${Math.round(elapsed / 1e3)}s / ${config.duration / 1e3}s  `);
  }, 250);
  let stats, checksTotal, checksFailed, perStep, perfRunId;
  try {
    ({ stats, checksTotal, checksFailed, perStep, perfRunId } = await runPerfTest(flowId, config));
  } finally {
    clearInterval(progressInterval);
    process.stdout.write("\r" + " ".repeat(60) + "\r");
  }
  renderPerfStats(stats, checksTotal, checksFailed, perStep, flow.name, config);
  info("Perf Run ID: " + import_chalk.default.gray(perfRunId.slice(0, 8)));
  info("View details: " + import_chalk.default.cyan(`ghostrun perf:show ${perfRunId.slice(0, 8)}`));
  console.log();
}
async function runPerfExport(flowId, extraArgs) {
  const config = parsePerfArgs(extraArgs);
  const p95 = parseInt((extraArgs[extraArgs.indexOf("--p95") + 1] || "").replace(/[^0-9]/g, "") || "500");
  const errRate = parseFloat(extraArgs[extraArgs.indexOf("--max-errors") + 1] || "1");
  const outputFlag = extraArgs.indexOf("--output");
  const outputFile = outputFlag !== -1 ? extraArgs[outputFlag + 1] : "";
  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) {
    errorMsg("Flow not found: " + flowId);
    process.exit(1);
  }
  const graph = JSON.parse(flow.graph);
  const API_ONLY = /* @__PURE__ */ new Set([
    "http:request",
    "assert:response",
    "assert:status",
    "assert:body",
    "assert:header",
    "assert:time",
    "set:variable",
    "extract:json",
    "env:switch"
  ]);
  const actionNodes = (graph.nodes || []).filter((n) => n.type === "action" && API_ONLY.has(n.action));
  if (!actionNodes.length) {
    errorMsg("No API steps found. perf:export only supports API flows.");
    process.exit(1);
  }
  const script = generateK6Script(flow.name, actionNodes, {
    vus: config.vus,
    duration: config.duration,
    p95threshold: p95,
    errorThreshold: errRate
  });
  const filename = outputFile || `${flow.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-k6.js`;
  fs4.writeFileSync(filename, script, "utf8");
  printLogo();
  divider();
  success(`k6 script exported: ${import_chalk.default.cyan(filename)}`);
  console.log();
  console.log(import_chalk.default.bold("  Thresholds:"));
  info(`p95 response time < ${p95}ms`);
  info(`error rate < ${errRate}%`);
  console.log();
  console.log(import_chalk.default.bold("  Run with k6:"));
  console.log(import_chalk.default.gray(`    k6 run ${filename}`));
  console.log(import_chalk.default.gray(`    k6 run --vus ${config.vus} --duration ${config.duration / 1e3}s ${filename}`));
  console.log(import_chalk.default.gray(`    k6 run --out json=results.json ${filename}`));
  console.log();
  console.log(import_chalk.default.gray("  Install k6: https://grafana.com/docs/k6/latest/get-started/installation/"));
  console.log();
  console.log(import_chalk.default.bold("  Script preview:"));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(56)));
  script.split("\n").slice(0, 30).forEach((l) => console.log(import_chalk.default.gray("  ") + import_chalk.default.white(l)));
  if (script.split("\n").length > 30) console.log(import_chalk.default.gray(`  ... (${script.split("\n").length - 30} more lines)`));
  console.log();
}
async function runPerfList() {
  printLogo();
  divider();
  const runs = db.listPerfRuns();
  if (!runs.length) {
    warn("No perf runs yet. Run: ghostrun perf:run <flow-name>");
    return;
  }
  console.log(import_chalk.default.bold("\n  Performance Runs\n"));
  console.log(import_chalk.default.gray(`  ${"ID".padEnd(10)} ${"Flow".padEnd(26)} ${"VUs".padStart(4)} ${"Duration".padStart(9)} ${"RPS".padStart(7)} ${"p95".padStart(7)} ${"Err%".padStart(6)}  When`));
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(82)));
  for (const r of runs) {
    const cfg = r.config;
    const errColor = (r.failedRequests ?? 0) / Math.max(r.totalRequests ?? 1, 1) > 0.05 ? import_chalk.default.red : import_chalk.default.green;
    const errPct = r.totalRequests ? ((r.failedRequests ?? 0) / r.totalRequests * 100).toFixed(1) : "\u2014";
    const p95Str = r.p95 != null ? r.p95 > 500 ? import_chalk.default.yellow(r.p95 + "ms") : import_chalk.default.green(r.p95 + "ms") : "\u2014";
    console.log(
      `  ${import_chalk.default.gray(r.id.slice(0, 8).padEnd(10))} ${import_chalk.default.white(r.flowName.slice(0, 25).padEnd(26))} ${String(cfg?.vus ?? "?").padStart(4)} ${String((cfg?.duration ?? 0) / 1e3 + "s").padStart(9)} ${import_chalk.default.cyan(String(r.avgRps ?? "\u2014").padStart(7))} ${p95Str.padStart(7)} ${errColor(errPct + "%").padStart(6)}  ${timeAgo(r.startedAt.toISOString())}`
    );
  }
  console.log();
}
async function runPerfShow(runId) {
  const run = db.findPerfRunByPartialId(runId);
  if (!run) {
    errorMsg("Perf run not found: " + runId);
    process.exit(1);
  }
  const cfg = run.config;
  if (run.p50 != null) {
    const stats = {
      total: run.totalRequests ?? 0,
      success: run.successRequests ?? 0,
      failed: run.failedRequests ?? 0,
      errorRate: run.totalRequests ? parseFloat(((run.failedRequests ?? 0) / run.totalRequests * 100).toFixed(1)) : 0,
      avgRps: run.avgRps ?? 0,
      p50: run.p50 ?? 0,
      p95: run.p95 ?? 0,
      p99: run.p99 ?? 0,
      min: run.minMs ?? 0,
      max: run.maxMs ?? 0
    };
    renderPerfStats(stats, 0, 0, run.perStepStats || {}, run.flowName, cfg);
  } else {
    warn("Perf run has no stats (may have failed or is still running).");
  }
  info("Started: " + import_chalk.default.gray(run.startedAt.toISOString()));
  if (run.completedAt) info("Completed: " + import_chalk.default.gray(run.completedAt.toISOString()));
  console.log();
}
async function runPerfCompare(id1, id2) {
  const r1 = db.findPerfRunByPartialId(id1);
  const r2 = db.findPerfRunByPartialId(id2);
  if (!r1) {
    errorMsg("First perf run not found: " + id1);
    process.exit(1);
  }
  if (!r2) {
    errorMsg("Second perf run not found: " + id2);
    process.exit(1);
  }
  const c1 = JSON.parse(r1.config ? JSON.stringify(r1.config) : "{}");
  const c2 = JSON.parse(r2.config ? JSON.stringify(r2.config) : "{}");
  divider();
  console.log(import_chalk.default.bold("\n  Performance Comparison\n"));
  console.log(`  ${import_chalk.default.cyan("A")} ${r1.id.slice(0, 8)}  ${import_chalk.default.gray(r1.flowName)}  ${import_chalk.default.gray(timeAgo(r1.startedAt.toISOString()))}  ${r1.config ? import_chalk.default.gray(`(${c1.vus}VU \xB7 ${c1.duration}s)`) : ""}`);
  console.log(`  ${import_chalk.default.cyan("B")} ${r2.id.slice(0, 8)}  ${import_chalk.default.gray(r2.flowName)}  ${import_chalk.default.gray(timeAgo(r2.startedAt.toISOString()))}  ${r2.config ? import_chalk.default.gray(`(${c2.vus}VU \xB7 ${c2.duration}s)`) : ""}`);
  console.log();
  function delta(a, b, unit = "ms", lowerBetter = true) {
    if (a == null || b == null) return import_chalk.default.gray("\u2014");
    const diff = b - a;
    const pct = a !== 0 ? (diff / a * 100).toFixed(1) : "\u2014";
    const better = lowerBetter ? diff < 0 : diff > 0;
    const color = diff === 0 ? import_chalk.default.gray : better ? import_chalk.default.green : import_chalk.default.red;
    const sign = diff > 0 ? "+" : "";
    return color(`${sign}${diff.toFixed(0)}${unit} (${sign}${pct}%)`);
  }
  const col = (s) => String(s).padEnd(14);
  const hdr = (s) => import_chalk.default.bold.gray(String(s).padEnd(14));
  console.log(`  ${import_chalk.default.gray("Metric".padEnd(20))} ${hdr("A")} ${hdr("B")} ${"Change".padEnd(20)}`);
  console.log(import_chalk.default.gray("  " + "\u2500".repeat(72)));
  const rows = [
    ["Avg RPS", r1.avgRps, r2.avgRps, " req/s", false],
    ["p50 latency", r1.p50, r2.p50, "ms", true],
    ["p95 latency", r1.p95, r2.p95, "ms", true],
    ["p99 latency", r1.p99, r2.p99, "ms", true],
    ["Min latency", r1.minMs, r2.minMs, "ms", true],
    ["Max latency", r1.maxMs, r2.maxMs, "ms", true]
  ];
  for (const [label, v1, v2, unit, lowerBetter] of rows) {
    const a = v1 != null ? v1.toFixed(unit === " req/s" ? 1 : 0) + unit : "\u2014";
    const b = v2 != null ? v2.toFixed(unit === " req/s" ? 1 : 0) + unit : "\u2014";
    console.log(`  ${label.padEnd(20)} ${col(a)} ${col(b)} ${delta(v1 ?? null, v2 ?? null, unit, lowerBetter)}`);
  }
  const sr1 = r1.totalRequests ? ((r1.successRequests || 0) / r1.totalRequests * 100).toFixed(1) + "%" : "\u2014";
  const sr2 = r2.totalRequests ? ((r2.successRequests || 0) / r2.totalRequests * 100).toFixed(1) + "%" : "\u2014";
  const srGood = parseFloat(sr2) >= parseFloat(sr1);
  console.log(`  ${"HTTP Success".padEnd(20)} ${col(sr1)} ${col(sr2)} ${sr1 === "\u2014" || sr2 === "\u2014" ? import_chalk.default.gray("\u2014") : srGood ? import_chalk.default.green("\u2265 A") : import_chalk.default.red("< A")}`);
  console.log();
  const p95Improved = r1.p95 && r2.p95 && r2.p95 < r1.p95;
  const p95Worse = r1.p95 && r2.p95 && r2.p95 > r1.p95 * 1.1;
  if (p95Improved) console.log(import_chalk.default.green("  \u2713 B is faster \u2014 p95 improved by " + Math.abs(r2.p95 - r1.p95).toFixed(0) + "ms"));
  else if (p95Worse) console.log(import_chalk.default.red("  \u2717 B is slower \u2014 p95 degraded by " + Math.abs(r2.p95 - r1.p95).toFixed(0) + "ms"));
  else console.log(import_chalk.default.gray("  ~ Performance roughly equivalent"));
  console.log();
}
async function generatePerfReport(perfRunId, outFile) {
  const pr = db.getPerfRun ? db.getPerfRun(perfRunId) : null;
  if (!pr) return;
  const config = pr.config ? typeof pr.config === "string" ? JSON.parse(pr.config) : pr.config : {};
  const perStep = pr.perStepStats ? typeof pr.perStepStats === "string" ? Object.values(JSON.parse(pr.perStepStats)) : Object.values(pr.perStepStats) : [];
  const stepsHtml = perStep.map((s) => {
    const p95Color = Number(s.p95) > 500 ? "#f85149" : Number(s.p95) > 200 ? "#e3b341" : "#56d364";
    return `<tr>
      <td>${escapeHtml(String(s.label || ""))}</td>
      <td>${String(s.total || s.count || 0)}</td>
      <td>${Number(s.p50 || 0).toFixed(0)}ms</td>
      <td style="color:${p95Color}">${Number(s.p95 || 0).toFixed(0)}ms</td>
      <td>${Number(s.p99 || 0).toFixed(0)}ms</td>
      <td>${Number(s.min || 0).toFixed(0)}ms</td>
      <td>${Number(s.max || 0).toFixed(0)}ms</td>
    </tr>`;
  }).join("\n");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GhostRun Perf \u2014 ${escapeHtml(pr.flowName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080c10;color:#cdd9e5;font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;line-height:1.6;padding:40px}
h1{font-size:28px;color:#f0f6fc;margin-bottom:6px}
.meta{color:#768390;font-size:13px;margin-bottom:32px}
.summary{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px;margin-bottom:40px}
.stat{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:16px 20px}
.stat-val{font-size:24px;font-weight:600;color:#f0f6fc}
.stat-val.good{color:#56d364}.stat-val.warn{color:#e3b341}.stat-val.bad{color:#f85149}
.stat-label{font-size:11px;color:#768390;text-transform:uppercase;letter-spacing:.07em;margin-top:4px}
table{width:100%;border-collapse:collapse}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #21262d;font-size:13px}
th{color:#768390;font-weight:500;text-transform:uppercase;font-size:11px;letter-spacing:.07em}
tr:last-child td{border-bottom:none}
.section-title{font-size:16px;font-weight:600;color:#f0f6fc;margin:32px 0 12px}
footer{margin-top:48px;color:#768390;font-size:12px}
</style>
</head>
<body>
<h1>${escapeHtml(pr.flowName)}</h1>
<div class="meta">
  Perf Run ${pr.id.slice(0, 8)} &nbsp;\xB7&nbsp; ${config.vus || "?"} VUs \xB7 ${config.duration || "?"}s \xB7 ramp-up ${config.rampUp || 0}s
  &nbsp;\xB7&nbsp; ${new Date(pr.startedAt).toLocaleString()}
</div>
<div class="summary">
  <div class="stat"><div class="stat-val ${pr.status === "done" ? "good" : "bad"}">${(pr.status || "unknown").toUpperCase()}</div><div class="stat-label">Status</div></div>
  <div class="stat"><div class="stat-val">${pr.totalRequests || 0}</div><div class="stat-label">HTTP Requests</div></div>
  <div class="stat"><div class="stat-val ${pr.totalRequests && pr.successRequests === pr.totalRequests ? "good" : "warn"}">${pr.totalRequests ? ((pr.successRequests || 0) / pr.totalRequests * 100).toFixed(1) + "%" : "\u2014"}</div><div class="stat-label">Success Rate</div></div>
  <div class="stat"><div class="stat-val">${pr.avgRps ? pr.avgRps.toFixed(1) : "\u2014"}</div><div class="stat-label">Avg RPS</div></div>
  <div class="stat"><div class="stat-val">${pr.p50 != null ? pr.p50 + "ms" : "\u2014"}</div><div class="stat-label">p50</div></div>
  <div class="stat"><div class="stat-val ${pr.p95 && pr.p95 > 500 ? "bad" : pr.p95 && pr.p95 > 200 ? "warn" : "good"}">${pr.p95 != null ? pr.p95 + "ms" : "\u2014"}</div><div class="stat-label">p95</div></div>
  <div class="stat"><div class="stat-val">${pr.p99 != null ? pr.p99 + "ms" : "\u2014"}</div><div class="stat-label">p99</div></div>
  <div class="stat"><div class="stat-val">${pr.minMs != null ? pr.minMs + "ms" : "\u2014"}</div><div class="stat-label">Min</div></div>
  <div class="stat"><div class="stat-val">${pr.maxMs != null ? pr.maxMs + "ms" : "\u2014"}</div><div class="stat-label">Max</div></div>
</div>
<div class="section-title">Per-step breakdown</div>
<table>
  <thead><tr><th>Step</th><th>Count</th><th>p50</th><th>p95</th><th>p99</th><th>Min</th><th>Max</th></tr></thead>
  <tbody>${stepsHtml}</tbody>
</table>
<footer>Generated by GhostRun \xB7 ${(/* @__PURE__ */ new Date()).toISOString()}</footer>
</body></html>`;
  fs4.writeFileSync(outFile, html);
  success(`HTML report: ${import_chalk.default.cyan(outFile)}`);
}
var SECRET_PATTERNS = [
  { name: "Anthropic API key", pattern: /sk-ant-api[a-zA-Z0-9_-]{10,}/ },
  { name: "OpenAI-style key", pattern: /\bsk-[a-zA-Z0-9]{20,}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Private key block", pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "npm token", pattern: /\bnpm_[a-zA-Z0-9]{36}\b/ }
];
var PLACEHOLDER_OK = [
  /sk-ant-\.\.\./,
  /example\.com/,
  /your-app\.com/,
  /test@example\.com/,
  /PASSWORD=secret/,
  /s3cr3t/,
  /STAGING_API_TOKEN/,
  /AUTH_PASSWORD/
];
function lineLooksLikePlaceholder(line) {
  return PLACEHOLDER_OK.some((re) => re.test(line));
}
function scanTextForSecrets(label, content, filePath) {
  const findings = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineLooksLikePlaceholder(line)) continue;
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push(`${filePath}:${i + 1} \u2014 possible ${name}`);
      }
    }
    if (/"password"\s*:\s*"[^"]{3,}"/i.test(line) && !/secret|example|test123|placeholder/i.test(line)) {
      findings.push(`${filePath}:${i + 1} \u2014 plaintext password in JSON`);
    }
  }
  return findings;
}
function collectProjectScanFiles() {
  const files = [];
  const roots = [
    PROJECT_GHOSTRUN_PATH,
    process.cwd()
  ];
  const names = [".ghostrun.env", ".env"];
  for (const root of roots) {
    for (const name of names) {
      const p = path4.join(root, name);
      if (fs4.existsSync(p) && fs4.statSync(p).isFile()) files.push(p);
    }
  }
  const walk = (dir) => {
    if (!fs4.existsSync(dir)) return;
    for (const entry of fs4.readdirSync(dir, { withFileTypes: true })) {
      const full = path4.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "runs", "reports", "ai"].includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.(json|env|flow\.json|txt|yaml|yml)$/.test(entry.name)) continue;
      if (full.includes(`${path4.sep}auth${path4.sep}storage-state${path4.sep}`)) continue;
      if (full.includes(`${path4.sep}auth${path4.sep}secrets${path4.sep}`)) continue;
      files.push(full);
    }
  };
  walk(path4.join(PROJECT_GHOSTRUN_PATH, "profiles"));
  walk(path4.join(PROJECT_GHOSTRUN_PATH, "flows"));
  if (fs4.existsSync(PROJECT_CONFIG_PATH)) files.push(PROJECT_CONFIG_PATH);
  return [...new Set(files)];
}
async function runSecurityAudit(exitOnFailure = true) {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  GhostRun Security Audit\n"));
  const findings = [];
  const warnings = [];
  const passes = [];
  ensureProjectWorkspace();
  const gitignorePath = path4.join(PROJECT_GHOSTRUN_PATH, ".gitignore");
  if (fs4.existsSync(gitignorePath)) {
    const gi = fs4.readFileSync(gitignorePath, "utf8");
    if (gi.includes("auth/secrets/") && gi.includes("auth/storage-state/")) {
      passes.push("Project .gitignore excludes auth secrets and storage state");
    } else {
      findings.push("Project .gitignore should exclude auth/secrets/ and auth/storage-state/");
    }
  } else {
    findings.push("Missing .ghostrun/.gitignore");
  }
  const rootGitignore = path4.join(process.cwd(), ".gitignore");
  if (fs4.existsSync(rootGitignore)) {
    const gi = fs4.readFileSync(rootGitignore, "utf8");
    if (/\.ghostrun\.env|\.env/.test(gi)) {
      passes.push("Root .gitignore mentions env files");
    } else {
      warnings.push("Add .ghostrun.env and .env to root .gitignore");
    }
  }
  for (const filePath of collectProjectScanFiles()) {
    const rel = path4.relative(process.cwd(), filePath) || filePath;
    const content = fs4.readFileSync(filePath, "utf8");
    findings.push(...scanTextForSecrets(rel, content, rel));
  }
  for (const profile of listProfiles()) {
    const vars = profile.variables || {};
    for (const [key, value] of Object.entries(vars)) {
      if (/password|token|secret|api_key/i.test(key) && value.length > 0 && !lineLooksLikePlaceholder(value)) {
        warnings.push(`Profile "${profile.name}" has sensitive-looking variable "${key}" \u2014 prefer tokenSecret + env var`);
      }
    }
    if (profile.auth?.passwordSecret && profile.auth?.username && !profile.auth?.usernameVar) {
      warnings.push(`Profile "${profile.name}" has inline username \u2014 prefer usernameVar or env reference`);
    }
  }
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 20) {
    passes.push("ANTHROPIC_API_KEY loaded from environment (not stored in project files)");
  }
  const config = readConfig();
  if (config.policies?.allowAutoRepairApply) {
    warnings.push("allowAutoRepairApply is enabled \u2014 flows may mutate without review outside CI");
  }
  console.log(import_chalk.default.bold("  Passed"));
  if (passes.length === 0) console.log(import_chalk.default.gray("  (none)"));
  for (const p of passes) console.log(`  ${import_chalk.default.green("\u2713")} ${p}`);
  if (warnings.length) {
    console.log(import_chalk.default.bold("\n  Warnings"));
    for (const w of warnings) console.log(`  ${import_chalk.default.yellow("!")} ${w}`);
  }
  if (findings.length) {
    console.log(import_chalk.default.bold("\n  Findings"));
    for (const f of findings) console.log(`  ${import_chalk.default.red("\u2717")} ${f}`);
  } else {
    console.log(import_chalk.default.bold("\n  Findings"));
    console.log(`  ${import_chalk.default.green("\u2713")} No secret patterns detected in scanned project files`);
  }
  console.log(import_chalk.default.gray("\n  npm package ships only: ghostrun.js, mcp-server.js, docs, templates/"));
  console.log(import_chalk.default.gray("  See docs/security.md for the full safety model.\n"));
  if (findings.length && exitOnFailure) process.exit(1);
}
async function runIntegrationsCommand(args2 = []) {
  printLogo();
  divider();
  ensureProjectWorkspace();
  const config = readConfig();
  const sub = args2[0] || "list";
  if (sub === "list") {
    console.log(import_chalk.default.bold("\n  GhostRun Integrations\n"));
    const gh = config.integrations?.github;
    const ln = config.integrations?.linear;
    console.log(`  ${import_chalk.default.cyan("GitHub Issues")}  ${gh?.enabled ? import_chalk.default.green("enabled") : import_chalk.default.gray("disabled")}`);
    if (gh?.owner) console.log(import_chalk.default.gray(`    repo: ${gh.owner}/${gh.repo || "?"}`));
    console.log(`  ${import_chalk.default.cyan("Linear")}         ${ln?.enabled ? import_chalk.default.green("enabled") : import_chalk.default.gray("disabled")}`);
    if (ln?.teamId) console.log(import_chalk.default.gray(`    team: ${ln.teamId}`));
    console.log(import_chalk.default.gray("\n  Configure in .ghostrun/config.json \u2192 integrations"));
    console.log(import_chalk.default.gray("  Full issue creation: v2.0-alpha (failure.v1.json scaffold ready in v1.3)\n"));
    return;
  }
  if (sub === "test") {
    const target = args2[1];
    if (!target) {
      errorMsg("Usage: ghostrun integrations test <github|linear>");
      process.exit(1);
    }
    if (target === "github") {
      const gh = config.integrations?.github;
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      if (!gh?.enabled) {
        warn("GitHub integration disabled in config.");
        process.exit(1);
      }
      if (!token) {
        errorMsg("GITHUB_TOKEN or GH_TOKEN not set.");
        process.exit(1);
      }
      if (!gh.owner || !gh.repo) {
        errorMsg("Set integrations.github.owner and integrations.github.repo in config.");
        process.exit(1);
      }
      success(`GitHub config OK: ${gh.owner}/${gh.repo} (token present)`);
      return;
    }
    if (target === "linear") {
      const ln = config.integrations?.linear;
      const key = process.env.LINEAR_API_KEY;
      if (!ln?.enabled) {
        warn("Linear integration disabled in config.");
        process.exit(1);
      }
      if (!key) {
        errorMsg("LINEAR_API_KEY not set.");
        process.exit(1);
      }
      if (!ln.teamId) {
        errorMsg("Set integrations.linear.teamId in config.");
        process.exit(1);
      }
      success(`Linear config OK: team ${ln.teamId} (API key present)`);
      return;
    }
    errorMsg(`Unknown integration: ${target}`);
    process.exit(1);
  }
  errorMsg("Usage: ghostrun integrations list | test <github|linear>");
  process.exit(1);
}
async function runAuthorBenchmark(extraArgs = []) {
  printLogo();
  divider();
  const { spawnSync } = require("child_process");
  const realBin = fs4.realpathSync(process.argv[1]);
  const pkgDir = path4.dirname(realBin);
  let scriptPath = path4.join(pkgDir, "scripts", "author-benchmark.mjs");
  if (!fs4.existsSync(scriptPath)) {
    scriptPath = path4.join(process.cwd(), "scripts", "author-benchmark.mjs");
  }
  if (!fs4.existsSync(scriptPath)) {
    errorMsg("Author benchmark script not found.");
    process.exit(1);
  }
  const result = spawnSync("node", [scriptPath, ...extraArgs], { stdio: "inherit", env: process.env });
  process.exit(result.status ?? 1);
}
async function runDoctor() {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  GhostRun Health Check\n"));
  const check = (label, ok, detail) => {
    const badge = ok ? import_chalk.default.green("  OK  ") : import_chalk.default.red(" FAIL ");
    const desc = detail ? import_chalk.default.gray(" \u2014 " + detail) : "";
    console.log(`  [${badge}] ${label}${desc}`);
  };
  const rawVer = process.version;
  const major = parseInt(rawVer.replace("v", "").split(".")[0], 10);
  check("Node.js >= 18", major >= 18, `${rawVer}`);
  let chromiumInstalled = false;
  let chromiumDetail = "could not resolve Chromium executable path \u2014 run: npx playwright install chromium";
  try {
    const execPath = import_playwright.chromium.executablePath();
    chromiumInstalled = fs4.existsSync(execPath);
    chromiumDetail = chromiumInstalled ? execPath : `binary not found at ${execPath} \u2014 run: npx playwright install chromium`;
  } catch {
  }
  check("Playwright Chromium browser", chromiumInstalled, chromiumDetail);
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  check("ANTHROPIC_API_KEY set", hasApiKey, hasApiKey ? "present" : "not set \u2014 AI features may be limited");
  const paths = getProjectPaths();
  const projectDbPath = paths.dbPath;
  const projectDbExists = fs4.existsSync(projectDbPath);
  check("Project database", projectDbExists || fs4.existsSync(PROJECT_CONFIG_PATH), projectDbExists ? projectDbPath : "run ghostrun init in project root");
  const globalDbPath = path4.join(DATA_PATH2, "data", "ghostrun.db");
  const globalDbExists = fs4.existsSync(globalDbPath);
  check("Global database (legacy)", globalDbExists, globalDbExists ? globalDbPath : "optional \u2014 project DB is primary");
  const wsExists = fs4.existsSync(PROJECT_CONFIG_PATH);
  check("Project workspace initialised", wsExists, wsExists ? PROJECT_CONFIG_PATH : "run: ghostrun init");
  const activeProfileName = readConfig().activeProfile || null;
  const activeProfileObj = activeProfileName ? getProfile(activeProfileName) : null;
  check("Active profile", !!activeProfileName, activeProfileName || "none \u2014 use: ghostrun profile use <name>");
  if (activeProfileObj?.services && (isEmailBridgeEnabled(activeProfileObj.services) || activeProfileObj.services.webhook || activeProfileObj.services.postgres?.connectionSecret)) {
    const svcResults = await runServicesDoctor(activeProfileObj.services);
    for (const r of svcResults) {
      check(`Service: ${r.name}`, r.ok, r.detail);
    }
  } else if (activeProfileObj?.auth?.strategy && activeProfileObj.auth.strategy !== "none") {
    check("Profile auth", true, `${activeProfileObj.auth.strategy} \u2014 credentials via env or .ghostrun/auth/secrets/`);
  }
  const ollamaModel = await isOllamaRunning();
  check("Ollama running", !!ollamaModel, ollamaModel ? `model: ${ollamaModel}` : "not reachable (optional)");
  console.log();
}
async function writeJUnitReport(flowName, runId, steps, totalDurationMs) {
  const reportsDir = path4.join(PROJECT_GHOSTRUN_PATH, "reports");
  if (!fs4.existsSync(reportsDir)) fs4.mkdirSync(reportsDir, { recursive: true });
  const outPath = path4.join(reportsDir, `junit-${runId}.xml`);
  const failures = steps.filter((s) => s.status === "failed").length;
  const durationSec = (totalDurationMs / 1e3).toFixed(3);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const testcases = steps.map((s) => {
    const dur = ((s.duration || 0) / 1e3).toFixed(3);
    const nameAttr = esc(s.name || `Step ${s.status}`);
    const failureEl = s.status === "failed" && s.errorMessage ? `
      <failure message="${esc(s.errorMessage)}">${esc(s.errorMessage)}</failure>` : "";
    return `    <testcase name="${nameAttr}" classname="${esc(flowName)}" time="${dur}">${failureEl}
    </testcase>`;
  }).join("\n");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="GhostRun" tests="${steps.length}" failures="${failures}" time="${durationSec}">`,
    `  <testsuite name="${esc(flowName)}" tests="${steps.length}" failures="${failures}" time="${durationSec}" id="${esc(runId)}">`,
    testcases,
    "  </testsuite>",
    "</testsuites>"
  ].join("\n");
  fs4.writeFileSync(outPath, xml, "utf8");
  return outPath;
}
async function runReportPublish(extraArgs = []) {
  printLogo();
  divider();
  ensureProjectWorkspace();
  const destDir = parseFlagValue(extraArgs, "--dir") || "./test-results";
  const runIdArg = parseFlagValue(extraArgs, "--run");
  const jsonOutput = parseFlagValue(extraArgs, "--output") === "json" || extraArgs.includes("--json");
  const createIssues = extraArgs.includes("--create-issues");
  let runId = runIdArg;
  if (!runId) {
    const recent = db.listRuns(void 0, 1);
    runId = recent[0]?.id;
  }
  if (!runId) {
    errorMsg("No runs found to publish.");
    process.exit(1);
  }
  const run = db.findRunByPartialId(runId) || db.getRun(runId);
  if (!run) {
    errorMsg("Run not found: " + runId);
    process.exit(1);
  }
  const evidenceDir = getRunEvidenceDir(run.id);
  if (!fs4.existsSync(path4.join(evidenceDir, "manifest.json"))) {
    writeEvidenceBundle(run.id, { ci: process.argv.includes("--ci") });
  }
  fs4.mkdirSync(destDir, { recursive: true });
  const htmlPath = path4.join(destDir, "ghostrun-report.html");
  const junitPath = path4.join(destDir, "ghostrun-junit.xml");
  const manifestPath = path4.join(destDir, "manifest.json");
  const failurePath = path4.join(destDir, "failure.v1.json");
  const screenshotsDir = path4.join(destDir, "screenshots");
  const srcManifest = path4.join(evidenceDir, "manifest.json");
  const srcReport = path4.join(evidenceDir, "report.html");
  const srcFailure = path4.join(evidenceDir, "failure.v1.json");
  const srcScreenshots = path4.join(evidenceDir, "screenshots");
  if (fs4.existsSync(srcReport)) fs4.copyFileSync(srcReport, htmlPath);
  else await generateRunReport(run.id, htmlPath);
  const steps = db.listSteps(run.id);
  const flow = db.getFlow(run.flowId);
  const flowName = flow?.name || run.flowId;
  const junitSource = await writeJUnitReport(
    flowName,
    run.id,
    steps.map((s) => ({ name: s.name, status: s.status, duration: s.duration, errorMessage: s.errorMessage })),
    run.duration || 0
  );
  fs4.copyFileSync(junitSource, junitPath);
  fs4.mkdirSync(screenshotsDir, { recursive: true });
  const copiedScreenshots = [];
  const shotSourceDir = fs4.existsSync(srcScreenshots) ? srcScreenshots : db.getScreenshotsPath(run.id);
  if (fs4.existsSync(shotSourceDir)) {
    for (const file of fs4.readdirSync(shotSourceDir).filter((f) => f.endsWith(".png"))) {
      const dest = path4.join(screenshotsDir, file);
      fs4.copyFileSync(path4.join(shotSourceDir, file), dest);
      copiedScreenshots.push(dest);
    }
  }
  let manifest = {};
  if (fs4.existsSync(srcManifest)) {
    manifest = JSON.parse(fs4.readFileSync(srcManifest, "utf8"));
  }
  manifest = {
    ...manifest,
    publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    publishDir: path4.resolve(destDir),
    htmlReport: path4.resolve(htmlPath),
    junitReport: path4.resolve(junitPath),
    screenshots: copiedScreenshots.map((p) => path4.resolve(p))
  };
  fs4.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (fs4.existsSync(srcFailure)) {
    fs4.copyFileSync(srcFailure, failurePath);
  }
  if (createIssues) {
    if (run.status === "failed" && fs4.existsSync(failurePath)) {
      const config = readConfig();
      const issueTrigger = process.env.CI === "true" || extraArgs.includes("--ci") ? "ci-failure" : "local-failure";
      if (!shouldCreateGitHubIssue(config, issueTrigger)) {
        warn(`--create-issues skipped: integrations.github.createOn excludes "${issueTrigger}".`);
      } else {
        try {
          const failure = JSON.parse(fs4.readFileSync(failurePath, "utf8"));
          const result = await createGitHubIssueFromFailure(failure, manifest, config, {
            publishFailurePath: failurePath,
            evidenceFailurePath: fs4.existsSync(srcFailure) ? srcFailure : void 0
          });
          if (result.skipped === "duplicate" && result.issueUrl) {
            info(`GitHub issue already exists: ${result.issueUrl}`);
          } else if (result.created && result.issueUrl) {
            success(`GitHub issue created: ${result.issueUrl}`);
          } else if (result.skipped === "disabled") {
            warn("--create-issues skipped: integrations.github.enabled is false.");
          } else if (result.skipped === "config") {
            errorMsg("Set integrations.github.owner and integrations.github.repo in config.");
            process.exit(1);
          }
        } catch (err) {
          errorMsg(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    } else {
      warn("--create-issues skipped: run passed or no failure artifact.");
    }
  }
  if (jsonOutput) {
    console.log(JSON.stringify(manifest));
    return;
  }
  success("Reports published.");
  info(`Directory: ${import_chalk.default.cyan(path4.resolve(destDir))}`);
  info(`HTML:      ${import_chalk.default.cyan(String(manifest.htmlReport))}`);
  info(`JUnit:     ${import_chalk.default.cyan(String(manifest.junitReport))}`);
  info(`Manifest:  ${import_chalk.default.cyan(path4.resolve(manifestPath))}`);
  if (fs4.existsSync(failurePath)) info(`Failure:   ${import_chalk.default.cyan(path4.resolve(failurePath))}`);
  console.log();
}
async function runAuthor() {
  printLogo();
  divider();
  console.log(import_chalk.default.bold("\n  Author a Flow\n"));
  console.log(import_chalk.default.white("  Choose how to create a new flow:\n"));
  console.log(`  ${import_chalk.default.cyan("1)")} Record browser flow`);
  console.log(`  ${import_chalk.default.cyan("2)")} Generate from description ${import_chalk.default.gray("(AI)")}`);
  console.log(`  ${import_chalk.default.cyan("3)")} Import from curl`);
  console.log(`  ${import_chalk.default.cyan("4)")} Import from OpenAPI spec`);
  console.log(`  ${import_chalk.default.cyan("5)")} Explore website ${import_chalk.default.gray("(AI)")}`);
  console.log();
  const choice = await askQuestion("  Enter choice [1-5]: ");
  switch (choice.trim()) {
    case "1": {
      const url = await askQuestion("  URL to record: ");
      if (!url.trim()) {
        errorMsg("URL required");
        process.exit(1);
      }
      await runLearn(url.trim());
      break;
    }
    case "2":
      await runCreate();
      break;
    case "3":
      await runFlowFromCurl();
      break;
    case "4": {
      const specFile = await askQuestion("  Path to OpenAPI/Swagger file: ");
      if (!specFile.trim()) {
        errorMsg("File path required");
        process.exit(1);
      }
      await runFlowFromSpec(specFile.trim());
      break;
    }
    case "5": {
      const exploreUrl = await askQuestion("  URL to explore: ");
      if (!exploreUrl.trim()) {
        errorMsg("URL required");
        process.exit(1);
      }
      await runExplore(exploreUrl.trim());
      break;
    }
    default:
      errorMsg(`Invalid choice: ${choice}. Enter a number from 1 to 5.`);
      process.exit(1);
  }
}
async function runMonitor(flowId, extraArgs = []) {
  const intervalArg = parseFlagValue(extraArgs, "--interval");
  if (!intervalArg && !extraArgs.includes("--interval")) {
    return runMonitorOnce(flowId);
  }
  const intervalSec = intervalArg ? Math.max(1, parseInt(intervalArg, 10) || 60) : 60;
  const profileArg = parseFlagValue(extraArgs, "--profile");
  if (profileArg) {
    const config = readConfig();
    config.activeProfile = profileArg;
    writeConfig(config);
  }
  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) {
    errorMsg("Flow not found: " + flowId);
    process.exit(1);
  }
  const activeProfileName = profileArg || readConfig().activeProfile || void 0;
  const activeProfile = activeProfileName ? getProfile(activeProfileName) : null;
  const notifyTargets = resolveMonitorNotificationTargets(extraArgs, activeProfile);
  printLogo();
  divider();
  console.log(
    import_chalk.default.bold("\n  Monitoring: ") + import_chalk.default.white(flow.name) + import_chalk.default.gray(` every ${intervalSec}s`) + import_chalk.default.gray(" | Press Ctrl+C to stop\n")
  );
  let totalRuns = 0;
  let totalPassed = 0;
  let consecutiveFailures = 0;
  let running = false;
  let lastAlertAt = 0;
  process.once("SIGINT", () => {
    console.log("\n");
    divider();
    const passRate = totalRuns > 0 ? (totalPassed / totalRuns * 100).toFixed(1) : "0.0";
    console.log(import_chalk.default.bold("  Monitor stopped."));
    console.log(`  Total runs:  ${import_chalk.default.white(String(totalRuns))}`);
    console.log(`  Pass rate:   ${totalRuns > 0 && totalPassed === totalRuns ? import_chalk.default.green(passRate + "%") : import_chalk.default.yellow(passRate + "%")}`);
    console.log();
    process.exit(0);
  });
  const tick = async () => {
    if (running) return;
    running = true;
    const tickStart = Date.now();
    try {
      const result = await executeFlow(flow.id, globalVars, { quiet: true, jsonOutput: false });
      const durationMs = Date.now() - tickStart;
      const durationStr = durationMs >= 1e3 ? `${(durationMs / 1e3).toFixed(1)}s` : `${durationMs}ms`;
      const ts = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
      totalRuns++;
      if (result.passed) {
        totalPassed++;
        consecutiveFailures = 0;
        console.log(`  ${import_chalk.default.green("\u2713")} ${import_chalk.default.gray(ts)} ${import_chalk.default.green("PASS")} ${import_chalk.default.gray(durationStr)}`);
      } else {
        consecutiveFailures++;
        const errMsg = result.error ? result.error.split("\n")[0].slice(0, 120) : "unknown error";
        console.log(`  ${import_chalk.default.red("\u2717")} ${import_chalk.default.gray(ts)} ${import_chalk.default.red("FAIL")} ${import_chalk.default.gray(durationStr)}`);
        console.log(import_chalk.default.red(`    ERROR: ${errMsg}`));
        if (consecutiveFailures >= notifyTargets.threshold) {
          console.log(import_chalk.default.red.bold(`
  !! ALERT: ${consecutiveFailures} consecutive failures for "${flow.name}" !!
`));
          if (notifyTargets.enabled && consecutiveFailures === notifyTargets.threshold) {
            await sendMonitorAlert({
              flow,
              profileName: activeProfileName,
              consecutiveFailures,
              error: errMsg,
              webhookUrl: notifyTargets.webhookUrl,
              slackWebhook: notifyTargets.slackWebhook
            });
            lastAlertAt = consecutiveFailures;
          } else if (notifyTargets.enabled && consecutiveFailures > lastAlertAt && consecutiveFailures % notifyTargets.threshold === 0) {
            await sendMonitorAlert({
              flow,
              profileName: activeProfileName,
              consecutiveFailures,
              error: errMsg,
              webhookUrl: notifyTargets.webhookUrl,
              slackWebhook: notifyTargets.slackWebhook
            });
            lastAlertAt = consecutiveFailures;
          }
        }
      }
    } catch (err) {
      const durationMs = Date.now() - tickStart;
      const durationStr = durationMs >= 1e3 ? `${(durationMs / 1e3).toFixed(1)}s` : `${durationMs}ms`;
      const ts = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
      totalRuns++;
      consecutiveFailures++;
      const errMsg = err instanceof Error ? err.message.split("\n")[0].slice(0, 120) : String(err);
      console.log(`  ${import_chalk.default.red("\u2717")} ${import_chalk.default.gray(ts)} ${import_chalk.default.red("FAIL")} ${import_chalk.default.gray(durationStr)}`);
      console.log(import_chalk.default.red(`    ERROR: ${errMsg}`));
      if (consecutiveFailures >= notifyTargets.threshold) {
        console.log(import_chalk.default.red.bold(`
  !! ALERT: ${consecutiveFailures} consecutive failures for "${flow.name}" !!
`));
        if (notifyTargets.enabled && consecutiveFailures >= notifyTargets.threshold && consecutiveFailures !== lastAlertAt) {
          await sendMonitorAlert({
            flow,
            profileName: activeProfileName,
            consecutiveFailures,
            error: errMsg,
            webhookUrl: notifyTargets.webhookUrl,
            slackWebhook: notifyTargets.slackWebhook
          });
          lastAlertAt = consecutiveFailures;
        }
      }
    } finally {
      running = false;
    }
  };
  await tick();
  setInterval(tick, intervalSec * 1e3);
  await new Promise(() => {
  });
}
var args = process.argv.slice(2);
var cmd = args[0];
var globalVars = parseVars(process.argv.slice(2));
var db;
function initializeDatabase() {
  initProjectContext();
  refreshProjectConstants();
  const paths = getProjectPaths();
  const hasProject = fs4.existsSync(paths.configPath);
  const manager = new DatabaseManager(hasProject ? {
    dbPath: paths.dbPath,
    screenshotsPath: paths.screenshotsPath,
    sessionsPath: paths.sessionsPath
  } : {});
  manager.setFlowSyncHook((event, flow) => {
    if (!fs4.existsSync(paths.configPath)) return;
    try {
      if (event === "delete") deleteFlowFile(flow.id, flow.name);
      else writeFlowFile(flow);
    } catch {
    }
  });
  if (hasProject) {
    const sync = syncFlowsFromDisk(
      (data) => manager.createFlow(data),
      (name) => manager.findFlowByName(name),
      (id, data) => manager.updateFlow(id, data)
    );
    if (sync.imported + sync.updated > 0 && process.env.GHOSTRUN_QUIET !== "1") {
      info(`Synced flows from disk: ${sync.imported} imported, ${sync.updated} updated`);
    }
  }
  return manager;
}
async function runSyncFlows() {
  ensureProjectWorkspace();
  const sync = syncFlowsFromDisk(
    (data) => db.createFlow(data),
    (name) => db.findFlowByName(name),
    (id, data) => db.updateFlow(id, data)
  );
  success(`Flow sync complete \u2014 imported ${sync.imported}, updated ${sync.updated}, skipped ${sync.skipped}`);
  const files = listFlowFiles();
  if (files.length) info(`${files.length} flow file(s) under .ghostrun/flows/`);
}
async function runMigrateProjectScope() {
  printLogo();
  divider();
  ensureProjectWorkspace();
  const paths = getProjectPaths();
  const globalDbPath = path4.join(DATA_PATH2, "data", "ghostrun.db");
  if (!fs4.existsSync(globalDbPath)) {
    warn("No global database at ~/.ghostrun/data/ghostrun.db \u2014 nothing to migrate.");
    return;
  }
  if (fs4.existsSync(paths.dbPath) && db.listFlows().length > 0) {
    const approved = await confirmAction("  Project DB already has flows. Merge global flows anyway? (y/N) ", false);
    if (!approved) {
      warn("Migration cancelled.");
      return;
    }
  }
  const globalDb = new DatabaseManager({ dbPath: globalDbPath });
  const globalFlows = globalDb.listFlows();
  let imported = 0;
  for (const flow of globalFlows) {
    const existing = db.findFlowByName(flow.name);
    if (existing) continue;
    db.createFlow({
      name: flow.name,
      description: flow.description || void 0,
      appUrl: flow.appUrl || void 0,
      graph: JSON.parse(flow.graph || "{}"),
      createdBy: flow.createdBy
    });
    imported++;
  }
  globalDb.close();
  const diskSync = syncFlowsFromDisk(
    (data) => db.createFlow(data),
    (name) => db.findFlowByName(name),
    (id, data) => db.updateFlow(id, data)
  );
  success(`Project scope migration complete`);
  info(`Global flows copied: ${imported}`);
  info(`Disk sync: ${diskSync.imported} imported, ${diskSync.updated} updated`);
  info(`Project DB: ${paths.dbPath}`);
}
async function runServicesCommand(subArgs) {
  ensureProjectWorkspace();
  const sub = subArgs[0] || "list";
  const profile = getSelectedProfile(subArgs) || (readConfig().activeProfile ? getProfile(readConfig().activeProfile) : null);
  switch (sub) {
    case "list": {
      console.log(import_chalk.default.bold("\n  Service Bridge (optional)\n"));
      console.log(import_chalk.default.gray("  Most SaaS apps use profile auth + shared QA credentials \u2014 no Mailpit required."));
      console.log(import_chalk.default.gray("  Set auth in .ghostrun/profiles/staging.json and secrets via env or auth/secrets/."));
      console.log();
      console.log(import_chalk.default.gray("  Optional local dev stack: .ghostrun/services/dev.compose.yml"));
      console.log(import_chalk.default.gray("  Mailpit (magic links):  http://localhost:8025"));
      console.log(import_chalk.default.gray("  Hook catcher:           http://127.0.0.1:8787"));
      console.log(import_chalk.default.gray("  Start Mailpit only:     docker compose -f .ghostrun/services/dev.compose.yml up -d mailpit"));
      if (profile?.services) {
        console.log(import_chalk.default.cyan("\n  Active profile services:"));
        console.log(JSON.stringify(profile.services, null, 2));
      } else {
        console.log(import_chalk.default.gray("\n  No services block \u2014 profile auth only (recommended for password login)."));
      }
      console.log();
      break;
    }
    case "doctor": {
      console.log(import_chalk.default.bold("\n  Service Bridge Health\n"));
      const results = await runServicesDoctor(profile?.services);
      for (const r of results) {
        const badge = r.ok ? import_chalk.default.green(" OK ") : import_chalk.default.red("FAIL");
        console.log(`  [${badge}] ${r.name} \u2014 ${r.detail}`);
      }
      console.log();
      break;
    }
    case "inbox": {
      if (!isEmailBridgeEnabled(profile?.services)) {
        errorMsg("Mailpit not enabled on this profile. Add services.email or use profile auth with QA credentials.");
        process.exit(1);
      }
      const apiUrl = resolveEmailApiUrl(profile?.services);
      try {
        const messages = await fetchMailpitMessages(apiUrl);
        console.log(import_chalk.default.bold(`
  Mailpit inbox (${messages.length} messages)
`));
        console.log(sanitizeInboxSnapshot(messages, 15) || import_chalk.default.gray("  (empty)"));
      } catch (e) {
        errorMsg(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
      console.log();
      break;
    }
    case "hooks": {
      const captures = listWebhookCaptures(20);
      console.log(import_chalk.default.bold(`
  Webhook captures (${captures.length})
`));
      for (const c of captures.slice(0, 10)) {
        console.log(`  ${import_chalk.default.gray(c.receivedAt)} ${import_chalk.default.cyan(c.method)} ${c.path} (${c.body.length} bytes)`);
      }
      if (captures.length === 0) console.log(import_chalk.default.gray("  (none \u2014 POST to http://127.0.0.1:8787/your/path)"));
      console.log();
      break;
    }
    case "hook": {
      if (subArgs.includes("--daemon")) {
        const { url } = await startHookCatcher(8787);
        success(`Hook catcher listening on ${url}`);
        info("POST any path \u2014 captures saved to .ghostrun/services/webhooks/");
        info("Health: GET /hooks/health");
        await new Promise(() => {
        });
      } else {
        errorMsg("Usage: ghostrun services hook --daemon");
        process.exit(1);
      }
      break;
    }
    case "up": {
      copyDevServicesTemplate();
      const compose = path4.join(getProjectPaths().servicesPath, "dev.compose.yml");
      info(`Dev stack template: ${compose}`);
      info("Run: docker compose -f .ghostrun/services/dev.compose.yml up -d");
      break;
    }
    case "seed": {
      const pg = profile?.services?.postgres;
      if (!pg?.connectionSecret) {
        errorMsg("Profile missing services.postgres.connectionSecret");
        process.exit(1);
      }
      const paths = getProjectPaths();
      const fixtures = (pg.fixtures || []).map((f) => path4.isAbsolute(f) ? f : path4.join(paths.fixturesSql, f));
      await runSqlFixtures(fixtures, pg.connectionSecret);
      success(`Applied ${fixtures.length} SQL fixture(s)`);
      break;
    }
    default:
      errorMsg(`Unknown services subcommand: ${sub}. Use: list, doctor, inbox, hooks, hook, up, seed`);
      process.exit(1);
  }
}
async function main() {
  db = initializeDatabase();
  if (!cmd) {
    await runHome();
    db.close();
    return;
  }
  if (cmd === "--version" || cmd === "-v") {
    const realBin = fs4.realpathSync(process.argv[1]);
    const pkgPath = path4.join(path4.dirname(realBin), "package.json");
    const pkg = JSON.parse(fs4.readFileSync(pkgPath, "utf8"));
    console.log(pkg.version);
    process.exit(0);
  }
  const subHelpRequested = cmd !== "help" && cmd !== "--help" && cmd !== "-h" && args.slice(1).some((a) => a === "--help" || a === "-h");
  if (cmd === "help" || cmd === "--help" || cmd === "-h" || subHelpRequested) {
    printLogo();
    divider();
    console.log();
    if (subHelpRequested) {
      console.log(import_chalk.default.gray(`  Per-command usage isn't available yet \u2014 showing the full reference. See REFERENCE.md for "${cmd}" specifically.
`));
    }
    const C = (s) => import_chalk.default.cyan(s.padEnd(34));
    const G = (s) => import_chalk.default.gray(s);
    const H = (s) => {
      console.log(import_chalk.default.bold.white("  " + s));
      console.log(import_chalk.default.gray("  " + "\u2500".repeat(55)));
    };
    H("Record & Run");
    console.log(`  ${C("learn <url> [name]")}${G("Record a new flow (opens real browser)")}`);
    console.log(`  ${C("learn --cdp <endpoint>")}${G("Attach to a running browser instead (e.g. an AI agent's)")}`);
    console.log(`  ${C("run <id|name> [--var k=v]")}${G("Execute a flow headlessly")}`);
    console.log(`  ${C("run <id> --visible")}${G("Run with visible browser window")}`);
    console.log(`  ${C("run <id> --ci")}${G("CI-safe run (no implicit healing)")}`);
    console.log(`  ${C("run <id> --output json")}${G("JSON output with extracted data")}`);
    console.log(`  ${C("run <id> --report html")}${G("Run flow + save HTML report")}`);
    console.log(`  ${C("run <id> --reporter junit")}${G("Save JUnit XML report after run")}`);
    console.log(`  ${C("run <id> --video")}${G("Record video of the run")}`);
    console.log(`  ${C("run <id> --trace")}${G("Record Playwright trace for inspection")}`);
    console.log(`  ${C("run <id> --baseline")}${G("Fail on visual regression vs baselines")}`);
    console.log(`  ${C("run <id> --baseline-threshold 5")}${G("Visual diff threshold (percent)")}`);
    console.log(`  ${C("author create [description]")}${G("Generate flow from natural language  \u{1F916} AI")}`);
    console.log(`  ${C("author")}${G("Interactive menu to author a flow")}`);
    console.log(`  ${C("code:scan <directory>")}${G("Scan codebase, create draft flows    \u{1F916} AI")}`);
    console.log();
    H("Flow Management");
    console.log(`  ${C("flow:list")}${G("List all flows with creator + pass rate")}`);
    console.log(`  ${C("flow:fix <id|name>")}${G("Interactively repair broken selectors")}`);
    console.log(`  ${C("flow:delete <id|name>")}${G("Delete a flow")}`);
    console.log(`  ${C("flow:export <id|name>")}${G("Export flow to .flow.json")}`);
    console.log(`  ${C("flow:import <file>")}${G("Import flow from .flow.json")}`);
    console.log(`  ${C("flow:rename <id|name> <new>")}${G("Rename a flow")}`);
    console.log(`  ${C("flow:clone <id|name>")}${G("Duplicate a flow")}`);
    console.log(`  ${C("flow:from-curl [cmd]")}${G("Parse curl command \u2192 create flow")}`);
    console.log(`  ${C("flow:from-spec <file>")}${G("Import OpenAPI/Swagger JSON or YAML spec")}`);
    console.log();
    H("Profiles");
    console.log(`  ${C("profile list")}${G("List project profiles")}`);
    console.log(`  ${C("profile show <name>")}${G("Show a project profile")}`);
    console.log(`  ${C("profile create <name> [url]")}${G("Create a profile with optional base URL")}`);
    console.log(`  ${C("profile use <name>")}${G("Set the active project profile")}`);
    console.log(`  ${C("profile set <name> <key> <val>")}${G("Set baseUrl, auth.*, meta.*, or profile var")}`);
    console.log(`  ${C("profile delete <name>")}${G("Delete a project profile")}`);
    console.log(`  ${C("profile accounts list <profile>")}${G("Roles: superadmin, admin, manager, guest")}`);
    console.log(`  ${C("profile account add <profile> <id>")}${G("Add account with email + password secrets")}`);
    console.log(import_chalk.default.gray(`  ${"  Run: --profile staging --account admin  (email + password per role)".padEnd(52)}`));
    console.log();
    H("SaaS Service Bridge (optional)");
    console.log(`  ${C("services list")}${G("Overview \u2014 creds-first; Mailpit optional")}`);
    console.log(`  ${C("services doctor")}${G("Check configured services only")}`);
    console.log(`  ${C("services inbox")}${G("Mailpit inbox (requires services.email)")}`);
    console.log(`  ${C("services hooks")}${G("List captured webhooks")}`);
    console.log(`  ${C("services hook --daemon")}${G("Start local webhook catcher on :8787")}`);
    console.log(import_chalk.default.gray(`  ${"  Flow actions: db:*, webhook:*, email:* (optional Mailpit)".padEnd(52)}`));
    console.log();
    H("Project Scope");
    console.log(`  ${C("sync flows")}${G("Import .ghostrun/flows/*.flow.json into DB")}`);
    console.log(`  ${C("migrate project-scope")}${G("Copy flows from ~/.ghostrun to this repo")}`);
    console.log();
    H("Monitor & Scheduling");
    console.log(`  ${C("monitor <id> --interval 60s")}${G("Poll a flow on an interval")}`);
    console.log(`  ${C("monitor daemon")}${G("Run cron scheduler (writes scheduler.pid)")}`);
    console.log(`  ${C("monitor schedule list")}${G("List cron schedules")}`);
    console.log(`  ${C('monitor schedule add <id> "<cron>"')}${G('Add schedule  e.g. "0 9 * * *"')}`);
    console.log(`  ${C("monitor schedule remove <id>")}${G("Remove a schedule")}`);
    console.log(import_chalk.default.gray(`  ${"  Legacy (deprecated v1.3.0): flow:schedule, schedule:list, serve".padEnd(52)}`));
    console.log(`  ${C("serve --ui [--port 3000]")}${G("Launch the web dashboard")}`);
    console.log();
    H("Test Suites");
    console.log(`  ${C("suite:create <name>")}${G("Create a test suite")}`);
    console.log(`  ${C("suite:add <suite> <flow>")}${G("Add a flow to a suite")}`);
    console.log(`  ${C("suite:list")}${G("List all suites")}`);
    console.log(`  ${C("suite:show <suite>")}${G("Show flows in a suite")}`);
    console.log(`  ${C("suite:run <suite> [--var k=v] [--parallel]")}${G("Run all flows in a suite")}`);
    console.log();
    H("Visual Baselines");
    console.log(`  ${C("baseline:set <flow-id>")}${G("Capture reference screenshots")}`);
    console.log(`  ${C("baseline:clear <flow-id>")}${G("Clear baselines for a flow")}`);
    console.log(`  ${C("baseline:show <flow-id>")}${G("List baseline screenshots")}`);
    console.log(`  ${C("run <id> --baseline")}${G("Gate runs on visual diff vs baselines")}`);
    console.log();
    H("Run History & Analysis");
    console.log(`  ${C("report list")}${G("List recent runs with status + timing")}`);
    console.log(`  ${C("report show <id>")}${G("Full step details + screenshots")}`);
    console.log(`  ${C("report diff <id1> <id2>")}${G("Pixel-diff screenshots between two runs")}`);
    console.log(`  ${C("report analyze <id>")}${G("Plain-English failure analysis          \u{1F916} AI")}`);
    console.log(`  ${C("repair list")}${G("List stored repair proposals")}`);
    console.log(`  ${C("repair show <id>")}${G("Show repair proposal details")}`);
    console.log(`  ${C("repair apply <id>")}${G("Apply a stored repair proposal")}`);
    console.log(`  ${C("improve")}${G("Analyze GhostRun data and suggest improvements")}`);
    console.log(`  ${C("report publish")}${G("Bundle HTML/JUnit/screenshots for CI")}`);
    console.log(`  ${C("report list")}${G("List recent runs")}`);
    console.log(`  ${C("integrations list")}${G("Show GitHub/Linear integration config")}`);
    console.log();
    H("Template Store");
    console.log(`  ${C("store list")}${G("Browse 10+ ready-made flow templates")}`);
    console.log(`  ${C("store install <name>")}${G("Install a template (sets {{variables}})")}`);
    console.log();
    H("Data Extraction & Monitoring");
    console.log(`  ${C("monitor <id|name>")}${G("Run flow + show extracted data changes")}`);
    console.log(`  ${C("monitor <id> --output json")}${G("Monitor with JSON output")}`);
    console.log(`  ${C("monitor <id> --interval <s>")}${G("Loop: run every N seconds (default 60)")}`);
    console.log(`  ${C("monitor <id> --interval 30 --profile <name>")}${G("Continuous monitor with profile")}`);
    if (isCrawleeEnabled()) {
      console.log(`  ${C("scrape <url> [opts]")}${G("Scrape website data with Crawlee")}`);
      console.log(`  ${C("scrape:run <url> --flow <id>")}${G("Scrape first, then run a flow")}`);
      console.log(`  ${C("scrape:list")}${G("List saved scrape datasets")}`);
      console.log(`  ${C("scrape:show <id>")}${G("Show saved scrape JSON")}`);
      console.log(import_chalk.default.gray(`  ${"  Options: --max-pages N  --selector CSS  --output json".padEnd(52)}`));
    }
    console.log(import_chalk.default.gray(`  ${"  Flow actions: extract, scroll:bottom, scroll:load, next:page".padEnd(52)}`));
    console.log();
    H("API Testing");
    console.log(`  ${C("api:learn")}${G("Build HTTP API test flow interactively")}`);
    console.log(`  ${C("env:create <name>")}${G("Create environment (dev/staging/prod)")}`);
    console.log(`  ${C("env:list")}${G("List all environments")}`);
    console.log(`  ${C("env:set <env> <key> <val>")}${G("Set variable in environment")}`);
    console.log(`  ${C("env:use <name>")}${G("Activate environment for runs")}`);
    console.log(`  ${C("env:show <name>")}${G("Show environment variables")}`);
    console.log(`  ${C("var:dump <run-id>")}${G("Show extracted variables + API calls from run")}`);
    console.log();
    H("Load & Performance Testing");
    console.log(`  ${C("perf:run <flow> [opts]")}${G("Run load test  --vus 20 --duration 30s")}`);
    console.log(`  ${C("perf:export <flow> [opts]")}${G("Export k6 script  --p95 500 --max-errors 1")}`);
    console.log(`  ${C("perf:list")}${G("List past performance runs")}`);
    console.log(`  ${C("perf:show <run-id>")}${G("Show detailed stats for a perf run")}`);
    console.log(`  ${C("perf:compare <id-A> <id-B>")}${G("Side-by-side comparison of two perf runs")}`);
    console.log(`  ${C("perf:run <flow> --report html")}${G("Run load test + save HTML report")}`);
    console.log(import_chalk.default.gray(`  ${"  Options: --vus N  --duration Ns  --ramp-up Ns  --timeout Ns".padEnd(52)}`));
    console.log();
    H("Chat & Setup");
    console.log(`  ${C("chat")}${G("Ask GhostRun Bot \u2014 Q&A + run flows      \u{1F916} AI")}`);
    console.log(`  ${C("init [--yes]")}${G("Setup wizard (Chromium + AI provider)")}`);
    console.log(`  ${C("audit")}${G("Scan project for secret leaks")}`);
    console.log(`  ${C("config:mode [assist|auto]")}${G("Show or set interaction mode")}`);
    console.log(`  ${C("ai status")}${G("AI provider, policy, and usage summary")}`);
    console.log(`  ${C("ai usage")}${G("Aggregated AI token and call usage")}`);
    console.log(`  ${C("ai sessions [limit]")}${G("Recent sanitized AI session log")}`);
    console.log();
    H("Exploration & System");
    console.log(`  ${C("explore <url>")}${G("Auto-discover flows via BFS crawl       \u{1F916} AI")}`);
    console.log(`  ${C("explore:list")}${G("List all explore sessions")}`);
    console.log(`  ${C("explore:confirm <report-id>")}${G("Save confirmed flows from explore")}`);
    console.log(`  ${C("status")}${G("Stats, creator breakdown, AI provider")}`);
    console.log(`  ${C("doctor")}${G("Run a health checklist for GhostRun")}`);
    console.log(`  ${C("benchmark author")}${G("Measure AI flow generation quality")}`);
    console.log(`  ${C("serve")}${G("Open web dashboard (ghostrun serve --ui)")}`);
    console.log();
    console.log(import_chalk.default.gray("  \u{1F916} AI  = enhanced by AI (Ollama local or ANTHROPIC_API_KEY)"));
    console.log(import_chalk.default.gray("  \u{1F464}     = human-recorded   \u{1F916} = agent/AI-generated"));
    console.log(import_chalk.default.gray("  Flags:     --visible  --ci  --profile <name>  --baseline  --output json  --var key=value"));
    console.log();
    process.exit(0);
  }
  if (cmd === "repair" && args[1]) {
    const sub = args[1];
    const rest = args.slice(2);
    switch (sub) {
      case "list":
        await runRepairList();
        break;
      case "show":
        if (!rest[0]) {
          errorMsg("Repair proposal ID required");
          process.exit(1);
        }
        await runRepairShow(rest[0]);
        break;
      case "apply":
        if (!rest[0]) {
          errorMsg("Repair proposal ID required");
          process.exit(1);
        }
        await runRepairApply(rest[0]);
        break;
      default:
        errorMsg(`Unknown repair subcommand: ${sub}. Use: list, show, apply`);
        process.exit(1);
    }
    db.close();
    return;
  }
  if (cmd === "report" && args[1]) {
    const sub = args[1];
    const rest = args.slice(2);
    switch (sub) {
      case "list":
        await runListRuns();
        break;
      case "show":
        if (!rest[0]) {
          errorMsg("Run ID required");
          process.exit(1);
        }
        await runShowRun(rest[0]);
        break;
      case "diff":
        if (!rest[0] || !rest[1]) {
          errorMsg("Usage: ghostrun report diff <run1> <run2>");
          process.exit(1);
        }
        await runDiff(rest[0], rest[1]);
        break;
      case "analyze":
        if (!rest[0]) {
          errorMsg("Run ID required");
          process.exit(1);
        }
        await runAnalyzeRun(rest[0]);
        break;
      case "publish":
        await runReportPublish(rest);
        break;
      default:
        errorMsg(`Unknown report subcommand: ${sub}. Use: list, show, diff, analyze, publish`);
        process.exit(1);
    }
    db.close();
    return;
  }
  if (cmd === "profile" && args[1] && !args[1].includes(":")) {
    const sub = args[1];
    const rest = args.slice(2);
    switch (sub) {
      case "list":
        await runProfileList();
        break;
      case "show":
        if (!rest[0]) {
          errorMsg("Profile name required");
          process.exit(1);
        }
        await runProfileShow(rest[0]);
        break;
      case "create":
        if (!rest[0]) {
          errorMsg("Profile name required");
          process.exit(1);
        }
        await runProfileCreate(rest[0], rest[1]);
        break;
      case "use":
        if (!rest[0]) {
          errorMsg("Profile name required");
          process.exit(1);
        }
        await runProfileUse(rest[0]);
        break;
      case "set":
        if (!rest[0] || !rest[1] || !rest[2]) {
          errorMsg("Usage: ghostrun profile set <name> <key> <value>");
          process.exit(1);
        }
        await runProfileSet(rest[0], rest[1], rest[2]);
        break;
      case "delete":
        if (!rest[0]) {
          errorMsg("Profile name required");
          process.exit(1);
        }
        await runProfileDelete(rest[0]);
        break;
      case "accounts":
        if (rest[0] === "list") {
          if (!rest[1]) {
            errorMsg("Usage: ghostrun profile accounts list <profile>");
            process.exit(1);
          }
          await runProfileAccountsList(rest[1]);
        } else if (rest[0] === "show") {
          if (!rest[1] || !rest[2]) {
            errorMsg("Usage: ghostrun profile accounts show <profile> <account>");
            process.exit(1);
          }
          await runProfileAccountShow(rest[1], rest[2]);
        } else {
          errorMsg("Usage: ghostrun profile accounts list|show <profile> [account]");
          process.exit(1);
        }
        break;
      case "account":
        if (rest[0] === "add") {
          if (!rest[1] || !rest[2]) {
            errorMsg("Usage: ghostrun profile account add <profile> <account-id> [--email addr] [--password-secret ENV] [--login-flow name]");
            process.exit(1);
          }
          const addRest = rest.slice(3);
          await runProfileAccountAdd(rest[1], rest[2], {
            email: parseFlagValue(addRest, "--email"),
            emailSecret: parseFlagValue(addRest, "--email-secret"),
            passwordSecret: parseFlagValue(addRest, "--password-secret"),
            loginFlow: parseFlagValue(addRest, "--login-flow"),
            label: parseFlagValue(addRest, "--label"),
            default: addRest.includes("--default")
          });
        } else {
          errorMsg("Usage: ghostrun profile account add <profile> <account-id> [options]");
          process.exit(1);
        }
        break;
      default:
        errorMsg(`Unknown profile subcommand: ${sub}. Use: list, show, create, use, set, delete, accounts, account`);
        process.exit(1);
    }
    db.close();
    return;
  }
  if (cmd === "author" && args[1]) {
    const sub = args[1];
    const rest = args.slice(2);
    switch (sub) {
      case "create":
        await runCreate(rest.filter((a) => !a.startsWith("--")).join(" ") || void 0, rest);
        break;
      case "record":
      case "learn":
        if (!rest[0]) {
          errorMsg("URL required");
          process.exit(1);
        }
        await runLearn(rest[0]);
        break;
      case "curl":
        await runFlowFromCurl(rest[0]);
        break;
      case "spec":
        if (!rest[0]) {
          errorMsg("OpenAPI spec path required");
          process.exit(1);
        }
        await runFlowFromSpec(rest[0]);
        break;
      case "explore":
        if (!rest[0]) {
          errorMsg("URL required");
          process.exit(1);
        }
        await runExplore(rest[0]);
        break;
      default:
        await runAuthor();
    }
    db.close();
    return;
  }
  if (cmd === "ai" && args[1]) {
    const sub = args[1];
    switch (sub) {
      case "status":
        await runAiStatus();
        break;
      case "usage":
        await runAiUsage();
        break;
      case "sessions":
        await runAiSessions(args[2]);
        break;
      default:
        errorMsg(`Unknown ai subcommand: ${sub}. Use: status, usage, sessions`);
        process.exit(1);
    }
    db.close();
    return;
  }
  if (cmd === "integrations") {
    await runIntegrationsCommand(args.slice(1));
    db.close();
    return;
  }
  if (cmd === "services") {
    await runServicesCommand(args.slice(1));
    db.close();
    return;
  }
  if (cmd === "sync" && args[1] === "flows") {
    await runSyncFlows();
    db.close();
    return;
  }
  if (cmd === "migrate" && args[1] === "project-scope") {
    await runMigrateProjectScope();
    db.close();
    return;
  }
  if (LEGACY_COMMAND_MAP[cmd]) rejectLegacyCommand(cmd);
  switch (cmd) {
    case "doctor":
      await runDoctor();
      break;
    case "benchmark":
      if (args[1] === "author") {
        await runAuthorBenchmark(args.slice(2));
      } else {
        errorMsg("Usage: ghostrun benchmark author [--dry-run]");
        process.exit(1);
      }
      break;
    case "audit":
      await runSecurityAudit(true);
      break;
    case "author":
      await runAuthor();
      break;
    case "init":
      await runInit(args.slice(1));
      break;
    case "chat":
      await runChat();
      break;
    case "config:mode":
      await runConfigMode(args[1]);
      break;
    case "monitor":
      await runMonitorCommand(args.slice(1));
      break;
    case "scrape":
      if (!args[1]) {
        errorMsg("URL required");
        process.exit(1);
      }
      await runScrapeCommand(args[1], args.slice(2));
      break;
    case "scrape:run":
      if (!args[1]) {
        errorMsg("URL required");
        process.exit(1);
      }
      await runScrapeAndFlowCommand(args[1], args.slice(2));
      break;
    case "scrape:list":
      await runScrapeList();
      break;
    case "scrape:show":
      if (!args[1]) {
        errorMsg("Scrape ID required");
        process.exit(1);
      }
      await runScrapeShow(args[1]);
      break;
    case "learn": {
      const learnArgs = args.slice(1);
      const cdpEndpoint = parseFlagValue(process.argv, "--cdp");
      const cdpIdx = learnArgs.indexOf("--cdp");
      const positionals = learnArgs.filter((a, i) => !a.startsWith("--") && (cdpIdx === -1 || i !== cdpIdx + 1));
      const firstLooksLikeUrl = positionals[0] && /^https?:\/\//i.test(positionals[0]);
      let url;
      let name;
      if (cdpEndpoint && !firstLooksLikeUrl) {
        name = positionals[0];
      } else {
        url = positionals[0];
        name = positionals[1];
      }
      if (!url && !cdpEndpoint) {
        errorMsg("URL required (or pass --cdp <endpoint> to attach to an existing browser and use its current page)");
        process.exit(1);
      }
      await runLearn(url, name, { cdpEndpoint });
      break;
    }
    case "run": {
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      const reportFlag = args.indexOf("--report");
      const reportFmt = reportFlag >= 0 ? args[reportFlag + 1] || "html" : null;
      const reportOut = (() => {
        const i = args.indexOf("--output");
        return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") && args[i + 1] !== "json" ? args[i + 1] : null;
      })();
      const reporterIdx = args.indexOf("--reporter");
      const reporterFmt = reporterIdx >= 0 ? args[reporterIdx + 1] || "" : null;
      const savedRunId = await runFlow(args[1], globalVars);
      if (reportFmt && savedRunId) {
        const outFile = reportOut || `ghostrun-report-${savedRunId.slice(0, 8)}.html`;
        await generateRunReport(savedRunId, outFile);
      }
      if (reporterFmt === "junit" && savedRunId) {
        const runSteps = db.listSteps(savedRunId);
        const runRecord = db.getRun(savedRunId);
        const totalMs = runRecord?.duration || 0;
        const flowRecord = runRecord ? db.findFlowByPartialId(runRecord.flowId) || db.findFlowByName(runRecord.flowId) : null;
        const flowNameForReport = flowRecord?.name || args[1];
        const junitPath = await writeJUnitReport(
          flowNameForReport,
          savedRunId,
          runSteps.map((s) => ({ name: s.name, status: s.status, duration: s.duration, errorMessage: s.errorMessage })),
          totalMs
        );
        info("JUnit report: " + import_chalk.default.cyan(junitPath));
      }
      break;
    }
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
    case "flow:rename":
      if (!args[1] || !args[2]) {
        errorMsg("Usage: flow:rename <id|name> <new-name>");
        process.exit(1);
      }
      await runRenameFlow(args[1], args.slice(2).join(" "));
      break;
    case "flow:clone":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runCloneFlow(args[1]);
      break;
    case "flow:from-curl":
      await runFlowFromCurl(args[1]);
      break;
    case "flow:from-spec":
      if (!args[1]) {
        errorMsg("File path required");
        process.exit(1);
      }
      await runFlowFromSpec(args[1]);
      break;
    case "serve":
      await runServe(args.slice(1));
      break;
    case "improve":
      await runImprove();
      break;
    case "explore":
      if (!args[1]) {
        errorMsg("URL required");
        process.exit(1);
      }
      await runExplore(args[1]);
      break;
    case "explore:list":
      await runExploreList();
      break;
    case "explore:confirm":
      if (!args[1]) {
        errorMsg("Report ID required");
        process.exit(1);
      }
      await runExploreConfirm(args[1]);
      break;
    // case 'app': removed - desktop app is deprecated, use web dashboard instead
    case "status":
      await runStatus();
      break;
    case "suite:create":
      if (!args[1]) {
        errorMsg("Suite name required");
        process.exit(1);
      }
      await runSuiteCreate(args[1]);
      break;
    case "suite:add":
      if (!args[1] || !args[2]) {
        errorMsg("Usage: suite:add <suite> <flow>");
        process.exit(1);
      }
      await runSuiteAdd(args[1], args[2]);
      break;
    case "suite:list":
      await runSuiteList();
      break;
    case "suite:show":
      if (!args[1]) {
        errorMsg("Suite name or ID required");
        process.exit(1);
      }
      await runSuiteShow(args[1]);
      break;
    case "suite:run":
      if (!args[1]) {
        errorMsg("Suite name or ID required");
        process.exit(1);
      }
      await runSuiteRun(args[1], globalVars);
      break;
    case "baseline:set":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runBaselineSet(args[1]);
      break;
    case "baseline:clear":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runBaselineClear(args[1]);
      break;
    case "baseline:show":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runBaselineShow(args[1]);
      break;
    case "code:scan":
      if (!args[1]) {
        errorMsg("Directory required");
        process.exit(1);
      }
      await runCodeScan(args[1]);
      break;
    case "store":
      if (args[1] === "list" || !args[1]) {
        await runStoreList();
      } else if (args[1] === "install") {
        if (!args[2]) {
          errorMsg("Template name required. Run: ghostrun store list");
          process.exit(1);
        }
        await runStoreInstall(args[2]);
      } else {
        errorMsg("Unknown store command. Use: store list / store install <name>");
        process.exit(1);
      }
      break;
    case "store:list":
      await runStoreList();
      break;
    case "store:install":
      if (!args[1]) {
        errorMsg("Template name required. Run store:list to see options.");
        process.exit(1);
      }
      await runStoreInstall(args[1]);
      break;
    case "api:learn":
      await runApiLearn();
      break;
    case "perf:run": {
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      const perfExtraArgs = args.slice(2);
      await runPerfRun(args[1], perfExtraArgs);
      const perfReportFlag = perfExtraArgs.indexOf("--report");
      if (perfReportFlag >= 0) {
        const perfRuns = db.listPerfRuns();
        const latestPerfRun = perfRuns[0];
        if (latestPerfRun) {
          const perfOutIdx = perfExtraArgs.indexOf("--output");
          const perfOutFile = perfOutIdx >= 0 && perfExtraArgs[perfOutIdx + 1] && !perfExtraArgs[perfOutIdx + 1].startsWith("--") ? perfExtraArgs[perfOutIdx + 1] : `ghostrun-perf-${latestPerfRun.id.slice(0, 8)}.html`;
          await generatePerfReport(latestPerfRun.id, perfOutFile);
        }
      }
      break;
    }
    case "perf:export":
      if (!args[1]) {
        errorMsg("Flow ID or name required");
        process.exit(1);
      }
      await runPerfExport(args[1], args.slice(2));
      break;
    case "perf:list":
      await runPerfList();
      break;
    case "perf:show":
      if (!args[1]) {
        errorMsg("Perf run ID required");
        process.exit(1);
      }
      await runPerfShow(args[1]);
      break;
    case "perf:compare":
      if (!args[1] || !args[2]) {
        errorMsg("Usage: perf:compare <run-id-A> <run-id-B>");
        process.exit(1);
      }
      await runPerfCompare(args[1], args[2]);
      break;
    case "env:create":
      if (!args[1]) {
        errorMsg("Environment name required");
        process.exit(1);
      }
      await runEnvCreate(args[1], args.slice(2));
      break;
    case "env:list":
      await runEnvList();
      break;
    case "env:set":
      if (!args[1] || !args[2] || !args[3]) {
        errorMsg("Usage: env:set <env-name> <key> <value>");
        process.exit(1);
      }
      await runEnvSet(args[1], args[2], args[3]);
      break;
    case "env:use":
      if (!args[1]) {
        errorMsg("Environment name required");
        process.exit(1);
      }
      await runEnvUse(args[1]);
      break;
    case "env:show":
      if (!args[1]) {
        errorMsg("Environment name required");
        process.exit(1);
      }
      await runEnvShow(args[1]);
      break;
    case "env:delete":
      if (!args[1]) {
        errorMsg("Environment name required");
        process.exit(1);
      }
      await runEnvDelete(args[1]);
      break;
    case "var:dump":
      if (!args[1]) {
        errorMsg("Run ID required");
        process.exit(1);
      }
      await runVarDump(args[1]);
      break;
    default:
      errorMsg("Unknown command: " + cmd);
      console.log("  Run without args for help.");
      process.exit(1);
  }
  if (cmd !== "serve") db.close();
  closeSharedReadline();
}
main().catch((err) => {
  errorMsg(String(err));
  process.exit(1);
});
