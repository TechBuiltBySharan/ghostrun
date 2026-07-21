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
import { createHash, randomUUID as uuidv4 } from 'crypto';
import { DatabaseManager } from './packages/database/src/manager';
import {
  escapeHtml,
  formatReportDuration,
  computeFlowGraphHash,
  buildRunHistorySparklineHtml,
  buildRepairPanelHtml,
  buildNextStepsPanelHtml,
  buildIntentBlockHtml,
  buildFailurePanelHtml,
  RUN_REPORT_V2_STYLES,
  type RepairProposalView,
} from './run-report-v2';
import {
  initProjectContext,
  getProjectPaths,
  ensureProjectDirs,
  ensureProjectJson,
  writeFlowFile,
  deleteFlowFile,
  syncFlowsFromDisk,
  copyDevServicesTemplate,
  updateProjectGitignore,
  resolveProjectRoot,
  listFlowFiles,
} from './project-scope';
import {
  applyProfileAccount,
  resolveSelectedAccountKey,
  getEffectiveAuthForAccount,
  getProfileAccount,
  listAccountIds,
  buildAccountFromSecrets,
  secretNamesForAccount,
  normalizeAccountId,
  buildDefaultSaaSAccounts,
  DEFAULT_SAAS_ACCOUNT_IDS,
  type ProfileAccount,
} from './account-scope';
import {
  waitForEmail,
  extractFirstUrl,
  extractOtpCode,
  waitForWebhook,
  runServicesDoctor,
  runSqlFixtures,
  runDbQuery,
  assertDbQuery,
  assertWebhookPayload,
  verifyWebhookSignature,
  resolveWebhookCapture,
  fetchMailpitMessages,
  sanitizeInboxSnapshot,
  startHookCatcher,
  listWebhookCaptures,
  isEmailBridgeEnabled,
  resolveEmailApiUrl,
  type ProfileServices,
} from './service-bridge';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_PATH = path.join(HOME_DIR, '.ghostrun');
const GLOBAL_CONFIG_PATH = path.join(DATA_PATH, 'config.json');
const SCRAPES_PATH = path.join(DATA_PATH, 'scrapes');

function refreshProjectConstants(): { ghostrunPath: string; configPath: string } {
  const p = getProjectPaths();
  PROJECT_GHOSTRUN_PATH = p.ghostrunPath;
  PROJECT_CONFIG_PATH = p.configPath;
  return { ghostrunPath: p.ghostrunPath, configPath: p.configPath };
}

let PROJECT_GHOSTRUN_PATH = path.join(process.cwd(), '.ghostrun');
let PROJECT_CONFIG_PATH = path.join(PROJECT_GHOSTRUN_PATH, 'config.json');

type InteractionMode = 'assist' | 'auto';
type AiCiPolicy = 'off' | 'summary-only' | 'on';

interface GhostrunConfig {
  project?: {
    name?: string;
    workspaceVersion?: string;
  };
  interactionMode?: InteractionMode;
  activeProfile?: string;
  features?: {
    crawlee?: {
      enabled?: boolean;
    };
  };
  ai?: {
    provider?: 'auto' | 'ollama' | 'anthropic';
    model?: string;
    trackUsage?: boolean;
    storeSanitizedTranscripts?: boolean;
  };
  policies?: {
    allowAutoRepairApply?: boolean;
    allowAiInCi?: AiCiPolicy;
    requireApprovalForFlowMutation?: boolean;
    requireApprovalForSecretUse?: boolean;
    autoImproveEnabled?: boolean;
    maxAutoImproveIterations?: number;
    maxRepairAttemptsPerRun?: number;
    maxSameFailureRepeats?: number;
    visualDiffThresholdPercent?: number;
  };
  integrations?: {
    github?: {
      enabled?: boolean;
      owner?: string;
      repo?: string;
      labels?: string[];
      createOn?: Array<'ci-failure' | 'monitor-failure' | 'local-failure'>;
    };
    linear?: {
      enabled?: boolean;
      teamId?: string;
      projectId?: string;
      label?: string;
      priority?: number;
      createOn?: Array<'ci-failure' | 'monitor-failure' | 'local-failure'>;
    };
  };
}

const EVIDENCE_SCHEMA_VERSION = '1.3';

/** Legacy colon commands removed in v1.3.0 — use canonical replacements */
const LEGACY_COMMAND_MAP: Record<string, string> = {
  'repair:list': 'ghostrun repair list',
  'repair:show': 'ghostrun repair show <id>',
  'repair:apply': 'ghostrun repair apply <id>',
  'profile:list': 'ghostrun profile list',
  'profile:show': 'ghostrun profile show <name>',
  'profile:create': 'ghostrun profile create <name>',
  'profile:use': 'ghostrun profile use <name>',
  'profile:set': 'ghostrun profile set <name> <key> <value>',
  'profile:delete': 'ghostrun profile delete <name>',
  'run:show': 'ghostrun report show <run-id>',
  'run:diff': 'ghostrun report diff <run1> <run2>',
  'run:analyze': 'ghostrun report analyze <run-id>',
  'run:list': 'ghostrun report list',
  'flow:list': 'ghostrun flow:list',
  'flow:schedule': 'ghostrun monitor schedule add <id> "<cron>"',
  'schedule:list': 'ghostrun monitor schedule list',
  'schedule:remove': 'ghostrun monitor schedule remove <id>',
  'create': 'ghostrun author create "<description>"',
  'flow:fix': 'ghostrun repair (interactive: flow:fix still works)',
  'baseline:set': 'ghostrun baseline:set <flow>',
  'baseline:show': 'ghostrun baseline:show <flow>',
  'baseline:clear': 'ghostrun baseline:clear <flow>',
  'suite:run': 'ghostrun run --suite <name>',
  'ai:usage': 'ghostrun ai usage',
  'ai:status': 'ghostrun ai status',
  'ai:sessions': 'ghostrun ai sessions',
};

function rejectLegacyCommand(cmd: string): void {
  const replacement = LEGACY_COMMAND_MAP[cmd];
  if (!replacement) return;
  errorMsg(`Command "${cmd}" was removed in GhostRun v1.3.0.\n  Use: ${replacement}`);
  process.exit(1);
}

function getSchedulerPidPath(): string {
  return path.join(PROJECT_GHOSTRUN_PATH, 'scheduler.pid');
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

interface GhostrunProfile {
  name: string;
  baseUrl?: string;
  variables?: Record<string, string>;
  auth?: {
    strategy?: 'none' | 'form' | 'storage-state' | 'basic-auth' | 'bearer-token' | 'otp-bypass';
    loginFlow?: string;
    username?: string;
    usernameVar?: string;
    usernameSecret?: string;
    passwordSecret?: string;
    tokenSecret?: string;
    /** Env var for staging test OTP (default 000000 when unset) */
    otpSecret?: string;
    /** Flow variable for OTP code (default testOtp) */
    otpVar?: string;
    storageState?: string;
  };
  metadata?: Record<string, string>;
  services?: ProfileServices;
  /** SaaS account types: superadmin, admin, manager, guest — email + password per role */
  accounts?: Record<string, ProfileAccount>;
  defaultAccount?: string;
}

interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}

interface AiSessionRecord {
  id: string;
  timestamp: string;
  mode: string;
  provider: string;
  model: string;
  interactionMode: InteractionMode;
  durationMs: number;
  usage: AiUsage;
  promptHash: string;
  promptPreview: string;
  responsePreview: string;
  metadata?: Record<string, string>;
}

type RepairType = 'selector' | 'assertion' | 'wait' | 'url' | 'config' | 'visual';

interface RepairProposal {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'proposed' | 'applied' | 'rejected';
  source: 'ai-heal' | 'ai-summary' | 'human';
  repairType?: RepairType;
  flowId: string;
  flowName: string;
  runId?: string;
  nodeId?: string;
  stepNumber?: number;
  action?: string;
  currentSelector?: string;
  proposedSelector?: string;
  currentValue?: string;
  proposedValue?: string;
  errorMessage?: string;
  rationale?: string;
}

interface MonitorAlertPayload {
  event: 'ghostrun.monitor.alert';
  flowId: string;
  flowName: string;
  profile: string | null;
  consecutiveFailures: number;
  error: string | null;
  timestamp: string;
}

interface ImproveReport {
  id: string;
  createdAt: string;
  status: 'generated' | 'blocked';
  autoImproveEnabled: boolean;
  interactionMode: InteractionMode;
  activeProfile?: string;
  findings: string[];
  actions: string[];
  summary?: string;
  safeguards: string[];
}

interface ScrapedField {
  type: string;
  name: string;
  placeholder: string;
  label: string;
  selector: string;
  required: boolean;
}

interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  forms: Array<{ selector: string; fields: ScrapedField[]; submitText: string; submitSelector: string | null }>;
  buttons: Array<{ text: string; selector: string }>;
  selected: Array<{ selector: string; text: string; html: string }>;
  text: string;
}

interface ScrapeResult {
  id: string;
  url: string;
  status: string;
  reason: string;
  maxPages: number;
  selector?: string;
  pages: ScrapedPage[];
  resultPath: string;
  createdAt: string;
}

function defaultConfig(): GhostrunConfig {
  return {
    project: {
      name: path.basename(process.cwd()),
      workspaceVersion: '1',
    },
    interactionMode: 'assist',
    features: {
      crawlee: { enabled: false },
    },
    ai: {
      provider: 'auto',
      trackUsage: true,
      storeSanitizedTranscripts: true,
    },
    policies: {
      allowAutoRepairApply: false,
      allowAiInCi: 'summary-only',
      requireApprovalForFlowMutation: true,
      requireApprovalForSecretUse: true,
      autoImproveEnabled: false,
      maxAutoImproveIterations: 3,
      maxRepairAttemptsPerRun: 2,
      maxSameFailureRepeats: 2,
      visualDiffThresholdPercent: 5,
    },
    integrations: {
      github: { enabled: false, labels: ['ghostrun', 'qa-failure'], createOn: ['ci-failure'] },
      linear: { enabled: false, label: 'ghostrun', createOn: ['ci-failure'] },
    },
  };
}

function readSingleConfig(filePath: string): GhostrunConfig {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as GhostrunConfig;
  } catch {
    return {};
  }
}

function readConfig(): GhostrunConfig {
  const base = defaultConfig();
  const globalConfig = readSingleConfig(GLOBAL_CONFIG_PATH);
  const projectConfig = readSingleConfig(PROJECT_CONFIG_PATH);
  return {
    ...base,
    ...globalConfig,
    ...projectConfig,
    project: { ...base.project, ...(globalConfig.project || {}), ...(projectConfig.project || {}) },
    features: {
      ...base.features,
      ...(globalConfig.features || {}),
      ...(projectConfig.features || {}),
      crawlee: {
        ...(base.features?.crawlee || {}),
        ...((globalConfig.features || {}).crawlee || {}),
        ...((projectConfig.features || {}).crawlee || {}),
      },
    },
    ai: { ...base.ai, ...(globalConfig.ai || {}), ...(projectConfig.ai || {}) },
    policies: { ...base.policies, ...(globalConfig.policies || {}), ...(projectConfig.policies || {}) },
    integrations: {
      ...base.integrations,
      ...(globalConfig.integrations || {}),
      ...(projectConfig.integrations || {}),
      github: {
        ...(base.integrations?.github || {}),
        ...((globalConfig.integrations || {}).github || {}),
        ...((projectConfig.integrations || {}).github || {}),
      },
      linear: {
        ...(base.integrations?.linear || {}),
        ...((globalConfig.integrations || {}).linear || {}),
        ...((projectConfig.integrations || {}).linear || {}),
      },
    },
  };
}

function writeConfig(config: GhostrunConfig, scope: 'global' | 'project' = 'project') {
  const configPath = scope === 'global' ? GLOBAL_CONFIG_PATH : PROJECT_CONFIG_PATH;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function ensureProjectWorkspace() {
  initProjectContext();
  refreshProjectConstants();
  const paths = getProjectPaths();
  ensureProjectDirs(paths);
  copyDevServicesTemplate();
  updateProjectGitignore();
  ensureProjectJson(readConfig().project?.name);

  if (!fs.existsSync(PROJECT_CONFIG_PATH)) writeConfig(defaultConfig(), 'project');

  const secretsReadme = path.join(PROJECT_GHOSTRUN_PATH, 'auth', 'secrets', 'README.txt');
  if (!fs.existsSync(secretsReadme)) {
    fs.writeFileSync(secretsReadme, [
      'Store local secret files here (gitignored).',
      'Prefer environment variables or your CI secret store when possible.',
      'Example: echo "my-token" > STAGING_API_TOKEN.txt',
      '',
    ].join('\n'));
  }
}

function getInteractionMode(): InteractionMode {
  return readConfig().interactionMode || 'assist';
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

function recordAiSession(entry: Omit<AiSessionRecord, 'id' | 'timestamp'>) {
  ensureProjectWorkspace();
  const record: AiSessionRecord = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  const filePath = path.join(PROJECT_GHOSTRUN_PATH, 'ai', 'sessions', `${record.timestamp.replace(/[:.]/g, '-')}-${record.id.slice(0, 8)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
}

function listAiSessions(limit = 50): AiSessionRecord[] {
  const dir = path.join(PROJECT_GHOSTRUN_PATH, 'ai', 'sessions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as AiSessionRecord;
      } catch {
        return null;
      }
    })
    .filter((x): x is AiSessionRecord => Boolean(x));
}

function aggregateAiUsage() {
  const sessions = listAiSessions(5000);
  const byProvider: Record<string, { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number }> = {};
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

function getProfilesDir(): string {
  ensureProjectWorkspace();
  return path.join(PROJECT_GHOSTRUN_PATH, 'profiles');
}

function profilePath(name: string): string {
  return path.join(getProfilesDir(), `${name}.json`);
}

function listProfiles(): GhostrunProfile[] {
  const dir = getProfilesDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as GhostrunProfile;
      } catch {
        return null;
      }
    })
    .filter((x): x is GhostrunProfile => Boolean(x));
}

function getProfile(name: string): GhostrunProfile | null {
  const filePath = profilePath(name);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as GhostrunProfile;
  } catch {
    return null;
  }
}

function saveProfile(profile: GhostrunProfile) {
  fs.writeFileSync(profilePath(profile.name), JSON.stringify(profile, null, 2));
}

function deleteProfile(name: string): boolean {
  const filePath = profilePath(name);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

function getSelectedProfileName(argv: string[] = process.argv.slice(2)): string | null {
  const idx = argv.indexOf('--profile');
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return readConfig().activeProfile || null;
}

function getSelectedProfile(argv: string[] = process.argv.slice(2)): GhostrunProfile | null {
  const name = getSelectedProfileName(argv);
  return name ? getProfile(name) : null;
}

function getProjectSecretsDir(): string {
  ensureProjectWorkspace();
  const dir = path.join(PROJECT_GHOSTRUN_PATH, 'auth', 'secrets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionFilePath(name: string): string {
  return path.join(DATA_PATH, 'sessions', `${name}.json`);
}

function getProjectStorageStateDir(): string {
  ensureProjectWorkspace();
  const dir = path.join(PROJECT_GHOSTRUN_PATH, 'auth', 'storage-state');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizeSecretEnvKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
}

function errorSignature(message: string | undefined): string {
  return (message || 'unknown')
    .replace(/\d+ms/g, 'Nms')
    .replace(/[0-9a-f]{8,}/gi, '[id]')
    .slice(0, 160);
}

function getRecentFailureRepeatCount(flowId: string, errorMessage: string): number {
  const signature = errorSignature(errorMessage);
  return db.listRuns(flowId, 50).filter(run =>
    run.status === 'failed' &&
    errorSignature(run.errorMessage || '') === signature
  ).length;
}

function getSelectorRepairAttemptCount(proposal: Pick<RepairProposal, 'flowId' | 'nodeId'>): number {
  return listRepairProposals(500).filter(item =>
    item.flowId === proposal.flowId &&
    item.nodeId === proposal.nodeId &&
    item.status === 'applied'
  ).length;
}

function getRepairType(proposal: RepairProposal): RepairType {
  if (proposal.repairType) return proposal.repairType;
  if (proposal.proposedSelector) return 'selector';
  if (proposal.proposedValue && ['assert:text', 'assert:title', 'assert:url', 'assert:response', 'assert:status'].includes(proposal.action || '')) {
    return 'assertion';
  }
  if (proposal.action === 'wait' || proposal.action === 'wait:ms') return 'wait';
  if (proposal.action === 'navigate') return 'url';
  if (proposal.repairType === 'visual' || proposal.errorMessage?.includes('[DIFF:')) return 'visual';
  return 'config';
}

async function postMonitorWebhook(url: string, payload: MonitorAlertPayload): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.log(chalk.yellow(`  notify webhook failed: HTTP ${res.status}`));
    }
  } catch (err) {
    console.log(chalk.yellow(`  notify webhook error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

async function postSlackAlert(webhookUrl: string, text: string): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.log(chalk.yellow(`  Slack notify failed: HTTP ${res.status}`));
    }
  } catch (err) {
    console.log(chalk.yellow(`  Slack notify error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

function resolveMonitorNotificationTargets(extraArgs: string[], profile: GhostrunProfile | null): {
  webhookUrl?: string;
  slackWebhook?: string;
  threshold: number;
  enabled: boolean;
} {
  const webhookUrl = parseFlagValue(extraArgs, '--notify-webhook')
    || profile?.metadata?.notifyWebhook
    || process.env.GHOSTRUN_NOTIFY_WEBHOOK;
  const slackWebhook = process.env.GHOSTRUN_SLACK_WEBHOOK
    || profile?.metadata?.slackWebhook;
  const thresholdRaw = parseFlagValue(extraArgs, '--notify-after')
    || profile?.metadata?.notifyAfterFailures
    || '3';
  const threshold = Math.max(1, parseInt(thresholdRaw, 10) || 3);
  const disabled = extraArgs.includes('--no-notify')
    || profile?.metadata?.notifyOnFailure === 'false';
  return {
    webhookUrl: webhookUrl || undefined,
    slackWebhook: slackWebhook || undefined,
    threshold,
    enabled: !disabled && Boolean(webhookUrl || slackWebhook),
  };
}

async function sendMonitorAlert(opts: {
  flow: { id: string; name: string };
  profileName?: string;
  consecutiveFailures: number;
  error?: string;
  webhookUrl?: string;
  slackWebhook?: string;
}): Promise<void> {
  const payload: MonitorAlertPayload = {
    event: 'ghostrun.monitor.alert',
    flowId: opts.flow.id,
    flowName: opts.flow.name,
    profile: opts.profileName || null,
    consecutiveFailures: opts.consecutiveFailures,
    error: opts.error || null,
    timestamp: new Date().toISOString(),
  };
  if (opts.webhookUrl) await postMonitorWebhook(opts.webhookUrl, payload);
  if (opts.slackWebhook) {
    const text = `:rotating_light: GhostRun monitor alert: *${opts.flow.name}* failed ${opts.consecutiveFailures}x in a row${opts.error ? `\n> ${opts.error}` : ''}`;
    await postSlackAlert(opts.slackWebhook, text);
  }
}

function buildAuthorContext(profileName?: string | null): string {
  const hints: string[] = [];
  if (profileName) {
    const profile = getProfile(profileName);
    if (profile?.baseUrl) hints.push(`Active profile "${profileName}" baseUrl: ${profile.baseUrl}`);
    if (profile?.variables && Object.keys(profile.variables).length) {
      hints.push(`Profile variables: ${Object.keys(profile.variables).join(', ')}`);
    }
  }

  const flows = db.listFlows().slice(0, 8);
  if (flows.length) {
    hints.push(`Existing flow patterns: ${flows.map(f => f.name).join(', ')}`);
  }

  const scrapesDir = SCRAPES_PATH;
  if (fs.existsSync(scrapesDir)) {
    const recentScrapes = fs.readdirSync(scrapesDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 2);
    for (const file of recentScrapes) {
      try {
        const scrape = JSON.parse(fs.readFileSync(path.join(scrapesDir, file), 'utf8')) as { pages?: ScrapedPage[] };
        const page = scrape.pages?.[0];
        if (page?.forms?.length) {
          hints.push(`Recent form selectors on ${page.url}: ${page.forms[0].fields.slice(0, 4).map(f => f.selector).join(', ')}`);
        }
      } catch { /* ignore */ }
    }
  }

  return hints.length ? `\nProject context:\n${hints.map(h => `- ${h}`).join('\n')}` : '';
}

function detectFlakyFlows(limit = 10): string[] {
  const flaky: string[] = [];
  for (const flow of db.listFlows()) {
    const runs = db.listRuns(flow.id, limit);
    if (runs.length < 4) continue;
    const statuses = runs.map(r => r.status);
    if (!statuses.includes('passed') || !statuses.includes('failed')) continue;
    let transitions = 0;
    for (let i = 1; i < statuses.length; i++) {
      if (statuses[i] !== statuses[i - 1]) transitions++;
    }
    if (transitions >= 2) flaky.push(flow.name);
  }
  return flaky;
}

async function createFailureRepairProposal(params: {
  action: string;
  errorMessage: string;
  page: import('playwright').Page | null;
  node: Record<string, unknown>;
  flow: { id: string; name: string };
  runId: string;
  stepNum: number;
  selectedProfile: GhostrunProfile | null;
}): Promise<RepairProposal | null> {
  const { action, errorMessage, page, node, flow, runId, stepNum, selectedProfile } = params;

  if (['assert:text', 'assert:title', 'assert:url'].includes(action)) {
    let actualValue = '';
    if (page) {
      if (action === 'assert:text') {
        actualValue = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => '');
      } else if (action === 'assert:title') {
        actualValue = await page.title().catch(() => '');
      } else if (action === 'assert:url') {
        actualValue = page.url();
      }
    }
    const expected = String(node.value || '');
    let proposed = expected;
    if (action === 'assert:text' && actualValue) {
      const lines = actualValue.split('\n').map(l => l.trim()).filter(Boolean);
      const candidate = lines.find(l => l.length > 3 && l.length < 80);
      if (candidate) proposed = candidate;
    } else if (action === 'assert:title' && actualValue) {
      proposed = actualValue.split(' ').slice(0, 5).join(' ');
    } else if (action === 'assert:url' && actualValue) {
      try {
        proposed = new URL(actualValue).pathname;
      } catch {
        proposed = actualValue;
      }
    }
    if (proposed === expected) return null;
    return createRepairProposal({
      source: 'ai-heal',
      repairType: 'assertion',
      flowId: flow.id,
      flowName: flow.name,
      runId,
      nodeId: String(node.id || ''),
      stepNumber: stepNum,
      action,
      currentValue: expected,
      proposedValue: proposed,
      errorMessage,
      rationale: `Assertion failed. Expected "${expected}" but observed "${actualValue.slice(0, 120)}". Review whether the expected value should be updated.`,
    });
  }

  if (action === 'wait' || errorMessage.toLowerCase().includes('timeout')) {
    return createRepairProposal({
      source: 'ai-heal',
      repairType: 'wait',
      flowId: flow.id,
      flowName: flow.name,
      runId,
      nodeId: String(node.id || ''),
      stepNumber: stepNum,
      action,
      currentSelector: node.selector as string | undefined,
      currentValue: '10000',
      proposedValue: '20000',
      errorMessage,
      rationale: 'Step timed out waiting for an element. Consider increasing wait time or switching to wait:text / wait:url.',
    });
  }

  if (action === 'navigate' && /404|net::ERR|Navigation|ENOTFOUND/i.test(errorMessage)) {
    const profileHint = selectedProfile?.baseUrl
      ? `Check profile baseUrl (${selectedProfile.baseUrl}) or update the flow URL.`
      : 'Set baseUrl in your active profile.';
    return createRepairProposal({
      source: 'ai-heal',
      repairType: 'url',
      flowId: flow.id,
      flowName: flow.name,
      runId,
      nodeId: String(node.id || ''),
      stepNumber: stepNum,
      action,
      currentValue: String(node.url || node.value || ''),
      proposedValue: selectedProfile?.baseUrl || '',
      errorMessage,
      rationale: `Navigation failed. ${profileHint}`,
    });
  }

  return null;
}

async function resolveSecretValue(ref?: string): Promise<string | undefined> {
  if (!ref) return undefined;

  const envCandidates = [ref, normalizeSecretEnvKey(ref)];
  for (const key of envCandidates) {
    if (process.env[key]) return process.env[key];
  }

  const fileCandidates = [
    path.join(getProjectSecretsDir(), ref),
    path.join(getProjectSecretsDir(), `${ref}.txt`),
  ];
  for (const filePath of fileCandidates) {
    if (!fs.existsSync(filePath)) continue;
    const value = fs.readFileSync(filePath, 'utf8').trim();
    if (value) return value;
  }

  try {
    const vaultModule = await import('./packages/vault/src/vault');
    const vault = vaultModule.createVault();
    const credential = await vault.getByName(ref);
    if (credential?.password) return credential.password;
  } catch {
    // Ignore vault errors and fall back to undefined
  }

  return undefined;
}

function resolveStorageStatePath(profile: GhostrunProfile): string | undefined {
  const raw = profile.auth?.storageState?.trim();
  if (!raw) {
    const fallback = path.join(getProjectStorageStateDir(), `${profile.name}.json`);
    return fs.existsSync(fallback) ? fallback : undefined;
  }
  const filePath = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  if (fs.existsSync(filePath)) return filePath;
  const projectPath = path.join(getProjectStorageStateDir(), raw.endsWith('.json') ? raw : `${raw}.json`);
  return fs.existsSync(projectPath) ? projectPath : undefined;
}

interface ResolvedProfileAuth {
  strategy: NonNullable<GhostrunProfile['auth']>['strategy'];
  summary: string;
  sessionLoadName?: string;
  browserContextOptions?: {
    storageState?: string;
    httpCredentials?: { username: string; password: string };
    extraHTTPHeaders?: Record<string, string>;
  };
  apiAuth?: ExecutionContext['profileAuth'];
  injectedVars?: Record<string, string>;
}

async function resolveProfileAuth(profile: GhostrunProfile, runVars: Record<string, string>, flowId: string, opts?: { ci?: boolean; visible?: boolean; quiet?: boolean; accountId?: string | null }): Promise<ResolvedProfileAuth | null> {
  const accountId = opts?.accountId ?? null;
  const auth = getEffectiveAuthForAccount(profile, accountId);
  const strategy = auth?.strategy || profile.auth?.strategy || 'none';
  if (strategy === 'none') return null;

  const injectedVars: Record<string, string> = {};
  const usernameVar = auth?.usernameVar || profile.auth?.usernameVar;
  const resolvedUsername = profile.auth?.username
    || (usernameVar ? runVars[usernameVar] : undefined)
    || runVars.accountEmail
    || runVars.testEmail
    || await resolveSecretValue(auth?.usernameSecret || profile.auth?.usernameSecret)
    || runVars.PROFILE_AUTH_USERNAME
    || runVars.AUTH_USERNAME;

  if (resolvedUsername) {
    injectedVars.PROFILE_AUTH_USERNAME = resolvedUsername;
    if (usernameVar && !runVars[usernameVar]) {
      injectedVars[usernameVar] = resolvedUsername;
    }
    if (!runVars.testEmail) injectedVars.testEmail = resolvedUsername;
    if (!runVars.accountEmail) injectedVars.accountEmail = resolvedUsername;
  }

  switch (strategy) {
    case 'storage-state': {
      const storageStatePath = resolveStorageStatePath(profile);
      if (!storageStatePath) {
        throw new Error(`Profile "${profile.name}" uses storage-state auth but no storage state file was found.`);
      }
      return {
        strategy: 'storage-state',
        summary: accountId ? `storage-state:${path.basename(storageStatePath)} (${accountId})` : `storage-state:${path.basename(storageStatePath)}`,
        browserContextOptions: { storageState: storageStatePath },
        injectedVars,
      };
    }
    case 'basic-auth': {
      const password = await resolveSecretValue(auth?.passwordSecret || profile.auth?.passwordSecret);
      if (!resolvedUsername || !password) {
        throw new Error(`Profile "${profile.name}"${accountId ? ` account "${accountId}"` : ''} needs email and password for basic-auth.`);
      }
      injectedVars.PROFILE_AUTH_PASSWORD = password;
      return {
        strategy: 'basic-auth',
        summary: accountId ? `basic-auth (${accountId})` : 'basic-auth',
        browserContextOptions: {
          httpCredentials: { username: resolvedUsername, password },
        },
        apiAuth: { type: 'basic', username: resolvedUsername, password },
        injectedVars,
      };
    }
    case 'bearer-token': {
      const token = await resolveSecretValue(auth?.tokenSecret || profile.auth?.tokenSecret || auth?.passwordSecret);
      if (!token) {
        throw new Error(`Profile "${profile.name}" needs tokenSecret for bearer-token auth.`);
      }
      injectedVars.PROFILE_AUTH_TOKEN = token;
      return {
        strategy: 'bearer-token',
        summary: accountId ? `bearer-token (${accountId})` : 'bearer-token',
        browserContextOptions: {
          extraHTTPHeaders: { Authorization: `Bearer ${token}` },
        },
        apiAuth: { type: 'bearer', token },
        injectedVars,
      };
    }
    case 'form': {
      const loginFlow = auth?.loginFlow || profile.auth?.loginFlow;
      if (!loginFlow) {
        throw new Error(`Profile "${profile.name}" uses form auth but has no auth.loginFlow configured.`);
      }
      const password = await resolveSecretValue(auth?.passwordSecret || profile.auth?.passwordSecret);
      if (!resolvedUsername) {
        throw new Error(
          `Profile "${profile.name}"${accountId ? ` account "${accountId}"` : ''} needs an email for form login. ` +
          `Set email on the account, emailSecret env var, or variables.testEmail.`,
        );
      }
      if (!password) {
        throw new Error(
          `Profile "${profile.name}"${accountId ? ` account "${accountId}"` : ''} needs password secret ` +
          `"${auth?.passwordSecret || profile.auth?.passwordSecret}".`,
        );
      }
      injectedVars.PROFILE_AUTH_PASSWORD = password;
      const passKey = auth?.passwordSecret || profile.auth?.passwordSecret;
      if (passKey && !runVars[passKey]) {
        injectedVars[passKey] = password;
      }
      const sessionLoadName = `profile-auth-${flowId.slice(0, 8)}-${shortHash(`${profile.name}:${accountId || 'default'}:${Date.now()}`)}`;
      const authRun = await executeFlow(loginFlow, { ...runVars, ...injectedVars }, {
        visible: opts?.visible,
        quiet: true,
        ci: opts?.ci,
        allowAiSummary: false,
        sessionSave: sessionLoadName,
        skipProfileAuth: true,
      });
      if (!authRun.passed) {
        throw new Error(`Profile login flow failed${accountId ? ` (${accountId})` : ''}: ${authRun.error || 'authentication run failed'}`);
      }
      return {
        strategy: 'form',
        summary: accountId ? `form:${loginFlow} (${accountId})` : `form:${loginFlow}`,
        sessionLoadName,
        injectedVars,
      };
    }
    case 'otp-bypass': {
      const loginFlow = auth?.loginFlow || profile.auth?.loginFlow;
      if (!loginFlow) {
        throw new Error(`Profile "${profile.name}" uses otp-bypass auth but has no auth.loginFlow configured.`);
      }
      const otpVar = auth?.otpVar || profile.auth?.otpVar || 'testOtp';
      const otpSecret = auth?.otpSecret || profile.auth?.otpSecret || 'STAGING_TEST_OTP';
      const otpFromEnv = await resolveSecretValue(otpSecret);
      const testOtp = otpFromEnv || process.env[otpSecret] || '000000';
      injectedVars[otpVar] = testOtp;
      injectedVars.testOtp = testOtp;
      injectedVars.PROFILE_AUTH_OTP = testOtp;
      if (otpSecret && !runVars[otpSecret]) injectedVars[otpSecret] = testOtp;

      if (resolvedUsername) {
        injectedVars.testPhone = resolvedUsername;
        injectedVars.accountPhone = resolvedUsername;
      }

      const sessionLoadName = `profile-auth-${flowId.slice(0, 8)}-${shortHash(`${profile.name}:${accountId || 'default'}:otp:${Date.now()}`)}`;
      const authRun = await executeFlow(loginFlow, { ...runVars, ...injectedVars }, {
        visible: opts?.visible,
        quiet: true,
        ci: opts?.ci,
        allowAiSummary: false,
        sessionSave: sessionLoadName,
        skipProfileAuth: true,
      });
      if (!authRun.passed) {
        throw new Error(`Profile OTP login flow failed${accountId ? ` (${accountId})` : ''}: ${authRun.error || 'authentication run failed'}`);
      }
      return {
        strategy: 'otp-bypass',
        summary: accountId ? `otp-bypass:${loginFlow} (${accountId})` : `otp-bypass:${loginFlow}`,
        sessionLoadName,
        injectedVars,
      };
    }
    default:
      return null;
  }
}

function isProductionLike(profile: GhostrunProfile | null, startUrl?: string): boolean {
  if (profile?.name?.toLowerCase() === 'production') return true;
  if (profile?.metadata?.tier?.toLowerCase() === 'production') return true;
  if (!startUrl) return false;
  return getEnvLabel(startUrl).label === 'production';
}

function getRepairProposalsDir(): string {
  ensureProjectWorkspace();
  return path.join(PROJECT_GHOSTRUN_PATH, 'proposals', 'repairs');
}

function writeRepairProposal(proposal: RepairProposal) {
  const filePath = path.join(getRepairProposalsDir(), `${proposal.createdAt.replace(/[:.]/g, '-')}-${proposal.id.slice(0, 8)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2));
}

function countRepairProposalsForRun(runId: string): number {
  return listRepairProposals(200).filter(p => p.runId === runId).length;
}

function createRepairProposal(data: Omit<RepairProposal, 'id' | 'createdAt' | 'updatedAt' | 'status'>): RepairProposal | null {
  const maxAttempts = readConfig().policies?.maxRepairAttemptsPerRun ?? 2;
  if (data.runId && countRepairProposalsForRun(data.runId) >= maxAttempts) {
    return null;
  }
  const now = new Date().toISOString();
  const proposal: RepairProposal = {
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
    status: 'proposed',
    ...data,
  };
  writeRepairProposal(proposal);
  return proposal;
}

function listRepairProposals(limit = 50): RepairProposal[] {
  const dir = getRepairProposalsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RepairProposal;
      } catch {
        return null;
      }
    })
    .filter((x): x is RepairProposal => Boolean(x));
}

function findRepairProposal(id: string): { proposal: RepairProposal; filePath: string } | null {
  const dir = getRepairProposalsDir();
  if (!fs.existsSync(dir)) return null;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()) {
    const filePath = path.join(dir, file);
    try {
      const proposal = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RepairProposal;
      if (proposal.id.startsWith(id)) return { proposal, filePath };
    } catch {}
  }
  return null;
}

