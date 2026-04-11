/**
 * Reporter - Generate and manage test reports
 */

import type { FlowRun, StepResult, FlowRunSummary, SerializedFlowRun, StepFailureReport } from '@flowmind/core';
import { generateFailureReport } from '@flowmind/core';
import { serializeFlowRun, deserializeFlowRun } from '@flowmind/core';
import * as fs from 'fs';
import * as path from 'path';

export interface ReportConfig {
  outputDir: string;
  includeScreenshots: boolean;
  includeNetworkLogs: boolean;
  includeConsoleLogs: boolean;
  maxConsoleLogs: number;
  maxNetworkLogs: number;
}

const DEFAULT_CONFIG: Required<ReportConfig> = {
  outputDir: path.join(process.env.HOME || '.', '.flowmind', 'runs'),
  includeScreenshots: true,
  includeNetworkLogs: true,
  includeConsoleLogs: true,
  maxConsoleLogs: 100,
  maxNetworkLogs: 50,
};

export interface RunReport {
  run: FlowRun;
  summary: ReportSummary;
  failures: StepFailureReport[];
  screenshots: ScreenshotInfo[];
  networkLogs: NetworkLogInfo[];
  consoleLogs: ConsoleLogInfo[];
}

export interface ReportSummary {
  flowId: string;
  flowName: string;
  status: 'passed' | 'failed' | 'aborted' | 'skipped';
  duration: number;
  startedAt: Date;
  completedAt?: Date;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  passRate: number;
  errorSummary?: string;
}

export interface ScreenshotInfo {
  stepId: string;
  stepName: string;
  path: string;
  timestamp: Date;
}

export interface NetworkLogInfo {
  stepId?: string;
  method: string;
  url: string;
  status?: number;
  error?: string;
  timestamp: Date;
  duration?: number;
}

export interface ConsoleLogInfo {
  stepId?: string;
  type: string;
  message: string;
  timestamp: Date;
}

/**
 * Create a reporter instance
 */
export function createReporter(config: Partial<ReportConfig> = {}): Reporter {
  return new Reporter({ ...DEFAULT_CONFIG, ...config });
}

/**
 * Reporter class
 */
export class Reporter {
  private config: Required<ReportConfig>;

