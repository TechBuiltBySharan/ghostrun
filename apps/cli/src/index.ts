#!/usr/bin/env node

/**
 * Flowmind CLI - Fully Integrated
 * 
 * Memory-driven web automation that learns, replays, and tests flows.
 */

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { ensureDataDir, initDB, getDB, listFlows, getFlow, createFlow, updateFlowGraph, deleteFlow, listRuns, getRun, createRun, updateRun, createStep, updateStep, getScreenshotsPath, DATA_PATH } from './database-cli.js';
import { PlaywrightAdapter } from '@ghostrun/adapters-web';
import { sanitizeObject } from '@ghostrun/privacy';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

// ============================================
// LOGO
// ============================================

function printLogo() {
  console.log(chalk.cyan(`
    ╔═══════════════════════════════════════════╗
    ║                                           ║
    ║   ███████╗██╗   ██╗ ██████╗ ██████╗██╗    ║
    ║   ██╔════╝██║   ██║██╔═══██╗██╔════╝██║    ║
    ║   ███████╗██║   ██║██║   ██║██║     ██║    ║
    ║   ╚════██║██║   ██║██║   ██║██║     ██║    ║
    ║   ███████║╚██████╔╝╚██████╔╝╚██████╗██║    ║
    ║   ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝╚═╝    ║
    ║                                           ║
    ║   Memory-driven Web Automation             ║
    ╚═══════════════════════════════════════════╝
  `));
}

// ============================================
// HELPERS
// ============================================

function info(message: string) {
  console.log(chalk.blue('  → ') + message);
}

function success(message: string) {
  console.log(chalk.green('  ✓ ') + message);
}

function error(message: string) {
  console.log(chalk.red('  ✗ ') + message);
}

function warn(message: string) {
  console.log(chalk.yellow('  ⚠ ') + message);
}

function divider() {
  console.log(chalk.cyan('─'.repeat(60)));
}

// ============================================
// INIT COMMAND
// ============================================

program
  .command('init')
  .description('Initialize Flowmind data directory')
  .action(async () => {
    printLogo();
    divider();
    
    const spinner = ora('Initializing...').start();
    
    try {
      const dataPath = ensureDataDir();
      initDB();
      
      spinner.succeed();
      success('Initialized at ' + chalk.white(dataPath));
      console.log();
      info('Run ' + chalk.cyan('flowmind learn <url>') + ' to start recording a flow');
      console.log();
    } catch (err) {
      spinner.fail();
      error('Failed to initialize: ' + err);
    }
  });

// ============================================
// LEARN COMMAND
// ============================================

interface RecordedAction {
  type: 'navigate' | 'click' | 'fill' | 'wait' | 'press' | 'screenshot';
  selector?: string;
  value?: string;
  url?: string;
  timeout?: number;
}

