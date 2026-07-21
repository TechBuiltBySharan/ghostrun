/**
 * CLI command-dispatch regression tests.
 *
 * Covers a bug where LEGACY_COMMAND_MAP rejected several commands that also
 * had real, working handlers later in the same switch — the map entry ran
 * first and made the working handler unreachable. `flow:list` was even
 * mapped to itself, so the rejection told the user to run the exact command
 * that had just been rejected. Also covers the `--help`/`-h` misparsing bug,
 * where a subcommand flag like `code:scan --help` was consumed as a
 * positional argument instead of showing usage.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const GHOSTRUN_CLI = path.join(PROJECT_ROOT, 'ghostrun.js');
const WORKSPACE = path.join(os.tmpdir(), `ghostrun-cli-dispatch-${process.pid}`);
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
    { cwd: WORKSPACE, env: process.env, encoding: 'utf8', timeout: 30_000 }
  );
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

afterAll(() => {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
});

describe('CLI dispatch — LEGACY_COMMAND_MAP self-blocking bug', () => {
  it('flow:list reaches its real handler instead of being rejected as legacy', () => {
    const result = ghostrun('flow:list');
    expect(result.stdout).not.toContain('was removed');
    expect(result.stdout.toLowerCase()).toContain('flow');
  });

  it('flow:fix reaches its real handler instead of being rejected as legacy', () => {
    const result = ghostrun('flow:fix does-not-exist');
    expect(result.stdout + result.stderr).not.toContain('was removed');
    expect(result.stdout + result.stderr).toContain('Flow not found');
  });

  it('baseline:set reaches its real handler instead of being rejected as legacy', () => {
    const result = ghostrun('baseline:set does-not-exist');
    expect(result.stdout + result.stderr).not.toContain('was removed');
    expect(result.stdout + result.stderr).toContain('Flow not found');
  });

  it('suite:run reaches its real handler instead of being rejected as legacy', () => {
    const result = ghostrun('suite:run does-not-exist');
    expect(result.stdout + result.stderr).not.toContain('was removed');
    expect(result.stdout + result.stderr).toContain('Suite not found');
  });

  it('profile:create is still correctly rejected — genuine deprecation with a real replacement', () => {
    const result = ghostrun('profile:create staging http://localhost:3000');
    expect(result.stdout + result.stderr).toContain('was removed');
    expect(result.stdout + result.stderr).toContain('profile create');
  });

  it('profile create (space syntax) works', () => {
    const result = ghostrun('profile create staging http://localhost:3000');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Created profile');
  });
});

describe('CLI dispatch — subcommand --help misparsing bug', () => {
  it('code:scan --help shows usage instead of treating --help as a directory', () => {
    const result = ghostrun('code:scan --help');
    expect(result.stdout + result.stderr).not.toContain('Directory not found');
    expect(result.stdout).toContain('Record & Run');
  });

  it('flow:list -h shows usage instead of erroring', () => {
    const result = ghostrun('flow:list -h');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Record & Run');
  });
});

describe('CLI dispatch — doctor checks the actual Chromium binary, not just the npm package', () => {
  it('doctor reports a distinct Playwright Chromium browser check', () => {
    const result = ghostrun('doctor');
    const output = result.stdout + result.stderr;
    expect(output).toContain('Playwright Chromium browser');
    // The CI/dev environment installs Chromium up front, so this must be OK here —
    // a regression that silently skips the binary check (only checking the npm
    // package resolves) would print nothing distinguishable from this line missing.
    expect(output).toMatch(/\[\s*OK\s*\] Playwright Chromium browser/);
  });
});
