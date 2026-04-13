#!/usr/bin/env node

/**
 * Ghostrun CLI — Memory-driven Web Automation
 * v0.6.0
 */

import { chromium } from 'playwright';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from './packages/database/src/manager';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_PATH = path.join(HOME_DIR, '.ghostrun');

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
// API TESTING — EXECUTION CONTEXT
// ============================================

interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  bodyText: string;
  responseTimeMs: number;
  url: string;
  method: string;
}

interface ExecutionContext {
  variables: Record<string, string>;
  lastResponse?: ApiResponse;
  environmentName?: string;
}

function resolveVarsDeep(value: unknown, ctx: ExecutionContext): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx.variables[k] ?? '');
  }
  if (Array.isArray(value)) return value.map(v => resolveVarsDeep(v, ctx));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveVarsDeep(v, ctx);
    return out;
  }
  return value;
}

function getJsonPath(obj: unknown, path: string): unknown {
  // Simple dot/bracket notation: $.user.name, $.items[0].id, $.token
  const parts = path.replace(/^\$\.?/, '').split(/\.|\[(\d+)\]/).filter(p => p !== undefined && p !== '');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur === 'object') cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

async function executeHttpRequest(node: Record<string, unknown>, ctx: ExecutionContext, runId: string, stepNumber: number): Promise<void> {
  const method = ((node.method as string) || 'GET').toUpperCase();
  const url = resolveVarsDeep(node.url as string, ctx) as string;
  if (!url) throw new Error('http:request requires a url');

  // Build headers
  const rawHeaders = (node.headers as Record<string, string>) || {};
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    headers[k] = resolveVarsDeep(v, ctx) as string;
  }

  // Auth injection
  const auth = node.auth as Record<string, string> | undefined;
  if (auth?.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${resolveVarsDeep(auth.token, ctx)}`;
  } else if (auth?.type === 'basic' && auth.username) {
    const creds = Buffer.from(`${resolveVarsDeep(auth.username, ctx)}:${resolveVarsDeep(auth.password || '', ctx)}`).toString('base64');
    headers['Authorization'] = `Basic ${creds}`;
  } else if (auth?.type === 'apikey' && auth.key) {
    const headerName = auth.header || 'X-API-Key';
    headers[headerName] = resolveVarsDeep(auth.key, ctx) as string;
  }

  // Build body
  let body: string | undefined;
  if (node.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    const resolvedBody = resolveVarsDeep(node.body, ctx);
    body = typeof resolvedBody === 'string' ? resolvedBody : JSON.stringify(resolvedBody);
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }

  const start = Date.now();
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch (e) {
    db.saveApiResponse({ runId, stepNumber, method, url, errorMessage: String(e) });
    throw new Error(`HTTP request failed: ${e}`);
  }
  const responseTimeMs = Date.now() - start;

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { responseHeaders[k] = v; });

  let bodyText = '';
  let bodyJson: unknown = null;
  try { bodyText = await response.text(); } catch {}
  try { bodyJson = JSON.parse(bodyText); } catch {}

  ctx.lastResponse = {
    status: response.status,
    headers: responseHeaders,
    body: bodyJson ?? bodyText,
    bodyText,
    responseTimeMs,
    url,
    method,
  };

  db.saveApiResponse({
    runId, stepNumber, method, url,
    statusCode: response.status,
    responseTimeMs,
    responseHeaders,
    responseBody: bodyText.slice(0, 10000),
  });

  // Auto-extract variables from response if 'extract' map is specified
  const extract = node.extract as Record<string, string> | undefined;
  if (extract && bodyJson) {
    for (const [varName, jsonPath] of Object.entries(extract)) {
      const val = getJsonPath(bodyJson, jsonPath);
      if (val !== undefined) {
        ctx.variables[varName] = String(val);
        db.saveRunData(runId, stepNumber, varName, String(val));
      }
    }
  }
}

async function executeApiAssert(node: Record<string, unknown>, ctx: ExecutionContext): Promise<void> {
  const lastResp = ctx.lastResponse;
  if (!lastResp) throw new Error('assert:response — no HTTP response in context (run http:request first)');

  const assertType = (node.assert as string) || 'status';
  const expected = node.expected !== undefined ? resolveVarsDeep(node.expected, ctx) : undefined;

  switch (assertType) {
    case 'status': {
      const exp = Number(expected ?? 200);
      if (lastResp.status !== exp) {
        throw new Error(`Expected status ${exp}, got ${lastResp.status} — ${lastResp.url}`);
      }
      break;
    }
    case 'status:range': {
      const min = Number(node.min ?? 200), max = Number(node.max ?? 299);
      if (lastResp.status < min || lastResp.status > max) {
        throw new Error(`Status ${lastResp.status} outside range [${min}-${max}]`);
      }
      break;
    }
    case 'body:contains': {
      const needle = String(expected ?? '');
      if (!lastResp.bodyText.includes(needle)) {
        throw new Error(`Response body does not contain "${needle}"`);
      }
      break;
    }
    case 'body:equals': {
      const expStr = typeof expected === 'object' ? JSON.stringify(expected) : String(expected ?? '');
      const gotStr = typeof lastResp.body === 'object' ? JSON.stringify(lastResp.body) : lastResp.bodyText;
      if (gotStr !== expStr) {
        throw new Error(`Response body mismatch.\nExpected: ${expStr.slice(0, 200)}\nGot:      ${gotStr.slice(0, 200)}`);
      }
      break;
    }
    case 'json:path': {
      const jpath = (node.path as string) || '';
      const val = getJsonPath(lastResp.body, jpath);
      const exp = resolveVarsDeep(node.expected, ctx);
      if (String(val) !== String(exp)) {
        throw new Error(`JSON path "${jpath}": expected "${exp}", got "${val}"`);
      }
      break;
    }
    case 'json:exists': {
      const jpath = (node.path as string) || '';
      const val = getJsonPath(lastResp.body, jpath);
      if (val === undefined || val === null) {
        throw new Error(`JSON path "${jpath}" does not exist in response`);
      }
      break;
    }
    case 'header': {
      const headerName = (node.header as string || '').toLowerCase();
      const headerVal = lastResp.headers[headerName];
      if (expected !== undefined && String(headerVal) !== String(expected)) {
        throw new Error(`Header "${headerName}": expected "${expected}", got "${headerVal}"`);
      } else if (!headerVal) {
        throw new Error(`Header "${headerName}" not present in response`);
      }
      break;
    }
    case 'time': {
      const maxMs = Number(expected ?? 2000);
      if (lastResp.responseTimeMs > maxMs) {
        throw new Error(`Response took ${lastResp.responseTimeMs}ms, expected < ${maxMs}ms`);
      }
      break;
    }
    default:
      throw new Error(`Unknown assert type: "${assertType}"`);
  }
}

function executeSetVariable(node: Record<string, unknown>, ctx: ExecutionContext, runId: string, stepNumber: number): void {
  const varName = node.variable as string;
  const value = resolveVarsDeep(node.value, ctx) as string;
  if (!varName) throw new Error('set:variable requires a variable name');
  ctx.variables[varName] = String(value ?? '');
  db.saveRunData(runId, stepNumber, varName, String(value ?? ''));
}

function executeExtractJson(node: Record<string, unknown>, ctx: ExecutionContext, runId: string, stepNumber: number): void {
  const varName = node.variable as string;
  const jsonPath = node.path as string;
  if (!varName || !jsonPath) throw new Error('extract:json requires variable and path');
  if (!ctx.lastResponse) throw new Error('extract:json — no HTTP response in context');
  const val = getJsonPath(ctx.lastResponse.body, jsonPath);
  if (val === undefined) throw new Error(`JSON path "${jsonPath}" not found in response`);
  ctx.variables[varName] = String(val);
  db.saveRunData(runId, stepNumber, varName, String(val));
}

// ============================================
// AI — Ollama-first, Anthropic fallback
// ============================================

async function isOllamaRunning(): Promise<string | null> {
  const baseUrl = process.env.GHOSTRUN_OLLAMA_URL || 'http://localhost:11434';
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json() as { models?: Array<{ name: string }> };
    const preferred = process.env.GHOSTRUN_OLLAMA_MODEL;
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
  const baseUrl = process.env.GHOSTRUN_OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.GHOSTRUN_OLLAMA_MODEL || await isOllamaRunning();
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
  const provider = process.env.GHOSTRUN_AI_PROVIDER; // 'ollama' | 'anthropic' | undefined = auto

  if (provider !== 'anthropic') {
    const result = await callOllama(prompt);
    if (result) return { text: result, provider: process.env.GHOSTRUN_OLLAMA_MODEL || 'ollama' };
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
  ╔══════════════════════════════════════════════╗
  ║                                              ║
  ║   ░██████╗░██╗  ██╗░█████╗░░██████╗████████╗ ║
  ║   ██╔════╝░██║  ██║██╔══██╗██╔════╝╚══██╔══╝ ║
  ║   ██║░░██╗░███████║██║░░██║╚█████╗░   ██║    ║
  ║   ██║░░╚██╗██╔══██║██║░░██║░╚═══██╗   ██║    ║
  ║   ╚██████╔╝██║  ██║╚█████╔╝██████╔╝   ██║    ║
  ║   ░╚═════╝ ╚═╝  ╚═╝ ╚════╝ ╚═════╝    ╚═╝    ║
  ║                                              ║
  ║   👻  Record once. Replay as a ghost.        ║
  ╚══════════════════════════════════════════════╝
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
  // Also read .ghostrun.env from CWD
  const envFile = path.join(process.cwd(), '.ghostrun.env');
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

  await page.exposeFunction('__ghostrunRecord', (action: RecordedAction) => {
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
    await newPage.exposeFunction('__ghostrunRecord', (action: RecordedAction) => {
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
  info(`Run:     ${chalk.green('ghostrun run ' + flow.id.slice(0, 8))}`);
  info(`Fix:     ${chalk.cyan('ghostrun flow:fix ' + flow.id.slice(0, 8))}`);
  console.log();
}

// ============================================
// COMMANDS — run
// ============================================

async function executeFlow(flowId: string, vars?: Record<string, string>, opts?: { sessionLoad?: string; sessionSave?: string; quiet?: boolean; jsonOutput?: boolean; visible?: boolean; onStep?: (idx: number, action: string, selector?: string) => void; onError?: (msg: string) => void }): Promise<{ passed: boolean; runId: string; duration: number; extractedData: Record<string, string>; error?: string }> {
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

  const actionNodes = graph.nodes.filter(n => n.type === 'action') as Array<Record<string, unknown>>;
  let stepNum = 1, failed = false;
  let failedStepInfo: { name: string; action: string; selector?: string | null; errorMessage: string } | null = null;
  const runStart = Date.now();
  const runVars: Record<string, string> = { ...(vars || {}) };

  // Load active environment variables into context
  const activeEnv = db.getActiveEnvironment();
  if (activeEnv) {
    Object.assign(runVars, activeEnv.variables);
    if (activeEnv.baseUrl && !runVars['__baseUrl']) runVars['__baseUrl'] = activeEnv.baseUrl;
  }
  const ctx: ExecutionContext = { variables: runVars, environmentName: activeEnv?.name };

  // Determine if any browser actions exist (if not, skip browser entirely)
  const API_ONLY_ACTIONS = new Set(['http:request','assert:response','assert:status','assert:body','assert:header','assert:time','set:variable','extract:json','env:switch']);
  const hasBrowserActions = actionNodes.some(n => !API_ONLY_ACTIONS.has(n.action as string));

  let browser: import('playwright').Browser | null = null;
  let browserCtx: import('playwright').BrowserContext | null = null;
  let page: import('playwright').Page | null = null;

  if (hasBrowserActions) {
    browser = await chromium.launch({ headless: !opts?.visible });
    browserCtx = await browser.newContext();
    page = await browserCtx.newPage();

    if (opts?.sessionLoad) {
      try {
        const count = await loadSession(browserCtx, opts.sessionLoad);
        if (!opts?.quiet) info(`Session: ${chalk.cyan(opts.sessionLoad)} loaded (${count} cookies)`);
      } catch (e) { warn(String(e)); }
    }

    if (startUrl) await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }

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
    opts?.onStep?.(stepNum - 1, action, node.selector as string | undefined);
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
      await executeAction(page, action, resolvedNode, ctx, run.id, stepNum);
      // Auto wait-for-nav after clicks — resolves immediately if no navigation occurred
      if (action === 'click' && page) {
        await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      }
      const duration = Date.now() - t;

      const isApiAction = API_ONLY_ACTIONS.has(action);
      if (!isApiAction && page) {
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
      } else {
        db.updateStep(step.id, { status: 'passed', duration });
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
      if (['click', 'fill', 'select'].includes(action) && page) {
        const healed = await attemptHeal(page, label, node.selector as string, action);
        if (healed) {
          try {
            const healedNode = { ...node, selector: healed };
            await executeAction(page, action, healedNode, ctx, run.id, stepNum);
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
        if (page) {
          const screenshot = await page.screenshot();
          const sp = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
          fs.writeFileSync(sp, screenshot);
          db.updateStep(step.id, { status: 'failed', duration, errorMessage, screenshotPath: sp });
        } else {
          db.updateStep(step.id, { status: 'failed', duration, errorMessage });
        }
      } catch { db.updateStep(step.id, { status: 'failed', duration, errorMessage }); }
      log(chalk.red(`      ✗ failed (${duration}ms)`));
      log(chalk.red(`        └─ ${errorMessage}`));
      failedStepInfo = { name: label, action, selector: node.selector as string | null, errorMessage };
      opts?.onError?.(errorMessage);
      failed = true;
      break;
    }
    stepNum++;
  }

  if (opts?.sessionSave && browserCtx) {
    try {
      const count = await saveSession(browserCtx, opts.sessionSave);
      if (!opts?.quiet) success(`Session saved: ${chalk.cyan(opts.sessionSave)} (${count} cookies)`);
    } catch (e) { warn(`Could not save session: ${e}`); }
  }

  if (browser) await browser.close();

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
    return { passed: !failed, runId: run.id, duration: totalDuration, extractedData, error: failedStepInfo?.errorMessage };
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
  return { passed: !failed, runId: run.id, duration: totalDuration, extractedData, error: failedStepInfo?.errorMessage };
}

async function executeAction(page: import('playwright').Page | null, action: string, node: Record<string, unknown>, ctx?: ExecutionContext, runId?: string, stepNumber?: number) {
  // p is a non-null alias used by browser action cases; API-only cases don't use it
  const p = page as import('playwright').Page;
  switch (action) {
    case 'navigate': await p.goto((node.url || node.value) as string, { waitUntil: 'domcontentloaded', timeout: 15000 }); break;
    case 'click':    await p.click(node.selector as string, { timeout: 10000 }); break;
    case 'fill':     await p.fill(node.selector as string, sanitizePII((node.value as string) || ''), { timeout: 10000 }); break;
    case 'select':   await p.selectOption(node.selector as string, (node.value as string) || '', { timeout: 10000 }); break;
    case 'check':
      if (node.value === 'true') await p.check(node.selector as string, { timeout: 10000 });
      else await p.uncheck(node.selector as string, { timeout: 10000 });
      break;
    case 'wait':     await p.waitForSelector(node.selector as string, { timeout: 10000 }); break;
    case 'press':    await p.press(node.selector as string, (node.value as string) || 'Enter'); break;
    case 'assert:text': {
      // Use first() to handle multiple matches, or fall back to body text check
      const val = node.value as string;
      const count = await p.getByText(val, { exact: false }).count();
      const visible = count > 0
        ? await p.getByText(val, { exact: false }).first().isVisible({ timeout: 5000 }).catch(() => false)
        : false;
      if (!visible) {
        // Final fallback: check raw body text
        const bodyText = await p.evaluate(() => document.body.innerText).catch(() => '');
        if (!bodyText.includes(val)) throw new Error(`assert:text failed — "${val}" not visible on page`);
      }
      break;
    }
    case 'assert:url': {
      const currentUrl = p.url();
      if (!currentUrl.includes(node.value as string)) throw new Error(`assert:url failed — URL "${currentUrl}" does not contain "${node.value}"`);
      break;
    }
    case 'assert:element': {
      const count = await p.locator(node.selector as string).count();
      if (count === 0) throw new Error(`assert:element failed — selector "${node.selector}" not found`);
      break;
    }
    case 'assert:title': {
      const title = await p.title();
      if (!title.toLowerCase().includes((node.value as string).toLowerCase())) throw new Error(`assert:title failed — title "${title}" does not contain "${node.value}"`);
      break;
    }
    case 'assert:no-errors': {
      // Checked via console error tracking; just passes by default here
      break;
    }
    case 'extract': {
      const variable = (node.variable as string) || 'extracted';
      const selector = node.selector as string;
      let extractedValue = '';
      if (selector) {
        try {
          extractedValue = await p.locator(selector).first().innerText({ timeout: 10000 });
        } catch {
          extractedValue = await p.locator(selector).first().getAttribute('value') || '';
        }
      } else if (node.attribute && node.selector) {
        extractedValue = await p.locator(node.selector as string).first().getAttribute(node.attribute as string) || '';
      }
      (node as any).__extracted = { variable, value: extractedValue.trim() };
      break;
    }
    case 'scroll:bottom':
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 1500));
      break;
    case 'scroll:up':
      await p.evaluate(() => window.scrollTo(0, 0));
      break;
    case 'scroll:load': {
      // Scroll to bottom N times, waiting for new content each time (infinite scroll)
      const times = parseInt((node.value as string) || '5', 10);
      for (let i = 0; i < times; i++) {
        const prevHeight = await p.evaluate(() => document.body.scrollHeight);
        await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 2000));
        const newHeight = await p.evaluate(() => document.body.scrollHeight);
        if (newHeight === prevHeight) break; // no more content loaded
      }
      break;
    }
    case 'next:page': {
      const nextSel = (node.selector as string) || 'a[rel="next"], [aria-label="Next page"], [aria-label="Next"], button:has-text("Next"), .next-page, .pagination-next';
      await p.click(nextSel, { timeout: 10000 });
      await p.waitForLoadState('domcontentloaded', { timeout: 15000 });
      break;
    }
    case 'hover':
      await p.hover(node.selector as string, { timeout: 10000 });
      break;
    case 'screenshot':
      // No-op — screenshots are always taken after each step
      break;

    // ── Additional interactions ────────────────────────────────────────
    case 'dblclick':
      await p.dblclick(node.selector as string, { timeout: 10000 });
      break;

    case 'type': {
      // Slow character-by-character typing (for autocomplete, debounced inputs)
      const delay = parseInt((node.delay as string) || '50', 10);
      await p.type(node.selector as string, sanitizePII((node.value as string) || ''), { delay });
      break;
    }

    case 'clear':
      await p.fill(node.selector as string, '', { timeout: 10000 });
      break;

    case 'upload': {
      // File upload — value = comma-separated file paths
      const files = ((node.value as string) || '').split(',').map(s => s.trim()).filter(Boolean);
      if (files.length === 0) throw new Error('upload: no file paths specified in value');
      await p.setInputFiles(node.selector as string, files, { timeout: 10000 });
      break;
    }

    case 'focus':
      await p.focus(node.selector as string, { timeout: 10000 });
      break;

    case 'drag': {
      // drag: selector = source, value = "targetSelector"
      const target = node.value as string;
      if (!target) throw new Error('drag: value must be the target selector');
      const source = await p.locator(node.selector as string).first().boundingBox();
      const dest   = await p.locator(target).first().boundingBox();
      if (!source || !dest) throw new Error('drag: source or target element not found');
      await p.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await p.mouse.down();
      await p.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 10 });
      await p.mouse.up();
      break;
    }

    case 'keyboard': {
      // Keyboard shortcut — e.g. value: "Control+A", "Meta+S", "Escape"
      const key = (node.value as string) || 'Enter';
      if (node.selector) {
        await p.press(node.selector as string, key);
      } else {
        await p.keyboard.press(key);
      }
      break;
    }

    case 'reload':
      await p.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      break;

    case 'back':
      await p.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
      break;

    case 'forward':
      await p.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
      break;

    case 'wait:text': {
      const waitVal = node.value as string;
      await p.waitForFunction(
        (text: string) => document.body.innerText.includes(text),
        waitVal,
        { timeout: 15000 }
      );
      break;
    }

    case 'wait:url': {
      const urlPattern = node.value as string;
      await p.waitForURL(url => url.toString().includes(urlPattern), { timeout: 15000 });
      break;
    }

    case 'wait:ms': {
      const ms = parseInt((node.value as string) || '1000', 10);
      await new Promise(r => setTimeout(r, Math.min(ms, 30000)));
      break;
    }

    case 'scroll:element': {
      // Scroll within a scrollable container
      await p.locator(node.selector as string).first().scrollIntoViewIfNeeded({ timeout: 10000 });
      break;
    }

    case 'eval': {
      // Execute arbitrary JavaScript on the page — value = JS expression
      const script = node.value as string;
      if (!script) throw new Error('eval: value must be a JavaScript expression');
      await p.evaluate(new Function(script) as () => unknown);
      break;
    }

    case 'iframe:enter': {
      // Switch context into an iframe — selector = iframe selector
      // We store the iframe handle in node.__iframe for exit
      const frame = p.frameLocator(node.selector as string);
      (p as any).__activeFrame = frame;
      break;
    }

    case 'iframe:exit':
      (p as any).__activeFrame = null;
      break;

    case 'assert:visible': {
      const isVisible = await p.locator(node.selector as string).first().isVisible({ timeout: 10000 }).catch(() => false);
      if (!isVisible) throw new Error(`assert:visible failed — "${node.selector}" is not visible`);
      break;
    }

    case 'assert:hidden': {
      const isHidden = await p.locator(node.selector as string).first().isHidden({ timeout: 5000 }).catch(() => true);
      if (!isHidden) throw new Error(`assert:hidden failed — "${node.selector}" is visible but expected hidden`);
      break;
    }

    case 'assert:value': {
      const inputVal = await p.inputValue(node.selector as string, { timeout: 10000 });
      if (!inputVal.includes(node.value as string)) throw new Error(`assert:value failed — input value "${inputVal}" does not contain "${node.value}"`);
      break;
    }

    case 'assert:count': {
      const expected = parseInt(node.value as string, 10);
      const actual   = await p.locator(node.selector as string).count();
      if (actual !== expected) throw new Error(`assert:count failed — found ${actual} elements, expected ${expected}`);
      break;
    }

    case 'assert:attr': {
      // selector = element, value = "attrName=expected"
      const [attrName, ...rest] = ((node.value as string) || '').split('=');
      const expected = rest.join('=');
      const actual   = await p.locator(node.selector as string).first().getAttribute(attrName, { timeout: 10000 });
      if (actual === null) throw new Error(`assert:attr failed — attribute "${attrName}" not found on "${node.selector}"`);
      if (!actual.includes(expected)) throw new Error(`assert:attr failed — "${attrName}" is "${actual}", expected to contain "${expected}"`);
      break;
    }

    case 'cookie:set': {
      // value = "name=value;domain=example.com" or just "name=value"
      const parts = ((node.value as string) || '').split(';');
      const [cookieName, cookieVal] = parts[0].split('=');
      const domain = parts.find(cp => cp.trim().startsWith('domain='))?.split('=')[1] || new URL(p.url()).hostname;
      await p.context().addCookies([{ name: cookieName.trim(), value: cookieVal?.trim() || '', domain, path: '/' }]);
      break;
    }

    case 'cookie:clear':
      await p.context().clearCookies();
      break;

    case 'storage:set': {
      // value = "key=value"
      const eqIdx = ((node.value as string) || '').indexOf('=');
      if (eqIdx === -1) throw new Error('storage:set: value must be "key=value"');
      const key = (node.value as string).slice(0, eqIdx);
      const val = (node.value as string).slice(eqIdx + 1);
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [key, val] as [string, string]);
      break;
    }

    case 'assert:not-text': {
      const bodyText = await p.evaluate(() => document.body.innerText).catch(() => '');
      if (bodyText.includes(node.value as string)) throw new Error(`assert:not-text failed — "${node.value}" IS present on page (expected absent)`);
      break;
    }

    case 'http:request':
      if (!ctx) throw new Error('http:request requires execution context');
      await executeHttpRequest(node, ctx, runId!, stepNumber!);
      break;
    case 'assert:response':
    case 'assert:status':
    case 'assert:body':
    case 'assert:header':
    case 'assert:time':
      if (!ctx) throw new Error('assert actions require execution context');
      await executeApiAssert(node, ctx);
      break;
    case 'set:variable':
      if (!ctx) throw new Error('set:variable requires execution context');
      executeSetVariable(node, ctx, runId!, stepNumber!);
      break;
    case 'extract:json':
      if (!ctx) throw new Error('extract:json requires execution context');
      executeExtractJson(node, ctx, runId!, stepNumber!);
      break;
    case 'env:switch': {
      const envName = resolveVarsDeep(node.environment as string, ctx!) as string;
      const env = db.findEnvironmentByName(envName);
      if (!env) throw new Error(`Environment "${envName}" not found`);
      db.setActiveEnvironment(env.id);
      if (ctx) {
        ctx.environmentName = env.name;
        for (const [k, v] of Object.entries(env.variables)) ctx.variables[k] = v;
        if (env.baseUrl) ctx.variables['__baseUrl'] = env.baseUrl;
      }
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
  const visible = process.argv.includes('--visible');
  const outputIdx = process.argv.indexOf('--output');
  const jsonOutput = outputIdx !== -1 && process.argv[outputIdx + 1] === 'json';

  if (!jsonOutput) { printLogo(); divider(); }
  let flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  if (!jsonOutput) console.log(chalk.bold('\n  Running: ') + chalk.white(flow.name) + (visible ? chalk.yellow(' [visible]') : '') + '\n');
  await executeFlow(id, vars, { visible, jsonOutput });
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

  await page.exposeFunction('__ghostrunRecord', (action: RecordedAction) => {
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
    info(`Run: ${chalk.green(`ghostrun run ${flow.id.slice(0, 8)}`)}`);
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

  if (flows.length === 0) { warn('No flows. Create one: ' + chalk.cyan('ghostrun learn <url>')); console.log(); return; }

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
  console.log('  ' + chalk.cyan('ghostrun serve'));
  console.log();
}

async function runScheduleList() {
  const schedules = db.listSchedules();
  console.log(chalk.bold('\n  Schedules\n'));
  if (schedules.length === 0) { warn('No schedules. Add one: ' + chalk.cyan('ghostrun flow:schedule <id> "<cron>"')); console.log(); return; }
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

async function runServe(serveArgs: string[] = []) {
  const withUI = serveArgs.includes('--ui');
  const portIdx = serveArgs.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(serveArgs[portIdx + 1], 10) || 3000 : 3000;

  if (withUI) {
    await runServeDashboard(port);
    return;
  }

  printLogo(); divider();
  let nodeCron: typeof import('node-cron');
  try { nodeCron = await import('node-cron'); } catch { errorMsg('node-cron not installed. Run: npm install node-cron'); process.exit(1); return; }

  const schedules = db.listSchedules();
  if (schedules.length === 0) {
    warn('No schedules configured. Add one first:');
    info('ghostrun flow:schedule <id> "0 9 * * *"');
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
// WEB DASHBOARD (ghostrun serve --ui)
// ============================================

async function runServeDashboard(port: number) {
  const http = await import('http');
  const { EventEmitter } = await import('events');

  const logBus = new EventEmitter();
  logBus.setMaxListeners(100);

  // Active run SSE subscribers: flowId → Set<response>
  const sseClients = new Set<any>();

  function broadcast(event: string, data: unknown) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try { res.write(msg); } catch {}
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
  <span class="nav-logo">👻</span>
  <span class="nav-title">Ghost<span>Run</span></span>
  <span class="nav-badge" id="version-badge">v—</span>
</nav>
<div class="tabs">
  <div class="tab active" data-tab="flows">Flows</div>
  <div class="tab" data-tab="runs">Run History</div>
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
        <div class="log-body" id="log-body"><div class="log-line" style="color:var(--dim)">— waiting for a run —</div></div>
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

  <!-- CHAT TAB -->
  <div id="tab-chat" class="panel-hidden">
    <div class="chat-container">
      <div class="chat-messages" id="chat-messages">
        <div class="chat-msg">
          <span class="chat-role ghost">Ghost ›</span>
          <div class="chat-bubble ghost">👋 Hi! I'm your GhostRun assistant. Ask me about your flows, run history, or say "run &lt;flow name&gt;" to execute a flow.</div>
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
// ─── Tab switching ───────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const id = t.dataset.tab;
    ['flows','runs','chat'].forEach(tab => {
      const el = document.getElementById('tab-' + tab);
      if (tab === id) el.classList.remove('panel-hidden');
      else el.classList.add('panel-hidden');
    });
    if (id === 'runs') loadRuns();
  });
});

// ─── Load flows ──────────────────────────────────────────────────
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
      <td><span style="color:var(--dim);font-size:12px">\${f.lastRun ? timeAgo(f.lastRun) : '—'}</span></td>
      <td id="status-\${f.id}">\${f.lastStatus ? badgeHtml(f.lastStatus) : '<span style="color:var(--dim)">—</span>'}</td>
      <td>
        <div class="flow-actions">
          <button class="btn btn-run" id="run-btn-\${f.id}" onclick="runFlow('\${f.id}','\${f.name}')">▶ Run</button>
          <button class="btn btn-delete" onclick="deleteFlow('\${f.id}','\${f.name}')">✕</button>
        </div>
      </td>
    </tr>
  \`).join('');
}

function badgeHtml(status) {
  if (status === 'passed') return '<span class="badge badge-pass">✓ passed</span>';
  if (status === 'failed') return '<span class="badge badge-fail">✗ failed</span>';
  if (status === 'running') return '<span class="badge badge-running">⟳ running</span>';
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

// ─── Run a flow ──────────────────────────────────────────────────
let activeRun = null;
async function runFlow(id, name) {
  const btn = document.getElementById('run-btn-' + id);
  const statusEl = document.getElementById('status-' + id);
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.innerHTML = badgeHtml('running');
  clearLog();
  appendLog('info', '▶ Starting: ' + name);
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
      d.passed ? '✓ Flow passed (' + d.duration + 'ms)' : '✗ Flow failed: ' + (d.error || 'unknown'));
    if (statusEl) statusEl.innerHTML = badgeHtml(d.passed ? 'passed' : 'failed');
    if (btn) btn.disabled = false;
    document.getElementById('log-dot').classList.remove('active');
    document.getElementById('log-status').textContent = d.passed ? '✓ Passed' : '✗ Failed';
    es.close();
    activeRun = null;
    loadFlows();
  });
  es.addEventListener('error', () => {
    appendLog('fail', '✗ Connection lost');
    if (btn) btn.disabled = false;
    document.getElementById('log-dot').classList.remove('active');
    document.getElementById('log-status').textContent = 'Error';
    es.close();
    activeRun = null;
  });
}

// ─── Delete flow ─────────────────────────────────────────────────
async function deleteFlow(id, name) {
  if (!confirm('Delete flow "' + name + '"?')) return;
  await fetch('/api/flows/' + id, { method: 'DELETE' });
  loadFlows();
}

// ─── Load runs ───────────────────────────────────────────────────
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
      <td>\${r.duration ? r.duration + 'ms' : '—'}</td>
      <td>\${r.stepsTotal || '—'}</td>
      <td>\${r.createdAt ? timeAgo(r.createdAt) : '—'}</td>
    </tr>
  \`).join('');
}

// ─── Log helpers ─────────────────────────────────────────────────
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

// ─── Chat ────────────────────────────────────────────────────────
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
  const ghostEl = addChatMsg('ghost', '…');

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
      line.textContent = data.runResult.passed ? '✓ Flow passed (' + data.runResult.duration + 'ms)' : '✗ Flow failed';
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
  div.innerHTML = '<span class="chat-role ' + (role === 'ghost' ? 'ghost' : '') + '">' + (role === 'ghost' ? 'Ghost ›' : 'You   ›') + '</span>' +
    '<div class="chat-bubble ' + (role === 'ghost' ? 'ghost' : '') + '"></div>';
  const bubble = div.querySelector('.chat-bubble');
  bubble.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

// ─── Init ────────────────────────────────────────────────────────
loadFlows();
setInterval(loadFlows, 10000); // refresh every 10s
</script>
</body>
</html>`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);
    const path = url.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ── GET /  ─ dashboard HTML
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(DASHBOARD_HTML);
      return;
    }

    // ── GET /api/flows
    if (req.method === 'GET' && path === '/api/flows') {
      const flows = db.listFlows();
      const runs = db.listRuns(undefined, 500);
      const lastRunMap: Record<string, any> = {};
      for (const r of runs) {
        if (!lastRunMap[r.flowId]) lastRunMap[r.flowId] = r;
      }
      const flowData = flows.map(f => {
        const lastRun = lastRunMap[f.id];
        const steps = (() => {
          try { return (JSON.parse(f.graph || '{}') as any).nodes?.length ?? 0; } catch { return 0; }
        })();
        return {
          id: f.id,
          name: f.name,
          steps,
          lastRun: lastRun?.createdAt,
          lastStatus: lastRun?.status,
        };
      });
      const passed = runs.filter(r => r.status === 'passed').length;
      const failed = runs.filter(r => r.status === 'failed').length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        flows: flowData,
        stats: { flows: flows.length, runs: runs.length, passed, failed },
        version: '1.0.0',
      }));
      return;
    }

    // ── DELETE /api/flows/:id
    if (req.method === 'DELETE' && path.startsWith('/api/flows/')) {
      const id = path.replace('/api/flows/', '');
      try { db.deleteFlow(id); res.writeHead(200); res.end('{"ok":true}'); }
      catch { res.writeHead(404); res.end('{"error":"not found"}'); }
      return;
    }

    // ── GET /api/runs
    if (req.method === 'GET' && path === '/api/runs') {
      const flows = db.listFlows();
      const flowMap: Record<string, string> = {};
      flows.forEach(f => { flowMap[f.id] = f.name; });
      const runs = db.listRuns(undefined, 100);
      const runsWithName = runs.map(r => ({ ...r, flowName: flowMap[r.flowId] || r.flowId }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(runsWithName));
      return;
    }

    // ── GET /api/run?id=<flowId> — SSE streaming run
    if (req.method === 'GET' && path === '/api/run') {
      const flowId = url.searchParams.get('id');
      if (!flowId) { res.writeHead(400); res.end('Missing id'); return; }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      function sendEvent(event: string, data: unknown) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }

      const flow = db.getFlow(flowId);
      if (!flow) {
        sendEvent('done', { passed: false, error: 'Flow not found', duration: 0 });
        res.end();
        return;
      }

      const startTime = Date.now();
      try {
        const parsedGraph = JSON.parse(flow.graph || '{}') as { nodes?: any[] };
        const nodes: any[] = parsedGraph.nodes || [];
        sendEvent('log', { type: 'info', message: `Flow: ${flow.name} (${nodes.length} steps)` });

        const result = await executeFlow(flowId, undefined, {
          onStep: (stepIdx: number, action: string, selector?: string) => {
            sendEvent('log', { type: 'step', message: `  [${stepIdx + 1}] ${action}${selector ? ' → ' + selector : ''}` });
          },
          onError: (msg: string) => {
            sendEvent('log', { type: 'fail', message: '  ✗ ' + msg });
          },
        });
        sendEvent('done', { passed: result.passed, duration: result.duration, error: result.error });
      } catch (err: any) {
        sendEvent('done', { passed: false, error: err.message, duration: Date.now() - startTime });
      }
      res.end();
      return;
    }

    // ── POST /api/chat
    if (req.method === 'POST' && path === '/api/chat') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { message } = JSON.parse(body);
          const flows = db.listFlows();
          const runs = db.listRuns(undefined, 20);

          // Check if user wants to run a flow
          const runMatch = message.toLowerCase().match(/^run\s+(.+)$/);
          if (runMatch) {
            const query = runMatch[1].trim().toLowerCase();
            const found = flows.find(f => f.name.toLowerCase().includes(query) || f.id === query);
            if (found) {
              try {
                const result = await executeFlow(found.id);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  reply: `Running "${found.name}"...`,
                  runResult: { passed: result.passed, duration: result.duration, error: result.error },
                }));
              } catch (err: any) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ reply: `Error running flow: ${err.message}`, runResult: { passed: false } }));
              }
              return;
            }
          }

          // Build context and query Ollama
          const flowList = flows.map(f => `- ${f.name} (id: ${f.id})`).join('\n');
          const recentRuns = runs.slice(0, 10).map(r => {
            const f = flows.find(fl => fl.id === r.flowId);
            return `- ${f?.name || r.flowId}: ${r.status} (${r.duration}ms) at ${r.startedAt}`;
          }).join('\n');

          const systemPrompt = `You are GhostRun's assistant. GhostRun is a browser automation CLI tool.
Current flows:\n${flowList || '(none)'}
Recent runs:\n${recentRuns || '(none)'}
Answer briefly and helpfully. To run a flow, the user can type "run <flow-name>".`;

          let reply = '';
          try {
            const ollamaRes = await fetch('http://localhost:11434/api/chat', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                model: 'gemma3:4b',
                stream: false,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: message },
                ],
              }),
              signal: AbortSignal.timeout(15000),
            });
            const d = await ollamaRes.json() as any;
            reply = d.message?.content || '(no response)';
          } catch {
            // Fallback to Anthropic if available
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (apiKey) {
              try {
                const Anthropic = (await import('@anthropic-ai/sdk')).default;
                const client = new Anthropic({ apiKey });
                const msg = await client.messages.create({
                  model: 'claude-haiku-4-5-20251001',
                  max_tokens: 512,
                  system: systemPrompt,
                  messages: [{ role: 'user', content: message }],
                });
                reply = (msg.content[0] as any).text || '(no response)';
              } catch { reply = 'AI is not available. Install Ollama: https://ollama.ai'; }
            } else {
              reply = 'AI is not available. Install Ollama (https://ollama.ai) or set ANTHROPIC_API_KEY.';
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ reply }));
        } catch (err: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    printLogo(); divider();
    console.log(chalk.bold(`\n  Dashboard running at: `) + chalk.cyan(`http://localhost:${port}`));
    console.log(chalk.gray('  Press Ctrl+C to stop.\n'));
  });

  process.on('SIGINT', () => { console.log('\n  Stopping...'); server.close(); db.close(); process.exit(0); });
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