function updateRepairProposal(id: string, updates: Partial<RepairProposal>): RepairProposal | null {
  const found = findRepairProposal(id);
  if (!found) return null;
  const next: RepairProposal = {
    ...found.proposal,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(found.filePath, JSON.stringify(next, null, 2));
  return next;
}

function getImproveReportsDir(): string {
  ensureProjectWorkspace();
  return path.join(PROJECT_GHOSTRUN_PATH, 'reports', 'improve');
}

function saveImproveReport(report: ImproveReport) {
  fs.mkdirSync(getImproveReportsDir(), { recursive: true });
  const filePath = path.join(getImproveReportsDir(), `${report.createdAt.replace(/[:.]/g, '-')}-${report.id.slice(0, 8)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}

function isCrawleeEnabled(): boolean {
  return readConfig().features?.crawlee?.enabled === true;
}

function setCrawleeEnabled(enabled: boolean) {
  const config = readConfig();
  config.features = config.features || {};
  config.features.crawlee = { ...(config.features.crawlee || {}), enabled };
  writeConfig(config, 'project');
}

async function loadCrawlee(): Promise<{ PlaywrightCrawler: any; log?: any; LogLevel?: any }> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
    return await dynamicImport('crawlee') as { PlaywrightCrawler: any; log?: any; LogLevel?: any };
  } catch {
    throw new Error('Crawlee is not installed. Run: npm install crawlee');
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

function sanitizeStoredValue(value: string | undefined, label?: string, selector?: string): string | undefined {
  if (!value) return value;
  const context = `${label || ''} ${selector || ''}`.toLowerCase();
  if (/(password|passwd|pwd|token|secret|auth)/.test(context)) {
    return '[REDACTED]';
  }
  return sanitizePII(value);
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
  profileAuth?: {
    type: 'basic' | 'bearer';
    username?: string;
    password?: string;
    token?: string;
  };
  profileServices?: ProfileServices;
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
  } else if (!headers['Authorization'] && ctx.profileAuth?.type === 'bearer' && ctx.profileAuth.token) {
    headers['Authorization'] = `Bearer ${ctx.profileAuth.token}`;
  } else if (!headers['Authorization'] && ctx.profileAuth?.type === 'basic' && ctx.profileAuth.username) {
    const creds = Buffer.from(`${ctx.profileAuth.username}:${ctx.profileAuth.password || ''}`).toString('base64');
    headers['Authorization'] = `Basic ${creds}`;
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

  const sanitizedResponseHeaders = Object.fromEntries(
    Object.entries(responseHeaders).map(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization'].includes(lowerKey)) {
        return [key, '[REDACTED]'];
      }
      return [key, sanitizePII(value)];
    })
  );

  db.saveApiResponse({
    runId, stepNumber, method, url,
    statusCode: response.status,
    responseTimeMs,
    responseHeaders: sanitizedResponseHeaders,
    responseBody: sanitizePII(bodyText.slice(0, 10000)),
  });

  // Auto-extract variables from response if 'extract' map is specified
  const extract = node.extract as Record<string, string> | undefined;
  if (extract && bodyJson) {
    for (const [varName, jsonPath] of Object.entries(extract)) {
      const val = getJsonPath(bodyJson, jsonPath);
      if (val !== undefined) {
        ctx.variables[varName] = String(val);
        db.saveRunData(runId, stepNumber, varName, sanitizePII(String(val)));
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
  db.saveRunData(runId, stepNumber, varName, sanitizePII(String(value ?? '')));
}

function executeExtractJson(node: Record<string, unknown>, ctx: ExecutionContext, runId: string, stepNumber: number): void {
  const varName = node.variable as string;
  const jsonPath = node.path as string;
  if (!varName || !jsonPath) throw new Error('extract:json requires variable and path');
  if (!ctx.lastResponse) throw new Error('extract:json — no HTTP response in context');
  const val = getJsonPath(ctx.lastResponse.body, jsonPath);
  if (val === undefined) throw new Error(`JSON path "${jsonPath}" not found in response`);
  ctx.variables[varName] = String(val);
  db.saveRunData(runId, stepNumber, varName, sanitizePII(String(val)));
}

// ============================================
// LOAD TESTING ENGINE
// ============================================

interface PerfSample {
  label: string;
  duration: number;
  success: boolean;
  vuId: number;
  isHttp: boolean;   // true = actual HTTP call, false = assertion/extract
}

interface PerfStats {
  total: number;
  success: number;
  failed: number;
  errorRate: number;
  avgRps: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

interface PerfConfig {
  vus: number;
  duration: number;  // ms
  rampUp: number;    // ms
  timeout: number;   // ms per request
}

function calcPercentile(sortedMs: number[], pct: number): number {
  if (!sortedMs.length) return 0;
  const idx = Math.ceil((pct / 100) * sortedMs.length) - 1;
  return sortedMs[Math.max(0, Math.min(idx, sortedMs.length - 1))];
}

function calcStats(samples: PerfSample[], durationMs: number): PerfStats {
  // Summary counts only HTTP requests; assertions are in-process and don't count as "requests"
  const httpSamples = samples.filter(s => s.isHttp);
  const total = httpSamples.length;
  const success = httpSamples.filter(s => s.success).length;
  const failed = total - success;
  // Latency is also HTTP-only (assertions complete in <1ms and skew p99 to zero)
  const durations = httpSamples.map(s => s.duration).sort((a, b) => a - b);
  return {
    total, success, failed,
    errorRate: total > 0 ? parseFloat(((failed / total) * 100).toFixed(1)) : 0,
    avgRps: parseFloat((total / (durationMs / 1000)).toFixed(1)),
    p50: calcPercentile(durations, 50),
    p95: calcPercentile(durations, 95),
    p99: calcPercentile(durations, 99),
    min: durations[0] ?? 0,
    max: durations[durations.length - 1] ?? 0,
  };
}

// DB-free API step execution used for load testing (no audit log per sample)
async function runApiStepDirect(
  node: Record<string, unknown>,
  action: string,
  ctx: ExecutionContext,
  timeoutMs: number
): Promise<void> {
  const API_ONLY_ACTIONS = new Set(['http:request','assert:response','assert:status','assert:body',
    'assert:header','assert:time','set:variable','extract:json','env:switch',
    'email:wait','email:extract-link','email:extract-otp','webhook:wait','webhook:assert',
    'assert:webhook-signature','services:seed','db:query','db:assert']);
  if (!API_ONLY_ACTIONS.has(action)) return; // skip browser actions silently

  if (action === 'http:request') {
    const method = ((node.method as string) || 'GET').toUpperCase();
    const url = resolveVarsDeep(node.url as string, ctx) as string;
    const rawHeaders = (node.headers as Record<string, string>) || {};
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) headers[k] = resolveVarsDeep(v, ctx) as string;
    const auth = node.auth as Record<string, string> | undefined;
    if (auth?.type === 'bearer' && auth.token) {
      headers['Authorization'] = `Bearer ${resolveVarsDeep(auth.token, ctx)}`;
    } else if (auth?.type === 'basic' && auth.username) {
      const creds = Buffer.from(`${resolveVarsDeep(auth.username, ctx)}:${resolveVarsDeep(auth.password || '', ctx)}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    } else if (auth?.type === 'apikey' && auth.key) {
      headers[auth.header || 'X-API-Key'] = resolveVarsDeep(auth.key, ctx) as string;
    }
    let body: string | undefined;
    if (node.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      const resolved = resolveVarsDeep(node.body, ctx);
      body = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t = Date.now();
    let response: Response;
    try {
      response = await fetch(url, { method, headers, body, signal: controller.signal });
    } finally { clearTimeout(timer); }
    const responseTimeMs = Date.now() - t;
    let bodyText = '';
    let bodyJson: unknown = null;
    try { bodyText = await response.text(); } catch {}
    try { bodyJson = JSON.parse(bodyText); } catch {}
    ctx.lastResponse = {
      status: response.status, headers: {} as Record<string, string>,
      body: bodyJson ?? bodyText, bodyText, responseTimeMs, url, method,
    };
    // inline extract
    const extract = node.extract as Record<string, string> | undefined;
    if (extract && bodyJson) {
      for (const [varName, jp] of Object.entries(extract)) {
        const val = getJsonPath(bodyJson, jp);
        if (val !== undefined) ctx.variables[varName] = String(val);
      }
    }
  } else if (action.startsWith('assert:')) {
    await executeApiAssert(node, ctx);
  } else if (action === 'set:variable') {
    const varName = node.variable as string;
    if (varName) ctx.variables[varName] = String(resolveVarsDeep(node.value, ctx) ?? '');
  } else if (action === 'extract:json') {
    const varName = node.variable as string;
    const jp = node.path as string;
    if (varName && jp && ctx.lastResponse) {
      const val = getJsonPath(ctx.lastResponse.body, jp);
      if (val !== undefined) ctx.variables[varName] = String(val);
    }
  }
}

async function runVU(
  vuId: number,
  actionNodes: Record<string, unknown>[],
  baseVars: Record<string, string>,
  endTime: number,
  samples: PerfSample[],
  timeoutMs: number
): Promise<void> {
  while (Date.now() < endTime) {
    const ctx: ExecutionContext = { variables: { ...baseVars } };
    for (const node of actionNodes) {
      if (Date.now() >= endTime) return;
      const action = node.action as string;
      const label = node.label as string || action;
      const t = Date.now();
      try {
        const resolvedNode = {
          ...node,
          url: node.url ? resolveVarsDeep(node.url as string, ctx) : node.url,
          value: node.value ? resolveVarsDeep(node.value as string, ctx) : node.value,
        };
        await runApiStepDirect(resolvedNode, action, ctx, timeoutMs);
        const isHttp = action === 'http:request';
        // For HTTP steps, success = 2xx/3xx status code (not 4xx/5xx).
        // For assertions/extracts, no exception thrown = success.
        const httpSuccess = isHttp ? (ctx.lastResponse?.status ?? 0) < 400 : true;
        samples.push({ label, duration: Date.now() - t, success: httpSuccess, vuId, isHttp });
      } catch {
        const isHttp = action === 'http:request';
        samples.push({ label, duration: Date.now() - t, success: false, vuId, isHttp });
        break; // restart iteration on failure
      }
    }
  }
}

async function runPerfTest(
  flowId: string,
  config: PerfConfig
): Promise<{ stats: PerfStats; checksTotal: number; checksFailed: number; perStep: Record<string, PerfStats>; perfRunId: string }> {
  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) throw new Error('Flow not found: ' + flowId);

  const graph = JSON.parse(flow.graph) as { nodes?: Record<string, unknown>[] };
  const API_ONLY = new Set(['http:request','assert:response','assert:status','assert:body',
    'assert:header','assert:time','set:variable','extract:json','env:switch']);
  const actionNodes = (graph.nodes || []).filter(n => n.type === 'action');
  const apiNodes = actionNodes.filter(n => API_ONLY.has(n.action as string));
  if (!apiNodes.length) throw new Error('No API steps found in this flow. perf:run only supports API flows.');

  // Load active env vars
  const baseVars: Record<string, string> = {};
  const activeEnv = db.getActiveEnvironment();
  if (activeEnv) Object.assign(baseVars, activeEnv.variables);

  const perfRunId = db.createPerfRun({ flowId: flow.id, flowName: flow.name, config });
  const samples: PerfSample[] = [];
  const testStart = Date.now();
  const endTime = testStart + config.duration;

  // Stagger VU startup over rampUp window
  const vuPromises: Promise<void>[] = [];
  const rampDelay = config.vus > 1 ? config.rampUp / (config.vus - 1) : 0;
  for (let i = 0; i < config.vus; i++) {
    const delay = Math.round(i * rampDelay);
    vuPromises.push(
      new Promise(resolve => setTimeout(resolve, delay)).then(() =>
        runVU(i, apiNodes, baseVars, endTime, samples, config.timeout)
      )
    );
  }

  await Promise.all(vuPromises);
  const actualDuration = Date.now() - testStart;

  const stats = calcStats(samples, actualDuration);

  // Per-step breakdown — use all samples so assert/extract steps still show counts
  const perStep: Record<string, PerfStats> = {};
  const stepLabels = [...new Set(samples.map(s => s.label))];
  for (const label of stepLabels) {
    const stepSamples = samples.filter(s => s.label === label);
    // For HTTP steps: filter by isHttp (real timings). For non-HTTP: use raw count/success.
    const isHttpStep = stepSamples.some(s => s.isHttp);
    if (isHttpStep) {
      perStep[label] = calcStats(stepSamples, actualDuration);
    } else {
      // Assertion / extract step — show all samples, latency is trivially 0ms
      const total = stepSamples.length;
      const success = stepSamples.filter(s => s.success).length;
      const failed = total - success;
      const durations = stepSamples.map(s => s.duration).sort((a, b) => a - b);
      perStep[label] = {
        total, success, failed,
        errorRate: total > 0 ? parseFloat(((failed / total) * 100).toFixed(1)) : 0,
        avgRps: parseFloat((total / (actualDuration / 1000)).toFixed(1)),
        p50: calcPercentile(durations, 50), p95: calcPercentile(durations, 95),
        p99: calcPercentile(durations, 99), min: durations[0] ?? 0,
        max: durations[durations.length - 1] ?? 0,
      };
    }
  }

  db.updatePerfRun(perfRunId, {
    status: 'done',
    totalRequests: stats.total, successRequests: stats.success, failedRequests: stats.failed,
    avgRps: stats.avgRps, p50: stats.p50, p95: stats.p95, p99: stats.p99,
    minMs: stats.min, maxMs: stats.max, perStepStats: perStep,
  });

  const checkSamples = samples.filter(s => !s.isHttp);
  const checksTotal = checkSamples.length;
  const checksFailed = checkSamples.filter(s => !s.success).length;

  return { stats, checksTotal, checksFailed, perStep, perfRunId };
}

// ============================================
// K6 SCRIPT GENERATOR
// ============================================

function generateK6Script(
  flowName: string,
  actionNodes: Record<string, unknown>[],
  config: { vus: number; duration: number; p95threshold: number; errorThreshold: number }
): string {
  const lines: string[] = [];
  const durationSec = Math.round(config.duration / 1000);

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

  // Collect custom metrics per HTTP step
  const httpSteps = actionNodes.filter(n => n.action === 'http:request');
  for (const node of httpSteps) {
    const varName = k6VarName(node.label as string || 'request');
    lines.push(`const ${varName}Duration = new Trend('${varName}_duration');`);
  }
  if (httpSteps.length) lines.push(``);

  lines.push(`export default function () {`);
  lines.push(`  let res;`);

  // Track variable declarations to avoid re-declaring
  const declaredVars = new Set<string>();
  let lastHttpVarName = 'res';
  let lastHttpNodeLabel = '';

  for (const node of actionNodes) {
    const action = node.action as string;

    if (action === 'set:variable') {
      const varName = node.variable as string;
      const val = toK6Value(node.value);
      if (!declaredVars.has(varName)) {
        lines.push(`  let ${varName} = ${val};`);
        declaredVars.add(varName);
      } else {
        lines.push(`  ${varName} = ${val};`);
      }
    } else if (action === 'http:request') {
      const method = ((node.method as string) || 'GET').toUpperCase();
      const url = toK6Value(node.url);
      const metricVar = k6VarName(node.label as string || 'request') + 'Duration';
      lastHttpNodeLabel = node.label as string || '';
      lastHttpVarName = `r${httpSteps.indexOf(node) + 1}`;

      // Build params (headers + auth)
      const paramParts: string[] = [];
      const headerEntries: string[] = [];
      const rawHeaders = (node.headers as Record<string, string>) || {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        headerEntries.push(`'${k}': ${toK6Value(v)}`);
      }
      const auth = node.auth as Record<string, string> | undefined;
      if (auth?.type === 'bearer') {
        headerEntries.push(`'Authorization': \`Bearer \${${toK6Var(auth.token || '')}}\``);
      } else if (auth?.type === 'basic') {
        headerEntries.push(`'Authorization': 'Basic ' + btoa(\`\${${toK6Var(auth.username || '')}}:\${${toK6Var(auth.password || '')}}\`)`);
      } else if (auth?.type === 'apikey') {
        headerEntries.push(`'${auth.header || 'X-API-Key'}': ${toK6Value(auth.key || '')}`);
      }
      if (headerEntries.length) {
        paramParts.push(`headers: { ${headerEntries.join(', ')} }`);
      }
      const paramStr = paramParts.length ? `, { ${paramParts.join(', ')} }` : '';

      if (['GET', 'DELETE', 'HEAD'].includes(method)) {
        lines.push(`  const ${lastHttpVarName} = http.${method.toLowerCase()}(${url}${paramStr});`);
      } else {
        const bodyVal = node.body ? toK6Value(node.body) : 'null';
        const hasContentType = headerEntries.some(h => h.includes('Content-Type'));
        const ctHeader = hasContentType ? '' : `, headers: { 'Content-Type': 'application/json' }`;
        const bodyStr = `JSON.stringify(${bodyVal})`;
        const pStr = paramParts.length ? `, { ${paramParts.join(', ')}${ctHeader} }` : `, { headers: { 'Content-Type': 'application/json' } }`;
        lines.push(`  const ${lastHttpVarName} = http.${method.toLowerCase()}(${url}, ${bodyStr}${pStr});`);
      }
      lines.push(`  ${metricVar}.add(${lastHttpVarName}.timings.duration);`);

      // Inline extracts
      const extract = node.extract as Record<string, string> | undefined;
      if (extract) {
        for (const [varName, jp] of Object.entries(extract)) {
          const jsonKey = jp.replace(/^\$\.?/, '');
          if (!declaredVars.has(varName)) {
            lines.push(`  let ${varName} = ${lastHttpVarName}.json('${jsonKey}');`);
            declaredVars.add(varName);
          } else {
            lines.push(`  ${varName} = ${lastHttpVarName}.json('${jsonKey}');`);
          }
        }
      }
    } else if (action === 'assert:response' || action.startsWith('assert:')) {
      const assertType = (node.assert as string) || 'status';
      const checkLabel = (node.label as string) || `assert ${assertType}`;
      let checkFn = '';
      switch (assertType) {
        case 'status':
          checkFn = `(r) => r.status === ${node.expected ?? 200}`;
          break;
        case 'body:contains':
          checkFn = `(r) => r.body.includes(${JSON.stringify(node.expected ?? '')})`;
          break;
        case 'json:path': {
          const jp = ((node.path as string) || '').replace(/^\$\.?/, '');
          checkFn = `(r) => String(r.json('${jp}')) === ${JSON.stringify(String(node.expected ?? ''))}`;
          break;
        }
        case 'json:exists': {
          const jp = ((node.path as string) || '').replace(/^\$\.?/, '');
          checkFn = `(r) => r.json('${jp}') !== null`;
          break;
        }
        case 'header':
          checkFn = `(r) => r.headers['${node.header ?? ''}'] !== undefined`;
          break;
        case 'time':
          checkFn = `(r) => r.timings.duration < ${node.expected ?? 2000}`;
          break;
        default:
          checkFn = `() => true /* ${assertType} */`;
      }
      lines.push(`  check(${lastHttpVarName}, { ${JSON.stringify(checkLabel)}: ${checkFn} });`);
    } else if (action === 'extract:json') {
      const varName = node.variable as string;
      const jp = ((node.path as string) || '').replace(/^\$\.?/, '');
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
  return lines.join('\n');
}

function k6VarName(label: string): string {
  return label.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_').toLowerCase() || 'step';
}

function toK6Value(val: unknown): string {
  if (typeof val === 'string') {
    // Convert {{var}} to ${var} template literals
    if (val.includes('{{')) {
      const converted = val.replace(/\{\{(\w+)\}\}/g, (_, k) => `\${${k}}`);
      return `\`${converted}\``;
    }
    return JSON.stringify(val);
  }
  if (typeof val === 'object' && val !== null) {
    // Recursively convert object values
    const entries = Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${JSON.stringify(k)}: ${toK6Value(v)}`).join(', ');
    return `{ ${entries} }`;
  }
  return JSON.stringify(val);
}

function toK6Var(val: string): string {
  if (val.match(/^\{\{(\w+)\}\}$/)) return val.replace(/^\{\{(\w+)\}\}$/, '$1');
  return JSON.stringify(val);
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

async function callAnthropic(prompt: string): Promise<{ text: string | null; usage: AiUsage; model: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });
    const model = 'claude-3-5-haiku-20241022';
    const msg = await client.messages.create({
      model, max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = msg.content[0];
    const text = content.type === 'text' ? content.text.trim() : null;
    const inputTokens = Number((msg as any).usage?.input_tokens || 0);
    const outputTokens = Number((msg as any).usage?.output_tokens || 0);
    return {
      text,
      model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  } catch {
    return null;
  }
}

async function callAI(prompt: string, options?: { mode?: string; metadata?: Record<string, string> }): Promise<{ text: string; provider: string; model: string; usage: AiUsage } | null> {
  const startedAt = Date.now();
  const config = readConfig();
  const provider = process.env.GHOSTRUN_AI_PROVIDER; // 'ollama' | 'anthropic' | undefined = auto
  const interactionMode = getInteractionMode();
  const promptSanitized = sanitizePII(prompt).slice(0, 4000);

  if (provider !== 'anthropic') {
    const result = await callOllama(prompt);
    if (result) {
      const model = process.env.GHOSTRUN_OLLAMA_MODEL || 'ollama';
      const usage: AiUsage = {
        inputTokens: estimateTokens(prompt),
        outputTokens: estimateTokens(result),
        totalTokens: estimateTokens(prompt) + estimateTokens(result),
      };
      if (config.ai?.trackUsage !== false) {
        recordAiSession({
          mode: options?.mode || 'general',
          provider: 'ollama',
          model,
          interactionMode,
          durationMs: Date.now() - startedAt,
          usage,
          promptHash: shortHash(promptSanitized),
          promptPreview: promptSanitized.slice(0, 600),
          responsePreview: sanitizePII(result).slice(0, 600),
          metadata: options?.metadata,
        });
      }
      return { text: result, provider: 'ollama', model, usage };
    }
    if (provider === 'ollama') return null;
  }

  const result = await callAnthropic(prompt);
  if (result?.text) {
    if (config.ai?.trackUsage !== false) {
      recordAiSession({
        mode: options?.mode || 'general',
        provider: 'anthropic',
        model: result.model,
        interactionMode,
        durationMs: Date.now() - startedAt,
        usage: result.usage,
        promptHash: shortHash(promptSanitized),
        promptPreview: promptSanitized.slice(0, 600),
        responsePreview: sanitizePII(result.text).slice(0, 600),
        metadata: options?.metadata,
      });
    }
    return { text: result.text, provider: 'anthropic', model: result.model, usage: result.usage };
  }

  return null;
}

function buildFailurePrompt(ctx: {
  flowName: string;
  steps: Array<{ stepNumber: number; name: string; action: string; selector?: string | null; status: string; errorMessage?: string | null }>;
  failedStep: { name: string; action: string; selector?: string | null; errorMessage: string };
  scrapeContext?: string;
}): string {
  const stepsSummary = ctx.steps.map(s =>
    `  Step ${s.stepNumber} [${s.status}]: ${s.name} (${s.action}${s.selector ? ` on "${s.selector}"` : ''})`
  ).join('\n');
  
  // Analyze error type for better context
  const errorType = categorizeError(ctx.failedStep.errorMessage);
  const selectorHint = ctx.failedStep.selector ? detectSelectorIssue(ctx.failedStep.selector, ctx.failedStep.errorMessage) : '';
  
  return `You are a web automation expert analyzing why a browser test failed.

Flow: "${ctx.flowName}"
Completed steps:
${stepsSummary}

Failed step: "${ctx.failedStep.name}"
Action: ${ctx.failedStep.action}${ctx.failedStep.selector ? `\nSelector: "${ctx.failedStep.selector}"` : ''}
Error: ${ctx.failedStep.errorMessage}

Error category detected: ${errorType}
${selectorHint ? `Selector analysis: ${selectorHint}` : ''}
${ctx.scrapeContext ? `\nPage scrape context:\n${ctx.scrapeContext}` : ''}

Respond in EXACTLY this format (no extra text, no markdown):

WHAT FAILED
<specific description of what step failed and what it was trying to accomplish>

WHY IT FAILED  
<2-3 sentences explaining the root cause — be specific about whether this is a selector issue, timing, page structure change, network issue, or assertion mismatch>

HOW TO FIX IT
<2-3 actionable steps the developer can take to resolve this — include specific suggestions for selectors or timing if applicable>`;
}

function categorizeError(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('not found') || msg.includes('timeout') || msg.includes('locator')) {
    return 'ELEMENT_NOT_FOUND - Selector may be broken or element not loaded';
  }
  if (msg.includes('not visible') || msg.includes('hidden')) {
    return 'ELEMENT_NOT_VISIBLE - Element exists but is not interactable';
  }
  if (msg.includes('disabled') || msg.includes('not actionable')) {
    return 'ELEMENT_DISABLED - Element is present but not clickable';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to load')) {
    return 'NETWORK_ERROR - Page or resource failed to load';
  }
  if (msg.includes('assert') || msg.includes('expected')) {
    return 'ASSERTION_FAILED - Expected condition not met';
  }
  return 'UNKNOWN_ERROR - Review error message for details';
}

function detectSelectorIssue(selector: string, errorMessage: string): string {
  const issues: string[] = [];
  const msg = errorMessage.toLowerCase();
  
  // Check for common selector problems
  if (selector.includes('//') && msg.includes('not found')) {
    issues.push('- XPath selectors are fragile; consider using CSS or data attributes');
  }
  if (selector.includes('text=') || selector.includes(':has-text')) {
    issues.push('- Text-based selectors break when UI text changes');
  }
  if (selector.includes('nth') || selector.includes('[1]') || selector.includes('[2]')) {
    issues.push('- Positional selectors are brittle; element order may have changed');
  }
  if (selector.match(/[.#][\w-]+(?<!\w)/) && !selector.includes('data-testid') && !selector.includes('data-cy')) {
    issues.push('- CSS class selectors may change with UI updates; consider data-testid attributes');
  }
  if (selector.includes(' ') && selector.includes('//')) {
    issues.push('- Complex XPath may be too specific; try shorter path');
  }
  
  return issues.join('\n');
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

async function askWithMode(question: string, autoAnswer = ''): Promise<string> {
  const mode = getInteractionMode();
  if (mode === 'auto') {
    const shown = autoAnswer === '' ? '(empty)' : autoAnswer;
    info(`Auto mode: ${question.trim()} -> ${shown}`);
    return autoAnswer;
  }
  return askQuestion(question);
}

async function confirmAction(question: string, defaultAnswer = false): Promise<boolean> {
  const mode = getInteractionMode();
  if (mode === 'auto') {
    info(`Auto mode: ${question.trim()} -> ${defaultAnswer ? 'yes' : 'no'}`);
    return defaultAnswer;
  }
  const answer = (await askQuestion(question)).toLowerCase();
  if (!answer) return defaultAnswer;
  return answer === 'y' || answer === 'yes';
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
  const profile = getSelectedProfile(argv);
  if (profile?.variables) {
    for (const [key, val] of Object.entries(profile.variables)) {
      if (!(key in vars)) vars[key] = val;
    }
  }
  if (profile?.baseUrl) {
    if (!('BASE_URL' in vars)) vars.BASE_URL = profile.baseUrl;
    if (!('__baseUrl' in vars)) vars.__baseUrl = profile.baseUrl;
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
  const sessionPath = sessionFilePath(name);
  if (!fs.existsSync(sessionPath)) throw new Error(`Session not found: ${name}. Run with --save-session first.`);
  const cookies = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  await context.addCookies(cookies);
  return cookies.length;
}

async function saveSession(context: import('playwright').BrowserContext, name: string) {
  const cookies = await context.cookies();
  const sessionPath = sessionFilePath(name);
  fs.writeFileSync(sessionPath, JSON.stringify(cookies, null, 2));
  fs.chmodSync(sessionPath, 0o600);
  return cookies.length;
}

// ============================================
// CRAWLEE SCRAPING
// ============================================

function parseFlagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--') ? argv[idx + 1] : undefined;
}

function parseNumberFlag(argv: string[], flag: string, fallback: number, max: number): number {
  const raw = parseFlagValue(argv, flag);
  const n = raw ? parseInt(raw, 10) : fallback;
  return Math.max(1, Math.min(Number.isFinite(n) ? n : fallback, max));
}

function summarizeScrapePage(page: ScrapedPage): string {
  const pieces = [
    page.title ? `Title: ${page.title}` : '',
    page.headings.length ? `Headings: ${page.headings.slice(0, 6).join(' | ')}` : '',
    page.buttons.length ? `Buttons: ${page.buttons.slice(0, 8).map(b => b.text).filter(Boolean).join(' | ')}` : '',
    page.forms.length ? `Forms: ${page.forms.map(f => f.fields.map(field => field.label || field.name || field.placeholder || field.type).filter(Boolean).join(', ')).filter(Boolean).join(' | ')}` : '',
    page.text ? `Text: ${page.text.slice(0, 800)}` : '',
  ].filter(Boolean);
  return pieces.join('\n');
}

function extractScrapeText(result: ScrapeResult | null): string | undefined {
  if (!result?.pages?.length) return undefined;
  return summarizeScrapePage(result.pages[0]);
}

async function runCrawleeScrape(url: string, options: {
  maxPages?: number;
  selector?: string;
  reason?: string;
  runId?: string;
  stepNumber?: number;
  exploreReportId?: string;
  quiet?: boolean;
  requireEnabled?: boolean;
} = {}): Promise<ScrapeResult> {
  if (options.requireEnabled !== false && !isCrawleeEnabled()) {
    throw new Error('Crawlee scraping is not enabled. Run `ghostrun init` and enable website scraping.');
  }

  const maxPages = Math.max(1, Math.min(options.maxPages || 1, 100));
  const reason = options.reason || 'manual';
  const scrape = db.createScrapeRun({
    url,
    reason,
    maxPages,
    selector: options.selector,
    runId: options.runId,
    stepNumber: options.stepNumber,
    exploreReportId: options.exploreReportId,
  });
  const scrapeDir = path.join(SCRAPES_PATH, scrape.id);
  fs.mkdirSync(scrapeDir, { recursive: true });
  const resultPath = path.join(scrapeDir, 'result.json');
  process.env.CRAWLEE_STORAGE_DIR = path.join(scrapeDir, 'crawlee-storage');
  const pages: ScrapedPage[] = [];

  try {
    const crawlee = await loadCrawlee();
    const { PlaywrightCrawler } = crawlee;
    if (options.quiet && crawlee.log && crawlee.LogLevel) {
      crawlee.log.setLevel(crawlee.LogLevel.OFF);
    }
    const inputHost = new URL(url).hostname;
    const allowedHosts = new Set([inputHost, inputHost.startsWith('www.') ? inputHost.slice(4) : `www.${inputHost}`]);

    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: maxPages,
      requestHandlerTimeoutSecs: 30,
      async requestHandler({ request, page, enqueueLinks }: any) {
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.waitForSelector('body', { state: 'visible', timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(500).catch(() => {});

        const selectedSelector = options.selector || '';
        const scraped = await page.evaluate((selector: string) => {
          function cleanText(value: string | null | undefined): string {
            return (value || '').replace(/\s+/g, ' ').trim();
          }
          function bestSelector(el: Element): string {
            if ((el as HTMLElement).id && !/^\d/.test((el as HTMLElement).id)) return `#${CSS.escape((el as HTMLElement).id)}`;
            const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-cy');
            if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
            const name = (el as HTMLInputElement).name;
            if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
            const aria = el.getAttribute('aria-label');
            if (aria) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
            const text = cleanText((el as HTMLElement).innerText || el.textContent).slice(0, 40);
            if ((el.tagName === 'BUTTON' || el.tagName === 'A') && text) return `${el.tagName.toLowerCase()}:has-text("${text.replace(/"/g, '\\"')}")`;
            return el.tagName.toLowerCase();
          }
          function labelFor(input: Element): string {
            const id = (input as HTMLElement).id;
            if (id) {
              const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
              if (label) return cleanText((label as HTMLElement).innerText);
            }
            const parent = input.closest('label');
            if (parent) return cleanText((parent as HTMLElement).innerText);
            return '';
          }
          function fieldFor(input: Element) {
            return {
              type: (input as HTMLInputElement).type || input.tagName.toLowerCase(),
              name: (input as HTMLInputElement).name || '',
              placeholder: (input as HTMLInputElement).placeholder || '',
              label: labelFor(input),
              selector: bestSelector(input),
              required: (input as HTMLInputElement).required || false,
            };
          }

          const forms = Array.from(document.querySelectorAll('form')).slice(0, 10).map((form, i) => {
            const fields = Array.from(form.querySelectorAll('input:not([type="hidden"]), textarea, select')).slice(0, 30).map(fieldFor);
            const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
            return {
              selector: bestSelector(form) || `form:nth-of-type(${i + 1})`,
              fields,
              submitText: submit ? cleanText((submit as HTMLElement).innerText || (submit as HTMLInputElement).value) : '',
              submitSelector: submit ? bestSelector(submit) : null,
            };
          }).filter(f => f.fields.length > 0 || f.submitText);

          const selected = selector
            ? Array.from(document.querySelectorAll(selector)).slice(0, 20).map(el => ({
                selector,
                text: cleanText((el as HTMLElement).innerText || el.textContent).slice(0, 5000),
                html: (el as HTMLElement).outerHTML.slice(0, 5000),
              }))
            : [];

          return {
            url: location.href,
            title: document.title || '',
            description: (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content || '',
            headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 20).map(h => cleanText((h as HTMLElement).innerText)).filter(Boolean),
            links: Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map(a => ({
              text: cleanText((a as HTMLElement).innerText || a.textContent).slice(0, 120),
              href: (a as HTMLAnchorElement).href,
            })).filter(a => a.href),
            forms,
            buttons: Array.from(document.querySelectorAll('button, [role="button"], a.btn, a[class*="button"], a[class*="cta"]')).slice(0, 80).map(btn => ({
              text: cleanText((btn as HTMLElement).innerText || btn.textContent).slice(0, 120),
              selector: bestSelector(btn),
            })).filter(b => b.text),
            selected,
            text: cleanText(document.body?.innerText || '').slice(0, 12000),
          };
        }, selectedSelector) as ScrapedPage;

        pages.push(scraped);

        await enqueueLinks({
          strategy: 'same-domain',
          transformRequestFunction: (req: any) => {
            try {
              const host = new URL(req.url).hostname;
              const noAsset = !req.url.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|mp4|webp)(\?|$)/i);
              return allowedHosts.has(host) && noAsset ? req : false;
            } catch {
              return false;
            }
          },
        }).catch(() => {});

        if (!options.quiet) {
          console.log(chalk.gray(`  scraped ${pages.length}/${maxPages}: ${request.loadedUrl || request.url}`));
        }
      },
      failedRequestHandler({ request, error }: any) {
        if (!options.quiet) warn(`Scrape skipped ${request.url}: ${error?.message || error}`);
      },
    });

    await crawler.run([url]);

    const result: ScrapeResult = {
      id: scrape.id,
      url,
      status: 'complete',
      reason,
      maxPages,
      selector: options.selector,
      pages,
      resultPath,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    db.updateScrapeRun(scrape.id, { status: 'complete', pagesCount: pages.length, resultPath });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result: ScrapeResult = {
      id: scrape.id,
      url,
      status: 'failed',
      reason,
      maxPages,
      selector: options.selector,
      pages,
      resultPath,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(resultPath, JSON.stringify({ ...result, errorMessage: message }, null, 2));
    db.updateScrapeRun(scrape.id, { status: 'failed', pagesCount: pages.length, resultPath, errorMessage: message });
    throw new Error(message);
  }
}

function readScrapeResult(resultPath: string | null): ScrapeResult | null {
  if (!resultPath || !fs.existsSync(resultPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(resultPath, 'utf8')) as ScrapeResult;
  } catch {
    return null;
  }
}

// ============================================
// COMMANDS — learn
// ============================================

/**
 * Acquires a browser + context + page for an interactive (recording/fixing) session.
 * With `cdpEndpoint`, attaches to an already-running browser over the Chrome DevTools
 * Protocol instead of launching a new one — e.g. a browser an AI agent already has open —
 * and reuses its most recently active tab rather than opening a fresh one. Without it,
 * launches a normal headed GhostRun-owned browser, same as before.
 */