program
  .command('learn <url>')
  .description('Learn a new flow by recording browser actions')
  .option('-n, --name <name>', 'Flow name')
  .option('-d, --description <text>', 'Flow description')
  .action(async (url: string, options: { name?: string; description?: string }) => {
    printLogo();
    divider();
    
    // Get flow name
    let flowName = options.name;
    if (!flowName) {
      console.log(chalk.cyan('\n  Enter flow name: '));
      flowName = await askQuestion();
    }
    
    if (!flowName) {
      error('Flow name is required');
      process.exit(1);
    }

    console.log(chalk.bold('\n  Learn Mode\n'));
    info('Target URL: ' + chalk.cyan(url));
    info('Flow name: ' + chalk.cyan(flowName));
    console.log();
    console.log(chalk.gray('  ┌─────────────────────────────────────────────────────────────┐'));
    console.log(chalk.gray('  │ ') + 'Open the browser that appeared.' + chalk.gray('                              │'));
    console.log(chalk.gray('  │ ') + 'Perform the actions you want to record.' + chalk.gray('                    │'));
    console.log(chalk.gray('  │ ') + 'Type "done" when finished or "cancel" to abort.' + chalk.gray('           │'));
    console.log(chalk.gray('  └─────────────────────────────────────────────────────────────┘'));
    console.log();

    // Initialize database and create flow
    ensureDataDir();
    initDB();
    
    const flow = createFlow(flowName, {
      description: options.description,
      appUrl: url,
    });

    // Launch browser
    const spinner = ora('Launching browser...').start();
    const adapter = new PlaywrightAdapter();
    
    try {
      await adapter.launch({ headless: false });
      await adapter.navigate(url);
      spinner.succeed();
      success('Browser ready - recording started');
    } catch (err) {
      spinner.fail();
      error('Failed to launch browser: ' + err);
      process.exit(1);
    }

    // Recording state
    const actions: RecordedAction[] = [];
    let recording = true;

    console.log(chalk.bold('\n  Commands:\n'));
    console.log('  ' + chalk.cyan('click <selector>') + '      Record a click action');
    console.log('  ' + chalk.cyan('fill <selector> <value>') + '  Record filling an input');
    console.log('  ' + chalk.cyan('navigate <url>') + '       Record navigation');
    console.log('  ' + chalk.cyan('wait <selector>') + '        Record waiting for element');
    console.log('  ' + chalk.cyan('screenshot') + '            Take a screenshot');
    console.log('  ' + chalk.cyan('done') + '                  Finish recording');
    console.log('  ' + chalk.cyan('cancel') + '                 Cancel and delete flow');
    console.log();

    while (recording) {
      const command = await askQuestion(chalk.cyan('\n  flowmind> '));
      const parts = command.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();

      try {
        switch (cmd) {
          case 'done':
          case 'exit':
            recording = false;
            break;

          case 'cancel':
            warn('Recording cancelled');
            deleteFlow(flow.id);
            await adapter.close();
            process.exit(0);

          case 'click':
            if (!parts[1]) {
              warn('Usage: click <selector>');
              break;
            }
            actions.push({ type: 'click', selector: parts.slice(1).join(' ') });
            success(`Recorded: click ${parts.slice(1).join(' ')}`);
            // Execute it too
            await adapter.getPage()?.click(parts.slice(1).join(' '));
            break;

          case 'fill':
            if (parts.length < 3) {
              warn('Usage: fill <selector> <value>');
              break;
            }
            actions.push({ type: 'fill', selector: parts[1], value: parts.slice(2).join(' ') });
            success(`Recorded: fill ${parts[1]} = "${parts.slice(2).join(' ')}"`);
            // Execute and sanitize
            const page = adapter.getPage();
            if (page) {
              const sanitized = sanitizeObject({ v: parts.slice(2).join(' ') }).v as string;
              await page.fill(parts[1], sanitized);
            }
            break;

          case 'navigate':
            if (!parts[1]) {
              warn('Usage: navigate <url>');
              break;
            }
            actions.push({ type: 'navigate', url: parts.slice(1).join(' ') });
            success(`Recorded: navigate ${parts.slice(1).join(' ')}`);
            await adapter.navigate(parts.slice(1).join(' '));
            break;

          case 'wait':
            if (!parts[1]) {
              warn('Usage: wait <selector>');
              break;
            }
            actions.push({ type: 'wait', selector: parts.slice(1).join(' ') });
            success(`Recorded: wait ${parts.slice(1).join(' ')}`);
            await adapter.getPage()?.waitForSelector(parts.slice(1).join(' '));
            break;

          case 'press':
            if (parts.length < 2) {
              warn('Usage: press <selector> [key]');
              break;
            }
            actions.push({ type: 'press', selector: parts[1], value: parts[2] || 'Enter' });
            success(`Recorded: press ${parts[1]} ${parts[2] || 'Enter'}`);
            await adapter.getPage()?.press(parts[1], parts[2] || 'Enter');
            break;

          case 'screenshot':
            const page = adapter.getPage();
            if (page) {
              const screenshot = await page.screenshot();
              const screenshotDir = getScreenshotsPath(flow.id);
              const screenshotPath = path.join(screenshotDir, `recording-${Date.now()}.png`);
              fs.writeFileSync(screenshotPath, screenshot);
              actions.push({ type: 'screenshot', value: screenshotPath });
              success(`Screenshot saved`);
            }
            break;

          case 'help':
            console.log('\n  ' + chalk.cyan('click <selector>') + '      Record a click action');
            console.log('  ' + chalk.cyan('fill <selector> <value>') + '  Record filling an input');
            console.log('  ' + chalk.cyan('navigate <url>') + '       Record navigation');
            console.log('  ' + chalk.cyan('wait <selector>') + '        Record waiting for element');
            console.log('  ' + chalk.cyan('screenshot') + '            Take a screenshot');
            console.log('  ' + chalk.cyan('done') + '                  Finish recording');
            console.log('  ' + chalk.cyan('cancel') + '                 Cancel and delete flow\n');
            break;

          default:
            if (cmd) warn(`Unknown command: ${cmd}. Type "help" for available commands.`);
        }
      } catch (err) {
        warn(`Error executing command: ${err}`);
      }
    }

    // Close browser
    await adapter.close();

    // Build graph from actions
    const nodes = [
      { id: 'start', type: 'start' as const, label: 'Start', url },
    ];
    const edges: { id: string; source: string; target: string }[] = [];
    let prevId = 'start';

    actions.forEach((action, i) => {
      const nodeId = `step-${i + 1}`;
      let label = '';
      
      switch (action.type) {
        case 'navigate':
          label = `Navigate to ${action.url}`;
          nodes.push({ id: nodeId, type: 'action' as const, label, action: 'navigate', url: action.url });
          break;
        case 'click':
          label = `Click ${action.selector}`;
          nodes.push({ id: nodeId, type: 'action' as const, label, action: 'click', selector: action.selector });
          break;
        case 'fill':
          label = `Fill ${action.selector}`;
          nodes.push({ id: nodeId, type: 'action' as const, label, action: 'fill', selector: action.selector, value: action.value });
          break;
        case 'wait':
          label = `Wait for ${action.selector}`;
          nodes.push({ id: nodeId, type: 'action' as const, label, action: 'wait', selector: action.selector });
          break;
        case 'press':
          label = `Press ${action.value} on ${action.selector}`;
          nodes.push({ id: nodeId, type: 'action' as const, label, action: 'press', selector: action.selector, value: action.value });
          break;
      }

      if (label) {
        edges.push({ id: `edge-${i}`, source: prevId, target: nodeId });
        prevId = nodeId;
      }
    });

    // Add end node
    nodes.push({ id: 'end', type: 'end' as const, label: 'End' });
    edges.push({ id: `edge-${actions.length}`, source: prevId, target: 'end' });

    // Update flow with graph
    updateFlowGraph(flow.id, { nodes, edges, appUrl: url });

    console.log(chalk.bold('\n  Recording Complete\n'));
    success(`${actions.length} actions recorded`);
    console.log();
    info('Run this flow with: ' + chalk.green(`flowmind run ${flow.id.slice(0, 8)}`));
    console.log();
  });

