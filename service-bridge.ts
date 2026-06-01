/**
 * GhostRun Service Bridge — Mailpit email + local webhook capture + Postgres queries.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as crypto from 'crypto';
import { getProjectPaths } from './project-scope';

export interface EmailServiceConfig {
  /** Omit or set `none` to skip Mailpit — use profile auth + secrets instead */
  provider?: 'mailpit' | 'mailhog' | 'none';
  apiUrl?: string;
  timeoutMs?: number;
}

export interface WebhookServiceConfig {
  provider?: 'local' | 'none';
  baseUrl?: string;
  storePath?: string;
}

export interface ProfileServices {
  email?: EmailServiceConfig;
  webhook?: WebhookServiceConfig;
  postgres?: {
    connectionSecret?: string;
    readOnly?: boolean;
    fixtures?: string[];
  };
}

export interface MailpitMessage {
  ID: string;
  Subject: string;
  From: { Address: string; Name: string };
  To: Array<{ Address: string; Name: string }>;
  Snippet: string;
  Created: string;
}

let hookServer: http.Server | null = null;

export function isEmailBridgeEnabled(services?: ProfileServices): boolean {
  const provider = services?.email?.provider;
  if (provider === 'none') return false;
  if (services?.email?.apiUrl) return true;
  if (provider === 'mailpit' || provider === 'mailhog') return true;
  return !!process.env.GHOSTRUN_MAILPIT_URL;
}

export function isWebhookBridgeEnabled(services?: ProfileServices): boolean {
  if (services?.webhook?.provider === 'none') return false;
  return services?.webhook?.provider === 'local' || !!services?.webhook?.baseUrl;
}

export function resolveEmailApiUrl(services?: ProfileServices): string | null {
  if (!isEmailBridgeEnabled(services)) return null;
  return services?.email?.apiUrl || process.env.GHOSTRUN_MAILPIT_URL || 'http://localhost:8025';
}

export async function fetchMailpitMessages(apiUrl: string): Promise<MailpitMessage[]> {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/v1/messages?limit=50`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Mailpit API HTTP ${res.status}`);
  const data = await res.json() as { messages?: MailpitMessage[] };
  return data.messages || [];
}

