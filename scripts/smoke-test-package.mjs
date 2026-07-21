import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// Installs the actual npm tarball into a scratch project and runs it — catches packaging
// breakage (missing files, broken bin scripts, prepublishOnly failures) that the source-tree
// test suite never exercises.

console.log('\n  GhostRun packaging smoke test\n');

const packOutput = execSync('npm pack --json', { encoding: 'utf8' });
const [{ filename }] = JSON.parse(packOutput);
const tarballPath = path.resolve(filename);

const scratchDir = mkdtempSync(path.join(tmpdir(), 'ghostrun-smoke-'));

try {
  execSync('npm init -y', { cwd: scratchDir, stdio: 'ignore' });
  execSync(`npm install "${tarballPath}"`, { cwd: scratchDir, stdio: 'inherit' });

  const binName = process.platform === 'win32' ? 'ghostrun.cmd' : 'ghostrun';
  const bin = path.join(scratchDir, 'node_modules', '.bin', binName);

  const version = execSync(`"${bin}" --version`, { cwd: scratchDir, encoding: 'utf8' });
  console.log(`  ✓ ghostrun --version → ${version.trim()}`);

  execSync(`"${bin}" doctor`, { cwd: scratchDir, stdio: 'inherit' });
  console.log('  ✓ ghostrun doctor ran successfully');

  console.log('\n  Packaging smoke test passed — the published tarball installs and runs.\n');
} finally {
  rmSync(tarballPath, { force: true });
  rmSync(scratchDir, { recursive: true, force: true });
}