// ============================================
// FLOW COMMANDS
// ============================================

program
  .command('flow:list')
  .description('List all flows')
  .action(() => {
    ensureDataDir();
    initDB();
    
    const flows = listFlows();
    
    console.log(chalk.bold('\n  Your Flows\n'));

    if (flows.length === 0) {
      warn('No flows found. Create one with: ' + chalk.cyan('flowmind learn <url>'));
      console.log();
      return;
    }

    console.log(chalk.gray('  ID        Name                        Nodes   Edges   Updated'));
    console.log(chalk.gray('  ' + '─'.repeat(65)));

    for (const flow of flows) {
      const id = flow.id.slice(0, 8);
      const name = flow.name.padEnd(26).slice(0, 26);
      const nodes = flow.nodeCount.toString().padEnd(7);
      const edges = flow.edgeCount.toString().padEnd(7);
      const updated = flow.updatedAt.toLocaleDateString();

      console.log(`  ${chalk.gray(id)} ${chalk.white(name)} ${chalk.gray(nodes)} ${chalk.gray(edges)} ${chalk.gray(updated)}`);
    }

    console.log();
  });

program
  .command('flow:create <name>')
  .description('Create a new empty flow')
  .option('-d, --description <text>', 'Flow description')
  .option('-u, --url <url>', 'Application URL')
  .action((name: string, options: { description?: string; url?: string }) => {
    ensureDataDir();
    initDB();
    
    const spinner = ora('Creating flow...').start();
    
    try {
      const flow = createFlow(name, {
        description: options.description,
        appUrl: options.url,
      });

      spinner.succeed();
      success('Created flow: ' + chalk.white(name));
      console.log();
      console.log('  ' + chalk.gray('ID: ') + chalk.white(flow.id.slice(0, 8)));
      if (options.description) {
        console.log('  ' + chalk.gray('Desc: ') + chalk.white(options.description));
      }
      console.log();
      info('Use ' + chalk.cyan('flowmind learn <url>') + ' to add steps to this flow');
      console.log();
    } catch (err) {
      spinner.fail();
      error('Failed to create flow: ' + err);
    }
  });

