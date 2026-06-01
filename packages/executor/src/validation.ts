/**
 * Transition Validation - Validate transitions between nodes
 */

import type { ExecutionContext } from './engine';
import type { EdgeCondition } from '@ghostrun/core';

export interface ValidationResult {
  valid: boolean;
  message?: string;
  actual?: string;
  expected?: string;
}

/**
 * Validate edge transition
 */
export async function validateTransition(
  execContext: ExecutionContext,
  condition: EdgeCondition
): Promise<ValidationResult> {
  const { page } = execContext;

  switch (condition.type) {
    case 'url':
      return validateUrl(page.url(), condition);
    
    case 'selector':
      return await validateSelector(page, condition);
    
    case 'text':
      return await validateText(page, condition);
    
    case 'element':
      return await validateElement(page, condition);
    
    case 'count':
      return await validateCount(page, condition);
    
    default:
      return { valid: true };
  }
}

/**
 * Validate URL condition
 */
function validateUrl(
  actualUrl: string,
  condition: EdgeCondition
): ValidationResult {
  const { operator, value, caseSensitive } = condition;
  
  let actual = actualUrl;
  let expected = String(value);
  
  if (!caseSensitive) {
    actual = actual.toLowerCase();
    expected = expected.toLowerCase();
  }

  switch (operator) {
    case 'equals':
      return {
        valid: actual === expected,
        actual: actualUrl,
        expected: String(value),
        message: actual === expected 
          ? 'URL matches expected value' 
          : `URL "${actualUrl}" does not match "${value}"`,
      };
    
    case 'contains':
      return {
        valid: actual.includes(expected),
        actual: actualUrl,
        expected: String(value),
        message: actual.includes(expected)
          ? 'URL contains expected value'
          : `URL "${actualUrl}" does not contain "${value}"`,
      };
    
    case 'matches':
      try {
        const regex = new RegExp(String(value));
        const matches = regex.test(actualUrl);
        return {
          valid: matches,
          actual: actualUrl,
          expected: String(value),
          message: matches
            ? 'URL matches pattern'
            : `URL "${actualUrl}" does not match pattern "${value}"`,
        };
      } catch {
        return { valid: false, message: `Invalid regex pattern: ${value}` };
      }
    
    default:
      return { valid: true };
  }
}

/**
 * Validate selector condition
 */
async function validateSelector(
  page: import('playwright').Page,
  condition: EdgeCondition
): Promise<ValidationResult> {
  const { operator, target } = condition;
  
  try {
    const locator = page.locator(target);
    const count = await locator.count();
    const exists = count > 0;

    switch (operator) {
      case 'exists':
        return {
          valid: exists,
          actual: `${count} element(s) found`,
          expected: 'at least 1 element',
          message: exists
            ? `Selector "${target}" exists`
            : `Selector "${target}" not found`,
        };
      
      case 'notExists':
        return {
          valid: !exists,
          actual: `${count} element(s) found`,
          expected: '0 elements',
          message: !exists
            ? `Selector "${target}" does not exist (as expected)`
            : `Selector "${target}" was found but should not exist`,
        };
      
      default:
        return { valid: true };
    }
  } catch (error) {
    return {
      valid: false,
      actual: `Error: ${error instanceof Error ? error.message : String(error)}`,
      message: `Failed to validate selector: ${target}`,
    };
  }
}

/**
 * Validate text condition
 */
async function validateText(
  page: import('playwright').Page,
  condition: EdgeCondition
): Promise<ValidationResult> {
  const { operator, target, value, caseSensitive } = condition;
  
  try {
    let actual: string;
    
    if (target === 'title') {
      actual = page.url() ? document.title : '';
    } else if (target === 'url') {
      actual = page.url();
    } else {
      const locator = page.locator(target);
      const count = await locator.count();
      
      if (count === 0) {
        return {
          valid: operator === 'notExists' || operator === 'notEquals',
          actual: 'Element not found',
          expected: String(value),
          message: `Element "${target}" not found`,
        };
      }
      
      actual = await locator.first().textContent() || '';
    }
    
    const compareActual = caseSensitive ? actual : actual.toLowerCase();
    const compareValue = caseSensitive ? String(value) : String(value).toLowerCase();
    
    switch (operator) {
      case 'equals':
        return {
          valid: compareActual === compareValue,
          actual: actual.trim(),
          expected: String(value),
          message: compareActual === compareValue
            ? 'Text matches expected value'
            : `Text "${actual.trim()}" does not equal "${value}"`,
        };
      
      case 'contains':
        return {
          valid: compareActual.includes(compareValue),
          actual: actual.trim(),
          expected: String(value),
          message: compareActual.includes(compareValue)
            ? 'Text contains expected value'
            : `Text "${actual.trim()}" does not contain "${value}"`,
        };
      
      case 'notEquals':
        return {
          valid: compareActual !== compareValue,
          actual: actual.trim(),
          expected: `not "${value}"`,
          message: compareActual !== compareValue
            ? 'Text does not equal expected value (as expected)'
            : `Text "${actual.trim()}" equals "${value}" but should not`,
        };
      
      default:
        return { valid: true };
    }
  } catch (error) {
    return {
      valid: false,
      actual: `Error: ${error instanceof Error ? error.message : String(error)}`,
      message: `Failed to validate text: ${target}`,
    };
  }
}

