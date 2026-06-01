# GhostRun — Product Completion Status

**Last updated:** 2026-06-01 — v2.0.0-alpha.2

GhostRun is a **local-first SaaS QA agent**: record flows, run in CI, monitor staging, repair failures with review, and integrate with AI assistants via MCP.

> **AI agents:** Full capability map in [AGENTS.md](../AGENTS.md).

---

## Completed ✅

| Area | Status |
|------|--------|
| Zero-config home menu (`ghostrun`) | ✅ Setup funnel + contextual menu |
| Per-repo project scope (`.ghostrun/data/ghostrun.db`) | ✅ v2.0.0-alpha.2 |
| Flow file sync (`.ghostrun/flows/*.flow.json`) | ✅ |
| Profile auth (form, bearer, storage-state, basic) | ✅ Creds-first; Mailpit optional |
| Service Bridge (Mailpit, webhooks, SQL fixtures) | ✅ Opt-in only |
| Evidence Bundle + failure.v1.json + Run Report v2 | ✅ |
| CI contract (`--ci`, JUnit, report publish) | ✅ |
| GitHub Issues on failure (`--create-issues`) | ✅ v2.0.0-alpha.1 |
| MCP server (16 tools, project-scoped DB) | ✅ |
| Repair proposals + loop guards | ✅ |
| Monitor (interval + cron + webhooks/Slack) | ✅ |
| Visual regression (`--baseline`) | ✅ |
| Security (`ghostrun audit`, PII sanitization) | ✅ |
| Agent documentation ([AGENTS.md](../AGENTS.md)) | ✅ |

---

## In progress / alpha ⚠️

| Item | Notes |
|------|-------|
| Package architecture migration | CLI monolith; packages exist but not primary entry |
| 70% package test coverage | Foundation for public package API |
| Linear issue auto-create | GitHub done; Linear scaffold only |
| IDE extension | Future |

---

## Not yet ❌

| Item | Notes |
|------|-------|
| Passkey / CAPTCHA automation | Human takeover required |
| Cloud email inboxes | Local Mailpit only |
| Silent auto-heal in CI | By design |
| Runbook export | Planned 2.1 |

---

## Quick reference for SaaS teams

```bash
# Setup in app repo
cd your-saas-app
ghostrun                    # interactive — URL + QA creds

# Secrets (share with team via 1Password / CI secrets)
export STAGING_QA_PASSWORD='...'

# Author
ghostrun learn https://staging.example.com
ghostrun author create "login and verify dashboard"

# Run
ghostrun run smoke --profile staging --ci --reporter junit

# CI artifacts + optional GitHub issue
ghostrun report publish --dir ./test-results/ --create-issues

# Investigate
ghostrun run:show <id>
ghostrun repair list

# Optional magic-link only
docker compose -f .ghostrun/services/dev.compose.yml --profile mailpit up -d
```

See [docs/getting-started.md](getting-started.md), [docs/ci-cd.md](ci-cd.md), [docs/security.md](security.md).
