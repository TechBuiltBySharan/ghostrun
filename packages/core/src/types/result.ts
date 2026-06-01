import type { FlowNode } from './node';
import type { ActionType } from './action';

/**
 * Result of executing a single step
 */
export interface StepResult {
  id: string;
  nodeId: string;
  nodeName: string;
  status: StepStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // ms
  action?: {
    type: ActionType;
    selector?: string;
    value?: string;
  };
  screenshot?: string;
  consoleLogs: ConsoleLog[];
  networkLogs: NetworkLog[];
  error?: StepError;
  metadata?: Record<string, unknown>;
}

/**
 * Step execution status
 */
export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'warning';

/**
 * Console log entry
 */
export interface ConsoleLog {
  timestamp: number;
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  location?: string;
  args?: unknown[];
  stack?: string;
}

/**
 * Network request/response log
 */
export interface NetworkLog {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  timing?: {
    start: number;
    end: number;
    duration: number;
  };
  error?: string;
  type: 'xhr' | 'fetch' | 'document' | 'script' | 'stylesheet' | 'image' | 'font' | 'other';
}

/**
 * Step error information
 */
export interface StepError {
  type: StepErrorType;
  message: string;
  selector?: string;
  expected?: string;
  actual?: string;
  stack?: string;
  recoverable: boolean;
  suggestions?: string[];
}

/**
 * Step error types
 */
export type StepErrorType =
  | 'element_not_found'
  | 'element_not_visible'
  | 'element_not_enabled'
  | 'action_timeout'
  | 'action_failed'
  | 'navigation_timeout'
  | 'assertion_failed'
  | 'network_error'
  | 'slot_missing'
  | 'validation_failed'
  | 'unknown_action'
  | 'missing_value'
  | 'click_failed'
  | 'dblclick_failed'
  | 'rightclick_failed'
  | 'type_failed'
  | 'fill_failed'
  | 'select_failed'
  | 'check_failed'
  | 'uncheck_failed'
  | 'hover_failed'
  | 'press_failed'
  | 'goback_failed'
  | 'goforward_failed'
  | 'refresh_failed'
  | 'screenshot_failed'
  | 'unknown';

/**
 * Create a step result
 */
export function createStepResult(params: {
  nodeId: string;
  nodeName: string;
  action?: StepResult['action'];
}): StepResult {
  return {
    id: crypto.randomUUID(),
    nodeId: params.nodeId,
    nodeName: params.nodeName,
    status: 'pending',
    startedAt: new Date(),
    action: params.action,
    consoleLogs: [],
    networkLogs: [],
  };
}

/**
 * Complete a step result
 */
export function completeStepResult(
  step: StepResult,
  params: {
    status: StepStatus;
    screenshot?: string;
    error?: StepError;
    metadata?: Record<string, unknown>;
  }
): StepResult {
  const now = new Date();
  return {
    ...step,
    status: params.status,
    completedAt: now,
    duration: now.getTime() - step.startedAt.getTime(),
    screenshot: params.screenshot,
    error: params.error,
    metadata: params.metadata,
  };
}

/**
 * Serialize step result for storage
 */
export function serializeStepResult(step: StepResult): StepResult {
  return {
    ...step,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
  };
}

/**
 * Failure report for a step
 */
export interface StepFailureReport {
  stepId: string;
  nodeId: string;
  nodeName: string;
  errorType: StepErrorType;
  message: string;
  expected?: string;
  actual?: string;
  screenshot?: string;
  networkError?: string;
  consoleError?: string;
  timestamp: Date;
  suggestions: string[];
}

/**
 * Generate a human-readable failure report
 */
export function generateFailureReport(step: StepResult): StepFailureReport | null {
  if (step.status !== 'failed' || !step.error) {
    return null;
  }

  const consoleError = step.consoleLogs
    .filter(l => l.type === 'error')
    .map(l => l.message)
    .join('\n');

  const networkError = step.networkLogs
    .filter(l => l.error || (l.status && l.status >= 400))
    .map(l => `${l.method} ${l.url} - ${l.error || l.status} ${l.statusText}`)
    .join('\n');

  const suggestions = generateSuggestions(step.error);

  return {
    stepId: step.id,
    nodeId: step.nodeId,
    nodeName: step.nodeName,
    errorType: step.error.type,
    message: step.error.message,
    expected: step.error.expected,
    actual: step.error.actual,
    screenshot: step.screenshot,
    networkError: networkError || undefined,
    consoleError: consoleError || undefined,
    timestamp: step.startedAt,
    suggestions,
  };
}

/**
 * Generate suggestions based on error type
 */
function generateSuggestions(error: StepError): string[] {
  const suggestions: string[] = [];

  switch (error.type) {
    case 'element_not_found':
      suggestions.push('The target element was not found on the page');
      suggestions.push('Check if the element selector is correct');
      suggestions.push('Verify the page has fully loaded before the action');
      if (error.selector) {
        suggestions.push(`Current selector: ${error.selector}`);
      }
      break;
    case 'element_not_visible':
      suggestions.push('The element exists but is not visible');
      suggestions.push('Check if the element is hidden by CSS');
      suggestions.push('Verify the element is scrolled into view');
      break;
    case 'action_timeout':
      suggestions.push('The action took too long to complete');
      suggestions.push('Check network connectivity');
      suggestions.push('Consider increasing timeout settings');
      break;
    case 'navigation_timeout':
      suggestions.push('Page navigation did not complete in time');
      suggestions.push('Check if the target URL is correct');
      suggestions.push('Verify network connection');
      break;
    case 'network_error':
      suggestions.push('A network request failed');
      suggestions.push('Check API endpoints and CORS settings');
      break;
    case 'slot_missing':
      suggestions.push('A required slot value was not provided');
      suggestions.push('Provide values for all required slots before running');
      break;
    default:
      suggestions.push('Review the error message and stack trace');
      suggestions.push('Check application logs for more details');
  }

  return suggestions;
}
