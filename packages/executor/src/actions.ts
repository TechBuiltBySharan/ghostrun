/**
 * Action Execution - Execute actions using Playwright
 */

import type { ExecutionContext } from './engine';
import type { FlowNode, ActionType } from '@flowmind/core';
import { sanitize } from '@flowmind/privacy';

export interface ActionResult {
  success: boolean;
  error?: {
    type: string;
    message: string;
    selector?: string;
    expected?: string;
    actual?: string;
    recoverable: boolean;
    suggestions?: string[];
  };
}

/**
 * Execute action on a node
 */
export async function executeAction(
  execContext: ExecutionContext,
  node: FlowNode
): Promise<ActionResult> {
  const { action, selector, selectorType, value, slotId } = node.data;
  
  if (!action) {
    return { success: true };
  }

  // Resolve value (check slots)
  let resolvedValue = value;
  if (slotId && execContext.config.slots[slotId]) {
    resolvedValue = execContext.config.slots[slotId];
  } else if (slotId && !resolvedValue) {
    return {
      success: false,
      error: {
        type: 'slot_missing',
        message: `Required slot "${slotId}" was not provided`,
        recoverable: false,
        suggestions: [`Provide a value for slot "${slotId}" in the flow configuration`],
      },
    };
  }

  // Sanitize value before using
  const sanitizedValue = resolvedValue ? sanitize(resolvedValue).value : undefined;

  // Resolve selector
  const resolvedSelector = selector || getSelectorFromStrategies(node);

  // Execute action based on type
  switch (action) {
    case 'click':
      return await executeClick(execContext, resolvedSelector, selectorType);
    
    case 'dblclick':
      return await executeDblClick(execContext, resolvedSelector, selectorType);
    
    case 'rightclick':
      return await executeRightClick(execContext, resolvedSelector, selectorType);
    
    case 'type':
      return await executeType(execContext, resolvedSelector, selectorType, sanitizedValue);
    
    case 'fill':
      return await executeFill(execContext, resolvedSelector, selectorType, sanitizedValue);
    
    case 'select':
      return await executeSelect(execContext, resolvedSelector, selectorType, sanitizedValue);
    
    case 'check':
      return await executeCheck(execContext, resolvedSelector, selectorType);
    
    case 'uncheck':
      return await executeUncheck(execContext, resolvedSelector, selectorType);
    
    case 'hover':
      return await executeHover(execContext, resolvedSelector, selectorType);
    
    case 'press':
      return await executePress(execContext, sanitizedValue || 'Enter');
    
    case 'navigate':
      return await executeNavigate(execContext, sanitizedValue || resolvedSelector);
    
    case 'goback':
      return await executeGoBack(execContext);
    
    case 'goforward':
      return await executeGoForward(execContext);
    
    case 'refresh':
      return await executeRefresh(execContext);
    
    case 'wait':
      return await executeWait(execContext, parseInt(String(resolvedValue)) || 1000);
    
    case 'screenshot':
      return await executeScreenshot(execContext);
    
    default:
      return {
        success: false,
        error: {
          type: 'unknown_action',
          message: `Unknown action type: ${action}`,
          recoverable: false,
        },
      };
  }
}

/**
 * Execute click action
 */
async function executeClick(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    if (selector) {
      const locator = getLocator(page, selector, selectorType);
      await locator.click({ timeout: execContext.config.timeout });
    } else {
      // Click at current position or center of viewport
      await page.mouse.click(
        execContext.config.viewport.width / 2,
        execContext.config.viewport.height / 2
      );
    }
    return { success: true };
  } catch (error) {
    return createError('click_failed', error, selector);
  }
}

/**
 * Execute double click action
 */