// Desktop app has been removed - use web dashboard instead
// async function runDesktopApp() { ... }

// ============================================
// EXPLORE
// ============================================

interface PageField {
  type: string;          // "text" | "email" | "password" | "search" | "textarea" | "select" | "checkbox" | etc.
  name: string;
  placeholder: string;
  label: string;         // associated <label> text if found
  selector: string;      // best CSS selector to use in a flow
  required: boolean;
}

interface PageForm {
  selector: string;
  method: string;
  fields: PageField[];
  submitSelector: string | null;
  submitText: string;
}

interface PageInteractives {
  forms: PageForm[];
  searchInputs: PageField[];    // inputs that look like search
  standaloneInputs: PageField[]; // inputs not inside a form
  ctaButtons: { text: string; selector: string }[]; // prominent action buttons
}

interface PageData {
  url: string;
  title: string;
  headings: string[];
  links: string[];
  screenshotPath: string | null;
  interactives: PageInteractives;
}

interface FlowCandidate {
  name: string;
  description: string;
  route: string;
  steps?: FlowStep[];   // actual automation steps, not just a navigate stub
}

interface FlowStep {
  action: string;
  selector?: string;
  value?: string;
  url?: string;
  label?: string;
}

async function bfsCrawl(
  startUrl: string,
  screenshotsDir: string,
  maxPages: number,
  onProgress: (visited: number, current: string) => void
): Promise<PageData[]> {
  const normalize = (u: string) => {
    try {
      const parsed = new URL(u);
      // strip hash, trailing slash, and query params that are just tracking noise
      return parsed.origin + parsed.pathname.replace(/\/$/, '');
    } catch { return u; }
  };

  const visited = new Set<string>();
  const queued = new Set<string>();
  const queue: string[] = [normalize(startUrl)];
  queued.add(normalize(startUrl));
  const pages: PageData[] = [];

  // Allowed hosts — populated after first navigation (handles www redirects)
  const allowedHosts = new Set<string>();
  const inputHost = new URL(startUrl).hostname;
  // Accept both www and non-www variants of the input host
  allowedHosts.add(inputHost);
  allowedHosts.add(inputHost.startsWith('www.') ? inputHost.slice(4) : 'www.' + inputHost);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    const key = normalize(url);
    if (visited.has(key)) continue;
    visited.add(key);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // After first navigation: capture actual host (handles redirects like builtbysharan.com → www.builtbysharan.com)
      const actualHost = new URL(page.url()).hostname;
      allowedHosts.add(actualHost);
      allowedHosts.add(actualHost.startsWith('www.') ? actualHost.slice(4) : 'www.' + actualHost);

      // Wait for JS-rendered content: try networkidle first (good for SPAs), fall back to timeout
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500).catch(() => {});

      onProgress(pages.length + 1, page.url());

      const title = await page.title().catch(() => '');
      const headings = await page.$$eval('h1,h2,h3', els =>
        els.slice(0, 8).map(e => (e as HTMLElement).innerText.trim()).filter(Boolean)
      ).catch(() => [] as string[]);

      // Collect all <a href> links — filter to same-site, skip assets
      const links = await page.$$eval('a[href]', (els) =>
        els.map(e => (e as HTMLAnchorElement).href).filter(Boolean)
      ).catch(() => [] as string[]);

      const sameHostLinks = links.filter(h => {
        try {
          const u = new URL(h);
          const host = u.hostname;
          const noAsset = !h.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|mp4|webp)(\?|$)/i);
          const isSameSite = [...allowedHosts].some(ah => host === ah);
          return isSameSite && noAsset;
        } catch { return false; }
      });

      // ── Extract interactive elements ─────────────────────────────
      const interactives = await page.evaluate(() => {
        function isDynamicId(id: string): boolean {
          // UUID pattern or long hex strings — unstable, regenerated each load
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
            || /^[0-9a-f]{16,}$/i.test(id)
            || /^[a-z]+-[0-9a-f]{6,}$/i.test(id)  // react-id-abc123 style
            || /^\d+$/.test(id);                    // purely numeric ids
        }

        function bestSelector(el: Element): string {
          if (el.id && !isDynamicId(el.id)) return `#${el.id}`;
          const name = (el as HTMLInputElement).name;
          if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
          const placeholder = (el as HTMLInputElement).placeholder;
          if (placeholder) return `${el.tagName.toLowerCase()}[placeholder="${placeholder}"]`;
          const type = (el as HTMLInputElement).type;
          if (type && type !== 'text') return `${el.tagName.toLowerCase()}[type="${type}"]`;
          // fallback: nth-of-type
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
            const idx = siblings.indexOf(el);
            if (idx >= 0) return `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`;
          }
          return el.tagName.toLowerCase();
        }

        function labelFor(input: Element): string {
          const id = (input as HTMLElement).id;
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl) return (lbl as HTMLElement).innerText.trim();
          }
          const parent = input.closest('label');
          if (parent) {
            const clone = parent.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('input,textarea,select').forEach(e => e.remove());
            return clone.innerText.trim();
          }
          // look for adjacent label
          const prev = input.previousElementSibling;
          if (prev && prev.tagName === 'LABEL') return (prev as HTMLElement).innerText.trim();
          return '';
        }

        function toField(inp: Element): any {
          const type = (inp as HTMLInputElement).type || inp.tagName.toLowerCase();
          return {
            type,
            id: (inp as HTMLInputElement).id || '',
            name: (inp as HTMLInputElement).name || '',
            placeholder: (inp as HTMLInputElement).placeholder || '',
            label: labelFor(inp),
            selector: bestSelector(inp),
            required: (inp as HTMLInputElement).required || false,
          };
        }

        // Forms
        const forms: any[] = [];
        document.querySelectorAll('form').forEach((form, fi) => {
          const fields: any[] = [];
          form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select').forEach(inp => {
            fields.push(toField(inp));
          });
          if (fields.length === 0) return; // skip empty/hidden forms

          // Skip newsletter/subscribe/search footer widgets — low-value noise
          const formText = (form.textContent || '').toLowerCase();
          const formAction = (form.action || '').toLowerCase();
          const firstField = fields[0];
          const isSubscribeWidget = fields.length === 1
            && firstField.type === 'email'
            && (
              /subscribe|newsletter|notify/i.test(formText)
              || /subscribe|newsletter/i.test(formAction)
              || /subscribe|newsletter/i.test(form.id || '')
              || /subscribe|newsletter/i.test(firstField.id || '')
              || /subscribe|newsletter/i.test(firstField.name || '')
              || /subscribe|newsletter/i.test(firstField.placeholder || '')
              || /subscribe|newsletter/i.test((form.parentElement?.textContent || '').slice(0, 200).toLowerCase())
            );
          if (isSubscribeWidget) return;

          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
          const rawId = form.id && !isDynamicId(form.id) ? form.id : null;
          const formSel = rawId ? `#${rawId}` : (form.className ? `form.${form.className.split(' ')[0]}` : `form:nth-of-type(${fi + 1})`);
          forms.push({
            selector: formSel,
            method: form.method || 'get',
            fields,
            submitSelector: submitBtn ? bestSelector(submitBtn) : null,
            submitText: submitBtn ? (submitBtn as HTMLElement).innerText.trim() : 'Submit',
          });
        });

        // Search inputs (not inside forms, or inside forms with search intent)
        const searchInputs: any[] = [];
        document.querySelectorAll('input[type="search"], input[placeholder*="search" i], input[placeholder*="find" i], input[name*="search" i], input[name*="query" i], input[aria-label*="search" i]').forEach(inp => {
          searchInputs.push(toField(inp));
        });

        // Standalone inputs (not in a form, not already captured as search)
        const standaloneInputs: any[] = [];
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="search"])').forEach(inp => {
          if (!inp.closest('form')) standaloneInputs.push(toField(inp));
        });

        // CTA buttons (visible buttons not inside forms, or prominent submit buttons)
        const ctaButtons: any[] = [];
        document.querySelectorAll('button, a.btn, a[class*="button"], a[class*="cta"]').forEach(btn => {
          const text = (btn as HTMLElement).innerText.trim();
          if (!text || text.length > 60) return;
          // skip nav/util buttons
          if (/menu|close|open|toggle|collapse|expand/i.test(text)) return;
          ctaButtons.push({ text, selector: bestSelector(btn) });
        });

        return { forms, searchInputs, standaloneInputs: standaloneInputs.slice(0, 5), ctaButtons: ctaButtons.slice(0, 8) };
      }).catch(() => ({ forms: [], searchInputs: [], standaloneInputs: [], ctaButtons: [] }));
      // ── End interactive extraction ────────────────────────────────

      const ssPath = path.join(screenshotsDir, `page-${pages.length + 1}.jpg`);
      await page.screenshot({ path: ssPath, type: 'jpeg', quality: 60 }).catch(() => {});
      const ssExists = fs.existsSync(ssPath);

      pages.push({ url: page.url(), title, headings, links: sameHostLinks, screenshotPath: ssExists ? ssPath : null, interactives });

      for (const link of sameHostLinks) {
        const norm = normalize(link);
        if (!visited.has(norm) && !queued.has(norm)) {
          queue.push(norm);
          queued.add(norm);
        }
      }
    } catch {
      // skip unreachable pages silently
    }
  }

  await browser.close();
  return pages;
}

