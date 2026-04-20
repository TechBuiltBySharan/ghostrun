#!/usr/bin/env node

/**
 * Flowmind CLI - Command-line interface
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createGraphStorage, createFlowGraph, serializeGraph } from '@ghostrun/memory';
import { createReportStorage, createReporter, formatConsoleOutput, formatDuration, formatJUnitXML } from '@ghostrun/reporting';
import { executeFlow } from '@ghostrun/executor';
import { PlaywrightAdapter } from '@ghostrun/adapters-web';
import { createVault } from '@ghostrun/vault';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('flowmind')
  .description('Memory-driven web automation that learns, replays, and tests flows')
  .version('0.1.0');

// Global options
program
  .option('-v, --verbose', 'Verbose output')
  .option('--no-color', 'Disable colors');

// Storage path
const storagePath = path.join(process.env.HOME || '.', '.flowmind');

// ============================================
// FLOW COMMANDS
// ============================================

program
  .command('flow')
  .description('Manage flows');

program
  .command('flow:list')
  .description('List all flows')
  .action(async () => {
    const storage = createGraphStorage({ basePath: path.join(storagePath, 'flows') });
    const flows = await storage.listGraphs();

    if (flows.length === 0) {
      console.log(chalk.yellow('No flows found'));
      return;
    }

    console.log(chalk.bold('\nFlows:\n'));
    console.log(
      '  ' +
      ['ID', 'Name', 'Nodes', 'Edges', 'Updated'].map(h => chalk.cyan(h.padEnd(25))).join('  ')
    );
    console.log('  ' + '-'.repeat(130));

    for (const flow of flows) {
      console.log(
        '  ' +
        [
          flow.id.slice(0, 8),
          flow.name.slice(0, 25),
          flow.nodeCount.toString(),
          flow.edgeCount.toString(),
          flow.updatedAt.toLocaleDateString(),
        ].map(v => v.padEnd(25)).join('  ')
      );
    }

    console.log();
  });

program
  .command('flow:create <name>')
  .description('Create a new flow')
  .option('-d, --description <text>', 'Flow description')
  .option('-u, --url <url>', 'Application URL')
  .action(async (name: string, options) => {
    const storage = createGraphStorage({ basePath: path.join(storagePath, 'flows') });
    const state = createFlowGraph({
      name,
      description: options.description,
      appUrl: options.url,
    });

    await storage.saveGraph(state);
    console.log(chalk.green(`Created flow "${name}" (${state.flow.id})`));
  });

program
  .command('flow:run <id>')
  .description('Run a flow')
  .option('-s, --slot <name=value>', 'Provide slot value', (v, acc: string[]) => [...(acc || []), v], [])
  .option('-t, --timeout <ms>', 'Timeout per step', '30000')
  .option('--headful', 'Run in headed mode')
  .action(async (id: string, options) => {
    const storage = createGraphStorage({ basePath: path.join(storagePath, 'flows') });
    const graph = await storage.loadGraph(id);

    if (!graph) {
      console.log(chalk.red(`Flow not found: ${id}`));
      return;
    }

    const reportStorage = createReportStorage({ basePath: path.join(storagePath, 'runs') });
    const reporter = createReporter({});

    // Parse slots
    const slots: Record<string, string> = {};
    for (const slot of options.slot || []) {
      const [name, value] = slot.split('=');
      if (name && value) {
        slots[name] = value;
      }
    }

    // Launch browser
    const spinner = ora('Launching browser...').start();
    const browserAdapter = new PlaywrightAdapter({
      headless: !options.headful,
    });
    await browserAdapter.launch();
    const browser = await browserAdapter.getBrowser();

    if (!browser) {
      spinner.fail('Failed to launch browser');
      return;
    }

    spinner.text = 'Running flow...';

    try {
      const result = await executeFlow(graph.flow, browser, {
        timeout: parseInt(options.timeout),
        headless: !options.headful,
        slots,
      });

      spinner.stop();

      // Save run
      const run = {
        ...result,
        steps: result.steps,
        slots,
        summary: {
          totalSteps: result.steps.length,
          passedSteps: result.steps.filter(s => s.status === 'passed').length,
          failedSteps: result.steps.filter(s => s.status === 'failed').length,
          skippedSteps: result.steps.filter(s => s.status === 'skipped').length,
          totalDuration: result.duration,
          screenshots: result.steps.map(s => s.screenshot).filter(Boolean) as string[],
          networkLogs: [],
          consoleLogs: [],
        },
        flowId: id,
        flowVersion: graph.flow.version,
        startedAt: new Date(),
        completedAt: new Date(),
        status: result.success ? 'passed' : 'failed',
      };

      await reportStorage.save(run);

      // Display result
      console.log('\n' + formatConsoleOutput(run));

      if (result.error) {
        console.log(chalk.red('\nFailed at: ' + result.error.nodeId));
        console.log(chalk.red('Error: ' + result.error.message));
        if (result.error.expected) {
          console.log(chalk.yellow('Expected: ' + result.error.expected));
        }
        if (result.error.actual) {
          console.log(chalk.yellow('Actual: ' + result.error.actual));
        }
        if (result.error.screenshot) {
          console.log(chalk.blue('Screenshot: ' + result.error.screenshot));
        }
        if (result.error.networkError) {
          console.log(chalk.red('Network Error: ' + result.error.networkError));
        }
      }
    } finally {
      await browserAdapter.close();
    }
  });

program
  .command('flow:export <id>')
  .description('Export a flow')
  .option('-o, --output <file>', 'Output file')
  .action(async (id: string, options) => {
    const storage = createGraphStorage({ basePath: path.join(storagePath, 'flows') });
    const graph = await storage.loadGraph(id);

    if (!graph) {
      console.log(chalk.red(`Flow not found: ${id}`));
      return;
    }

    const { exportForVisualization } = await import('@ghostrun/memory');
    const data = exportForVisualization(graph);
    const json = JSON.stringify(data, null, 2);

    if (options.output) {
      await fs.promises.writeFile(options.output, json);
      console.log(chalk.green(`Exported to ${options.output}`));
    } else {
      console.log(json);
    }
  });

// ============================================
// RUN COMMANDS
// ============================================

program
  .command('run')
  .description('Manage runs');

program
  .command('run:list')
  .description('List all runs')
  .option('-f, --flow <id>', 'Filter by flow ID')
  .option('-l, --limit <n>', 'Limit number of results', '20')
  .action(async (options) => {
    const reportStorage = createReportStorage({ basePath: path.join(storagePath, 'runs') });
    const runs = await reportStorage.list({
      flowId: options.flow,
      limit: parseInt(options.limit),
    });

    if (runs.length === 0) {
      console.log(chalk.yellow('No runs found'));
      return;
    }

    console.log(chalk.bold('\nRuns:\n'));
    console.log(
      '  ' +
      ['ID', 'Flow', 'Status', 'Duration', 'Steps', 'Date'].map(h => chalk.cyan(h.padEnd(20))).join('  ')
    );
    console.log('  ' + '-'.repeat(130));

    for (const run of runs) {
      const statusColor = run.status === 'passed' ? chalk.green : run.status === 'failed' ? chalk.red : chalk.yellow;
      console.log(
        '  ' +
        [
          run.id.slice(0, 8),
          run.flowId.slice(0, 20),
          statusColor(run.status.padEnd(10)),
          formatDuration(run.duration || 0),
          `${run.passedSteps}/${run.passedSteps + run.failedSteps}`,
          run.startedAt.toLocaleDateString(),
        ].map(v => v.padEnd(20)).join('  ')
      );
    }

    console.log();
  });

program
  .command('run:report <id>')
  .description('Show run report')
  .option('-f, --format <format>', 'Output format (console, json, junit)', 'console')
  .option('-o, --output <file>', 'Output file')
  .action(async (id: string, options) => {
    const reportStorage = createReportStorage({ basePath: path.join(storagePath, 'runs') });
    const run = await reportStorage.load(id);

    if (!run) {
      console.log(chalk.red(`Run not found: ${id}`));
      return;
    }

    let output: string;

    if (options.format === 'json') {
      output = JSON.stringify(run, null, 2);
    } else if (options.format === 'junit') {
      output = formatJUnitXML(run);
    } else {
      output = formatConsoleOutput(run);
    }

    if (options.output) {
      await fs.promises.writeFile(options.output, output);
      console.log(chalk.green(`Report saved to ${options.output}`));
    } else {
      console.log(output);
    }
  });

// ============================================
// VAULT COMMANDS
// ============================================

program
  .command('vault')
  .description('Manage credentials');

program
  .command('vault:store <name>')
  .description('Store a credential')
  .option('-u, --username <username>', 'Username')
  .option('-p, --password <password>', 'Password')
  .option('-U, --url <url>', 'Associated URL')
  .action(async (name: string, options) => {
    const vault = createVault();
    await vault.initialize();

    const credential = await vault.store({
      name,
      username: options.username,
      password: options.password,
      url: options.url,
      tags: [],
    });

    console.log(chalk.green(`Stored credential "${name}" (${credential.id})`));
  });

program
  .command('vault:list')
  .description('List credentials')
  .action(async () => {
    const vault = createVault();
    await vault.initialize();

    const credentials = await vault.list();

    if (credentials.length === 0) {
      console.log(chalk.yellow('No credentials stored'));
      return;
    }

    console.log(chalk.bold('\nCredentials:\n'));
    for (const cred of credentials) {
      console.log(`  ${chalk.cyan(cred.name)}`);
      if (cred.username) console.log(`    Username: ${cred.username}`);
      if (cred.url) console.log(`    URL: ${cred.url}`);
      console.log();
    }
  });

// ============================================
// MISC COMMANDS
// ============================================

program
  .command('init')
  .description('Initialize Flowmind')
  .action(async () => {
    const dirs = [
      path.join(storagePath),
      path.join(storagePath, 'flows'),
      path.join(storagePath, 'runs'),
      path.join(storagePath, 'vault'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(chalk.green(`Created: ${dir}`));
      }
    }

    console.log(chalk.green('\nFlowmind initialized!'));
  });

program
  .command('doctor')
  .description('Check system requirements')
  .action(async () => {
    console.log(chalk.bold('\nSystem Check:\n'));

    // Check Node version
    console.log(`  Node.js: ${chalk.green(process.version)}`);

    // Check Playwright
    try {
      const { chromium } = await import('playwright');
      console.log(`  Playwright: ${chalk.green('installed')}`);
    } catch {
      console.log(`  Playwright: ${chalk.red('not installed')}`);
    }

    // Check storage path
    console.log(`  Storage: ${chalk.cyan(storagePath)}`);
    console.log(`  Exists: ${fs.existsSync(storagePath) ? chalk.green('yes') : chalk.yellow('no')}`);

    console.log();
  });

// Parse and execute
program.parse(process.argv);
