import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildProjectPaths,
  flowSlug,
  writeFlowFile,
  listFlowFiles,
  deleteFlowFile,
  initProjectContext,
  ensureProjectDirs,
} from '../../project-scope';

describe('project-scope', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostrun-scope-'));
    fs.mkdirSync(path.join(tmpDir, '.ghostrun'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.ghostrun', 'config.json'), '{}');
    process.chdir(tmpDir);
    initProjectContext(tmpDir);
  });

  afterEach(() => {
    process.chdir(os.tmpdir());
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('buildProjectPaths points DB and flows under .ghostrun', () => {
    const p = buildProjectPaths(tmpDir);
    expect(p.dbPath).toBe(path.join(tmpDir, '.ghostrun', 'data', 'ghostrun.db'));
    expect(p.flowsBrowser).toBe(path.join(tmpDir, '.ghostrun', 'flows', 'browser'));
  });

  it('flowSlug normalizes names', () => {
    expect(flowSlug('Login / Magic Link')).toBe('login-magic-link');
  });

  it('writes and lists flow files', () => {
    ensureProjectDirs();
    const filePath = writeFlowFile({
      id: 'abcd1234-5678-90ab-cdef-1234567890ab',
      name: 'Checkout Flow',
      graph: JSON.stringify({ nodes: [], edges: [] }),
      createdBy: 'human',
    });
    expect(fs.existsSync(filePath)).toBe(true);
    expect(listFlowFiles().length).toBe(1);
    deleteFlowFile('abcd1234-5678-90ab-cdef-1234567890ab', 'Checkout Flow');
    expect(listFlowFiles().length).toBe(0);
  });
});
