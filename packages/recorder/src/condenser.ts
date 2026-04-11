/**
 * Action Condenser - Convert raw events into meaningful steps
 */

import type { RecordedAction, ActionType } from '@flowmind/core';

export interface CondensedStep {
  id: string;
  type: StepType;
  label: string;
  description: string;
  action?: {
    type: ActionType;
    selector?: string;
    selectorType?: string;
    value?: string;
  };
  navigation?: {
    url: string;
    expected?: string;
  };
  wait?: {
    for: 'element' | 'navigation' | 'networkidle' | 'timeout';
    target?: string;
    timeout?: number;
  };
  timestamp: number;
  duration?: number;
}

export type StepType = 
  | 'action'
  | 'navigation'
  | 'wait'
  | 'assertion'
  | 'screenshot';

/**
 * Condense raw actions into meaningful steps
 */
export function condenseActions(actions: RecordedAction[]): CondensedStep[] {
  const steps: CondensedStep[] = [];
  let currentNavigation: { url: string; timestamp: number } | null = null;
  let currentWait: CondensedStep['wait'] | null = null;

  for (const action of actions) {
    // Check for navigation (URL change)
    if (isNavigationAction(action)) {
      if (currentNavigation) {
        // Close previous navigation
        steps.push(createNavigationStep(currentNavigation.url, currentNavigation.timestamp, action.timestamp));
      }
      currentNavigation = { url: action.target.selector.strategies[0]?.value || '', timestamp: action.timestamp };
      currentWait = { for: 'navigation', timeout: 30000 };
      continue;
    }

    // Add pending navigation if exists
    if (currentNavigation) {
      steps.push(createNavigationStep(currentNavigation.url, currentNavigation.timestamp, action.timestamp));
      currentNavigation = null;
    }

    // Handle waits
    if (action.type === 'wait' || action.type === 'press') {
      currentWait = {
        for: 'timeout',
        timeout: action.value === 'Enter' ? 100 : 1000,
      };
      continue;
    }

    // Skip very fast sequential clicks on same element (debounce)
    const lastStep = steps[steps.length - 1];
    if (lastStep && lastStep.type === 'action' && action.type === 'click') {
      const lastAction = lastStep.action;
      const currentSelector = getBestSelector(action.target.selector);
      if (lastAction?.selector === currentSelector && action.timestamp - lastStep.timestamp < 500) {
        continue; // Skip duplicate rapid clicks
      }
    }

    // Add wait step if pending
    if (currentWait) {
      steps.push({
        id: crypto.randomUUID(),
        type: 'wait',
        label: 'Wait',
        description: `Wait for ${currentWait.for}`,
        wait: currentWait,
        timestamp: action.timestamp - 1,
      });
      currentWait = null;
    }

    // Create action step
    steps.push(createActionStep(action));
  }

  // Add any remaining navigation
  if (currentNavigation) {
    steps.push(createNavigationStep(currentNavigation.url, currentNavigation.timestamp, Date.now()));
  }

  return steps;
}

/**
 * Check if action is a navigation
 */
function isNavigationAction(action: RecordedAction): boolean {
  // Navigation typically has a URL as the selector value
  const selector = getBestSelector(action.target.selector);
  return selector.startsWith('http://') || selector.startsWith('https://') || selector.startsWith('/');
}

/**
 * Create an action step from recorded action
 */
function createActionStep(action: RecordedAction): CondensedStep {
  const selector = getBestSelector(action.target.selector);
  const selectorType = getSelectorType(action.target.selector);
  const element = action.target.element;
  const text = element?.text?.trim() || selector;

  let label: string;
  let description: string;

  switch (action.type) {
    case 'click':
    case 'dblclick':
    case 'rightclick':
      label = `Click ${truncate(text, 30)}`;
      description = element?.role 
        ? `Click ${element.role} "${truncate(text, 50)}"`
        : `Click element ${selector}`;
      break;
    case 'type':
      label = `Type "${truncate(action.value || '', 20)}"`;
      description = `Type "${truncate(action.value || '', 100)}" into ${selector}`;
      break;
    case 'fill':
      label = `Fill "${truncate(action.value || '', 20)}"`;
      description = `Fill "${truncate(action.value || '', 100)}" into ${selector}`;
      break;
    case 'select':
      label = `Select "${action.value}"`;
      description = `Select option "${action.value}" in ${selector}`;
      break;
    case 'check':
      label = 'Check';
      description = `Check ${selector}`;
      break;
    case 'uncheck':
      label = 'Uncheck';
      description = `Uncheck ${selector}`;
      break;
    case 'hover':
      label = `Hover ${truncate(text, 30)}`;
      description = `Hover over ${selector}`;
      break;
    case 'press':
      label = `Press ${action.value}`;
      description = `Press key "${action.value}"`;
      break;
    case 'scroll':
      label = 'Scroll';
      description = 'Scroll page';
      break;
    case 'screenshot':
      label = 'Screenshot';
      description = 'Capture screenshot';
      break;
    case 'navigate':
      label = 'Navigate';
      description = `Navigate to ${selector}`;
      break;
    default:
      label = action.type;
      description = `Perform ${action.type} on ${selector}`;
  }

  return {
    id: action.id,
    type: 'action',
    label,
    description,
    action: {
      type: action.type,
      selector,
      selectorType,
      value: action.value,
    },
    timestamp: action.timestamp,
  };
}

