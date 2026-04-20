#!/usr/bin/env node

/**
 * Flowmind CLI - Main Entry Point
 * 
 * A beautiful, feature-rich CLI for memory-driven web automation.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { UI, ui } from './ui.js';
import { initDatabase, getDatabase, type FlowRecord, type RunRecord, type StepRecord } from '@ghostrun/database';
import { executeFlow } from '@ghostrun/executor';
import { PlaywrightAdapter } from '@ghostrun/adapters-web';
import { sanitizeObject, auditLog } from '@ghostrun/privacy';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data paths
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_PATH = path.join(HOME_DIR, '.flowmind');

// Initialize database
const db = initDatabase(DATA_PATH);

// Program setup
const program = new Command();

// ============================================
// GLOBAL OPTIONS
// ============================================

program
  .name('flowmind')
  .description('🧠 Memory-driven web automation that learns, replays, and tests flows')
  .version('0.1.0')
  .option('-v, --verbose', 'Verbose output')
  .option('--no-color', 'Disable colors')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) ui.verbose = true;
    if (opts.noColor) chalk.level = 0;
  });

// ============================================
// INIT COMMAND
// ============================================

program
  .command('init')
  .description('Initialize Flowmind data directory')
  .action(async () => {
    ui.printLogo();
    ui.divider();
    
    const spinner = ui.spinner('Initializing...').start();
    
    // Create directories
    fs.mkdirSync(path.join(DATA_PATH, 'screenshots'), { recursive: true });
    fs.mkdirSync(path.join(DATA_PATH, 'reports'), { recursive: true });
    
    spinner.succeed(chalk.green('✓ Initialized at ') + chalk.white(DATA_PATH));
    
    ui.info('Run ') + chalk.cyan('flowmind learn <url>') + ' to start recording a flow';
  });

// ============================================
// LEARN COMMAND
// ============================================

program
  .command('learn <url>')
  .description('Learn a new flow by recording browser actions')
  .option('-n, --name <name>', 'Flow name')
  .option('-d, --description <text>', 'Flow description')
  .action(async (url: string, options: { name?: string; description?: string }) => {
    ui.printLogo();
    ui.divider();
    
    // Get flow name
    const flowName = options.name || await ui.prompt('Flow name');
    if (!flowName) {
      ui.error('Flow name is required');
      process.exit(1);
    }

    ui.section('Learn Mode');
    ui.info(`Target URL: ${chalk.cyan(url)}`);
    ui.info(`Flow name: ${chalk.cyan(flowName)}`);
    
    console.log();
    ui.box([
      'Open the browser window that appeared.',
      'Perform the actions you want to record.',
      'Press ESC or type "done" when finished.',
      'Your flow will be saved automatically.',
    ], { color: 'cyan' });
    console.log();

    // Create flow in database
    const flow = db.createFlow({
      name: flowName,
      description: options.description || '',
      appUrl: url,
      graph: {
        nodes: [{ id: 'start', type: 'start', label: 'Start', url }],
        edges: [],
      },
    });

    ui.success(`Created flow: ${chalk.white(flowName)} (${chalk.gray(flow.id.slice(0, 8))})`);
    
    // Launch browser for recording (placeholder - would use actual recorder)
    ui.info('Launching browser...');
    
    const adapter = new PlaywrightAdapter();
    await adapter.launch({ headless: false });
    await adapter.navigate(url);

    ui.section('Recording Started');
    ui.info('Commands:');
    console.log('  ' + chalk.cyan('done') + ' - Finish recording');
    console.log('  ' + chalk.cyan('cancel') + ' - Cancel and discard');
    console.log();

    // Simple recording loop
    const rl = await import('readline').then(m => m.createInterface({
      input: process.stdin,
      output: process.stdout,
    }));

    let recording = true;
    const actions: Array<{ type: string; selector: string; value?: string }> = [];

    while (recording) {
      const line = await new Promise<string>((resolve) => {
        rl.question(chalk.cyan('\nflowmind> '), resolve);
      });

      const cmd = line.trim().toLowerCase();

      if (cmd === 'done' || cmd === 'exit') {
        recording = false;
      } else if (cmd === 'cancel') {
        ui.warn('Recording cancelled');
        db.deleteFlow(flow.id);
        await adapter.close();
        process.exit(0);
      } else if (cmd.startsWith('click ')) {
        const selector = cmd.slice(6);
        actions.push({ type: 'click', selector });
        ui.success(`Recorded click on: ${selector}`);
      } else if (cmd.startsWith('fill ')) {
        const [selector, ...valueParts] = cmd.slice(5).split(' ');
        const value = valueParts.join(' ');
        actions.push({ type: 'fill', selector, value });
        ui.success(`Recorded fill: ${selector} = "${value}"`);
      } else if (cmd === 'screenshot') {
        const screenshot = await adapter.getPage()!.screenshot();
        const screenshotPath = path.join(db.getScreenshotsPath(flow.id), `recording-${Date.now()}.png`);
        fs.writeFileSync(screenshotPath, screenshot);
        ui.success(`Screenshot saved: ${screenshotPath}`);
      } else if (cmd === 'help') {
        console.log('  ' + chalk.cyan('click <selector>') + ' - Record a click');
        console.log('  ' + chalk.cyan('fill <selector> <value>') + ' - Record filling an input');
        console.log('  ' + chalk.cyan('screenshot') + ' - Take a screenshot');
        console.log('  ' + chalk.cyan('done') + ' - Finish recording');
        console.log('  ' + chalk.cyan('cancel') + ' - Cancel');
      } else {
        ui.warn('Unknown command. Type "help" for available commands.');
      }
    }

    rl.close();

    // Update flow with recorded actions
    const nodes = actions.map((action, i) => ({
      id: `step-${i + 1}`,
      type: 'action' as const,
      label: `${action.type}: ${action.selector}`,
      action: action.type,
      selector: action.selector,
      value: action.value,
    }));

    const edges = nodes.slice(0, -1).map((node, i) => ({
      id: `edge-${i}`,
      source: i === 0 ? 'start' : `step-${i}`,
      target: `step-${i + 1}`,
    }));

    db.updateFlow(flow.id, {
      graph: { nodes, edges },
    });

    await adapter.close();

    ui.section('Recording Complete');
    ui.success(`${chalk.white(actions.length.toString())} actions recorded`);
    ui.info(`Flow saved as: ${chalk.cyan(flow.name)}`);
    console.log();
    ui.info('Run this flow with: ' + chalk.green(`flowmind run ${flow.id.slice(0, 8)}`));
  });

// ============================================
// FLOW COMMANDS
// ============================================

program
  .command('flow')
  .description('Manage flows');

program
  .command('flow:list', { isDefault: true })
  .description('List all flows')
  .action(async () => {
    const flows = db.listFlows();
    
    // Parse graph to get node/edge counts
    const flowsWithCounts = flows.map(f => {
      try {
        const graph = JSON.parse(f.graph);
        return {
          ...f,
          nodeCount: graph.nodes?.length || 0,
          edgeCount: graph.edges?.length || 0,
        };
      } catch {
        return { ...f, nodeCount: 0, edgeCount: 0 };
      }
    });

    ui.printFlowsTable(flowsWithCounts);
  });

program
  .command('flow:create <name>')
  .description('Create a new empty flow')
  .option('-d, --description <text>', 'Flow description')
  .option('-u, --url <url>', 'Application URL')
  .action(async (name: string, options: { description?: string; url?: string }) => {
    const spinner = ui.spinner('Creating flow...').start();
    
    const flow = db.createFlow({
      name,
      description: options.description,
      appUrl: options.url,
      graph: {
        nodes: [{ id: 'start', type: 'start', label: 'Start' }],
        edges: [],
      },
    });

    spinner.succeed(chalk.green('✓ Created flow ') + chalk.white(name));
    console.log();
    console.log(`  ${chalk.gray('ID:')} ${chalk.white(flow.id.slice(0, 8))}`);
    console.log(`  ${chalk.gray('Name:')} ${chalk.white(name)}`);
    if (options.description) {
      console.log(`  ${chalk.gray('Desc:')} ${chalk.white(options.description)}`);
    }
    console.log();
  });

program
  .command('flow:delete <id>')
  .description('Delete a flow')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (id: string, options: { yes?: boolean }) => {
    const flow = db.getFlow(id);
    if (!flow) {
      ui.error(`Flow not found: ${id}`);
      process.exit(1);
    }

    if (!options.yes) {
      const confirmed = await ui.confirm(`Delete flow "${flow.name}"?`, false);
      if (!confirmed) {
        ui.info('Cancelled');
        return;
      }
    }

    const spinner = ui.spinner('Deleting...').start();
    db.deleteFlow(id);
    spinner.succeed(chalk.green('✓ Deleted flow ') + chalk.gray(flow.name));
  });

program
  .command('flow:show <id>')
  .description('Show flow details')
  .action(async (id: string) => {
    const flow = db.getFlow(id);
    if (!flow) {
      ui.error(`Flow not found: ${id}`);
      process.exit(1);
    }

    ui.section('Flow Details');
    
    let graph: { nodes: unknown[]; edges: unknown[] } = { nodes: [], edges: [] };
    try {
      graph = JSON.parse(flow.graph);
    } catch {}

    console.log(`  ${chalk.gray('ID:')} ${chalk.white(flow.id)}`);
    console.log(`  ${chalk.gray('Name:')} ${chalk.white(flow.name)}`);
    console.log(`  ${chalk.gray('URL:')} ${chalk.cyan(flow.appUrl || '-')}`);
    console.log(`  ${chalk.gray('Created:')} ${chalk.gray(flow.createdAt.toLocaleString())}`);
    console.log(`  ${chalk.gray('Updated:')} ${chalk.gray(flow.updatedAt.toLocaleString())}`);
    console.log(`  ${chalk.gray('Nodes:')} ${chalk.white(graph.nodes.length.toString())}`);
    console.log(`  ${chalk.gray('Edges:')} ${chalk.white(graph.edges.length.toString())}`);
    console.log();

    if (graph.nodes.length > 0) {
      ui.divider();
      console.log(chalk.bold('\n  Nodes\n'));
      
      for (const node of graph.nodes as Array<{ id: string; type: string; label: string; action?: string; selector?: string }>) {
        const typeIcon = node.type === 'start' ? '🚀' : node.type === 'end' ? '🏁' : '⚡';
        const typeLabel = chalk.gray(`[${node.type}]`);
        const action = node.action ? chalk.cyan(`(${node.action} ${node.selector})`) : '';
        
        console.log(`    ${chalk.cyan('●')} ${chalk.white(node.label)} ${typeLabel} ${action}`);
      }
    }
    console.log();
  });

// ============================================
// RUN COMMANDS
// ============================================

program
  .command('run [id]')
  .description('Run a flow (or all flows if no id provided)')
  .option('-s, --slot <name=value>', 'Provide slot value', (v, acc: string[]) => [...(acc || []), v], [])
  .option('-t, --timeout <ms>', 'Timeout per step', '30000')
  .option('--headless', 'Run in headless mode')
  .option('--no-screenshots', 'Skip screenshots')
  .action(async (id: string | undefined, options: { slot?: string[]; timeout?: string; headless?: boolean; noScreenshots?: boolean }) => {
    ui.printLogo();
    ui.divider();
    
    const flows = id ? [db.getFlow(id)].filter(Boolean) as FlowRecord[] : db.listFlows();
    
    if (flows.length === 0) {
      ui.error('No flows to run');
      process.exit(1);
    }

    for (const flow of flows) {
      await runFlow(flow, options);
    }
  });

async function runFlow(flow: FlowRecord, options: {
  slot?: string[];
  timeout?: string;
  headless?: boolean;
  noScreenshots?: boolean;
}) {
  ui.section(`Running: ${flow.name}`);
  ui.verboseLog(`Flow ID: ${flow.id}`);
  
  // Parse slots
  const slots: Record<string, string> = {};
  if (options.slot) {
    for (const s of options.slot) {
      const [key, ...valueParts] = s.split('=');
      slots[key.trim()] = valueParts.join('=').trim();
    }
  }

  // Parse graph
  let graph: { nodes: unknown[]; edges: unknown[]; appUrl?: string } = { nodes: [], edges: [] };
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    ui.error('Invalid flow graph');
    return;
  }

  if (graph.nodes.length === 0) {
    ui.warn('Flow has no nodes');
    return;
  }

  // Create run record
  const run = db.createRun(flow.id);
  ui.verboseLog(`Run ID: ${run.id}`);

  // Launch browser
  const spinner = ui.spinner('Launching browser...').start();
  const adapter = new PlaywrightAdapter();
  
  try {
    await adapter.launch({ headless: options.headless ?? true });
    spinner.succeed(chalk.green('✓ Browser ready'));

    const startUrl = graph.appUrl || flow.appUrl || (graph.nodes[0] as { url?: string })?.url;
    if (startUrl) {
      await adapter.navigate(startUrl);
      ui.info(`Navigated to: ${chalk.cyan(startUrl)}`);
    }

    // Execute each node (action nodes)
    const actionNodes = graph.nodes.filter((n: unknown) => (n as { type: string }).type === 'action');
    let stepNum = 1;

    for (const node of actionNodes as Array<{
      id: string;
      label: string;
      action: string;
      selector: string;
      value?: string;
    }>) {
      ui.printStepStart(stepNum, actionNodes.length, node.label);

      const step = db.createStep({
        runId: run.id,
        stepNumber: stepNum,
        name: node.label,
        action: node.action,
        selector: node.selector,
        value: node.value,
      });

      const startTime = Date.now();
      const timeout = parseInt(options.timeout || '30000');

      try {
        const page = adapter.getPage();
        if (!page) throw new Error('No page available');

        // Apply slot values
        let value = node.value || '';
        for (const [key, slotValue] of Object.entries(slots)) {
          value = value.replace(`{${key}}`, slotValue);
        }

        // Execute action
        switch (node.action) {
          case 'click':
            await page.click(node.selector, { timeout });
            break;
          case 'fill':
            // Sanitize value before filling (privacy)
            const sanitizedValue = sanitizeObject({ value }).value;
            await page.fill(node.selector, sanitizedValue as string, { timeout });
            break;
          case 'navigate':
            await page.goto(node.value || node.selector, { timeout });
            break;
          case 'wait':
            await page.waitForSelector(node.selector, { timeout });
            break;
          case 'press':
            await page.press(node.selector, node.value || 'Enter', { timeout });
            break;
        }

        // Capture screenshot
        let screenshotPath: string | null = null;
        if (!options.noScreenshots) {
          const screenshot = await page.screenshot();
          screenshotPath = path.join(db.getScreenshotsPath(run.id), `step-${stepNum}.png`);
          fs.writeFileSync(screenshotPath, screenshot);
        }

        // Capture console logs
        const consoleLogs = await page.evaluate(() => {
          return (window as unknown as { __consoleLogs?: string[] }).__consoleLogs || [];
        });

        const duration = Date.now() - startTime;

        db.updateStep(step.id, {
          status: 'passed',
          duration,
          screenshotPath,
          consoleLogs: JSON.stringify(consoleLogs),
        });

        ui.printStepSuccess(duration, screenshotPath ? path.basename(screenshotPath) : undefined);
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Capture failure screenshot
        let screenshotPath: string | null = null;
        if (!options.noScreenshots) {
          const page = adapter.getPage();
          if (page) {
            const screenshot = await page.screenshot();
            screenshotPath = path.join(db.getScreenshotsPath(run.id), `step-${stepNum}-FAILED.png`);
            fs.writeFileSync(screenshotPath, screenshot);
          }
        }

        db.updateStep(step.id, {
          status: 'failed',
          duration,
          errorMessage,
          screenshotPath,
        });

        ui.printStepFailure(duration, errorMessage, screenshotPath ? path.basename(screenshotPath) : undefined);

        // Update run as failed
        db.updateRun(run.id, {
          status: 'failed',
          completedAt: new Date(),
          duration: Date.now() - new Date(run.startedAt).getTime(),
          errorMessage,
        });

        // Stop execution on failure
        ui.warn('Stopping execution due to failure');
        break;
      }

      stepNum++;
    }

    // Update run status
    const runStatus = stepNum > actionNodes.length ? 'passed' : 'failed';
    db.updateRun(run.id, {
      status: runStatus,
      completedAt: new Date(),
      duration: Date.now() - new Date(run.startedAt).getTime(),
    });

    // Final summary
    ui.divider();
    if (runStatus === 'passed') {
      ui.success(`✓ Flow "${flow.name}" passed!`);
    } else {
      ui.error(`✗ Flow "${flow.name}" failed`);
    }
    console.log();
    ui.info(`Run ID: ${chalk.gray(run.id.slice(0, 8))}`);
    ui.info(`Report: ${chalk.cyan('flowmind run:show ' + run.id.slice(0, 8))}`);

  } catch (error) {
    ui.error(`Error: ${error}`);
  } finally {
    await adapter.close();
  }
}

// ============================================
// RUN LIST / SHOW
// ============================================

program
  .command('run:list')
  .description('List recent runs')
  .option('-f, --flow <id>', 'Filter by flow ID')
  .option('-l, --limit <n>', 'Number of runs to show', '10')
  .action(async (options: { flow?: string; limit?: string }) => {
    const runs = db.listRuns(options.flow, parseInt(options.limit || '10'));
    
    // Enrich with flow names
    const enrichedRuns = runs.map(run => {
      const flow = db.getFlow(run.flowId);
      return {
        ...run,
        flowName: flow?.name || 'Unknown',
      };
    });

    ui.printRunsTable(enrichedRuns);
  });

program
  .command('run:show <id>')
  .description('Show run details with steps')
  .action(async (id: string) => {
    const run = db.getRun(id);
    if (!run) {
      ui.error(`Run not found: ${id}`);
      process.exit(1);
    }

    const flow = db.getFlow(run.flowId);
    const steps = db.listSteps(run.id);

    ui.printRunDetail(
      {
        ...run,
        flowName: flow?.name || 'Unknown',
      },
      steps
    );
  });

program
  .command('run:delete <id>')
  .description('Delete a run')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (id: string, options: { yes?: boolean }) => {
    const run = db.getRun(id);
    if (!run) {
      ui.error(`Run not found: ${id}`);
      process.exit(1);
    }

    if (!options.yes) {
      const confirmed = await ui.confirm(`Delete this run?`, false);
      if (!confirmed) {
        ui.info('Cancelled');
        return;
      }
    }

    db.deleteRun(id);
    ui.success('Run deleted');
  });

// ============================================
// REPORT COMMAND
// ============================================

program
  .command('report <runId>')
  .description('Generate a report for a run')
  .option('-f, --format <format>', 'Report format: text, html, json', 'text')
  .option('-o, --output <path>', 'Output file path')
  .action(async (runId: string, options: { format?: string; output?: string }) => {
    const run = db.getRun(runId);
    if (!run) {
      ui.error(`Run not found: ${runId}`);
      process.exit(1);
    }

    const flow = db.getFlow(run.flowId);
    const steps = db.listSteps(run.id);

    let report = '';
    const format = options.format || 'text';

    if (format === 'json') {
      report = JSON.stringify({
        run: {
          id: run.id,
          flowId: run.flowId,
          flowName: flow?.name,
          status: run.status,
          duration: run.duration,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          errorMessage: run.errorMessage,
        },
        steps: steps.map(s => ({
          number: s.stepNumber,
          name: s.name,
          action: s.action,
          status: s.status,
          duration: s.duration,
          error: s.errorMessage,
          screenshot: s.screenshotPath,
        })),
      }, null, 2);
    } else if (format === 'html') {
      report = generateHtmlReport(run, flow, steps);
    } else {
      // Text format
      const statusIcon = run.status === 'passed' ? '✓' : '✗';
      const statusColor = run.status === 'passed' ? chalk.green : chalk.red;

      report += `\n${chalk.bold('═══════════════════════════════════════════════════════════════')}\n`;
      report += `  ${chalk.cyan('Flowmind Report')}\n`;
      report += `${chalk.bold('═══════════════════════════════════════════════════════════════')}\n\n`;
      
      report += `  ${chalk.gray('Flow:')} ${chalk.white(flow?.name || 'Unknown')}\n`;
      report += `  ${chalk.gray('Status:')} ${statusColor(`${statusIcon} ${run.status}`)}\n`;
      report += `  ${chalk.gray('Duration:')} ${chalk.white(run.duration ? `${run.duration}ms` : '-')}\n`;
      report += `  ${chalk.gray('Started:')} ${chalk.gray(run.startedAt.toLocaleString())}\n`;
      report += `\n${chalk.bold('Steps')}\n\n`;

      for (const step of steps) {
        const icon = step.status === 'passed' ? chalk.green('✓') : chalk.red('✗');
        const duration = step.duration ? `${step.duration}ms` : '-';
        
        report += `  ${icon} ${chalk.white(step.name)} ${chalk.gray(duration.padStart(10))}\n`;
        
        if (step.status === 'failed' && step.errorMessage) {
          report += `      ${chalk.red('└─')} ${chalk.red(step.errorMessage)}\n`;
        }
      }

      if (run.status === 'failed' && run.errorMessage) {
        report += `\n${chalk.bold('Error')}\n\n`;
        report += `  ${chalk.red(run.errorMessage)}\n`;
      }

      report += `\n${chalk.bold('═══════════════════════════════════════════════════════════════')}\n`;
    }

    if (options.output) {
      fs.writeFileSync(options.output, report);
      ui.success(`Report saved to: ${options.output}`);
    } else {
      console.log(report);
    }
  });

function generateHtmlReport(run: RunRecord, flow: FlowRecord | null, steps: StepRecord[]): string {
  const passedSteps = steps.filter(s => s.status === 'passed').length;
  const failedSteps = steps.filter(s => s.status === 'failed').length;

  return `<!DOCTYPE html>
<html>
<head>
  <title>Flowmind Report - ${flow?.name || 'Unknown'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    h1 { color: #667eea; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; }
    .status.passed { background: #dcfce7; color: #16a34a; }
    .status.failed { background: #fee2e2; color: #dc2626; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
    .summary-item { background: #f5f7fa; padding: 20px; border-radius: 8px; text-align: center; }
    .summary-value { font-size: 2em; font-weight: bold; color: #667eea; }
    .steps { margin-top: 30px; }
    .step { padding: 15px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 15px; }
    .step-icon { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .step-icon.passed { background: #dcfce7; color: #16a34a; }
    .step-icon.failed { background: #fee2e2; color: #dc2626; }
    .step-content { flex: 1; }
    .step-name { font-weight: 500; }
    .step-duration { color: #666; font-size: 0.9em; }
    .step-error { color: #dc2626; margin-top: 5px; font-size: 0.9em; }
    .error-box { background: #fee2e2; border: 1px solid #fecaca; padding: 20px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>${flow?.name || 'Unknown Flow'}</h1>
  <p><span class="status ${run.status}">${run.status}</span></p>
  
  <div class="summary">
    <div class="summary-item">
      <div class="summary-value">${steps.length}</div>
      <div>Total Steps</div>
    </div>
    <div class="summary-item">
      <div class="summary-value" style="color: #16a34a">${passedSteps}</div>
      <div>Passed</div>
    </div>
    <div class="summary-item">
      <div class="summary-value" style="color: #dc2626">${failedSteps}</div>
      <div>Failed</div>
    </div>
  </div>

  ${run.status === 'failed' && run.errorMessage ? `
  <div class="error-box">
    <strong>Error:</strong> ${run.errorMessage}
  </div>
  ` : ''}

  <div class="steps">
    <h2>Steps</h2>
    ${steps.map(step => `
    <div class="step">
      <div class="step-icon ${step.status}">${step.status === 'passed' ? '✓' : '✗'}</div>
      <div class="step-content">
        <div class="step-name">${step.name}</div>
        <div class="step-duration">${step.action} • ${step.duration || 0}ms</div>
        ${step.status === 'failed' && step.errorMessage ? `<div class="step-error">${step.errorMessage}</div>` : ''}
      </div>
    </div>
    `).join('')}
  </div>

  <footer style="margin-top: 40px; color: #666; font-size: 0.8em;">
    Generated by Flowmind • ${new Date().toLocaleString()}
  </footer>
</body>
</html>`;
}

// ============================================
// STATUS COMMAND
// ============================================

program
  .command('status')
  .description('Show Flowmind status and statistics')
  .action(async () => {
    ui.printLogo();
    ui.divider();
    
    const flows = db.listFlows();
    const runs = db.listRuns(undefined, 100);
    const passedRuns = runs.filter(r => r.status === 'passed').length;
    const failedRuns = runs.filter(r => r.status === 'failed').length;

    ui.section('Statistics');
    console.log(`  ${chalk.gray('Flows:')} ${chalk.white(flows.length.toString())}`);
    console.log(`  ${chalk.gray('Total Runs:')} ${chalk.white(runs.length.toString())}`);
    console.log(`  ${chalk.gray('Passed:')} ${chalk.green(passedRuns.toString())}`);
    console.log(`  ${chalk.gray('Failed:')} ${chalk.red(failedRuns.toString())}`);
    console.log(`  ${chalk.gray('Success Rate:')} ${chalk.white(runs.length > 0 ? `${Math.round((passedRuns / runs.length) * 100)}%` : 'N/A')}`);
    console.log();
    console.log(`  ${chalk.gray('Data Path:')} ${chalk.white(DATA_PATH)}`);
    console.log();
  });

// ============================================
// SERVE COMMAND (Desktop Integration)
// ============================================

program
  .command('serve')
  .description('Start Flowmind API server for desktop app')
  .option('-p, --port <port>', 'Port number', '3030')
  .action(async (options: { port?: string }) => {
    ui.printLogo();
    ui.info(`Starting API server on port ${chalk.cyan(options.port || '3030')}...`);
    ui.info('Press Ctrl+C to stop');
    console.log();
    
    // This would start the Fastify server from @ghostrun/runtime
    // For now, just show a message
    ui.warn('API server not yet implemented - use CLI directly');
    ui.info('Run ' + chalk.cyan('flowmind --help') + ' for available commands');
    
    // Keep process alive
    await new Promise(() => {});
  });

// ============================================
// MAIN
// ============================================

// Show help by default if no args
if (process.argv.length === 2) {
  ui.printLogo();
  ui.divider();
  console.log();
  ui.info('Usage: ');
  console.log('  ' + chalk.cyan('flowmind init') + '                    Initialize Flowmind');
  console.log('  ' + chalk.cyan('flowmind learn <url>') + '              Learn a new flow');
  console.log('  ' + chalk.cyan('flowmind flow:list') + '                 List all flows');
  console.log('  ' + chalk.cyan('flowmind run <id>') + '                  Run a flow');
  console.log('  ' + chalk.cyan('flowmind run:list') + '                  List recent runs');
  console.log('  ' + chalk.cyan('flowmind report <runId>') + '           Generate report');
  console.log('  ' + chalk.cyan('flowmind status') + '                   Show status');
  console.log();
  ui.info('For more help: ' + chalk.cyan('flowmind --help'));
  console.log();
}

// Parse and run
program.parse(process.argv);
