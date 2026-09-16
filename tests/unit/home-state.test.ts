/**
 * Home state detection — zero-config ghostrun entry
 */

import { describe, it, expect } from 'vitest';

import { suggestHomeActions, type HomeActionState } from '../../home-state';

describe('suggestHomeActions', () => {
  it('guides brand-new user through setup then record', () => {
    expect(suggestHomeActions({
      globalReady: false,
      projectReady: false,
      hasFlows: false,
      flowCount: 0,
      hasProfiles: false,
      openRepairs: 0,
      lastFailedRun: null,
    } satisfies HomeActionState)).toEqual(['setup-global', 'setup-project', 'record-first-flow']);
  });

  it('prioritizes failure review when run failed', () => {
    const hints = suggestHomeActions({
      globalReady: true,
      projectReady: true,
      hasFlows: true,
      flowCount: 3,
      hasProfiles: true,
      openRepairs: 1,
      lastFailedRun: { id: 'run-1', flowName: 'Checkout' },
    } satisfies HomeActionState);
    expect(hints).toContain('review-failure');
    expect(hints).toContain('review-repairs');
    expect(hints).toContain('run-flow');
  });
});
