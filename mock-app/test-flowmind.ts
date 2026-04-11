/**
 * Flowmind Test Script
 * 
 * This script tests Flowmind against the mock application.
 * It:
 * 1. Starts a local server for the mock app
 * 2. Records a login flow
 * 3. Replays the flow (success case)
 * 4. Replays with wrong credentials (failure case)
 * 5. Generates a report
 */

import { chromium, firefox, type Browser, type Page } from 'playwright';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOCK_APP_PORT = 3333;
const BASE_URL = `http://localhost:${MOCK_APP_PORT}`;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ============================================
// MOCK APP SERVER
// ============================================

function createMockAppServer(): http.Server {
  const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url || 'index.html');
    
    // Handle HTML files
    if (filePath.endsWith('.html')) {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return server;
}

// ============================================
// FLOW DEFINITIONS
// ============================================

interface FlowStep {
  name: string;
  action: 'navigate' | 'click' | 'fill' | 'wait' | 'assert';
  selector?: string;
  value?: string;
  expected?: string | ((url: string) => boolean);
}

interface Flow {
  name: string;
  steps: FlowStep[];
}

// Login flow definition
const LOGIN_FLOW: Flow = {
  name: 'Login Flow',
  steps: [
    { name: 'Navigate to login page', action: 'navigate', value: `${BASE_URL}/login.html` },
    { name: 'Fill email', action: 'fill', selector: '#email', value: 'test@flowmind.com' },
    { name: 'Fill phone', action: 'fill', selector: '#phone', value: '555-123-4567' },
    { name: 'Fill password', action: 'fill', selector: '#password', value: 'password123' },
    { name: 'Wait for button to be enabled', action: 'wait', selector: '#submit-btn:not([disabled])' },
    { name: 'Click submit', action: 'click', selector: '#submit-btn' },
    { name: 'Assert dashboard', action: 'assert', expected: (url) => url.includes('dashboard.html') },
  ],
};

// Failed login flow (wrong password)
const FAILED_LOGIN_FLOW: Flow = {
  name: 'Failed Login Flow',
  steps: [
    { name: 'Navigate to login page', action: 'navigate', value: `${BASE_URL}/login.html` },
    { name: 'Fill email', action: 'fill', selector: '#email', value: 'test@flowmind.com' },
    { name: 'Fill phone', action: 'fill', selector: '#phone', value: '555-123-4567' },
    { name: 'Fill wrong password', action: 'fill', selector: '#password', value: 'wrongpassword' },
    { name: 'Wait for button to be enabled', action: 'wait', selector: '#submit-btn:not([disabled])' },
    { name: 'Click submit', action: 'click', selector: '#submit-btn' },
    { name: 'Wait for error message', action: 'wait', selector: '.alert.error.visible' },
  ],
};

// ============================================
// FLOW ENGINE
// ============================================

interface StepResult {
  step: number;
  name: string;
  success: boolean;
  screenshot?: string;
  error?: string;
  duration: number;
}

interface FlowResult {
  flowName: string;
  success: boolean;
  steps: StepResult[];
  totalDuration: number;
  screenshots: Map<number, string>;
}

async function executeFlow(browser: Browser, flow: Flow): Promise<FlowResult> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  
  const screenshots = new Map<number, string>();
  const results: StepResult[] = [];
  const startTime = Date.now();

  // Enable console log capture
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Enable network capture
  const networkLogs: string[] = [];
  page.on('request', request => {
    networkLogs.push(`→ ${request.method()} ${request.url()}`);
  });
  page.on('response', response => {
    networkLogs.push(`← ${response.status()} ${response.url()}`);
  });

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const stepStart = Date.now();
    
    log(`  Step ${i + 1}: ${step.name}`, 'cyan');
    
    try {
      switch (step.action) {
        case 'navigate':
          await page.goto(step.value!, { waitUntil: 'domcontentloaded' });
          break;

        case 'click':
          await page.click(step.selector!);
          break;

        case 'fill':
          await page.fill(step.selector!, step.value!);
          break;

        case 'wait':
          await page.waitForSelector(step.selector!, { timeout: 5000 });
          break;

        case 'assert':
          if (typeof step.expected === 'function') {
            const currentUrl = page.url();
            if (!step.expected(currentUrl)) {
              throw new Error(`URL assertion failed: expected ${step.expected.toString()}, got ${currentUrl}`);
            }
          } else if (step.expected) {
            await page.waitForFunction(
              (expected) => document.body.textContent!.includes(expected),
              step.expected,
              { timeout: 5000 }
            );
          }
          break;
      }

      // Take screenshot after each step
      const screenshot = await page.screenshot({ path: undefined });
      const screenshotPath = `step-${i + 1}-${Date.now()}.png`;
      screenshots.set(i, screenshotPath);
      fs.writeFileSync(screenshotPath, screenshot);

      const duration = Date.now() - stepStart;
      results.push({
        step: i + 1,
        name: step.name,
        success: true,
        screenshot: screenshotPath,
        duration,
      });

      log(`    ✓ Passed (${duration}ms)`, 'green');
    } catch (error) {
      const duration = Date.now() - stepStart;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Take failure screenshot
      const screenshot = await page.screenshot();
      const screenshotPath = `step-${i + 1}-FAILED.png`;
      screenshots.set(i, screenshotPath);
      fs.writeFileSync(screenshotPath, screenshot);

      results.push({
        step: i + 1,
        name: step.name,
        success: false,
        screenshot: screenshotPath,
        error: errorMessage,
        duration,
      });

      log(`    ✗ Failed: ${errorMessage}`, 'red');
      
      // Stop flow on failure
      break;
    }
  }

  const totalDuration = Date.now() - startTime;
  const success = results.every(r => r.success);

  await context.close();

  return {
    flowName: flow.name,
    success,
    steps: results,
    totalDuration,
    screenshots,
  };
}

