/**
 * Execution Engine - Replay flows using Playwright
 */

import { type Flow, type FlowNode, type FlowEdge, findOutgoingEdges } from '@flowmind/core';
import { type GraphState, findNode, findBestMatch, type MatchContext } from '@flowmind/memory';
import { sanitize, sanitizeNetworkLog, sanitizeConsoleLog } from '@flowmind/privacy';
import { executeAction, type ActionResult } from './actions';
import { validateTransition, type ValidationResult } from './validation';
import type { StepResult, ConsoleLog, NetworkLog, StepError, StepStatus } from '@flowmind/core';
import type { Page, Browser, BrowserContext } from 'playwright';

export interface ExecutionConfig {
  baseUrl?: string;
  timeout: number;
  screenshotOnFailure: boolean;
  screenshotOnSuccess: boolean;
  captureConsole: boolean;
  captureNetwork: boolean;
  headless: boolean;
  viewport?: { width: number; height: number };
  slots?: Record<string, string>;
}

const DEFAULT_CONFIG: Required<ExecutionConfig> = {
  baseUrl: '',
  timeout: 30000,
  screenshotOnFailure: true,
  screenshotOnSuccess: false,
  captureConsole: true,
  captureNetwork: true,
  headless: true,
  viewport: { width: 1280, height: 720 },
  slots: {},
};

export interface ExecutionContext {
  page: Page;
  browser: Browser;
  context: BrowserContext;
  config: Required<ExecutionConfig>;
  state: {
    currentNodeId: string | null;
    consoleLogs: ConsoleLog[];
    networkLogs: NetworkLog[];
    screenshots: string[];
    startTime: number;
  };
}

export interface ExecutionResult {
  success: boolean;
  completedNodeId?: string;
  steps: StepResult[];
  error?: {
    nodeId: string;
    type: string;
    message: string;
    expected?: string;
    actual?: string;
    screenshot?: string;
    networkError?: string;
  };
  duration: number;
}

/**
 * Execute a flow
 */
export async function executeFlow(
  flow: Flow,
  browser: Browser,
  config: Partial<ExecutionConfig> = {}
): Promise<ExecutionResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const steps: StepResult[] = [];
  
  // Create context
  const context = await browser.newContext({
    headless: finalConfig.headless,
    viewport: finalConfig.viewport,
  });
  
  const page = await context.newPage();
  
  const execContext: ExecutionContext = {
    page,
    browser,
    context,
    config: finalConfig,
    state: {
      currentNodeId: flow.startNodeId,
      consoleLogs: [],
      networkLogs: [],
      screenshots: [],
      startTime,
    },
  };

  // Set up listeners
  if (finalConfig.captureConsole) {
    setupConsoleCapture(execContext);
  }
  
  if (finalConfig.captureNetwork) {
    setupNetworkCapture(execContext);
  }

  try {
    // Execute from start node
    let currentNodeId = flow.startNodeId;
    
    while (currentNodeId) {
      const node = findNode({ flow, currentNodeId } as GraphState, currentNodeId);
      
      if (!node) {
        throw new Error(`Node not found: ${currentNodeId}`);
      }

      // Handle different node types
      if (node.type === 'start') {
        // Just move to next node
        const edges = findOutgoingEdges(flow.edges, currentNodeId);
        currentNodeId = edges[0]?.target || null;
        continue;
      }

      if (node.type === 'end') {
        // Flow completed successfully
        return {
          success: true,
          completedNodeId: currentNodeId,
          steps,
          duration: Date.now() - startTime,
        };
      }

      // Execute screen or action node
      const stepResult = await executeNode(execContext, node, flow);
      steps.push(stepResult);

      // Check step result
      if (stepResult.status === 'failed') {
        // Capture failure screenshot
        if (finalConfig.screenshotOnFailure) {
          const screenshot = await page.screenshot({ fullPage: true });
          stepResult.screenshot = `data:image/png;base64,${screenshot.toString('base64')}`;
          const screenshotPath = saveScreenshot(flow.id, stepResult.id, screenshot);
          stepResult.screenshot = screenshotPath;
        }

        // Find network error if any
        const networkError = stepResult.networkLogs
          .filter(l => l.error || (l.status && l.status >= 400))
          .map(l => `${l.method} ${l.url} - ${l.error || l.status}`)
          .join('\n');

        return {
          success: false,
          completedNodeId: currentNodeId,
          steps,
          error: {
            nodeId: stepResult.nodeId,
            type: stepResult.error?.type || 'unknown',
            message: stepResult.error?.message || 'Step failed',
            expected: stepResult.error?.expected,
            actual: stepResult.error?.actual,
            screenshot: stepResult.screenshot,
            networkError: networkError || undefined,
          },
          duration: Date.now() - startTime,
        };
      }

      // Determine next node
      const edges = findOutgoingEdges(flow.edges, currentNodeId);
      
      if (edges.length === 0) {
        // No outgoing edges, flow ends
        return {
          success: true,
          completedNodeId: currentNodeId,
          steps,
          duration: Date.now() - startTime,
        };
      }

      // For now, just take the first edge (deterministic)
      // In future, could implement conditional branching
      currentNodeId = edges[0].target;
    }

    return {
      success: true,
      steps,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Capture screenshot on unexpected error
    let screenshot: string | undefined;
    if (finalConfig.screenshotOnFailure) {
      try {
        const ss = await page.screenshot({ fullPage: true });
        screenshot = saveScreenshot(flow.id, 'error', ss);
      } catch {
        // Ignore screenshot errors
      }
    }

    return {
      success: false,
      steps,
      error: {
        nodeId: execContext.state.currentNodeId || 'unknown',
        type: 'internal',
        message: errorMessage,
        screenshot,
      },
      duration: Date.now() - startTime,
    };
  } finally {
    await context.close();
  }
}

