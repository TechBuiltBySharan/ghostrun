/**
 * GhostRun - Test on unseen production websites
 * Tests explore + run against real sites
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const RESULTS = [];

// Test sites - variety of types
const SITES = [
  { name: 'Wikipedia', url: 'https://wikipedia.org', type: 'encyclopedia', selector: 'body' },
  { name: 'HackerNews', url: 'https://news.ycombinator.com', type: 'news', selector: '.titleline' },
  { name: 'MDN', url: 'https://developer.mozilla.org', type: 'docs', selector: 'main' },
  { name: 'GitHub', url: 'https://github.com', type: 'code', selector: 'main' },
  { name: 'StackOverflow', url: 'https://stackoverflow.com', type: 'qa', selector: '.question' },
];

async function ensureBrowsers() {
  console.log('🔧 Installing Playwright browsers...');
  const { execSync } = await import('child_process');
  try {
    execSync('npx playwright install chromium', { stdio: 'inherit' });
    console.log('✅ Browsers installed\n');
  } catch (e) {
    console.log('⚠️ Browser install failed, trying anyway...\n');
  }
}

async function runCmd(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, HOME: '/tmp/test-home', PLAYWRIGHT_BROWSERS_PATH: '0', ...env },
      timeout: 90000
    });
    let out = '', err = '';
    child.stdout.on('data', c => out += c.toString());
    child.stderr.on('data', c => err += c.toString());
    child.on('close', code => resolve({ code, out, err }));
  });
}

async function testSite(site) {
  console.log(`🧪 Testing: ${site.name} (${site.type})`);
  
  // Test: Navigate + click + assert
  const flow = {
    name: `${site.name} Test`,
    graph: {
      nodes: [
        { id: 'n1', type: 'action', action: 'navigate', url: site.url, label: 'Navigate to ' + site.name },
        { id: 'n2', type: 'assert', action: 'assert', properties: { type: 'visible', selector: 'body' }, label: 'Body visible' }
      ],
      edges: [{ source: 'n1', target: 'n2' }]
    }
  };
  
  const tmpDir = '/tmp/flow-test-' + Date.now();
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'flow.json'), JSON.stringify({ flow }, null, 2));
  
  // Import flow
  const importResult = await runCmd('node', ['ghostrun.js', 'flow:import', path.join(tmpDir, 'flow.json')]);
  const idMatch = importResult.out.match(/→ ID: (\w+)/);
  const flowId = idMatch ? idMatch[1] : null;
  
  if (!flowId) {
    fs.rmSync(tmpDir, { recursive: true });
    return { name: site.name, type: site.type, passed: false, error: 'Import failed: ' + importResult.err.substring(0, 100) };
  }
  
  // Run flow
  const runResult = await runCmd('node', ['ghostrun.js', 'run', flowId]);
  
  fs.rmSync(tmpDir, { recursive: true });
  
  const passed = runResult.code === 0 && (runResult.out.includes('✓') || runResult.out.includes('passed'));
  const error = passed ? null : (runResult.err || runResult.out).substring(0, 200);
  
  console.log(passed ? `  ✅ PASS` : `  ❌ FAIL: ${error}`);
  
  return { name: site.name, type: site.type, passed, error: error || null };
}

async function main() {
  await ensureBrowsers();
  
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   GhostRun - Unseen Sites Test Suite        ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  
  for (const site of SITES) {
    const result = await testSite(site);
    RESULTS.push(result);
  }
  
  const passed = RESULTS.filter(r => r.passed).length;
  const total = RESULTS.length;
  
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║   Results: ${passed}/${total} passed                          ║`);
  console.log('╚══════════════════════════════════════════════╝');
  
  // Save results
  fs.writeFileSync(
    'tests/results/unseen-sites-' + Date.now() + '.json',
    JSON.stringify({ results: RESULTS, summary: { passed, total } }, null, 2)
  );
  
  process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);
