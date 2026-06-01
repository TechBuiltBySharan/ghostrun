import { describe, it, expect } from 'vitest';

const SECRET_PATTERNS = [
  { name: 'Anthropic API key', pattern: /sk-ant-api[a-zA-Z0-9_-]{10,}/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
];

function scanLine(line: string): string[] {
  const hits: string[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(line)) hits.push(name);
  }
  return hits;
}

describe('security scan patterns', () => {
  it('detects real-looking Anthropic keys', () => {
    expect(scanLine('key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456789')).toContain('Anthropic API key');
  });

  it('ignores placeholder documentation', () => {
    expect(scanLine('export ANTHROPIC_API_KEY=sk-ant-...')).toEqual([]);
  });

  it('detects GitHub tokens', () => {
    expect(scanLine('token=ghp_1234567890123456789012345678901234567890')).toContain('GitHub token');
  });
});

describe('npm publish whitelist expectation', () => {
  it('package.json files field excludes source and workspace data', async () => {
    const pkg = await import('../../package.json');
    const files: string[] = pkg.files;
    expect(files).toContain('ghostrun.js');
    expect(files).toContain('mcp-server.js');
    expect(files).not.toContain('ghostrun.ts');
    expect(files).not.toContain('.ghostrun');
    expect(files).not.toContain('packages/');
  });
});
