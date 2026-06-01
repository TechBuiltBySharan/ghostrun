/**
 * Home state detection — zero-config ghostrun entry
 */

import { describe, it, expect } from 'vitest';

interface HomeState {
  globalReady: boolean;
  projectReady: boolean;
  hasFlows: boolean;
  flowCount: number;
  hasProfiles: boolean;
  openRepairs: number;
  lastFailedRun: { id: string; flowName: string } | null;
}

function suggestHomeActions(state: HomeState): string[] {
  const hints: string[] = [];
  if (!state.globalReady) hints.push('setup-global');
  if (!state.projectReady) hints.push('setup-project');
  if (!state.hasFlows) hints.push('record-first-flow');
  if (state.hasFlows && !state.hasProfiles) hints.push('create-profile');
  if (state.lastFailedRun) hints.push('review-failure');
  if (state.openRepairs > 0) hints.push('review-repairs');
  if (state.hasFlows && state.hasProfiles) hints.push('run-flow');
  return hints;
}

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
    })).toEqual(['setup-global', 'setup-project', 'record-first-flow']);
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
    });
    expect(hints).toContain('review-failure');
    expect(hints).toContain('review-repairs');
    expect(hints).toContain('run-flow');
  });
});
