# GhostRun Monitoring Guide

GhostRun supports two monitoring models. Choose based on your environment.

## Recommended: GitHub Actions (production)

For staging/production regression monitoring, use a scheduled GitHub Actions workflow. It is always-on, requires no local daemon, and integrates with PR checks and Slack via existing CI tooling.

Copy [templates/github-actions-ghostrun.yml](../templates/github-actions-ghostrun.yml) to `.github/workflows/ghostrun.yml`.

```yaml
on:
  schedule:
    - cron: '0 9 * * *'   # daily 9am UTC
  pull_request:
  workflow_dispatch:
```

Set secrets in GitHub (never commit them):

- `STAGING_API_TOKEN` — referenced by profile `tokenSecret`
- `ANTHROPIC_API_KEY` — optional, for post-failure summaries only

Notify on failure via:

- `GHOSTRUN_SLACK_WEBHOOK` in workflow env
- `--notify-webhook` on interval monitor (local)

## Local: interval monitor (development)

Poll a single flow on an interval with webhook/Slack alerts:

```bash
ghostrun monitor my-smoke-flow --interval 300 \
  --profile staging \
  --notify-webhook https://hooks.example.com/ghostrun \
  --notify-after 3
```

Environment variables:

- `GHOSTRUN_SLACK_WEBHOOK` — Slack incoming webhook URL
- `GHOSTRUN_NOTIFY_WEBHOOK` — generic JSON webhook

## Local: cron scheduler (development / small teams)

Register cron schedules and run the scheduler daemon:

```bash
# Add schedules
ghostrun monitor schedule add smoke-flow "0 9 * * *"
ghostrun monitor schedule list

# Run daemon (writes .ghostrun/scheduler.pid)
ghostrun monitor daemon
```

The daemon writes a PID file at `.ghostrun/scheduler.pid`. If the process dies, schedules stop — use GitHub Actions for production reliability.

Legacy aliases (deprecated):

- `ghostrun flow:schedule` → `ghostrun monitor schedule add`
- `ghostrun serve` → `ghostrun monitor daemon`

## Alert payload (webhook)

```json
{
  "event": "ghostrun.monitor.alert",
  "flowId": "...",
  "flowName": "Smoke Login",
  "profile": "staging",
  "consecutiveFailures": 3,
  "error": "assert:text failed",
  "timestamp": "2026-06-01T09:00:00.000Z"
}
```

No secrets are included in webhook payloads.

## Visual regression in monitoring

Capture baselines once UI is stable:

```bash
ghostrun baseline:set smoke-flow
```

Run with strict visual gate in CI or monitor:

```bash
ghostrun run smoke-flow --baseline --baseline-threshold 5 --profile staging
```

Visual diffs create repair proposals; re-capture baselines after intentional UI changes.
