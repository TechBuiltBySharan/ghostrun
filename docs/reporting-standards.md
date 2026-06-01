# GhostRun Reporting Standards

**Applies to:** v1.3 foundations → v2.0 world-class reports  
**Principle:** Every GhostRun surface should feel like it was designed by a team that *only* does QA evidence — crisp, complete, actionable, never generic.

---

## The bar

A report is not a log dump. It answers, in order:

1. **What failed?** (one sentence, plain English)
2. **Where in the product?** (URL, step, intent)
3. **What did we expect vs what happened?** (assertion diff, screenshot, network)
4. **What can I do next?** (repair proposal link, rerun command, tracker task)
5. **Who owns it?** (optional: Linear/GitHub issue already filed)

If any of those five are missing on failure, the report is not shippable.

---

## Report types (every step of the lifecycle)

| Moment | Artifact | Audience |
|--------|----------|----------|
| During run | Live step stream (terminal / IDE) | Developer |
| Run complete | **Run Report** (HTML + JSON) | Developer, reviewer |
| CI publish | **Evidence Bundle** + Check Run | CI, tech lead |
| PR | **PR Digest** (comment + inline links) | Team on GitHub |
| Monitor alert | **Alert Card** (Slack/webhook JSON) | On-call |
| Improve | **Quality Brief** (markdown) | EM, QA lead |
| Repair | **Proposal Brief** (diff + rationale) | Engineer fixing test |
| Tracker | **Work Item** (Linear/GitHub/Jira) | Whoever picks up the fix |

All formats share the same **canonical failure object** (see below).

---

## Canonical failure object

Every surface renders from one schema (`failure.v1.json`):

```json
{
  "runId": "…",
  "flowId": "…",
  "flowName": "Checkout smoke",
  "profile": "staging",
  "status": "failed",
  "headline": "Step 4: Pay button not found after cart update",
  "intent": "User completes payment with saved card",
  "failedStep": {
    "number": 4,
    "action": "click",
    "selector": "[data-testid=pay-now]",
    "durationMs": 12040,
    "error": "Timeout 10000ms waiting for selector",
    "url": "https://staging.app/checkout",
    "screenshot": "screenshots/step-4-failed.png",
    "trace": "trace.zip"
  },
  "context": {
    "previousStepPassed": true,
    "flakyScore": 0.12,
    "lastPassedAt": "2026-05-28T14:00:00Z",
    "repairProposalId": "prop_abc",
    "similarFailures30d": 3
  },
  "actions": {
    "rerun": "ghostrun run checkout-smoke --profile staging",
    "openReport": "file://.ghostrun/runs/…/report.html",
    "applyRepair": "ghostrun repair apply prop_abc",
    "viewProposal": "file://.ghostrun/proposals/repairs/prop_abc.json"
  },
  "integrations": {
    "githubIssue": "https://github.com/org/repo/issues/42",
    "linearIssue": "https://linear.app/team/issue/QA-128"
  }
}
```

**Rule:** HTML, Slack, Linear, and PR comments are *views* of this object — never separate ad-hoc copy.

---

## Run Report (HTML) — v2.0 target

### Structure

1. **Hero** — status badge, headline, profile, duration, flow version hash  
2. **Summary stats** — status, duration, passed/failed step counts  
3. **Next steps** — rerun command, repair list command, report path (and apply-repair when linked)  
4. **Failure panel** — full-width screenshot, error, selector (failed runs only)  
5. **Intent block** — what this step was trying to prove (from `failure.v1.json` or step name)  
6. **Repair panel** — proposal diff preview + show/apply commands (failed runs with linked proposals)  
7. **History** — pass/fail sparkline for last 30 runs on the same `flowId` (embedded at generation time)  
8. **Timeline** — step rail; failed step highlighted  
9. **Artifacts** — downloadable trace, HAR slice, JUnit, raw JSON *(v2.0-beta)*  
10. **Footer** — GhostRun version, evidence schema version, generated at  

**v2.0-alpha shipped:** items 1–8 and 10 in `report.html` via `run-report-v2.ts` helpers. Reports are self-contained in the evidence bundle zip (no CDN, relative screenshot paths, history/repair data baked into HTML at write time).

### Design principles

- **Scannable in 10 seconds** — hero + timeline enough for triage  
- **Deep in 60 seconds** — everything else one scroll  
- **Dark-first** — matches terminal/IDE; print-friendly CSS optional  
- **No external CDN** — report works offline in CI artifacts zip  
- **Accessible** — semantic HTML, alt text on screenshots, contrast AA  

### Anti-patterns (never ship)

- Wall of monospace without hierarchy  
- Screenshot missing on failure  
- “Test failed” with no step number  
- Report that requires GhostRun DB to open (must be self-contained in bundle)  

---

## PR Digest

Posted on failed CI runs. Max 400 words above fold.

```markdown
## GhostRun — checkout-smoke failed on staging

**Pay button not found** after cart update (step 4/7) · [Full report](artifact-link) · [Trace](trace-link)

| | |
|---|---|
| Profile | staging |
| Duration | 42s |
| Flaky score | 12% (3/25 recent) |
| Proposal | [Review repair](proposal-link) |

```bash
ghostrun run checkout-smoke --profile staging
ghostrun repair show prop_abc
```

→ Linear: [QA-128](link) (auto-created, label: ghostrun)
```

---

## Monitor alert card

Webhook payload (`alert.v1.json`) for Slack/Discord/PagerDuty:

- Color by severity (fail vs flaky-warning)  
- Headline + profile + interval  
- Thumbnail screenshot URL (signed or artifact path in GHA)  
- Buttons: View report · Rerun · Open issue  

---

## Quality Brief (`ghostrun improve`)

Executive-readable markdown:

- Top 5 failure signatures (clustered)  
- Flows with declining pass rate  
- Open proposals older than 7d  
- Coverage gaps (when App Memory Graph exists)  
- Recommended actions (numbered, not vague)  

---

## Implementation path

| Version | Deliverable |
|---------|-------------|
| v1.3 | `manifest.json` + `failure.v1.json` on failed runs; HTML report uses headline field |
| v2.0-alpha | New HTML template (`run-report-v2.ts`); timeline + repair panel + history sparkline + next steps |
| v2.0-beta | PR Digest + alert card from same canonical object |
| v2.0 | Print/PDF export, compare-two-runs view, IDE webview |