// ============================================
// REPORT GENERATION
// ============================================

function generateReport(result: FlowResult): string {
  const lines: string[] = [];
  
  lines.push('═'.repeat(60));
  lines.push(` FLOWMIND TEST REPORT`);
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`Flow: ${result.flowName}`);
  lines.push(`Status: ${result.success ? '✓ PASSED' : '✗ FAILED'}`);
  lines.push(`Duration: ${result.totalDuration}ms`);
  lines.push(`Steps: ${result.steps.length}`);
  lines.push('');
  lines.push('─'.repeat(60));
  lines.push(' STEP RESULTS');
  lines.push('─'.repeat(60));
  lines.push('');

  for (const step of result.steps) {
    const status = step.success ? '✓' : '✗';
    const statusColor = step.success ? 'green' : 'red';
    
    lines.push(`${status} Step ${step.step}: ${step.name}`);
    lines.push(`  Duration: ${step.duration}ms`);
    
    if (step.success) {
      lines.push(`  Screenshot: ${step.screenshot}`);
    } else {
      lines.push(`  Screenshot: ${step.screenshot}`);
      lines.push(`  Error: ${step.error}`);
    }
    lines.push('');
  }

  lines.push('─'.repeat(60));
  lines.push(' SUMMARY');
  lines.push('─'.repeat(60));
  lines.push('');
  
  const passedSteps = result.steps.filter(s => s.success).length;
  const failedSteps = result.steps.filter(s => !s.success).length;
  
  lines.push(`Total Steps: ${result.steps.length}`);
  lines.push(`Passed: ${passedSteps}`);
  lines.push(`Failed: ${failedSteps}`);
  lines.push(`Success Rate: ${((passedSteps / result.steps.length) * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('═'.repeat(60));

  return lines.join('\n');
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function main() {
  log('\n🧠 Flowmind Test Runner', 'bright');
  log('═'.repeat(60), 'blue');
  log('');

  // Start mock app server
  log('📦 Starting mock app server...', 'blue');
  const server = createMockAppServer();
  
  await new Promise<void>((resolve) => {
    server.listen(MOCK_APP_PORT, () => {
      log(`   Server running at ${BASE_URL}\n`, 'green');
      resolve();
    });
  });

  // Launch browser
  log('🌐 Launching browser...', 'blue');
  const browser = await chromium.launch({ headless: true });
  log('   Browser launched\n', 'green');

  try {
    // Test 1: Successful login
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'yellow');
    log(' TEST 1: Successful Login Flow', 'bright');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'yellow');
    log('');
    
    const successResult = await executeFlow(browser, LOGIN_FLOW);
    console.log('\n' + generateReport(successResult));
    
    // Save report
    const successReport = generateReport(successResult);
    fs.writeFileSync('report-success.txt', successReport);
    log('\n📄 Report saved to report-success.txt', 'green');

    // Test 2: Failed login
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'yellow');
    log(' TEST 2: Failed Login Flow (Wrong Password)', 'bright');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'yellow');
    log('');
    
    const failResult = await executeFlow(browser, FAILED_LOGIN_FLOW);
    console.log('\n' + generateReport(failResult));
    
    // Save report
    const failReport = generateReport(failResult);
    fs.writeFileSync('report-failure.txt', failReport);
    log('\n📄 Report saved to report-failure.txt', 'green');

    // Final summary
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'bright');
    log(' FINAL SUMMARY', 'bright');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'bright');
    log('');
    log(`Test 1 (Success): ${successResult.success ? '✓ PASSED' : '✗ FAILED'}`);
    log(`Test 2 (Failure): ${!failResult.success ? '✓ CORRECTLY DETECTED FAILURE' : '✗ UNEXPECTED SUCCESS'}`);
    log('');
    log('Both tests completed!', 'green');

  } catch (error) {
    log(`\n❌ Error: ${error}`, 'red');
  } finally {
    await browser.close();
    server.close();
    log('\n👋 Server closed. Goodbye!', 'blue');
  }
}

// Run
main().catch(console.error);
