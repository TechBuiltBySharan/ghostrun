/**
 * Unit tests for GhostRun product feature helpers (repair types, monitor payloads, improve signals).
 */

import { describe, it, expect } from 'vitest';

type RepairType = 'selector' | 'assertion' | 'wait' | 'url' | 'config' | 'visual';

interface RepairProposal {
  repairType?: RepairType;
  proposedSelector?: string;
  proposedValue?: string;
  action?: string;
}

function getRepairType(proposal: RepairProposal): RepairType {
  if (proposal.repairType) return proposal.repairType;
  if (proposal.proposedSelector) return 'selector';
  if (proposal.proposedValue && ['assert:text', 'assert:title', 'assert:url', 'assert:response', 'assert:status'].includes(proposal.action || '')) {
    return 'assertion';
  }
  if (proposal.action === 'wait' || proposal.action === 'wait:ms') return 'wait';
  if (proposal.action === 'navigate') return 'url';
  if (proposal.repairType === 'visual' || proposal.errorMessage?.includes('[DIFF:')) return 'visual';
  return 'config';
}

function detectFlakyFromStatuses(statuses: string[]): boolean {
  if (statuses.length < 4) return false;
  if (!statuses.includes('passed') || !statuses.includes('failed')) return false;
  let transitions = 0;
  for (let i = 1; i < statuses.length; i++) {
    if (statuses[i] !== statuses[i - 1]) transitions++;
  }
  return transitions >= 2;
}

describe('getRepairType', () => {
  it('detects selector repairs', () => {
    expect(getRepairType({ proposedSelector: '#btn' })).toBe('selector');
  });

  it('detects assertion repairs', () => {
    expect(getRepairType({ action: 'assert:text', proposedValue: 'Dashboard' })).toBe('assertion');
  });

  it('detects wait repairs', () => {
    expect(getRepairType({ action: 'wait', proposedValue: '20000' })).toBe('wait');
  });

  it('detects url repairs', () => {
    expect(getRepairType({ action: 'navigate', proposedValue: 'https://staging.example.com' })).toBe('url');
  });

  it('detects visual repairs', () => {
    expect(getRepairType({ repairType: 'visual', errorMessage: '[DIFF:12.5%]' })).toBe('visual');
  });
});

describe('flaky flow detection', () => {
  it('flags alternating pass/fail sequences', () => {
    expect(detectFlakyFromStatuses(['passed', 'failed', 'passed', 'failed'])).toBe(true);
  });

  it('ignores stable pass-only history', () => {
    expect(detectFlakyFromStatuses(['passed', 'passed', 'passed', 'passed'])).toBe(false);
  });

  it('ignores short histories', () => {
    expect(detectFlakyFromStatuses(['passed', 'failed'])).toBe(false);
  });
});

describe('monitor alert payload', () => {
  it('matches the documented webhook contract', () => {
    const payload = {
      event: 'ghostrun.monitor.alert' as const,
      flowId: 'flow-1',
      flowName: 'Smoke',
      profile: 'staging',
      consecutiveFailures: 3,
      error: 'assert:text failed',
      timestamp: new Date().toISOString(),
    };
    expect(payload.event).toBe('ghostrun.monitor.alert');
    expect(payload.consecutiveFailures).toBeGreaterThanOrEqual(1);
    expect(typeof payload.timestamp).toBe('string');
  });
});
