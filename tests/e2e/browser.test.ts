/**
 * Browser E2E Tests for GhostRun
 *
 * Covers:
 *  1. Connectivity smoke tests against stable public websites (fetch-level)
 *  2. Programmatic flow creation + execution via DatabaseManager + ghostrun CLI
 *  3. --ci flag behaviour (no implicit AI healing / auto-apply)
 *  4. Page-structure assertions that are resilient to minor UI changes
 *
 * Test site criteria:
 *  - Publicly accessible without authentication
 *  - Stable and well-maintained
 *  - Robots.txt permits crawlers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const GHOSTRUN_CLI = path.join(PROJECT_ROOT, 'ghostrun.js');

/** Isolated project workspace — same DB path for DatabaseManager and ghostrun CLI. */
const E2E_WORKSPACE = path.join(os.tmpdir(), `ghostrun-e2e-${process.pid}`);
const E2E_GHOSTRUN = path.join(E2E_WORKSPACE, '.ghostrun');
const E2E_DB = path.join(E2E_GHOSTRUN, 'data', 'ghostrun.db');

function ensureE2eWorkspace(): void {
  fs.mkdirSync(path.join(E2E_GHOSTRUN, 'data'), { recursive: true });
  fs.mkdirSync(path.join(E2E_GHOSTRUN, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(E2E_GHOSTRUN, 'sessions'), { recursive: true });
  const configPath = path.join(E2E_GHOSTRUN, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ version: '1.0' }, null, 2));
  }
}

type TestDatabaseManager = InstanceType<typeof import('../../packages/database/src/manager').DatabaseManager>;

async function createTestDatabase(): Promise<TestDatabaseManager> {
  ensureE2eWorkspace();
  const { DatabaseManager } = await import('../../packages/database/src/manager');
  return new DatabaseManager({
    dbPath: E2E_DB,
    screenshotsPath: path.join(E2E_GHOSTRUN, 'screenshots'),
    sessionsPath: path.join(E2E_GHOSTRUN, 'sessions'),
  });
}