program
  .command('flow:delete <id>')
  .description('Delete a flow')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (id: string, options: { yes?: boolean }) => {
    ensureDataDir();
    initDB();
    
    const flow = getFlow(id);
    if (!flow) {
      error('Flow not found: ' + id);
      process.exit(1);
    }

    if (!options.yes) {
      console.log(chalk.cyan(`\n  Delete flow "${flow.name}"? (y/N) `));
      const answer = await askQuestion('');
      if (answer.toLowerCase() !== 'y') {
        info('Cancelled');
        return;
      }
    }

    const spinner = ora('Deleting...').start();
    deleteFlow(id);
    spinner.succeed();
    success('Deleted flow: ' + chalk.gray(flow.name));
    console.log();
  });

program
  .command('flow:show <id>')
  .description('Show flow details')
  .action((id: string) => {
    ensureDataDir();
    initDB();
    
    const flow = getFlow(id);
    if (!flow) {
      error('Flow not found: ' + id);
      process.exit(1);
    }

    console.log(chalk.bold('\n  Flow Details\n'));

    try {
      const graph = JSON.parse(flow.graph);
      console.log('  ' + chalk.gray('ID: ') + chalk.white(flow.id));
      console.log('  ' + chalk.gray('Name: ') + chalk.white(flow.name));
      console.log('  ' + chalk.gray('URL: ') + chalk.cyan(flow.appUrl || '-'));
      console.log('  ' + chalk.gray('Created: ') + chalk.gray(flow.createdAt.toLocaleString()));
      console.log('  ' + chalk.gray('Updated: ') + chalk.gray(flow.updatedAt.toLocaleString()));
      console.log('  ' + chalk.gray('Nodes: ') + chalk.white((graph.nodes?.length || 0).toString()));
      console.log('  ' + chalk.gray('Edges: ') + chalk.white((graph.edges?.length || 0).toString()));
      console.log();

      if (graph.nodes?.length > 0) {
        divider();
        console.log(chalk.bold('\n  Nodes\n'));

        for (const node of graph.nodes as Array<{ id: string; type: string; label: string; action?: string; selector?: string }>) {
          const icon = node.type === 'start' ? '🚀' : node.type === 'end' ? '🏁' : '⚡';
          const type = chalk.gray(`[${node.type}]`);
          const action = node.action ? chalk.cyan(`(${node.action} ${node.selector || ''})`) : '';
          console.log(`    ${icon} ${chalk.white(node.label)} ${type} ${action}`);
        }
      }
      console.log();
    } catch (err) {
      error('Failed to parse flow graph: ' + err);
    }
  });

// ============================================
// RUN COMMAND
// ============================================