async function acquireInteractiveBrowser(cdpEndpoint?: string): Promise<{
  browser: import('playwright').Browser;
  context: import('playwright').BrowserContext;
  page: import('playwright').Page;
  isAttached: boolean;
}> {
  if (cdpEndpoint) {
    let browser: import('playwright').Browser;
    try {
      browser = await chromium.connectOverCDP(cdpEndpoint);
    } catch {
      errorMsg(`Could not attach to a browser at ${cdpEndpoint} — is it running with --remote-debugging-port?`);
      process.exit(1);
    }
    const existingContexts = browser.contexts();
    const context = existingContexts[0] ?? await browser.newContext();
    const existingPages = context.pages();
    const page = existingPages[existingPages.length - 1] ?? await context.newPage();
    return { browser, context, page, isAttached: true };
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  return { browser, context, page, isAttached: false };
}

async function runLearn(url: string | undefined, nameOverride?: string, opts?: { cdpEndpoint?: string }) {
  printLogo(); divider();
  let flowName = nameOverride || args[2];
  if (!flowName) { console.log(chalk.cyan('\n  Enter flow name: ')); flowName = await askQuestion('  > '); }
  if (!flowName) { errorMsg('Flow name required'); process.exit(1); }

  const { browser, context, page, isAttached } = await acquireInteractiveBrowser(opts?.cdpEndpoint);

  // In --cdp mode without an explicit URL, record from wherever the attached tab already is.
  const explicitUrl = !!url;
  if (!url) url = page.url();

  info('Target URL: ' + chalk.cyan(url));
  info('Flow name:  ' + chalk.cyan(flowName));
  if (isAttached) info('Browser:    ' + chalk.magenta('attached via CDP — recording in your existing tab'));
  console.log();

  const flow = db.createFlow({ name: flowName, appUrl: url, createdBy: 'human' });
  const capturedActions: RecordedAction[] = [];
  let browserClosed = false;

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
  // addInitScript only fires on future navigations — when attached to an already-loaded
  // page (the common case for --cdp without an explicit URL) it needs a direct injection
  // too, or recording would silently capture nothing until the next navigation.
  await page.evaluate(RECORDER_SCRIPT).catch(() => {});

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
  // Attached without an explicit URL — start recording from wherever the tab already is
  // instead of reloading it out from under whoever (or whatever agent) has it open.
  if (explicitUrl || !isAttached) await page.goto(url);

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
  // Never close a browser we attached to via CDP — that's the user's (or agent's) real
  // browser, and Browser.close() over CDP terminates the whole process, not just our session.
  // Just stop here and let the CDP connection drop on its own.
  if (!browserClosed && !isAttached) await browser.close();
  else if (isAttached) info('Detached — your browser session was left running.');

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
    else if (action.type === 'click') node = { id: nodeId, type: 'action', label: action.label ? `Click "${action.label}"` : `Click ${action.selector}`, action: 'click', selector: action.selector, intent: action.label ? `Click "${action.label}"` : `Click ${action.selector}` };
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
  // A CDP connection is an open socket that keeps the event loop alive — since we
  // deliberately never close() it, exit explicitly instead of hanging forever.
  if (isAttached) process.exit(0);
}

// ============================================
// COMMANDS — run
// ============================================

async function executeFlow(flowId: string, vars?: Record<string, string>, opts?: { sessionLoad?: string; sessionSave?: string; quiet?: boolean; jsonOutput?: boolean; visible?: boolean; ci?: boolean; allowAiSummary?: boolean; skipProfileAuth?: boolean; video?: boolean; trace?: boolean; baseline?: boolean; visualThreshold?: number; onStep?: (idx: number, action: string, selector?: string) => void; onError?: (msg: string) => void }): Promise<{ passed: boolean; runId: string; duration: number; extractedData: Record<string, string>; error?: string; scrapeDiagnostics?: Array<{ scrapeId: string; resultPath: string | null; reason: string | null }> }> {
  const log = (s: string) => { if (!opts?.jsonOutput && !opts?.quiet) process.stdout.write(s + '\n'); };

  const projectConfig = readConfig();
  const baselineMode = opts?.baseline ?? process.argv.includes('--baseline');
  const visualThreshold = opts?.visualThreshold
    ?? (() => {
      const raw = parseFlagValue(process.argv, '--baseline-threshold');
      return raw ? parseFloat(raw) : (projectConfig.policies?.visualDiffThresholdPercent ?? 5);
    })();

  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) { errorMsg('Flow not found: ' + flowId); process.exit(1); }

  let graph: { nodes: Record<string, unknown>[]; edges: object[]; appUrl?: string };
  try { graph = JSON.parse(flow.graph); } catch { errorMsg('Invalid graph'); process.exit(1); return { passed: false, runId: '', duration: 0, extractedData: {} }; }

  if (!graph.nodes?.length) { warn('Empty flow.'); return { passed: false, runId: '', duration: 0, extractedData: {} }; }

  if (!opts?.jsonOutput && vars && Object.keys(vars).length > 0) {
    console.log(chalk.gray('  Variables: ' + Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(', ')));
  }

  const run = db.createRun(flow.id);
  const screenshotsDir = db.getScreenshotsPath(run.id);

  const actionNodes = graph.nodes.filter(n => n.type === 'action') as Array<Record<string, unknown>>;
  let stepNum = 1, failed = false;
  let failedStepInfo: { name: string; action: string; selector?: string | null; errorMessage: string } | null = null;
  let failureScrapeContext: string | undefined;
  const scrapeDiagnostics: Array<{ scrapeId: string; resultPath: string | null; reason: string | null }> = [];
  const runStart = Date.now();
  const runVars: Record<string, string> = { ...(vars || {}) };
  const selectedProfile = getSelectedProfile();
  let resolvedProfileAuth: ResolvedProfileAuth | null = null;
  let profileSessionLoadName = opts?.sessionLoad;
  let cleanupProfileSession = false;

  // Load active environment variables into context
  const activeEnv = db.getActiveEnvironment();
  if (activeEnv) {
    Object.assign(runVars, activeEnv.variables);
    if (activeEnv.baseUrl && !runVars['__baseUrl']) runVars['__baseUrl'] = activeEnv.baseUrl;
  }
  if (selectedProfile?.variables) Object.assign(runVars, selectedProfile.variables);
  const accountKey = selectedProfile ? resolveSelectedAccountKey(selectedProfile, process.argv) : null;
  if (selectedProfile && accountKey) {
    try {
      const applied = await applyProfileAccount(selectedProfile, accountKey, runVars, resolveSecretValue);
      if (!opts?.jsonOutput && !opts?.quiet) {
        console.log('  ' + chalk.gray('Account: ') + chalk.cyan(`${applied.accountId}`) +
          (applied.email ? chalk.gray(` (${applied.email})`) : ''));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errorMsg(msg);
      db.updateRun(run.id, { status: 'failed', completedAt: new Date(), duration: Date.now() - runStart, errorMessage: msg });
      return { passed: false, runId: run.id, duration: Date.now() - runStart, extractedData: {}, error: msg };
    }
  }
  if (vars && Object.keys(vars).length > 0) {
    Object.assign(runVars, vars);
  }
  if (selectedProfile?.baseUrl) {
    if (!runVars['BASE_URL']) runVars['BASE_URL'] = selectedProfile.baseUrl;
    if (!runVars['__baseUrl']) runVars['__baseUrl'] = selectedProfile.baseUrl;
  }

  // Show run header with env + provenance
  const startUrl = runVars['__baseUrl'] || graph.appUrl || flow.appUrl;
  const { label: envLabel, color: envColor } = getEnvLabel(startUrl || '');
  const creatorIcon = flow.createdBy === 'agent' ? chalk.magenta(' 🤖') : chalk.blue(' 👤');
  const verifiedBadge = flow.verified ? chalk.green(' ✓') : '';
  const provenanceStr = creatorIcon + verifiedBadge;
  if (!opts?.jsonOutput && !opts?.quiet) {
    if (envLabel === 'production') {
      console.log(chalk.red('\n  ┌─────────────────────────────────────┐'));
      console.log(chalk.red('  │ ⚠ PRODUCTION ENVIRONMENT            │'));
      console.log(chalk.red('  └─────────────────────────────────────┘'));
    }
    console.log(chalk.bold('\n  Running: ') + chalk.white(flow.name) + provenanceStr);
    if (startUrl) console.log('  ' + chalk.gray('URL: ') + envColor(startUrl));
    if (selectedProfile?.name) console.log('  ' + chalk.gray('Profile: ') + chalk.cyan(selectedProfile.name));
  }

  try {
    if (selectedProfile && !opts?.skipProfileAuth) {
      resolvedProfileAuth = await resolveProfileAuth(selectedProfile, runVars, flow.id, {
        ci: opts?.ci,
        visible: opts?.visible,
        quiet: opts?.quiet,
        accountId: accountKey,
      });
      if (resolvedProfileAuth?.injectedVars) Object.assign(runVars, resolvedProfileAuth.injectedVars);
      if (!profileSessionLoadName && resolvedProfileAuth?.sessionLoadName) {
        profileSessionLoadName = resolvedProfileAuth.sessionLoadName;
        cleanupProfileSession = true;
      }
      if (!opts?.jsonOutput && !opts?.quiet && resolvedProfileAuth) {
        console.log('  ' + chalk.gray('Auth: ') + chalk.cyan(resolvedProfileAuth.summary));
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - runStart;
    db.updateRun(run.id, {
      status: 'failed',
      completedAt: new Date(),
      duration,
      errorMessage,
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
        scrapeDiagnostics,
      }));
    } else {
      errorMsg(errorMessage);
    }
    return { passed: false, runId: run.id, duration, extractedData: {}, error: errorMessage, scrapeDiagnostics };
  }

  const ctx: ExecutionContext = {
    variables: runVars,
    environmentName: activeEnv?.name,
    profileAuth: resolvedProfileAuth?.apiAuth,
    profileServices: selectedProfile?.services,
  };

  // Determine if any browser actions exist (if not, skip browser entirely)
  const API_ONLY_ACTIONS = new Set([
    'http:request', 'assert:response', 'assert:status', 'assert:body', 'assert:header', 'assert:time',
    'set:variable', 'extract:json', 'env:switch',
    'email:wait', 'email:extract-link', 'email:extract-otp', 'webhook:wait', 'webhook:assert',
    'assert:webhook-signature', 'services:seed', 'db:query', 'db:assert',
  ]);
  const hasBrowserActions = actionNodes.some(n => !API_ONLY_ACTIONS.has(n.action as string));

  let browser: import('playwright').Browser | null = null;
  let browserCtx: import('playwright').BrowserContext | null = null;
  let page: import('playwright').Page | null = null;

  if (hasBrowserActions) {
    browser = await chromium.launch({ headless: !opts?.visible });
    const videoDir = opts?.video ? path.join(PROJECT_GHOSTRUN_PATH, 'runs', run.id) : undefined;
    if (videoDir && !fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
    browserCtx = await browser.newContext({
      ...(resolvedProfileAuth?.browserContextOptions || {}),
      ...(videoDir ? { recordVideo: { dir: videoDir } } : {}),
    });

    if (opts?.trace) {
      await browserCtx.tracing.start({ screenshots: true, snapshots: true });
    }

    page = await browserCtx.newPage();

    if (profileSessionLoadName) {
      try {
        const count = await loadSession(browserCtx, profileSessionLoadName);
        if (!opts?.quiet) info(`Session: ${chalk.cyan(profileSessionLoadName)} loaded (${count} cookies)`);
      } catch (e) { warn(String(e)); }
    }

    if (startUrl) await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }

  // Load pixelmatch for baseline diffs (optional)
  let PNG: typeof import('pngjs').PNG | null = null;
  let pixelmatch: typeof import('pixelmatch').default | null = null;
  try {
    const pngjs = await import('pngjs');
    PNG = pngjs.PNG;
    pixelmatch = (await import('pixelmatch')).default;
  } catch { /* optional */ }

  for (const node of actionNodes) {
    const label = (node.label as string) || node.action as string || "Step " + stepNum, action = node.action as string;
    const barStr = progressBar(stepNum, actionNodes.length);
    log(chalk.cyan(`\n  [${stepNum}/${actionNodes.length}]`) + ` ${barStr} ` + chalk.white(label));
    opts?.onStep?.(stepNum - 1, action, node.selector as string | undefined);
    const sanitizedStepValue = typeof node.value === 'string'
      ? sanitizeStoredValue(node.value, label, node.selector as string | undefined)
      : undefined;
    const step = db.createStep({
      runId: run.id,
      stepNumber: stepNum,
      name: label,
      action,
      selector: node.selector as string | undefined,
      value: sanitizedStepValue,
    });
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
            if (diffPercent > visualThreshold) {
              log(chalk.yellow(`      ~ visual change: ${diffPercent}% (threshold ${visualThreshold}%)`));
            }
          } catch { /* skip diff on error */ }
        }

        if (diffPercent !== undefined && diffPercent > visualThreshold) {
          const proposal = createRepairProposal({
            source: 'ai-heal',
            repairType: 'visual',
            flowId: flow!.id,
            flowName: flow!.name,
            runId: run.id,
            nodeId: String(node.id || ''),
            stepNumber: stepNum,
            action,
            currentValue: `${diffPercent}%`,
            proposedValue: `Re-capture baseline: ghostrun baseline:set ${flow!.name}`,
            errorMessage: `[DIFF:${diffPercent}%]`,
            rationale: `Visual regression on step ${stepNum}: ${diffPercent}% pixel diff exceeds threshold ${visualThreshold}%. Update baseline after intentional UI change with baseline:set.`,
          });
          if (proposal) log(chalk.yellow(`      ~ visual repair proposal: ${proposal.id.slice(0, 8)}`));
          if (baselineMode) {
            throw new Error(`Visual regression ${diffPercent}% > ${visualThreshold}% on step ${stepNum}`);
          }
        }

        db.updateStep(step.id, { status: 'passed', duration, screenshotPath: sp, ...(diffPercent !== undefined ? { diffPercent } : {}) });
        if (diffPercent !== undefined && diffPercent > visualThreshold && !baselineMode) {
          db.updateStep(step.id, { errorMessage: `[DIFF:${diffPercent}%]` });
        }
      } else {
        db.updateStep(step.id, { status: 'passed', duration });
      }
      log(chalk.green(`      ✓ passed`) + chalk.gray(` (${duration}ms)`));

      // Handle extract action — save extracted data
      if (action === 'extract' && (resolvedNode as any).__extracted) {
        const extracted = (resolvedNode as any).__extracted as { variable: string; value: string };
        db.saveRunData(run.id, stepNum, extracted.variable, sanitizePII(extracted.value));
        runVars[extracted.variable] = extracted.value;
        log(chalk.cyan(`      → extracted ${extracted.variable}: ${chalk.white(extracted.value.slice(0, 60))}`));
      }
    } catch (err) {
      const duration = Date.now() - t;
      const errorMessage = err instanceof Error ? err.message.split('\n')[0] : String(err);

      // Selector repair proposals: suggest but do not silently heal execution
      if (['click', 'fill', 'select'].includes(action) && page) {
        const healed = await attemptHeal(page, label, node.selector as string, action);
        if (healed) {
          const proposal = createRepairProposal({
            source: 'ai-heal',
            repairType: 'selector',
            flowId: flow.id,
            flowName: flow.name,
            runId: run.id,
            nodeId: String(node.id || ''),
            stepNumber: stepNum,
            action,
            currentSelector: node.selector as string | undefined,
            proposedSelector: healed,
            errorMessage,
            rationale: 'Generated from failed execution using selector repair heuristics and optional AI.',
          });
          if (proposal) {
            log(chalk.yellow(`      ~ repair proposal: ${proposal.id.slice(0, 8)} -> ${healed}`));
            const autoApply = autoApplySelectorRepairProposal(proposal, {
              ci: opts?.ci,
              profile: selectedProfile,
              startUrl: startUrl || undefined,
              currentSelector: node.selector as string | null | undefined,
            });
            if (autoApply.applied) {
              log(chalk.green(`      ~ auto-applied selector repair: ${proposal.id.slice(0, 8)}`));
            } else if (readConfig().policies?.allowAutoRepairApply && getInteractionMode() === 'auto') {
              log(chalk.gray(`      ~ auto-apply blocked: ${autoApply.reason}`));
            }
          } else {
            log(chalk.gray(`      ~ repair proposal skipped: run attempt limit reached`));
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
          selectedProfile,
        });
        if (extraProposal) {
          log(chalk.yellow(`      ~ repair proposal (${extraProposal.repairType}): ${extraProposal.id.slice(0, 8)}`));
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

      if (page && isCrawleeEnabled()) {
        try {
          log(chalk.gray('      → scraping failed page for diagnostics...'));
          const scrape = await runCrawleeScrape(page.url(), {
            maxPages: 1,
            reason: 'run-failure',
            runId: run.id,
            stepNumber: stepNum,
            quiet: true,
            requireEnabled: false,
          });
          failureScrapeContext = extractScrapeText(scrape);
          scrapeDiagnostics.push({ scrapeId: scrape.id, resultPath: scrape.resultPath, reason: scrape.reason });
          log(chalk.gray(`      → scrape diagnostic: ${scrape.id.slice(0, 8)}`));
        } catch (scrapeErr) {
          log(chalk.gray(`      → scrape diagnostic skipped: ${scrapeErr instanceof Error ? scrapeErr.message : scrapeErr}`));
        }
      }

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

  // Stop Playwright trace before closing browser
  let traceOutputPath: string | null = null;
  if (opts?.trace && browserCtx) {
    traceOutputPath = path.join(PROJECT_GHOSTRUN_PATH, 'runs', run.id, 'trace.zip');
    const traceDir = path.dirname(traceOutputPath);
    if (!fs.existsSync(traceDir)) fs.mkdirSync(traceDir, { recursive: true });
    try { await browserCtx.tracing.stop({ path: traceOutputPath }); } catch { /* ignore trace stop errors */ }
  }

  // Close browser (also flushes video files if recording)
  const videoRecordDir = opts?.video ? path.join(PROJECT_GHOSTRUN_PATH, 'runs', run.id) : null;
  if (browser) await browser.close();

  if (cleanupProfileSession && profileSessionLoadName) {
    const tempSessionPath = sessionFilePath(profileSessionLoadName);
    if (fs.existsSync(tempSessionPath)) {
      try { fs.unlinkSync(tempSessionPath); } catch { /* ignore cleanup failure */ }
    }
  }

  const totalDuration = Date.now() - runStart;
  let summary: string | null = null;
  if (failed && failedStepInfo && opts?.allowAiSummary !== false) {
    if (!opts?.jsonOutput) process.stdout.write(chalk.gray('\n  Analyzing failure...\n'));
    const steps = db.listSteps(run.id);
    const result = await callAI(buildFailurePrompt({ flowName: flow.name, steps: steps.map(s => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })), failedStep: failedStepInfo, scrapeContext: failureScrapeContext }), { mode: 'summary', metadata: { flowId: flow.id, runId: run.id } });
    if (result) {
      summary = result.text;
      if (!opts?.jsonOutput) process.stdout.write(chalk.gray(`  (via ${result.provider})\n`));
    }
  }

  db.updateRun(run.id, { status: failed ? 'failed' : 'passed', completedAt: new Date(), duration: totalDuration, errorMessage: failedStepInfo?.errorMessage, summary: summary || undefined });
  writeEvidenceBundle(run.id, { ci: opts?.ci });

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
      extractedData, summary, scrapeDiagnostics
    }));
    return { passed: !failed, runId: run.id, duration: totalDuration, extractedData, error: failedStepInfo?.errorMessage, scrapeDiagnostics };
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
  if (videoRecordDir) {
    info('Video: ' + chalk.cyan(videoRecordDir));
  }
  if (traceOutputPath && fs.existsSync(traceOutputPath)) {
    info('Trace: ' + chalk.cyan(traceOutputPath));
    info('View:  ' + chalk.gray('npx playwright show-trace ' + traceOutputPath));
  }
  if (scrapeDiagnostics.length > 0) {
    info('Scrape diagnostic: ' + chalk.cyan(scrapeDiagnostics[0].resultPath || scrapeDiagnostics[0].scrapeId));
  }
  console.log();
  return { passed: !failed, runId: run.id, duration: totalDuration, extractedData, error: failedStepInfo?.errorMessage, scrapeDiagnostics };
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
      // Smart wait: retry up to 3 times for SPAs where elements load dynamically
      const maxRetries = 2;
      const retryTimeout = 8000; // 8 seconds per attempt
      let lastError = '';
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Wait for element to be attached and visible
          await p.locator(node.selector as string).first().waitFor({ state: 'visible', timeout: retryTimeout });
          const isVisible = await p.locator(node.selector as string).first().isVisible({ timeout: 5000 });
          if (isVisible) break;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          if (attempt < maxRetries) await p.waitForTimeout(1000); // Wait before retry
        }
      }
      
      const isVisible = await p.locator(node.selector as string).first().isVisible({ timeout: 5000 }).catch(() => false);
      if (!isVisible) throw new Error(`assert:visible failed — "${node.selector}" is not visible (tried ${maxRetries + 1}x with smart wait)`);
      break;
    }

    case 'assert:hidden': {
      // Smart wait for hidden state
      const maxRetries = 2;
      const retryTimeout = 4000;
      let lastError = '';
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await p.locator(node.selector as string).first().waitFor({ state: 'hidden', timeout: retryTimeout });
          const isHidden = await p.locator(node.selector as string).first().isHidden({ timeout: 5000 });
          if (isHidden) break;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          if (attempt < maxRetries) await p.waitForTimeout(500);
        }
      }
      
      const isHidden = await p.locator(node.selector as string).first().isHidden({ timeout: 5000 }).catch(() => true);
      if (!isHidden) throw new Error(`assert:hidden failed — "${node.selector}" is visible but expected hidden`);
      break;
    }

    case 'assert:value': {
      // Smart wait for input value
      const maxRetries = 2;
      const retryTimeout = 8000;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await p.locator(node.selector as string).first().waitFor({ state: 'attached', timeout: retryTimeout });
          const inputVal = await p.inputValue(node.selector as string, { timeout: 5000 });
          if (inputVal.includes(node.value as string)) break;
        } catch (e) {
          if (attempt < maxRetries) await p.waitForTimeout(500);
        }
      }
      
      const inputVal = await p.inputValue(node.selector as string, { timeout: 10000 });
      if (!inputVal.includes(node.value as string)) throw new Error(`assert:value failed — input value "${inputVal}" does not contain "${node.value}"`);
      break;
    }

    case 'assert:count': {
      const expected = parseInt(node.value as string, 10);
      // Smart wait for count
      await p.locator(node.selector as string).first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
      const actual = await p.locator(node.selector as string).count();
      if (actual !== expected) throw new Error(`assert:count failed — found ${actual} elements, expected ${expected}`);
      break;
    }

    case 'assert:attr': {
      // selector = element, value = "attrName=expected"
      const [attrName, ...rest] = ((node.value as string) || '').split('=');
      const expected = rest.join('=');
      // Smart wait for attribute
      const maxRetries = 2;
      const retryTimeout = 8000;
      let actual = null;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await p.locator(node.selector as string).first().waitFor({ state: 'attached', timeout: retryTimeout });
          actual = await p.locator(node.selector as string).first().getAttribute(attrName, { timeout: 5000 });
          if (actual !== null) break;
        } catch (e) {
          if (attempt < maxRetries) await p.waitForTimeout(500);
        }
      }
      
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

    case 'email:wait': {
      if (!ctx) throw new Error('email:wait requires execution context');
      const to = resolveVarsDeep(
        (node.to as string) || (node.selector as string) || ctx.variables['accountEmail'] || ctx.variables['testEmail'] || '',
        ctx
      ) as string;
      const subjectContains = resolveVarsDeep((node.subject as string) || (node.value as string) || '', ctx) as string;
      const timeoutMs = node.timeoutMs ? parseInt(String(node.timeoutMs), 10) : undefined;
      const result = await waitForEmail(ctx.profileServices, {
        to: to || undefined,
        subjectContains: subjectContains || undefined,
        timeoutMs,
      });
      const varName = (node.variable as string) || 'lastEmailBody';
      ctx.variables[varName] = result.body;
      ctx.variables[`${varName}Subject`] = result.message.Subject;
      ctx.variables[`${varName}Id`] = result.message.ID;
      if (result.html) ctx.variables[`${varName}Html`] = result.html;
      (node as Record<string, unknown>).__extracted = { variable: varName, value: result.body.slice(0, 200) };
      break;
    }

    case 'email:extract-link': {
      if (!ctx) throw new Error('email:extract-link requires execution context');
      const sourceVar = (node.variable as string) || 'lastEmailBody';
      const source = ctx.variables[sourceVar] || ctx.variables[`${sourceVar}Html`] || '';
      const link = extractFirstUrl(source);
      if (!link) throw new Error(`email:extract-link: no URL found in ${sourceVar}`);
      const outVar = (node.to as string) || (node.selector as string) || 'magicLink';
      ctx.variables[outVar] = link;
      (node as Record<string, unknown>).__extracted = { variable: outVar, value: link };
      break;
    }

    case 'email:extract-otp': {
      if (!ctx) throw new Error('email:extract-otp requires execution context');
      const sourceVar = (node.variable as string) || 'lastEmailBody';
      const source = ctx.variables[sourceVar] || '';
      const length = parseInt((node.value as string) || '6', 10);
      const code = extractOtpCode(source, length);
      if (!code) throw new Error(`email:extract-otp: no ${length}-digit code in ${sourceVar}`);
      const outVar = (node.to as string) || 'otpCode';
      ctx.variables[outVar] = code;
      (node as Record<string, unknown>).__extracted = { variable: outVar, value: code };
      break;
    }

    case 'email:click-link': {
      if (!page) throw new Error('email:click-link requires a browser page');
      if (!ctx) throw new Error('email:click-link requires execution context');
      const linkVar = (node.variable as string) || 'magicLink';
      let url = ctx.variables[linkVar];
      if (!url) {
        const sourceVar = (node.value as string) || 'lastEmailBody';
        url = extractFirstUrl(ctx.variables[sourceVar] || ctx.variables[`${sourceVar}Html`] || '') || '';
      }
      if (!url) throw new Error(`email:click-link: set ${linkVar} or run email:extract-link first`);
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      break;
    }

    case 'webhook:wait': {
      if (!ctx) throw new Error('webhook:wait requires execution context');
      const hookPath = resolveVarsDeep((node.path as string) || (node.value as string) || (node.selector as string) || '', ctx) as string;
      if (!hookPath) throw new Error('webhook:wait requires path (value or path field)');
      const timeoutMs = node.timeoutMs ? parseInt(String(node.timeoutMs), 10) : undefined;
      const capture = await waitForWebhook(ctx.profileServices, { path: hookPath, timeoutMs });
      const varName = (node.variable as string) || 'lastWebhookBody';
      ctx.variables[varName] = capture.body;
      ctx.variables[`${varName}Path`] = capture.path;
      ctx.variables[`${varName}Headers`] = JSON.stringify(capture.headers);
      ctx.variables[`${varName}CaptureId`] = capture.id;
      (node as Record<string, unknown>).__extracted = { variable: varName, value: capture.body.slice(0, 200) };
      break;
    }

    case 'webhook:assert': {
      if (!ctx) throw new Error('webhook:assert requires execution context');
      const bodyVar = (node.variable as string) || 'lastWebhookBody';
      const hookPath = resolveVarsDeep((node.path as string) || '', ctx) as string;
      const bodyFromVar = ctx.variables[bodyVar];
      const capture = resolveWebhookCapture(listWebhookCaptures(50), {
        path: hookPath || undefined,
        body: bodyFromVar,
      });
      const assertionsRaw = node.assertions as Array<{ path: string; expected?: string; op?: string }> | undefined;
      if (assertionsRaw?.length) {
        assertWebhookPayload(capture.body, assertionsRaw.map(a => ({
          path: resolveVarsDeep(a.path, ctx) as string,
          expected: a.expected !== undefined ? resolveVarsDeep(a.expected, ctx) as string : undefined,
          op: a.op as 'equals' | 'contains' | 'exists' | undefined,
        })));
      } else {
        const jsonPath = resolveVarsDeep((node.value as string) || (node.path as string) || '', ctx) as string;
        const expected = resolveVarsDeep((node.expected as string) || '', ctx) as string;
        if (!jsonPath) throw new Error('webhook:assert requires assertions array or value (JSON path) + expected');
        assertWebhookPayload(capture.body, [{ path: jsonPath, expected, op: (node.op as string) as 'equals' | 'contains' | undefined }]);
      }
      break;
    }

    case 'assert:webhook-signature': {
      if (!ctx) throw new Error('assert:webhook-signature requires execution context');
      const bodyVar = (node.variable as string) || 'lastWebhookBody';
      const hookPath = resolveVarsDeep((node.path as string) || '', ctx) as string;
      const bodyFromVar = ctx.variables[bodyVar];
      const headersJson = ctx.variables[`${bodyVar}Headers`];
      let capture = resolveWebhookCapture(listWebhookCaptures(50), {
        path: hookPath || undefined,
        body: bodyFromVar,
      });
      if (headersJson && bodyFromVar) {
        try {
          capture = { ...capture, headers: JSON.parse(headersJson) as Record<string, string> };
        } catch { /* use capture headers */ }
      }
      const secretRef = (node.secretSecret as string) || (node.secret as string) || 'WEBHOOK_HMAC_SECRET';
      const secret = await resolveSecretValue(secretRef) || process.env[secretRef];
      if (!secret) throw new Error(`assert:webhook-signature: secret not found (${secretRef})`);
      verifyWebhookSignature(capture, {
        secret,
        headerName: (node.header as string) || 'X-Webhook-Signature',
        algorithm: ((node.algorithm as string) || 'sha256') as 'sha256' | 'sha1',
        prefix: (node.prefix as string) || undefined,
      });
      break;
    }

    case 'db:query': {
      if (!ctx) throw new Error('db:query requires execution context');
      const pg = ctx.profileServices?.postgres;
      if (!pg?.connectionSecret) throw new Error('db:query requires profile.services.postgres.connectionSecret');
      const sql = resolveVarsDeep((node.value as string) || (node.sql as string) || '', ctx) as string;
      if (!sql) throw new Error('db:query requires value or sql field');
      const paramsRaw = (node.params as unknown[]) || [];
      const params = paramsRaw.map(p => resolveVarsDeep(p, ctx));
      const rows = await runDbQuery(pg.connectionSecret, sql, params);
      const varName = (node.variable as string) || 'queryResult';
      ctx.variables[varName] = JSON.stringify(rows);
      ctx.variables[`${varName}Count`] = String(rows.length);
      if (rows.length > 0) {
        const firstVal = Object.values(rows[0])[0];
        ctx.variables[`${varName}Scalar`] = firstVal === null || firstVal === undefined ? '' : String(firstVal);
      }
      (node as Record<string, unknown>).__extracted = { variable: varName, value: JSON.stringify(rows).slice(0, 200) };
      break;
    }

    case 'db:assert': {
      if (!ctx) throw new Error('db:assert requires execution context');
      const pg = ctx.profileServices?.postgres;
      if (!pg?.connectionSecret) throw new Error('db:assert requires profile.services.postgres.connectionSecret');
      const sql = resolveVarsDeep((node.value as string) || (node.sql as string) || '', ctx) as string;
      if (!sql) throw new Error('db:assert requires value or sql field');
      const expected = resolveVarsDeep((node.expected as string) || '', ctx) as string;
      const assertType = ((node.assertType as string) || (node.assert as string) || 'scalar') as import('./service-bridge').DbAssertType;
      const paramsRaw = (node.params as unknown[]) || [];
      const params = paramsRaw.map(p => resolveVarsDeep(p, ctx));
      await assertDbQuery(pg.connectionSecret, sql, expected, { assertType, params });
      break;
    }

    case 'services:seed': {
      if (!ctx) throw new Error('services:seed requires execution context');
      const pg = ctx.profileServices?.postgres;
      if (!pg?.connectionSecret) throw new Error('services:seed requires profile.services.postgres.connectionSecret');
      const paths = getProjectPaths();
      const fixtures = (pg.fixtures || []).map(f =>
        path.isAbsolute(f) ? f : path.join(paths.fixturesSql, f)
      );
      if (fixtures.length === 0) throw new Error('services:seed: no fixtures listed in profile.services.postgres.fixtures');
      await runSqlFixtures(fixtures, pg.connectionSecret);
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

    const result = await callAI(prompt, { mode: 'repair', metadata: { selector, step: label } });
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

async function runFlow(id: string, vars?: Record<string, string>): Promise<string | null> {
  const visible = process.argv.includes('--visible');
  const ciMode = process.argv.includes('--ci');
  const outputIdx = process.argv.indexOf('--output');
  const jsonOutput = outputIdx !== -1 && process.argv[outputIdx + 1] === 'json';
  const video = process.argv.includes('--video');
  const trace = process.argv.includes('--trace');
  const baseline = process.argv.includes('--baseline');
  const thresholdRaw = parseFlagValue(process.argv, '--baseline-threshold');
  const visualThreshold = thresholdRaw ? parseFloat(thresholdRaw) : undefined;
  const config = readConfig();
  const allowAiSummary = !ciMode || (config.policies?.allowAiInCi || 'summary-only') !== 'off';

  if (!jsonOutput) { printLogo(); divider(); }
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  if (!jsonOutput) {
    console.log(chalk.bold('\n  Running: ') + chalk.white(flow.name)
      + (visible ? chalk.yellow(' [visible]') : '')
      + (ciMode ? chalk.cyan(' [ci]') : '')
      + (baseline ? chalk.magenta(' [baseline]') : '')
      + (video ? chalk.magenta(' [video]') : '')
      + (trace ? chalk.blue(' [trace]') : '') + '\n');
  }
  const result = await executeFlow(id, vars, { visible, jsonOutput, ci: ciMode, allowAiSummary, video, trace, baseline, visualThreshold });
  if (!result?.passed) process.exit(1);
  return result?.runId || null;
}

// ============================================
// COMMANDS — flow:fix (interactive selector repair)
// ============================================

async function runFixFlow(id: string) {
  printLogo(); divider();
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
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
  const confirm = await confirmAction(`  Delete "${chalk.yellow(flow.name)}"? (y/N) `, false);
  if (!confirm) { warn('Cancelled'); return; }
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
// COMMANDS — flow:rename / flow:clone
// ============================================

async function runRenameFlow(id: string, newName: string) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  db.updateFlow(flow.id, { name: newName });
  success(`Renamed "${chalk.gray(flow.name)}" → "${chalk.white(newName)}"`);
  console.log();
}

async function runCloneFlow(id: string) {
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
  if (!flow) { errorMsg('Flow not found: ' + id); process.exit(1); }
  const newName = flow.name + ' (copy)';
  const created = db.createFlow({ name: newName, description: flow.description ?? undefined, appUrl: flow.appUrl ?? undefined, graph: JSON.parse(flow.graph) });
  success(`Cloned "${chalk.gray(flow.name)}" → "${chalk.white(newName)}"`);
  info('New ID: ' + chalk.gray(created.id.slice(0, 8)));
  console.log();
}

// ============================================
// COMMANDS — flow:from-curl / flow:from-spec
// ============================================

function parseCurlTokens(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let inSingle = false, inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if ((ch === ' ' || ch === '\n' || ch === '\t') && !inSingle && !inDouble) {
      if (cur) { tokens.push(cur); cur = ''; }
      continue;
    }
    if (ch === '\\' && !inSingle) { i++; if (i < input.length) cur += input[i]; continue; }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

async function runFlowFromCurl(curlStr?: string) {
  printLogo(); divider();
  console.log(chalk.bold('\n  Import from curl\n'));

  let input = curlStr || '';
  if (!input.trim()) {
    console.log(chalk.gray('  Paste your curl command (multi-line OK, end with empty line):\n'));
    const lines: string[] = [];
    while (true) {
      const line = await askQuestion('  > ');
      if (!line.trim()) break;
      lines.push(line.replace(/\\$/, '').trim());
    }
    input = lines.join(' ');
  }

  input = input.replace(/^curl\s+/, '').trim();
  if (!input) { errorMsg('No curl command provided'); process.exit(1); }

  const tokens = parseCurlTokens(input);

  let method = 'GET';
  let url = '';
  const headers: Record<string, string> = {};
  let body: unknown;
  let bearerToken = '';

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '-X' || t === '--request') { method = tokens[++i]?.toUpperCase() || 'GET'; continue; }
    if (t === '-H' || t === '--header') {
      const h = tokens[++i] || '';
      const colon = h.indexOf(':');
      if (colon > 0) {
        const k = h.slice(0, colon).trim();
        const v = h.slice(colon + 1).trim();
        if (k.toLowerCase() === 'authorization' && v.toLowerCase().startsWith('bearer ')) {
          bearerToken = v.slice(7).trim();
        } else {
          headers[k] = v;
        }
      }
      continue;
    }
    if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') {
      const raw = tokens[++i] || '';
      if (method === 'GET') method = 'POST';
      try { body = JSON.parse(raw); } catch { body = raw; }
      continue;
    }
    if (t === '-u' || t === '--user') {
      const creds = tokens[++i] || '';
      const encoded = Buffer.from(creds).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
      continue;
    }
    if (t === '--url') { url = tokens[++i] || ''; continue; }
    if (t === '-s' || t === '--silent' || t === '-v' || t === '--verbose' || t === '-i' || t === '--include' || t === '-L' || t === '--location' || t === '--compressed') continue;
    if (t === '-o' || t === '--output' || t === '--max-time' || t === '--connect-timeout' || t === '--proxy') { i++; continue; }
    if (!t.startsWith('-') && !url) url = t;
  }

  if (!url) { errorMsg('Could not find URL in curl command'); process.exit(1); }

  const urlPath = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  const defaultName = `${method} ${urlPath.split('/').filter(Boolean).slice(-1)[0] || urlPath}`;
  const name = await askQuestion(chalk.cyan(`\n  Flow name [${defaultName}]: `));
  const flowName = name.trim() || defaultName;

  const nodes: Record<string, unknown>[] = [];
  const nodeId = () => uuidv4();

  const httpNode: Record<string, unknown> = {
    id: nodeId(), type: 'action', action: 'http:request',
    method, url, label: `${method} ${urlPath}`,
  };
  if (Object.keys(headers).length) httpNode.headers = headers;
  if (body !== undefined) httpNode.body = body;
  if (bearerToken) httpNode.auth = { type: 'bearer', token: bearerToken };
  nodes.push(httpNode);

  nodes.push({ id: nodeId(), type: 'action', action: 'assert:response', assert: 'status', expected: 200, label: 'Assert status 200' });

  const isJson = headers['Content-Type']?.includes('json') || headers['content-type']?.includes('json') || typeof body === 'object';
  if (isJson || (!body && method === 'GET')) {
    nodes.push({ id: nodeId(), type: 'action', action: 'assert:response', assert: 'time', expected: 2000, label: 'Assert response < 2000ms' });
  }

  const graph = { nodes, edges: [] };
  const created = db.createFlow({ name: flowName, description: `Imported from curl: ${method} ${url}`, graph });

  console.log();
  success(`Flow created: ${chalk.white(flowName)}`);
  info(`ID: ${chalk.gray(created.id.slice(0, 8))}`);
  console.log(chalk.gray(`\n  Nodes created:`));
  for (const n of nodes) console.log(chalk.gray(`    ${n.label}`));
  console.log(chalk.gray(`\n  Run with: ghostrun run "${flowName}"`));
  console.log(chalk.gray(`  Add more steps: ghostrun api:learn`));
  console.log();
}