export async function fetchMailpitMessage(apiUrl: string, id: string): Promise<{ Text: string; HTML: string; Subject: string }> {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/v1/message/${id}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Mailpit message ${id} not found`);
  return res.json() as Promise<{ Text: string; HTML: string; Subject: string }>;
}

export function matchEmailMessage(
  messages: MailpitMessage[],
  opts: { to?: string; subjectContains?: string; fromContains?: string }
): MailpitMessage | null {
  const toLower = opts.to?.toLowerCase();
  const sub = opts.subjectContains?.toLowerCase();
  const from = opts.fromContains?.toLowerCase();
  for (const m of messages) {
    if (toLower) {
      const recipients = (m.To || []).map(t => t.Address.toLowerCase());
      if (!recipients.some(r => r.includes(toLower)) && !m.To?.some(t => t.Address.toLowerCase() === toLower)) {
        continue;
      }
    }
    if (sub && !m.Subject.toLowerCase().includes(sub)) continue;
    if (from && !m.From?.Address?.toLowerCase().includes(from)) continue;
    return m;
  }
  return null;
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[).,;]+$/, '') : null;
}

export function extractOtpCode(text: string, length = 6): string | null {
  const match = text.match(new RegExp(`\\b(\\d{${length}})\\b`));
  return match ? match[1] : null;
}

export async function waitForEmail(
  services: ProfileServices | undefined,
  opts: { to?: string; subjectContains?: string; timeoutMs?: number }
): Promise<{ message: MailpitMessage; body: string; html: string }> {
  const apiUrl = resolveEmailApiUrl(services);
  if (!apiUrl) {
    throw new Error(
      'email:wait requires profile.services.email (Mailpit). Optional — use form/storage-state auth with profile secrets instead, or add services.email to your profile.'
    );
  }
  const timeout = opts.timeoutMs ?? services?.email?.timeoutMs ?? 30000;
  const start = Date.now();
  let lastError = '';
  while (Date.now() - start < timeout) {
    try {
      const messages = await fetchMailpitMessages(apiUrl);
      const hit = matchEmailMessage(messages, opts);
      if (hit) {
        const full = await fetchMailpitMessage(apiUrl, hit.ID);
        return { message: hit, body: full.Text || '', html: full.HTML || '' };
      }
      lastError = `No matching email (checked ${messages.length} messages)`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`email:wait timed out after ${timeout}ms — ${lastError}`);
}

export function sanitizeInboxSnapshot(messages: MailpitMessage[], limit = 5): string {
  return messages.slice(0, limit).map(m =>
    `- [${m.Created}] ${m.Subject} → ${(m.To || []).map(t => t.Address).join(', ')}`
  ).join('\n');
}

export interface WebhookCapture {
  id: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  receivedAt: string;
}

function webhookStoreDir(): string {
  const dir = getProjectPaths().webhooksPath;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listWebhookCaptures(limit = 20): WebhookCapture[] {
  const dir = webhookStoreDir();
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as WebhookCapture);
}

export function saveWebhookCapture(capture: WebhookCapture): void {
  const file = path.join(webhookStoreDir(), `${capture.receivedAt.replace(/[:.]/g, '-')}-${capture.id.slice(0, 8)}.json`);
  fs.writeFileSync(file, JSON.stringify(capture, null, 2));
}

export function matchWebhookCapture(captures: WebhookCapture[], pathPattern: string): WebhookCapture | null {
  const norm = pathPattern.startsWith('/') ? pathPattern : `/${pathPattern}`;
  return captures.find(c => c.path === norm || c.path.endsWith(norm)) || null;
}

export async function waitForWebhook(
  services: ProfileServices | undefined,
  opts: { path: string; timeoutMs?: number }
): Promise<WebhookCapture> {
  const timeout = opts.timeoutMs ?? 30000;
  const start = Date.now();
  const pattern = opts.path;
  while (Date.now() - start < timeout) {
    const hit = matchWebhookCapture(listWebhookCaptures(50), pattern);
    if (hit) return hit;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`webhook:wait timed out after ${timeout}ms for path ${pattern}`);
}

export function startHookCatcher(port = 8787): Promise<{ port: number; url: string }> {
  return new Promise((resolve, reject) => {
    if (hookServer) {
      resolve({ port, url: `http://localhost:${port}` });
      return;
    }
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && (req.url === '/hooks/health' || req.url === '/health')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'ghostrun-hook-catcher' }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const capture: WebhookCapture = {
          id: `${Date.now()}`,
          path: req.url || '/',
          method: req.method || 'POST',
          headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
          body: body.slice(0, 65536),
          receivedAt: new Date().toISOString(),
        };
        saveWebhookCapture(capture);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: capture.id }));
      });
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      hookServer = server;
      resolve({ port, url: `http://127.0.0.1:${port}` });
    });
  });
}

export function stopHookCatcher(): void {
  if (hookServer) {
    hookServer.close();
    hookServer = null;
  }
}

