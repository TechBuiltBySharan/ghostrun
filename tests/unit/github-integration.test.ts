/**
 * GitHub Issues integration — issue body formatting and dedup markers (pure helpers)
 */

import { describe, it, expect } from 'vitest';

function githubIssueDedupMarker(runId: string, flowId: string): string {
  return `ghostrun-run:${runId}\nghostrun-flow:${flowId}`;
}

function issueBodyHasDedupMarker(body: string, runId: string, flowId: string): boolean {
  return body.includes(`ghostrun-run:${runId}`) && body.includes(`ghostrun-flow:${flowId}`);
}

function shouldCreateGitHubIssue(
  config: { integrations?: { github?: { enabled?: boolean; createOn?: string[] } } },
  trigger: string
): boolean {
  const gh = config.integrations?.github;
  if (!gh?.enabled) return false;
  const createOn = gh.createOn;
  if (!createOn?.length) return true;
  return createOn.includes(trigger);
}

function formatGitHubIssueBody(
  failure: Record<string, unknown>,
  manifest: Record<string, unknown>
): string {
  const runId = String(failure.runId || manifest.runId || '—');
  const flowId = String(failure.flowId || manifest.flowId || '—');
  const flowName = String(failure.flowName || manifest.flowName || '—');
  const profile = String(failure.profile ?? manifest.profile ?? '—');
  const failed = failure.failedStep as Record<string, unknown> | undefined;
  const actions = failure.actions as Record<string, string> | undefined;
  const headline = String(failure.headline || 'Test failed');

  return [
    '## GhostRun failure',
    '',
    `**${headline}**`,
    '',
    '| | |',
    '|---|---|',
    `| Flow | ${flowName} |`,
    `| Profile | ${profile} |`,
    `| Run | \`${runId}\` |`,
    `| Flow ID | \`${flowId}\` |`,
    '',
    '### Failed step',
    '',
    '```',
    `Step ${failed?.number ?? '?'}: ${failed?.action ?? 'unknown'}`,
    String(failed?.error || 'Unknown error'),
    '```',
    '',
    '### Commands',
    '',
    '```bash',
    actions?.rerun || `ghostrun run ${flowName}`,
    actions?.viewProposals || 'ghostrun repair list',
    '```',
    '',
    '<!-- ghostrun-integration:v1 -->',
    githubIssueDedupMarker(runId, flowId),
    '',
    '_Created by GhostRun `report publish --create-issues`_',
  ].join('\n');
}

describe('githubIssueDedupMarker', () => {
  it('embeds stable runId and flowId lines for search', () => {
    const marker = githubIssueDedupMarker('run-abc', 'flow-xyz');
    expect(marker).toBe('ghostrun-run:run-abc\nghostrun-flow:flow-xyz');
  });
});

describe('issueBodyHasDedupMarker', () => {
  it('matches when both markers appear in issue body', () => {
    const body = formatGitHubIssueBody(
      { runId: 'r1', flowId: 'f1', flowName: 'Smoke', headline: 'Failed' },
      {}
    );
    expect(issueBodyHasDedupMarker(body, 'r1', 'f1')).toBe(true);
  });

  it('rejects partial or wrong ids', () => {
    const body = githubIssueDedupMarker('r1', 'f1');
    expect(issueBodyHasDedupMarker(body, 'r2', 'f1')).toBe(false);
    expect(issueBodyHasDedupMarker(body, 'r1', 'f2')).toBe(false);
  });
});

describe('formatGitHubIssueBody', () => {
  const failure = {
    headline: 'Step 2: click failed in "Checkout" — timeout',
    flowName: 'Checkout',
    flowId: 'flow-1',
    runId: 'run-99',
    profile: 'staging',
    failedStep: { number: 2, action: 'click', error: 'Timeout 10000ms' },
    actions: {
      rerun: 'ghostrun run Checkout --profile staging',
      viewProposals: 'ghostrun repair list',
    },
  };

  it('includes headline, table fields, failed step, and commands', () => {
    const body = formatGitHubIssueBody(failure, {});
    expect(body).toContain('Step 2: click failed');
    expect(body).toContain('| Flow | Checkout |');
    expect(body).toContain('`run-99`');
    expect(body).toContain('ghostrun run Checkout --profile staging');
    expect(body).toContain('ghostrun-integration:v1');
    expect(body).toContain('ghostrun-run:run-99');
  });

  it('falls back to manifest runId and flowId', () => {
    const body = formatGitHubIssueBody(
      { headline: 'Fail', flowName: 'Smoke' },
      { runId: 'from-manifest', flowId: 'flow-m', profile: 'local' }
    );
    expect(body).toContain('ghostrun-run:from-manifest');
    expect(body).toContain('ghostrun-flow:flow-m');
    expect(body).toContain('| Profile | local |');
  });
});

describe('shouldCreateGitHubIssue', () => {
  it('returns false when integration disabled', () => {
    expect(
      shouldCreateGitHubIssue({ integrations: { github: { enabled: false } } }, 'ci-failure')
    ).toBe(false);
  });

  it('allows all triggers when createOn is empty', () => {
    expect(
      shouldCreateGitHubIssue(
        { integrations: { github: { enabled: true, createOn: [] } } },
        'local-failure'
      )
    ).toBe(true);
  });

  it('respects createOn allowlist', () => {
    const config = {
      integrations: { github: { enabled: true, createOn: ['ci-failure'] } },
    };
    expect(shouldCreateGitHubIssue(config, 'ci-failure')).toBe(true);
    expect(shouldCreateGitHubIssue(config, 'local-failure')).toBe(false);
  });
});
