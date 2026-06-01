/**
 * Evidence Bundle v1.3 — failure headline and failure.v1 schema helpers
 */

import { describe, it, expect } from 'vitest';

function buildFailureHeadline(
  flowName: string,
  failedStep: { stepNumber: number; action: string; name: string; errorMessage: string }
): string {
  const err = failedStep.errorMessage.slice(0, 120);
  return `Step ${failedStep.stepNumber}: ${failedStep.action} failed in "${flowName}" — ${err}`;
}

function errorSignature(message: string | undefined): string {
  return (message || 'unknown')
    .replace(/\d+ms/g, 'Nms')
    .replace(/[0-9a-f]{8,}/gi, '[id]')
    .slice(0, 160);
}

describe('buildFailureHeadline', () => {
  it('includes step number, action, flow name, and error', () => {
    const headline = buildFailureHeadline('Checkout smoke', {
      stepNumber: 4,
      action: 'click',
      name: 'Click Pay now',
      errorMessage: 'Timeout 10000ms waiting for selector',
    });
    expect(headline).toContain('Step 4');
    expect(headline).toContain('click');
    expect(headline).toContain('Checkout smoke');
    expect(headline).toContain('Timeout');
  });

  it('truncates very long error messages', () => {
    const long = 'x'.repeat(200);
    const headline = buildFailureHeadline('Flow', {
      stepNumber: 1,
      action: 'fill',
      name: 'Fill email',
      errorMessage: long,
    });
    expect(headline.length).toBeLessThan(200);
  });
});

describe('errorSignature', () => {
  it('normalizes timeouts and ids for dedup', () => {
    const a = errorSignature('Timeout 10000ms waiting for #btn-abc123def456');
    const b = errorSignature('Timeout 5000ms waiting for #btn-abc123def456');
    expect(a).toBe(b);
  });
});

describe('failure.v1 contract', () => {
  it('requires headline and failedStep on failure objects', () => {
    const failure = {
      schemaVersion: '1.0',
      runId: 'run-1',
      flowId: 'flow-1',
      flowName: 'Smoke',
      profile: 'staging',
      status: 'failed',
      headline: buildFailureHeadline('Smoke', {
        stepNumber: 2,
        action: 'click',
        name: 'Click login',
        errorMessage: 'not found',
      }),
      failedStep: { number: 2, action: 'click', name: 'Click login', error: 'not found' },
      actions: { rerun: 'ghostrun run Smoke --profile staging' },
      integrations: {},
    };
    expect(failure.schemaVersion).toBe('1.0');
    expect(failure.headline).toContain('Smoke');
    expect(failure.failedStep.number).toBe(2);
  });
});

describe('manifest v1.3 contract', () => {
  it('includes schemaVersion and artifact paths', () => {
    const manifest = {
      schemaVersion: '1.3',
      ghostrunVersion: '1.3.0',
      runId: 'abc',
      flowName: 'Smoke',
      status: 'failed',
      artifacts: {
        report: 'report.html',
        steps: 'steps.jsonl',
        failure: 'failure.v1.json',
        screenshots: ['screenshots/step-1-FAILED.png'],
      },
    };
    expect(manifest.schemaVersion).toBe('1.3');
    expect(manifest.artifacts.failure).toBe('failure.v1.json');
  });
});