function parseYamlValue(s: string): unknown {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s.replace(/^["']|["']$/g, '');
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const lines = text.split('\n');
  const root: Record<string, unknown> = {};
  const stack: Array<{ obj: Record<string, unknown> | unknown[]; indent: number }> = [{ obj: root, indent: -1 }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Pop stack to find parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();

    const parent = stack[stack.length - 1].obj;

    if (trimmed.startsWith('- ')) {
      const val = trimmed.slice(2).trim();
      if (Array.isArray(parent)) {
        const parsed = parseYamlValue(val);
        (parent as unknown[]).push(parsed);
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;
    const key = trimmed.slice(0, colonIdx).trim().replace(/^["']|["']$/g, '');
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (!Array.isArray(parent)) {
      if (rest === '' || rest === '|' || rest === '>') {
        const child: Record<string, unknown> = {};
        (parent as Record<string, unknown>)[key] = child;
        stack.push({ obj: child, indent });
      } else if (rest === '-' || rest.startsWith('- ')) {
        const arr: unknown[] = [];
        (parent as Record<string, unknown>)[key] = arr;
        stack.push({ obj: arr, indent });
      } else {
        (parent as Record<string, unknown>)[key] = parseYamlValue(rest);
      }
    }
  }
  return root;
}

async function runFlowFromSpec(filepath: string) {
  printLogo(); divider();
  console.log(chalk.bold('\n  Import from OpenAPI Spec\n'));

  if (!fs.existsSync(filepath)) { errorMsg('File not found: ' + filepath); process.exit(1); }

  let spec: Record<string, unknown>;
  const raw = fs.readFileSync(filepath, 'utf8').trim();

  if (raw.startsWith('{') || raw.startsWith('[')) {
    try { spec = JSON.parse(raw); } catch { errorMsg('Invalid JSON'); process.exit(1); return; }
  } else {
    spec = parseSimpleYaml(raw);
  }

  const version = (spec.openapi || spec.swagger || '2') as string;
  const specInfo = spec.info as Record<string, unknown> || {};
  const title = (specInfo.title as string) || path.basename(filepath, path.extname(filepath));
  const servers = (spec.servers as Array<Record<string, unknown>>) || [];
  const baseUrl = servers[0]?.url as string || (spec.host ? `https://${spec.host}${spec.basePath || ''}` : '');
  const paths = spec.paths as Record<string, Record<string, unknown>> || {};

  console.log(chalk.gray(`  Spec: ${title} (OpenAPI ${version})`));
  console.log(chalk.gray(`  Base URL: ${baseUrl || '(not set — use environment variables)'}`));
  console.log(chalk.gray(`  Paths: ${Object.keys(paths).length}\n`));

  if (Object.keys(paths).length === 0) { errorMsg('No paths found in spec'); process.exit(1); }

  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  const tagGroups: Record<string, Array<{ path: string; method: string; op: Record<string, unknown> }>> = {};

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method] as Record<string, unknown>;
      if (!op) continue;
      const tags = op.tags as string[] || ['default'];
      const tag = tags[0] || 'default';
      if (!tagGroups[tag]) tagGroups[tag] = [];
      tagGroups[tag].push({ path: pathKey, method, op });
    }
  }

  const tags = Object.keys(tagGroups);
  console.log(chalk.gray(`  Tags found: ${tags.join(', ')}`));
  console.log(chalk.cyan('\n  Options:'));
  console.log(chalk.gray('  1 — One flow per tag group (recommended)'));
  console.log(chalk.gray('  2 — One flow per endpoint'));
  console.log(chalk.gray('  3 — Single flow with all endpoints'));
  const choice = ((await askQuestion('\n  Choice [1]: ')).trim()) || '1';

  const flowsToCreate: Array<{ name: string; description: string; nodes: Record<string, unknown>[] }> = [];
  const nodeId = () => uuidv4();

  function makeHttpNode(method: string, pathKey: string, op: Record<string, unknown>, bUrl: string): Record<string, unknown> {
    const resolvedUrl = bUrl ? `${bUrl.replace(/\/$/, '')}${pathKey}` : pathKey;
    const summary = (op.summary as string) || `${method.toUpperCase()} ${pathKey}`;
    const node: Record<string, unknown> = {
      id: nodeId(), type: 'action', action: 'http:request',
      method: method.toUpperCase(), url: resolvedUrl, label: summary,
    };
    const requestBody = op.requestBody as Record<string, unknown>;
    if (requestBody) {
      const content = requestBody.content as Record<string, unknown>;
      if (content?.['application/json']) {
        const schema = (content['application/json'] as Record<string, unknown>)?.schema as Record<string, unknown>;
        if (schema?.example) node.body = schema.example;
        else if (schema?.properties) {
          const body: Record<string, string> = {};
          for (const prop of Object.keys(schema.properties as object)) body[prop] = `{{${prop}}}`;
          node.body = body;
        }
        node.headers = { 'Content-Type': 'application/json' };
      }
    }
    const pathParams = (op.parameters as Array<Record<string, unknown>> || []).filter(p => p.in === 'path');
    if (pathParams.length) {
      let urlStr = node.url as string;
      for (const p of pathParams) {
        urlStr = urlStr.replace(`{${p.name}}`, `{{${p.name}}}`);
      }
      node.url = urlStr;
    }
    return node;
  }

  function makeAssertNode(successCode = 200): Record<string, unknown> {
    return { id: nodeId(), type: 'action', action: 'assert:response', assert: 'status', expected: successCode, label: `Assert status ${successCode}` };
  }

  if (choice === '1') {
    for (const [tag, ops] of Object.entries(tagGroups)) {
      const nodes: Record<string, unknown>[] = [];
      for (const { path: pathKey, method, op } of ops) {
        nodes.push(makeHttpNode(method, pathKey, op, baseUrl));
        const responses = op.responses as Record<string, unknown> || {};
        const successCode = Object.keys(responses).find(c => Number(c) >= 200 && Number(c) < 300);
        nodes.push(makeAssertNode(successCode ? Number(successCode) : 200));
      }
      flowsToCreate.push({ name: `${title} — ${tag}`, description: `Auto-generated from OpenAPI spec: ${title}`, nodes });
    }
  } else if (choice === '2') {
    for (const [tag, ops] of Object.entries(tagGroups)) {
      for (const { path: pathKey, method, op } of ops) {
        const summary = (op.summary as string) || `${method.toUpperCase()} ${pathKey}`;
        const nodes: Record<string, unknown>[] = [];
        nodes.push(makeHttpNode(method, pathKey, op, baseUrl));
        const responses = op.responses as Record<string, unknown> || {};
        const successCode = Object.keys(responses).find(c => Number(c) >= 200 && Number(c) < 300);
        nodes.push(makeAssertNode(successCode ? Number(successCode) : 200));
        flowsToCreate.push({ name: summary, description: `${tag}: ${method.toUpperCase()} ${pathKey}`, nodes });
      }
    }
  } else {
    const nodes: Record<string, unknown>[] = [];
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
    const created = db.createFlow({ name: f.name, description: f.description, appUrl: baseUrl || undefined, graph: { nodes: f.nodes, edges: [] } });
    success(`Created: ${chalk.white(f.name)} ${chalk.gray('(' + f.nodes.length + ' steps, id: ' + created.id.slice(0, 8) + ')')}`);
  }
  console.log(chalk.gray(`\n  ${flowsToCreate.length} flow(s) created. Run with: ghostrun run "<name>"`));
  if (baseUrl) console.log(chalk.gray(`  Base URL: ${baseUrl}`));
  else console.log(chalk.gray(`  Tip: set base URL with: ghostrun env:create dev <base-url>`));
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

  const scrapeDiagnostics = db.listScrapeRunsForRun(run.id);
  if (scrapeDiagnostics.length > 0) {
    console.log(chalk.bold('\n  Scrape Diagnostics\n'));
    for (const s of scrapeDiagnostics) {
      console.log(`    ${chalk.gray(s.id.slice(0, 8))}  ${chalk.white(s.reason || 'diagnostic')}  ${chalk.gray(s.resultPath || '')}`);
    }
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
        }), { mode: 'summary', metadata: { flowId: flow?.id || '', runId: run.id } });
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

function buildFailureHeadline(
  flowName: string,
  failedStep: { stepNumber: number; action: string; name: string; errorMessage: string }
): string {
  const err = failedStep.errorMessage.slice(0, 120);
  return `Step ${failedStep.stepNumber}: ${failedStep.action} failed in "${flowName}" — ${err}`;
}

function getRunEvidenceDir(runId: string): string {
  return path.join(PROJECT_GHOSTRUN_PATH, 'runs', runId);
}

function buildFailureV1(params: {
  runId: string;
  flowId: string;
  flowName: string;
  profile: string | null;
  status: string;
  durationMs: number;
  failedStep: {
    number: number;
    action: string;
    name: string;
    selector?: string | null;
    durationMs: number;
    error: string;
    url?: string;
    screenshot?: string;
  };
  repairProposalId?: string;
  similarFailures30d?: number;
}): Record<string, unknown> {
  const headline = buildFailureHeadline(params.flowName, {
    stepNumber: params.failedStep.number,
    action: params.failedStep.action,
    name: params.failedStep.name,
    errorMessage: params.failedStep.error,
  });
  return {
    schemaVersion: '1.0',
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
      repairProposalId: params.repairProposalId,
    },
    actions: {
      rerun: `ghostrun run ${params.flowName}${params.profile ? ` --profile ${params.profile}` : ''}`,
      openReport: 'report.html',
      viewProposals: 'ghostrun repair list',
      ...(params.repairProposalId
        ? { applyRepair: `ghostrun repair apply ${params.repairProposalId.slice(0, 8)}` }
        : {}),
    },
    integrations: {},
  };
}

const GITHUB_ISSUE_DEFAULT_LABEL = 'ghostrun';

type GitHubIssueCreateTrigger = 'ci-failure' | 'monitor-failure' | 'local-failure';

function githubIssueDedupMarker(runId: string, flowId: string): string {
  return `ghostrun-run:${runId}\nghostrun-flow:${flowId}`;
}

function issueBodyHasDedupMarker(body: string, runId: string, flowId: string): boolean {
  return body.includes(`ghostrun-run:${runId}`) && body.includes(`ghostrun-flow:${flowId}`);
}

function shouldCreateGitHubIssue(
  config: GhostrunConfig,
  trigger: GitHubIssueCreateTrigger
): boolean {
  const gh = config.integrations?.github;
  if (!gh?.enabled) return false;
  const createOn = gh.createOn;
  if (!createOn?.length) return true;
  return createOn.includes(trigger);
}

function formatGitHubIssueBody(
  failure: Record<string, unknown>,
  manifest: Record<string, unknown>
): string {
  const runId = String(failure.runId || manifest.runId || '—');
  const flowId = String(failure.flowId || manifest.flowId || '—');
  const flowName = String(failure.flowName || manifest.flowName || '—');
  const profile = String(failure.profile ?? manifest.profile ?? '—');
  const failed = failure.failedStep as Record<string, unknown> | undefined;
  const actions = failure.actions as Record<string, string> | undefined;
  const headline = String(failure.headline || 'Test failed');

  const lines = [
    '## GhostRun failure',
    '',
    `**${headline}**`,
    '',
    '| | |',
    '|---|---|',
    `| Flow | ${flowName} |`,
    `| Profile | ${profile} |`,
    `| Run | \`${runId}\` |`,
    `| Flow ID | \`${flowId}\` |`,
    '',
    '### Failed step',
    '',
    '```',
    `Step ${failed?.number ?? '?'}: ${failed?.action ?? 'unknown'}`,
    String(failed?.error || 'Unknown error'),
    '```',
    '',
    '### Commands',
    '',
    '```bash',
    actions?.rerun || `ghostrun run ${flowName}`,
    actions?.viewProposals || 'ghostrun repair list',
    '```',
    '',
    '<!-- ghostrun-integration:v1 -->',
    githubIssueDedupMarker(runId, flowId),
    '',
    '_Created by GhostRun `report publish --create-issues`_',
  ];
  return lines.join('\n');
}

function formatGitHubIssueTitle(failure: Record<string, unknown>): string {
  const headline = String(failure.headline || '');
  const flowName = String(failure.flowName || 'flow');
  const title = headline ? `[GhostRun] ${headline}` : `[GhostRun] ${flowName} failed`;
  return title.length > 256 ? title.slice(0, 253) + '...' : title;
}

function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
}

function resolveGitHubIssueLabels(config: GhostrunConfig): string[] {
  const configured = config.integrations?.github?.labels;
  if (configured?.length) return configured;
  return [GITHUB_ISSUE_DEFAULT_LABEL];
}

async function githubRestFetch(
  token: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

async function findOpenGitHubIssueForFailure(
  owner: string,
  repo: string,
  token: string,
  runId: string,
  flowId: string,
  labels: string[]
): Promise<{ number: number; html_url: string } | null> {
  const labelParam = labels.map(l => encodeURIComponent(l)).join(',');
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100&labels=${labelParam}`;
  const res = await githubRestFetch(token, url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issues search failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const issues = (await res.json()) as Array<{
    number: number;
    html_url: string;
    body: string | null;
    pull_request?: unknown;
  }>;
  for (const issue of issues) {
    if (issue.pull_request) continue;
    if (issueBodyHasDedupMarker(issue.body || '', runId, flowId)) {
      return { number: issue.number, html_url: issue.html_url };
    }
  }
  return null;
}

function patchFailureGitHubIssueUrl(
  failurePath: string,
  issueUrl: string
): void {
  const failure = JSON.parse(fs.readFileSync(failurePath, 'utf8')) as Record<string, unknown>;
  const integrations = (failure.integrations as Record<string, unknown>) || {};
  integrations.githubIssue = issueUrl;
  failure.integrations = integrations;
  fs.writeFileSync(failurePath, JSON.stringify(failure, null, 2));
}

async function createGitHubIssueFromFailure(
  failure: Record<string, unknown>,
  manifest: Record<string, unknown>,
  config: GhostrunConfig,
  opts?: { publishFailurePath?: string; evidenceFailurePath?: string }
): Promise<{
  created: boolean;
  skipped?: 'duplicate' | 'disabled' | 'config';
  issueUrl?: string;
  issueNumber?: number;
}> {
  const gh = config.integrations?.github;
  if (!gh?.enabled) return { created: false, skipped: 'disabled' };
  if (!gh.owner || !gh.repo) return { created: false, skipped: 'config' };

  const token = getGitHubToken();
  if (!token) {
    throw new Error('GITHUB_TOKEN or GH_TOKEN not set.');
  }

  const runId = String(failure.runId || manifest.runId || '');
  const flowId = String(failure.flowId || manifest.flowId || '');
  if (!runId || !flowId) {
    throw new Error('failure.v1.json missing runId or flowId.');
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
    const paths = [opts?.publishFailurePath, opts?.evidenceFailurePath].filter(
      (p): p is string => !!p && fs.existsSync(p)
    );
    for (const p of paths) patchFailureGitHubIssueUrl(p, existing.html_url);
    return {
      created: false,
      skipped: 'duplicate',
      issueUrl: existing.html_url,
      issueNumber: existing.number,
    };
  }

  const body = formatGitHubIssueBody(failure, manifest);
  const title = formatGitHubIssueTitle(failure);
  const createRes = await githubRestFetch(
    token,
    `https://api.github.com/repos/${gh.owner}/${gh.repo}/issues`,
    {
      method: 'POST',
      body: JSON.stringify({ title, body, labels }),
    }
  );
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`GitHub issue create failed (${createRes.status}): ${text.slice(0, 300)}`);
  }
  const created = (await createRes.json()) as { number: number; html_url: string };
  const paths = [opts?.publishFailurePath, opts?.evidenceFailurePath].filter(
    (p): p is string => !!p && fs.existsSync(p)
  );
  for (const p of paths) patchFailureGitHubIssueUrl(p, created.html_url);

  return {
    created: true,
    issueUrl: created.html_url,
    issueNumber: created.number,
  };
}