/**
 * Execute a single node
 */
async function executeNode(
  execContext: ExecutionContext,
  node: FlowNode,
  flow: Flow
): Promise<StepResult> {
  const startTime = Date.now();
  
  const step: StepResult = {
    id: crypto.randomUUID(),
    nodeId: node.id,
    nodeName: node.label,
    status: 'running',
    startedAt: new Date(),
    consoleLogs: [],
    networkLogs: [...execContext.state.consoleLogs],
  };

  try {
    if (node.type === 'screen') {
      // Screen nodes - validate we're on the right page
      if (node.data.url) {
        const url = execContext.config.baseUrl 
          ? `${execContext.config.baseUrl}${node.data.url}`
          : node.data.url;
        
        // Navigate if needed
        if (!execContext.state.currentNodeId) {
          await execContext.page.goto(url, { timeout: execContext.config.timeout });
        } else {
          const currentUrl = execContext.page.url();
          if (!currentUrl.includes(node.data.url)) {
            await execContext.page.goto(url, { timeout: execContext.config.timeout });
          }
        }
      }
    }

    if (node.type === 'action') {
      // Action nodes - execute the action
      const result = await executeAction(execContext, node);
      
      if (!result.success) {
        step.status = 'failed';
        step.error = result.error;
      } else {
        step.status = 'passed';
      }
    }

    // Validate transition if edge guard exists
    const edges = findOutgoingEdges(flow.edges, node.id);
    for (const edge of edges) {
      if (edge.guard?.condition) {
        const validation = await validateTransition(execContext, edge.guard.condition);
        if (!validation.valid) {
          // Log warning but continue
          step.status = 'warning';
        }
      }
    }

    // Take screenshot if configured
    if (execContext.config.screenshotOnSuccess && step.status === 'passed') {
      const screenshot = await execContext.page.screenshot({ fullPage: true });
      step.screenshot = saveScreenshot(flow.id, step.id, screenshot);
    }

    // Update state
    execContext.state.currentNodeId = node.id;
    step.consoleLogs = execContext.state.consoleLogs.map(sanitizeConsoleLog);
    step.networkLogs = execContext.state.networkLogs.map(sanitizeNetworkLog);

  } catch (error) {
    step.status = 'failed';
    step.error = {
      type: 'action_failed',
      message: error instanceof Error ? error.message : String(error),
      recoverable: false,
    };
  }

  step.completedAt = new Date();
  step.duration = Date.now() - startTime;

  return step;
}

/**
 * Set up console capture
 */
function setupConsoleCapture(execContext: ExecutionContext): void {
  execContext.page.on('console', (msg) => {
    const log: ConsoleLog = {
      timestamp: Date.now(),
      type: msg.type() as ConsoleLog['type'],
      message: msg.text(),
      location: msg.location()?.url,
    };
    
    // Sanitize before storing
    execContext.state.consoleLogs.push(sanitizeConsoleLog(log));
  });

  execContext.page.on('pageerror', (error) => {
    const log: ConsoleLog = {
      timestamp: Date.now(),
      type: 'error',
      message: error.message,
      stack: error.stack,
    };
    execContext.state.consoleLogs.push(sanitizeConsoleLog(log));
  });
}

/**
 * Set up network capture
 */
function setupNetworkCapture(execContext: ExecutionContext): void {
  execContext.page.on('request', (request) => {
    const log: NetworkLog = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      method: request.method(),
      url: sanitize(request.url()).value,
      requestHeaders: Object.fromEntries(
        Object.entries(request.headers()).map(([k, v]) => [
          k,
          typeof v === 'string' ? sanitize(v).value : String(v),
        ])
      ),
      requestBody: request.postDataBuffer()?.toString(),
      type: request.resourceType() as NetworkLog['type'],
    };
    execContext.state.networkLogs.push(log);
  });

  execContext.page.on('response', (response) => {
    const logs = execContext.state.networkLogs;
    const lastLog = logs[logs.length - 1];
    
    if (lastLog && lastLog.url === response.url()) {
      lastLog.status = response.status();
      lastLog.statusText = response.statusText();
      lastLog.responseHeaders = response.headers();
      
      // Only capture response body for error status codes (to save memory)
      if (response.status() >= 400) {
        response.text().then((body) => {
          lastLog.responseBody = sanitize(body).value;
        }).catch(() => {});
      }
    }
  });

  execContext.page.on('requestfailed', (request) => {
    const logs = execContext.state.networkLogs;
    const lastLog = logs[logs.length - 1];
    
    if (lastLog && lastLog.url === request.url()) {
      lastLog.error = request.failure()?.errorText;
    }
  });
}

/**
 * Save screenshot to disk
 */
function saveScreenshot(flowId: string, stepId: string, buffer: Buffer): string {
  const fs = require('fs');
  const path = require('path');
  
  const dir = path.join(
    process.env.HOME || '.',
    '.flowmind',
    'runs',
    flowId,
    'screenshots'
  );
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const filePath = path.join(dir, `${stepId}.png`);
  fs.writeFileSync(filePath, buffer);
  
  return filePath;
}