  constructor(config: ReportConfig) {
    this.config = config;
    this.ensureOutputDir();
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Generate report from a run
   */
  async generateReport(run: FlowRun, flowName: string): Promise<RunReport> {
    // Create run directory
    const runDir = path.join(this.config.outputDir, run.id);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    // Collect failures
    const failures: StepFailureReport[] = [];
    const screenshots: ScreenshotInfo[] = [];
    const networkLogs: NetworkLogInfo[] = [];
    const consoleLogs: ConsoleLogInfo[] = [];

    for (const step of run.steps) {
      // Extract failure report
      const failureReport = generateFailureReport(step);
      if (failureReport) {
        failures.push(failureReport);
      }

      // Collect screenshots
      if (this.config.includeScreenshots && step.screenshot) {
        screenshots.push({
          stepId: step.id,
          stepName: step.nodeName,
          path: step.screenshot,
          timestamp: step.startedAt,
        });
      }

      // Collect network logs
      if (this.config.includeNetworkLogs) {
        const stepNetworkLogs = step.networkLogs
          .slice(0, this.config.maxNetworkLogs)
          .map(log => ({
            stepId: step.id,
            method: log.method,
            url: log.url,
            status: log.status,
            error: log.error,
            timestamp: new Date(log.timestamp),
            duration: log.timing?.duration,
          }));
        networkLogs.push(...stepNetworkLogs);
      }

      // Collect console logs
      if (this.config.includeConsoleLogs) {
        const stepConsoleLogs = step.consoleLogs
          .slice(0, this.config.maxConsoleLogs)
          .map(log => ({
            stepId: step.id,
            type: log.type,
            message: log.message,
            timestamp: new Date(log.timestamp),
          }));
        consoleLogs.push(...stepConsoleLogs);
      }
    }

    // Calculate summary
    const summary: ReportSummary = {
      flowId: run.flowId,
      flowName,
      status: run.status === 'passed' ? 'passed' : run.status === 'failed' ? 'failed' : run.status === 'aborted' ? 'aborted' : 'skipped',
      duration: run.duration || 0,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      totalSteps: run.summary.totalSteps,
      passedSteps: run.summary.passedSteps,
      failedSteps: run.summary.failedSteps,
      skippedSteps: run.summary.skippedSteps,
      passRate: run.summary.totalSteps > 0 
        ? (run.summary.passedSteps / run.summary.totalSteps) * 100 
        : 0,
      errorSummary: failures.length > 0 
        ? this.summarizeFailures(failures)
        : undefined,
    };

    // Save run data
    const runData: SerializedFlowRun = serializeFlowRun(run);
    await fs.promises.writeFile(
      path.join(runDir, 'run.json'),
      JSON.stringify(runData, null, 2)
    );

    return {
      run,
      summary,
      failures,
      screenshots,
      networkLogs,
      consoleLogs,
    };
  }

  /**
   * Generate human-readable report
   */
  generateReadableReport(report: RunReport): string {
    const lines: string[] = [];
    
    lines.push('='.repeat(60));
    lines.push(`FLOWMIND TEST REPORT`);
    lines.push('='.repeat(60));
    lines.push('');
    
    // Summary section
    lines.push('SUMMARY');
    lines.push('-'.repeat(40));
    lines.push(`Flow: ${report.summary.flowName}`);
    lines.push(`Status: ${report.summary.status.toUpperCase()}`);
    lines.push(`Duration: ${this.formatDuration(report.summary.duration)}`);
    lines.push(`Started: ${report.summary.startedAt.toISOString()}`);
    if (report.summary.completedAt) {
      lines.push(`Completed: ${report.summary.completedAt.toISOString()}`);
    }
    lines.push('');
    
    // Steps summary
    lines.push('STEPS');
    lines.push('-'.repeat(40));
    lines.push(`Total: ${report.summary.totalSteps}`);
    lines.push(`Passed: ${report.summary.passedSteps} (${report.summary.passRate.toFixed(1)}%)`);
    lines.push(`Failed: ${report.summary.failedSteps}`);
    lines.push(`Skipped: ${report.summary.skippedSteps}`);
    lines.push('');
    
    // Failures section
    if (report.failures.length > 0) {
      lines.push('FAILURES');
      lines.push('-'.repeat(40));
      lines.push('');
      
      for (let i = 0; i < report.failures.length; i++) {
        const failure = report.failures[i];
        lines.push(`${i + 1}. ${failure.nodeName}`);
        lines.push(`   Step ID: ${failure.stepId}`);
        lines.push(`   Error: ${failure.errorType}`);
        lines.push(`   Message: ${failure.message}`);
        
        if (failure.expected) {
          lines.push(`   Expected: ${failure.expected}`);
        }
        if (failure.actual) {
          lines.push(`   Actual: ${failure.actual}`);
        }
        if (failure.screenshot) {
          lines.push(`   Screenshot: ${failure.screenshot}`);
        }
        if (failure.networkError) {
          lines.push(`   Network Error: ${failure.networkError}`);
        }
        if (failure.consoleError) {
          lines.push(`   Console Error: ${failure.consoleError}`);
        }
        
        if (failure.suggestions.length > 0) {
          lines.push('   Suggestions:');
          for (const suggestion of failure.suggestions) {
            lines.push(`     - ${suggestion}`);
          }
        }
        
        lines.push('');
      }
    }
    
    // Screenshots section
    if (report.screenshots.length > 0) {
      lines.push('SCREENSHOTS');
      lines.push('-'.repeat(40));
      for (const ss of report.screenshots) {
        lines.push(`- ${ss.stepName}: ${ss.path}`);
      }
      lines.push('');
    }
    
    // Network errors section
    const networkErrors = report.networkLogs.filter(l => l.error || (l.status && l.status >= 400));
    if (networkErrors.length > 0) {
      lines.push('NETWORK ERRORS');
      lines.push('-'.repeat(40));
      for (const log of networkErrors) {
        const status = log.status ? `${log.status}` : 'ERROR';
        const error = log.error ? ` - ${log.error}` : '';
        lines.push(`${log.method} ${log.url} - ${status}${error}`);
      }
      lines.push('');
    }
    
    // Console errors section
    const consoleErrors = report.consoleLogs.filter(l => l.type === 'error');
    if (consoleErrors.length > 0) {
      lines.push('CONSOLE ERRORS');
      lines.push('-'.repeat(40));
      for (const log of consoleErrors) {
        lines.push(`[${log.timestamp.toISOString()}] ${log.message}`);
      }
      lines.push('');
    }
    
    lines.push('='.repeat(60));
    lines.push('END OF REPORT');
    lines.push('='.repeat(60));
    
    return lines.join('\n');
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(report: RunReport): string {
    const statusColor = report.summary.status === 'passed' ? '#22c55e' : '#ef4444';
    const statusBg = report.summary.status === 'passed' ? '#dcfce7' : '#fee2e2';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flowmind Report - ${report.summary.flowName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: white; padding: 30px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header h1 { font-size: 24px; margin-bottom: 10px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 600; color: ${statusColor}; background: ${statusBg}; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-top: 20px; }
    .stat { background: #f9f9f9; padding: 15px; border-radius: 6px; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: 600; }
    .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .section h2 { font-size: 18px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
    .failure { background: #fee2e2; padding: 15px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #ef4444; }
    .failure h3 { color: #dc2626; margin-bottom: 5px; }
    .failure pre { background: #fef2f2; padding: 10px; border-radius: 4px; margin-top: 10px; font-size: 13px; overflow-x: auto; }
    .log-entry { padding: 8px 12px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 13px; }
    .log-error { background: #fef2f2; }
    .log-warn { background: #fefce8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Flowmind Test Report</h1>
      <p><strong>Flow:</strong> ${report.summary.flowName}</p>
      <p><strong>Status:</strong> <span class="status">${report.summary.status.toUpperCase()}</span></p>
      <p><strong>Duration:</strong> ${this.formatDuration(report.summary.duration)}</p>
      <p><strong>Started:</strong> ${report.summary.startedAt.toISOString()}</p>
      ${report.summary.completedAt ? `<p><strong>Completed:</strong> ${report.summary.completedAt.toISOString()}</p>` : ''}
      
      <div class="summary">
        <div class="stat">
          <div class="stat-label">Total Steps</div>
          <div class="stat-value">${report.summary.totalSteps}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Passed</div>
          <div class="stat-value" style="color: #22c55e;">${report.summary.passedSteps}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Failed</div>
          <div class="stat-value" style="color: #ef4444;">${report.summary.failedSteps}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Pass Rate</div>
          <div class="stat-value">${report.summary.passRate.toFixed(1)}%</div>
        </div>
      </div>
    </div>
    
    ${report.failures.length > 0 ? `
    <div class="section">
      <h2>Failures (${report.failures.length})</h2>
      ${report.failures.map(f => `
        <div class="failure">
          <h3>${f.nodeName}</h3>
          <p><strong>Type:</strong> ${f.errorType}</p>
          <p><strong>Message:</strong> ${f.message}</p>
          ${f.expected ? `<p><strong>Expected:</strong> ${f.expected}</p>` : ''}
          ${f.actual ? `<p><strong>Actual:</strong> ${f.actual}</p>` : ''}
          ${f.screenshot ? `<p><strong>Screenshot:</strong> <a href="file://${f.screenshot}">View</a></p>` : ''}
          ${f.networkError ? `<pre>Network Error:\n${f.networkError}</pre>` : ''}
          ${f.consoleError ? `<pre>Console Error:\n${f.consoleError}</pre>` : ''}
          ${f.suggestions.length > 0 ? `<p><strong>Suggestions:</strong></p><ul>${f.suggestions.map(s => `<li>${s}</li>`).join('')}</ul>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    ${report.screenshots.length > 0 ? `
    <div class="section">
      <h2>Screenshots</h2>
      <div class="grid">
        ${report.screenshots.map(s => `
          <div>
            <p><strong>${s.stepName}</strong></p>
            <img src="file://${s.path}" alt="${s.stepName}" style="max-width: 100%; border-radius: 4px;">
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
    
    ${report.networkLogs.filter(l => l.error || (l.status && l.status >= 400)).length > 0 ? `
    <div class="section">
      <h2>Network Errors</h2>
      ${report.networkLogs
        .filter(l => l.error || (l.status && l.status >= 400))
        .map(l => `
        <div class="log-entry log-error">
          ${l.method} ${l.url} - ${l.status || 'ERROR'} ${l.error || ''}
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    ${report.consoleLogs.filter(l => l.type === 'error').length > 0 ? `
    <div class="section">
      <h2>Console Errors</h2>
      ${report.consoleLogs
        .filter(l => l.type === 'error')
        .map(l => `
        <div class="log-entry log-error">
          [${l.timestamp.toISOString()}] ${l.message}
        </div>
      `).join('')}
    </div>
    ` : ''}
  </div>
</body>
</html>`;
  }

  /**
   * Save report to file
   */
  async saveReport(report: RunReport, format: 'json' | 'html' | 'md' = 'json'): Promise<string> {
    const runDir = path.join(this.config.outputDir, report.run.id);
    
    let content: string;
    let extension: string;
    
    switch (format) {
      case 'html':
        content = this.generateHtmlReport(report);
        extension = 'html';
        break;
      case 'md':
        content = this.generateMarkdownReport(report);
        extension = 'md';
        break;
      default:
        content = JSON.stringify(report, null, 2);
        extension = 'json';
    }
    
    const filePath = path.join(runDir, `report.${extension}`);
    await fs.promises.writeFile(filePath, content, 'utf-8');
    
    return filePath;
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(report: RunReport): string {
    const lines: string[] = [];
    
    lines.push(`# Flowmind Test Report: ${report.summary.flowName}`);
    lines.push('');
    lines.push(`## Summary`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Status | ${report.summary.status.toUpperCase()} |`);
    lines.push(`| Duration | ${this.formatDuration(report.summary.duration)} |`);
    lines.push(`| Total Steps | ${report.summary.totalSteps} |`);
    lines.push(`| Passed | ${report.summary.passedSteps} |`);
    lines.push(`| Failed | ${report.summary.failedSteps} |`);
    lines.push(`| Pass Rate | ${report.summary.passRate.toFixed(1)}% |`);
    lines.push('');
    
    if (report.failures.length > 0) {
      lines.push(`## Failures`);
      lines.push('');
      for (const failure of report.failures) {
        lines.push(`### ${failure.nodeName}`);
        lines.push('');
        lines.push(`- **Type:** ${failure.errorType}`);
        lines.push(`- **Message:** ${failure.message}`);
        if (failure.expected) lines.push(`- **Expected:** ${failure.expected}`);
        if (failure.actual) lines.push(`- **Actual:** ${failure.actual}`);
        if (failure.screenshot) lines.push(`- **Screenshot:** ${failure.screenshot}`);
        if (failure.networkError) lines.push(`- **Network Error:** ${failure.networkError}`);
        if (failure.suggestions.length > 0) {
          lines.push(`- **Suggestions:**`);
          for (const s of failure.suggestions) {
            lines.push(`  - ${s}`);
          }
        }
        lines.push('');
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Summarize failures for display
   */
  private summarizeFailures(failures: StepFailureReport[]): string {
    if (failures.length === 0) return '';
    if (failures.length === 1) {
      return `Failed at: ${failures[0].nodeName} - ${failures[0].message}`;
    }
    return `${failures.length} failures. First: ${failures[0].nodeName} - ${failures[0].message}`;
  }

  /**
   * Format duration
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