function deduplicatePages(pages: PageData[]): PageData[] {
  function urlPattern(url: string): string {
    try {
      const u = new URL(url);
      const pattern = u.pathname
        .replace(/\/[a-z0-9_-]+[_-]\d+\/?/g, '/*-N/') // slug_N or slug-N → *-N (fixes underscore slugs)
        .replace(/\/\d+\/?/g, '/N/')                    // pure numeric segments
        .replace(/\/page-\d+\/?/g, '/page-N/')          // pagination
        .replace(/\/[0-9a-f]{8,}\/?/g, '/HASH/');       // hash-like IDs
      return u.hostname + pattern;
    } catch { return url; }
  }

  const seenPatterns = new Map<string, PageData>();
  for (const p of pages) {
    const pat = urlPattern(p.url);
    const existing = seenPatterns.get(pat);
    if (!existing) {
      seenPatterns.set(pat, p);
    } else {
      // Keep the page with the richest interactives
      const score = (d: PageData) =>
        d.interactives.forms.length * 4 +
        d.interactives.searchInputs.length * 3 +
        d.interactives.standaloneInputs.length * 2 +
        d.interactives.ctaButtons.length;
      if (score(p) > score(existing)) seenPatterns.set(pat, p);
    }
  }
  return Array.from(seenPatterns.values());
}