/**
 * Create a navigation step
 */
function createNavigationStep(url: string, startTime: number, endTime: number): CondensedStep {
  // Extract readable path from URL
  let path = url;
  try {
    const parsed = new URL(url);
    path = parsed.pathname + parsed.search;
    if (path === '/') path = parsed.hostname;
  } catch {
    // Use as-is
  }

  return {
    id: crypto.randomUUID(),
    type: 'navigation',
    label: `Go to ${truncate(path, 40)}`,
    description: `Navigate to ${url}`,
    navigation: {
      url,
    },
    timestamp: startTime,
    duration: endTime - startTime,
  };
}

/**
 * Get best selector from strategies
 */
function getBestSelector(selector: { strategies: Array<{ type: string; value: string }> }): string {
  if (!selector.strategies || selector.strategies.length === 0) {
    return '';
  }
  // Return first (highest priority) strategy
  return selector.strategies[0].value;
}

/**
 * Get selector type
 */
function getSelectorType(selector: { strategies: Array<{ type: string; value: string }> }): string {
  if (!selector.strategies || selector.strategies.length === 0) {
    return 'css';
  }
  return selector.strategies[0].type;
}

/**
 * Truncate string
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Merge similar sequential actions
 */
export function mergeSimilarActions(steps: CondensedStep[]): CondensedStep[] {
  const merged: CondensedStep[] = [];

  for (const step of steps) {
    const last = merged[merged.length - 1];

    // Merge consecutive fills into same field
    if (
      last &&
      last.type === 'action' &&
      step.type === 'action' &&
      last.action?.selector === step.action?.selector &&
      last.action?.type === 'type' &&
      step.action?.type === 'type'
    ) {
      merged.pop();
      merged.push({
        ...last,
        label: `Type "${truncate((last.action?.value || '') + (step.action?.value || ''), 20)}"`,
        description: `Type into ${last.action?.selector}`,
        action: {
          ...last.action!,
          value: (last.action?.value || '') + (step.action?.value || ''),
        },
        timestamp: last.timestamp,
      });
      continue;
    }

    merged.push(step);
  }

  return merged;
}

/**
 * Add implicit waits between steps
 */
export function addImplicitWaits(steps: CondensedStep[], minGap = 500): CondensedStep[] {
  const result: CondensedStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nextStep = steps[i + 1];

    result.push(step);

    // Add wait between steps if gap is significant
    if (nextStep && step.type === 'action' && nextStep.type === 'navigation') {
      result.push({
        id: crypto.randomUUID(),
        type: 'wait',
        label: 'Wait for navigation',
        description: 'Wait for page to load after navigation',
        wait: { for: 'networkidle', timeout: 30000 },
        timestamp: step.timestamp + 1,
      });
    }
  }

  return result;
}

/**
 * Generate flow summary from condensed steps
 */
export function generateFlowSummary(steps: CondensedStep[]): {
  actionCount: number;
  navigationCount: number;
  waitCount: number;
  estimatedDuration: number;
  keyActions: string[];
} {
  const actionCount = steps.filter(s => s.type === 'action').length;
  const navigationCount = steps.filter(s => s.type === 'navigation').length;
  const waitCount = steps.filter(s => s.type === 'wait').length;
  
  // Estimate duration based on actions and navigations
  const estimatedDuration = 
    actionCount * 500 + // 500ms per action
    navigationCount * 3000 + // 3s per navigation
    waitCount * 1000; // 1s per wait

  // Get key actions (first 5 non-trivial actions)
  const keyActions = steps
    .filter(s => s.type === 'action' && !['hover', 'screenshot'].includes(s.action?.type || ''))
    .slice(0, 5)
    .map(s => s.label);

  return {
    actionCount,
    navigationCount,
    waitCount,
    estimatedDuration,
    keyActions,
  };
}