async function executeDblClick(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    const locator = getLocator(page, selector!, selectorType);
    await locator.dblclick({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('dblclick_failed', error, selector);
  }
}

/**
 * Execute right click action
 */
async function executeRightClick(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    const locator = getLocator(page, selector!, selectorType);
    await locator.click({ button: 'right', timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('rightclick_failed', error, selector);
  }
}

/**
 * Execute type action (keyboard input)
 */
async function executeType(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined,
  value: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  if (!value) {
    return {
      success: false,
      error: {
        type: 'missing_value',
        message: 'Type action requires a value',
        recoverable: false,
      },
    };
  }
  
  try {
    const locator = getLocator(page, selector!, selectorType);
    await locator.click({ timeout: execContext.config.timeout });
    await page.keyboard.type(value, { delay: 50 });
    return { success: true };
  } catch (error) {
    return createError('type_failed', error, selector);
  }
}

/**
 * Execute fill action (replace value)
 */
async function executeFill(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined,
  value: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  if (!value) {
    return {
      success: false,
      error: {
        type: 'missing_value',
        message: 'Fill action requires a value',
        recoverable: false,
      },
    };
  }
  
  try {
    const locator = getLocator(page, selector!, selectorType);
    await locator.fill(value, { timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('fill_failed', error, selector);
  }
}

/**
 * Execute select action
 */
async function executeSelect(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined,
  value: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  if (!value) {
    return {
      success: false,
      error: {
        type: 'missing_value',
        message: 'Select action requires a value',
        recoverable: false,
      },
    };
  }
  
  try {
    const locator = getLocator(page, selector!, selectorType);
    await locator.selectOption(value, { timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('select_failed', error, selector);
  }
}

/**
 * Execute check action
 */
async function executeCheck(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    const locator = getLocator(page, selector!, selectorType);
    await locator.check({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('check_failed', error, selector);
  }
}

/**
 * Execute uncheck action
 */
async function executeUncheck(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    const locator = getLocator(page, selector!, selectorType);
    await locator.uncheck({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('uncheck_failed', error, selector);
  }
}

/**
 * Execute hover action
 */
async function executeHover(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    const locator = getLocator(page, selector!, selectorType);
    await locator.hover({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('hover_failed', error, selector);
  }
}

/**
 * Execute press action (key press)
 */
async function executePress(
  execContext: ExecutionContext,
  key: string
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    await page.keyboard.press(key);
    return { success: true };
  } catch (error) {
    return createError('press_failed', error);
  }
}

/**
 * Execute navigate action
 */
async function executeNavigate(
  execContext: ExecutionContext,
  url: string
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    // Resolve relative URLs
    let resolvedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      const baseUrl = execContext.config.baseUrl;
      resolvedUrl = baseUrl ? `${baseUrl}${url}` : url;
    }
    
    await page.goto(resolvedUrl, { timeout: execContext.config.timeout, waitUntil: 'domcontentloaded' });
    return { success: true };
  } catch (error) {
    return createError('navigation_failed', error, url);
  }
}

/**
 * Execute go back action
 */
async function executeGoBack(execContext: ExecutionContext): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    await page.goBack({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('goback_failed', error);
  }
}

/**
 * Execute go forward action
 */
async function executeGoForward(execContext: ExecutionContext): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    await page.goForward({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('goforward_failed', error);
  }
}

/**
 * Execute refresh action
 */
async function executeRefresh(execContext: ExecutionContext): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    await page.reload({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('refresh_failed', error);
  }
}

/**
 * Execute wait action
 */
async function executeWait(
  execContext: ExecutionContext,
  ms: number
): Promise<ActionResult> {
  await new Promise(resolve => setTimeout(resolve, ms));
  return { success: true };
}

/**
 * Execute screenshot action
 */
async function executeScreenshot(execContext: ExecutionContext): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    await page.screenshot();
    return { success: true };
  } catch (error) {
    return createError('screenshot_failed', error);
  }
}

/**
 * Get Playwright locator from selector
 */
function getLocator(
  page: import('playwright').Page,
  selector: string,
  selectorType?: string
): import('playwright').Locator {
  switch (selectorType) {
    case 'text':
      return page.getByText(selector);
    case 'role':
      return page.getByRole(selector as import('@playwright/test').AriaRole);
    case 'testid':
      return page.getByTestId(selector);
    case 'label':
      return page.getByLabel(selector);
    case 'placeholder':
      return page.getByPlaceholder(selector);
    default:
      return page.locator(selector);
  }
}

/**
 * Get selector from node strategies
 */
function getSelectorFromStrategies(node: FlowNode): string | undefined {
  const selectors = node.data.selectors || [];
  if (selectors.length > 0) {
    return selectors[0].value;
  }
  return undefined;
}

/**
 * Create standardized error result
 */
function createError(
  type: string,
  error: unknown,
  selector?: string | undefined
): ActionResult {
  const message = error instanceof Error ? error.message : String(error);
  
  let errorType = type;
  if (message.includes('locator')) {
    if (message.includes('not found') || message.includes('Timeout')) {
      errorType = 'element_not_found';
    } else if (message.includes('not visible')) {
      errorType = 'element_not_visible';
    }
  }
  
  return {
    success: false,
    error: {
      type: errorType,
      message,
      selector,
      recoverable: errorType === 'element_not_found',
      suggestions: generateSuggestions(errorType, selector),
    },
  };
}

/**
 * Generate suggestions based on error type
 */
function generateSuggestions(type: string, selector?: string): string[] {
  const suggestions: string[] = [];
  
  switch (type) {
    case 'element_not_found':
      suggestions.push('Verify the selector is correct');
      if (selector) suggestions.push(`Current selector: ${selector}`);
      suggestions.push('Wait for the element to appear with explicit waits');
      break;
    case 'element_not_visible':
      suggestions.push('Scroll the element into view');
      suggestions.push('Check if the element is hidden by CSS');
      break;
    case 'navigation_failed':
      suggestions.push('Check if the URL is correct');
      suggestions.push('Verify network connectivity');
      break;
  }
  
  return suggestions;
}