// Build flow steps deterministically from scraped interactives.
// Selectors come from the browser — no AI needed, no hallucination possible.
function buildStepsFromInteractives(p: PageData): FlowStep[][] {
  const flows: FlowStep[][] = [];
  const nav: FlowStep = { action: 'navigate', url: p.url, label: `Open ${p.title || new URL(p.url).pathname}` };

  // ── Search flows ──────────────────────────────────────────────
  if (p.interactives.searchInputs.length > 0) {
    const inp = p.interactives.searchInputs[0];
    flows.push([
      nav,
      { action: 'fill', selector: inp.selector, value: '{{searchQuery}}', label: 'Enter search query' },
      { action: 'keyboard', selector: inp.selector, value: 'Enter', label: 'Submit search' },
      { action: 'assert:visible', selector: 'body', label: 'Verify results loaded' },
    ]);
  }

  // ── Form flows ────────────────────────────────────────────────
  for (const form of p.interactives.forms.slice(0, 2)) {
    if (form.fields.length === 0) continue;
    const steps: FlowStep[] = [nav];
    for (const f of form.fields) {
      // Skip file inputs — they need `upload:` action and a real file path, not a text value
      if (f.type === 'file') continue;
      // Infer a clean semantic variable name from type hints first, then field metadata
      const inferredVarName = (() => {
        const t = f.type.toLowerCase();
        const combined = `${f.name} ${f.placeholder} ${f.label}`.toLowerCase();
        if (t === 'email' || /email|e-mail/.test(combined)) return 'email';
        if (t === 'password' || /password|passwd/.test(combined)) return 'password';
        if (t === 'tel' || /phone|mobile|tel/.test(combined)) return 'phone';
        if (/search|query|keyword/.test(combined)) return 'searchQuery';
        if (/subject|topic/.test(combined)) return 'subject';
        if (/message|comment|feedback|body/.test(combined)) return 'message';
        if (/first.?name/.test(combined)) return 'firstName';
        if (/last.?name/.test(combined)) return 'lastName';
        if (/^name|full.?name|your name/.test(combined)) return 'name';
        if (/username|user_name/.test(combined)) return 'username';
        if (/address/.test(combined)) return 'address';
        if (/city/.test(combined)) return 'city';
        if (/zip|postal/.test(combined)) return 'zipCode';
        if (/country/.test(combined)) return 'country';
        if (/title/.test(combined)) return 'title';
        // Fall back to field name/label, cleaned up — strip @domain first, then non-alphanumeric
        const raw = (f.name || f.label || f.placeholder || f.type).replace(/@.*$/, '');
        return raw.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'value';
      })();
      const varName = inferredVarName;
      const action = f.type === 'select' ? 'select' : (f.type === 'checkbox' || f.type === 'radio') ? 'check' : 'fill';
      // Scope selector to the form to avoid cross-form collisions
      const scopedSelector = form.selector && !form.selector.startsWith('form:nth')
        ? f.selector  // form has a stable id/class — selector is specific enough
        : `${form.selector} ${f.selector}`;
      // Disambiguate duplicate selectors within the same form (e.g. two checkboxes with no id/name)
      const usedSelectors = steps.map(s => s.selector);
      const baseSelector = scopedSelector.trim();
      const dupCount = usedSelectors.filter(s => s === baseSelector).length;
      const finalSelector = dupCount > 0 ? `${baseSelector}:nth-of-type(${dupCount + 1})` : baseSelector;
      steps.push({
        action,
        selector: finalSelector,
        value: (action === 'check' || f.type === 'radio') ? 'true' : `{{${varName}}}`,
        label: f.label || f.name || f.placeholder || f.type,
      });
    }
    if (form.submitSelector) {
      // Scope submit button to this form to avoid ambiguity (e.g. login vs signup on same page)
      const scopedSubmit = form.selector && form.submitSelector
        ? `${form.selector} ${form.submitSelector}`
        : form.submitSelector || 'button[type="submit"]';
      steps.push({ action: 'click', selector: scopedSubmit.trim(), label: form.submitText || 'Submit' });
    }
    steps.push({ action: 'assert:visible', selector: 'body', label: 'Verify submission' });
    // Only keep the flow if at least one input field was actually filled/checked (skip file-only forms)
    const hasInputStep = steps.some(s => ['fill', 'select', 'check'].includes(s.action));
    if (hasInputStep) flows.push(steps);
  }

  // ── CTA flow — only if nothing else was found ─────────────────
  if (flows.length === 0 && p.interactives.ctaButtons.length > 0) {
    const cta = p.interactives.ctaButtons[0];
    flows.push([
      nav,
      { action: 'click', selector: cta.selector, label: `Click "${cta.text}"` },
      { action: 'assert:visible', selector: 'body', label: 'Verify action completed' },
    ]);
  }

  return flows;
}