program
  .command('run [id]')
  .description('Run a flow')
  .option('-s, --slot <name=value>', 'Provide slot value', (v, acc: string[]) => [...(acc || []), v], [])
  .option('--headless', 'Run in headless mode')
  .option('--no-screenshots', 'Skip screenshots')
  .action(async (id: string | undefined, options: { slot?: string[]; headless?: boolean; noScreenshots?: boolean }) => {
    printLogo();
    divider();
    
    ensureDataDir();
    initDB();
    
    const flows = id ? [getFlow(id)].filter(Boolean) as ReturnType<typeof getFlow>[] : listFlows() as unknown as ReturnType<typeof getFlow>[];
    
    if (flows.length === 0) {
      error('No flows found');
      process.exit(1);
    }

    // Parse slots
    const slots: Record<string, string> = {};
    if (options.slot) {
      for (const s of options.slot) {
        const [key, ...valueParts] = s.split('=');
        slots[key.trim()] = valueParts.join('=').trim();
      }
    }

    for (const flow of flows) {
      await runFlow(flow, slots, options);
    }
  });

async function runFlow(flow: NonNullable<ReturnType<typeof getFlow>>, slots: Record<string, string>, options: { headless?: boolean; noScreenshots?: boolean }) {
  console.log(chalk.bold('\n  Running: ') + chalk.white(flow.name) + '\n');

  // Parse graph
  let graph: { nodes: unknown[]; edges: unknown[]; appUrl?: string } = { nodes: [], edges: [] };
  try {
    graph = JSON.parse(flow.graph);
  } catch {
    error('Invalid flow graph');
    return;
  }

  if (graph.nodes.length === 0) {
    warn('Flow has no nodes');
    return;
  }

  // Create run
  const run = createRun(flow.id);

  // Launch browser
  const spinner = ora('Launching browser...').start();
  const adapter = new PlaywrightAdapter();
  const screenshotsDir = getScreenshotsPath(run.id);

  try {
    await adapter.launch({ headless: options.headless ?? true });
    spinner.succeed();

    const startUrl = graph.appUrl || flow.appUrl || (graph.nodes[0] as { url?: string })?.url;
    if (startUrl) {
      await adapter.navigate(startUrl);
      info('Navigated to: ' + chalk.cyan(startUrl));
    }

    // Get action nodes (exclude start and end)
    const actionNodes = graph.nodes.filter((n: unknown) => {
      const node = n as { type: string };
      return node.type === 'action';
    }) as Array<{
      id: string;
      label: string;
      action: string;
      selector?: string;
      value?: string;
      url?: string;
    }>;

    let stepNum = 1;
    let failed = false;

    for (const node of actionNodes) {
      console.log(chalk.cyan(`\n  [${stepNum}/${actionNodes.length}] ${node.label}`));

      const step = createStep({
        runId: run.id,
        stepNumber: stepNum,
        name: node.label,
        action: node.action,
        selector: node.selector,
        value: node.value,
      });

      const startTime = Date.now();

      try {
        const page = adapter.getPage();
        if (!page) throw new Error('No page available');

        // Replace slot placeholders
        let value = node.value || '';
        for (const [key, slotValue] of Object.entries(slots)) {
          value = value.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), slotValue);
        }

        // Execute action
        switch (node.action) {
          case 'navigate':
            await page.goto(node.url || value, { waitUntil: 'domcontentloaded' });
            break;
          case 'click':
            await page.click(node.selector!, { timeout: 30000 });
            break;
          case 'fill':
            const sanitized = sanitizeObject({ v: value }).v as string;
            await page.fill(node.selector!, sanitized);
            break;
          case 'wait':
            await page.waitForSelector(node.selector!, { timeout: 30000 });
            break;
          case 'press':
            await page.press(node.selector!, node.value || 'Enter');
            break;
        }

        const duration = Date.now() - startTime;

        // Screenshot
        let screenshotPath: string | null = null;
        if (!options.noScreenshots) {
          const screenshot = await page.screenshot();
          screenshotPath = path.join(screenshotsDir, `step-${stepNum}.png`);
          fs.writeFileSync(screenshotPath, screenshot);
        }

        updateStep(step.id, { status: 'passed', duration, screenshotPath: screenshotPath || undefined });

        console.log(chalk.green(`      ✓ passed (${duration}ms)`) + (screenshotPath ? chalk.gray(` 📷`) : ''));

      } catch (err) {
        const duration = Date.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Failure screenshot
        let screenshotPath: string | null = null;
        if (!options.noScreenshots) {
          const page = adapter.getPage();
          if (page) {
            const screenshot = await page.screenshot();
            screenshotPath = path.join(screenshotsDir, `step-${stepNum}-FAILED.png`);
            fs.writeFileSync(screenshotPath, screenshot);
          }
        }

        updateStep(step.id, { status: 'failed', duration, errorMessage, screenshotPath: screenshotPath || undefined });

        console.log(chalk.red(`      ✗ failed (${duration}ms)`));
        console.log(chalk.red(`        └─ ${errorMessage}`) + (screenshotPath ? chalk.gray(` 📷`) : ''));

        failed = true;
        break;
      }

      stepNum++;
    }

    // Update run
    const status = failed ? 'failed' : 'passed';
    updateRun(run.id, {
      status,
      completedAt: new Date(),
      duration: Date.now() - new Date(run.startedAt).getTime(),
      errorMessage: failed ? 'One or more steps failed' : undefined,
    });

    await adapter.close();

    divider();
    if (status === 'passed') {
      success('Flow passed!');
    } else {
      error('Flow failed');
    }
    console.log();
    info('Run ID: ' + chalk.gray(run.id.slice(0, 8)));
    info('Report: ' + chalk.cyan('flowmind run:show ' + run.id.slice(0, 8)));
    console.log();

  } catch (err) {
    await adapter.close();
    updateRun(run.id, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: String(err),
    });
    error('Run failed: ' + err);
  }
}