/**
 * Validate element condition
 */
async function validateElement(
  page: import('playwright').Page,
  condition: EdgeCondition
): Promise<ValidationResult> {
  const { operator, target } = condition;
  
  try {
    const locator = page.locator(target);
    const count = await locator.count();
    
    if (count === 0) {
      return {
        valid: false,
        actual: 'Element not found',
        expected: 'Element exists',
        message: `Element "${target}" not found`,
      };
    }
    
    const firstEl = locator.first();
    
    switch (operator) {
      case 'exists':
        return {
          valid: true,
          actual: 'Element exists',
          expected: 'Element exists',
          message: `Element "${target}" exists`,
        };
      
      case 'notExists':
        return {
          valid: false,
          actual: 'Element exists',
          expected: 'Element does not exist',
          message: `Element "${target}" exists but should not`,
        };
      
      case 'equals':
        // Check if element is visible
        const isVisible = await firstEl.isVisible();
        return {
          valid: isVisible,
          actual: isVisible ? 'Element visible' : 'Element not visible',
          expected: 'Element visible',
          message: isVisible
            ? `Element "${target}" is visible`
            : `Element "${target}" is not visible`,
        };
      
      default:
        return { valid: true };
    }
  } catch (error) {
    return {
      valid: false,
      actual: `Error: ${error instanceof Error ? error.message : String(error)}`,
      message: `Failed to validate element: ${target}`,
    };
  }
}

/**
 * Validate count condition
 */
async function validateCount(
  page: import('playwright').Page,
  condition: EdgeCondition
): Promise<ValidationResult> {
  const { operator, target, value } = condition;
  
  try {
    const locator = page.locator(target);
    const count = await locator.count();
    const expectedCount = Number(value);
    
    switch (operator) {
      case 'equals':
        return {
          valid: count === expectedCount,
          actual: `${count} element(s)`,
          expected: `${expectedCount} element(s)`,
          message: count === expectedCount
            ? `Element count matches: ${count}`
            : `Element count ${count} does not match expected ${expectedCount}`,
        };
      
      case 'greaterThan':
        return {
          valid: count > expectedCount,
          actual: `${count} element(s)`,
          expected: `more than ${expectedCount} element(s)`,
          message: count > expectedCount
            ? `Element count ${count} is greater than ${expectedCount}`
            : `Element count ${count} is not greater than ${expectedCount}`,
        };
      
      case 'lessThan':
        return {
          valid: count < expectedCount,
          actual: `${count} element(s)`,
          expected: `less than ${expectedCount} element(s)`,
          message: count < expectedCount
            ? `Element count ${count} is less than ${expectedCount}`
            : `Element count ${count} is not less than ${expectedCount}`,
        };
      
      default:
        return { valid: true };
    }
  } catch (error) {
    return {
      valid: false,
      actual: `Error: ${error instanceof Error ? error.message : String(error)}`,
      message: `Failed to count elements: ${target}`,
    };
  }
}

/**
 * Validate success condition
 */
export async function validateSuccessCondition(
  execContext: ExecutionContext,
  condition: {
    type: 'url' | 'selector' | 'text' | 'element';
    target: string;
    operator: string;
    value?: string;
  }
): Promise<ValidationResult> {
  return validateTransition(execContext, condition as EdgeCondition);
}

/**
 * Wait for condition to be met with timeout
 */
export async function waitForCondition(
  execContext: ExecutionContext,
  condition: EdgeCondition,
  timeoutMs: number = 5000,
  intervalMs: number = 500
): Promise<ValidationResult> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await validateTransition(execContext, condition);
    
    if (result.valid) {
      return result;
    }
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  // Final check
  return validateTransition(execContext, condition);
}