export interface ServiceDoctorResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runServicesDoctor(services?: ProfileServices): Promise<ServiceDoctorResult[]> {
  const results: ServiceDoctorResult[] = [];
  if (!services || (!isEmailBridgeEnabled(services) && !isWebhookBridgeEnabled(services) && !services.postgres?.connectionSecret)) {
    results.push({
      name: 'Service Bridge',
      ok: true,
      detail: 'Not configured — using profile auth (form, storage-state, bearer) and env secrets',
    });
    return results;
  }
  if (isEmailBridgeEnabled(services)) {
    const apiUrl = resolveEmailApiUrl(services)!;
    try {
      const msgs = await fetchMailpitMessages(apiUrl);
      results.push({ name: 'Mailpit (optional)', ok: true, detail: `${msgs.length} message(s), API ${apiUrl}` });
    } catch (e) {
      results.push({
        name: 'Mailpit (optional)',
        ok: false,
        detail: `${e instanceof Error ? e.message : e} — optional: docker compose -f .ghostrun/services/dev.compose.yml up -d mailpit`,
      });
    }
  }
  if (isWebhookBridgeEnabled(services)) {
    const hookPort = 8787;
    try {
      const res = await fetch(`http://127.0.0.1:${hookPort}/hooks/health`, { signal: AbortSignal.timeout(2000) });
      results.push({ name: 'Hook catcher (optional)', ok: res.ok, detail: `http://127.0.0.1:${hookPort}` });
    } catch {
      results.push({
        name: 'Hook catcher (optional)',
        ok: false,
        detail: 'Not running — ghostrun services hook --daemon (optional)',
      });
    }
  }
  if (services?.postgres?.connectionSecret) {
    const url = process.env[services.postgres.connectionSecret];
    results.push({
      name: 'Postgres',
      ok: !!url,
      detail: url ? 'Connection secret env var set' : `Missing env ${services.postgres.connectionSecret}`,
    });
  }
  return results;
}

