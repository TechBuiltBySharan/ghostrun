/**
 * Run Report v2 — HTML helpers for offline, self-contained run reports.
 * Used by ghostrun.ts buildRunReportHtml and unit-tested in tests/unit/report-v2.test.ts.
 */

import { createHash } from 'crypto';

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatReportDuration(ms: number | null | undefined): string {
  if (!ms) return '—';
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
  return ms + 'ms';
}

export function computeFlowGraphHash(graph: string | undefined | null): string | null {
  if (!graph) return null;
  return createHash('sha256').update(graph).digest('hex').slice(0, 8);
}

export interface RunHistoryEntry {
  id: string;
  status: string;
}

export function computePassRate(runs: RunHistoryEntry[]): number {
  if (runs.length === 0) return 0;
  const passed = runs.filter(r => r.status === 'passed').length;
  return Math.round((passed / runs.length) * 100);
}

export function buildRunHistorySparklineHtml(runs: RunHistoryEntry[], currentRunId?: string): string {
  if (runs.length === 0) return '';
  const chronological = [...runs].reverse();
  const passRate = computePassRate(runs);
  const bars = chronological.map(r => {
    const color = r.status === 'passed' ? '#56d364' : r.status === 'failed' ? '#f85149' : '#484f58';
    const isCurrent = currentRunId && r.id === currentRunId;
    return `<span class="history-bar${isCurrent ? ' current' : ''}" style="background:${color}" title="${escapeHtml(r.status)}"></span>`;
  }).join('');
  return `<section class="panel history-panel" aria-labelledby="history-heading">
  <h2 id="history-heading">History</h2>
  <p class="panel-sub">${passRate}% pass rate · last ${runs.length} run${runs.length === 1 ? '' : 's'} on this flow</p>
  <div class="history-sparkline" role="img" aria-label="Pass/fail history: ${passRate}% pass rate over ${runs.length} runs">${bars}</div>
</section>`;
}

export interface RepairProposalView {
  id: string;
  repairType?: string;
  status: string;
  stepNumber?: number;
  currentSelector?: string;
  proposedSelector?: string;
  currentValue?: string;
  proposedValue?: string;
  rationale?: string;
  action?: string;
}

export function buildRepairDiffPreview(proposal: RepairProposalView): string {
  if (proposal.currentSelector && proposal.proposedSelector) {
    return `- ${proposal.currentSelector}\n+ ${proposal.proposedSelector}`;
  }
  if (proposal.currentValue !== undefined && proposal.proposedValue !== undefined) {
    return `- ${proposal.currentValue}\n+ ${proposal.proposedValue}`;
  }
  if (proposal.rationale) return proposal.rationale;
  return 'Review proposal JSON for suggested changes.';
}

export function buildRepairPanelHtml(proposals: RepairProposalView[]): string {
  if (proposals.length === 0) return '';
  const cards = proposals.map(p => {
    const type = p.repairType || 'repair';
    const diff = buildRepairDiffPreview(p);
    const applyCmd = `ghostrun repair apply ${p.id.slice(0, 8)}`;
    const showCmd = `ghostrun repair show ${p.id.slice(0, 8)}`;
    return `<article class="repair-card">
      <header class="repair-card-header">
        <span class="repair-type">${escapeHtml(type)}</span>
        <span class="repair-status">${escapeHtml(p.status)}</span>
        ${p.stepNumber != null ? `<span class="repair-step">Step ${p.stepNumber}</span>` : ''}
      </header>
      <pre class="repair-diff">${escapeHtml(diff)}</pre>
      <div class="repair-commands">
        <code>${escapeHtml(showCmd)}</code>
        <code>${escapeHtml(applyCmd)}</code>
      </div>
    </article>`;
  }).join('\n');
  return `<section class="panel repair-panel" aria-labelledby="repair-heading">
  <h2 id="repair-heading">Repair proposals</h2>
  <p class="panel-sub">${proposals.length} proposal${proposals.length === 1 ? '' : 's'} linked to this run</p>
  ${cards}
</section>`;
}

export interface NextStepsParams {
  rerunCommand: string;
  repairListCommand: string;
  reportPath: string;
  applyRepairCommand?: string;
}

export function buildNextStepsPanelHtml(params: NextStepsParams): string {
  const rows = [
    { label: 'Rerun flow', command: params.rerunCommand },
    { label: 'List repairs', command: params.repairListCommand },
    { label: 'Report path', command: params.reportPath },
  ];
  if (params.applyRepairCommand) {
    rows.splice(1, 0, { label: 'Apply repair', command: params.applyRepairCommand });
  }
  const items = rows.map(r =>
    `<li><span class="cmd-label">${escapeHtml(r.label)}</span><code class="cmd-value">${escapeHtml(r.command)}</code></li>`
  ).join('\n');
  return `<section class="panel next-steps-panel" aria-labelledby="next-steps-heading">
  <h2 id="next-steps-heading">Next steps</h2>
  <ul class="command-list">${items}</ul>
</section>`;
}

export function buildIntentBlockHtml(intent: string): string {
  if (!intent) return '';
  return `<section class="panel intent-panel" aria-labelledby="intent-heading">
  <h2 id="intent-heading">Intent</h2>
  <p class="intent-text">${escapeHtml(intent)}</p>
</section>`;
}

export interface FailurePanelInput {
  stepNumber: number;
  action: string;
  name: string;
  error: string;
  selector?: string | null;
  screenshotSrc?: string | null;
}

