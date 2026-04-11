/**
 * Report Formatter - Format test results for various outputs
 */

import type { FlowRun, StepResult, StepFailureReport, ConsoleLog, NetworkLog } from '@flowmind/core';

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format timestamp
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Format console log for display
 */
export function formatConsoleLog(log: ConsoleLog, includeTimestamp = true): string {
  const parts: string[] = [];
  
  if (includeTimestamp) {
    parts.push(`[${formatTimestamp(new Date(log.timestamp))}]`);
  }
  
  parts.push(`[${log.type.toUpperCase()}]`);
  parts.push(log.message);
  
  return parts.join(' ');
}

/**
 * Format network log for display
 */
export function formatNetworkLog(log: NetworkLog, includeBody = false): string {
  const parts: string[] = [];
  
  parts.push(`${log.method} ${log.url}`);
  
  if (log.status) {
    parts.push(`- ${log.status}`);
  }
  
  if (log.error) {
    parts.push(`ERROR: ${log.error}`);
  }
  
  if (log.timing?.duration) {
    parts.push(`(${log.timing.duration}ms)`);
  }
  
  return parts.join(' ');
}

/**
 * Format failure for display
 */
export function formatFailure(failure: StepFailureReport): string {
  const lines: string[] = [];
  
  lines.push(`❌ ${failure.nodeName}`);
  lines.push(`   Type: ${failure.errorType}`);
  lines.push(`   ${failure.message}`);
  
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
      lines.push(`     → ${suggestion}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Format step result for display
 */
export function formatStepResult(step: StepResult, index: number): string {
  const icon = step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : step.status === 'skipped' ? '○' : '●';
  const statusColor = step.status === 'passed' ? 'green' : step.status === 'failed' ? 'red' : 'yellow';
  
  let line = `${icon} Step ${index + 1}: ${step.nodeName}`;
  
  if (step.duration) {
    line += ` (${formatDuration(step.duration)})`;
  }
  
  if (step.status === 'failed' && step.error) {
    line += `\n   Error: ${step.error.message}`;
  }
  
  return line;
}

/**
 * Create ANSI-colored console output
 */
export function formatConsoleOutput(run: FlowRun): string {
  const lines: string[] = [];
  
  // Header
  const statusIcon = run.status === 'passed' ? '✓' : '✗';
  const statusText = run.status.toUpperCase();
  lines.push('');
  lines.push(`  ╔═══════════════════════════════════════════════════════════╗`);
  lines.push(`  ║  ${statusIcon} Flow: ${run.flowId.padEnd(48)}║`);
  lines.push(`  ║  Status: ${statusText.padEnd(47)}║`);
  lines.push(`  ║  Duration: ${formatDuration(run.duration || 0).padEnd(44)}║`);
  lines.push(`  ╚═══════════════════════════════════════════════════════════╝`);
  lines.push('');
  
  // Steps
  lines.push('  Steps:');
  run.steps.forEach((step, i) => {
    const stepLine = `    ${formatStepResult(step, i)}`;
    lines.push(stepLine);
  });
  lines.push('');
  
  // Summary
  const passed = run.summary.passedSteps;
  const failed = run.summary.failedSteps;
  const total = run.summary.totalSteps;
  
  lines.push('  Summary:');
  lines.push(`    Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  lines.push(`    Pass Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`);
  lines.push('');
  
  // Failures
  if (failed > 0) {
    lines.push('  Failed Steps:');
    run.steps
      .filter(s => s.status === 'failed')
      .forEach(step => {
        if (step.error) {
          lines.push(`    • ${step.nodeName}: ${step.error.message}`);
        }
      });
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Create JSON summary
 */
export function formatJSONSummary(run: FlowRun): string {
  return JSON.stringify({
    id: run.id,
    flowId: run.flowId,
    status: run.status,
    duration: run.duration,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString(),
    summary: {
      totalSteps: run.summary.totalSteps,
      passedSteps: run.summary.passedSteps,
      failedSteps: run.summary.failedSteps,
      passRate: run.summary.totalSteps > 0 
        ? (run.summary.passedSteps / run.summary.totalSteps) * 100 
        : 0,
    },
    failures: run.steps
      .filter(s => s.status === 'failed')
      .map(s => ({
        nodeId: s.nodeId,
        nodeName: s.nodeName,
        error: s.error,
      })),
  }, null, 2);
}

/**
 * Create JUnit XML format
 */
export function formatJUnitXML(run: FlowRun): string {
  const testCases = run.steps.map((step, i) => {
    const className = `Flowmind.Step${i + 1}`;
    const name = step.nodeName.replace(/"/g, '&quot;');
    const time = (step.duration || 0) / 1000;
    
    if (step.status === 'failed' && step.error) {
      return `    <testcase classname="${className}" name="${name}" time="${time}">
      <failure message="${step.error.message.replace(/"/g, '&quot;')}" type="${step.error.type}">
        ${step.error.message}
      </failure>
    </testcase>`;
    }
    
    return `    <testcase classname="${className}" name="${name}" time="${time}"/>`;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${run.flowId}" tests="${run.summary.totalSteps}" failures="${run.summary.failedSteps}" time="${(run.duration || 0) / 1000}">
${testCases}
</testsuite>`;
}

/**
 * Create CSV format for results
 */
export function formatCSV(runs: FlowRun[]): string {
  const headers = [
    'Run ID',
    'Flow ID',
    'Status',
    'Duration (ms)',
    'Total Steps',
    'Passed',
    'Failed',
    'Pass Rate (%)',
    'Started At',
  ];
  
  const rows = runs.map(run => [
    run.id,
    run.flowId,
    run.status,
    run.duration?.toString() || '0',
    run.summary.totalSteps.toString(),
    run.summary.passedSteps.toString(),
    run.summary.failedSteps.toString(),
    run.summary.totalSteps > 0 
      ? ((run.summary.passedSteps / run.summary.totalSteps) * 100).toFixed(1)
      : '0',
    run.startedAt.toISOString(),
  ]);
  
  return [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