function writeEvidenceBundle(runId: string, opts?: { ci?: boolean }): string {
  ensureProjectWorkspace();
  const run = db.getRun(runId);
  if (!run) return '';
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(runId);
  const evidenceDir = getRunEvidenceDir(runId);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const profile = readConfig().activeProfile || null;
  const flowName = flow?.name || run.flowId;
  const pkgVersion = (() => {
    try {
      const pkgPath = path.join(path.dirname(fs.realpathSync(process.argv[1])), 'package.json');
      return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version as string;
    } catch {
      return 'unknown';
    }
  })();

  const stepsJsonl = steps.map(s => JSON.stringify({
    stepNumber: s.stepNumber,
    name: s.name,
    action: s.action,
    status: s.status,
    duration: s.duration,
    selector: s.selector,
    errorMessage: s.errorMessage,
    screenshot: s.screenshotPath,
  })).join('\n');
  fs.writeFileSync(path.join(evidenceDir, 'steps.jsonl'), stepsJsonl + (stepsJsonl ? '\n' : ''));

  const screenshotRefs: string[] = [];
  for (const step of steps) {
    if (step.screenshotPath && fs.existsSync(step.screenshotPath)) {
      const dest = path.join(evidenceDir, 'screenshots', path.basename(step.screenshotPath));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(step.screenshotPath, dest);
      screenshotRefs.push(path.relative(evidenceDir, dest));
    }
  }

  const failedStep = steps.find(s => s.status === 'failed');
  let failurePath: string | undefined;
  let headline: string | undefined;
  if (run.status === 'failed' && failedStep) {
    const proposals = listRepairProposals(20).filter(p => p.runId === runId);
    const failure = buildFailureV1({
      runId: run.id,
      flowId: run.flowId,
      flowName,
      profile,
      status: run.status,
      durationMs: run.duration || 0,
      failedStep: {
        number: failedStep.stepNumber,
        action: failedStep.action || 'unknown',
        name: failedStep.name,
        selector: failedStep.selector,
        durationMs: failedStep.duration || 0,
        error: failedStep.errorMessage || run.errorMessage || 'Unknown error',
        screenshot: screenshotRefs.find(r => r.includes(String(failedStep.stepNumber))) || screenshotRefs[0],
      },
      repairProposalId: proposals[0]?.id,
      similarFailures30d: getRecentFailureRepeatCount(run.flowId, failedStep.errorMessage || ''),
    });
    headline = failure.headline as string;
    failurePath = path.join(evidenceDir, 'failure.v1.json');
    fs.writeFileSync(failurePath, JSON.stringify(failure, null, 2));
  }

  const reportPath = path.join(evidenceDir, 'report.html');
  generateRunReportSync(runId, reportPath, headline);

  const manifest = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    ghostrunVersion: pkgVersion,
    publishedAt: new Date().toISOString(),
    runId: run.id,
    flowId: run.flowId,
    flowName,
    profile,
    status: run.status,
    ci: !!opts?.ci,
    durationMs: run.duration || 0,
    headline: headline || (run.status === 'passed' ? `Flow "${flowName}" passed` : undefined),
    artifacts: {
      report: 'report.html',
      steps: 'steps.jsonl',
      failure: failurePath ? 'failure.v1.json' : undefined,
      screenshots: screenshotRefs,
    },
  };
  const manifestPath = path.join(evidenceDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

function generateRunReportSync(runId: string, outFile: string, headlineOverride?: string): void {
  const run = db.findRunByPartialId(runId) || db.getRun(runId);
  if (!run) return;
  const html = buildRunReportHtml(runId, headlineOverride);
  if (html) fs.writeFileSync(outFile, html);
}

function resolveStepScreenshotSrc(
  step: { screenshotPath?: string | null },
  evidenceDir: string
): string | null {
  const bundled = step.screenshotPath
    ? path.join(evidenceDir, 'screenshots', path.basename(step.screenshotPath))
    : null;
  if (bundled && fs.existsSync(bundled)) {
    return `screenshots/${path.basename(bundled)}`;
  }
  if (step.screenshotPath && fs.existsSync(step.screenshotPath)) {
    return `screenshots/${path.basename(step.screenshotPath)}`;
  }
  return null;
}

function loadFailureV1ForRun(runId: string): Record<string, unknown> | null {
  const failurePath = path.join(getRunEvidenceDir(runId), 'failure.v1.json');
  if (!fs.existsSync(failurePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(failurePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveRepairProposalsForRun(
  runId: string,
  failureV1: Record<string, unknown> | null
): RepairProposalView[] {
  let proposals = listRepairProposals(20).filter(p => p.runId === runId);
  if (proposals.length === 0 && failureV1?.context && typeof failureV1.context === 'object') {
    const repairProposalId = (failureV1.context as { repairProposalId?: string }).repairProposalId;
    if (repairProposalId) {
      const found = findRepairProposal(repairProposalId);
      if (found) proposals = [found.proposal];
    }
  }
  return proposals.map(p => ({
    id: p.id,
    repairType: getRepairType(p),
    status: p.status,
    stepNumber: p.stepNumber,
    currentSelector: p.currentSelector,
    proposedSelector: p.proposedSelector,
    currentValue: p.currentValue,
    proposedValue: p.proposedValue,
    rationale: p.rationale,
    action: p.action,
  }));
}

function getGhostrunPkgVersion(): string {
  try {
    const pkgPath = path.join(path.dirname(fs.realpathSync(process.argv[1])), 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version as string;
  } catch {
    return 'unknown';
  }
}

function buildRunReportHtml(runId: string, headlineOverride?: string): string | null {
  const run = db.findRunByPartialId(runId) || db.getRun(runId);
  if (!run) return null;
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const scrapeDiagnostics = db.listScrapeRunsForRun(run.id);
  const evidenceDir = getRunEvidenceDir(run.id);
  const failureV1 = loadFailureV1ForRun(run.id);
  const profile = (failureV1?.profile as string | null | undefined)
    ?? readConfig().activeProfile
    ?? null;

  const failedStep = steps.find(s => s.status === 'failed');
  const headline = headlineOverride
    || (failureV1?.headline as string | undefined)
    || (failedStep
      ? buildFailureHeadline(flow?.name || runId, {
        stepNumber: failedStep.stepNumber,
        action: failedStep.action || 'step',
        name: failedStep.name,
        errorMessage: failedStep.errorMessage || run.errorMessage || 'Unknown error',
      })
      : undefined);

  const statusColor = run.status === 'passed' ? '#56d364' : run.status === 'failed' ? '#f85149' : '#e3b341';
  const statusBadgeClass = run.status === 'passed' || run.status === 'failed' ? run.status : 'other';
  const durStr = formatReportDuration(run.duration);
  const flowHash = computeFlowGraphHash(flow?.graph);
  const pkgVersion = getGhostrunPkgVersion();
  const generatedAt = new Date().toISOString();

  const stepsHtml = steps.map((step, i) => {
    const icon = step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : '○';
    const color = step.status === 'passed' ? '#56d364' : step.status === 'failed' ? '#f85149' : '#e3b341';
    const dur = formatReportDuration(step.duration);
    const errHtml = step.errorMessage ? `<div class="step-error">${escapeHtml(step.errorMessage)}</div>` : '';
    const shotSrc = resolveStepScreenshotSrc(step, evidenceDir);
    const screenshotHtml = shotSrc
      ? `<img class="step-screenshot" src="${escapeHtml(shotSrc)}" loading="lazy" alt="Step ${i + 1} screenshot" />`
      : '';
    return `<div class="step ${step.status}">
      <div class="step-header">
        <span class="step-icon" style="color:${color}">${icon}</span>
        <span class="step-num">${i + 1}</span>
        <span class="step-action">${escapeHtml(step.action || '')}</span>
        <span class="step-label">${escapeHtml(step.name || '')}</span>
        <span class="step-dur">${dur}</span>
      </div>
      ${errHtml}${screenshotHtml}
    </div>`;
  }).join('\n');

  const scrapeHtml = scrapeDiagnostics.length
    ? `<section class="panel"><h2>Scrape diagnostics</h2>${scrapeDiagnostics.map(s =>
      `<div class="step"><div class="step-header"><span class="step-action">${escapeHtml(s.reason || 'diagnostic')}</span><span class="step-label">${escapeHtml(s.resultPath || s.id)}</span></div></div>`
    ).join('\n')}</section>`
    : '';

  const headlineHtml = headline ? `<div class="headline">${escapeHtml(headline)}</div>` : '';

  const historyRuns = db.listRuns(run.flowId, 30);
  const historyHtml = buildRunHistorySparklineHtml(
    historyRuns.map(r => ({ id: r.id, status: r.status })),
    run.id
  );

  const repairProposals = run.status === 'failed' ? resolveRepairProposalsForRun(run.id, failureV1) : [];
  const repairHtml = buildRepairPanelHtml(repairProposals);

  const flowName = flow?.name || runId;
  const failureActions = failureV1?.actions as {
    rerun?: string;
    viewProposals?: string;
    applyRepair?: string;
    openReport?: string;
  } | undefined;
  const nextStepsHtml = buildNextStepsPanelHtml({
    rerunCommand: failureActions?.rerun || `ghostrun run ${flowName}${profile ? ` --profile ${profile}` : ''}`,
    repairListCommand: failureActions?.viewProposals || 'ghostrun repair list',
    reportPath: failureActions?.openReport || 'report.html',
    applyRepairCommand: failureActions?.applyRepair
      || (repairProposals[0] ? `ghostrun repair apply ${repairProposals[0].id.slice(0, 8)}` : undefined),
  });

  const intent = (failureV1?.intent as string | undefined) || failedStep?.name || '';
  const intentHtml = buildIntentBlockHtml(intent);

  let failurePanelHtml = '';
  if (run.status === 'failed' && failedStep) {
    const failedShot = resolveStepScreenshotSrc(failedStep, evidenceDir);
    failurePanelHtml = buildFailurePanelHtml({
      stepNumber: failedStep.stepNumber,
      action: failedStep.action || 'step',
      name: failedStep.name,
      error: failedStep.errorMessage || run.errorMessage || 'Unknown error',
      selector: failedStep.selector,
      screenshotSrc: failedShot,
    });
  }

  const passedCount = steps.filter(s => s.status === 'passed').length;
  const failedCount = steps.filter(s => s.status === 'failed').length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GhostRun Report — ${escapeHtml(flowName)}</title>
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
    ${profile ? `<span>Profile ${escapeHtml(profile)}</span>` : ''}
    <span>Duration ${durStr}</span>
    ${flowHash ? `<span>Flow hash ${flowHash}</span>` : ''}
  </div>
</section>

<div class="summary">
  <div class="stat"><div class="stat-val" style="color:${statusColor}">${run.status.toUpperCase()}</div><div class="stat-label">Status</div></div>
  <div class="stat"><div class="stat-val">${durStr}</div><div class="stat-label">Duration</div></div>
  <div class="stat"><div class="stat-val">${passedCount}</div><div class="stat-label">Passed</div></div>
  <div class="stat"><div class="stat-val" style="color:${failedCount ? '#f85149' : '#56d364'}">${failedCount}</div><div class="stat-label">Failed</div></div>
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

async function generateRunReport(runId: string, outFile: string) {
  const html = buildRunReportHtml(runId);
  if (!html) return;
  fs.writeFileSync(outFile, html);
  success(`HTML report: ${chalk.cyan(outFile)}`);
}

async function runAnalyzeRun(id: string) {
  const run = db.findRunByPartialId(id);
  if (!run) { errorMsg('Run not found: ' + id); process.exit(1); }
  const flow = db.getFlow(run.flowId);
  const steps = db.listSteps(run.id);
  const failedStep = steps.find(s => s.status === 'failed');
  if (!failedStep) { info('Run passed — no failures to analyze.'); return; }

  info('Analyzing failure...');
  const latestScrape = db.listScrapeRunsForRun(run.id)[0];
  const scrapeContext = extractScrapeText(readScrapeResult(latestScrape?.resultPath || null));
  const result = await callAI(buildFailurePrompt({
    flowName: flow?.name || 'Unknown',
    steps: steps.map(s => ({ stepNumber: s.stepNumber, name: s.name, action: s.action, selector: s.selector, status: s.status, errorMessage: s.errorMessage })),
    failedStep: { name: failedStep.name, action: failedStep.action, selector: failedStep.selector, errorMessage: failedStep.errorMessage || 'Unknown error' },
    scrapeContext,
  }), { mode: 'summary', metadata: { flowId: flow?.id || '', runId: run.id } });

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
  const flow = db.findFlowByPartialId(id) || db.findFlowByName(id);
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
  console.log('  ' + chalk.cyan('ghostrun monitor daemon'));
  console.log('  ' + chalk.gray('(or: ghostrun serve --daemon)'));
  console.log();
}

async function runMonitorCommand(monitorArgs: string[]) {
  const sub = monitorArgs[0];
  if (!sub) {
    printLogo(); divider();
    console.log(chalk.bold('\n  GhostRun Monitor\n'));
    console.log(`  ${chalk.cyan('ghostrun monitor <flow> --interval 60s')}     ${chalk.gray('Poll a flow on an interval')}`);
    console.log(`  ${chalk.cyan('ghostrun monitor daemon')}                  ${chalk.gray('Run cron schedules (PID file)')}`);
    console.log(`  ${chalk.cyan('ghostrun monitor schedule list')}             ${chalk.gray('List cron schedules')}`);
    console.log(`  ${chalk.cyan('ghostrun monitor schedule add <id> "<cron>"')} ${chalk.gray('Add schedule')}`);
    console.log(`  ${chalk.cyan('ghostrun monitor schedule remove <id>')}      ${chalk.gray('Remove schedule')}`);
    console.log();
    return;
  }

  if (sub === 'daemon') {
    await runServe(['--daemon', ...monitorArgs.slice(1)]);
    return;
  }

  if (sub === 'schedule') {
    const action = monitorArgs[1] || 'list';
    if (action === 'list') {
      await runScheduleList();
      return;
    }
    if (action === 'add') {
      if (!monitorArgs[2] || !monitorArgs[3]) {
        errorMsg('Usage: ghostrun monitor schedule add <flow-id> "<cron>"');
        process.exit(1);
      }
      await runScheduleAdd(monitorArgs[2], monitorArgs[3]);
      return;
    }
    if (action === 'remove') {
      if (!monitorArgs[2]) { errorMsg('Schedule ID required'); process.exit(1); }
      await runScheduleRemove(monitorArgs[2]);
      return;
    }
    errorMsg('Unknown schedule action. Use: list, add, remove');
    process.exit(1);
  }

  await runMonitor(sub, monitorArgs.slice(1));
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
  const daemon = serveArgs.includes('--daemon');
  const portIdx = serveArgs.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(serveArgs[portIdx + 1], 10) || 3000 : 3000;

  if (withUI) {
    await runServeDashboard(port);
    return;
  }

  ensureProjectWorkspace();
  const pidPath = getSchedulerPidPath();

  if (daemon) {
    if (fs.existsSync(pidPath)) {
      const existingPid = parseInt(fs.readFileSync(pidPath, 'utf8'), 10);
      if (!Number.isNaN(existingPid) && isProcessRunning(existingPid)) {
        errorMsg(`Scheduler already running (PID ${existingPid}). Stop it first or remove ${pidPath}`);
        process.exit(1);
      }
      fs.unlinkSync(pidPath);
    }
    fs.writeFileSync(pidPath, String(process.pid));
    const cleanupPid = () => { try { if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath); } catch { /* ignore */ } };
    process.on('SIGINT', cleanupPid);
    process.on('SIGTERM', cleanupPid);
    process.on('exit', cleanupPid);
  }

  printLogo(); divider();
  let nodeCron: typeof import('node-cron');
  try { nodeCron = await import('node-cron'); } catch { errorMsg('node-cron not installed. Run: npm install node-cron'); process.exit(1); return; }

  const schedules = db.listSchedules();
  if (schedules.length === 0) {
    warn('No schedules configured. Add one first:');
    info('ghostrun monitor schedule add <id> "0 9 * * *"');
    process.exit(0);
  }

  console.log(chalk.bold(`\n  Scheduler started — ${schedules.length} schedule${schedules.length > 1 ? 's' : ''} active\n`));
  if (daemon) info(`PID file: ${chalk.cyan(pidPath)}`);
  schedules.forEach(s => info(`${s.name} → ${chalk.cyan(s.cronExpression)}`));
  console.log(chalk.gray('\n  Press Ctrl+C to stop.\n'));
  console.log(chalk.gray('  Production tip: use GitHub Actions schedule for always-on monitoring.\n'));

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
  const { spawn } = await import('child_process');

  const logBus = new EventEmitter();
  logBus.setMaxListeners(100);

  // Active run SSE subscribers: flowId → Set<response>
  const sseClients = new Set<any>();
  const commandHistory: Array<{
    id: string;
    command: string;
    args: string[];
    status: 'running' | 'passed' | 'failed';
    exitCode: number | null;
    duration: number | null;
    output: string;
    startedAt: string;
    completedAt: string | null;
  }> = [];
  const allowedDashboardCommands = new Set([
    'status',
    'flow:list',
    'run:list',
    'env:list',
    'suite:list',
    'schedule:list',
    'perf:list',
    'scrape:list',
    'store:list',
    'store',
    'run',
  ]);

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
    ['flows','runs','commands','chat'].forEach(tab => {
      const el = document.getElementById('tab-' + tab);
      if (tab === id) el.classList.remove('panel-hidden');
      else el.classList.add('panel-hidden');
    });
    if (id === 'runs') loadRuns();
    if (id === 'commands') loadCommands();
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

// ─── Commands tab ────────────────────────────────────────────────
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
      <td>\${item.duration ? item.duration + 'ms' : '—'}</td>
      <td>\${item.startedAt ? timeAgo(item.startedAt) : '—'}</td>
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

  function parseJsonBody(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
        if (body.length > 64_000) {
          reject(new Error('Request body too large'));
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  function normalizeDashboardCommand(command: string, args: string[]): { command: string; args: string[] } {
    let normalizedCommand = command.trim();
    let normalizedArgs = args.map(a => String(a).trim()).filter(Boolean);
    if (normalizedCommand === 'store:list') {
      normalizedCommand = 'store';
      normalizedArgs = ['list', ...normalizedArgs];
    }
    if (!allowedDashboardCommands.has(normalizedCommand)) {
      throw new Error(`Command is not allowed from the dashboard: ${command}`);
    }
    if (normalizedCommand === 'store' && normalizedArgs[0] !== 'list') {
      throw new Error('Only `store list` is allowed from the dashboard.');
    }
    if (normalizedCommand === 'run' && normalizedArgs.length === 0) {
      throw new Error('Run requires a flow ID or name.');
    }
    if (normalizedArgs.length > 8) {
      throw new Error('Too many arguments.');
    }
    for (const arg of normalizedArgs) {
      if (!/^[\w:./=@-]+$/.test(arg)) {
        throw new Error(`Argument contains unsupported characters: ${arg}`);
      }
    }
    return { command: normalizedCommand, args: normalizedArgs };
  }

  function runDashboardCommand(command: string, args: string[]): Promise<(typeof commandHistory)[number]> {
    const normalized = normalizeDashboardCommand(command, args);
    const record: (typeof commandHistory)[number] = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      command: normalized.command === 'store' && normalized.args[0] === 'list' ? 'store:list' : normalized.command,
      args: normalized.command === 'store' && normalized.args[0] === 'list' ? normalized.args.slice(1) : normalized.args,
      status: 'running',
      exitCode: null,
      duration: null,
      output: '',
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    commandHistory.unshift(record);
    commandHistory.splice(50);

    return new Promise((resolve) => {
      const started = Date.now();
      const child = spawn(process.execPath, [process.argv[1], normalized.command, ...normalized.args], {
        cwd: process.cwd(),
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.on('error', (err) => {
        record.status = 'failed';
        record.exitCode = 1;
        record.duration = Date.now() - started;
        record.completedAt = new Date().toISOString();
        record.output = err.message;
        resolve(record);
      });
      child.on('close', (code) => {
        record.exitCode = code;
        record.status = code === 0 ? 'passed' : 'failed';
        record.duration = Date.now() - started;
        record.completedAt = new Date().toISOString();
        record.output = output.slice(-20_000);
        resolve(record);
      });
    });
  }

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

    // ── GET /api/commands
    if (req.method === 'GET' && path === '/api/commands') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        allowed: ['status', 'flow:list', 'run:list', 'env:list', 'suite:list', 'schedule:list', 'perf:list', 'scrape:list', 'store:list', 'run'],
        history: commandHistory,
      }));
      return;
    }

    // ── POST /api/commands/run
    if (req.method === 'POST' && path === '/api/commands/run') {
      try {
        const body = await parseJsonBody(req);
        const command = String(body.command || '');
        const args = Array.isArray(body.args) ? body.args.map(String) : [];
        const result = await runDashboardCommand(command, args);
        res.writeHead(result.status === 'passed' ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
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
                  model: 'claude-3-5-haiku-20241022',
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
  console.log('  ' + chalk.gray('Project Path: ') + chalk.white(PROJECT_GHOSTRUN_PATH));
  console.log('  ' + chalk.gray('Mode:         ') + chalk.white(getInteractionMode()));
  console.log('  ' + chalk.gray('Profile:      ') + chalk.white(readConfig().activeProfile || '(none)'));
  console.log('  ' + chalk.gray('Auto-improve: ') + chalk.white(readConfig().policies?.autoImproveEnabled ? 'enabled' : 'disabled'));
  console.log('  ' + chalk.gray('Loop Guard:   ') + chalk.white(`iter=${readConfig().policies?.maxAutoImproveIterations ?? 3}, repeats=${readConfig().policies?.maxSameFailureRepeats ?? 2}`));

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

async function runAiStatus() {
  printLogo(); divider();
  ensureProjectWorkspace();
  const config = readConfig();
  const ollamaModel = await isOllamaRunning();
  const provider = ollamaModel ? `Ollama (${ollamaModel})` : process.env.ANTHROPIC_API_KEY ? 'Anthropic' : 'none';
  const usage = aggregateAiUsage();

  console.log(chalk.bold('\n  AI Status\n'));
  console.log('  ' + chalk.gray('Interaction:  ') + chalk.white(config.interactionMode || 'assist'));
  console.log('  ' + chalk.gray('Configured:   ') + chalk.white(config.ai?.provider || 'auto'));
  console.log('  ' + chalk.gray('Available:    ') + (provider === 'none' ? chalk.gray(provider) : chalk.green(provider)));
  console.log('  ' + chalk.gray('Track Usage:  ') + chalk.white(config.ai?.trackUsage === false ? 'no' : 'yes'));
  console.log('  ' + chalk.gray('Store Logs:   ') + chalk.white(config.ai?.storeSanitizedTranscripts === false ? 'no' : 'yes'));
  console.log('  ' + chalk.gray('CI Policy:    ') + chalk.white(config.policies?.allowAiInCi || 'summary-only'));
  console.log('  ' + chalk.gray('Sessions:     ') + chalk.white(String(usage.calls)));
  console.log('  ' + chalk.gray('Tokens:       ') + chalk.white(String(usage.totalTokens)));
  console.log();
}

async function runAiUsage() {
  printLogo(); divider();
  ensureProjectWorkspace();
  const usage = aggregateAiUsage();
  console.log(chalk.bold('\n  AI Usage\n'));
  console.log(`  Calls:         ${chalk.white(String(usage.calls))}`);
  console.log(`  Input tokens:  ${chalk.white(String(usage.inputTokens))}`);
  console.log(`  Output tokens: ${chalk.white(String(usage.outputTokens))}`);
  console.log(`  Total tokens:  ${chalk.white(String(usage.totalTokens))}`);
  if (usage.estimatedCostUsd > 0) {
    console.log(`  Est. cost:     ${chalk.white('$' + usage.estimatedCostUsd.toFixed(4))}`);
  }
  const providerKeys = Object.keys(usage.byProvider);
  if (providerKeys.length > 0) {
    console.log(chalk.bold('\n  By Provider\n'));
    for (const key of providerKeys) {
      const row = usage.byProvider[key];
      console.log(`  ${chalk.cyan(key.padEnd(30))} ${chalk.white(String(row.calls).padStart(4))} calls  ${chalk.gray(String(row.totalTokens) + ' tokens')}`);
    }
  }
  console.log();
}

async function runAiSessions(limitArg?: string) {
  printLogo(); divider();
  ensureProjectWorkspace();
  const limit = limitArg ? Math.max(1, parseInt(limitArg, 10) || 10) : 10;
  const sessions = listAiSessions(limit);
  console.log(chalk.bold(`\n  AI Sessions (${sessions.length})\n`));
  if (sessions.length === 0) {
    warn('No AI sessions recorded yet.');
    console.log();
    return;
  }
  for (const session of sessions) {
    console.log(`  ${chalk.gray(session.id.slice(0, 8))}  ${chalk.cyan(session.mode.padEnd(10))}  ${chalk.white(session.provider.padEnd(10))}  ${chalk.gray(session.model)}  ${chalk.white(String(session.usage.totalTokens || 0).padStart(6))} tok  ${chalk.gray(timeAgo(session.timestamp))}`);
    console.log(`           ${chalk.gray(session.promptPreview.slice(0, 120).replace(/\s+/g, ' '))}`);
  }
  console.log();
}

async function runConfigMode(mode?: string) {
  const config = readConfig();
  if (!mode) {
    printLogo(); divider();
    console.log(chalk.bold('\n  Interaction Mode\n'));
    console.log('  ' + chalk.white(config.interactionMode || 'assist'));
    console.log();
    return;
  }
  if (mode !== 'assist' && mode !== 'auto') {
    errorMsg('Mode must be "assist" or "auto"');
    process.exit(1);
  }
  config.interactionMode = mode;
  writeConfig(config, 'project');
  success(`Interaction mode set to: ${mode}`);
}

async function runProfileList() {
  printLogo(); divider();
  const config = readConfig();
  const profiles = listProfiles();
  console.log(chalk.bold(`\n  Profiles (${profiles.length})\n`));
  if (profiles.length === 0) {
    warn('No profiles found. Create one: ghostrun profile:create staging https://staging.example.com');
    console.log();
    return;
  }
  for (const profile of profiles) {
    const active = config.activeProfile === profile.name ? chalk.green(' *') : '  ';
    const auth = profile.auth?.strategy || 'none';
    const acctCount = listAccountIds(profile).length;
    const acctHint = acctCount > 0 ? chalk.gray(`  ${acctCount} account(s)`) : '';
    console.log(`  ${chalk.white(profile.name)}${active}  ${chalk.gray((profile.baseUrl || '—').padEnd(36).slice(0, 36))}  ${chalk.cyan(auth)}${acctHint}`);
  }
  console.log();
}

async function runProfileShow(name: string) {
  printLogo(); divider();
  const profile = getProfile(name);
  if (!profile) {
    errorMsg('Profile not found: ' + name);
    process.exit(1);
  }
  console.log(chalk.bold(`\n  Profile: ${profile.name}\n`));
  console.log(`  Base URL: ${chalk.white(profile.baseUrl || '—')}`);
  console.log(`  Auth:     ${chalk.white(profile.auth?.strategy || 'none')}`);
  if (profile.auth?.loginFlow) console.log(`  Login:    ${chalk.white(profile.auth.loginFlow)}`);
  if (profile.auth?.storageState) console.log(`  State:    ${chalk.white(profile.auth.storageState)}`);
  if (profile.auth?.usernameVar) console.log(`  User Var: ${chalk.white(profile.auth.usernameVar)}`);
  if (profile.auth?.usernameSecret) console.log(`  User Sec: ${chalk.white(profile.auth.usernameSecret)}`);
  if (profile.auth?.passwordSecret) console.log(`  Pass Sec: ${chalk.white(profile.auth.passwordSecret)}`);
  if (profile.auth?.tokenSecret) console.log(`  Token:    ${chalk.white(profile.auth.tokenSecret)}`);
  const accountIds = listAccountIds(profile);
  if (accountIds.length) {
    console.log(chalk.bold('\n  Accounts:\n'));
    for (const id of accountIds) {
      const acc = getProfileAccount(profile, id)!;
      const def = profile.defaultAccount === id ? chalk.green(' (default)') : '';
      console.log(`  ${chalk.cyan(id)}${def}  ${chalk.gray(acc.label || '')}`);
      console.log(`    emailVar: ${chalk.yellow(acc.emailVar || 'testEmail')}  passwordSecret: ${chalk.yellow(acc.passwordSecret)}`);
      if (acc.emailSecret) console.log(`    emailSecret: ${chalk.yellow(acc.emailSecret)}`);
      if (acc.loginFlow) console.log(`    loginFlow: ${chalk.white(acc.loginFlow)}`);
    }
    console.log(chalk.gray('\n  Run: ghostrun run <flow> --profile ' + profile.name + ' --account <id>'));
  }
  const vars = profile.variables || {};
  console.log(`  Vars:     ${chalk.white(String(Object.keys(vars).length))}`);
  for (const [key, value] of Object.entries(vars)) {
    console.log(`    ${chalk.yellow(key)}=${chalk.gray(value)}`);
  }
  console.log();
}

async function runProfileCreate(name: string, baseUrl?: string) {
  ensureProjectWorkspace();
  if (getProfile(name)) {
    errorMsg(`Profile already exists: ${name}`);
    process.exit(1);
  }
  const profile: GhostrunProfile = {
    name,
    baseUrl: baseUrl || '',
    variables: {},
    auth: { strategy: 'none' },
    metadata: {},
  };
  saveProfile(profile);
  success(`Created profile: ${name}`);
  if (baseUrl) info(`Base URL: ${baseUrl}`);
}

async function runProfileUse(name: string) {
  const profile = getProfile(name);
  if (!profile) {
    errorMsg('Profile not found: ' + name);
    process.exit(1);
  }
  const config = readConfig();
  config.activeProfile = name;
  writeConfig(config, 'project');
  success(`Active profile set to: ${name}`);
}

async function runProfileSet(name: string, key: string, value: string) {
  const profile = getProfile(name);
  if (!profile) {
    errorMsg('Profile not found: ' + name);
    process.exit(1);
  }
  if (key === 'baseUrl') {
    profile.baseUrl = value;
  } else if (key.startsWith('auth.')) {
    profile.auth = profile.auth || {};
    (profile.auth as Record<string, string>)[key.slice(5)] = value;
  } else if (key.startsWith('meta.')) {
    profile.metadata = profile.metadata || {};
    profile.metadata[key.slice(5)] = value;
  } else {
    profile.variables = profile.variables || {};
    profile.variables[key] = value;
  }
  saveProfile(profile);
  success(`Updated profile "${name}": ${key}`);
}

async function runProfileDelete(name: string) {
  const profile = getProfile(name);
  if (!profile) {
    errorMsg('Profile not found: ' + name);
    process.exit(1);
  }
  const approved = await confirmAction(`  Delete profile "${chalk.yellow(name)}"? (y/N) `, false);
  if (!approved) {
    warn('Cancelled.');
    return;
  }
  deleteProfile(name);
  const config = readConfig();
  if (config.activeProfile === name) {
    delete config.activeProfile;
    writeConfig(config, 'project');
  }
  success(`Deleted profile: ${name}`);
}

async function runProfileAccountAdd(
  profileName: string,
  accountId: string,
  opts: { email?: string; emailSecret?: string; passwordSecret?: string; loginFlow?: string; label?: string; default?: boolean },
) {
  const profile = getProfile(profileName);
  if (!profile) {
    errorMsg('Profile not found: ' + profileName);
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
    loginFlow: opts.loginFlow,
  });
  profile.accounts = profile.accounts || {};
  profile.accounts[id] = account;
  if (opts.default || !profile.defaultAccount) profile.defaultAccount = id;
  if (!profile.auth || profile.auth.strategy === 'none') {
    profile.auth = {
      strategy: 'form',
      loginFlow: opts.loginFlow || profile.auth?.loginFlow || 'login',
      usernameVar: account.emailVar || 'testEmail',
    };
  }
  saveProfile(profile);
  success(`Added account "${id}" to profile "${profileName}"`);
  info(`Email var: ${account.emailVar}  → export ${account.emailSecret}=...`);
  info(`Password:  export ${account.passwordSecret}=...`);
  info(`Run: ghostrun run <flow> --profile ${profileName} --account ${id}`);
}

async function runProfileAccountsList(profileName: string) {
  const profile = getProfile(profileName);
  if (!profile) {
    errorMsg('Profile not found: ' + profileName);
    process.exit(1);
  }
  const ids = listAccountIds(profile);
  console.log(chalk.bold(`\n  Accounts on profile "${profileName}" (${ids.length})\n`));
  if (!ids.length) {
    warn('No accounts defined. Add one: ghostrun profile account add staging admin --email qa-admin@co.com');
    console.log();
    return;
  }
  for (const id of ids) {
    const acc = getProfileAccount(profile, id)!;
    const def = profile.defaultAccount === id ? chalk.green(' (default)') : '';
    console.log(`  ${chalk.cyan(id)}${def}  ${chalk.gray(acc.label || '')}`);
    console.log(`    ${chalk.yellow(acc.emailVar || 'testEmail')}  password: ${chalk.yellow(acc.passwordSecret)}`);
    if (acc.emailSecret) console.log(`    email env: ${chalk.yellow(acc.emailSecret)}`);
  }
  console.log();
}

async function runProfileAccountShow(profileName: string, accountId: string) {
  const profile = getProfile(profileName);
  if (!profile) {
    errorMsg('Profile not found: ' + profileName);
    process.exit(1);
  }
  const acc = getProfileAccount(profile, accountId);
  if (!acc) {
    errorMsg(`Account not found: ${accountId}. Defined: ${listAccountIds(profile).join(', ') || '(none)'}`);
    process.exit(1);
  }
  console.log(chalk.bold(`\n  Account: ${normalizeAccountId(accountId)} (${profileName})\n`));
  console.log(JSON.stringify(acc, null, 2));
  console.log();
}

async function setupProfileAccountsInteractive(staging: GhostrunProfile, clack: {
  confirm: typeof import('@clack/prompts').confirm;
  text: typeof import('@clack/prompts').text;
  isCancel: typeof import('@clack/prompts').isCancel;
  note: typeof import('@clack/prompts').note;
}) {
  const { confirm, text, isCancel, note } = clack;
  const addAccounts = await confirm({
    message: 'Configure QA accounts (superadmin, admin, manager, guest)?',
    initialValue: true,
  });
  if (isCancel(addAccounts) || !addAccounts) return;

  const loginFlow = await text({
    message: 'Login flow name (record this first if missing):',
    placeholder: 'login',
    defaultValue: 'login',
  });
  const flowName = !isCancel(loginFlow) && loginFlow ? String(loginFlow) : 'login';

  staging.auth = {
    strategy: 'form',
    loginFlow: flowName,
    usernameVar: 'testEmail',
  };

  const useDefaults = await confirm({
    message: 'Create all four roles now (superadmin, admin, manager, guest)?',
    initialValue: true,
  });
  if (!isCancel(useDefaults) && useDefaults) {
    const domain = await text({
      message: 'Email domain for QA users:',
      placeholder: 'yourapp.com',
      defaultValue: 'yourapp.com',
    });
    const emailDomain = !isCancel(domain) && domain ? String(domain) : 'yourapp.com';
    staging.accounts = buildDefaultSaaSAccounts(flowName, emailDomain);
    staging.defaultAccount = 'manager';
    staging.metadata = { ...staging.metadata, accountTypes: DEFAULT_SAAS_ACCOUNT_IDS.join(',') };
    saveProfile(staging);
    const lines = DEFAULT_SAAS_ACCOUNT_IDS.map(id => {
      const a = staging.accounts![id];
      return `  export ${a.emailSecret}='qa-${id}@${emailDomain}'\n  export ${a.passwordSecret}='...'`;
    });
    note(
      `Set passwords (emails are suggested defaults):\n${lines.join('\n')}\n\nRun by role:\n  ghostrun run <flow> --profile staging --account superadmin`,
      'Accounts: superadmin, admin, manager, guest'
    );
    return;
  }

  let addMore = true;
  while (addMore) {
    const role = await text({
      message: 'Account type id (superadmin, admin, manager, guest, …):',
      placeholder: 'manager',
      validate: v => (!v || !v.trim()) ? 'Required' : undefined,
    });
    if (isCancel(role) || !role) break;
    const id = normalizeAccountId(String(role));
    const email = await text({
      message: `Email for "${id}":`,
      placeholder: `qa-${id}@yourapp.com`,
      validate: v => (!v || !v.includes('@')) ? 'Enter a valid email' : undefined,
    });
    if (isCancel(email) || !email) break;
    const secrets = secretNamesForAccount(id);
    const account = buildAccountFromSecrets({
      id,
      label: id,
      email: String(email),
      emailSecret: secrets.email,
      passwordSecret: secrets.password,
      loginFlow: flowName,
    });
    staging.accounts = staging.accounts || {};
    staging.accounts[id] = account;
    if (!staging.defaultAccount) staging.defaultAccount = id;

    const another = await confirm({ message: 'Add another account type?', initialValue: false });
    addMore = !isCancel(another) && !!another;
  }

  saveProfile(staging);
  const lines = listAccountIds(staging).map(id => {
    const a = staging.accounts![id];
    return `  export ${a.emailSecret}='...'\n  export ${a.passwordSecret}='...'`;
  });
  note(
    `Set secrets before running flows:\n${lines.join('\n')}\n\nRun as a role:\n  ghostrun run checkout --profile staging --account admin`,
    'Multi-account staging'
  );
}

async function runImprove() {
  printLogo(); divider();
  ensureProjectWorkspace();
  const config = readConfig();
  const runs = db.listRuns(undefined, 50);
  const proposals = listRepairProposals(50);
  const sessions = listAiSessions(50);
  const activeProfile = config.activeProfile;
  const findings: string[] = [];
  const actions: string[] = [];
  const safeguards: string[] = [];

  const repeatedFailures = new Map<string, number>();
  for (const run of runs.filter(r => r.status === 'failed')) {
    const key = (run.errorMessage || 'unknown').slice(0, 120);
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

  const openProposals = proposals.filter(p => p.status === 'proposed');
  if (openProposals.length > 0) {
    findings.push(`${openProposals.length} open repair proposal(s) available.`);
    actions.push(`Review with: ghostrun repair list`);
  }

  const staleProposals = openProposals.filter(p => Date.now() - new Date(p.createdAt).getTime() > 7 * 86400000);
  if (staleProposals.length > 0) {
    findings.push(`${staleProposals.length} repair proposal(s) are older than 7 days.`);
    actions.push('Review stale proposals with: ghostrun repair list');
  }

  const neverRunFlows: string[] = [];
  const highFailureFlows: Array<{ name: string; rate: number; runs: number }> = [];
  const alwaysPassFlows: string[] = [];
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
    findings.push(`${neverRunFlows.length} flow(s) have never been run: ${neverRunFlows.slice(0, 5).join(', ')}`);
    actions.push('Add never-run flows to a smoke suite or remove dead assets.');
  }
  if (highFailureFlows.length) {
    for (const item of highFailureFlows.slice(0, 5)) {
      findings.push(`High failure rate (${item.rate.toFixed(0)}% over ${item.runs} runs): ${item.name}`);
    }
    actions.push('Inspect high-failure flows with ghostrun run:show and ghostrun repair list');
  }
  if (alwaysPassFlows.length) {
    findings.push(`${alwaysPassFlows.length} flow(s) always pass — possible coverage gaps: ${alwaysPassFlows.slice(0, 5).join(', ')}`);
  }

  const flakyFlows = detectFlakyFlows();
  if (flakyFlows.length) {
    findings.push(`Flaky flows detected: ${flakyFlows.slice(0, 5).join(', ')}`);
    actions.push('Stabilize flaky flows with stronger waits or isolated setup steps.');
  }

  const aiUsage = aggregateAiUsage();
  const authorSessions = sessions.filter(s => s.mode === 'author' || s.mode === 'create');
  if (authorSessions.length >= 5) {
    findings.push(`AI authoring used ${authorSessions.length} times recently (~$${aiUsage.estimatedCostUsd.toFixed(2)} estimated).`);
  }

  if (!activeProfile) {
    findings.push('No active profile is set.');
    actions.push('Create and select a profile for staging or production runs.');
  }

  if (runs.length === 0) {
    findings.push('No runs recorded yet.');
    actions.push('Run a smoke flow before using improve.');
  }

  if (sessions.length === 0) {
    findings.push('No AI sessions recorded yet.');
  }

  const blocked = safeguards.length > 0 && config.policies?.autoImproveEnabled;
  let summary: string | undefined;

  const prompt = [
    'You are improving a local-first test automation project.',
    'Summarize the highest-value next actions in 4 bullet points max.',
    'Do not suggest infinite retry loops.',
    '',
    `Auto improve enabled: ${config.policies?.autoImproveEnabled ? 'yes' : 'no'}`,
    `Active profile: ${activeProfile || 'none'}`,
    `Open repair proposals: ${openProposals.length}`,
    `Recent failed runs: ${runs.filter(r => r.status === 'failed').length}`,
    '',
    'Findings:',
    ...findings.map(f => `- ${f}`),
    '',
    'Safeguards:',
    ...(safeguards.length ? safeguards.map(s => `- ${s}`) : ['- none']),
  ].join('\n');

  if (config.policies?.autoImproveEnabled && !blocked) {
    const ai = await callAI(prompt, { mode: 'improve', metadata: { profile: activeProfile || '', openProposals: String(openProposals.length) } });
    if (ai?.text) summary = ai.text;
  }

  const report: ImproveReport = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    status: blocked ? 'blocked' : 'generated',
    autoImproveEnabled: Boolean(config.policies?.autoImproveEnabled),
    interactionMode: getInteractionMode(),
    activeProfile: activeProfile || undefined,
    findings,
    actions,
    summary,
    safeguards,
  };
  const reportPath = saveImproveReport(report);
  const markdownPath = path.join(path.dirname(reportPath), `${path.basename(reportPath, '.json')}.md`);
  const markdown = [
    '# GhostRun Improve Report',
    '',
    `- Generated: ${report.createdAt}`,
    `- Profile: ${activeProfile || '(none)'}`,
    `- Open repair proposals: ${openProposals.length}`,
    `- Stale proposals (>7d): ${staleProposals.length}`,
    `- High-failure flows: ${highFailureFlows.length}`,
    `- Never-run flows: ${neverRunFlows.length}`,
    `- Flaky flows: ${flakyFlows.length}`,
    '',
    '## Findings',
    ...(findings.length ? findings.map(f => `- ${f}`) : ['- none']),
    '',
    '## Suggested Actions',
    ...(actions.length ? actions.map(a => `- ${a}`) : ['- none']),
    ...(summary ? ['', '## AI Summary', summary] : []),
  ].join('\n');
  fs.writeFileSync(markdownPath, markdown);

  console.log(chalk.bold('\n  Improve Report\n'));
  console.log(`  Status:     ${blocked ? chalk.red('blocked') : chalk.green('generated')}`);
  console.log(`  Profile:    ${chalk.white(activeProfile || '(none)')}`);
  console.log(`  Open fixes: ${chalk.white(String(openProposals.length))}`);
  console.log(`  Failures:   ${chalk.white(String(runs.filter(r => r.status === 'failed').length))}`);
  if (findings.length) {
    console.log(chalk.bold('\n  Findings'));
    for (const finding of findings) console.log(`  - ${finding}`);
  }
  if (actions.length) {
    console.log(chalk.bold('\n  Suggested Actions'));
    for (const action of actions) console.log(`  - ${action}`);
  }
  if (summary) {
    console.log(chalk.bold('\n  AI Summary'));
    for (const line of summary.split('\n')) {
      if (line.trim()) console.log(`  ${line}`);
    }
  }
  if (safeguards.length) {
    console.log(chalk.bold('\n  Safeguards'));
    for (const s of safeguards) console.log(`  - ${chalk.yellow(s)}`);
  }
  console.log();
  info(`Saved: ${chalk.cyan(reportPath)}`);
  info(`Markdown: ${chalk.cyan(markdownPath)}`);
  console.log();
}

async function runRepairList() {
  printLogo(); divider();
  const proposals = listRepairProposals(50);
  console.log(chalk.bold(`\n  Repair Proposals (${proposals.length})\n`));
  if (proposals.length === 0) {
    warn('No repair proposals found.');
    console.log();
    return;
  }
  console.log(chalk.gray('  ID        Type       Status     Flow                       Step  Proposal'));
  console.log(chalk.gray('  ' + '─'.repeat(86)));
  for (const proposal of proposals) {
    const statusColor = proposal.status === 'applied' ? chalk.green : proposal.status === 'rejected' ? chalk.red : chalk.yellow;
    const repairType = getRepairType(proposal);
    const proposalText = proposal.proposedSelector
      || proposal.proposedValue
      || proposal.rationale?.slice(0, 24)
      || '—';
    console.log(`  ${chalk.gray(proposal.id.slice(0, 8))}  ${chalk.white(repairType.padEnd(10))} ${statusColor(proposal.status.padEnd(10))} ${chalk.white((proposal.flowName || '').padEnd(26).slice(0, 26))} ${chalk.gray(String(proposal.stepNumber || '—').padStart(4))}  ${chalk.cyan(String(proposalText).slice(0, 26))}`);
  }
  console.log();
}

async function runRepairShow(id: string) {
  printLogo(); divider();
  const found = findRepairProposal(id);
  if (!found) {
    errorMsg('Repair proposal not found: ' + id);
    process.exit(1);
  }
  const proposal = found.proposal;
  const repairType = getRepairType(proposal);
  console.log(chalk.bold(`\n  Repair Proposal: ${proposal.id.slice(0, 8)}\n`));
  console.log(`  Type:      ${chalk.white(repairType)}`);
  console.log(`  Flow:      ${chalk.white(proposal.flowName)}`);
  console.log(`  Status:    ${chalk.white(proposal.status)}`);
  console.log(`  Step:      ${chalk.white(String(proposal.stepNumber || '—'))}`);
  console.log(`  Action:    ${chalk.white(proposal.action || '—')}`);
  if (proposal.currentSelector) console.log(`  Selector:  ${chalk.gray(proposal.currentSelector)} → ${chalk.cyan(proposal.proposedSelector || '—')}`);
  if (proposal.currentValue || proposal.proposedValue) {
    console.log(`  Value:     ${chalk.gray(proposal.currentValue || '—')} → ${chalk.cyan(proposal.proposedValue || '—')}`);
  }
  if (proposal.errorMessage) console.log(`  Error:     ${chalk.red(proposal.errorMessage)}`);
  if (proposal.rationale) console.log(`  Why:       ${chalk.gray(proposal.rationale)}`);
  if (proposal.runId) console.log(`  Run:       ${chalk.gray(proposal.runId.slice(0, 8))}`);
  console.log();
}

function applyRepairProposal(id: string, mode: 'interactive' | 'auto' = 'interactive'): { ok: boolean; message: string; flowName?: string } {
  const found = findRepairProposal(id);
  if (!found) return { ok: false, message: `Repair proposal not found: ${id}` };
  const proposal = found.proposal;
  if (!proposal.flowId || !proposal.nodeId) {
    return { ok: false, message: 'Repair proposal is missing flow or node information.' };
  }

  const repairType = getRepairType(proposal);
  if (repairType === 'config' || repairType === 'url' || repairType === 'visual') {
    if (repairType === 'visual') {
      updateRepairProposal(proposal.id, {
        status: 'applied',
        rationale: `${proposal.rationale || ''} Acknowledged — re-run ghostrun baseline:set after UI changes.`,
      });
      return {
        ok: true,
        message: `Visual proposal acknowledged. Re-capture baselines: ghostrun baseline:set "${proposal.flowName}"`,
        flowName: proposal.flowName,
      };
    }
    return {
      ok: false,
      message: repairType === 'url'
        ? 'URL/config repairs must be applied manually to the profile or flow URL.'
        : 'Configuration repairs must be applied manually.',
    };
  }

  const flow = db.getFlow(proposal.flowId);
  if (!flow) return { ok: false, message: 'Flow not found for proposal.' };

  let graph: { nodes: Record<string, unknown>[]; edges: object[]; appUrl?: string };
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    return { ok: false, message: 'Flow graph is invalid.' };
  }

  const node = graph.nodes.find(n => String(n.id) === proposal.nodeId);
  if (!node) return { ok: false, message: 'Target node not found in flow.' };

  switch (repairType) {
    case 'selector':
      if (!proposal.proposedSelector) return { ok: false, message: 'Selector repair proposal is incomplete.' };
      node.selector = proposal.proposedSelector;
      break;
    case 'assertion':
      if (!proposal.proposedValue) return { ok: false, message: 'Assertion repair proposal is incomplete.' };
      node.value = proposal.proposedValue;
      break;
    case 'wait':
      node.action = 'wait:ms';
      node.value = proposal.proposedValue || '20000';
      break;
    default:
      return { ok: false, message: `Unsupported repair type: ${repairType}` };
  }

  db.updateFlow(flow.id, { graph });
  const rationale = proposal.rationale
    ? `${proposal.rationale} ${mode === 'auto' ? 'Auto-applied by GhostRun after policy and loop-guard checks.' : 'Applied by user review.'}`
    : (mode === 'auto' ? 'Auto-applied by GhostRun after policy and loop-guard checks.' : 'Applied by user review.');
  updateRepairProposal(proposal.id, { status: 'applied', rationale });
  return { ok: true, message: `Applied ${repairType} repair proposal to flow "${flow.name}"`, flowName: flow.name };
}

function applySelectorRepairProposal(id: string, mode: 'interactive' | 'auto' = 'interactive'): { ok: boolean; message: string; flowName?: string } {
  return applyRepairProposal(id, mode);
}

function autoApplySelectorRepairProposal(proposal: RepairProposal, context: { ci?: boolean; profile: GhostrunProfile | null; startUrl?: string; currentSelector?: string | null }): { applied: boolean; reason?: string } {
  const config = readConfig();
  const interactionMode = getInteractionMode();
  if (!config.policies?.allowAutoRepairApply) {
    return { applied: false, reason: 'config disallows auto-apply' };
  }
  if (interactionMode !== 'auto') {
    return { applied: false, reason: 'interaction mode is assist' };
  }
  if (context.ci) {
    return { applied: false, reason: 'CI mode forbids flow mutation' };
  }
  if (isProductionLike(context.profile, context.startUrl)) {
    return { applied: false, reason: 'production-like targets require review' };
  }
  if (!proposal.flowId || !proposal.nodeId || !proposal.proposedSelector) {
    return { applied: false, reason: 'proposal is incomplete' };
  }
  if (context.currentSelector && proposal.currentSelector && context.currentSelector !== proposal.currentSelector) {
    return { applied: false, reason: 'flow selector changed after proposal creation' };
  }

  const attemptCount = getSelectorRepairAttemptCount({ flowId: proposal.flowId, nodeId: proposal.nodeId });
  const maxAttempts = config.policies?.maxRepairAttemptsPerRun ?? 2;
  if (attemptCount >= maxAttempts) {
    return { applied: false, reason: `selector repair attempt limit reached (${maxAttempts})` };
  }

  const repeatCount = getRecentFailureRepeatCount(proposal.flowId, proposal.errorMessage || '');
  const maxRepeats = config.policies?.maxSameFailureRepeats ?? 2;
  if (repeatCount >= maxRepeats) {
    return { applied: false, reason: `same failure repeat limit reached (${maxRepeats})` };
  }

  const result = applySelectorRepairProposal(proposal.id, 'auto');
  return result.ok ? { applied: true } : { applied: false, reason: result.message };
}

async function runRepairApply(id: string) {
  const found = findRepairProposal(id);
  if (!found) {
    errorMsg('Repair proposal not found: ' + id);
    process.exit(1);
  }
  const proposal = found.proposal;
  const repairType = getRepairType(proposal);
  if (!proposal.flowId || !proposal.nodeId) {
    errorMsg('Repair proposal is missing flow or node information.');
    process.exit(1);
  }
  const flow = db.getFlow(proposal.flowId);
  if (!flow) {
    errorMsg('Flow not found for proposal.');
    process.exit(1);
  }

  console.log(chalk.bold(`\n  Apply Repair Proposal ${proposal.id.slice(0, 8)}\n`));
  console.log(`  Type:     ${chalk.white(repairType)}`);
  console.log(`  Flow:     ${chalk.white(flow.name)}`);
  if (proposal.proposedSelector) {
    console.log(`  Selector: ${chalk.gray(proposal.currentSelector || '—')} → ${chalk.cyan(proposal.proposedSelector)}`);
  }
  if (proposal.proposedValue) {
    console.log(`  Value:    ${chalk.gray(proposal.currentValue || '—')} → ${chalk.cyan(proposal.proposedValue)}`);
  }
  if (repairType === 'url' || repairType === 'config') {
    warn('This proposal must be applied manually to the profile or flow URL.');
    if (proposal.rationale) console.log(chalk.gray(`  Hint: ${proposal.rationale}`));
    return;
  }
  if (repairType === 'visual') {
    console.log(chalk.bold(`\n  Visual Regression Proposal ${proposal.id.slice(0, 8)}\n`));
    console.log(`  Flow:     ${chalk.white(flow.name)}`);
    console.log(`  Diff:     ${chalk.yellow(proposal.currentValue || '—')}`);
    console.log(chalk.gray(`  ${proposal.proposedValue || 'Run ghostrun baseline:set after intentional UI changes.'}`));
    const approved = await confirmAction(chalk.cyan('  Acknowledge and mark applied? (Y/n) '), true);
    if (!approved) { warn('Cancelled.'); return; }
    const result = applyRepairProposal(proposal.id, 'interactive');
    if (!result.ok) { errorMsg(result.message); process.exit(1); }
    success(result.message);
    return;
  }
  console.log();

  const approved = await confirmAction(chalk.cyan(`  Apply this ${repairType} change? (Y/n) `), true);
  if (!approved) {
    warn('Cancelled.');
    return;
  }

  const result = applyRepairProposal(proposal.id, 'interactive');
  if (!result.ok) {
    errorMsg(result.message);
    process.exit(1);
  }
  success(result.message);
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
  spaIndicators?: {
    hasRouter: boolean;
    hasVueApp: boolean;
    hasNgApp: boolean;
    hasLoadingState: boolean;
  };
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

function pageSignalScore(page: PageData): number {
  return page.interactives.forms.length * 4 +
    page.interactives.searchInputs.length * 3 +
    page.interactives.standaloneInputs.length * 2 +
    page.interactives.ctaButtons.length +
    Math.min(page.links.length, 8) * 0.25;
}

function shouldUseScrapeForExplore(pages: PageData[], candidates: FlowCandidate[]): boolean {
  if (!isCrawleeEnabled()) return false;
  if (pages.length === 0 || candidates.length === 0) return true;
  const usefulPages = pages.filter(p => pageSignalScore(p) >= 2).length;
  const genericButtonCount = pages.reduce((sum, p) =>
    sum + p.interactives.ctaButtons.filter(b => /^(learn more|read more|submit|continue|next|start|open|click)$/i.test(b.text.trim())).length, 0);
  const totalButtons = pages.reduce((sum, p) => sum + p.interactives.ctaButtons.length, 0);
  const hasSpaHints = pages.some(p => p.spaIndicators?.hasRouter || p.spaIndicators?.hasVueApp || p.spaIndicators?.hasNgApp || p.spaIndicators?.hasLoadingState);
  return usefulPages === 0 || (totalButtons > 0 && genericButtonCount / totalButtons > 0.6) || (hasSpaHints && candidates.length < 2);
}

function pageDataFromScrapedPage(p: ScrapedPage): PageData {
  const searchInputs = p.forms.flatMap(form => form.fields).filter(field =>
    field.type === 'search' || /search|query|find/i.test(`${field.name} ${field.placeholder} ${field.label}`)
  );
  const forms: PageForm[] = p.forms.map(form => ({
    selector: form.selector,
    method: 'get',
    fields: form.fields,
    submitSelector: form.submitSelector,
    submitText: form.submitText || 'Submit',
  }));
  return {
    url: p.url,
    title: p.title,
    headings: p.headings,
    links: p.links.map(l => l.href),
    screenshotPath: null,
    interactives: {
      forms,
      searchInputs,
      standaloneInputs: [],
      ctaButtons: p.buttons,
    },
    spaIndicators: {
      hasRouter: /react|next|router|__next|vite|app/i.test(p.text.slice(0, 2000)),
      hasVueApp: /vue|data-v-/.test(p.text.slice(0, 2000)),
      hasNgApp: /ng-|angular/i.test(p.text.slice(0, 2000)),
      hasLoadingState: /loading|spinner|skeleton/i.test(p.text.slice(0, 2000)),
    },
  };
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

      // Wait for JS-rendered content with multiple strategies
      // Strategy 1: Try networkidle (good for SPAs)
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      // Strategy 2: Wait for body to be visible (dynamic content)
      await page.waitForSelector('body', { state: 'visible', timeout: 5000 }).catch(() => {});
      // Strategy 3: Extra stabilization wait for SPAs
      await page.waitForTimeout(1000).catch(() => {});

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
          // Skip if button is visually hidden
          const style = window.getComputedStyle(btn);
          if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return;
          ctaButtons.push({ text, selector: bestSelector(btn) });
        });

        // Detect SPA navigation elements (client-side routing indicators)
        const spaIndicators = {
          hasRouter: !!document.querySelector('[data-reactroot], [data-rid], [id^="__"]'),
          hasVueApp: !!document.querySelector('[data-v-app], #app[data-v-]'),
          hasNgApp: !!document.querySelector('[ng-app], [data-ng-app]'),
          // Check for dynamic loading indicators (loading spinners, skeletons)
          hasLoadingState: !!document.querySelector('[class*="loading"], [class*="skeleton"], [class*="spinner"]'),
        };

        return { forms, searchInputs, standaloneInputs: standaloneInputs.slice(0, 5), ctaButtons: ctaButtons.slice(0, 8), spaIndicators };
      }).catch(() => ({ forms: [], searchInputs: [], standaloneInputs: [], ctaButtons: [], spaIndicators: undefined }));
      // ── End interactive extraction ────────────────────────────────

      const ssPath = path.join(screenshotsDir, `page-${pages.length + 1}.jpg`);
      await page.screenshot({ path: ssPath, type: 'jpeg', quality: 60 }).catch(() => {});
      const ssExists = fs.existsSync(ssPath);

      pages.push({ 
        url: page.url(), 
        title, 
        headings, 
        links: sameHostLinks, 
        screenshotPath: ssExists ? ssPath : null, 
        interactives,
        spaIndicators: interactives.spaIndicators,
      });

      for (const link of sameHostLinks) {
        const norm = normalize(link);
        if (!visited.has(norm) && !queued.has(norm)) {
          queue.push(norm);
          queued.add(norm);
        }
      }
    } catch (err) {
      // Log error but continue crawling other pages
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (pages.length < 5) { // Only log for first few pages to avoid spam
        console.log(chalk.yellow(`  Warning: Skipped ${url} — ${errorMsg}`));
      }
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
      // If form has a stable id/class, prepend it; otherwise use element's own selector
      const scopedSelector = form.selector && !form.selector.startsWith('form:nth')
        ? `${form.selector} ${f.selector}`  // form id/class + element selector
        : f.selector;  // use element's own selector when form has no stable id
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

        const result = await callAI(prompt, { mode: 'author', metadata: { source: 'explore' } });
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

  if (shouldUseScrapeForExplore(pages, candidates)) {
    const sScrape = spinner();
    sScrape.start('Explorer confidence is low — using Crawlee scrape fallback...');
    try {
      const scrape = await runCrawleeScrape(url, {
        maxPages: Math.min(Math.max(1, maxPages), 3),
        reason: 'explore-fallback',
        exploreReportId: report.id,
        quiet: true,
        requireEnabled: false,
      });
      const scrapePages = scrape.pages.map(pageDataFromScrapedPage);
      const combinedPages = deduplicatePages([...pages, ...scrapePages]);
      const scrapeCandidates = hasAI ? await analyzePages(combinedPages) : combinedPages.flatMap(p =>
        buildStepsFromInteractives(p).map(steps => ({
          name: p.title ? `${p.title} — ${steps.find(s => s.action !== 'navigate')?.action || 'check'}` : `Check ${new URL(p.url).pathname}`,
          description: `Automated flow enriched by Crawlee scrape on ${p.title || p.url}`,
          route: p.url,
          steps,
        }))
      );
      pages.push(...scrapePages.filter(sp => !pages.some(p => p.url === sp.url)));
      candidates = [...candidates, ...scrapeCandidates];
      sScrape.stop(`Crawlee fallback added ${scrape.pages.length} scraped page${scrape.pages.length !== 1 ? 's' : ''}`);
    } catch (err) {
      sScrape.stop('Crawlee fallback skipped');
      note(err instanceof Error ? err.message : String(err), 'Scrape fallback unavailable');
    }
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

  const parallelMode = process.argv.includes('--parallel');
  console.log(chalk.bold(`\n  Suite: ${suite.name}${parallelMode ? chalk.gray('  [parallel]') : ''}\n`));
  const lineWidth = 45;
  console.log(chalk.gray('  ' + '─'.repeat(lineWidth)));

  const results: Array<{ index: number; name: string; passed: boolean; duration: number; error?: string }> = [];
  const suiteStart = Date.now();

  if (parallelMode) {
    const settled = await Promise.all(
      flows.map((sf, i) =>
        executeFlow(sf.flowId, vars, { quiet: true })
          .then(result => ({ index: i + 1, name: sf.flowName, passed: result.passed, duration: result.duration }))
          .catch(err => ({ index: i + 1, name: sf.flowName, passed: false, duration: 0, error: String(err) }))
      )
    );
    results.push(...settled);

    // Print summary table after all complete
    results.forEach(r => {
      const status = r.passed ? chalk.green('✓') : chalk.red('✗');
      console.log(`   ${chalk.gray(String(r.index))}  ${chalk.white(r.name.padEnd(22).slice(0, 22))}  ${status}  ${chalk.gray(r.duration + 'ms')}`);
    });
  } else {
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

async function runCreate(description?: string, extraArgs: string[] = []) {
  const jsonOutput = parseFlagValue(extraArgs, '--output') === 'json' || extraArgs.includes('--json');
  const preview = extraArgs.includes('--preview');
  const noSave = preview || extraArgs.includes('--no-save');
  const profileName = parseFlagValue(extraArgs, '--profile') || readConfig().activeProfile || undefined;

  if (!jsonOutput) {
    printLogo(); divider();
  }

  if (!description) {
    const positional = extraArgs.filter(a => !a.startsWith('--') && extraArgs.indexOf(a) === extraArgs.lastIndexOf(a));
    description = positional.join(' ').trim();
  }
  if (!description) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Description required' }));
      process.exit(1);
    }
    description = await askQuestion(chalk.cyan('\n  Describe the automation flow: '));
    if (!description) { errorMsg('Description required'); process.exit(1); }
  }

  let baseUrl = parseFlagValue(extraArgs, '--base-url');
  if (!baseUrl && profileName) {
    baseUrl = getProfile(profileName)?.baseUrl;
  }
  if (!baseUrl) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Base URL required. Pass --base-url or --profile with baseUrl.' }));
      process.exit(1);
    }
    baseUrl = await askQuestion(chalk.cyan('  Base URL for this flow (e.g. http://localhost:3000): '));
    if (!baseUrl) { errorMsg('Base URL required'); process.exit(1); }
  }

  const hasAI = !!(await isOllamaRunning()) || !!process.env.ANTHROPIC_API_KEY;
  if (!hasAI) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'No AI provider available. Set ANTHROPIC_API_KEY or run Ollama.' }));
      process.exit(1);
    }
    errorMsg('No AI provider available. Run Ollama locally or set ANTHROPIC_API_KEY.');
    process.exit(1);
  }

  if (!jsonOutput) info('Generating flow from description...');

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

  const result = await callAI(prompt, { mode: 'author', metadata: { source: 'create', profile: profileName || '' } });
  if (!result) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'AI failed to generate flow.' }));
      process.exit(1);
    }
    errorMsg('AI failed to generate flow.');
    process.exit(1);
  }

  let steps: Array<{ name: string; action: string; url?: string; selector?: string; value?: string }>;
  try {
    const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim();
    steps = JSON.parse(cleaned);
    if (!Array.isArray(steps)) throw new Error('Not an array');
  } catch {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'AI returned invalid JSON.', preview: result.text.slice(0, 200) }));
      process.exit(1);
    }
    errorMsg('AI returned invalid JSON. Try again with a clearer description.');
    console.log(chalk.gray('  AI response: ' + result.text.slice(0, 200)));
    process.exit(1);
    return;
  }

  let flowName = 'Generated Flow';
  {
    const nameResult = await callAI(`Give a short (2-5 words) flow name for this automation: "${description}". Reply with ONLY the name, title-cased, no punctuation. Examples: "Login Flow", "Checkout Guest", "Search Products".`, { mode: 'author', metadata: { source: 'flow-naming' } });
    if (nameResult?.text) {
      const candidate = nameResult.text.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40);
      if (candidate.length >= 3) flowName = candidate;
    }
    if (flowName === 'Generated Flow') {
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

  const graph = { nodes, edges, appUrl: baseUrl };

  if (preview || noSave) {
    const payload = { preview: true, name: flowName, description, baseUrl, steps, graph };
    if (jsonOutput) {
      console.log(JSON.stringify(payload));
      return;
    }
    divider();
    info('Preview generated flow (not saved):');
    console.log(JSON.stringify(payload, null, 2));
    const saveApproved = await confirmAction(chalk.cyan('\n  Save this flow? (Y/n) '), true);
    if (!saveApproved) {
      warn('Preview only — flow not saved.');
      return;
    }
  }

  const flow = db.createFlow({ name: flowName, description, appUrl: baseUrl, graph, createdBy: 'agent' });

  if (jsonOutput) {
    console.log(JSON.stringify({
      flowId: flow.id,
      flowIdShort: flow.id.slice(0, 8),
      name: flowName,
      description,
      baseUrl,
      stepCount: steps.length,
      steps,
      runHint: `ghostrun run ${flow.id.slice(0, 8)}`,
    }));
    return;
  }

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
    const overwrite = await confirmAction(chalk.cyan('  Overwrite? (y/N) '), false);
    if (!overwrite) { info('Skipped.'); return; }
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

async function runInit(extraArgs: string[] = []) {
  const nonInteractive = extraArgs.includes('--yes') || extraArgs.includes('-y') || extraArgs.includes('--ci');
  printLogo(); divider();
  console.log(chalk.bold('\n  GhostRun Setup Wizard\n'));

  // 1. Ensure data directories
  fs.mkdirSync(path.join(DATA_PATH, 'data'), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'sessions'), { recursive: true });
  success('Data directory ready: ' + chalk.cyan(DATA_PATH));

  ensureProjectWorkspace();
  success('Project workspace ready: ' + chalk.cyan(PROJECT_GHOSTRUN_PATH));

  // 2. Check Playwright / Chromium
  const { execSync } = require('child_process') as typeof import('child_process');
  let chromiumOk = false;
  try {
    execSync('node -e "require(\'playwright\')"', { stdio: 'ignore' });
    chromiumOk = true;
    success('Playwright: installed');
  } catch { warn('Playwright not found'); }

  if (!chromiumOk) {
    const installPw = nonInteractive || await confirmAction(chalk.cyan('  Install Playwright + Chromium? (Y/n) '), true);
    if (installPw) {
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
      const installBrowser = nonInteractive || await confirmAction(chalk.cyan('  Chromium browser not found. Install it? (Y/n) '), true);
      if (installBrowser) {
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

    const choice = nonInteractive ? false : await confirmAction(chalk.cyan('  Try to start Ollama now? (y/N) '), false);
    if (choice) {
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

  // 4. Optional Crawlee scraping support
  console.log();
  if (isCrawleeEnabled()) {
    success('Scraping: Crawlee enabled');
  } else {
    const enableScraping = nonInteractive ? false : await confirmAction(chalk.cyan('  Enable optional website scraping with Crawlee? (y/N) '), false);
    if (enableScraping) {
      try {
        await loadCrawlee();
        setCrawleeEnabled(true);
        success('Scraping: Crawlee enabled');
      } catch {
        warn('Crawlee package not found. Install it, then rerun init:');
        console.log(chalk.cyan('  npm install crawlee'));
      }
    }
  }

  // 5. Create .ghostrun.env template in CWD if missing
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

  const projectConfig = readConfig();
  info(`Interaction mode: ${projectConfig.interactionMode || 'assist'}`);
  info(`AI usage tracking: ${projectConfig.ai?.trackUsage === false ? 'disabled' : 'enabled'}`);
  info('Run `ghostrun audit` to check for secret leaks before committing');

  divider();
  console.log(chalk.bold.green('\n  Setup complete!\n'));
  console.log('  ' + chalk.gray('Record a flow:   ') + chalk.cyan('ghostrun learn https://your-app.com'));
  console.log('  ' + chalk.gray('Run a flow:      ') + chalk.cyan('ghostrun run <name>'));
  console.log('  ' + chalk.gray('Run (visible):   ') + chalk.cyan('ghostrun run <name> --visible'));
  if (isCrawleeEnabled()) {
    console.log('  ' + chalk.gray('Scrape a site:   ') + chalk.cyan('ghostrun scrape https://your-app.com --output json'));
  }
  console.log('  ' + chalk.gray('Ask the bot:     ') + chalk.cyan('ghostrun chat'));
  console.log('  ' + chalk.gray('Browse templates:') + chalk.cyan('ghostrun store list'));
  console.log();
}

// ============================================
// COMMANDS — monitor (extract + diff)
// ============================================

async function runMonitorOnce(flowId: string) {
  printLogo(); divider();

  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) { errorMsg('Flow not found: ' + flowId); process.exit(1); }

  const outputIdx = process.argv.indexOf('--output');
  const jsonOutput = outputIdx !== -1 && process.argv[outputIdx + 1] === 'json';

  console.log(chalk.bold('\n  Monitor: ') + chalk.white(flow.name) + '\n');

  // Get previous run's extracted data for diff
  const previousRuns = db.listRuns(flow.id, 2);
  const prevData: Record<string, string> = {};
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
// COMMANDS — scrape
// ============================================

async function runScrapeCommand(url: string, extraArgs: string[] = []) {
  const maxPages = parseNumberFlag(extraArgs, '--max-pages', 1, 100);
  const selector = parseFlagValue(extraArgs, '--selector');
  const jsonOutput = parseFlagValue(extraArgs, '--output') === 'json' || extraArgs.includes('--json');

  if (!jsonOutput) {
    printLogo(); divider();
    console.log(chalk.bold('\n  Scrape Website\n'));
    info('URL: ' + chalk.cyan(url));
    info('Max pages: ' + chalk.white(String(maxPages)));
    if (selector) info('Selector: ' + chalk.white(selector));
    console.log();
  }

  try {
    const result = await runCrawleeScrape(url, { maxPages, selector, reason: 'manual', quiet: jsonOutput });
    if (jsonOutput) {
      console.log(JSON.stringify({
        scrapeId: result.id,
        status: result.status,
        url: result.url,
        pages: result.pages.length,
        resultPath: result.resultPath,
        data: result.pages,
      }));
      return;
    }
    success(`Scraped ${result.pages.length} page${result.pages.length !== 1 ? 's' : ''}`);
    info('Scrape ID: ' + chalk.gray(result.id.slice(0, 8)));
    info('Result: ' + chalk.cyan(result.resultPath));
    const first = result.pages[0];
    if (first) {
      console.log();
      console.log(chalk.bold('  Preview\n'));
      if (first.title) console.log('  ' + chalk.gray('Title:   ') + chalk.white(first.title));
      if (first.headings.length) console.log('  ' + chalk.gray('Headings: ') + first.headings.slice(0, 4).join(chalk.gray(' · ')));
      if (first.buttons.length) console.log('  ' + chalk.gray('Buttons: ') + first.buttons.slice(0, 6).map(b => b.text).join(chalk.gray(' · ')));
    }
    console.log();
  } catch (err) {
    if (jsonOutput) {
      console.log(JSON.stringify({ status: 'failed', error: err instanceof Error ? err.message : String(err) }));
    } else {
      errorMsg(err instanceof Error ? err.message : String(err));
    }
    process.exitCode = 1;
  }
}

async function runScrapeAndFlowCommand(url: string, extraArgs: string[] = []) {
  const flowId = parseFlagValue(extraArgs, '--flow');
  if (!flowId) { errorMsg('Usage: scrape:run <url> --flow <id|name> [--max-pages N] [--output json]'); process.exit(1); }

  const maxPages = parseNumberFlag(extraArgs, '--max-pages', 1, 100);
  const selector = parseFlagValue(extraArgs, '--selector');
  const jsonOutput = parseFlagValue(extraArgs, '--output') === 'json' || extraArgs.includes('--json');

  let scrapeResult: ScrapeResult | null = null;
  try {
    scrapeResult = await runCrawleeScrape(url, { maxPages, selector, reason: 'scrape-run', quiet: jsonOutput });
    const runResult = await executeFlow(flowId, globalVars, { jsonOutput, quiet: jsonOutput });
    if (jsonOutput) {
      console.log(JSON.stringify({
        scrape: {
          scrapeId: scrapeResult.id,
          status: scrapeResult.status,
          pages: scrapeResult.pages.length,
          resultPath: scrapeResult.resultPath,
          data: scrapeResult.pages,
        },
        run: runResult,
      }));
      return;
    }
    divider();
    success(`Scraped ${scrapeResult.pages.length} page${scrapeResult.pages.length !== 1 ? 's' : ''} and ran flow`);
    info('Scrape ID: ' + chalk.gray(scrapeResult.id.slice(0, 8)));
    info('Run ID: ' + chalk.gray(runResult.runId.slice(0, 8)));
    console.log();
  } catch (err) {
    if (jsonOutput) {
      console.log(JSON.stringify({
        scrape: scrapeResult ? { scrapeId: scrapeResult.id, resultPath: scrapeResult.resultPath } : null,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }));
    } else {
      errorMsg(err instanceof Error ? err.message : String(err));
    }
    process.exitCode = 1;
  }
}

async function runScrapeList() {
  const scrapes = db.listScrapeRuns(20);
  console.log(chalk.bold('\n  Scrapes\n'));
  if (scrapes.length === 0) {
    warn('No scrapes found. Run: ' + chalk.cyan('ghostrun scrape <url>'));
    console.log();
    return;
  }
  console.log(chalk.gray('  ID        Status     Pages  Reason          URL'));
  console.log(chalk.gray('  ' + '─'.repeat(86)));
  for (const s of scrapes) {
    const status = s.status === 'complete' ? chalk.green('complete') : s.status === 'failed' ? chalk.red('failed') : chalk.yellow(s.status);
    console.log(`  ${chalk.gray(s.id.slice(0, 8))}  ${status.padEnd(18)} ${chalk.white(String(s.pagesCount).padEnd(5))}  ${chalk.gray((s.reason || '').padEnd(14).slice(0, 14))} ${chalk.cyan(s.url.slice(0, 44))}`);
  }
  console.log();
}

async function runScrapeShow(id: string) {
  const scrape = db.findScrapeRunByPartialId(id);
  if (!scrape) { errorMsg('Scrape not found: ' + id); process.exit(1); }
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
    data: result?.pages || [],
  }, null, 2));
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

## Important Response Rules
1. Be concise and practical — developers prefer direct answers
2. If asked to RUN an existing flow, respond with exactly: [RUN: <flow-name>]
3. Never invent flow names, IDs, or commands — only reference what exists in the lists below
4. If you don't know something, say so — don't guess
5. When suggesting fixes, be specific and actionable

## Core Commands
- ghostrun learn <url>          — Record a flow (real browser)
- ghostrun run <id|name>        — Run headlessly
- ghostrun run <name> --visible — Run with visible browser (for debugging)
- ghostrun run <name> --output json — JSON output with extracted data
- ghostrun flow:list            — List flows with pass rates
- ghostrun run:list             — Recent runs
- ghostrun run:show <id>        — Per-step details + screenshots
- ghostrun run:analyze <id>     — AI failure analysis
- ghostrun flow:fix <id>        — Fix broken selectors interactively
- ghostrun flow:create <desc>   — Generate flow from description
- ghostrun chat                 — This chat interface
- ghostrun init                 — Setup wizard
- ghostrun status               — Stats + AI provider info
- ghostrun serve --ui           — Web dashboard at http://localhost:3000

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
👤 human = recorded live · 🤖 agent = AI-generated (via create/explore)

## YOUR FLOWS RIGHT NOW
${flowsList}

## RECENT RUN HISTORY
${runsList}

When a flow fails, check if recent runs have the same issue. Suggest specific fixes based on the error patterns.`;
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
          model: 'claude-3-5-haiku-20241022',
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
// HOME — zero-config entry (just `ghostrun`)
// ============================================

interface HomeState {
  globalReady: boolean;
  projectReady: boolean;
  hasFlows: boolean;
  flowCount: number;
  hasProfiles: boolean;
  profileCount: number;
  openRepairs: number;
  lastFailedRun: { id: string; flowName: string } | null;
  cwd: string;
  projectName: string | null;
  activeProfile: string | null;
}

function detectHomeState(): HomeState {
  const globalReady = fs.existsSync(path.join(DATA_PATH, 'data', 'ghostrun.db'));
  const projectReady = fs.existsSync(PROJECT_CONFIG_PATH);
  const flows = db.listFlows();
  const profilesDir = path.join(PROJECT_GHOSTRUN_PATH, 'profiles');
  const profileCount = fs.existsSync(profilesDir)
    ? fs.readdirSync(profilesDir).filter(f => f.endsWith('.json')).length
    : 0;
  const openRepairs = listRepairProposals(50).filter(p => p.status === 'proposed').length;
  const recentRuns = db.listRuns(undefined, 10);
  const lastFail = recentRuns.find(r => r.status === 'failed');
  const config = readConfig();
  return {
    globalReady,
    projectReady,
    hasFlows: flows.length > 0,
    flowCount: flows.length,
    hasProfiles: profileCount > 0,
    profileCount,
    openRepairs,
    lastFailedRun: lastFail
      ? { id: lastFail.id, flowName: db.getFlow(lastFail.flowId)?.name || 'Unknown' }
      : null,
    cwd: process.cwd(),
    projectName: config.project?.name || null,
    activeProfile: config.activeProfile || null,
  };
}

async function runSetupFunnel(state: HomeState): Promise<void> {
  const clack = await import('@clack/prompts');
  const { intro, confirm, isCancel, note, outro, text } = clack;

  if (!state.globalReady) {
    console.clear();
    printLogo();
    intro(chalk.cyan(' Welcome to GhostRun '));
    note(
      'First-time setup installs Playwright Chromium and creates ~/.ghostrun/\nYou only do this once per machine.',
      'Setup required'
    );
    const setup = await confirm({ message: 'Set up GhostRun now?', initialValue: true });
    if (isCancel(setup) || !setup) {
      outro('Run ghostrun init when you are ready.');
      process.exit(0);
    }
    console.log();
    await runInit(['--yes']);
    return runSetupFunnel(detectHomeState());
  }

  if (!state.projectReady) {
    console.clear();
    printLogo();
    intro(chalk.cyan(' New project '));
    note(
      `No ${chalk.cyan('.ghostrun/')} in:\n  ${state.cwd}\n\nFlows, profiles, baselines, and CI artifacts live here — commit .ghostrun/ to git (exclude secrets).`,
      'Project workspace'
    );
    const initProject = await confirm({ message: 'Initialize GhostRun in this folder?', initialValue: true });
    if (isCancel(initProject) || !initProject) {
      outro('Open your app repo and run ghostrun again, or run ghostrun init.');
      process.exit(0);
    }
    ensureProjectWorkspace();
    const config = readConfig();
    if (!config.project?.name) {
      const name = await text({
        message: 'Project name (for reports):',
        placeholder: path.basename(state.cwd),
        defaultValue: path.basename(state.cwd),
      });
      if (!isCancel(name) && name) {
        config.project = { ...config.project, name: String(name), workspaceVersion: '1' };
        writeConfig(config);
      }
    }
    if (!state.hasProfiles) {
      const addProfile = await confirm({ message: 'Create a staging profile with a base URL?', initialValue: true });
      if (!isCancel(addProfile) && addProfile) {
        const baseUrl = await text({
          message: 'Staging / app URL:',
          placeholder: 'https://staging.yourapp.com',
          validate: v => (!v || !v.startsWith('http')) ? 'Enter a URL starting with http' : undefined,
        });
        if (!isCancel(baseUrl) && baseUrl) {
          await runProfileCreate('staging', String(baseUrl));
          const staging = getProfile('staging');
          if (staging) {
            await setupProfileAccountsInteractive(staging, { confirm, text, isCancel, note });
            const useMailpit = await confirm({
              message: 'Enable Mailpit for magic-link email flows? (optional — skip if you use password login)',
              initialValue: false,
            });
            if (!isCancel(useMailpit) && useMailpit) {
              staging.services = {
                ...staging.services,
                email: { provider: 'mailpit', apiUrl: 'http://localhost:8025', timeoutMs: 45000 },
              };
              saveProfile(staging);
              copyDevServicesTemplate();
              note(
                'Start Mailpit when needed:\n  docker compose -f .ghostrun/services/dev.compose.yml --profile mailpit up -d',
                'Optional email'
              );
            }
          }
          await runProfileUse('staging');
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

// ============================================
// INTERACTIVE MODE
// ============================================

async function runInteractive(initialState?: HomeState) {
  const clack = await import('@clack/prompts');
  const { intro, outro, select, text, isCancel, note, log } = clack;

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
  const activeProfile = readConfig().activeProfile || '(none)';

  intro(chalk.cyan(' GhostRun — your QA agent '));

  let homeState = initialState || detectHomeState();
  const hints: string[] = [];
  if (!homeState.hasFlows) hints.push('→ Record your first flow to get started');
  if (homeState.hasFlows && !homeState.activeProfile) hints.push('→ Set a profile: ghostrun profile use staging');
  if (homeState.lastFailedRun) hints.push(`→ Last failure: ${homeState.lastFailedRun.flowName}`);
  if (homeState.openRepairs > 0) hints.push(`→ ${homeState.openRepairs} repair proposal(s) waiting for review`);
  if (hints.length) {
    note(hints.map(h => `  ${h}`).join('\n'), 'Suggested');
  }

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
      `  Profile:  ${chalk.cyan(activeProfile)}`,
      `  AI:       ${ollamaModel ? chalk.green(aiProvider) : process.env.ANTHROPIC_API_KEY ? chalk.cyan(aiProvider) : chalk.gray('none — run Ollama or set ANTHROPIC_API_KEY')}`,
    ].filter(Boolean).join('\n'),
    'Status'
  );

  while (true) {
    homeState = detectHomeState();
    const menuOptions: Array<{ value: string; label: string; hint?: string }> = [];

    if (homeState.lastFailedRun) {
      menuOptions.push({
        value: 'last-failure',
        label: '🔴 Review last failure',
        hint: homeState.lastFailedRun.flowName,
      });
    }
    if (homeState.openRepairs > 0) {
      menuOptions.push({
        value: 'repair',
        label: '🛠  Review repair proposals',
        hint: `${homeState.openRepairs} open`,
      });
    }
    if (!homeState.hasFlows) {
      menuOptions.push({
        value: 'author',
        label: '✍  Record your first flow',
        hint: 'opens browser — no commands to memorize',
      });
    } else {
      menuOptions.push({
        value: 'run',
        label: '▶  Run a flow',
        hint: `${homeState.flowCount} saved`,
      });
      menuOptions.push({
        value: 'author',
        label: '✍  Create or capture flows',
        hint: 'record, generate, explore, API',
      });
    }
    menuOptions.push(
      { value: 'suite', label: '🧪 Run a test suite', hint: 'multiple flows' },
      { value: 'profiles', label: '🗂  Manage profiles', hint: homeState.activeProfile || 'none set' },
      { value: 'improve', label: '📈 Improve & analyze', hint: 'flaky flows, gaps' },
      { value: 'reports', label: '📋 View run reports', hint: runs.length > 0 ? `${runs.length} runs` : 'no runs yet' },
      { value: 'monitor', label: '🕐 Monitor & schedules', hint: 'interval + cron' },
      { value: 'services', label: '📬 Service Bridge', hint: 'optional — Mailpit, webhooks' },
      { value: 'doctor', label: '🩺 Health check', hint: 'doctor + audit' },
      { value: 'chat', label: '💬 Ask GhostRun Bot', hint: 'natural language' },
      { value: 'serve', label: '🌐  Web dashboard', hint: 'local UI' },
      { value: 'exit', label: '✕  Exit' },
    );

    const action = await select({
      message: 'What do you want to do?',
      options: menuOptions,
    });

    if (isCancel(action) || action === 'exit') {
      outro(chalk.gray('Bye.'));
      process.exit(0);
    }

    if (action === 'last-failure' && homeState.lastFailedRun) {
      console.log();
      await runShowRun(homeState.lastFailedRun.id.slice(0, 8));
      const evidenceReport = path.join(getRunEvidenceDir(homeState.lastFailedRun.id), 'report.html');
      if (fs.existsSync(evidenceReport)) {
        log.info(`Full report: ${evidenceReport}`);
      }
      console.log();
      await _pause();
      continue;
    }

    if (action === 'doctor') {
      console.log();
      await runDoctor();
      await runSecurityAudit(false);
      console.log();
      await _pause();
      continue;
    }

    if (action === 'services') {
      const svc = await select({
        message: 'Service Bridge:',
        options: [
          { value: 'doctor', label: 'Health check (Mailpit + hooks)' },
          { value: 'inbox', label: 'Show Mailpit inbox' },
          { value: 'hooks', label: 'List webhook captures' },
          { value: 'up', label: 'Show docker compose command' },
          { value: 'back', label: '← Back' },
        ],
      });
      if (isCancel(svc) || svc === 'back') continue;
      console.log();
      if (svc === 'up') await runServicesCommand(['up']);
      else await runServicesCommand([svc as string]);
      await _pause();
      continue;
    }

    if (action === 'monitor') {
      const mon = await select({
        message: 'Monitoring:',
        options: [
          { value: 'schedule-list', label: 'List schedules' },
          { value: 'schedule-add', label: 'Add schedule' },
          { value: 'daemon', label: 'Start scheduler daemon' },
          { value: 'back', label: '← Back' },
        ],
      });
      if (isCancel(mon) || mon === 'back') continue;
      if (mon === 'schedule-list') { console.log(); await runScheduleList(); await _pause(); }
      else if (mon === 'daemon') { console.log(); await runServe(['--daemon']); }
      else if (mon === 'schedule-add') {
        const flowsNow = db.listFlows();
        if (!flowsNow.length) { log.warn('Record a flow first.'); continue; }
        const fc = await select({ message: 'Flow:', options: flowsNow.map(f => ({ value: f.id, label: f.name })) });
        if (isCancel(fc)) continue;
        const cron = await text({ message: 'Cron expression:', placeholder: '0 9 * * *', defaultValue: '0 9 * * *' });
        if (isCancel(cron)) continue;
        const flow = db.getFlow(fc as string);
        if (flow) await runScheduleAdd(flow.name, String(cron));
        await _pause();
      }
      continue;
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

    // ── AUTHOR ──────────────────────────────────────────────
    else if (action === 'author') {
      const authorAction = await select({
        message: 'How do you want to create a flow?',
        options: [
          { value: 'record',  label: 'Record browser flow', hint: 'capture clicks and fills' },
          { value: 'generate', label: 'Generate from description', hint: 'AI draft flow' },
          { value: 'explore', label: 'Explore a URL', hint: 'discover candidate flows' },
          { value: 'api',     label: 'Build API flow', hint: 'interactive HTTP flow builder' },
          { value: 'back',    label: '← Back' },
        ],
      });
      if (isCancel(authorAction) || authorAction === 'back') continue;

      if (authorAction === 'record') {
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
      } else if (authorAction === 'generate') {
        const description = await text({
          message: 'Describe the flow:',
          placeholder: 'Login as admin and verify dashboard loads',
          validate: v => !v ? 'Description required' : undefined,
        });
        if (isCancel(description)) continue;
        console.log();
        await runCreate(description as string);
      } else if (authorAction === 'explore') {
        const url = await text({
          message: 'URL to explore:',
          placeholder: 'https://yourapp.com',
          validate: v => (!v || !v.startsWith('http')) ? 'Enter a valid URL starting with http' : undefined,
        });
        if (isCancel(url)) continue;
        console.log();
        await runExplore(url as string);
        await _pause();
      } else if (authorAction === 'api') {
        console.log();
        await runApiLearn();
      }
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

    // ── REPAIR ──────────────────────────────────────────────
    else if (action === 'repair') {
      const repairAction = await select({
        message: 'Repair proposals:',
        options: [
          { value: 'list', label: 'List proposals' },
          { value: 'apply', label: 'Apply a proposal' },
          { value: 'back', label: '← Back' },
        ],
      });
      if (isCancel(repairAction) || repairAction === 'back') continue;
      if (repairAction === 'list') {
        console.log();
        await runRepairList();
        await _pause();
      } else if (repairAction === 'apply') {
        const proposals = listRepairProposals(20).filter(p => p.status === 'proposed');
        if (proposals.length === 0) {
          log.warn('No open repair proposals.');
          continue;
        }
        const choice = await select({
          message: 'Which repair proposal?',
          options: proposals.map(p => ({
            value: p.id,
            label: `${p.flowName} · step ${p.stepNumber || '—'}`,
            hint: (p.proposedSelector || '').slice(0, 40),
          })),
        });
        if (isCancel(choice)) continue;
        console.log();
        await runRepairApply(choice as string);
        await _pause();
      }
    }

    // ── PROFILES ────────────────────────────────────────────
    else if (action === 'profiles') {
      const profileAction = await select({
        message: 'Profile management:',
        options: [
          { value: 'list', label: 'List profiles' },
          { value: 'create', label: 'Create profile' },
          { value: 'use', label: 'Use profile' },
          { value: 'show', label: 'Show profile' },
          { value: 'back', label: '← Back' },
        ],
      });
      if (isCancel(profileAction) || profileAction === 'back') continue;
      if (profileAction === 'list') {
        console.log();
        await runProfileList();
        await _pause();
      } else if (profileAction === 'create') {
        const name = await text({ message: 'Profile name:', placeholder: 'staging', validate: v => !v ? 'Required' : undefined });
        if (isCancel(name)) continue;
        const url = await text({ message: 'Base URL (optional):', placeholder: 'https://staging.example.com' });
        if (isCancel(url)) continue;
        await runProfileCreate(name as string, (url as string) || undefined);
      } else if (profileAction === 'use') {
        const profiles = listProfiles();
        if (profiles.length === 0) { log.warn('No profiles found.'); continue; }
        const choice = await select({ message: 'Which profile?', options: profiles.map(p => ({ value: p.name, label: p.name, hint: p.baseUrl || '' })) });
        if (isCancel(choice)) continue;
        await runProfileUse(choice as string);
      } else if (profileAction === 'show') {
        const profiles = listProfiles();
        if (profiles.length === 0) { log.warn('No profiles found.'); continue; }
        const choice = await select({ message: 'Which profile?', options: profiles.map(p => ({ value: p.name, label: p.name, hint: p.baseUrl || '' })) });
        if (isCancel(choice)) continue;
        console.log();
        await runProfileShow(choice as string);
        await _pause();
      }
    }

    // ── IMPROVE ─────────────────────────────────────────────
    else if (action === 'improve') {
      console.log();
      await runImprove();
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
  const run = db.findRunByPartialId(runId) || db.getRun(runId);
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
// COMMANDS — Performance Testing
// ============================================

function parsePerfArgs(extraArgs: string[]): PerfConfig {
  const get = (flag: string, def: number) => {
    const idx = extraArgs.indexOf(flag);
    if (idx === -1) return def;
    const raw = extraArgs[idx + 1] || '';
    return parseInt(raw.replace(/[^0-9]/g, '')) || def;
  };
  const getDurationMs = (flag: string, defSec: number): number => {
    const idx = extraArgs.indexOf(flag);
    if (idx === -1) return defSec * 1000;
    const raw = extraArgs[idx + 1] || String(defSec);
    const num = parseInt(raw.replace(/[^0-9]/g, '')) || defSec;
    if (raw.endsWith('ms')) return num;
    return num * 1000; // treat as seconds by default
  };
  return {
    vus: get('--vus', 10),
    duration: getDurationMs('--duration', 30),
    rampUp: getDurationMs('--ramp-up', 5),
    timeout: getDurationMs('--timeout', 10),
  };
}

function renderPerfStats(stats: PerfStats, checksTotal: number, checksFailed: number, perStep: Record<string, PerfStats>, flowName: string, config: PerfConfig): void {
  const errColor = stats.errorRate > 5 ? chalk.red : stats.errorRate > 1 ? chalk.yellow : chalk.green;
  const p95Color = stats.p95 > 1000 ? chalk.red : stats.p95 > 500 ? chalk.yellow : chalk.green;
  const checkPassRate = checksTotal > 0 ? parseFloat((((checksTotal - checksFailed) / checksTotal) * 100).toFixed(1)) : 100;
  const checkColor = checksFailed > 0 ? chalk.red : chalk.green;

  divider();
  console.log(chalk.bold.white('\n  PERFORMANCE RESULTS') + chalk.gray(` — ${flowName}`));
  console.log(chalk.gray(`  VUs: ${config.vus}  Duration: ${config.duration / 1000}s  Ramp-up: ${config.rampUp / 1000}s\n`));

  // Summary box
  const w = 46;
  const line = (label: string, val: string) =>
    `  │  ${label.padEnd(22)}${val.padStart(w - 26)}  │`;

  console.log(`  ┌${'─'.repeat(w)}┐`);
  console.log(`  │  ${'Summary'.padEnd(w - 2)}│`);
  console.log(`  ├${'─'.repeat(w)}┤`);
  console.log(line('HTTP Requests', chalk.white(stats.total.toLocaleString())));
  console.log(line('Throughput', chalk.cyan(stats.avgRps + ' req/s')));
  console.log(line('HTTP Success', chalk.green(`${(100 - stats.errorRate).toFixed(1)}%  (${stats.success.toLocaleString()})`)));
  console.log(line('HTTP Errors', errColor(`${stats.errorRate}%  (${stats.failed.toLocaleString()})`)));
  if (checksTotal > 0) {
    console.log(line('Checks Passed', checkColor(`${checkPassRate}%  (${(checksTotal - checksFailed).toLocaleString()} / ${checksTotal.toLocaleString()})`)));
    if (checksFailed > 0) console.log(line('Checks Failed', chalk.red(`${checksFailed.toLocaleString()} assertion failures`)));
  }
  console.log(`  ├${'─'.repeat(w)}┤`);
  console.log(`  │  ${'Latency'.padEnd(w - 2)}│`);
  console.log(`  ├${'─'.repeat(w)}┤`);
  console.log(line('p50  (median)', chalk.green(stats.p50 + 'ms')));
  console.log(line('p95', p95Color(stats.p95 + 'ms')));
  console.log(line('p99', stats.p99 > 2000 ? chalk.red(stats.p99 + 'ms') : chalk.yellow(stats.p99 + 'ms')));
  console.log(line('min / max', chalk.gray(`${stats.min}ms / ${stats.max}ms`)));
  console.log(`  └${'─'.repeat(w)}┘`);

  // Per-step table
  const stepNames = Object.keys(perStep);
  if (stepNames.length > 1) {
    console.log(chalk.bold('\n  Per Step:\n'));
    console.log(chalk.gray(`  ${'Step'.padEnd(38)} ${'Req'.padStart(6)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'Err%'.padStart(6)}`));
    console.log(chalk.gray('  ' + '─'.repeat(68)));
    for (const [label, s] of Object.entries(perStep)) {
      const errPct = s.errorRate;
      const errStr = errPct > 0 ? chalk.red(errPct.toFixed(1) + '%') : chalk.green('0%');
      const p95Str = s.p95 > 500 ? chalk.yellow(s.p95 + 'ms') : chalk.green(s.p95 + 'ms');
      const truncLabel = label.length > 37 ? label.slice(0, 34) + '...' : label;
      console.log(`  ${chalk.white(truncLabel.padEnd(38))} ${s.total.toString().padStart(6)} ${String(s.p50 + 'ms').padStart(7)} ${p95Str.padStart(7)} ${errStr.padStart(6)}`);
    }
  }
  console.log();
}

async function runPerfRun(flowId: string, extraArgs: string[]): Promise<void> {
  const config = parsePerfArgs(extraArgs);
  printLogo(); divider();

  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) { errorMsg('Flow not found: ' + flowId); process.exit(1); }

  console.log(chalk.bold(`\n  Load Test: ${chalk.white(flow.name)}`));
  console.log(chalk.gray(`  VUs: ${config.vus}  Duration: ${config.duration / 1000}s  Ramp-up: ${config.rampUp / 1000}s  Timeout: ${config.timeout / 1000}s\n`));

  // Live progress display
  const startTime = Date.now();
  const totalMs = config.duration;
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.min(100, Math.round((elapsed / totalMs) * 100));
    const filled = Math.round(pct / 5);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    process.stdout.write(`\r  [${bar}] ${pct}%  ${Math.round(elapsed / 1000)}s / ${config.duration / 1000}s  `);
  }, 250);

  let stats: PerfStats, checksTotal: number, checksFailed: number, perStep: Record<string, PerfStats>, perfRunId: string;
  try {
    ({ stats, checksTotal, checksFailed, perStep, perfRunId } = await runPerfTest(flowId, config));
  } finally {
    clearInterval(progressInterval);
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }

  renderPerfStats(stats, checksTotal, checksFailed, perStep, flow.name, config);
  info('Perf Run ID: ' + chalk.gray(perfRunId.slice(0, 8)));
  info('View details: ' + chalk.cyan(`ghostrun perf:show ${perfRunId.slice(0, 8)}`));
  console.log();
}

async function runPerfExport(flowId: string, extraArgs: string[]): Promise<void> {
  const config = parsePerfArgs(extraArgs);
  const p95 = parseInt((extraArgs[extraArgs.indexOf('--p95') + 1] || '').replace(/[^0-9]/g, '') || '500');
  const errRate = parseFloat((extraArgs[extraArgs.indexOf('--max-errors') + 1] || '1'));
  const outputFlag = extraArgs.indexOf('--output');
  const outputFile = outputFlag !== -1 ? extraArgs[outputFlag + 1] : '';

  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) { errorMsg('Flow not found: ' + flowId); process.exit(1); }

  const graph = JSON.parse(flow.graph) as { nodes?: Record<string, unknown>[] };
  const API_ONLY = new Set(['http:request','assert:response','assert:status','assert:body',
    'assert:header','assert:time','set:variable','extract:json','env:switch']);
  const actionNodes = (graph.nodes || [])
    .filter(n => n.type === 'action' && API_ONLY.has(n.action as string));

  if (!actionNodes.length) {
    errorMsg('No API steps found. perf:export only supports API flows.');
    process.exit(1);
  }

  const script = generateK6Script(flow.name, actionNodes, {
    vus: config.vus,
    duration: config.duration,
    p95threshold: p95,
    errorThreshold: errRate,
  });

  const filename = outputFile || `${flow.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-k6.js`;
  fs.writeFileSync(filename, script, 'utf8');

  printLogo(); divider();
  success(`k6 script exported: ${chalk.cyan(filename)}`);
  console.log();
  console.log(chalk.bold('  Thresholds:'));
  info(`p95 response time < ${p95}ms`);
  info(`error rate < ${errRate}%`);
  console.log();
  console.log(chalk.bold('  Run with k6:'));
  console.log(chalk.gray(`    k6 run ${filename}`));
  console.log(chalk.gray(`    k6 run --vus ${config.vus} --duration ${config.duration / 1000}s ${filename}`));
  console.log(chalk.gray(`    k6 run --out json=results.json ${filename}`));
  console.log();
  console.log(chalk.gray('  Install k6: https://grafana.com/docs/k6/latest/get-started/installation/'));
  console.log();

  // Print first 30 lines of script as preview
  console.log(chalk.bold('  Script preview:'));
  console.log(chalk.gray('  ' + '─'.repeat(56)));
  script.split('\n').slice(0, 30).forEach(l => console.log(chalk.gray('  ') + chalk.white(l)));
  if (script.split('\n').length > 30) console.log(chalk.gray(`  ... (${script.split('\n').length - 30} more lines)`));
  console.log();
}

async function runPerfList(): Promise<void> {
  printLogo(); divider();
  const runs = db.listPerfRuns();
  if (!runs.length) { warn('No perf runs yet. Run: ghostrun perf:run <flow-name>'); return; }

  console.log(chalk.bold('\n  Performance Runs\n'));
  console.log(chalk.gray(`  ${'ID'.padEnd(10)} ${'Flow'.padEnd(26)} ${'VUs'.padStart(4)} ${'Duration'.padStart(9)} ${'RPS'.padStart(7)} ${'p95'.padStart(7)} ${'Err%'.padStart(6)}  When`));
  console.log(chalk.gray('  ' + '─'.repeat(82)));

  for (const r of runs) {
    const cfg = r.config as PerfConfig;
    const errColor = (r.failedRequests ?? 0) / Math.max(r.totalRequests ?? 1, 1) > 0.05 ? chalk.red : chalk.green;
    const errPct = r.totalRequests ? (((r.failedRequests ?? 0) / r.totalRequests) * 100).toFixed(1) : '—';
    const p95Str = r.p95 != null ? (r.p95 > 500 ? chalk.yellow(r.p95 + 'ms') : chalk.green(r.p95 + 'ms')) : '—';
    console.log(
      `  ${chalk.gray(r.id.slice(0, 8).padEnd(10))} ${chalk.white(r.flowName.slice(0, 25).padEnd(26))} ${String(cfg?.vus ?? '?').padStart(4)} ` +
      `${String(((cfg?.duration ?? 0) / 1000) + 's').padStart(9)} ` +
      `${chalk.cyan(String(r.avgRps ?? '—').padStart(7))} ${p95Str.padStart(7)} ` +
      `${errColor(errPct + '%').padStart(6)}  ${timeAgo(r.startedAt.toISOString())}`
    );
  }
  console.log();
}

async function runPerfShow(runId: string): Promise<void> {
  const run = db.findPerfRunByPartialId(runId);
  if (!run) { errorMsg('Perf run not found: ' + runId); process.exit(1); }
  const cfg = run.config as PerfConfig;
  if (run.p50 != null) {
    const stats: PerfStats = {
      total: run.totalRequests ?? 0, success: run.successRequests ?? 0, failed: run.failedRequests ?? 0,
      errorRate: run.totalRequests ? parseFloat((((run.failedRequests ?? 0) / run.totalRequests) * 100).toFixed(1)) : 0,
      avgRps: run.avgRps ?? 0, p50: run.p50 ?? 0, p95: run.p95 ?? 0, p99: run.p99 ?? 0,
      min: run.minMs ?? 0, max: run.maxMs ?? 0,
    };
    renderPerfStats(stats, 0, 0, run.perStepStats || {}, run.flowName, cfg);
  } else {
    warn('Perf run has no stats (may have failed or is still running).');
  }
  info('Started: ' + chalk.gray(run.startedAt.toISOString()));
  if (run.completedAt) info('Completed: ' + chalk.gray(run.completedAt.toISOString()));
  console.log();
}

async function runPerfCompare(id1: string, id2: string) {
  const r1 = db.findPerfRunByPartialId(id1);
  const r2 = db.findPerfRunByPartialId(id2);
  if (!r1) { errorMsg('First perf run not found: ' + id1); process.exit(1); }
  if (!r2) { errorMsg('Second perf run not found: ' + id2); process.exit(1); }

  const c1 = JSON.parse(r1.config ? JSON.stringify(r1.config) : '{}') as Record<string, unknown>;
  const c2 = JSON.parse(r2.config ? JSON.stringify(r2.config) : '{}') as Record<string, unknown>;

  divider();
  console.log(chalk.bold('\n  Performance Comparison\n'));
  console.log(`  ${chalk.cyan('A')} ${r1.id.slice(0,8)}  ${chalk.gray(r1.flowName)}  ${chalk.gray(timeAgo(r1.startedAt.toISOString()))}  ${r1.config ? chalk.gray(`(${(c1 as any).vus}VU · ${(c1 as any).duration}s)`) : ''}`);
  console.log(`  ${chalk.cyan('B')} ${r2.id.slice(0,8)}  ${chalk.gray(r2.flowName)}  ${chalk.gray(timeAgo(r2.startedAt.toISOString()))}  ${r2.config ? chalk.gray(`(${(c2 as any).vus}VU · ${(c2 as any).duration}s)`) : ''}`);
  console.log();

  function delta(a: number | null | undefined, b: number | null | undefined, unit = 'ms', lowerBetter = true): string {
    if (a == null || b == null) return chalk.gray('—');
    const diff = b - a;
    const pct = a !== 0 ? ((diff / a) * 100).toFixed(1) : '—';
    const better = lowerBetter ? diff < 0 : diff > 0;
    const color = diff === 0 ? chalk.gray : better ? chalk.green : chalk.red;
    const sign = diff > 0 ? '+' : '';
    return color(`${sign}${diff.toFixed(0)}${unit} (${sign}${pct}%)`);
  }

  const col = (s: string) => String(s).padEnd(14);
  const hdr = (s: string) => chalk.bold.gray(String(s).padEnd(14));

  console.log(`  ${chalk.gray('Metric'.padEnd(20))} ${hdr('A')} ${hdr('B')} ${'Change'.padEnd(20)}`);
  console.log(chalk.gray('  ' + '─'.repeat(72)));

  const rows: Array<[string, number|null|undefined, number|null|undefined, string, boolean]> = [
    ['Avg RPS',       r1.avgRps,   r2.avgRps,   ' req/s', false],
    ['p50 latency',   r1.p50,      r2.p50,      'ms', true],
    ['p95 latency',   r1.p95,      r2.p95,      'ms', true],
    ['p99 latency',   r1.p99,      r2.p99,      'ms', true],
    ['Min latency',   r1.minMs,    r2.minMs,    'ms', true],
    ['Max latency',   r1.maxMs,    r2.maxMs,    'ms', true],
  ];

  for (const [label, v1, v2, unit, lowerBetter] of rows) {
    const a = v1 != null ? v1.toFixed(unit === ' req/s' ? 1 : 0) + unit : '—';
    const b = v2 != null ? v2.toFixed(unit === ' req/s' ? 1 : 0) + unit : '—';
    console.log(`  ${label.padEnd(20)} ${col(a)} ${col(b)} ${delta(v1 ?? null, v2 ?? null, unit, lowerBetter)}`);
  }

  const sr1 = r1.totalRequests ? ((r1.successRequests || 0) / r1.totalRequests * 100).toFixed(1) + '%' : '—';
  const sr2 = r2.totalRequests ? ((r2.successRequests || 0) / r2.totalRequests * 100).toFixed(1) + '%' : '—';
  const srGood = parseFloat(sr2) >= parseFloat(sr1);
  console.log(`  ${'HTTP Success'.padEnd(20)} ${col(sr1)} ${col(sr2)} ${sr1 === '—' || sr2 === '—' ? chalk.gray('—') : srGood ? chalk.green('≥ A') : chalk.red('< A')}`);

  console.log();

  const p95Improved = r1.p95 && r2.p95 && r2.p95 < r1.p95;
  const p95Worse = r1.p95 && r2.p95 && r2.p95 > r1.p95 * 1.1;
  if (p95Improved) console.log(chalk.green('  ✓ B is faster — p95 improved by ' + Math.abs(r2.p95! - r1.p95!).toFixed(0) + 'ms'));
  else if (p95Worse) console.log(chalk.red('  ✗ B is slower — p95 degraded by ' + Math.abs(r2.p95! - r1.p95!).toFixed(0) + 'ms'));
  else console.log(chalk.gray('  ~ Performance roughly equivalent'));
  console.log();
}

async function generatePerfReport(perfRunId: string, outFile: string) {
  const pr = db.getPerfRun ? db.getPerfRun(perfRunId) : null;
  if (!pr) return;
  const config = pr.config ? (typeof pr.config === 'string' ? JSON.parse(pr.config) : pr.config) : {};
  const perStep: Record<string, unknown>[] = pr.perStepStats
    ? (typeof pr.perStepStats === 'string' ? Object.values(JSON.parse(pr.perStepStats)) : Object.values(pr.perStepStats as object))
    : [];

  const stepsHtml = perStep.map((s: Record<string, unknown>) => {
    const p95Color = Number(s.p95) > 500 ? '#f85149' : Number(s.p95) > 200 ? '#e3b341' : '#56d364';
    return `<tr>
      <td>${escapeHtml(String(s.label || ''))}</td>
      <td>${String(s.total || s.count || 0)}</td>
      <td>${Number(s.p50 || 0).toFixed(0)}ms</td>
      <td style="color:${p95Color}">${Number(s.p95 || 0).toFixed(0)}ms</td>
      <td>${Number(s.p99 || 0).toFixed(0)}ms</td>
      <td>${Number(s.min || 0).toFixed(0)}ms</td>
      <td>${Number(s.max || 0).toFixed(0)}ms</td>
    </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GhostRun Perf — ${escapeHtml(pr.flowName)}</title>
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
  Perf Run ${pr.id.slice(0,8)} &nbsp;·&nbsp; ${(config as any).vus || '?'} VUs · ${(config as any).duration || '?'}s · ramp-up ${(config as any).rampUp || 0}s
  &nbsp;·&nbsp; ${new Date(pr.startedAt).toLocaleString()}
</div>
<div class="summary">
  <div class="stat"><div class="stat-val ${pr.status === 'done' ? 'good' : 'bad'}">${(pr.status || 'unknown').toUpperCase()}</div><div class="stat-label">Status</div></div>
  <div class="stat"><div class="stat-val">${pr.totalRequests || 0}</div><div class="stat-label">HTTP Requests</div></div>
  <div class="stat"><div class="stat-val ${pr.totalRequests && pr.successRequests === pr.totalRequests ? 'good' : 'warn'}">${pr.totalRequests ? ((pr.successRequests||0)/pr.totalRequests*100).toFixed(1)+'%' : '—'}</div><div class="stat-label">Success Rate</div></div>
  <div class="stat"><div class="stat-val">${pr.avgRps ? pr.avgRps.toFixed(1) : '—'}</div><div class="stat-label">Avg RPS</div></div>
  <div class="stat"><div class="stat-val">${pr.p50 != null ? pr.p50+'ms' : '—'}</div><div class="stat-label">p50</div></div>
  <div class="stat"><div class="stat-val ${pr.p95 && pr.p95 > 500 ? 'bad' : pr.p95 && pr.p95 > 200 ? 'warn' : 'good'}">${pr.p95 != null ? pr.p95+'ms' : '—'}</div><div class="stat-label">p95</div></div>
  <div class="stat"><div class="stat-val">${pr.p99 != null ? pr.p99+'ms' : '—'}</div><div class="stat-label">p99</div></div>
  <div class="stat"><div class="stat-val">${pr.minMs != null ? pr.minMs+'ms' : '—'}</div><div class="stat-label">Min</div></div>
  <div class="stat"><div class="stat-val">${pr.maxMs != null ? pr.maxMs+'ms' : '—'}</div><div class="stat-label">Max</div></div>
</div>
<div class="section-title">Per-step breakdown</div>
<table>
  <thead><tr><th>Step</th><th>Count</th><th>p50</th><th>p95</th><th>p99</th><th>Min</th><th>Max</th></tr></thead>
  <tbody>${stepsHtml}</tbody>
</table>
<footer>Generated by GhostRun · ${new Date().toISOString()}</footer>
</body></html>`;

  fs.writeFileSync(outFile, html);
  success(`HTML report: ${chalk.cyan(outFile)}`);
}

// ============================================
// AUDIT — security & secret leak checks
// ============================================

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Anthropic API key', pattern: /sk-ant-api[a-zA-Z0-9_-]{10,}/ },
  { name: 'OpenAI-style key', pattern: /\bsk-[a-zA-Z0-9]{20,}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key block', pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'npm token', pattern: /\bnpm_[a-zA-Z0-9]{36}\b/ },
];

const PLACEHOLDER_OK = [
  /sk-ant-\.\.\./,
  /example\.com/,
  /your-app\.com/,
  /test@example\.com/,
  /PASSWORD=secret/,
  /s3cr3t/,
  /STAGING_API_TOKEN/,
  /AUTH_PASSWORD/,
];

function lineLooksLikePlaceholder(line: string): boolean {
  return PLACEHOLDER_OK.some(re => re.test(line));
}

function scanTextForSecrets(label: string, content: string, filePath: string): string[] {
  const findings: string[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineLooksLikePlaceholder(line)) continue;
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push(`${filePath}:${i + 1} — possible ${name}`);
      }
    }
    if (/"password"\s*:\s*"[^"]{3,}"/i.test(line) && !/secret|example|test123|placeholder/i.test(line)) {
      findings.push(`${filePath}:${i + 1} — plaintext password in JSON`);
    }
  }
  return findings;
}

function collectProjectScanFiles(): string[] {
  const files: string[] = [];
  const roots = [
    PROJECT_GHOSTRUN_PATH,
    process.cwd(),
  ];
  const names = ['.ghostrun.env', '.env'];
  for (const root of roots) {
    for (const name of names) {
      const p = path.join(root, name);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p);
    }
  }

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'runs', 'reports', 'ai'].includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.(json|env|flow\.json|txt|yaml|yml)$/.test(entry.name)) continue;
      if (full.includes(`${path.sep}auth${path.sep}storage-state${path.sep}`)) continue;
      if (full.includes(`${path.sep}auth${path.sep}secrets${path.sep}`)) continue;
      files.push(full);
    }
  };

  walk(path.join(PROJECT_GHOSTRUN_PATH, 'profiles'));
  walk(path.join(PROJECT_GHOSTRUN_PATH, 'flows'));
  if (fs.existsSync(PROJECT_CONFIG_PATH)) files.push(PROJECT_CONFIG_PATH);
  return [...new Set(files)];
}

async function runSecurityAudit(exitOnFailure = true) {
  printLogo(); divider();
  console.log(chalk.bold('\n  GhostRun Security Audit\n'));

  const findings: string[] = [];
  const warnings: string[] = [];
  const passes: string[] = [];

  ensureProjectWorkspace();

  const gitignorePath = path.join(PROJECT_GHOSTRUN_PATH, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf8');
    if (gi.includes('auth/secrets/') && gi.includes('auth/storage-state/')) {
      passes.push('Project .gitignore excludes auth secrets and storage state');
    } else {
      findings.push('Project .gitignore should exclude auth/secrets/ and auth/storage-state/');
    }
  } else {
    findings.push('Missing .ghostrun/.gitignore');
  }

  const rootGitignore = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(rootGitignore)) {
    const gi = fs.readFileSync(rootGitignore, 'utf8');
    if (/\.ghostrun\.env|\.env/.test(gi)) {
      passes.push('Root .gitignore mentions env files');
    } else {
      warnings.push('Add .ghostrun.env and .env to root .gitignore');
    }
  }

  for (const filePath of collectProjectScanFiles()) {
    const rel = path.relative(process.cwd(), filePath) || filePath;
    const content = fs.readFileSync(filePath, 'utf8');
    findings.push(...scanTextForSecrets(rel, content, rel));
  }

  for (const profile of listProfiles()) {
    const vars = profile.variables || {};
    for (const [key, value] of Object.entries(vars)) {
      if (/password|token|secret|api_key/i.test(key) && value.length > 0 && !lineLooksLikePlaceholder(value)) {
        warnings.push(`Profile "${profile.name}" has sensitive-looking variable "${key}" — prefer tokenSecret + env var`);
      }
    }
    if (profile.auth?.passwordSecret && profile.auth?.username && !profile.auth?.usernameVar) {
      warnings.push(`Profile "${profile.name}" has inline username — prefer usernameVar or env reference`);
    }
  }

  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 20) {
    passes.push('ANTHROPIC_API_KEY loaded from environment (not stored in project files)');
  }

  const config = readConfig();
  if (config.policies?.allowAutoRepairApply) {
    warnings.push('allowAutoRepairApply is enabled — flows may mutate without review outside CI');
  }

  console.log(chalk.bold('  Passed'));
  if (passes.length === 0) console.log(chalk.gray('  (none)'));
  for (const p of passes) console.log(`  ${chalk.green('✓')} ${p}`);

  if (warnings.length) {
    console.log(chalk.bold('\n  Warnings'));
    for (const w of warnings) console.log(`  ${chalk.yellow('!')} ${w}`);
  }

  if (findings.length) {
    console.log(chalk.bold('\n  Findings'));
    for (const f of findings) console.log(`  ${chalk.red('✗')} ${f}`);
  } else {
    console.log(chalk.bold('\n  Findings'));
    console.log(`  ${chalk.green('✓')} No secret patterns detected in scanned project files`);
  }

  console.log(chalk.gray('\n  npm package ships only: ghostrun.js, mcp-server.js, docs, templates/'));
  console.log(chalk.gray('  See docs/security.md for the full safety model.\n'));

  if (findings.length && exitOnFailure) process.exit(1);
}

async function runIntegrationsCommand(args: string[] = []) {
  printLogo(); divider();
  ensureProjectWorkspace();
  const config = readConfig();
  const sub = args[0] || 'list';

  if (sub === 'list') {
    console.log(chalk.bold('\n  GhostRun Integrations\n'));
    const gh = config.integrations?.github;
    const ln = config.integrations?.linear;
    console.log(`  ${chalk.cyan('GitHub Issues')}  ${gh?.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`);
    if (gh?.owner) console.log(chalk.gray(`    repo: ${gh.owner}/${gh.repo || '?'}`));
    console.log(`  ${chalk.cyan('Linear')}         ${ln?.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`);
    if (ln?.teamId) console.log(chalk.gray(`    team: ${ln.teamId}`));
    console.log(chalk.gray('\n  Configure in .ghostrun/config.json → integrations'));
    console.log(chalk.gray('  Full issue creation: v2.0-alpha (failure.v1.json scaffold ready in v1.3)\n'));
    return;
  }

  if (sub === 'test') {
    const target = args[1];
    if (!target) { errorMsg('Usage: ghostrun integrations test <github|linear>'); process.exit(1); }
    if (target === 'github') {
      const gh = config.integrations?.github;
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      if (!gh?.enabled) { warn('GitHub integration disabled in config.'); process.exit(1); }
      if (!token) { errorMsg('GITHUB_TOKEN or GH_TOKEN not set.'); process.exit(1); }
      if (!gh.owner || !gh.repo) { errorMsg('Set integrations.github.owner and integrations.github.repo in config.'); process.exit(1); }
      success(`GitHub config OK: ${gh.owner}/${gh.repo} (token present)`);
      return;
    }
    if (target === 'linear') {
      const ln = config.integrations?.linear;
      const key = process.env.LINEAR_API_KEY;
      if (!ln?.enabled) { warn('Linear integration disabled in config.'); process.exit(1); }
      if (!key) { errorMsg('LINEAR_API_KEY not set.'); process.exit(1); }
      if (!ln.teamId) { errorMsg('Set integrations.linear.teamId in config.'); process.exit(1); }
      success(`Linear config OK: team ${ln.teamId} (API key present)`);
      return;
    }
    errorMsg(`Unknown integration: ${target}`);
    process.exit(1);
  }

  errorMsg('Usage: ghostrun integrations list | test <github|linear>');
  process.exit(1);
}

async function runAuthorBenchmark(extraArgs: string[] = []) {
  printLogo(); divider();
  const { spawnSync } = require('child_process') as typeof import('child_process');
  const realBin = fs.realpathSync(process.argv[1]);
  const pkgDir = path.dirname(realBin);
  let scriptPath = path.join(pkgDir, 'scripts', 'author-benchmark.mjs');
  if (!fs.existsSync(scriptPath)) {
    scriptPath = path.join(process.cwd(), 'scripts', 'author-benchmark.mjs');
  }
  if (!fs.existsSync(scriptPath)) {
    errorMsg('Author benchmark script not found.');
    process.exit(1);
  }
  const result = spawnSync('node', [scriptPath, ...extraArgs], { stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 1);
}

// ============================================
// DOCTOR — health checklist
// ============================================

async function runDoctor() {
  printLogo(); divider();
  console.log(chalk.bold('\n  GhostRun Health Check\n'));

  const check = (label: string, ok: boolean, detail?: string) => {
    const badge = ok ? chalk.green('  OK  ') : chalk.red(' FAIL ');
    const desc = detail ? chalk.gray(' — ' + detail) : '';
    console.log(`  [${badge}] ${label}${desc}`);
  };

  // 1. Node version >= 18
  const rawVer = process.version; // e.g. "v20.11.0"
  const major = parseInt(rawVer.replace('v', '').split('.')[0], 10);
  check('Node.js >= 18', major >= 18, `${rawVer}`);

  // 2. ANTHROPIC_API_KEY
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  check('ANTHROPIC_API_KEY set', hasApiKey, hasApiKey ? 'present' : 'not set — AI features may be limited');

  // 3. Project database
  const paths = getProjectPaths();
  const projectDbPath = paths.dbPath;
  const projectDbExists = fs.existsSync(projectDbPath);
  check('Project database', projectDbExists || fs.existsSync(PROJECT_CONFIG_PATH), projectDbExists ? projectDbPath : 'run ghostrun init in project root');

  // 4. Global database (legacy fallback)
  const globalDbPath = path.join(DATA_PATH, 'data', 'ghostrun.db');
  const globalDbExists = fs.existsSync(globalDbPath);
  check('Global database (legacy)', globalDbExists, globalDbExists ? globalDbPath : 'optional — project DB is primary');

  // 5. Project workspace exists
  const wsExists = fs.existsSync(PROJECT_CONFIG_PATH);
  check('Project workspace initialised', wsExists, wsExists ? PROJECT_CONFIG_PATH : 'run: ghostrun init');

  // 6. Active profile
  const activeProfileName = readConfig().activeProfile || null;
  const activeProfileObj = activeProfileName ? getProfile(activeProfileName) : null;
  check('Active profile', !!activeProfileName, activeProfileName || 'none — use: ghostrun profile use <name>');

  // 7. Service Bridge — only when explicitly configured on the profile
  if (activeProfileObj?.services && (
    isEmailBridgeEnabled(activeProfileObj.services) ||
    activeProfileObj.services.webhook ||
    activeProfileObj.services.postgres?.connectionSecret
  )) {
    const svcResults = await runServicesDoctor(activeProfileObj.services);
    for (const r of svcResults) {
      check(`Service: ${r.name}`, r.ok, r.detail);
    }
  } else if (activeProfileObj?.auth?.strategy && activeProfileObj.auth.strategy !== 'none') {
    check('Profile auth', true, `${activeProfileObj.auth.strategy} — credentials via env or .ghostrun/auth/secrets/`);
  }

  // 8. Ollama
  const ollamaModel = await isOllamaRunning();
  check('Ollama running', !!ollamaModel, ollamaModel ? `model: ${ollamaModel}` : 'not reachable (optional)');

  console.log();
}

// ============================================
// JUNIT REPORTER — write JUnit XML report
// ============================================

async function writeJUnitReport(
  flowName: string,
  runId: string,
  steps: Array<{ name: string; status: string; duration: number | null; errorMessage?: string | null }>,
  totalDurationMs: number
): Promise<string> {
  const reportsDir = path.join(PROJECT_GHOSTRUN_PATH, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const outPath = path.join(reportsDir, `junit-${runId}.xml`);

  const failures = steps.filter(s => s.status === 'failed').length;
  const durationSec = (totalDurationMs / 1000).toFixed(3);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const testcases = steps.map(s => {
    const dur = ((s.duration || 0) / 1000).toFixed(3);
    const nameAttr = esc(s.name || `Step ${s.status}`);
    const failureEl = s.status === 'failed' && s.errorMessage
      ? `\n      <failure message="${esc(s.errorMessage)}">${esc(s.errorMessage)}</failure>`
      : '';
    return `    <testcase name="${nameAttr}" classname="${esc(flowName)}" time="${dur}">${failureEl}\n    </testcase>`;
  }).join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="GhostRun" tests="${steps.length}" failures="${failures}" time="${durationSec}">`,
    `  <testsuite name="${esc(flowName)}" tests="${steps.length}" failures="${failures}" time="${durationSec}" id="${esc(runId)}">`,
    testcases,
    '  </testsuite>',
    '</testsuites>',
  ].join('\n');

  fs.writeFileSync(outPath, xml, 'utf8');
  return outPath;
}

async function runReportPublish(extraArgs: string[] = []) {
  printLogo(); divider();
  ensureProjectWorkspace();

  const destDir = parseFlagValue(extraArgs, '--dir') || './test-results';
  const runIdArg = parseFlagValue(extraArgs, '--run');
  const jsonOutput = parseFlagValue(extraArgs, '--output') === 'json' || extraArgs.includes('--json');
  const createIssues = extraArgs.includes('--create-issues');

  let runId = runIdArg;
  if (!runId) {
    const recent = db.listRuns(undefined, 1);
    runId = recent[0]?.id;
  }
  if (!runId) {
    errorMsg('No runs found to publish.');
    process.exit(1);
  }

  const run = db.findRunByPartialId(runId) || db.getRun(runId);
  if (!run) {
    errorMsg('Run not found: ' + runId);
    process.exit(1);
  }

  const evidenceDir = getRunEvidenceDir(run.id);
  if (!fs.existsSync(path.join(evidenceDir, 'manifest.json'))) {
    writeEvidenceBundle(run.id, { ci: process.argv.includes('--ci') });
  }

  fs.mkdirSync(destDir, { recursive: true });
  const htmlPath = path.join(destDir, 'ghostrun-report.html');
  const junitPath = path.join(destDir, 'ghostrun-junit.xml');
  const manifestPath = path.join(destDir, 'manifest.json');
  const failurePath = path.join(destDir, 'failure.v1.json');
  const screenshotsDir = path.join(destDir, 'screenshots');

  const srcManifest = path.join(evidenceDir, 'manifest.json');
  const srcReport = path.join(evidenceDir, 'report.html');
  const srcFailure = path.join(evidenceDir, 'failure.v1.json');
  const srcScreenshots = path.join(evidenceDir, 'screenshots');

  if (fs.existsSync(srcReport)) fs.copyFileSync(srcReport, htmlPath);
  else await generateRunReport(run.id, htmlPath);

  const steps = db.listSteps(run.id);
  const flow = db.getFlow(run.flowId);
  const flowName = flow?.name || run.flowId;
  const junitSource = await writeJUnitReport(
    flowName,
    run.id,
    steps.map(s => ({ name: s.name, status: s.status, duration: s.duration, errorMessage: s.errorMessage })),
    run.duration || 0
  );
  fs.copyFileSync(junitSource, junitPath);

  fs.mkdirSync(screenshotsDir, { recursive: true });
  const copiedScreenshots: string[] = [];
  const shotSourceDir = fs.existsSync(srcScreenshots) ? srcScreenshots : db.getScreenshotsPath(run.id);
  if (fs.existsSync(shotSourceDir)) {
    for (const file of fs.readdirSync(shotSourceDir).filter(f => f.endsWith('.png'))) {
      const dest = path.join(screenshotsDir, file);
      fs.copyFileSync(path.join(shotSourceDir, file), dest);
      copiedScreenshots.push(dest);
    }
  }

  let manifest: Record<string, unknown> = {};
  if (fs.existsSync(srcManifest)) {
    manifest = JSON.parse(fs.readFileSync(srcManifest, 'utf8'));
  }
  manifest = {
    ...manifest,
    publishedAt: new Date().toISOString(),
    publishDir: path.resolve(destDir),
    htmlReport: path.resolve(htmlPath),
    junitReport: path.resolve(junitPath),
    screenshots: copiedScreenshots.map(p => path.resolve(p)),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (fs.existsSync(srcFailure)) {
    fs.copyFileSync(srcFailure, failurePath);
  }

  if (createIssues) {
    if (run.status === 'failed' && fs.existsSync(failurePath)) {
      const config = readConfig();
      const issueTrigger: GitHubIssueCreateTrigger =
        process.env.CI === 'true' || extraArgs.includes('--ci') ? 'ci-failure' : 'local-failure';
      if (!shouldCreateGitHubIssue(config, issueTrigger)) {
        warn(`--create-issues skipped: integrations.github.createOn excludes "${issueTrigger}".`);
      } else {
        try {
          const failure = JSON.parse(fs.readFileSync(failurePath, 'utf8')) as Record<string, unknown>;
          const result = await createGitHubIssueFromFailure(failure, manifest, config, {
            publishFailurePath: failurePath,
            evidenceFailurePath: fs.existsSync(srcFailure) ? srcFailure : undefined,
          });
          if (result.skipped === 'duplicate' && result.issueUrl) {
            info(`GitHub issue already exists: ${result.issueUrl}`);
          } else if (result.created && result.issueUrl) {
            success(`GitHub issue created: ${result.issueUrl}`);
          } else if (result.skipped === 'disabled') {
            warn('--create-issues skipped: integrations.github.enabled is false.');
          } else if (result.skipped === 'config') {
            errorMsg('Set integrations.github.owner and integrations.github.repo in config.');
            process.exit(1);
          }
        } catch (err) {
          errorMsg(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    } else {
      warn('--create-issues skipped: run passed or no failure artifact.');
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(manifest));
    return;
  }

  success('Reports published.');
  info(`Directory: ${chalk.cyan(path.resolve(destDir))}`);
  info(`HTML:      ${chalk.cyan(String(manifest.htmlReport))}`);
  info(`JUnit:     ${chalk.cyan(String(manifest.junitReport))}`);
  info(`Manifest:  ${chalk.cyan(path.resolve(manifestPath))}`);
  if (fs.existsSync(failurePath)) info(`Failure:   ${chalk.cyan(path.resolve(failurePath))}`);
  console.log();
}

// ============================================
// AUTHOR — interactive flow creation menu
// ============================================

async function runAuthor() {
  printLogo(); divider();
  console.log(chalk.bold('\n  Author a Flow\n'));
  console.log(chalk.white('  Choose how to create a new flow:\n'));
  console.log(`  ${chalk.cyan('1)')} Record browser flow`);
  console.log(`  ${chalk.cyan('2)')} Generate from description ${chalk.gray('(AI)')}`);
  console.log(`  ${chalk.cyan('3)')} Import from curl`);
  console.log(`  ${chalk.cyan('4)')} Import from OpenAPI spec`);
  console.log(`  ${chalk.cyan('5)')} Explore website ${chalk.gray('(AI)')}`);
  console.log();

  const choice = await askQuestion('  Enter choice [1-5]: ');

  switch (choice.trim()) {
    case '1': {
      const url = await askQuestion('  URL to record: ');
      if (!url.trim()) { errorMsg('URL required'); process.exit(1); }
      await runLearn(url.trim());
      break;
    }
    case '2':
      await runCreate();
      break;
    case '3':
      await runFlowFromCurl();
      break;
    case '4': {
      const specFile = await askQuestion('  Path to OpenAPI/Swagger file: ');
      if (!specFile.trim()) { errorMsg('File path required'); process.exit(1); }
      await runFlowFromSpec(specFile.trim());
      break;
    }
    case '5': {
      const exploreUrl = await askQuestion('  URL to explore: ');
      if (!exploreUrl.trim()) { errorMsg('URL required'); process.exit(1); }
      await runExplore(exploreUrl.trim());
      break;
    }
    default:
      errorMsg(`Invalid choice: ${choice}. Enter a number from 1 to 5.`);
      process.exit(1);
  }
}

// ============================================
// COMMANDS — monitor (continuous loop)
// ============================================

async function runMonitor(flowId: string, extraArgs: string[] = []) {
  // If --interval is not supplied, fall back to the one-shot data-diff monitor.
  const intervalArg = parseFlagValue(extraArgs, '--interval');
  if (!intervalArg && !extraArgs.includes('--interval')) {
    return runMonitorOnce(flowId);
  }

  const intervalSec = intervalArg ? Math.max(1, parseInt(intervalArg, 10) || 60) : 60;

  // Apply --profile if given (set activeProfile in config for this process).
  const profileArg = parseFlagValue(extraArgs, '--profile');
  if (profileArg) {
    const config = readConfig();
    config.activeProfile = profileArg;
    writeConfig(config);
  }

  const flow = db.findFlowByPartialId(flowId) || db.findFlowByName(flowId);
  if (!flow) { errorMsg('Flow not found: ' + flowId); process.exit(1); }

  const activeProfileName = profileArg || readConfig().activeProfile || undefined;
  const activeProfile = activeProfileName ? getProfile(activeProfileName) : null;
  const notifyTargets = resolveMonitorNotificationTargets(extraArgs, activeProfile);

  printLogo(); divider();
  console.log(
    chalk.bold('\n  Monitoring: ') + chalk.white(flow.name) +
    chalk.gray(` every ${intervalSec}s`) +
    chalk.gray(' | Press Ctrl+C to stop\n')
  );

  let totalRuns = 0;
  let totalPassed = 0;
  let consecutiveFailures = 0;
  let running = false;
  let lastAlertAt = 0;

  // Graceful shutdown on Ctrl+C.
  process.once('SIGINT', () => {
    console.log('\n');
    divider();
    const passRate = totalRuns > 0 ? ((totalPassed / totalRuns) * 100).toFixed(1) : '0.0';
    console.log(chalk.bold('  Monitor stopped.'));
    console.log(`  Total runs:  ${chalk.white(String(totalRuns))}`);
    console.log(`  Pass rate:   ${totalRuns > 0 && totalPassed === totalRuns ? chalk.green(passRate + '%') : chalk.yellow(passRate + '%')}`);
    console.log();
    process.exit(0);
  });

  const tick = async () => {
    if (running) return; // skip if previous run still in progress
    running = true;
    const tickStart = Date.now();
    try {
      const result = await executeFlow(flow.id, globalVars, { quiet: true, jsonOutput: false });
      const durationMs = Date.now() - tickStart;
      const durationStr = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
      const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
      totalRuns++;
      if (result.passed) {
        totalPassed++;
        consecutiveFailures = 0;
        console.log(`  ${chalk.green('✓')} ${chalk.gray(ts)} ${chalk.green('PASS')} ${chalk.gray(durationStr)}`);
      } else {
        consecutiveFailures++;
        const errMsg = result.error ? result.error.split('\n')[0].slice(0, 120) : 'unknown error';
        console.log(`  ${chalk.red('✗')} ${chalk.gray(ts)} ${chalk.red('FAIL')} ${chalk.gray(durationStr)}`);
        console.log(chalk.red(`    ERROR: ${errMsg}`));
        if (consecutiveFailures >= notifyTargets.threshold) {
          console.log(chalk.red.bold(`\n  !! ALERT: ${consecutiveFailures} consecutive failures for "${flow.name}" !!\n`));
          if (notifyTargets.enabled && consecutiveFailures === notifyTargets.threshold) {
            await sendMonitorAlert({
              flow,
              profileName: activeProfileName,
              consecutiveFailures,
              error: errMsg,
              webhookUrl: notifyTargets.webhookUrl,
              slackWebhook: notifyTargets.slackWebhook,
            });
            lastAlertAt = consecutiveFailures;
          } else if (notifyTargets.enabled && consecutiveFailures > lastAlertAt && consecutiveFailures % notifyTargets.threshold === 0) {
            await sendMonitorAlert({
              flow,
              profileName: activeProfileName,
              consecutiveFailures,
              error: errMsg,
              webhookUrl: notifyTargets.webhookUrl,
              slackWebhook: notifyTargets.slackWebhook,
            });
            lastAlertAt = consecutiveFailures;
          }
        }
      }
    } catch (err) {
      const durationMs = Date.now() - tickStart;
      const durationStr = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
      const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
      totalRuns++;
      consecutiveFailures++;
      const errMsg = err instanceof Error ? err.message.split('\n')[0].slice(0, 120) : String(err);
      console.log(`  ${chalk.red('✗')} ${chalk.gray(ts)} ${chalk.red('FAIL')} ${chalk.gray(durationStr)}`);
      console.log(chalk.red(`    ERROR: ${errMsg}`));
      if (consecutiveFailures >= notifyTargets.threshold) {
        console.log(chalk.red.bold(`\n  !! ALERT: ${consecutiveFailures} consecutive failures for "${flow.name}" !!\n`));
        if (notifyTargets.enabled && consecutiveFailures >= notifyTargets.threshold && consecutiveFailures !== lastAlertAt) {
          await sendMonitorAlert({
            flow,
            profileName: activeProfileName,
            consecutiveFailures,
            error: errMsg,
            webhookUrl: notifyTargets.webhookUrl,
            slackWebhook: notifyTargets.slackWebhook,
          });
          lastAlertAt = consecutiveFailures;
        }
      }
    } finally {
      running = false;
    }
  };

  // Run once immediately, then on interval.
  await tick();
  setInterval(tick, intervalSec * 1000);

  // Keep the process alive (setInterval alone may not prevent exit in some environments).
  await new Promise<never>(() => {});
}

// ============================================
// MAIN
// ============================================

const args = process.argv.slice(2);
const cmd = args[0];
const globalVars = parseVars(process.argv.slice(2));
let db: DatabaseManager;

function initializeDatabase(): DatabaseManager {
  initProjectContext();
  refreshProjectConstants();
  const paths = getProjectPaths();
  const hasProject = fs.existsSync(paths.configPath);
  const manager = new DatabaseManager(hasProject ? {
    dbPath: paths.dbPath,
    screenshotsPath: paths.screenshotsPath,
    sessionsPath: paths.sessionsPath,
  } : {});

  manager.setFlowSyncHook((event, flow) => {
    if (!fs.existsSync(paths.configPath)) return;
    try {
      if (event === 'delete') deleteFlowFile(flow.id, flow.name);
      else writeFlowFile(flow);
    } catch {
      /* disk sync is best-effort */
    }
  });

  if (hasProject) {
    const sync = syncFlowsFromDisk(
      (data) => manager.createFlow(data),
      (name) => manager.findFlowByName(name),
      (id, data) => manager.updateFlow(id, data),
    );
    if (sync.imported + sync.updated > 0 && process.env.GHOSTRUN_QUIET !== '1') {
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
    (id, data) => db.updateFlow(id, data),
  );
  success(`Flow sync complete — imported ${sync.imported}, updated ${sync.updated}, skipped ${sync.skipped}`);
  const files = listFlowFiles();
  if (files.length) info(`${files.length} flow file(s) under .ghostrun/flows/`);
}

async function runMigrateProjectScope() {
  printLogo(); divider();
  ensureProjectWorkspace();
  const paths = getProjectPaths();
  const globalDbPath = path.join(DATA_PATH, 'data', 'ghostrun.db');

  if (!fs.existsSync(globalDbPath)) {
    warn('No global database at ~/.ghostrun/data/ghostrun.db — nothing to migrate.');
    return;
  }

  if (fs.existsSync(paths.dbPath) && db.listFlows().length > 0) {
    const approved = await confirmAction('  Project DB already has flows. Merge global flows anyway? (y/N) ', false);
    if (!approved) {
      warn('Migration cancelled.');
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
      description: flow.description || undefined,
      appUrl: flow.appUrl || undefined,
      graph: JSON.parse(flow.graph || '{}'),
      createdBy: flow.createdBy,
    });
    imported++;
  }
  globalDb.close();

  const diskSync = syncFlowsFromDisk(
    (data) => db.createFlow(data),
    (name) => db.findFlowByName(name),
    (id, data) => db.updateFlow(id, data),
  );

  success(`Project scope migration complete`);
  info(`Global flows copied: ${imported}`);
  info(`Disk sync: ${diskSync.imported} imported, ${diskSync.updated} updated`);
  info(`Project DB: ${paths.dbPath}`);
}

async function runServicesCommand(subArgs: string[]) {
  ensureProjectWorkspace();
  const sub = subArgs[0] || 'list';
  const profile = getSelectedProfile(subArgs) || (readConfig().activeProfile ? getProfile(readConfig().activeProfile!) : null);

  switch (sub) {
    case 'list': {
      console.log(chalk.bold('\n  Service Bridge (optional)\n'));
      console.log(chalk.gray('  Most SaaS apps use profile auth + shared QA credentials — no Mailpit required.'));
      console.log(chalk.gray('  Set auth in .ghostrun/profiles/staging.json and secrets via env or auth/secrets/.'));
      console.log();
      console.log(chalk.gray('  Optional local dev stack: .ghostrun/services/dev.compose.yml'));
      console.log(chalk.gray('  Mailpit (magic links):  http://localhost:8025'));
      console.log(chalk.gray('  Hook catcher:           http://127.0.0.1:8787'));
      console.log(chalk.gray('  Start Mailpit only:     docker compose -f .ghostrun/services/dev.compose.yml up -d mailpit'));
      if (profile?.services) {
        console.log(chalk.cyan('\n  Active profile services:'));
        console.log(JSON.stringify(profile.services, null, 2));
      } else {
        console.log(chalk.gray('\n  No services block — profile auth only (recommended for password login).'));
      }
      console.log();
      break;
    }
    case 'doctor': {
      console.log(chalk.bold('\n  Service Bridge Health\n'));
      const results = await runServicesDoctor(profile?.services);
      for (const r of results) {
        const badge = r.ok ? chalk.green(' OK ') : chalk.red('FAIL');
        console.log(`  [${badge}] ${r.name} — ${r.detail}`);
      }
      console.log();
      break;
    }
    case 'inbox': {
      if (!isEmailBridgeEnabled(profile?.services)) {
        errorMsg('Mailpit not enabled on this profile. Add services.email or use profile auth with QA credentials.');
        process.exit(1);
      }
      const apiUrl = resolveEmailApiUrl(profile?.services)!;
      try {
        const messages = await fetchMailpitMessages(apiUrl);
        console.log(chalk.bold(`\n  Mailpit inbox (${messages.length} messages)\n`));
        console.log(sanitizeInboxSnapshot(messages, 15) || chalk.gray('  (empty)'));
      } catch (e) {
        errorMsg(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
      console.log();
      break;
    }
    case 'hooks': {
      const captures = listWebhookCaptures(20);
      console.log(chalk.bold(`\n  Webhook captures (${captures.length})\n`));
      for (const c of captures.slice(0, 10)) {
        console.log(`  ${chalk.gray(c.receivedAt)} ${chalk.cyan(c.method)} ${c.path} (${c.body.length} bytes)`);
      }
      if (captures.length === 0) console.log(chalk.gray('  (none — POST to http://127.0.0.1:8787/your/path)'));
      console.log();
      break;
    }
    case 'hook': {
      if (subArgs.includes('--daemon')) {
        const { url } = await startHookCatcher(8787);
        success(`Hook catcher listening on ${url}`);
        info('POST any path — captures saved to .ghostrun/services/webhooks/');
        info('Health: GET /hooks/health');
        await new Promise<never>(() => {});
      } else {
        errorMsg('Usage: ghostrun services hook --daemon');
        process.exit(1);
      }
      break;
    }
    case 'up': {
      copyDevServicesTemplate();
      const compose = path.join(getProjectPaths().servicesPath, 'dev.compose.yml');
      info(`Dev stack template: ${compose}`);
      info('Run: docker compose -f .ghostrun/services/dev.compose.yml up -d');
      break;
    }
    case 'seed': {
      const pg = profile?.services?.postgres;
      if (!pg?.connectionSecret) {
        errorMsg('Profile missing services.postgres.connectionSecret');
        process.exit(1);
      }
      const paths = getProjectPaths();
      const fixtures = (pg.fixtures || []).map(f => path.isAbsolute(f) ? f : path.join(paths.fixturesSql, f));
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

  if (cmd === '--version' || cmd === '-v') {
    const realBin = fs.realpathSync(process.argv[1]);
    const pkgPath = path.join(path.dirname(realBin), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    console.log(pkg.version);
    process.exit(0);
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printLogo(); divider(); console.log();
    const C = (s: string) => chalk.cyan(s.padEnd(34));
    const G = (s: string) => chalk.gray(s);
    const H = (s: string) => { console.log(chalk.bold.white('  ' + s)); console.log(chalk.gray('  ' + '─'.repeat(55))); };

    H('Record & Run');
    console.log(`  ${C('learn <url> [name]')}${G('Record a new flow (opens real browser)')}`);
    console.log(`  ${C('learn --cdp <endpoint>')}${G('Attach to a running browser instead (e.g. an AI agent\'s)')}`);
    console.log(`  ${C('run <id|name> [--var k=v]')}${G('Execute a flow headlessly')}`);
    console.log(`  ${C('run <id> --visible')}${G('Run with visible browser window')}`);
    console.log(`  ${C('run <id> --ci')}${G('CI-safe run (no implicit healing)')}`);
    console.log(`  ${C('run <id> --output json')}${G('JSON output with extracted data')}`);
    console.log(`  ${C('run <id> --report html')}${G('Run flow + save HTML report')}`);
    console.log(`  ${C('run <id> --reporter junit')}${G('Save JUnit XML report after run')}`);
    console.log(`  ${C('run <id> --video')}${G('Record video of the run')}`);
    console.log(`  ${C('run <id> --trace')}${G('Record Playwright trace for inspection')}`);
    console.log(`  ${C('run <id> --baseline')}${G('Fail on visual regression vs baselines')}`);
    console.log(`  ${C('run <id> --baseline-threshold 5')}${G('Visual diff threshold (percent)')}`);
    console.log(`  ${C('create [description]')}${G('Generate flow from natural language  🤖 AI')}`);
    console.log(`  ${C('author')}${G('Interactive menu to author a flow')}`);
    console.log(`  ${C('code:scan <directory>')}${G('Scan codebase, create draft flows    🤖 AI')}`);
    console.log();

    H('Flow Management');
    console.log(`  ${C('flow:list')}${G('List all flows with creator + pass rate')}`);
    console.log(`  ${C('flow:fix <id|name>')}${G('Interactively repair broken selectors')}`);
    console.log(`  ${C('flow:delete <id|name>')}${G('Delete a flow')}`);
    console.log(`  ${C('flow:export <id|name>')}${G('Export flow to .flow.json')}`);
    console.log(`  ${C('flow:import <file>')}${G('Import flow from .flow.json')}`);
    console.log(`  ${C('flow:rename <id|name> <new>')}${G('Rename a flow')}`);
    console.log(`  ${C('flow:clone <id|name>')}${G('Duplicate a flow')}`);
    console.log(`  ${C('flow:from-curl [cmd]')}${G('Parse curl command → create flow')}`);
    console.log(`  ${C('flow:from-spec <file>')}${G('Import OpenAPI/Swagger JSON or YAML spec')}`);
    console.log();

    H('Profiles');
    console.log(`  ${C('profile:list')}${G('List project profiles')}`);
    console.log(`  ${C('profile:show <name>')}${G('Show a project profile')}`);
    console.log(`  ${C('profile:create <name> [url]')}${G('Create a profile with optional base URL')}`);
    console.log(`  ${C('profile:use <name>')}${G('Set the active project profile')}`);
    console.log(`  ${C('profile:set <name> <key> <val>')}${G('Set baseUrl, auth.*, meta.*, or profile var')}`);
    console.log(`  ${C('profile:delete <name>')}${G('Delete a project profile')}`);
    console.log(`  ${C('profile accounts list <profile>')}${G('Roles: superadmin, admin, manager, guest')}`);
    console.log(`  ${C('profile account add <profile> <id>')}${G('Add account with email + password secrets')}`);
    console.log(chalk.gray(`  ${'  Run: --profile staging --account admin  (email + password per role)'.padEnd(52)}`));
    console.log();

    H('SaaS Service Bridge (optional)');
    console.log(`  ${C('services list')}${G('Overview — creds-first; Mailpit optional')}`);
    console.log(`  ${C('services doctor')}${G('Check configured services only')}`);
    console.log(`  ${C('services inbox')}${G('Mailpit inbox (requires services.email)')}`);
    console.log(`  ${C('services hooks')}${G('List captured webhooks')}`);
    console.log(`  ${C('services hook --daemon')}${G('Start local webhook catcher on :8787')}`);
    console.log(chalk.gray(`  ${'  Flow actions: db:*, webhook:*, email:* (optional Mailpit)'.padEnd(52)}`));
    console.log();

    H('Project Scope');
    console.log(`  ${C('sync flows')}${G('Import .ghostrun/flows/*.flow.json into DB')}`);
    console.log(`  ${C('migrate project-scope')}${G('Copy flows from ~/.ghostrun to this repo')}`);
    console.log();

    H('Monitor & Scheduling');
    console.log(`  ${C('monitor <id> --interval 60s')}${G('Poll a flow on an interval')}`);
    console.log(`  ${C('monitor daemon')}${G('Run cron scheduler (writes scheduler.pid)')}`);
    console.log(`  ${C('monitor schedule list')}${G('List cron schedules')}`);
    console.log(`  ${C('monitor schedule add <id> "<cron>"')}${G('Add schedule  e.g. "0 9 * * *"')}`);
    console.log(`  ${C('monitor schedule remove <id>')}${G('Remove a schedule')}`);
    console.log(chalk.gray(`  ${'  Legacy (deprecated v1.3.0): flow:schedule, schedule:list, serve'.padEnd(52)}`));
    console.log(`  ${C('serve --ui [--port 3000]')}${G('Launch the web dashboard')}`);
    console.log();

    H('Test Suites');
    console.log(`  ${C('suite:create <name>')}${G('Create a test suite')}`);
    console.log(`  ${C('suite:add <suite> <flow>')}${G('Add a flow to a suite')}`);
    console.log(`  ${C('suite:list')}${G('List all suites')}`);
    console.log(`  ${C('suite:show <suite>')}${G('Show flows in a suite')}`);
    console.log(`  ${C('suite:run <suite> [--var k=v] [--parallel]')}${G('Run all flows in a suite')}`);
    console.log();

    H('Visual Baselines');
    console.log(`  ${C('baseline:set <flow-id>')}${G('Capture reference screenshots')}`);
    console.log(`  ${C('baseline:clear <flow-id>')}${G('Clear baselines for a flow')}`);
    console.log(`  ${C('baseline:show <flow-id>')}${G('List baseline screenshots')}`);
    console.log(`  ${C('run <id> --baseline')}${G('Gate runs on visual diff vs baselines')}`);
    console.log();

    H('Run History & Analysis');
    console.log(`  ${C('run:list')}${G('List recent runs with status + timing')}`);
    console.log(`  ${C('run:show <id>')}${G('Full step details + screenshots')}`);
    console.log(`  ${C('run:diff <id1> <id2>')}${G('Pixel-diff screenshots between two runs')}`);
    console.log(`  ${C('run:analyze <id>')}${G('Plain-English failure analysis          🤖 AI')}`);
    console.log(`  ${C('repair list')}${G('List stored repair proposals')}`);
    console.log(`  ${C('repair show <id>')}${G('Show repair proposal details')}`);
    console.log(`  ${C('repair apply <id>')}${G('Apply a stored repair proposal')}`);
    console.log(`  ${C('improve')}${G('Analyze GhostRun data and suggest improvements')}`);
    console.log(`  ${C('report publish')}${G('Bundle HTML/JUnit/screenshots for CI')}`);
    console.log(`  ${C('report list')}${G('List recent runs')}`);
    console.log(`  ${C('integrations list')}${G('Show GitHub/Linear integration config')}`);
    console.log();

    H('Template Store');
    console.log(`  ${C('store list')}${G('Browse 10+ ready-made flow templates')}`);
    console.log(`  ${C('store install <name>')}${G('Install a template (sets {{variables}})')}`);
    console.log();

    H('Data Extraction & Monitoring');
    console.log(`  ${C('monitor <id|name>')}${G('Run flow + show extracted data changes')}`);
    console.log(`  ${C('monitor <id> --output json')}${G('Monitor with JSON output')}`);
    console.log(`  ${C('monitor <id> --interval <s>')}${G('Loop: run every N seconds (default 60)')}`);
    console.log(`  ${C('monitor <id> --interval 30 --profile <name>')}${G('Continuous monitor with profile')}`);
    if (isCrawleeEnabled()) {
      console.log(`  ${C('scrape <url> [opts]')}${G('Scrape website data with Crawlee')}`);
      console.log(`  ${C('scrape:run <url> --flow <id>')}${G('Scrape first, then run a flow')}`);
      console.log(`  ${C('scrape:list')}${G('List saved scrape datasets')}`);
      console.log(`  ${C('scrape:show <id>')}${G('Show saved scrape JSON')}`);
      console.log(chalk.gray(`  ${'  Options: --max-pages N  --selector CSS  --output json'.padEnd(52)}`));
    }
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

    H('Load & Performance Testing');
    console.log(`  ${C('perf:run <flow> [opts]')}${G('Run load test  --vus 20 --duration 30s')}`);
    console.log(`  ${C('perf:export <flow> [opts]')}${G('Export k6 script  --p95 500 --max-errors 1')}`);
    console.log(`  ${C('perf:list')}${G('List past performance runs')}`);
    console.log(`  ${C('perf:show <run-id>')}${G('Show detailed stats for a perf run')}`);
    console.log(`  ${C('perf:compare <id-A> <id-B>')}${G('Side-by-side comparison of two perf runs')}`);
    console.log(`  ${C('perf:run <flow> --report html')}${G('Run load test + save HTML report')}`);
    console.log(chalk.gray(`  ${'  Options: --vus N  --duration Ns  --ramp-up Ns  --timeout Ns'.padEnd(52)}`));
    console.log();

    H('Chat & Setup');
    console.log(`  ${C('chat')}${G('Ask GhostRun Bot — Q&A + run flows      🤖 AI')}`);
    console.log(`  ${C('init [--yes]')}${G('Setup wizard (Chromium + AI provider)')}`);
    console.log(`  ${C('audit')}${G('Scan project for secret leaks')}`);
    console.log(`  ${C('config:mode [assist|auto]')}${G('Show or set interaction mode')}`);
    console.log(`  ${C('ai:status')}${G('AI provider, policy, and usage summary')}`);
    console.log(`  ${C('ai:usage')}${G('Aggregated AI token and call usage')}`);
    console.log(`  ${C('ai:sessions [limit]')}${G('Recent sanitized AI session log')}`);
    console.log();

    H('Exploration & System');
    console.log(`  ${C('explore <url>')}${G('Auto-discover flows via BFS crawl       🤖 AI')}`);
    console.log(`  ${C('explore:list')}${G('List all explore sessions')}`);
    console.log(`  ${C('explore:confirm <report-id>')}${G('Save confirmed flows from explore')}`);
    console.log(`  ${C('status')}${G('Stats, creator breakdown, AI provider')}`);
    console.log(`  ${C('doctor')}${G('Run a health checklist for GhostRun')}`);
    console.log(`  ${C('benchmark author')}${G('Measure AI flow generation quality')}`);
    console.log(`  ${C('serve')}${G('Open web dashboard (ghostrun serve --ui)')}`);
    console.log();
    console.log(chalk.gray('  🤖 AI  = enhanced by AI (Ollama local or ANTHROPIC_API_KEY)'));
    console.log(chalk.gray('  👤     = human-recorded   🤖 = agent/AI-generated'));
    console.log(chalk.gray('  Flags:     --visible  --ci  --profile <name>  --baseline  --output json  --var key=value'));
    console.log();
    process.exit(0);
  }

  if (cmd === 'repair' && args[1]) {
    const sub = args[1];
    const rest = args.slice(2);
    switch (sub) {
      case 'list': await runRepairList(); break;
      case 'show':
        if (!rest[0]) { errorMsg('Repair proposal ID required'); process.exit(1); }
        await runRepairShow(rest[0]); break;
      case 'apply':
        if (!rest[0]) { errorMsg('Repair proposal ID required'); process.exit(1); }
        await runRepairApply(rest[0]); break;
      default:
        errorMsg(`Unknown repair subcommand: ${sub}. Use: list, show, apply`);
        process.exit(1);
    }
    db.close();
    return;
  }

  if (cmd === 'report' && args[1]) {
    const sub = args[1];
    const rest = args.slice(2);
    switch (sub) {
      case 'list': await runListRuns(); break;
      case 'show':
        if (!rest[0]) { errorMsg('Run ID required'); process.exit(1); }
        await runShowRun(rest[0]); break;
      case 'diff':
        if (!rest[0] || !rest[1]) { errorMsg('Usage: ghostrun report diff <run1> <run2>'); process.exit(1); }
        await runDiff(rest[0], rest[1]); break;
      case 'analyze':
        if (!rest[0]) { errorMsg('Run ID required'); process.exit(1); }
        await runAnalyzeRun(rest[0]); break;
      case 'publish':
        await runReportPublish(rest); break;
      default:
        errorMsg(`Unknown report subcommand: ${sub}. Use: list, show, diff, analyze, publish`);
        process.exit(1);
    }
    db.close();
    return;
  }

  if (cmd === 'profile' && args[1] && !args[1].includes(':')) {
    const sub = args[1];
    const rest = args.slice(2);
    switch (sub) {
      case 'list': await runProfileList(); break;
      case 'show':
        if (!rest[0]) { errorMsg('Profile name required'); process.exit(1); }
        await runProfileShow(rest[0]); break;
      case 'create':
        if (!rest[0]) { errorMsg('Profile name required'); process.exit(1); }
        await runProfileCreate(rest[0], rest[1]); break;
      case 'use':
        if (!rest[0]) { errorMsg('Profile name required'); process.exit(1); }
        await runProfileUse(rest[0]); break;
      case 'set':
        if (!rest[0] || !rest[1] || !rest[2]) { errorMsg('Usage: ghostrun profile set <name> <key> <value>'); process.exit(1); }
        await runProfileSet(rest[0], rest[1], rest[2]); break;
      case 'delete':
        if (!rest[0]) { errorMsg('Profile name required'); process.exit(1); }
        await runProfileDelete(rest[0]); break;
      case 'accounts':
        if (rest[0] === 'list') {
          if (!rest[1]) { errorMsg('Usage: ghostrun profile accounts list <profile>'); process.exit(1); }
          await runProfileAccountsList(rest[1]);
        } else if (rest[0] === 'show') {
          if (!rest[1] || !rest[2]) { errorMsg('Usage: ghostrun profile accounts show <profile> <account>'); process.exit(1); }
          await runProfileAccountShow(rest[1], rest[2]);
        } else {
          errorMsg('Usage: ghostrun profile accounts list|show <profile> [account]');
          process.exit(1);
        }
        break;
      case 'account':
        if (rest[0] === 'add') {
          if (!rest[1] || !rest[2]) {
            errorMsg('Usage: ghostrun profile account add <profile> <account-id> [--email addr] [--password-secret ENV] [--login-flow name]');
            process.exit(1);
          }
          const addRest = rest.slice(3);
          await runProfileAccountAdd(rest[1], rest[2], {
            email: parseFlagValue(addRest, '--email'),
            emailSecret: parseFlagValue(addRest, '--email-secret'),
            passwordSecret: parseFlagValue(addRest, '--password-secret'),
            loginFlow: parseFlagValue(addRest, '--login-flow'),
            label: parseFlagValue(addRest, '--label'),
            default: addRest.includes('--default'),
          });
        } else {
          errorMsg('Usage: ghostrun profile account add <profile> <account-id> [options]');
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

  if (cmd === 'author' && args[1]) {
    const sub = args[1];
    const rest = args.slice(2);
    switch (sub) {
      case 'create':
        await runCreate(rest.filter(a => !a.startsWith('--')).join(' ') || undefined, rest);
        break;
      case 'record':
      case 'learn':
        if (!rest[0]) { errorMsg('URL required'); process.exit(1); }
        await runLearn(rest[0]); break;
      case 'curl':
        await runFlowFromCurl(rest[0]); break;
      case 'spec':
        if (!rest[0]) { errorMsg('OpenAPI spec path required'); process.exit(1); }
        await runFlowFromSpec(rest[0]); break;
      case 'explore':
        if (!rest[0]) { errorMsg('URL required'); process.exit(1); }
        await runExplore(rest[0]); break;
      default:
        await runAuthor();
    }
    db.close();
    return;
  }

  if (cmd === 'ai' && args[1]) {
    const sub = args[1];
    switch (sub) {
      case 'status': await runAiStatus(); break;
      case 'usage': await runAiUsage(); break;
      case 'sessions': await runAiSessions(args[2]); break;
      default:
        errorMsg(`Unknown ai subcommand: ${sub}. Use: status, usage, sessions`);
        process.exit(1);
    }
    db.close();
    return;
  }

  if (cmd === 'integrations') {
    await runIntegrationsCommand(args.slice(1));
    db.close();
    return;
  }

  if (cmd === 'services') {
    await runServicesCommand(args.slice(1));
    db.close();
    return;
  }

  if (cmd === 'sync' && args[1] === 'flows') {
    await runSyncFlows();
    db.close();
    return;
  }

  if (cmd === 'migrate' && args[1] === 'project-scope') {
    await runMigrateProjectScope();
    db.close();
    return;
  }

  if (LEGACY_COMMAND_MAP[cmd]) rejectLegacyCommand(cmd);

  switch (cmd) {
    case 'doctor':          await runDoctor(); break;
    case 'benchmark':
      if (args[1] === 'author') {
        await runAuthorBenchmark(args.slice(2));
      } else {
        errorMsg('Usage: ghostrun benchmark author [--dry-run]');
        process.exit(1);
      }
      break;
    case 'audit':           await runSecurityAudit(true); break;
    case 'author':          await runAuthor(); break;
    case 'init':            await runInit(args.slice(1)); break;
    case 'chat':            await runChat(); break;
    case 'config:mode':     await runConfigMode(args[1]); break;
    case 'monitor':
      await runMonitorCommand(args.slice(1)); break;
    case 'scrape':
      if (!args[1]) { errorMsg('URL required'); process.exit(1); }
      await runScrapeCommand(args[1], args.slice(2)); break;
    case 'scrape:run':
      if (!args[1]) { errorMsg('URL required'); process.exit(1); }
      await runScrapeAndFlowCommand(args[1], args.slice(2)); break;
    case 'scrape:list':     await runScrapeList(); break;
    case 'scrape:show':
      if (!args[1]) { errorMsg('Scrape ID required'); process.exit(1); }
      await runScrapeShow(args[1]); break;
    case 'learn': {
      const learnArgs = args.slice(1);
      const cdpEndpoint = parseFlagValue(process.argv, '--cdp');
      const cdpIdx = learnArgs.indexOf('--cdp');
      const positionals = learnArgs.filter((a, i) => !a.startsWith('--') && i !== cdpIdx + 1);
      // With --cdp, the URL is optional (inferred from the attached tab) — a lone
      // positional that isn't shaped like a URL is the flow name, not the URL.
      const firstLooksLikeUrl = positionals[0] && /^https?:\/\//i.test(positionals[0]);
      let url: string | undefined;
      let name: string | undefined;
      if (cdpEndpoint && !firstLooksLikeUrl) {
        name = positionals[0];
      } else {
        url = positionals[0];
        name = positionals[1];
      }
      if (!url && !cdpEndpoint) {
        errorMsg('URL required (or pass --cdp <endpoint> to attach to an existing browser and use its current page)');
        process.exit(1);
      }
      await runLearn(url, name, { cdpEndpoint });
      break;
    }
    case 'run': {
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      const reportFlag = args.indexOf('--report');
      const reportFmt = reportFlag >= 0 ? (args[reportFlag + 1] || 'html') : null;
      const reportOut = (() => { const i = args.indexOf('--output'); return i >= 0 && args[i+1] && !args[i+1].startsWith('--') && args[i+1] !== 'json' ? args[i+1] : null; })();
      const reporterIdx = args.indexOf('--reporter');
      const reporterFmt = reporterIdx >= 0 ? (args[reporterIdx + 1] || '') : null;
      const savedRunId = await runFlow(args[1], globalVars);
      if (reportFmt && savedRunId) {
        const outFile = reportOut || `ghostrun-report-${savedRunId.slice(0,8)}.html`;
        await generateRunReport(savedRunId, outFile);
      }
      if (reporterFmt === 'junit' && savedRunId) {
        const runSteps = db.listSteps(savedRunId);
        const runRecord = db.getRun(savedRunId);
        const totalMs = runRecord?.duration || 0;
        const flowRecord = runRecord ? (db.findFlowByPartialId(runRecord.flowId) || db.findFlowByName(runRecord.flowId)) : null;
        const flowNameForReport = flowRecord?.name || args[1];
        const junitPath = await writeJUnitReport(
          flowNameForReport,
          savedRunId,
          runSteps.map(s => ({ name: s.name, status: s.status, duration: s.duration, errorMessage: s.errorMessage })),
          totalMs
        );
        info('JUnit report: ' + chalk.cyan(junitPath));
      }
      break;
    }
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
    case 'flow:rename':
      if (!args[1] || !args[2]) { errorMsg('Usage: flow:rename <id|name> <new-name>'); process.exit(1); }
      await runRenameFlow(args[1], args.slice(2).join(' ')); break;
    case 'flow:clone':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runCloneFlow(args[1]); break;
    case 'flow:from-curl':
      await runFlowFromCurl(args[1]); break;
    case 'flow:from-spec':
      if (!args[1]) { errorMsg('File path required'); process.exit(1); }
      await runFlowFromSpec(args[1]); break;
    case 'serve':           await runServe(args.slice(1)); break;
    case 'improve':         await runImprove(); break;
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
    case 'perf:run': {
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      const perfExtraArgs = args.slice(2);
      await runPerfRun(args[1], perfExtraArgs);
      const perfReportFlag = perfExtraArgs.indexOf('--report');
      if (perfReportFlag >= 0) {
        const perfRuns = db.listPerfRuns();
        const latestPerfRun = perfRuns[0];
        if (latestPerfRun) {
          const perfOutIdx = perfExtraArgs.indexOf('--output');
          const perfOutFile = perfOutIdx >= 0 && perfExtraArgs[perfOutIdx+1] && !perfExtraArgs[perfOutIdx+1].startsWith('--') ? perfExtraArgs[perfOutIdx+1] : `ghostrun-perf-${latestPerfRun.id.slice(0,8)}.html`;
          await generatePerfReport(latestPerfRun.id, perfOutFile);
        }
      }
      break;
    }
    case 'perf:export':
      if (!args[1]) { errorMsg('Flow ID or name required'); process.exit(1); }
      await runPerfExport(args[1], args.slice(2)); break;
    case 'perf:list':         await runPerfList(); break;
    case 'perf:show':
      if (!args[1]) { errorMsg('Perf run ID required'); process.exit(1); }
      await runPerfShow(args[1]); break;
    case 'perf:compare':
      if (!args[1] || !args[2]) { errorMsg('Usage: perf:compare <run-id-A> <run-id-B>'); process.exit(1); }
      await runPerfCompare(args[1], args[2]); break;
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