export async function runSqlFixtures(fixtures: string[], connectionSecret: string): Promise<void> {
  const url = process.env[connectionSecret];
  if (!url) throw new Error(`Environment variable ${connectionSecret} not set for postgres fixtures`);
  type PgClient = { connect(): Promise<void>; query(sql: string): Promise<unknown>; end(): Promise<void> };
  type PgModule = { Client: new (config: { connectionString: string }) => PgClient };
  let pg: PgModule;
  try {
    pg = await import('pg') as PgModule;
  } catch {
    throw new Error('Install pg for SQL fixtures: npm install pg (or run fixtures manually)');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const fixture of fixtures) {
      if (!fs.existsSync(fixture)) throw new Error(`Fixture not found: ${fixture}`);
      const sql = fs.readFileSync(fixture, 'utf8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

type PgQueryResult = { rows: Record<string, unknown>[]; rowCount: number | null };

async function withPgClient<T>(
  connectionSecret: string,
  fn: (query: (sql: string, params?: unknown[]) => Promise<PgQueryResult>) => Promise<T>,
): Promise<T> {
  const url = process.env[connectionSecret];
  if (!url) throw new Error(`Environment variable ${connectionSecret} not set for postgres`);
  type PgClient = {
    connect(): Promise<void>;
    query(sql: string, params?: unknown[]): Promise<PgQueryResult>;
    end(): Promise<void>;
  };
  type PgModule = { Client: new (config: { connectionString: string }) => PgClient };
  let pg: PgModule;
  try {
    pg = await import('pg') as PgModule;
  } catch {
    throw new Error('Install pg for db:* actions: npm install pg');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn((sql, params) => client.query(sql, params));
  } finally {
    await client.end();
  }
}

export async function runDbQuery(
  connectionSecret: string,
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  return withPgClient(connectionSecret, async query => {
    const result = await query(sql, params);
    return result.rows || [];
  });
}

export type DbAssertType = 'scalar' | 'count' | 'empty' | 'contains';

export async function assertDbQuery(
  connectionSecret: string,
  sql: string,
  expected: string,
  opts: { assertType?: DbAssertType; params?: unknown[] } = {},
): Promise<void> {
  const assertType = opts.assertType || 'scalar';
  const rows = await runDbQuery(connectionSecret, sql, opts.params || []);

  if (assertType === 'empty') {
    if (rows.length !== 0) {
      throw new Error(`db:assert expected 0 rows, got ${rows.length}: ${JSON.stringify(rows).slice(0, 200)}`);
    }
    return;
  }

  if (assertType === 'count') {
    const expectedCount = parseInt(expected, 10);
    if (rows.length !== expectedCount) {
      throw new Error(`db:assert count expected ${expectedCount}, got ${rows.length}`);
    }
    return;
  }

  if (assertType === 'contains') {
    const haystack = JSON.stringify(rows);
    if (!haystack.includes(expected)) {
      throw new Error(`db:assert contains expected "${expected}" not found in ${haystack.slice(0, 200)}`);
    }
    return;
  }

  // scalar — first column of first row
  if (rows.length === 0) {
    throw new Error(`db:assert scalar expected "${expected}" but query returned 0 rows`);
  }
  const firstRow = rows[0];
  const firstVal = Object.values(firstRow)[0];
  const actual = firstVal === null || firstVal === undefined ? '' : String(firstVal);
  if (actual !== expected) {
    throw new Error(`db:assert scalar expected "${expected}", got "${actual}"`);
  }
}

function getJsonPath(obj: unknown, dotPath: string): unknown {
  const parts = dotPath.replace(/^\$\.?/, '').split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function parseWebhookJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export interface WebhookAssertion {
  path: string;
  expected?: string;
  op?: 'equals' | 'contains' | 'exists';
}

export function assertWebhookPayload(body: string, assertions: WebhookAssertion[]): void {
  const parsed = parseWebhookJson(body);
  for (const a of assertions) {
    const actual = getJsonPath(parsed, a.path);
    const op = a.op || (a.expected === undefined ? 'exists' : 'equals');
    if (op === 'exists') {
      if (actual === undefined || actual === null) {
        throw new Error(`webhook:assert path "${a.path}" does not exist`);
      }
      continue;
    }
    const actualStr = actual === null || actual === undefined ? '' : String(actual);
    if (op === 'contains') {
      if (!actualStr.includes(a.expected || '')) {
        throw new Error(`webhook:assert path "${a.path}" expected to contain "${a.expected}", got "${actualStr}"`);
      }
    } else if (actualStr !== (a.expected || '')) {
      throw new Error(`webhook:assert path "${a.path}" expected "${a.expected}", got "${actualStr}"`);
    }
  }
}

export interface WebhookSignatureOptions {
  secret: string;
  headerName?: string;
  algorithm?: 'sha256' | 'sha1';
  prefix?: string;
}

export function verifyWebhookSignature(capture: WebhookCapture, opts: WebhookSignatureOptions): void {
  const headerName = (opts.headerName || 'x-webhook-signature').toLowerCase();
  const algorithm = opts.algorithm || 'sha256';
  const provided = Object.entries(capture.headers).find(([k]) => k.toLowerCase() === headerName)?.[1];
  if (!provided) {
    throw new Error(`assert:webhook-signature: header "${opts.headerName || 'X-Webhook-Signature'}" not found`);
  }
  let signature = provided.trim();
  if (opts.prefix && signature.startsWith(opts.prefix)) {
    signature = signature.slice(opts.prefix.length);
  }
  const hmac = crypto.createHmac(algorithm, opts.secret);
  hmac.update(capture.body, 'utf8');
  const expected = hmac.digest('hex');
  const normalizedProvided = signature.toLowerCase();
  const normalizedExpected = expected.toLowerCase();
  if (normalizedProvided !== normalizedExpected) {
    throw new Error(`assert:webhook-signature: HMAC ${algorithm} mismatch (header ${headerName})`);
  }
}

export function resolveWebhookCapture(
  captures: WebhookCapture[],
  opts: { path?: string; body?: string },
): WebhookCapture {
  if (opts.path) {
    const hit = matchWebhookCapture(captures, opts.path);
    if (!hit) throw new Error(`webhook:assert: no capture for path ${opts.path}`);
    return hit;
  }
  if (opts.body !== undefined) {
    return {
      id: 'inline',
      path: '/',
      method: 'POST',
      headers: {},
      body: opts.body,
      receivedAt: new Date().toISOString(),
    };
  }
  throw new Error('webhook:assert requires path or a captured webhook body variable');
}
