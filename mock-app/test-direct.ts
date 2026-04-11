#!/usr/bin/env node

/**
 * Flowmind V1 - Standalone Integration Test
 * 
 * This tests the complete flow WITHOUT needing the full monorepo:
 * 1. Start mock app server
 * 2. Test login flow with Playwright
 * 3. Generate reports
 */

import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOCK_APP_PORT = 3333;
const BASE_URL = `http://localhost:${MOCK_APP_PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), 'test-output');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function log(message: string, color: keyof typeof colors = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step: number, message: string) {
  const dots = '━'.repeat(Math.max(0, 55 - message.length - step.toString().length - 4));
  console.log(`\n${colors.cyan}━━━ [${step}] ${message} ${dots}${colors.reset}`);
}

// ============================================
// MOCK APP SERVER
// ============================================

function startMockAppServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url === '/' ? '/index.html' : (req.url || '/index.html');
      let filePath = path.join(__dirname, urlPath);
      
      if (filePath.endsWith('.html')) {
        try {
          const content = fs.readFileSync(filePath);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('Not found: ' + urlPath);
        }
        return;
      }
      
      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(MOCK_APP_PORT, () => {
      log(`✓ Mock app server running at ${BASE_URL}`, 'green');
      resolve(server);
    });
  });
}

// ============================================
// FLOW EXECUTION
// ============================================

interface StepResult {
  name: string;
  action: string;
  success: boolean;
  duration: number;
  error?: string;
  screenshot?: string;
}

interface FlowResult {
  name: string;
  status: 'passed' | 'failed';
  steps: StepResult[];
  totalDuration: number;
}

async function executeLoginFlow(browser: Browser): Promise<FlowResult> {
  const page = await browser.newPage();
  const startTime = Date.now();
  const steps: StepResult[] = [];

  const takeScreenshot = async (name: string): Promise<string> => {
    const filename = `step-${steps.length + 1}-${name.replace(/\s+/g, '-').toLowerCase()}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  };

  const step = async (name: string, action: () => Promise<void>) => {
    const stepStart = Date.now();
    try {
      await action();
      const duration = Date.now() - stepStart;
      const screenshot = await takeScreenshot(name);
      steps.push({ name, action: 'auto', success: true, duration, screenshot });
      log(`    ✓ ${name} (${duration}ms)`, 'green');
    } catch (error) {
      const duration = Date.now() - stepStart;
      const screenshot = await takeScreenshot(name + '-FAILED');
      steps.push({ 
        name, 
        action: 'auto', 
        success: false, 
        duration, 
        error: error instanceof Error ? error.message : String(error),
        screenshot 
      });
      log(`    ✗ ${name}: ${error instanceof Error ? error.message : error}`, 'red');
      throw error;
    }
  };

  try {
    // Step 1: Navigate to login
    await step('Navigate to login', async () => {
      await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
    });

    // Step 2: Fill email
    await step('Fill email', async () => {
      await page.fill('#email', 'test@flowmind.com');
    });

    // Step 3: Fill phone
    await step('Fill phone', async () => {
      await page.fill('#phone', '555-123-4567');
    });

    // Step 4: Fill password
    await step('Fill password', async () => {
      await page.fill('#password', 'password123');
    });

    // Step 5: Wait for button to be enabled
    await step('Wait for submit button', async () => {
      await page.waitForSelector('#submit-btn:not([disabled])', { timeout: 5000 });
    });

    // Step 6: Click submit
    await step('Click submit', async () => {
      await page.click('#submit-btn');
    });

    // Step 7: Verify dashboard
    await step('Verify dashboard', async () => {
      await page.waitForURL('**/dashboard.html', { timeout: 5000 });
    });

    await page.close();
    
    return {
      name: 'Login Flow',
      status: 'passed',
      steps,
      totalDuration: Date.now() - startTime,
    };
  } catch (error) {
    await page.close();
    return {
      name: 'Login Flow',
      status: 'failed',
      steps,
      totalDuration: Date.now() - startTime,
    };
  }
}

