/**
 * Project-scoped paths and flow file sync (.ghostrun/ per repo).
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID as uuidv4 } from 'crypto';

export interface ProjectPaths {
  root: string;
  ghostrunPath: string;
  configPath: string;
  projectJsonPath: string;
  dbPath: string;
  screenshotsPath: string;
  sessionsPath: string;
  flowsBrowser: string;
  flowsApi: string;
  flowsGenerated: string;
  fixturesSql: string;
  servicesPath: string;
  webhooksPath: string;
}

let activePaths: ProjectPaths | null = null;

export function resolveProjectRoot(startDir = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const config = path.join(dir, '.ghostrun', 'config.json');
    if (fs.existsSync(config)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function buildProjectPaths(root: string): ProjectPaths {
  const ghostrunPath = path.join(root, '.ghostrun');
  return {
    root,
    ghostrunPath,
    configPath: path.join(ghostrunPath, 'config.json'),
    projectJsonPath: path.join(ghostrunPath, 'project.json'),
    dbPath: path.join(ghostrunPath, 'data', 'ghostrun.db'),
    screenshotsPath: path.join(ghostrunPath, 'screenshots'),
    sessionsPath: path.join(ghostrunPath, 'sessions'),
    flowsBrowser: path.join(ghostrunPath, 'flows', 'browser'),
    flowsApi: path.join(ghostrunPath, 'flows', 'api'),
    flowsGenerated: path.join(ghostrunPath, 'flows', 'generated'),
    fixturesSql: path.join(ghostrunPath, 'fixtures', 'sql'),
    servicesPath: path.join(ghostrunPath, 'services'),
    webhooksPath: path.join(ghostrunPath, 'services', 'webhooks'),
  };
}

export function initProjectContext(startDir = process.cwd()): ProjectPaths {
  const root = resolveProjectRoot(startDir) || path.resolve(startDir);
  activePaths = buildProjectPaths(root);
  return activePaths;
}

export function getProjectPaths(): ProjectPaths {
  if (!activePaths) return initProjectContext();
  return activePaths;
}

export function ensureProjectDirs(paths: ProjectPaths = getProjectPaths()): void {
  const dirs = [
    paths.ghostrunPath,
    path.dirname(paths.dbPath),
    paths.screenshotsPath,
    paths.sessionsPath,
    paths.flowsBrowser,
    paths.flowsApi,
    paths.flowsGenerated,
    paths.fixturesSql,
    paths.servicesPath,
    paths.webhooksPath,
    path.join(paths.ghostrunPath, 'profiles'),
    path.join(paths.ghostrunPath, 'proposals', 'repairs'),
    path.join(paths.ghostrunPath, 'runs'),
    path.join(paths.ghostrunPath, 'reports'),
    path.join(paths.ghostrunPath, 'auth', 'storage-state'),
    path.join(paths.ghostrunPath, 'auth', 'secrets'),
    path.join(paths.ghostrunPath, 'ai', 'sessions'),
  ];
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
}

export function ensureProjectJson(projectName?: string): void {
  const paths = getProjectPaths();
  if (fs.existsSync(paths.projectJsonPath)) return;
  const id = createHash('sha256').update(paths.root).digest('hex').slice(0, 16);
  fs.writeFileSync(
    paths.projectJsonPath,
    JSON.stringify({
      id,
      name: projectName || path.basename(paths.root),
      root: paths.root,
      createdAt: new Date().toISOString(),
      schemaVersion: '1',
    }, null, 2)
  );
}

export function flowSlug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'flow';
}

export function flowFilePath(flow: { id: string; name: string; createdBy?: string }, kind: 'browser' | 'api' | 'generated' = 'browser'): string {
  const paths = getProjectPaths();
  const dir = kind === 'api' ? paths.flowsApi : kind === 'generated' ? paths.flowsGenerated : paths.flowsBrowser;
  return path.join(dir, `${flowSlug(flow.name)}-${flow.id.slice(0, 8)}.flow.json`);
}

export interface FlowFilePayload {
  version: string;
  exportedAt: string;
  flow: {
    id?: string;
    name: string;
    description?: string | null;
    appUrl?: string | null;
    graph: object;
    createdBy?: string;
  };
}

export function writeFlowFile(flow: {
  id: string;
  name: string;
  description?: string | null;
  appUrl?: string | null;
  graph: string;
  createdBy?: string;
}): string {
  const paths = getProjectPaths();
  ensureProjectDirs(paths);
  let graph: object;
  try { graph = JSON.parse(flow.graph); } catch { graph = {}; }
  const kind = flow.createdBy === 'agent' ? 'generated' : 'browser';
  const filePath = flowFilePath({ id: flow.id, name: flow.name, createdBy: flow.createdBy }, kind);
  const payload: FlowFilePayload = {
    version: '1.1.0',
    exportedAt: new Date().toISOString(),
    flow: {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      appUrl: flow.appUrl,
      graph,
      createdBy: flow.createdBy,
    },
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

export function deleteFlowFile(flowId: string, flowName: string): void {
  const paths = getProjectPaths();
  for (const dir of [paths.flowsBrowser, paths.flowsApi, paths.flowsGenerated]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.includes(flowId.slice(0, 8))) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  }
}

export function listFlowFiles(): string[] {
  const paths = getProjectPaths();
  const out: string[] = [];
  for (const dir of [paths.flowsBrowser, paths.flowsApi, paths.flowsGenerated]) {
    if (!fs.existsSync(dir)) continue;
    out.push(...fs.readdirSync(dir).filter(f => f.endsWith('.flow.json')).map(f => path.join(dir, f)));
  }
  return out;
}

export interface FlowRecordLike {
  id: string;
  name: string;
  description?: string | null;
  appUrl?: string | null;
  graph: string;
  createdBy?: string;
}

export function syncFlowsFromDisk(
  upsert: (data: { name: string; description?: string; appUrl?: string; graph: object; createdBy?: string }) => FlowRecordLike,
  findByName: (name: string) => FlowRecordLike | null,
  update: (id: string, data: Partial<{ name: string; description: string; appUrl: string; graph: object }>) => FlowRecordLike | null,
): { imported: number; updated: number; skipped: number } {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  for (const filePath of listFlowFiles()) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as FlowFilePayload;
      const f = raw.flow;
      if (!f?.name || !f.graph) { skipped++; continue; }
      const existing = findByName(f.name);
      if (existing) {
        update(existing.id, {
          description: f.description || undefined,
          appUrl: f.appUrl || undefined,
          graph: f.graph,
        });
        updated++;
      } else {
        upsert({
          name: f.name,
          description: f.description || undefined,
          appUrl: f.appUrl || undefined,
          graph: f.graph,
          createdBy: f.createdBy,
        });
        imported++;
      }
    } catch {
      skipped++;
    }
  }
  return { imported, updated, skipped };
}

export function copyDevServicesTemplate(): string {
  const paths = getProjectPaths();
  ensureProjectDirs(paths);
  const dest = path.join(paths.servicesPath, 'dev.compose.yml');
  if (fs.existsSync(dest)) return dest;
  const content = `# GhostRun Service Bridge — optional local Mailpit, Redis, Postgres
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
  fs.writeFileSync(dest, content);
  return dest;
}

export function updateProjectGitignore(): void {
  const paths = getProjectPaths();
  const gitignorePath = path.join(paths.ghostrunPath, '.gitignore');
  const lines = [
    'runs/',
    'reports/',
    'screenshots/',
    'sessions/',
    'data/ghostrun.db',
    'data/*.db',
    'auth/secrets/',
    'auth/storage-state/*.json',
    'services/webhooks/*.json',
    'ai/sessions/',
    '*.local.json',
    '.env',
  ];
  fs.writeFileSync(gitignorePath, lines.join('\n') + '\n');
}