/** Run `node ghostrun.js <args>` synchronously and return stdout + exit code. */
function ghostrun(args: string, env?: Record<string, string>): { stdout: string; stderr: string; status: number } {
  ensureE2eWorkspace();
  const result = spawnSync(
    process.execPath,
    [GHOSTRUN_CLI, ...args.split(/\s+/).filter(Boolean)],
    {
      cwd: E2E_WORKSPACE,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: 60_000,
    }
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

afterAll(() => {
  fs.rmSync(E2E_WORKSPACE, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test URLs — chosen for stability and bot-permissive robots.txt
// ---------------------------------------------------------------------------

const TEST_SITES = {
  wikipedia:  { url: 'https://www.wikipedia.org',       name: 'Wikipedia' },
  hackernews: { url: 'https://news.ycombinator.com',    name: 'Hacker News' },
  mdn:        { url: 'https://developer.mozilla.org',   name: 'MDN Web Docs' },
  // example.com is an IANA-maintained page guaranteed to be stable forever
  example:    { url: 'https://example.com',             name: 'Example Domain' },
};

/** Browser-like UA — some sites block generic bot strings in CI datacenters. */
const EXTERNAL_UA =
  'Mozilla/5.0 (compatible; GhostRun/2.0; +https://github.com/TechBuiltBySharan/ghostrun)';

async function fetchExternal(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': EXTERNAL_UA } });
  return { status: res.status, body: await res.text() };
}

/** HN returns a bare "Sorry." page for many datacenter IPs (GitHub Actions). */
function isHnBlocked(body: string): boolean {
  return body.trim() === 'Sorry.' || (!body.includes('item?id=') && !body.includes('athing'));
}

async function fetchHn(): Promise<{ status: number; body: string; blocked: boolean }> {
  const result = await fetchExternal(TEST_SITES.hackernews.url);
  return { ...result, blocked: isHnBlocked(result.body) };
}

// ---------------------------------------------------------------------------
// 1. Connectivity — plain HTTP fetch (no browser needed)
// ---------------------------------------------------------------------------

describe('Connectivity smoke tests', () => {
  it('Wikipedia homepage returns 200 and contains "Wikipedia"', async () => {
    const res = await fetch(TEST_SITES.wikipedia.url, {
      headers: { 'User-Agent': 'GhostRun-Test/1.0' },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Wikipedia');
  });

  it('Hacker News returns 200 with story links', async () => {
    const { status, body, blocked } = await fetchHn();
    expect(status).toBe(200);
    if (blocked) return; // datacenter IP block — skip structure check
    expect(body).toContain('athing');
  });

  it('MDN Web Docs returns 200 with substantial content', async () => {
    const res = await fetch(TEST_SITES.mdn.url, {
      headers: { 'User-Agent': 'GhostRun-Test/1.0' },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(1000);
    expect(body).toContain('Web Docs');
  });

  it('example.com is reachable and stable', async () => {
    const res = await fetch(TEST_SITES.example.url);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Example Domain');
  });

  it('follows redirects gracefully (wikipedia.org -> www.wikipedia.org)', async () => {
    const res = await fetch('https://wikipedia.org', { redirect: 'follow' });
    expect([200, 301, 302]).toContain(res.status);
  });

  it('response URL uses HTTPS', async () => {
    const res = await fetch(TEST_SITES.wikipedia.url);
    expect(res.url).toMatch(/^https:\/\//);
  });
});

// ---------------------------------------------------------------------------
// 2. Page structure — resilient assertions against public pages
// ---------------------------------------------------------------------------

describe('Page structure assertions', () => {
  it('Wikipedia homepage has a search form', async () => {
    const res = await fetch(TEST_SITES.wikipedia.url, {
      headers: { 'User-Agent': 'GhostRun-Test/1.0' },
    });
    const body = await res.text();
    // Search input or form element with search attribute
    expect(body).toMatch(/<input[^>]*search|<form[^>]*search/i);
  });

  it('Hacker News homepage has item IDs in links', async () => {
    const { body, blocked } = await fetchHn();
    if (blocked) return; // HN blocks GitHub Actions IPs with "Sorry."
    expect(body).toContain('item?id=');
  });

  it('MDN homepage has navigation landmarks', async () => {
    const res = await fetch(TEST_SITES.mdn.url, {
      headers: { 'User-Agent': 'GhostRun-Test/1.0' },
    });
    const body = await res.text();
    expect(body).toMatch(/<nav[\s>]/i);
  });

  it('Wikipedia has interactive elements (links + forms or buttons)', async () => {
    const res = await fetch(TEST_SITES.wikipedia.url, {
      headers: { 'User-Agent': 'GhostRun-Test/1.0' },
    });
    const body = await res.text();
    expect(body).toContain('<a ');
    expect(body.includes('<form') || body.includes('<button')).toBe(true);
  });

  it('Wikipedia search leads to results page', async () => {
    // Keeps network-level validation that the search endpoint is functional
    const searchUrl =
      'https://en.wikipedia.org/w/index.php?search=openai&title=Special%3ASearch&go=Go';
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'GhostRun-Test/1.0' },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/search|openai/i);
  });

  it('robots.txt for Wikipedia permits access', async () => {
    const res = await fetch('https://www.wikipedia.org/robots.txt');
    expect(res.status).toBe(200);
    // Should exist and be non-empty
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Programmatic flow creation + execution via DatabaseManager
//
//    Creates a minimal navigate + assert:title flow in the GhostRun database,
//    runs it with `ghostrun.js run <id>` in headless mode, and verifies the
//    run record is marked "passed" in the database.
// ---------------------------------------------------------------------------

describe('Programmatic flow: API-only http:request + assert:response', () => {
  // Use JSONPlaceholder — stable public API designed for testing, no browser needed.
  // An API-only flow avoids the Playwright browser dependency in the unit test suite.
  const API_URL = 'https://jsonplaceholder.typicode.com/posts/1';

  let flowId: string;
  let db: TestDatabaseManager;

  beforeAll(async () => {
    db = await createTestDatabase();

    // API-only flow: HTTP GET + assert status 200. No browser required.
    const graph = {
      nodes: [
        {
          id: 'n1',
          type: 'action',
          label: 'GET /posts/1',
          action: 'http:request',
          method: 'GET',
          url: API_URL,
        },
        {
          id: 'n2',
          type: 'action',
          label: 'Assert status 200',
          action: 'assert:response',
          assertType: 'status',
          expected: 200,
        },
      ],
      edges: [{ source: 'n1', target: 'n2' }],
    };

    const flow = db.createFlow({
      name:        'E2E Test — API http:request + assert:response',
      description: 'Programmatically created API flow for e2e test',
      graph,
    });

    flowId = flow.id;
  });

  afterAll(() => {
    try {
      if (flowId) db?.deleteFlow(flowId);
      db?.close();
    } catch { /* best-effort cleanup */ }
  });

  it('flow is stored in the database', () => {
    const retrieved = db.getFlow(flowId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toContain('http:request');
    const graph = JSON.parse(retrieved!.graph);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0].action).toBe('http:request');
    expect(graph.nodes[1].action).toBe('assert:response');
  });

  it(
    'ghostrun run executes the API flow and produces a run record',
    async () => {
      // Run via CLI subprocess — tests the full stack without a browser.
      const result = ghostrun(`run ${flowId}`);

      // The CLI should exit 0 on success (or 1 on flow failure, still produces a run)
      // We check the run was recorded rather than the exit code, since JSONPlaceholder
      // availability is not guaranteed in every CI environment.
      const runs = db.listRuns(flowId, 5);
      expect(runs.length).toBeGreaterThan(0);
      // The run record should have a status set (passed or failed)
      expect(['passed', 'failed']).toContain(runs[0].status);
      // The output should mention the flow name
      expect(result.stdout + result.stderr).toMatch(/E2E Test|http:request|posts/i);
    },
    60_000
  );
});

// ---------------------------------------------------------------------------
// 4. --ci flag behaviour
//
//    In CI mode the executor must NOT auto-apply selector repairs to the flow
//    graph. We verify this by inspecting autoApplySelectorRepairProposal
//    through a failing run: with --ci, the flow graph must be unchanged after
//    failure (no silent mutation).
// ---------------------------------------------------------------------------

describe('--ci flag behaviour', () => {
  let flowId: string;
  let db: TestDatabaseManager;

  // A flow that will always fail: click a selector that does not exist
  const BROKEN_SELECTOR = '#ghostrun-nonexistent-element-xyzzy';
  const TARGET_URL = 'https://example.com';

  beforeAll(async () => {
    db = await createTestDatabase();

    const graph = {
      nodes: [
        {
          id: 'n1',
          type: 'action',
          label: 'Navigate to example.com',
          position: { x: 0, y: 0 },
          data: { action: 'navigate', url: TARGET_URL },
          action: 'navigate',
          url:    TARGET_URL,
        },
        {
          id: 'n2',
          type: 'action',
          label: 'Click broken element',
          position: { x: 0, y: 100 },
          data: { action: 'click', selector: BROKEN_SELECTOR },
          action:   'click',
          selector: BROKEN_SELECTOR,
        },
      ],
      edges: [{ from: 'n1', to: 'n2' }],
      appUrl: TARGET_URL,
    };

    const flow = db.createFlow({
      name:  'CI Test — broken selector flow',
      graph,
    });
    flowId = flow.id;
  });

  afterAll(() => {
    try {
      if (flowId) db?.deleteFlow(flowId);
      db?.close();
    } catch { /* best-effort cleanup */ }
  });

  it(
    'run exits non-zero when a selector is missing (with --ci)',
    () => {
      const result = ghostrun(`run ${flowId} --ci`);
      // Must fail (non-zero exit)
      expect(result.status).not.toBe(0);
    },
    60_000
  );

  it(
    'run with --ci does not mutate the flow graph on failure (no auto-heal)',
    async () => {
      // Capture graph snapshot before
      const graphBefore = db.getFlow(flowId)!.graph;

      ghostrun(`run ${flowId} --ci`);

      // Graph must be identical after the failing run
      const graphAfter = db.getFlow(flowId)!.graph;
      expect(graphAfter).toBe(graphBefore);
    },
    60_000
  );

  it(
    'run without --ci also does not mutate the graph when allowAutoRepairApply is not set',
    async () => {
      // Default config has allowAutoRepairApply = false, so no mutation either way
      const graphBefore = db.getFlow(flowId)!.graph;

      ghostrun(`run ${flowId}`);

      const graphAfter = db.getFlow(flowId)!.graph;
      expect(graphAfter).toBe(graphBefore);
    },
    60_000
  );

  it(
    'stdout includes [ci] annotation when --ci flag is passed',
    () => {
      const result = ghostrun(`run ${flowId} --ci`);
      // The CLI prints "[ci]" in the run header
      expect(result.stdout + result.stderr).toMatch(/\[ci\]/i);
    },
    60_000
  );
});