export function buildFailurePanelHtml(failure: FailurePanelInput): string {
  const screenshotHtml = failure.screenshotSrc
    ? `<img class="failure-screenshot" src="${escapeHtml(failure.screenshotSrc)}" alt="Screenshot at failed step ${failure.stepNumber}" />`
    : '<p class="failure-missing-shot">No screenshot captured for this step.</p>';
  const selectorHtml = failure.selector
    ? `<div class="failure-meta-row"><span class="failure-meta-label">Selector</span><code>${escapeHtml(failure.selector)}</code></div>`
    : '';
  return `<section class="panel failure-panel" aria-labelledby="failure-heading">
  <h2 id="failure-heading">Failure</h2>
  <p class="panel-sub">Step ${failure.stepNumber}: ${escapeHtml(failure.action)} — ${escapeHtml(failure.name)}</p>
  ${screenshotHtml}
  <pre class="failure-error">${escapeHtml(failure.error)}</pre>
  ${selectorHtml}
</section>`;
}

export const RUN_REPORT_V2_STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080c10;color:#cdd9e5;font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;line-height:1.6;padding:32px 40px 48px}
.report{max-width:960px;margin:0 auto}
.hero{background:linear-gradient(180deg,#0d1117 0%,#080c10 100%);border:1px solid #30363d;border-radius:14px;padding:24px 28px;margin-bottom:24px}
.hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.hero h1{font-size:26px;color:#f0f6fc;font-weight:600;line-height:1.25}
.status-badge{display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.status-badge.passed{background:#122117;color:#56d364;border:1px solid #238636}
.status-badge.failed{background:#1c0f0f;color:#f85149;border:1px solid #da3633}
.status-badge.running,.status-badge.other{background:#161b22;color:#e3b341;border:1px solid #484f58}
.headline{background:#160b0b;border:1px solid #f8514966;border-radius:10px;padding:14px 18px;margin:14px 0 0;color:#ffb4b4;font-size:15px;line-height:1.5}
.hero-meta{color:#768390;font-size:13px;display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px}
.hero-meta span{white-space:nowrap}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:24px}
.stat{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:14px 18px}
.stat-val{font-size:22px;font-weight:600;color:#f0f6fc}
.stat-label{font-size:11px;color:#768390;text-transform:uppercase;letter-spacing:.05em;margin-top:4px}
.panel{background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:20px 22px;margin-bottom:20px}
.panel h2{font-size:15px;color:#f0f6fc;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.panel-sub{color:#768390;font-size:13px;margin-bottom:14px}
.intent-text{color:#cdd9e5;font-size:15px;line-height:1.55}
.history-sparkline{display:flex;align-items:flex-end;gap:3px;height:32px;padding:4px 0}
.history-bar{flex:1;min-width:4px;max-width:14px;height:100%;border-radius:2px;opacity:.85}
.history-bar.current{outline:2px solid #f0f6fc;outline-offset:1px;opacity:1}
.repair-card{background:#080c10;border:1px solid #30363d;border-radius:8px;padding:14px 16px;margin-bottom:12px}
.repair-card:last-child{margin-bottom:0}
.repair-card-header{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:10px;font-size:12px}
.repair-type{color:#39d0d8;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.repair-status{color:#768390}
.repair-step{color:#e3b341}
.repair-diff{background:#160b0b;border:1px solid #30363d;border-radius:6px;padding:10px 12px;font-family:ui-monospace,monospace;font-size:12px;color:#ffb4b4;white-space:pre-wrap;margin-bottom:10px}
.repair-commands{display:flex;flex-wrap:wrap;gap:8px}
.repair-commands code{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:4px 8px;font-size:12px;color:#79c0ff}
.command-list{list-style:none;display:flex;flex-direction:column;gap:10px}
.command-list li{display:flex;flex-direction:column;gap:4px}
.cmd-label{font-size:11px;color:#768390;text-transform:uppercase;letter-spacing:.05em}
.cmd-value{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:8px 10px;font-family:ui-monospace,monospace;font-size:13px;color:#79c0ff;word-break:break-all}
.failure-screenshot{width:100%;max-height:420px;object-fit:contain;display:block;border-radius:8px;border:1px solid #30363d;background:#000;margin-bottom:14px}
.failure-missing-shot{color:#768390;font-size:13px;font-style:italic;margin-bottom:14px}
.failure-error{background:#160b0b;border:1px solid #30363d;border-radius:8px;padding:12px 14px;font-family:ui-monospace,monospace;font-size:13px;color:#f85149;white-space:pre-wrap;margin-bottom:10px}
.failure-meta-row{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;font-size:13px}
.failure-meta-label{color:#768390;min-width:72px}
.failure-meta-row code{color:#39d0d8;font-family:ui-monospace,monospace}
.timeline{margin-bottom:24px}
.timeline h2{font-size:15px;color:#f0f6fc;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px}
.steps{display:flex;flex-direction:column;gap:8px}
.step{background:#0d1117;border:1px solid #30363d;border-radius:8px;overflow:hidden}
.step.failed{border-color:#f85149;box-shadow:0 0 0 1px #f8514933}
.step.passed{border-color:#21262d}
.step-header{display:flex;align-items:center;gap:10px;padding:12px 16px;font-family:ui-monospace,monospace;font-size:13px}
.step-icon{font-size:16px;min-width:20px}
.step-num{color:#768390;min-width:24px}
.step-action{color:#39d0d8;min-width:120px}
.step-label{color:#f0f6fc;flex:1}
.step-dur{color:#768390;font-size:12px;text-align:right}
.step-error{padding:10px 16px 12px 50px;color:#f85149;font-size:13px;font-family:ui-monospace,monospace;background:#160b0b;border-top:1px solid #30363d}
.step-screenshot{width:100%;max-height:320px;object-fit:contain;display:block;border-top:1px solid #30363d;background:#000}
footer.report-footer{margin-top:32px;padding-top:16px;border-top:1px solid #21262d;color:#768390;font-size:12px;display:flex;flex-wrap:wrap;gap:8px 16px}
`;
