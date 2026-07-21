import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Mirrors SECRET_PATTERNS / PLACEHOLDER_OK in ghostrun.ts (`ghostrun audit`) so both
// checks agree on what counts as a leaked secret.
const SECRET_PATTERNS = [
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

// Per docs/security.md: never published are source .ts, .ghostrun/, .env, tests/, packages/,
// coverage, the local database, screenshots, and AI session logs.
const FORBIDDEN_PATH_PATTERNS = [
  /\.ts$/,
  /(^|\/)\.ghostrun\//,
  /(^|\/)\.env$/,
  /(^|\/)\.ghostrun\.env$/,
  /(^|\/)\.flowmind\.env$/,
  /^tests\//,
  /^packages\//,
  /^coverage\//,
  /\.db$/,
  /\.sqlite$/,
  /^screenshots\//,
];

const SKIP_CONTENT_SCAN = /\.(png|jpg|jpeg|gif|ico|db|sqlite|zip|gz|woff2?)$/i;

function lineLooksLikePlaceholder(line) {
  return PLACEHOLDER_OK.some((re) => re.test(line));
}

function scanForSecrets(filePath, content) {
  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineLooksLikePlaceholder(line)) continue;
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push(`${filePath}:${i + 1} — possible ${name}`);
      }
    }
  }
  return findings;
}

console.log('\n  GhostRun publish safety check\n');

const packOutput = execSync('npm pack --dry-run --json', { encoding: 'utf8' });
const [packResult] = JSON.parse(packOutput);
const files = packResult.files.map((f) => f.path);

const findings = [];

for (const file of files) {
  if (FORBIDDEN_PATH_PATTERNS.some((pattern) => pattern.test(file))) {
    findings.push(`Forbidden path in tarball: ${file}`);
  }
}

for (const file of files) {
  if (SKIP_CONTENT_SCAN.test(file)) continue;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  findings.push(...scanForSecrets(file, content));
}

if (findings.length) {
  console.log('  FAILED — publish safety check found issues:\n');
  for (const f of findings) console.log(`  ✗ ${f}`);
  console.log(`\n  ${files.length} files would ship in this tarball. See docs/security.md.\n`);
  process.exit(1);
}

console.log(`  ✓ ${files.length} files would ship — no forbidden paths, no secret patterns detected.`);
console.log('  See docs/security.md for the full safety model.\n');
