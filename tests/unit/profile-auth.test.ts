/**
 * Unit tests for profile secret resolution patterns used during auth setup.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

function normalizeSecretEnvKey(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
}

async function resolveSecretValue(
  ref: string | undefined,
  env: NodeJS.ProcessEnv,
  secretsDir: string,
): Promise<string | undefined> {
  if (!ref) return undefined;

  const envCandidates = [ref, normalizeSecretEnvKey(ref)];
  for (const key of envCandidates) {
    if (env[key]) return env[key];
  }

  const fileCandidates = [
    path.join(secretsDir, ref),
    path.join(secretsDir, `${ref}.txt`),
  ];
  for (const filePath of fileCandidates) {
    if (!fs.existsSync(filePath)) continue;
    const value = fs.readFileSync(filePath, 'utf8').trim();
    if (value) return value;
  }

  return undefined;
}

describe('profile secret resolution', () => {
  const tmpDir = path.join(os.tmpdir(), `ghostrun-secrets-${process.pid}`);
  const secretsDir = path.join(tmpDir, '.ghostrun', 'auth', 'secrets');

  beforeEach(() => {
    fs.mkdirSync(secretsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads secrets from environment variables first', async () => {
    const value = await resolveSecretValue('STAGING_API_TOKEN', { STAGING_API_TOKEN: 'token-from-env' }, secretsDir);
    expect(value).toBe('token-from-env');
  });

  it('normalizes secret refs to env key format', async () => {
    const value = await resolveSecretValue('staging-api-token', { STAGING_API_TOKEN: 'normalized' }, secretsDir);
    expect(value).toBe('normalized');
  });

  it('falls back to project-local secret files', async () => {
    fs.writeFileSync(path.join(secretsDir, 'AUTH_PASSWORD.txt'), 'secret-from-file\n');
    const value = await resolveSecretValue('AUTH_PASSWORD', {}, secretsDir);
    expect(value).toBe('secret-from-file');
  });

  it('returns undefined when no secret source exists', async () => {
    const value = await resolveSecretValue('MISSING_SECRET', {}, secretsDir);
    expect(value).toBeUndefined();
  });
});
