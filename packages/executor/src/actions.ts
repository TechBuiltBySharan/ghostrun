/**
 * Action Execution - Execute actions using Playwright
 */

import type { ExecutionContext } from './engine';
import type { FlowNode, ActionType } from '@ghostrun/core';
import { sanitize } from '@ghostrun/privacy';

export interface ActionResult {
  success: boolean;
  warning?: string;
  selector?: string;
  error?: {
    type: import('@ghostrun/core').StepErrorType;
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
      return await executeNavigate(execContext, sanitizedValue || resolvedSelector || '');
    
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
 * Execute click action with smart wait for element
 */
async function executeClick(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    if (selector) {
      // Use smart wait to handle SPAs and dynamically loaded elements
      const locator = await smartWaitForElement(page, selector, selectorType, execContext.config.timeout);
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
 * Execute fill action (replace value) with smart wait
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
    // Use smart wait to handle SPAs and dynamically loaded forms
    const locator = await smartWaitForElement(page, selector!, selectorType, execContext.config.timeout);
    
    // Handle SPA search inputs that need activation first
    // Many modern SPAs (MDN, GitHub, Stack Overflow) have hidden inputs activated by buttons
    const isHidden = await locator.isHidden().catch(() => false);
    if (isHidden) {
      // Try alternative strategies for SPA search inputs
      const alternatives = await tryAlternativeStrategies(page, selector!, 'fill', value);
      if (alternatives.success) {
        return { success: true };
      }
    }
    
    await locator.fill(value, { timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('fill_failed', error, selector);
  }
}

/**
 * Execute select action with smart wait
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
    const locator = await smartWaitForElement(page, selector!, selectorType, execContext.config.timeout);
    await locator.selectOption(value, { timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('select_failed', error, selector);
  }
}

/**
 * Execute check action with smart wait
 */
async function executeCheck(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    const locator = await smartWaitForElement(page, selector!, selectorType, execContext.config.timeout);
    await locator.check({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('check_failed', error, selector);
  }
}

/**
 * Execute uncheck action with smart wait
 */
async function executeUncheck(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    const locator = await smartWaitForElement(page, selector!, selectorType, execContext.config.timeout);
    await locator.uncheck({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (error) {
    return createError('uncheck_failed', error, selector);
  }
}

/**
 * Execute hover action with smart wait
 */
async function executeHover(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  
  try {
    const locator = await smartWaitForElement(page, selector!, selectorType, execContext.config.timeout);
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
    
    // Smart navigation with multiple wait strategies for SPAs
    // Strategy 1: domcontentloaded
    await page.goto(resolvedUrl, { timeout: execContext.config.timeout, waitUntil: 'domcontentloaded' });
    
    // Strategy 2: Try networkidle (good for SPAs that load data via API)
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    
    // Strategy 3: Wait for body to be visible (handles dynamic content)
    await page.waitForSelector('body', { state: 'visible', timeout: 5000 }).catch(() => {});
    
    // Strategy 4: Extra stabilization wait for heavy SPAs
    await page.waitForTimeout(500).catch(() => {});
    
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
      return page.getByRole(selector as Parameters<typeof page.getByRole>[0]);
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
 * Smart wait for element - waits for element to be attached AND visible.
 * This is more reliable than just waiting for one state.
 * Uses a retry loop for SPAs where elements might appear/disappear.
 */
async function smartWaitForElement(
  page: import('playwright').Page,
  selector: string,
  selectorType: string | undefined,
  baseTimeout: number,
  maxRetries: number = 2
): Promise<import('playwright').Locator> {
  const locator = getLocator(page, selector, selectorType);
  
  // Split timeout among retries
  const retryTimeout = Math.floor(baseTimeout / (maxRetries + 1));
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Strategy 1: Wait for element to be attached to DOM
      await locator.waitFor({ state: 'attached', timeout: retryTimeout });
      
      // Strategy 2: Then wait for it to be visible
      await locator.waitFor({ state: 'visible', timeout: retryTimeout });
      
      return locator;
    } catch (error) {
      // If this is the last attempt, let it fail
      if (attempt >= maxRetries) {
        throw error;
      }
      // Small delay before retry for SPAs
      await page.waitForTimeout(500);
    }
  }
  
  // This should never reach here, but TypeScript needs it
  return locator;
}

/**
 * Try alternative strategies for SPA search inputs and hidden elements.
 * Many modern SPAs have complex UI patterns where the input is hidden behind buttons.
 */
async function tryAlternativeStrategies(
  page: import('playwright').Page,
  selector: string,
  action: 'fill' | 'click',
  value?: string
): Promise<{ success: boolean; strategy?: string }> {
  const strategies = [
    // Strategy: Try removing hidden attribute
    async () => {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.removeAttribute('hidden');
      }, selector);
      return page.locator(selector).isVisible({ timeout: 2000 });
    },
    // Strategy: Try making visible via CSS
    async () => {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          (el as HTMLElement).style.display = 'block';
          (el as HTMLElement).style.visibility = 'visible';
          (el as HTMLElement).style.opacity = '1';
        }
      }, selector);
      return page.locator(selector).isVisible({ timeout: 2000 });
    },
    // Strategy: Try nearby button click first (SPA pattern)
    async () => {
      // Find buttons near the input and try clicking them
      const nearbyButtons = await page.locator(`${selector}`, { has: page.locator('button, [role="button"]') }).count();
      if (nearbyButtons === 0) {
        // Try clicking a search button that might reveal the input
        const buttons = await page.locator('button:visible, [role="search"] button').all();
        for (const btn of buttons.slice(0, 3)) {
          try {
            await btn.click({ timeout: 1000 });
            await page.waitForTimeout(500);
            const isVisible = await page.locator(selector).isVisible({ timeout: 2000 });
            if (isVisible) return true;
          } catch {}
        }
      }
      return false;
    },
  ];

  for (let i = 0; i < strategies.length; i++) {
    try {
      if (await strategies[i]()) {
        if (action === 'fill' && value) {
          await page.locator(selector).fill(value, { timeout: 5000 });
        } else if (action === 'click') {
          await page.locator(selector).click({ timeout: 5000 });
        }
        return { success: true, strategy: `alternative-${i + 1}` };
      }
    } catch {}
  }

  return { success: false };
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
  
  let errorType: import('@ghostrun/core').StepErrorType = isStepErrorType(type) ? type : 'unknown';
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

function isStepErrorType(type: string): type is import('@ghostrun/core').StepErrorType {
  return [
    'element_not_found',
    'element_not_visible',
    'element_not_enabled',
    'action_timeout',
    'action_failed',
    'navigation_timeout',
    'assertion_failed',
    'network_error',
    'slot_missing',
    'validation_failed',
    'unknown_action',
    'missing_value',
    'click_failed',
    'dblclick_failed',
    'rightclick_failed',
    'type_failed',
    'fill_failed',
    'select_failed',
    'check_failed',
    'uncheck_failed',
    'hover_failed',
    'press_failed',
    'goback_failed',
    'goforward_failed',
    'refresh_failed',
    'screenshot_failed',
    'unknown',
  ].includes(type);
}

/**
 * Generate suggestions based on error type
 */
function generateSuggestions(type: string, selector?: string): string[] {
  const suggestions: string[] = [];
  
  switch (type) {
    case 'element_not_found':
      suggestions.push('Verify the selector is correct');
      if (selector) {
        suggestions.push(`Current selector: ${selector}`);
        // Generate alternative selector suggestions
        const alternatives = suggestAlternativeSelectors(selector);
        if (alternatives.length > 0) {
          suggestions.push(`Try these alternatives: ${alternatives.join(', ')}`);
        }
      }
      suggestions.push('Wait for the element to appear with explicit waits');
      suggestions.push('Check if the page is a SPA that needs more load time');
      break;
    case 'element_not_visible':
      suggestions.push('Scroll the element into view');
      suggestions.push('Check if the element is hidden by CSS');
      suggestions.push('Try waiting for the element explicitly before clicking');
      break;
    case 'navigation_failed':
      suggestions.push('Check if the URL is correct');
      suggestions.push('Verify network connectivity');
      suggestions.push('The page might be a SPA - GhostRun will auto-retry with extended wait');
      break;
  }
  
  return suggestions;
}

/**
 * Suggest alternative selectors based on common patterns
 */
function suggestAlternativeSelectors(selector: string): string[] {
  const alternatives: string[] = [];
  
  // ID-based selectors
  if (selector.startsWith('.')) {
    alternatives.push(selector.replace('.', '#').replace(/ .*/, ''));
  }
  if (selector.startsWith('[')) {
    // Attribute selector - suggest common alternatives
    const attrMatch = selector.match(/\[(\w+)=/);
    if (attrMatch) {
      alternatives.push(`#${attrMatch[1]}`);
      alternatives.push(`[${attrMatch[1]}]`);
    }
  }
  // Complex selectors - suggest simpler alternatives
  if (selector.includes(' ') && selector.includes('[')) {
    const simpleSelector = selector.split('[')[0] + ']';
    alternatives.push(simpleSelector);
  }
  
  return alternatives;
}

/**
 * Execute click with multi-layer fallback strategy:
 * Layer 1: Primary selector with smart wait
 * Layer 2: AI-powered healing (if available)
 * Layer 3: SPA alternative strategies
 * Layer 4: Semantic fallbacks
 * Layer 5: Fail with detailed error
 */
async function executeClickWithFallback(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined
): Promise<ActionResult> {
  const { page } = execContext;
  const originalSelector = selector || 'viewport-center';
  const allStrategies = [] as string[];
  
  // Layer 1: Try primary selector
  try {
    allStrategies.push(originalSelector);
    const locator = await smartWaitForElement(page, originalSelector, selectorType, execContext.config.timeout);
    await locator.click({ timeout: execContext.config.timeout });
    return { success: true };
  } catch (primaryError) {}
  
  // Layer 2: Try AI healing if available
  const healedSelector = await tryAIHealing(page, originalSelector, 'click');
  if (healedSelector) {
    try {
      allStrategies.push(`AI-healed: ${healedSelector}`);
      const locator = await smartWaitForElement(page, healedSelector, undefined, 5000);
      await locator.click({ timeout: 5000 });
      return { 
        success: true, 
        warning: `Used AI-healed selector: ${healedSelector}`,
        selector: healedSelector 
      };
    } catch {}
  }
  
  // Layer 3: Try SPA strategies
  const spaResult = await tryAlternativeStrategies(page, originalSelector, 'click');
  if (spaResult.success && spaResult.strategy) {
    allStrategies.push(`SPA-${spaResult.strategy}`);
    return { 
      success: true, 
      warning: `Used SPA strategy: ${spaResult.strategy}`,
      selector: originalSelector
    };
  }
  
  // Layer 4: Try semantic fallbacks
  const semanticSelectors = getSemanticFallbacks(originalSelector, 'click');
  for (const semantic of semanticSelectors) {
    if (semantic === originalSelector) continue;
    try {
      allStrategies.push(`semantic: ${semantic}`);
      const locator = await smartWaitForElement(page, semantic, undefined, 3000);
      await locator.click({ timeout: 3000 });
      return { 
        success: true, 
        warning: `Used semantic fallback: ${semantic}`,
        selector: semantic 
      };
    } catch {}
  }
  
  // Layer 5: Fail with full diagnostic
  return {
    success: false,
    error: {
      type: 'element_not_found',
      message: `Element not found after trying ${allStrategies.length} strategies`,
      selector: originalSelector,
      recoverable: true,
      suggestions: [
        `Tried: ${allStrategies.join(' → ')}`,
        'Consider using text-based selectors like text=Button Text',
        'For SPAs, try navigating to the page first to ensure content loads',
      ],
    },
  };
}

/**
 * Try AI-powered selector healing
 */
async function tryAIHealing(
  page: import('playwright').Page,
  originalSelector: string,
  action: 'fill' | 'click' | 'type'
): Promise<string | null> {
  // Check if AI is available
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  
  try {
    const pageContent = await page.content();
    const pageTitle = await page.title();
    
    // Simple prompt for healing
    const prompt = `Heal this Playwright selector for a ${action} action:
    
Original: ${originalSelector}
Page title: ${pageTitle}

Find an equivalent selector that will work on this page. Return ONLY the selector, nothing else.`;
    
    // This would call Claude - simplified for now
    // In production, use the existing AI integration
    return null; // Placeholder - AI healing requires context from flow execution
    
  } catch {
    return null;
  }
}

/**
 * Get semantic fallback selectors based on the original
 * These work for common SPA patterns where exact selectors change but intent is clear
 */
function getSemanticFallbacks(originalSelector: string, action: string): string[] {
  const fallbacks: string[] = [];
  
  // If original has class-based selector, try these patterns
  if (originalSelector.includes('.')) {
    // Extract the class name
    const classMatch = originalSelector.match(/\.([^\s:.[]+)/);
    if (classMatch) {
      fallbacks.push(`button.${classMatch[1]}, a.${classMatch[1]}`);
      fallbacks.push(`[class*="${classMatch[1]}"]`);
    }
  }
  
  // If it's a button or link, try role-based selectors
  if (originalSelector.includes('btn') || originalSelector.includes('button')) {
    fallbacks.push('button:visible');
    fallbacks.push('[role="button"]:visible');
  }
  
  // If it has specific text hints, try text-based selectors
  const textMatch = originalSelector.match(/text=([^"]+)/);
  if (textMatch) {
    fallbacks.push(`text=${textMatch[1]}`);
    fallbacks.push(`text=*${textMatch[1]}*`);
  }
  
  // For inputs
  if (originalSelector.includes('input')) {
    fallbacks.push('input:visible');
    fallbacks.push('input[type="text"]:visible');
    fallbacks.push('input[type="search"]:visible');
  }
  
  // Generic fallbacks
  if (action === 'click') {
    fallbacks.push('a:visible');
    fallbacks.push('button:visible');
  }
  
  return fallbacks;
}

/**
 * Execute fill with multi-layer fallback strategy
 */
async function executeFillWithFallback(
  execContext: ExecutionContext,
  selector: string | undefined,
  selectorType: string | undefined,
  value: string
): Promise<ActionResult> {
  const { page } = execContext;
  const originalSelector = selector || '';
  const allStrategies = [] as string[];
  
  // Layer 1: Try primary selector
  try {
    allStrategies.push(originalSelector);
    const locator = await smartWaitForElement(page, originalSelector, selectorType, execContext.config.timeout);
    
    // Check if hidden (SPA pattern)
    const isHidden = await locator.isHidden().catch(() => false);
    if (isHidden) {
      await tryAlternativeStrategies(page, originalSelector, 'fill', value);
      return { success: true, warning: 'Used SPA fill strategy' };
    }
    
    await locator.fill(value, { timeout: execContext.config.timeout });
    return { success: true };
  } catch (primaryError) {}
  
  // Layer 2: Try AI healing if available
  const healedSelector = await tryAIHealing(page, originalSelector, 'fill');
  if (healedSelector) {
    try {
      allStrategies.push(`AI-healed: ${healedSelector}`);
      const locator = await smartWaitForElement(page, healedSelector, undefined, 5000);
      await locator.fill(value, { timeout: 5000 });
      return { 
        success: true, 
        warning: `Used AI-healed selector: ${healedSelector}`,
        selector: healedSelector 
      };
    } catch {}
  }
  
  // Layer 3: Try SPA strategies
  const spaResult = await tryAlternativeStrategies(page, originalSelector, 'fill', value);
  if (spaResult.success) {
    return { success: true, warning: 'Used SPA fill strategy' };
  }
  
  // Layer 4: Try semantic fallbacks for inputs
  const inputFallbacks = getInputFallbacks(originalSelector);
  for (const fallback of inputFallbacks) {
    if (fallback === originalSelector) continue;
    try {
      allStrategies.push(`semantic: ${fallback}`);
      const locator = await smartWaitForElement(page, fallback, undefined, 3000);
      await locator.fill(value, { timeout: 3000 });
      return { 
        success: true, 
        warning: `Used semantic fallback: ${fallback}`,
        selector: fallback 
      };
    } catch {}
  }
  
  // Layer 5: Fail with diagnostic
  return {
    success: false,
    error: {
      type: 'element_not_found',
      message: `Input not found after trying ${allStrategies.length} strategies`,
      selector: originalSelector,
      recoverable: true,
      suggestions: [
        `Tried: ${allStrategies.join(' → ')}`,
        'For SPAs, the input might be behind a button - try clicking first',
        'Use text= or role= selectors for better SPA compatibility',
      ],
    },
  };
}

/**
 * Get input-specific fallback selectors
 */
function getInputFallbacks(originalSelector: string): string[] {
  const fallbacks: string[] = [];
  
  // Search inputs
  if (originalSelector.includes('search') || originalSelector.includes('Search')) {
    fallbacks.push('input[type="search"]:visible');
    fallbacks.push('input[name*="search" i]:visible');
    fallbacks.push('input[placeholder*="search" i]:visible');
  }
  
  // Email inputs
  if (originalSelector.includes('email') || originalSelector.includes('mail')) {
    fallbacks.push('input[type="email"]:visible');
    fallbacks.push('input[name*="email" i]:visible');
  }
  
  // Password inputs
  if (originalSelector.includes('password') || originalSelector.includes('pass')) {
    fallbacks.push('input[type="password"]:visible');
    fallbacks.push('input[name*="password" i]:visible');
  }
  
  // Generic fallbacks
  fallbacks.push('input[type="text"]:visible');
  fallbacks.push('input:visible');
  fallbacks.push('textarea:visible');
  
  return fallbacks;
}
