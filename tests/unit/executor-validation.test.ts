/**
 * Unit tests for packages/executor validation helpers.
 */

import { describe, it, expect } from 'vitest';
import { validateTransition } from '../../packages/executor/src/validation';

function mockPage(url: string) {
  return {
    url: () => url,
    locator: () => ({
      count: async () => 0,
      first: () => ({
        isVisible: async () => false,
        innerText: async () => '',
      }),
    }),
    getByText: () => ({
      count: async () => 0,
      first: () => ({ isVisible: async () => false }),
    }),
  } as any;
}

describe('validateTransition — url conditions', () => {
  it('passes when URL contains expected fragment', async () => {
    const result = await validateTransition(
      { page: mockPage('https://example.com/dashboard') } as any,
      { type: 'url', operator: 'contains', value: '/dashboard' },
    );
    expect(result.valid).toBe(true);
  });

  it('fails when URL does not contain expected fragment', async () => {
    const result = await validateTransition(
      { page: mockPage('https://example.com/login') } as any,
      { type: 'url', operator: 'contains', value: '/dashboard' },
    );
    expect(result.valid).toBe(false);
    expect(result.message).toContain('does not contain');
  });

  it('supports equals operator', async () => {
    const result = await validateTransition(
      { page: mockPage('https://example.com/') } as any,
      { type: 'url', operator: 'equals', value: 'https://example.com/' },
    );
    expect(result.valid).toBe(true);
  });
});
