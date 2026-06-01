/**
 * Run Report v2 — HTML helper unit tests
 */

import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  formatReportDuration,
  computeFlowGraphHash,
  computePassRate,
  buildRunHistorySparklineHtml,
  buildRepairPanelHtml,
  buildRepairDiffPreview,
  buildNextStepsPanelHtml,
  buildIntentBlockHtml,
  buildFailurePanelHtml,
} from '../../run-report-v2';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>"&"</script>')).toBe('&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;');
  });
});

describe('formatReportDuration', () => {
  it('formats milliseconds and seconds', () => {
    expect(formatReportDuration(450)).toBe('450ms');
    expect(formatReportDuration(1500)).toBe('1.50s');
    expect(formatReportDuration(null)).toBe('—');
  });
});

describe('computeFlowGraphHash', () => {
  it('returns stable short hash for graph JSON', () => {
    const hash = computeFlowGraphHash('{"nodes":[]}');
    expect(hash).toHaveLength(8);
    expect(computeFlowGraphHash('{"nodes":[]}')).toBe(hash);
  });

  it('returns null for empty graph', () => {
    expect(computeFlowGraphHash(null)).toBeNull();
  });
});

describe('computePassRate', () => {
  it('calculates pass rate percentage', () => {
    const runs = [
      { id: '1', status: 'passed' },
      { id: '2', status: 'failed' },
      { id: '3', status: 'passed' },
      { id: '4', status: 'passed' },
    ];
    expect(computePassRate(runs)).toBe(75);
  });
});

describe('buildRunHistorySparklineHtml', () => {
  it('renders pass/fail bars and pass rate', () => {
    const html = buildRunHistorySparklineHtml([
      { id: 'a', status: 'passed' },
      { id: 'b', status: 'failed' },
      { id: 'c', status: 'passed' },
    ], 'c');
    expect(html).toContain('History');
    expect(html).toContain('67% pass rate');
    expect(html).toContain('history-bar');
    expect(html).toContain('current');
  });

  it('returns empty string when no runs', () => {
    expect(buildRunHistorySparklineHtml([])).toBe('');
  });
});

describe('buildRepairDiffPreview', () => {
  it('shows selector diff when available', () => {
    const diff = buildRepairDiffPreview({
      id: 'p1',
      status: 'proposed',
      currentSelector: '#old',
      proposedSelector: '#new',
    });
    expect(diff).toContain('- #old');
    expect(diff).toContain('+ #new');
  });
});

describe('buildRepairPanelHtml', () => {
  it('includes repair cards and apply commands', () => {
    const html = buildRepairPanelHtml([{
      id: 'prop-abc12345',
      repairType: 'selector',
      status: 'proposed',
      stepNumber: 4,
      currentSelector: '#pay',
      proposedSelector: '[data-testid=pay-now]',
    }]);
    expect(html).toContain('Repair proposals');
    expect(html).toContain('selector');
    expect(html).toContain('ghostrun repair apply prop-abc');
    expect(html).toContain('ghostrun repair show prop-abc');
  });

  it('returns empty string when no proposals', () => {
    expect(buildRepairPanelHtml([])).toBe('');
  });
});

describe('buildNextStepsPanelHtml', () => {
  it('lists rerun, repair, and report path commands', () => {
    const html = buildNextStepsPanelHtml({
      rerunCommand: 'ghostrun run checkout-smoke --profile staging',
      repairListCommand: 'ghostrun repair list',
      reportPath: 'report.html',
      applyRepairCommand: 'ghostrun repair apply prop_abc',
    });
    expect(html).toContain('Next steps');
    expect(html).toContain('ghostrun run checkout-smoke --profile staging');
    expect(html).toContain('ghostrun repair list');
    expect(html).toContain('report.html');
    expect(html).toContain('ghostrun repair apply prop_abc');
  });
});

describe('buildIntentBlockHtml', () => {
  it('renders intent text', () => {
    const html = buildIntentBlockHtml('User completes payment with saved card');
    expect(html).toContain('Intent');
    expect(html).toContain('User completes payment');
  });

  it('returns empty for blank intent', () => {
    expect(buildIntentBlockHtml('')).toBe('');
  });
});

describe('buildFailurePanelHtml', () => {
  it('includes error, selector, and screenshot', () => {
    const html = buildFailurePanelHtml({
      stepNumber: 4,
      action: 'click',
      name: 'Click Pay now',
      error: 'Timeout waiting for selector',
      selector: '[data-testid=pay-now]',
      screenshotSrc: 'screenshots/step-4-failed.png',
    });
    expect(html).toContain('Failure');
    expect(html).toContain('Timeout waiting for selector');
    expect(html).toContain('[data-testid=pay-now]');
    expect(html).toContain('screenshots/step-4-failed.png');
  });
});