// ============================================
// RUN COMMANDS
// ============================================

program
  .command('run:list')
  .description('List recent runs')
  .option('-f, --flow <id>', 'Filter by flow ID')
  .option('-l, --limit <n>', 'Number of runs', '10')
  .action((options: { flow?: string; limit?: string }) => {
    ensureDataDir();
    initDB();
    
    const runs = listRuns(options.flow, parseInt(options.limit || '10'));
    
    console.log(chalk.bold('\n  Recent Runs\n'));

    if (runs.length === 0) {
      warn('No runs found');
      console.log();
      return;
    }

    console.log(chalk.gray('  ID        Flow                       Status       Duration   Started'));
    console.log(chalk.gray('  ' + '─'.repeat(75)));

    for (const run of runs as Array<{ id: string; flowId: string; status: string; duration: number | null; startedAt: Date }>) {
      const id = run.id.slice(0, 8);
      const flow = getFlow(run.flowId);
      const flowName = flow?.name.padEnd(24).slice(0, 24) || 'Unknown'.padEnd(24);
      const status = run.status.padEnd(12);
      const duration = (run.duration ? `${run.duration}ms` : '-').padEnd(10);
      const started = run.startedAt.toLocaleTimeString();

      const statusColor = run.status === 'passed' ? chalk.green : run.status === 'failed' ? chalk.red : chalk.yellow;

      console.log(`  ${chalk.gray(id)} ${chalk.white(flowName)} ${statusColor(status)} ${chalk.gray(duration)} ${chalk.gray(started)}`);
    }

    console.log();
  });

