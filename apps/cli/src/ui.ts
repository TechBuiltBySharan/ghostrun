/**
 * Flowmind CLI - Beautiful Terminal UI Components
 */

import chalk from 'chalk';
import figures from 'figures';
import ora from 'ora';
import * as readline from 'readline';

// Border characters
const border = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  cross: '┼',
};

export class UI {
  verbose: boolean;
  private useColor: boolean;

  constructor(options: { verbose?: boolean; color?: boolean } = {}) {
    this.verbose = options.verbose ?? false;
    this.useColor = options.color ?? true;
    
    if (!this.useColor) {
      chalk.level = 0;
    }
  }

  // ===== LOGO =====

  printLogo() {
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

  // ===== BASIC OUTPUT =====

  log(message: string, color?: string) {
    const c = color as keyof typeof chalk ? (chalk as Record<string, { (s: string): string }>)[color] : chalk.reset;
    console.log(c(message));
  }

  info(message: string) {
    console.log(chalk.blue(`${figures.info} ${message}`));
  }

  success(message: string) {
    console.log(chalk.green(`${figures.tick} ${message}`));
  }

  warn(message: string) {
    console.log(chalk.yellow(`${figures.warning} ${message}`));
  }

  error(message: string) {
    console.log(chalk.red(`${figures.cross} ${message}`));
  }

  verboseLog(message: string) {
    if (this.verbose) {
      console.log(chalk.gray(`  → ${message}`));
    }
  }

  // ===== SPINNER =====

  spinner(text: string) {
    return ora({
      text: chalk.cyan(text),
      spinner: 'dots',
    });
  }

  // ===== PROGRESS =====

  progress(current: number, total: number, text: string) {
    const width = 40;
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percent = Math.round((current / total) * 100);
    
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      chalk.cyan(`[${bar}] ${percent}% ${text}`)
    );
    
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  // ===== TABLES =====

  printFlowsTable(flows: Array<{
    id: string;
    name: string;
    nodeCount: number;
    edgeCount: number;
    updatedAt: Date;
  }>) {
    if (flows.length === 0) {
      this.warn('No flows found. Create one with: flowmind flow:create <name>');
      return;
    }

    console.log(chalk.bold('\n  Your Flows\n'));
    console.log(
      `  ${chalk.cyan('ID')}${' '.repeat(9)}${chalk.cyan('Name')}${' '.repeat(26)}${chalk.cyan('Nodes')}${' '.repeat(6)}${chalk.cyan('Edges')}${' '.repeat(6)}${chalk.cyan('Last Updated')}`
    );
    console.log(`  ${'─'.repeat(80)}`);

    for (const flow of flows) {
      const id = flow.id.slice(0, 8);
      const name = flow.name.padEnd(30).slice(0, 30);
      const nodes = flow.nodeCount.toString().padEnd(8);
      const edges = flow.edgeCount.toString().padEnd(8);
      const updated = flow.updatedAt.toLocaleDateString();

      console.log(`  ${chalk.gray(id)} ${chalk.white(name)} ${chalk.gray(nodes)} ${chalk.gray(edges)} ${chalk.gray(updated)}`);
    }

    console.log();
  }

  printRunsTable(runs: Array<{
    id: string;
    flowId: string;
    flowName: string;
    status: string;
    startedAt: Date;
    duration: number | null;
  }>) {
    if (runs.length === 0) {
      this.warn('No runs found.');
      return;
    }

    console.log(chalk.bold('\n  Recent Runs\n'));
    console.log(
      `  ${chalk.cyan('ID')}${' '.repeat(9)}${chalk.cyan('Flow')}${' '.repeat(26)}${chalk.cyan('Status')}${' '.repeat(8)}${chalk.cyan('Duration')}${' '.repeat(8)}${chalk.cyan('Started')}`
    );
    console.log(`  ${'─'.repeat(80)}`);

    for (const run of runs) {
      const id = run.id.slice(0, 8);
      const flow = run.flowName.padEnd(30).slice(0, 30);
      
      let statusColor = chalk.gray;
      let statusText = run.status;
      if (run.status === 'passed') {
        statusColor = chalk.green;
        statusText = '✓ passed';
      } else if (run.status === 'failed') {
        statusColor = chalk.red;
        statusText = '✗ failed';
      } else if (run.status === 'running') {
        statusColor = chalk.yellow;
        statusText = '● running';
      }

      const duration = run.duration ? `${run.duration}ms` : '-';
      const started = run.startedAt.toLocaleString().split(' ').slice(4).join(' ').slice(0, -3);

      console.log(`  ${chalk.gray(id)} ${chalk.white(flow)} ${statusColor(statusText.padEnd(12))} ${chalk.gray(duration.padEnd(12))} ${chalk.gray(started)}`);
    }

    console.log();
  }

  printRunDetail(run: {
    id: string;
    flowId: string;
    flowName: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    duration: number | null;
    errorMessage: string | null;
  }, steps: Array<{
    stepNumber: number;
    name: string;
    status: string;
    duration: number | null;
    errorMessage: string | null;
    screenshotPath: string | null;
  }>) {
    // Header
    console.log(chalk.bold(`\n  Run Details: ${run.id.slice(0, 8)}\n`));
    
    // Info box
    const statusColor = run.status === 'passed' ? chalk.green : run.status === 'failed' ? chalk.red : chalk.yellow;
    
    console.log(`  ${chalk.cyan('┌' + '─'.repeat(60) + '┐')}`);
    console.log(`  ${chalk.cyan('│')} ${chalk.gray('Flow:')}     ${chalk.white(run.flowName.padEnd(40))} ${chalk.cyan('│')}`);
    console.log(`  ${chalk.cyan('│')} ${chalk.gray('Status:')}   ${statusColor(run.status.padEnd(40))} ${chalk.cyan('│')}`);
    console.log(`  ${chalk.cyan('│')} ${chalk.gray('Duration:')} ${chalk.white((run.duration ? `${run.duration}ms` : '-').padEnd(40))} ${chalk.cyan('│')}`);
    console.log(`  ${chalk.cyan('│')} ${chalk.gray('Started:')}  ${chalk.gray(run.startedAt.toLocaleString().padEnd(40))} ${chalk.cyan('│')}`);
    console.log(`  ${chalk.cyan('└' + '─'.repeat(60) + '┘')}`);

    // Steps
    console.log(chalk.bold('\n  Steps\n'));

    for (const step of steps) {
      const num = step.stepNumber.toString().padStart(2, ' ');
      let icon = chalk.gray('○');
      let statusColor = chalk.gray;
      let extra = '';

      if (step.status === 'passed') {
        icon = chalk.green('✓');
        statusColor = chalk.green;
      } else if (step.status === 'failed') {
        icon = chalk.red('✗');
        statusColor = chalk.red;
        if (step.errorMessage) {
          extra = `\n    ${chalk.red('│')} ${chalk.bgRed.white(' ERROR ')} ${chalk.red(step.errorMessage)}`;
          if (step.screenshotPath) {
            extra += `\n    ${chalk.red('│')} ${chalk.gray('📷 Screenshot:')} ${chalk.white(step.screenshotPath)}`;
          }
        }
      }

      const duration = step.duration ? `${step.duration}ms` : '-';
      console.log(`    ${chalk.gray(num)} ${icon} ${chalk.white(step.name)} ${statusColor(duration.padStart(8))}${extra}`);
    }

    // Error summary
    if (run.status === 'failed' && run.errorMessage) {
      console.log(chalk.red(`\n  ${figures.cross} Error: ${run.errorMessage}\n`));
    }

    console.log();
  }

  // ===== STEP PROGRESS =====

  printStepStart(step: number, total: number, name: string) {
    console.log(chalk.cyan(`\n  [${step}/${total}] ${name}`));
  }

  printStepSuccess(duration: number, screenshot?: string) {
    const icon = chalk.green('✓');
    const time = chalk.gray(`${duration}ms`);
    const ss = screenshot ? ` ${chalk.gray('📷')} ${chalk.white(screenshot)}` : '';
    console.log(`      ${icon} ${chalk.green('passed')} ${time}${ss}`);
  }

  printStepFailure(duration: number, error: string, screenshot?: string) {
    const icon = chalk.red('✗');
    const time = chalk.gray(`${duration}ms`);
    const ss = screenshot ? ` ${chalk.gray('📷')} ${chalk.white(screenshot)}` : '';
    console.log(`      ${icon} ${chalk.red('failed')} ${time}${ss}`);
    console.log(`        ${chalk.red('└─')} ${chalk.red(error)}`);
  }

  // ===== DIVIDERS =====

  divider(char = '─', length = 60) {
    console.log(chalk.cyan(char.repeat(length)));
  }

  section(title: string) {
    console.log(chalk.bold.cyan(`\n  ${title}\n`));
  }

  // ===== INPUT =====

  async prompt(message: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(chalk.cyan(`${message}: `), (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const suffix = defaultValue ? ' [Y/n]' : ' [y/N]';
    
    return new Promise((resolve) => {
      rl.question(chalk.cyan(`${message}${suffix}: `), (answer) => {
        rl.close();
        const a = answer.toLowerCase();
        if (!a) resolve(defaultValue);
        else resolve(a === 'y' || a === 'yes');
      });
    });
  }

  // ===== BOX =====

  box(lines: string[], options: { border?: boolean; color?: string } = {}) {
    const borderColor = options.color ? (chalk as Record<string, { (s: string): string }>)[options.color] : chalk.cyan;
    const borderChar = borderColor('─');

    if (options.border !== false) {
      const maxLen = Math.max(...lines.map(l => l.length), 10);
      console.log(`  ${borderColor('┌')}${borderChar.repeat(maxLen + 2)}${borderColor('┐')}`);
    }

    for (const line of lines) {
      console.log(`  ${borderColor('│')} ${chalk.white(line.padEnd(maxLen))} ${borderColor('│')}`);
    }

    if (options.border !== false) {
      const maxLen = Math.max(...lines.map(l => l.length), 10);
      console.log(`  ${borderColor('└')}${borderChar.repeat(maxLen + 2)}${borderColor('┘')}`);
    }
  }
}

// Default export
export const ui = new UI();
