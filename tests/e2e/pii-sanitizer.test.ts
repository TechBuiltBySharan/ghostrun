/**
 * Regression test for a bug where sanitizePII() was applied to the value
 * passed into Playwright's page.fill()/page.type() calls — meaning a real
 * email/phone/card-shaped value typed by a flow author into the actual page
 * got replaced with a placeholder token ("[EMAIL]", etc.) instead of the
 * real value ever reaching the browser. Sanitization must only ever apply
 * to the copy that gets persisted, displayed, or sent to an AI model — never
 * to the argument actually passed to the Playwright call.
 *
 * Each test page reflects the live input value into document.title via an
 * oninput handler, so assert:title (a read-only, unrelated-to-PII action)
 * can prove what was actually typed into the DOM — not what GhostRun
 * believes it typed.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const GHOSTRUN_CLI = path.join(PROJECT_ROOT, 'ghostrun.js');
const WORKSPACE = path.join(os.tmpdir(), `ghostrun-pii-${process.pid}`);
const GHOSTRUN_DIR = path.join(WORKSPACE, '.ghostrun');

function ensureWorkspace(): void {
  fs.mkdirSync(path.join(GHOSTRUN_DIR, 'data'), { recursive: true });
  fs.mkdirSync(path.join(GHOSTRUN_DIR, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(GHOSTRUN_DIR, 'sessions'), { recursive: true });
  const configPath = path.join(GHOSTRUN_DIR, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ version: '1.0' }, null, 2));
  }
}

function ghostrun(args: string): { stdout: string; stderr: string; status: number } {
  ensureWorkspace();
  const result = spawnSync(
    process.execPath,
    [GHOSTRUN_CLI, ...args.split(/\s+/).filter(Boolean)],
    { cwd: WORKSPACE, env: process.env, encoding: 'utf8', timeout: 60_000 }
  );
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

type TestDatabaseManager = InstanceType<typeof import('../../packages/database/src/manager').DatabaseManager>;

async function createTestDatabase(): Promise<TestDatabaseManager> {
  ensureWorkspace();
  const { DatabaseManager } = await import('../../packages/database/src/manager');
  return new DatabaseManager({
    dbPath: path.join(GHOSTRUN_DIR, 'data', 'ghostrun.db'),
    screenshotsPath: path.join(GHOSTRUN_DIR, 'screenshots'),
    sessionsPath: path.join(GHOSTRUN_DIR, 'sessions'),
  });
}

/** A data: URL page whose title mirrors whatever actually lands in the input. */
function reflectorPage(inputId: string): string {
  const html = `<input id="${inputId}" type="email" oninput="document.title=this.value">`;
  return `data:text/html,${encodeURIComponent(html)}`;
}

afterAll(() => {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
});

describe('sanitizePII must never touch the value typed into the real page', () => {
  it('page.fill() receives the real email, not "[EMAIL]"', async () => {
    const db = await createTestDatabase();
    const realEmail = 'realuser@example.com';
    const graph = {
      nodes: [
        { id: 'n1', type: 'action', label: 'Navigate', action: 'navigate', url: reflectorPage('email') },
        { id: 'n2', type: 'action', label: 'Fill email field', action: 'fill', selector: '#email', value: realEmail },
        { id: 'n3', type: 'action', label: 'Assert real value landed in the DOM', action: 'assert:title', value: realEmail },
      ],
      edges: [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }],
    };
    const flow = db.createFlow({ name: 'PII regression — fill', graph });

    try {
      ghostrun(`run ${flow.id} --ci`);
      const run = db.listRuns(flow.id, 1)[0];
      expect(run.status, `run failed: ${run.errorMessage}`).toBe('passed');
    } finally {
      db.deleteFlow(flow.id);
      db.close();
    }
  });

  it('page.type() receives the real email, not "[EMAIL]"', async () => {
    const db = await createTestDatabase();
    const realEmail = 'typeduser@example.com';
    const graph = {
      nodes: [
        { id: 'n1', type: 'action', label: 'Navigate', action: 'navigate', url: reflectorPage('email') },
        { id: 'n2', type: 'action', label: 'Type email field', action: 'type', selector: '#email', value: realEmail },
        { id: 'n3', type: 'action', label: 'Assert real value landed in the DOM', action: 'assert:title', value: realEmail },
      ],
      edges: [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }],
    };
    const flow = db.createFlow({ name: 'PII regression — type', graph });

    try {
      ghostrun(`run ${flow.id} --ci`);
      const run = db.listRuns(flow.id, 1)[0];
      expect(run.status, `run failed: ${run.errorMessage}`).toBe('passed');
    } finally {
      db.deleteFlow(flow.id);
      db.close();
    }
  });

  it('the stored/persisted step value is still sanitized (unrelated to the DOM fix)', async () => {
    const db = await createTestDatabase();
    const realEmail = 'stored@example.com';
    const graph = {
      nodes: [
        { id: 'n1', type: 'action', label: 'Navigate', action: 'navigate', url: reflectorPage('email') },
        { id: 'n2', type: 'action', label: 'Fill email field', action: 'fill', selector: '#email', value: realEmail },
      ],
      edges: [{ source: 'n1', target: 'n2' }],
    };
    const flow = db.createFlow({ name: 'PII regression — storage stays sanitized', graph });

    try {
      ghostrun(`run ${flow.id} --ci`);
      const run = db.listRuns(flow.id, 1)[0];
      const steps = db.listSteps(run.id);
      const fillStep = steps.find(s => s.action === 'fill');
      expect(fillStep?.value).toBe('[EMAIL]');
    } finally {
      db.deleteFlow(flow.id);
      db.close();
    }
  });
});