program
  .command('run:show <id>')
  .description('Show run details')
  .action((id: string) => {
    ensureDataDir();
    initDB();
    
    const run = getRun(id);
    if (!run) {
      error('Run not found: ' + id);
      process.exit(1);
    }

    const flow = getFlow(run.flowId);
    const steps = listRuns(id).length ? [] : []; // Will fetch properly

    // Fetch steps
    const db = getDB();
    const stepRecords = db.listSteps(run.id);

    console.log(chalk.bold(`\n  Run: ${run.id.slice(0, 8)}\n`));

    console.log(chalk.gray('  ┌────────────────────────────────────────────────────────────┐'));
    console.log(chalk.gray('  │ ') + `Flow:     ${(flow?.name || 'Unknown').padEnd(40)}` + chalk.gray('│'));
    
    const statusColor = run.status === 'passed' ? chalk.green : run.status === 'failed' ? chalk.red : chalk.yellow;
    console.log(chalk.gray('  │ ') + `Status:   ${statusColor(run.status.padEnd(40))}` + chalk.gray('│'));
    console.log(chalk.gray('  │ ') + `Duration: ${(run.duration ? `${run.duration}ms` : '-').padEnd(40)}` + chalk.gray('│'));
    console.log(chalk.gray('  │ ') + `Started:  ${run.startedAt.toLocaleString().padEnd(40)}` + chalk.gray('│'));
    console.log(chalk.gray('  └────────────────────────────────────────────────────────────┘'));
    console.log();

    console.log(chalk.bold('  Steps\n'));

    for (const step of stepRecords as Array<{ stepNumber: number; name: string; status: string; duration: number | null; errorMessage: string | null; screenshotPath: string | null }>) {
      const num = step.stepNumber.toString().padStart(2, ' ');
      const icon = step.status === 'passed' ? chalk.green('✓') : chalk.red('✗');
      const duration = step.duration ? `${step.duration}ms` : '-';

      console.log(`    ${chalk.gray(num)} ${icon} ${chalk.white(step.name)} ${chalk.gray(duration.padStart(10))}`);

      if (step.status === 'failed' && step.errorMessage) {
        console.log(`        ${chalk.red('└─')} ${chalk.red(step.errorMessage)}`);
      }
      if (step.screenshotPath) {
        console.log(`        ${chalk.gray('└─ 📷')} ${chalk.white(step.screenshotPath)}`);
      }
    }

    if (run.status === 'failed' && (run as unknown as { errorMessage?: string }).errorMessage) {
      console.log();
      error('Error: ' + (run as unknown as { errorMessage: string }).errorMessage);
    }

    console.log();
  });

// ============================================
// STATUS COMMAND
// ============================================

program
  .command('status')
  .description('Show Flowmind status')
  .action(() => {
    printLogo();
    divider();
    
    ensureDataDir();
    initDB();
    
    const flows = listFlows();
    const runs = listRuns(undefined, 100);
    
    const passedRuns = runs.filter((r: unknown) => (r as { status: string }).status === 'passed').length;
    const failedRuns = runs.filter((r: unknown) => (r as { status: string }).status === 'failed').length;

    console.log(chalk.bold('\n  Statistics\n'));
    console.log('  ' + chalk.gray('Flows: ') + chalk.white(flows.length.toString()));
    console.log('  ' + chalk.gray('Total Runs: ') + chalk.white(runs.length.toString()));
    console.log('  ' + chalk.gray('Passed: ') + chalk.green(passedRuns.toString()));
    console.log('  ' + chalk.gray('Failed: ') + chalk.red(failedRuns.toString()));
    
    if (runs.length > 0) {
      const rate = Math.round((passedRuns / runs.length) * 100);
      console.log('  ' + chalk.gray('Success Rate: ') + (rate >= 80 ? chalk.green : rate >= 50 ? chalk.yellow : chalk.red)(`${rate}%`));
    }
    
    console.log();
    console.log('  ' + chalk.gray('Data Path: ') + chalk.white(DATA_PATH));
    console.log();
  });

// ============================================
// MAIN
// ============================================

program
  .name('flowmind')
  .description('🧠 Memory-driven web automation that learns, replays, and tests flows')
  .version('0.1.0');

// Show help if no args
if (process.argv.length === 2) {
  printLogo();
  divider();
  console.log();
  info('Usage:');
  console.log('  ' + chalk.cyan('flowmind init') + '                   Initialize Flowmind');
  console.log('  ' + chalk.cyan('flowmind learn <url>') + '           Learn a new flow');
  console.log('  ' + chalk.cyan('flowmind flow:list') + '            List all flows');
  console.log('  ' + chalk.cyan('flowmind flow:show <id>') + '       Show flow details');
  console.log('  ' + chalk.cyan('flowmind run <id>') + '             Run a flow');
  console.log('  ' + chalk.cyan('flowmind run:list') + '            List recent runs');
  console.log('  ' + chalk.cyan('flowmind run:show <id>') + '       Show run details');
  console.log('  ' + chalk.cyan('flowmind status') + '              Show status');
  console.log();
  info('For more help: ' + chalk.cyan('flowmind --help'));
  console.log();
}

program.parse(process.argv);

// Question helper
function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}