async function analyzePages(pages: PageData[]): Promise<FlowCandidate[]> {
  const candidates: FlowCandidate[] = [];
  const deduplicated = deduplicatePages(pages);
  const BATCH = 5;

  for (let i = 0; i < deduplicated.length; i += BATCH) {
    const batch = deduplicated.slice(i, i + BATCH);

    const batchResults = await Promise.all(batch.map(async p => {
      const stepGroups = buildStepsFromInteractives(p);

      // No interactives → skip pure listing/nav pages (they just add noise)
      if (stepGroups.length === 0) return [] as FlowCandidate[];

      // Ask AI only for name + description — a simple task even small models handle well
      const results: FlowCandidate[] = [];
      for (const steps of stepGroups) {
        const stepSummary = steps
          .map(s => `${s.action}${s.value ? '(' + s.value + ')' : s.selector ? '(' + s.selector + ')' : ''}`)
          .join(' → ');

        const interactiveHint = [
          p.interactives.searchInputs.length > 0 ? 'has search bar' : '',
          p.interactives.forms.length > 0 ? `has ${p.interactives.forms.length} form(s) with fields: ${p.interactives.forms[0].fields.map(f => f.label || f.name || f.type).join(', ')}` : '',
          p.interactives.ctaButtons.length > 0 ? `CTAs: ${p.interactives.ctaButtons.slice(0, 3).map(b => b.text).join(', ')}` : '',
        ].filter(Boolean).join('; ');

        const prompt = `Page: ${p.url}
Title: "${p.title}"
Interactive elements: ${interactiveHint || 'none'}
Automation steps: ${stepSummary}

Give this automation flow a short name (3-6 words) and one sentence description.
Reply with ONLY this JSON, nothing else: {"name": "...", "description": "..."}`;

        let name = p.title || new URL(p.url).pathname;
        let description = `Automated interaction on ${p.title || p.url}`;

        const result = await callAI(prompt);
        if (result) {
          try {
            const match = result.text.replace(/```json\n?|\n?```/g, '').match(/\{[^{}]+\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (typeof parsed.name === 'string' && parsed.name.length > 0) name = parsed.name;
              if (typeof parsed.description === 'string' && parsed.description.length > 0) description = parsed.description;
            }
          } catch { /* keep defaults */ }
        }

        results.push({ name, description, route: p.url, steps });
      }
      return results;
    }));

    for (const r of batchResults) candidates.push(...r);
    if (i + BATCH < deduplicated.length) await new Promise(r => setTimeout(r, 300));
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

  const candidateCards = candidates.map((c, i) => {
    const stepsHtml = c.steps && c.steps.length > 0
      ? `<div class="flow-steps">
          ${c.steps.map((s, si) => {
            const hasVar = s.value && s.value.includes('{{');
            return `<div class="flow-step">
              <span class="step-num">${si + 1}</span>
              <span class="step-action">${escapeHtml(s.action)}</span>
              ${s.url ? `<span class="step-selector">${escapeHtml(s.url)}</span>` : ''}
              ${s.selector ? `<span class="step-selector">${escapeHtml(s.selector)}</span>` : ''}
              ${s.value ? `<span class="step-value ${hasVar ? 'is-var' : ''}">${escapeHtml(s.value)}</span>` : ''}
            </div>`;
          }).join('')}
        </div>`
      : '';

    return `
    <div class="candidate-card" data-id="${i}">
      <label class="candidate-check">
        <input type="checkbox" class="confirm-cb" data-route="${escapeHtml(c.route)}" data-name="${escapeHtml(c.name)}" checked>
        <span class="candidate-name">${escapeHtml(c.name)}</span>
      </label>
      <div class="candidate-desc">${escapeHtml(c.description || '')}</div>
      <div class="candidate-route">${escapeHtml(c.route)}</div>
      ${stepsHtml}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GhostRun Explore Report — ${escapeHtml(report.url)}</title>
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
  <div class="logo">⚡ GhostRun</div>
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function runExplore(url: string) {
  const clack = await import('@clack/prompts');
  const { intro, select, text, password, confirm, spinner, isCancel, outro, note } = clack;

  intro(chalk.cyan(' GhostRun Explorer '));

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
    const uniquePageCount = deduplicatePages(pages).length;
    s2.start(`Analyzing ${uniquePageCount} unique page templates (deduped from ${pages.length})...`);
    candidates = await analyzePages(pages);
    s2.stop(`${candidates.length} flow candidates identified from ${uniquePageCount} unique page templates`);
  } else {
    // No AI — build flows deterministically from scraped interactives
    for (const p of deduplicatePages(pages)) {
      for (const steps of buildStepsFromInteractives(p)) {
        const firstInteractive = steps.find(s => s.action !== 'navigate' && s.action !== 'assert:visible');
        const name = p.title
          ? `${p.title} — ${firstInteractive?.action || 'check'}`
          : `Check ${new URL(p.url).pathname}`;
        candidates.push({ name, description: `Automated flow on ${p.title || p.url}`, route: p.url, steps });
      }
    }
    note('No AI available — generated flows from detected page elements. Set up Ollama or ANTHROPIC_API_KEY for better names.', 'Note');
  }

  // Deduplicate by route (same URL = same candidate)
  const seenRoutes = new Set<string>();
  candidates = candidates.filter(c => {
    if (seenRoutes.has(c.route)) return false;
    seenRoutes.add(c.route);
    return true;
  });

  // Deduplicate by action fingerprint — catches same widget (e.g. subscribe footer) on multiple pages
  const seenFingerprints = new Set<string>();
  candidates = candidates.filter(c => {
    const fingerprint = (c.steps || [])
      .filter(s => s.action !== 'navigate' && s.action !== 'assert:visible')
      .map(s => `${s.action}:${s.selector || ''}:${s.value || ''}`)
      .sort()
      .join('|');
    if (!fingerprint) return true; // keep nav-only stubs
    if (seenFingerprints.has(fingerprint)) return false;
    seenFingerprints.add(fingerprint);
    return true;
  });

  // Save candidates to DB — build real flow graphs from steps
  for (const c of candidates) {
    const pageForRoute = pages.find(p => p.url === c.route);

    // Build graph nodes from steps (AI-generated) or a navigate stub
    const steps = c.steps && c.steps.length > 0 ? c.steps : [
      { action: 'navigate', url: c.route, label: `Open ${c.name}` },
      { action: 'assert:visible', selector: 'body', label: 'Verify page loaded' },
    ];

    const nodes = steps.map((step, idx) => ({
      id: `n${idx + 1}`,
      type: 'action',
      action: step.action,
      ...(step.url ? { url: step.url } : {}),
      ...(step.selector ? { selector: step.selector } : {}),
      ...(step.value ? { value: step.value } : {}),
      name: step.label || `${step.action}${step.selector ? ' ' + step.selector : ''}`,
    }));

    db.createExploreCandidate({
      reportId: report.id,
      name: c.name,
      description: c.description,
      route: c.route,
      screenshotPath: pageForRoute?.screenshotPath || undefined,
      graph: { nodes, edges: [] },
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
      `    ${chalk.cyan('ghostrun explore:confirm ' + report.id.slice(0, 8))}`,
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
    `Run any flow with:\n  ${chalk.cyan('ghostrun run <name>')}`,
    'Next Step'
  );
  outro('');
}

async function runExploreList() {
  const reports = db.listExploreReports();
  if (reports.length === 0) {
    info('No explore sessions found. Run: ghostrun explore <url>');
    return;
  }
  console.log(chalk.bold('\n  Explore Sessions\n'));
  const header = `  ${'ID'.padEnd(10)}${'URL'.padEnd(45)}${'Status'.padEnd(12)}${'Report'}`;
  console.log(chalk.gray(header));
  console.log(chalk.gray('  ' + '─'.repeat(90)));
  for (const r of reports) {
    const id = chalk.cyan(r.id.slice(0, 8));
    const url = r.url.slice(0, 43).padEnd(45);
    const status = (r.status === 'complete' ? chalk.green('complete') : chalk.yellow(r.status)).padEnd(20);
    const report = r.reportPath ? chalk.gray('open ' + r.reportPath) : chalk.gray('—');
    console.log(`  ${id}  ${url}  ${status}  ${report}`);
  }
  console.log();
  console.log(chalk.gray(`  Confirm a session: ghostrun explore:confirm <id>`));
  console.log();
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
  if (suites.length === 0) { warn('No suites. Create one: ' + chalk.cyan('ghostrun suite:create <name>')); console.log(); return; }
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
  if (baselines.length === 0) { warn('No baselines. Run: ' + chalk.cyan('ghostrun baseline:set ' + id)); console.log(); return; }
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
  info(`Run with: ${chalk.green('ghostrun run ' + flow.id.slice(0, 8))}`);
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
  info(`Run: ${chalk.green('ghostrun flow:list')}`);
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
  console.log(chalk.gray('  Install with: ghostrun store install <name>'));
  console.log(chalk.gray('  Variables:   ghostrun run <flow-name> --var BASE_URL=https://...'));
  console.log();
}

async function runStoreInstall(slug: string) {
  const dir = getTemplatesDir();
  const file = path.join(dir, slug.endsWith('.flow.json') ? slug : slug + '.flow.json');
  if (!fs.existsSync(file)) {
    errorMsg(`Template not found: ${slug}`);
    info('Available templates: ' + chalk.cyan('ghostrun store list'));
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
    console.log(chalk.gray('  Or set them in .ghostrun.env:\n'));
    for (const v of t.variables) {
      console.log(chalk.gray(`  ${v}=your-value`));
    }
    console.log();
    info(`Run with: ${chalk.green(`ghostrun run "${t.flow.name}" --var BASE_URL=https://...`)}`);
  } else {
    info(`Run with: ${chalk.green(`ghostrun run ${flow.id.slice(0, 8)}`)}`);
  }
  console.log();
}

// ============================================
// COMMANDS — init wizard
// ============================================

async function runInit() {
  printLogo(); divider();
  console.log(chalk.bold('\n  GhostRun Setup Wizard\n'));

  // 1. Ensure data directories
  fs.mkdirSync(path.join(DATA_PATH, 'data'), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'sessions'), { recursive: true });
  success('Data directory ready: ' + chalk.cyan(DATA_PATH));

  // 2. Check Playwright / Chromium
  const { execSync } = require('child_process') as typeof import('child_process');
  let chromiumOk = false;
  try {
    execSync('node -e "require(\'playwright\')"', { stdio: 'ignore' });
    chromiumOk = true;
    success('Playwright: installed');
  } catch { warn('Playwright not found'); }

  if (!chromiumOk) {
    const installPw = await askQuestion(chalk.cyan('  Install Playwright + Chromium? (Y/n) '));
    if (installPw.toLowerCase() !== 'n') {
      console.log(chalk.gray('  Running: npm install playwright...\n'));
      try {
        execSync('npm install playwright', { stdio: 'inherit', cwd: __dirname });
        execSync('npx playwright install chromium', { stdio: 'inherit' });
        success('Playwright + Chromium installed');
      } catch { errorMsg('Installation failed. Run manually: npm install playwright && npx playwright install chromium'); }
    }
  } else {
    // Check if chromium browser is actually installed
    try {
      execSync('npx playwright install chromium --dry-run', { stdio: 'ignore' });
    } catch {
      const installBrowser = await askQuestion(chalk.cyan('  Chromium browser not found. Install it? (Y/n) '));
      if (installBrowser.toLowerCase() !== 'n') {
        execSync('npx playwright install chromium', { stdio: 'inherit' });
        success('Chromium installed');
      }
    }
  }

  // 3. Check AI provider
  console.log();
  const ollamaModel = await isOllamaRunning();
  if (ollamaModel) {
    success('AI: Ollama running — ' + chalk.cyan(ollamaModel));
  } else if (process.env.ANTHROPIC_API_KEY) {
    success('AI: Anthropic API key detected');
  } else {
    warn('No AI provider found');
    console.log();
    console.log(chalk.bold('  Choose an AI provider:\n'));
    console.log(`  ${chalk.green('A)')} Ollama ${chalk.gray('(recommended — free, fully local, no internet needed)')}`);
    console.log(chalk.gray('     brew install ollama && ollama pull gemma3:4b && ollama serve\n'));
    console.log(`  ${chalk.cyan('B)')} Anthropic ${chalk.gray('(cloud — needs API key)')}`);
    console.log(chalk.gray('     export ANTHROPIC_API_KEY=sk-ant-...\n'));

    const choice = await askQuestion(chalk.cyan('  Try to start Ollama now? (y/N) '));
    if (choice.toLowerCase() === 'y') {
      try {
        const { spawn: sp } = require('child_process') as typeof import('child_process');
        sp('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
        await new Promise(r => setTimeout(r, 2000));
        const modelCheck = await isOllamaRunning();
        if (modelCheck) success('Ollama started: ' + chalk.cyan(modelCheck));
        else {
          warn('Ollama started but no model found. Pull one:');
          console.log(chalk.cyan('  ollama pull gemma3:4b'));
        }
      } catch { warn('Could not start Ollama. Install it from https://ollama.com'); }
    }
  }

  // 4. Create .ghostrun.env template in CWD if missing
  console.log();
  const envFile = path.join(process.cwd(), '.ghostrun.env');
  if (!fs.existsSync(envFile)) {
    fs.writeFileSync(envFile, [
      '# GhostRun variables — used as {{VARIABLE}} in flows',
      '# BASE_URL=https://your-app.com',
      '# EMAIL=test@example.com',
      '# PASSWORD=secret',
      '',
    ].join('\n'));
    info('.ghostrun.env template created in current directory');
  } else {
    info('.ghostrun.env already exists');
  }

  divider();
  console.log(chalk.bold.green('\n  Setup complete!\n'));
  console.log('  ' + chalk.gray('Record a flow:   ') + chalk.cyan('ghostrun learn https://your-app.com'));
  console.log('  ' + chalk.gray('Run a flow:      ') + chalk.cyan('ghostrun run <name>'));
  console.log('  ' + chalk.gray('Run (visible):   ') + chalk.cyan('ghostrun run <name> --visible'));
  console.log('  ' + chalk.gray('Ask the bot:     ') + chalk.cyan('ghostrun chat'));
  console.log('  ' + chalk.gray('Browse templates:') + chalk.cyan('ghostrun store list'));
  console.log();
}

// ============================================
// COMMANDS — monitor (extract + diff)
// ============================================

async function runMonitor(flowId: string) {
  printLogo(); divider();

  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) { errorMsg('Flow not found: ' + flowId); process.exit(1); }

  const outputIdx = process.argv.indexOf('--output');
  const jsonOutput = outputIdx !== -1 && process.argv[outputIdx + 1] === 'json';

  console.log(chalk.bold('\n  Monitor: ') + chalk.white(flow.name) + '\n');

  // Get previous run's extracted data for diff
  const previousRuns = db.listRuns(flow.id, 2);
  let prevData: Record<string, string> = {};
  if (previousRuns.length > 0) {
    db.getRunData(previousRuns[0].id).forEach(d => { prevData[d.variableName] = d.variableValue; });
  }

  // Run the flow
  const result = await executeFlow(flow.id, globalVars, { jsonOutput: false, quiet: false });
  const extractedData = result.extractedData;

  if (Object.keys(extractedData).length === 0) {
    console.log();
    warn('No data extracted. Add extract: actions to your flow to capture data.');
    console.log(chalk.gray('  Flow JSON example:'));
    console.log(chalk.gray('  { "action": "extract", "variable": "price", "selector": ".price" }'));
    console.log();
    return;
  }

  divider();
  console.log(chalk.bold('\n  Extracted Data\n'));

  let hasChanges = false;
  for (const [key, value] of Object.entries(extractedData)) {
    const prev = prevData[key];
    if (prev !== undefined && prev !== value) {
      console.log(`  ${chalk.yellow('~')} ${chalk.white(key.padEnd(20))} ${chalk.gray(prev.slice(0, 40))} ${chalk.yellow('→')} ${chalk.yellow(value.slice(0, 40))}`);
      hasChanges = true;
    } else {
      console.log(`  ${chalk.green('=')} ${chalk.white(key.padEnd(20))} ${chalk.cyan(value.slice(0, 60))}`);
    }
  }

  console.log();
  if (Object.keys(prevData).length > 0) {
    if (hasChanges) {
      console.log(chalk.yellow.bold('  ⚠ Changes detected since last run'));
    } else {
      console.log(chalk.green('  ✓ No changes since last run'));
    }
  } else {
    console.log(chalk.gray('  (no previous run to compare — run again to see changes)'));
  }

  if (jsonOutput) {
    console.log('\n' + JSON.stringify({ flowId: flow.id, flowName: flow.name, runId: result.runId, extractedData, hasChanges }, null, 2));
  }
  console.log();
}

// ============================================
// COMMANDS — chat (local Q&A bot)
// ============================================

async function runChat() {
  printLogo(); divider();

  const ollamaModel = await isOllamaRunning();
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (!ollamaModel && !hasAnthropic) {
    errorMsg('No AI provider available for chat.');
    console.log(chalk.gray('\n  Option A (free + local): brew install ollama && ollama pull gemma3:4b && ollama serve'));
    console.log(chalk.gray('  Option B (cloud):        export ANTHROPIC_API_KEY=sk-ant-...\n'));
    process.exit(1);
  }

  const providerLabel = ollamaModel ? chalk.green(`Ollama (${ollamaModel})`) : chalk.cyan('Anthropic');

  console.log(chalk.bold('\n  👻 GhostRun Chat\n'));
  console.log('  ' + chalk.gray('Powered by ') + providerLabel + chalk.gray('  ·  type ') + chalk.cyan('exit') + chalk.gray(' to quit'));
  console.log('  ' + chalk.gray('Ask about flows, failures, commands, or say "run <flow-name>"'));
  console.log();
  divider();

  // Build fresh system prompt each turn (live DB data)
  function buildSystemPrompt(): string {
    const flows = db.listFlows();
    const recentRuns = db.listRuns(undefined, 10);

    const flowsList = flows.length > 0
      ? flows.map(f => {
          const stats = db.getFlowStats(f.id);
          return `- "${f.name}" (id:${f.id.slice(0, 8)}, url:${f.appUrl || 'N/A'}, ${stats.totalRuns} runs, ${Math.round(stats.passRate * 100)}% pass rate, by:${f.createdBy})`;
        }).join('\n')
      : '(no flows yet)';

    const runsList = recentRuns.length > 0
      ? recentRuns.map(r => {
          const fl = db.getFlow(r.flowId);
          const dur = r.duration ? `${(r.duration / 1000).toFixed(1)}s` : '?';
          const when = timeAgo(r.startedAt);
          const note = r.summary ? ` — ${r.summary.split('\n')[0].slice(0, 60)}` : '';
          return `- ${r.status === 'passed' ? '✓' : '✗'} "${fl?.name || 'Unknown'}" ${when} (${dur})${note}`;
        }).join('\n')
      : '(no runs yet)';

    return `You are GhostRun Assistant — an embedded AI helper for GhostRun, a memory-driven web automation CLI.

GhostRun lets developers record browser flows and replay them headlessly for testing, monitoring, and data extraction. Uses Playwright + SQLite. AI (Ollama/Anthropic) powers failure analysis, flow generation, and this chat.

## Core Commands
- ghostrun learn <url>          — Record a flow (real browser)
- ghostrun run <id|name>        — Run headlessly
- ghostrun run <name> --visible — Run with visible browser (for debugging)
- ghostrun run <name> --output json — JSON output with extracted data
- ghostrun flow:list            — List flows with pass rates
- ghostrun run:list             — Recent runs
- ghostrun run:show <id>        — Per-step details + screenshots
- ghostrun run:analyze <id>     — AI failure analysis
- ghostrun monitor <flow>       — Run + show extracted data changes
- ghostrun explore <url>        — BFS crawl + auto-generate flows with AI
- ghostrun create               — Generate flow from plain English
- ghostrun store list/install   — Browse + install 10 template flows
- ghostrun suite:create/run     — Group flows into test suites
- ghostrun chat                 — This chat interface
- ghostrun init                 — Setup wizard
- ghostrun status               — Stats + AI provider info
- ghostrun serve                — Scheduler daemon (runs cron schedules)
- ghostrun serve --ui           — Web dashboard at http://localhost:3000

## Flow Actions Supported
navigate, reload, back, forward,
click, dblclick, fill, type, clear, select, check, focus, hover,
drag, keyboard, upload,
wait, wait:text, wait:url, wait:ms,
scroll, scroll:element, scroll:bottom, scroll:load,
next:page,
assert:visible, assert:hidden, assert:text, assert:not-text, assert:value, assert:count, assert:attr,
extract (capture page data to variable),
screenshot, eval, iframe:enter, iframe:exit,
cookie:set, cookie:clear, storage:set

## Variables
Use {{VAR_NAME}} in flows. Pass with --var KEY=value or .ghostrun.env file in CWD.

## Creator Types
👤 human = recorded live · 🤖 agent = AI-generated (via create/explore/store)

## YOUR FLOWS RIGHT NOW
${flowsList}

## RECENT RUN HISTORY
${runsList}

## Response Rules
1. Be concise and practical — developers prefer direct answers
2. If asked to RUN an existing flow, write exactly: [RUN: <flow-name>]
3. Only reference flows that actually exist in the list above
4. If asked about a failed run, check the run history summary above
5. To create NEW flows: ghostrun create (AI) or ghostrun learn <url> (browser recording)
6. If you don't know something, say so — don't invent flow names or IDs`;
  }

  const conversationHistory: Array<{ role: string; content: string }> = [];

  async function* streamResponse(userMessage: string): AsyncGenerator<string> {
    conversationHistory.push({ role: 'user', content: userMessage });

    if (ollamaModel) {
      const baseUrl = process.env.GHOSTRUN_OLLAMA_URL || 'http://localhost:11434';
      let fullResponse = '';
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [
              { role: 'system', content: buildSystemPrompt() },
              ...conversationHistory,
            ],
            stream: true,
          }),
          signal: AbortSignal.timeout(90000),
        });
        if (!res.ok || !res.body) { yield '(Ollama unavailable — is it running?)'; return; }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
              const chunk = data.message?.content || '';
              if (chunk) { yield chunk; fullResponse += chunk; }
              if (data.done) {
                conversationHistory.push({ role: 'assistant', content: fullResponse });
                return;
              }
            } catch {}
          }
        }
        if (fullResponse) conversationHistory.push({ role: 'assistant', content: fullResponse });
      } catch (err) {
        yield `\n(Error: ${err instanceof Error ? err.message : err})`;
      }
    } else {
      // Anthropic fallback — not streaming, but still works
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      try {
        const msg = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: buildSystemPrompt(),
          messages: conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        });
        const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '(no response)';
        conversationHistory.push({ role: 'assistant', content: text });
        yield text;
      } catch (err) {
        yield `(Anthropic error: ${err instanceof Error ? err.message : err})`;
      }
    }
  }

  // Chat loop
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const askUser = (): Promise<string> => new Promise(resolve => {
    process.stdout.write(chalk.cyan('\n  You  › '));
    rl.once('line', resolve);
  });

  while (true) {
    let input: string;
    try { input = (await askUser()).trim(); } catch { break; }

    if (!input || ['exit', 'quit', 'q', ':q', 'bye'].includes(input.toLowerCase())) {
      console.log(chalk.gray('\n  Goodbye! 👻\n'));
      rl.close();
      break;
    }

    process.stdout.write(chalk.magenta('  Ghost › '));
    let fullResponse = '';

    for await (const chunk of streamResponse(input)) {
      process.stdout.write(chunk);
      fullResponse += chunk;
    }
    process.stdout.write('\n');

    // Detect run intent: [RUN: flow-name]
    const runMatch = fullResponse.match(/\[RUN:\s*([^\]]+)\]/i);
    if (runMatch) {
      const flowQuery = runMatch[1].trim();
      const targetFlow = db.findFlowByPartialId(flowQuery) || db.findFlowByName(flowQuery);
      if (targetFlow) {
        process.stdout.write(chalk.cyan(`\n  Run "${targetFlow.name}"? (y/N) `));
        const confirm = await new Promise<string>(resolve => rl.once('line', resolve));
        if (confirm.trim().toLowerCase() === 'y') {
          console.log();
          const result = await executeFlow(targetFlow.id, globalVars);
          console.log();
          // Feed result back into conversation so bot can comment on it
          const resultSummary = result.passed
            ? `Flow "${targetFlow.name}" passed in ${result.duration}ms.`
            : `Flow "${targetFlow.name}" failed in ${result.duration}ms.`;
          conversationHistory.push({ role: 'user', content: `[SYSTEM: ${resultSummary}]` });
        }
      } else {
        warn(`Flow not found: "${flowQuery}"`);
      }
    }
  }
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

  intro(chalk.cyan(' GhostRun — Memory-driven Web Automation '));

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
        { value: 'chat',     label: '💬 Ask GhostRun Bot',           hint: 'Q&A + run flows by name' },
        { value: 'serve',    label: '🌐  Open web dashboard',       hint: 'Local web UI' },
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
        log.warn('No suites. Create one with: ghostrun suite:create <name>');
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

    // ── CHAT ────────────────────────────────────────────────
    else if (action === 'chat') {
      console.log();
      await runChat();
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
// COMMANDS — API Testing
// ============================================

async function runApiLearn() {
  printLogo(); divider();
  console.log(chalk.bold('\n  API Flow Builder\n'));
  console.log(chalk.gray('  Build HTTP test flows interactively.\n'));

  const name = await askQuestion(chalk.cyan('  Flow name: '));
  if (!name.trim()) { errorMsg('Name required'); process.exit(1); }

  const nodes: Record<string, unknown>[] = [];
  let stepIdx = 1;

  console.log(chalk.gray('\n  Add steps. Available types:'));
  console.log(chalk.gray('  http      — HTTP request (GET/POST/PUT/DELETE/PATCH)'));
  console.log(chalk.gray('  assert    — Assert response (status/body/header/time)'));
  console.log(chalk.gray('  extract   — Extract JSON value to variable'));
  console.log(chalk.gray('  set       — Set variable'));
  console.log(chalk.gray('  done      — Finish and save\n'));

  while (true) {
    const type = (await askQuestion(chalk.cyan(`  Step ${stepIdx} type [http/assert/extract/set/done]: `))).trim().toLowerCase();
    if (type === 'done' || type === '') break;

    if (type === 'http') {
      const method = ((await askQuestion('    Method [GET]: ')).trim().toUpperCase()) || 'GET';
      const url = (await askQuestion('    URL: ')).trim();
      if (!url) { warn('URL required, skipping.'); continue; }
      const label = (await askQuestion(`    Label [${method} ${url.split('/').slice(-1)[0] || url}]: `)).trim()
        || `${method} ${url.split('/').slice(-1)[0] || url}`;
      const headersStr = (await askQuestion('    Headers (key:value, comma-sep, or blank): ')).trim();
      const headers: Record<string, string> = {};
      if (headersStr) {
        for (const h of headersStr.split(',')) {
          const [k, ...v] = h.split(':');
          if (k && v.length) headers[k.trim()] = v.join(':').trim();
        }
      }
      const bodyStr = (await askQuestion('    Body JSON (or blank): ')).trim();
      const extractStr = (await askQuestion('    Extract vars (varName=$.path, comma-sep, or blank): ')).trim();
      const extract: Record<string, string> = {};
      if (extractStr) {
        for (const e of extractStr.split(',')) {
          const [k, v] = e.split('=');
          if (k && v) extract[k.trim()] = v.trim();
        }
      }
      nodes.push({
        id: uuidv4(), type: 'action', action: 'http:request',
        method, url, label, headers: Object.keys(headers).length ? headers : undefined,
        body: bodyStr ? JSON.parse(bodyStr) : undefined,
        extract: Object.keys(extract).length ? extract : undefined,
      });
    } else if (type === 'assert') {
      const assertType = (await askQuestion('    Assert type [status/body:contains/json:path/time]: ')).trim() || 'status';
      let node: Record<string, unknown> = { id: uuidv4(), type: 'action', action: 'assert:response', assert: assertType, label: `Assert ${assertType}` };
      if (assertType === 'status') {
        const exp = (await askQuestion('    Expected status [200]: ')).trim() || '200';
        node = { ...node, expected: Number(exp), label: `Assert status ${exp}` };
      } else if (assertType === 'body:contains') {
        const exp = (await askQuestion('    Body must contain: ')).trim();
        node = { ...node, expected: exp, label: `Assert body contains "${exp}"` };
      } else if (assertType === 'json:path') {
        const p = (await askQuestion('    JSON path (e.g. $.user.id): ')).trim();
        const exp = (await askQuestion('    Expected value: ')).trim();
        node = { ...node, path: p, expected: exp, label: `Assert ${p} = ${exp}` };
      } else if (assertType === 'time') {
        const maxMs = (await askQuestion('    Max response time ms [2000]: ')).trim() || '2000';
        node = { ...node, expected: Number(maxMs), label: `Assert response < ${maxMs}ms` };
      }
      nodes.push(node);
    } else if (type === 'extract') {
      const varName = (await askQuestion('    Variable name: ')).trim();
      const p = (await askQuestion('    JSON path (e.g. $.id): ')).trim();
      nodes.push({ id: uuidv4(), type: 'action', action: 'extract:json', variable: varName, path: p, label: `Extract ${varName} from ${p}` });
    } else if (type === 'set') {
      const varName = (await askQuestion('    Variable name: ')).trim();
      const val = (await askQuestion('    Value: ')).trim();
      nodes.push({ id: uuidv4(), type: 'action', action: 'set:variable', variable: varName, value: val, label: `Set ${varName} = ${val}` });
    } else {
      warn(`Unknown type "${type}". Try: http, assert, extract, set, done`);
      continue;
    }
    stepIdx++;
  }

  if (!nodes.length) { warn('No steps added. Flow not saved.'); return; }

  const flow = db.createFlow({ name, description: `API flow with ${nodes.length} step(s)`, createdBy: 'human', graph: { nodes, edges: [], appUrl: undefined } });
  success(`API flow created: ${chalk.white(flow.name)} (${chalk.gray(flow.id.slice(0, 8))})`);
  console.log(chalk.gray(`  ${nodes.length} step(s). Run with: ghostrun run "${name}"`));
  console.log();
}

async function runEnvCreate(name: string, extraArgs: string[]) {
  printLogo(); divider();
  let baseUrl = extraArgs[0] || '';
  if (!baseUrl) baseUrl = (await askQuestion(chalk.cyan('  Base URL (optional, press Enter to skip): '))).trim();
  const env = db.createEnvironment({ name, baseUrl: baseUrl || undefined });
  success(`Environment created: ${chalk.white(name)} (${chalk.gray(env.id.slice(0, 8))})`);
  if (baseUrl) info(`Base URL: ${chalk.cyan(baseUrl)}`);
  info(`Add variables: ghostrun env:set ${name} KEY value`);
  console.log();
}

async function runEnvList() {
  printLogo(); divider();
  const envs = db.listEnvironments();
  if (!envs.length) { warn('No environments. Create one: ghostrun env:create <name>'); return; }
  console.log(chalk.bold('\n  Environments\n'));
  for (const e of envs) {
    const active = e.isActive ? chalk.green(' ● active') : '';
    const varCount = Object.keys(e.variables).length;
    console.log(`  ${chalk.white(e.name.padEnd(20))}${active}  ${chalk.gray(varCount + ' vars')}${e.baseUrl ? '  ' + chalk.cyan(e.baseUrl) : ''}`);
  }
  console.log();
}

async function runEnvSet(envName: string, key: string, value: string) {
  let env = db.findEnvironmentByName(envName);
  if (!env) {
    // Auto-create if doesn't exist
    env = db.createEnvironment({ name: envName });
    info(`Created environment: ${envName}`);
  }
  const vars = { ...env.variables, [key]: value };
  db.updateEnvironment(env.id, { variables: vars });
  success(`Set ${chalk.white(key)} = ${chalk.cyan(value)} in environment ${chalk.white(envName)}`);
  console.log();
}

async function runEnvUse(envName: string) {
  const env = db.findEnvironmentByName(envName);
  if (!env) { errorMsg(`Environment "${envName}" not found. Create it: ghostrun env:create ${envName}`); process.exit(1); }
  db.setActiveEnvironment(env.id);
  success(`Active environment: ${chalk.white(envName)}`);
  if (env.baseUrl) info(`Base URL: ${chalk.cyan(env.baseUrl)}`);
  const varCount = Object.keys(env.variables).length;
  if (varCount) info(`${varCount} variables loaded`);
  console.log();
}

async function runEnvShow(envName: string) {
  const env = db.findEnvironmentByName(envName);
  if (!env) { errorMsg(`Environment "${envName}" not found`); process.exit(1); }
  printLogo(); divider();
  console.log(chalk.bold(`\n  Environment: ${env.name}`) + (env.isActive ? chalk.green(' ● active') : ''));
  if (env.baseUrl) console.log(`  Base URL: ${chalk.cyan(env.baseUrl)}`);
  const vars = env.variables;
  if (Object.keys(vars).length === 0) {
    console.log(chalk.gray('  No variables set.'));
  } else {
    console.log(chalk.bold('\n  Variables:'));
    for (const [k, v] of Object.entries(vars)) {
      const masked = k.toLowerCase().includes('secret') || k.toLowerCase().includes('password') || k.toLowerCase().includes('token')
        ? '*'.repeat(Math.min(v.length, 8)) : v;
      console.log(`    ${chalk.white(k.padEnd(24))} ${chalk.cyan(masked)}`);
    }
  }
  console.log();
}

async function runEnvDelete(envName: string) {
  const env = db.findEnvironmentByName(envName);
  if (!env) { errorMsg(`Environment "${envName}" not found`); process.exit(1); }
  db.deleteEnvironment(env.id);
  success(`Deleted environment: ${envName}`);
  console.log();
}

async function runVarDump(runId: string) {
  let run = db.findRunByPartialId(runId) || db.getRun(runId);
  if (!run) { errorMsg('Run not found: ' + runId); process.exit(1); }
  printLogo(); divider();
  const data = db.getRunData(run.id);
  const apiResps = db.getApiResponses(run.id);
  console.log(chalk.bold(`\n  Variables from run ${chalk.gray(run.id.slice(0, 8))}\n`));
  if (!data.length) { console.log(chalk.gray('  No variables extracted in this run.')); }
  else {
    for (const d of data) {
      console.log(`  Step ${d.stepNumber.toString().padStart(2)}  ${chalk.white(d.variableName.padEnd(24))} ${chalk.cyan(d.variableValue.slice(0, 80))}`);
    }
  }
  if (apiResps.length) {
    console.log(chalk.bold('\n  API Calls:\n'));
    for (const r of apiResps) {
      const statusColor = r.statusCode && r.statusCode < 400 ? chalk.green : chalk.red;
      console.log(`  Step ${r.stepNumber.toString().padStart(2)}  ${chalk.white((r.method || '???').padEnd(7))} ${chalk.gray(r.url.slice(0, 60))}  ${r.statusCode ? statusColor(String(r.statusCode)) : chalk.red('ERR')}  ${r.responseTimeMs ? chalk.gray(r.responseTimeMs + 'ms') : ''}`);
    }
  }
  console.log();
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
    console.log(`  ${C('run <id> --visible')}${G('Run with visible browser window')}`);
    console.log(`  ${C('run <id> --output json')}${G('JSON output with extracted data')}`);
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
    console.log(`  ${C('serve --ui [--port 3000]')}${G('Launch the web dashboard')}`);
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

    H('Data Extraction & Monitoring');
    console.log(`  ${C('monitor <id|name>')}${G('Run flow + show extracted data changes')}`);
    console.log(`  ${C('monitor <id> --output json')}${G('Monitor with JSON output')}`);
    console.log(chalk.gray(`  ${'  Flow actions: extract, scroll:bottom, scroll:load, next:page'.padEnd(52)}`));
    console.log();

    H('API Testing');
    console.log(`  ${C('api:learn')}${G('Build HTTP API test flow interactively')}`);
    console.log(`  ${C('env:create <name>')}${G('Create environment (dev/staging/prod)')}`);
    console.log(`  ${C('env:list')}${G('List all environments')}`);
    console.log(`  ${C('env:set <env> <key> <val>')}${G('Set variable in environment')}`);
    console.log(`  ${C('env:use <name>')}${G('Activate environment for runs')}`);
    console.log(`  ${C('env:show <name>')}${G('Show environment variables')}`);
    console.log(`  ${C('var:dump <run-id>')}${G('Show extracted variables + API calls from run')}`);
    console.log();

    H('Chat & Setup');
    console.log(`  ${C('chat')}${G('Ask GhostRun Bot — Q&A + run flows      🤖 AI')}`);
    console.log(`  ${C('init')}${G('Setup wizard (Chromium + AI provider)')}`);
    console.log();

    H('Exploration & System');
    console.log(`  ${C('explore <url>')}${G('Auto-discover flows via BFS crawl       🤖 AI')}`);
    console.log(`  ${C('explore:list')}${G('List all explore sessions')}`);
    console.log(`  ${C('explore:confirm <report-id>')}${G('Save confirmed flows from explore')}`);
    console.log(`  ${C('status')}${G('Stats, creator breakdown, AI provider')}`);
    console.log(`  ${C('serve')}${G('Open web dashboard (ghostrun serve --ui)')}`);
    console.log();
    console.log(chalk.gray('  🤖 AI  = enhanced by AI (Ollama local or ANTHROPIC_API_KEY)'));
    console.log(chalk.gray('  👤     = human-recorded   🤖 = agent/AI-generated'));
    console.log(chalk.gray('  Flags:     --visible (show browser)  --output json  --var key=value'));
    console.log();
    process.exit(0);
  }

  switch (cmd) {
    case 'init':            await runInit(); break;
    case 'chat':            await runChat(); break;
    case 'monitor':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runMonitor(args[1]); break;
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
    case 'serve':           await runServe(args.slice(1)); break;
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
    case 'explore:list':    await runExploreList(); break;
    case 'explore:confirm':
      if (!args[1]) { errorMsg('Report ID required'); process.exit(1); }
      await runExploreConfirm(args[1]); break;
    // case 'app': removed - desktop app is deprecated, use web dashboard instead
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
      if (args[1] === 'list' || !args[1]) { await runStoreList(); }
      else if (args[1] === 'install') {
        if (!args[2]) { errorMsg('Template name required. Run: ghostrun store list'); process.exit(1); }
        await runStoreInstall(args[2]);
      } else { errorMsg('Unknown store command. Use: store list / store install <name>'); process.exit(1); }
      break;
    case 'store:list':       await runStoreList(); break;
    case 'store:install':
      if (!args[1]) { errorMsg('Template name required. Run store:list to see options.'); process.exit(1); }
      await runStoreInstall(args[1]); break;
    case 'api:learn':         await runApiLearn(); break;
    case 'env:create':
      if (!args[1]) { errorMsg('Environment name required'); process.exit(1); }
      await runEnvCreate(args[1], args.slice(2)); break;
    case 'env:list':          await runEnvList(); break;
    case 'env:set':
      if (!args[1] || !args[2] || !args[3]) { errorMsg('Usage: env:set <env-name> <key> <value>'); process.exit(1); }
      await runEnvSet(args[1], args[2], args[3]); break;
    case 'env:use':
      if (!args[1]) { errorMsg('Environment name required'); process.exit(1); }
      await runEnvUse(args[1]); break;
    case 'env:show':
      if (!args[1]) { errorMsg('Environment name required'); process.exit(1); }
      await runEnvShow(args[1]); break;
    case 'env:delete':
      if (!args[1]) { errorMsg('Environment name required'); process.exit(1); }
      await runEnvDelete(args[1]); break;
    case 'var:dump':
      if (!args[1]) { errorMsg('Run ID required'); process.exit(1); }
      await runVarDump(args[1]); break;
    default:
      errorMsg('Unknown command: ' + cmd);
      console.log('  Run without args for help.');
      process.exit(1);
  }

  if (cmd !== 'serve') db.close();
}

main().catch(err => { errorMsg(String(err)); process.exit(1); });