async function executeFailedLoginFlow(browser: Browser): Promise<FlowResult> {
  const page = await browser.newPage();
  const startTime = Date.now();
  const steps: StepResult[] = [];

  const takeScreenshot = async (name: string): Promise<string> => {
    const filename = `fail-${steps.length + 1}-${name.replace(/\s+/g, '-').toLowerCase()}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  };

  const step = async (name: string, action: () => Promise<void>) => {
    const stepStart = Date.now();
    try {
      await action();
      const duration = Date.now() - stepStart;
      const screenshot = await takeScreenshot(name);
      steps.push({ name, action: 'auto', success: true, duration, screenshot });
      log(`    ✓ ${name} (${duration}ms)`, 'green');
    } catch (error) {
      const duration = Date.now() - stepStart;
      const screenshot = await takeScreenshot(name + '-FAILED');
      steps.push({ 
        name, 
        action: 'auto', 
        success: false, 
        duration, 
        error: error instanceof Error ? error.message : String(error),
        screenshot 
      });
      log(`    ✗ ${name}: ${error instanceof Error ? error.message : error}`, 'red');
      throw error;
    }
  };

  try {
    await step('Navigate to login', async () => {
      await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
    });

    await step('Fill email', async () => {
      await page.fill('#email', 'test@flowmind.com');
    });

    await step('Fill phone', async () => {
      await page.fill('#phone', '555-123-4567');
    });

    await step('Fill wrong password', async () => {
      await page.fill('#password', 'wrongpassword');
    });

    await step('Wait for submit button', async () => {
      await page.waitForSelector('#submit-btn:not([disabled])', { timeout: 5000 });
    });

    await step('Click submit', async () => {
      await page.click('#submit-btn');
    });

    await step('Verify error message', async () => {
      await page.waitForSelector('.alert.error.visible', { timeout: 3000 });
    });

    await page.close();
    
    return {
      name: 'Failed Login Flow',
      status: 'passed',
      steps,
      totalDuration: Date.now() - startTime,
    };
  } catch (error) {
    await page.close();
    return {
      name: 'Failed Login Flow',
      status: 'failed',
      steps,
      totalDuration: Date.now() - startTime,
    };
  }
}

// ============================================
// REPORT GENERATION
// ============================================

function generateTextReport(results: FlowResult[]): string {
  let report = '';
  
  report += '\n' + colors.bright + '═'.repeat(60) + '\n';
  report += '  FLOWMIND TEST REPORT\n';
  report += '═'.repeat(60) + '\n\n';

  for (const result of results) {
    const statusIcon = result.status === 'passed' ? '✓' : '✗';
    const statusColor = result.status === 'passed' ? colors.green : colors.red;
    
    report += `${statusColor}${statusIcon} ${result.name}${colors.reset}\n`;
    report += `  Status: ${statusColor}${result.status.toUpperCase()}${colors.reset}\n`;
    report += `  Duration: ${result.totalDuration}ms\n`;
    report += `  Steps: ${result.steps.length}\n\n`;
    
    report += '  Steps:\n';
    for (const step of result.steps) {
      const icon = step.success ? colors.green + '✓' : colors.red + '✗';
      report += `    ${icon} ${step.name} (${step.duration}ms)${colors.reset}`;
      if (!step.success && step.error) {
        report += `\n      ${colors.red}└─ ${step.error}${colors.reset}`;
      }
      report += '\n';
    }
    
    report += '\n';
  }

  // Summary
  const passedCount = results.filter(r => r.status === 'passed').length;
  report += '─'.repeat(60) + '\n';
  report += 'SUMMARY\n';
  report += '─'.repeat(60) + '\n';
  report += `  Total Tests: ${results.length}\n`;
  report += `  Passed: ${passedCount}\n`;
  report += `  Failed: ${results.length - passedCount}\n`;
  report += `  Success Rate: ${Math.round((passedCount / results.length) * 100)}%\n`;
  report += '\n' + '='.repeat(60) + '\n';

  return report;
}

function generateHtmlReport(results: FlowResult[]): string {
  const passedCount = results.filter(r => r.status === 'passed').length;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flowmind Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; padding: 40px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { color: #667eea; margin-bottom: 30px; text-align: center; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
    .summary-card { background: white; padding: 20px; border-radius: 12px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
    .summary-value { font-size: 2.5em; font-weight: bold; color: #667eea; }
    .summary-label { color: #666; margin-top: 5px; }
    .test { background: white; border-radius: 12px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
    .test-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; }
    .test-name { font-size: 1.2em; font-weight: 600; }
    .status { padding: 6px 16px; border-radius: 20px; font-weight: 600; font-size: 0.9em; }
    .status.passed { background: #dcfce7; color: #16a34a; }
    .status.failed { background: #fee2e2; color: #dc2626; }
    .steps { padding: 20px; }
    .step { display: flex; align-items: flex-start; gap: 15px; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
    .step:last-child { border-bottom: none; }
    .step-icon { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8em; }
    .step-icon.passed { background: #dcfce7; color: #16a34a; }
    .step-icon.failed { background: #fee2e2; color: #dc2626; }
    .step-content { flex: 1; }
    .step-name { font-weight: 500; }
    .step-duration { color: #888; font-size: 0.85em; }
    .step-error { color: #dc2626; font-size: 0.9em; margin-top: 5px; }
    .screenshot { max-width: 100%; border-radius: 8px; margin-top: 10px; border: 1px solid #eee; }
    .footer { text-align: center; color: #888; margin-top: 40px; font-size: 0.85em; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧠 Flowmind Test Report</h1>
    
    <div class="summary">
      <div class="summary-card">
        <div class="summary-value">${results.length}</div>
        <div class="summary-label">Total Tests</div>
      </div>
      <div class="summary-card">
        <div class="summary-value" style="color: #16a34a">${passedCount}</div>
        <div class="summary-label">Passed</div>
      </div>
      <div class="summary-card">
        <div class="summary-value" style="color: #dc2626">${results.length - passedCount}</div>
        <div class="summary-label">Failed</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${Math.round((passedCount / results.length) * 100)}%</div>
        <div class="summary-label">Success Rate</div>
      </div>
    </div>

    ${results.map(result => `
    <div class="test">
      <div class="test-header">
        <div class="test-name">${result.name}</div>
        <div class="status ${result.status}">${result.status.toUpperCase()}</div>
      </div>
      <div class="steps">
        ${result.steps.map(step => `
        <div class="step">
          <div class="step-icon ${step.success ? 'passed' : 'failed'}">${step.success ? '✓' : '✗'}</div>
          <div class="step-content">
            <div class="step-name">${step.name}</div>
            <div class="step-duration">${step.duration}ms</div>
            ${!step.success && step.error ? `<div class="step-error">${step.error}</div>` : ''}
            ${step.screenshot ? `<img class="screenshot" src="file://${step.screenshot}" alt="Screenshot">` : ''}
          </div>
        </div>
        `).join('')}
      </div>
    </div>
    `).join('')}

    <div class="footer">
      Generated by Flowmind • ${new Date().toLocaleString()}
    </div>
  </div>
</body>
</html>`;
}

// ============================================
// MAIN TEST
// ============================================

async function main() {
  console.log('\n' + colors.bright + colors.cyan + `
  ╔════════════════════════════════════════════════════════════╗
  ║                                                            ║
  ║   ███████╗██╗   ██╗ ██████╗ ██████╗██╗    ██╗ █████╗      ║
  ║   ██╔════╝██║   ██║██╔═══██╗██╔════╝██║    ██║██╔══██╗     ║
  ║   ███████╗██║   ██║██║   ██║██║     ██║ █╗ ██║███████║     ║
  ║   ╚════██║██║   ██║██║   ██║██║     ██║███╗██║██╔══██║     ║
  ║   ███████║╚██████╔╝╚██████╔╝╚██████╗╚███╔███╔╝██║  ██║     ║
  ║   ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚══╝╚══╝ ╚═╝  ╚═╝     ║
  ║                                                            ║
  ║   V1 Standalone Integration Test                           ║
  ╚════════════════════════════════════════════════════════════╝
  ` + colors.reset);

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  log(`\n📁 Output directory: ${OUTPUT_DIR}`, 'blue');

  let mockServer: http.Server | null = null;
  let browser: Browser | null = null;
  const results: FlowResult[] = [];

  try {
    // Step 0: Start mock server
    logStep(0, 'Start mock app server');
    mockServer = await startMockAppServer();

    // Step 1: Launch browser
    logStep(1, 'Launch browser');
    browser = await chromium.launch({ headless: true });
    log('✓ Browser launched (headless)', 'green');

    // Step 2: Run successful login test
    logStep(2, 'Run successful login test');
    const successResult = await executeLoginFlow(browser);
    results.push(successResult);
    
    if (successResult.status === 'passed') {
      log(`✓ Test 1 PASSED (${successResult.totalDuration}ms)`, 'green');
    } else {
      log(`✗ Test 1 FAILED`, 'red');
    }

    // Step 3: Run failed login test
    logStep(3, 'Run failed login test (wrong password)');
    const failResult = await executeFailedLoginFlow(browser);
    results.push(failResult);
    
    if (failResult.status === 'passed') {
      log(`✓ Test 2 PASSED - Correctly detected failure (${failResult.totalDuration}ms)`, 'green');
    } else {
      log(`✗ Test 2 FAILED - Did not detect expected failure`, 'red');
    }

    // Step 4: Generate reports
    logStep(4, 'Generate reports');
    
    // Text report
    const textReport = generateTextReport(results);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'report.txt'), textReport);
    log('✓ Text report saved', 'green');

    // HTML report
    const htmlReport = generateHtmlReport(results);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'report.html'), htmlReport);
    log('✓ HTML report saved', 'green');

    // Print summary to console
    console.log(textReport);

  } catch (error) {
    log(`\n✗ Error: ${error}`, 'red');
  } finally {
    if (browser) await browser.close();
    if (mockServer) mockServer.close();
    log('\n✓ Cleanup complete', 'yellow');
  }

  // Final summary
  console.log('\n' + colors.bright + '═'.repeat(60) + colors.reset);
  
  const passedCount = results.filter(r => r.status === 'passed').length;
  const totalCount = results.length;
  
  if (passedCount === totalCount) {
    log('✓ ALL TESTS PASSED', 'green');
    log('  Flowmind V1 is working correctly!', 'green');
  } else {
    log(`⚠ ${totalCount - passedCount} test(s) failed`, 'yellow');
  }
  
  log(`\n📁 Reports saved to: ${OUTPUT_DIR}`, 'cyan');
  log(`  - report.txt (text format)`, 'white');
  log(`  - report.html (HTML with screenshots)`, 'white');
  console.log('\n');
}

// Run
main().catch(console.error);
