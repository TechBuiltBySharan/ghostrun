# GhostRun — Guide for AI Agents

**Version:** 2.0.0-alpha.3  
**Audience:** Claude, Cursor, Copilot, and any MCP-capable assistant operating GhostRun for a SaaS team.

GhostRun is a **local-first QA agent**: record browser/API flows, run them against staging with shared credentials, publish CI artifacts, and investigate failures — without a cloud account.

---

## How to think about GhostRun

| User goal | What to do |
|-----------|------------|
| First-time setup in an app repo | Run `ghostrun` (no args) — interactive funnel creates `.ghostrun/` + staging profile |
| Record a user journey | `ghostrun learn <url>` or `ghostrun author` → Record browser flow |
| Run smoke tests | `ghostrun run <flow> --profile staging --ci` |
| Run a suite | `ghostrun suite:run smoke --profile staging --ci` |
| CI gate + artifacts | `--ci --reporter junit` then `ghostrun report publish --dir ./test-results/` |
| Investigate failure | `ghostrun run:show <id>` or read `.ghostrun/runs/<id>/report.html` |
| Fix broken selector | `ghostrun repair list` → review → `ghostrun repair apply <id>` (never auto-apply in CI) |
| AI assistant integration | MCP server (`ghostrun-mcp`) — see [MCP-SETUP.md](MCP-SETUP.md) |
| Password / form login SaaS | Profile `auth.strategy: form` + env secrets — **no Mailpit required** |
| Phone / WhatsApp OTP SaaS | Profile `auth.strategy: otp-bypass` + `STAGING_TEST_OTP` env (staging test code, default `000000`) |
| Magic-link email SaaS | Optional `profile.services.email` (Mailpit) + `email:*` flow actions |
| OAuth / SSO | `auth.strategy: storage-state` — record session once, reuse |

**Default entry:** `ghostrun` alone opens the smart home menu. No commands to memorize.

---

## Project layout (per-repo scope)

All project data lives under **`.ghostrun/` in the app repo** — not shared across repos.

```text
.ghostrun/
  config.json              # activeProfile, AI policy, integrations
  project.json             # repo id + name
  data/ghostrun.db         # SQLite — flows, runs, steps (gitignored)
  profiles/*.json          # staging, production — COMMIT (no secrets in JSON)
  flows/browser/*.flow.json  # dual-written with DB — COMMIT
  suites/*.json            # test suites — COMMIT
  auth/secrets/            # gitignored — password files
  auth/storage-state/      # gitignored — OAuth sessions
  runs/<run-id>/           # gitignored — evidence bundle
    manifest.json
    failure.v1.json        # on failure
    steps.jsonl
    report.html              # Run Report v2
  reports/                 # JUnit XML
  proposals/repairs/       # AI repair proposals
  services/
    dev.compose.yml        # optional Mailpit/Postgres template
    webhooks/              # captured webhooks (gitignored)
```

**MCP server:** resolves DB from **cwd** → `.ghostrun/data/ghostrun.db`. Set `"cwd": "/path/to/app"` in MCP config.

**Legacy migration:** `ghostrun migrate project-scope` copies flows from `~/.ghostrun/data/ghostrun.db`.

---

## Authentication (SaaS)

### Multi-account by role (recommended)

SaaS apps need **email + password per account type**. This product uses **superadmin, admin, manager, guest**:

```json
{
  "name": "staging",
  "baseUrl": "https://staging.example.com",
  "defaultAccount": "manager",
  "auth": { "strategy": "form", "loginFlow": "login", "usernameVar": "testEmail" },
  "accounts": {
    "superadmin": {
      "label": "Super admin",
      "emailVar": "superadminEmail",
      "emailSecret": "STAGING_SUPERADMIN_EMAIL",
      "passwordSecret": "STAGING_SUPERADMIN_PASSWORD"
    },
    "admin": {
      "label": "Admin",
      "emailVar": "adminEmail",
      "emailSecret": "STAGING_ADMIN_EMAIL",
      "passwordSecret": "STAGING_ADMIN_PASSWORD"
    },
    "manager": {
      "label": "Manager",
      "emailVar": "managerEmail",
      "emailSecret": "STAGING_MANAGER_EMAIL",
      "passwordSecret": "STAGING_MANAGER_PASSWORD"
    },
    "guest": {
      "label": "Guest",
      "emailVar": "guestEmail",
      "emailSecret": "STAGING_GUEST_EMAIL",
      "passwordSecret": "STAGING_GUEST_PASSWORD"
    }
  }
}
```

**Secrets in CI / local shell (email + password for each role):**

```bash
export STAGING_SUPERADMIN_EMAIL='qa-superadmin@company.com'
export STAGING_SUPERADMIN_PASSWORD='...'
export STAGING_ADMIN_EMAIL='qa-admin@company.com'
export STAGING_ADMIN_PASSWORD='...'
export STAGING_MANAGER_EMAIL='qa-manager@company.com'
export STAGING_MANAGER_PASSWORD='...'
export STAGING_GUEST_EMAIL='qa-guest@company.com'
export STAGING_GUEST_PASSWORD='...'
```

**Run flows as a specific role:**

```bash
ghostrun run platform-settings --profile staging --account superadmin
ghostrun run team-admin --profile staging --account admin
ghostrun run workspace-home --profile staging --account manager
ghostrun run public-page --profile staging --account guest
# default role (manager) when --account omitted:
ghostrun run workspace-home --profile staging
```

**Manage accounts:**

```bash
ghostrun profile accounts list staging
ghostrun profile account add staging guest --email qa-guest@co.com
ghostrun profile show staging
```

Template: `templates/ghostrun-profile-staging-accounts-example.json`

Setup funnel (`ghostrun` in a new repo) walks through adding multiple account types interactively.

**Flow variables available after account selection:** `testEmail`, `accountEmail`, `adminEmail` (per `emailVar`), `accountType`, `PROFILE_AUTH_USERNAME`, password secret keys.

**Flows should use** `{{testEmail}}` or `{{adminEmail}}` in fill steps — the active `--account` sets the right email before login runs.

### Single-account (simple)

For one shared QA user only, use variables + one password secret (no `accounts` block):

```json
{
  "name": "staging",
  "baseUrl": "https://staging.example.com",
  "variables": { "testEmail": "qa@company.com" },
  "auth": {
    "strategy": "form",
    "loginFlow": "login",
    "usernameVar": "testEmail",
    "passwordSecret": "STAGING_QA_PASSWORD"
  }
}
```

Secrets resolve from (in order):
1. Environment variable (`export STAGING_QA_PASSWORD=...`)
2. `.ghostrun/auth/secrets/STAGING_QA_PASSWORD.txt`
3. Local vault (if configured)

**Auth strategies:** `none` | `form` | `otp-bypass` | `storage-state` | `basic-auth` | `bearer-token`

### OTP bypass (phone / WhatsApp staging)

When staging accepts a fixed test OTP (e.g. `000000`), use `otp-bypass` instead of Mailpit:

```json
{
  "name": "staging",
  "baseUrl": "https://staging.example.com",
  "variables": { "testPhone": "+919876543210" },
  "auth": {
    "strategy": "otp-bypass",
    "loginFlow": "phone-otp-login",
    "usernameVar": "testPhone",
    "otpSecret": "STAGING_TEST_OTP",
    "otpVar": "testOtp"
  }
}
```

```bash
export STAGING_TEST_OTP='000000'
ghostrun run community-join --profile staging
```

Login flow steps should fill OTP with `{{testOtp}}`. Variables injected: `testOtp`, `PROFILE_AUTH_OTP`.

Template: `templates/ghostrun-profile-staging-otp-example.json`

Templates:
- Minimal (creds only): `templates/ghostrun-profile-staging-minimal.json`
- Full (optional services): `templates/ghostrun-profile-staging-example.json`

### Optional: Mailpit (magic-link flows only)

Only add when the app sends sign-in links by email:

```json
"services": {
  "email": { "provider": "mailpit", "apiUrl": "http://localhost:8025" }
}
```

Start: `docker compose -f .ghostrun/services/dev.compose.yml --profile mailpit up -d`

Flow actions: `email:wait`, `email:extract-link`, `email:click-link`, `email:extract-otp`

**Do not assume Mailpit is running.** Check with `ghostrun services doctor`.

---

## Command reference (canonical)

### Zero-config

| Command | Purpose |
|---------|---------|
| `ghostrun` | Home menu — setup funnel, run flows, services, doctor |
| `ghostrun init [--yes]` | Machine setup (Playwright, `~/.ghostrun/`) |
| `ghostrun doctor` | Health check — Node, project DB, profile auth, optional services |
| `ghostrun audit` | Scan for secret leaks before commit |

### Author & run

| Command | Purpose |
|---------|---------|
| `ghostrun learn <url> [name]` | Record browser flow |
| `ghostrun author` | Interactive author menu |
| `ghostrun create "<description>"` | AI-generate flow |
| `ghostrun run <id\|name> [flags]` | Execute flow |
| `ghostrun explore <url>` | BFS crawl + AI flow discovery |

**Run flags:** `--ci` `--visible` `--profile <name>` `--account <id>` `--var k=v` `--output json` `--reporter junit` `--report html` `--video` `--trace` `--baseline`

### Flow management

| Command | Purpose |
|---------|---------|
| `ghostrun flow:list` | List flows + pass rates |
| `ghostrun flow:export <id>` | Export `.flow.json` |
| `ghostrun flow:import <file>` | Import flow |
| `ghostrun sync flows` | Import disk flow files into DB |

### Profiles (prefer `profile` subcommand; `profile:*` aliases still work)

| Command | Purpose |
|---------|---------|
| `ghostrun profile list` | List profiles |
| `ghostrun profile create staging [url]` | Create profile |
| `ghostrun profile use staging` | Set active profile |
| `ghostrun profile set staging baseUrl https://...` | Update field |
| `ghostrun profile accounts list staging` | List account types |
| `ghostrun profile account add staging admin --email ...` | Add role with secrets |

### Suites & CI

| Command | Purpose |
|---------|---------|
| `ghostrun suite:run smoke --profile staging --ci` | Run suite |
| `ghostrun report publish --dir ./test-results/` | Bundle HTML, JUnit, manifest, screenshots |
| `ghostrun report publish --create-issues` | + GitHub issue on failure (needs `GITHUB_TOKEN`) |
| `ghostrun integrations list\|test` | GitHub/Linear config |

### Repair & analysis

| Command | Purpose |
|---------|---------|
| `ghostrun run:list` / `run:show <id>` | Run history |
| `ghostrun run:analyze <id>` | AI failure explanation |
| `ghostrun repair list\|show\|apply` | Reviewable selector repairs |
| `ghostrun improve` | Suite health suggestions |

### Service Bridge (optional)

| Command | Purpose |
|---------|---------|
| `ghostrun services list` | Overview — creds-first |
| `ghostrun services doctor` | Check only configured services |
| `ghostrun services inbox` | Mailpit inbox (requires `services.email`) |
| `ghostrun services hook --daemon` | Webhook catcher on :8787 |

### Monitor

| Command | Purpose |
|---------|---------|
| `ghostrun monitor <flow> --interval 60` | Poll flow |
| `ghostrun monitor schedule add <flow> "0 9 * * *"` | Cron schedule |
| `ghostrun monitor daemon` | Local scheduler |

Full CLI reference: [REFERENCE.md](REFERENCE.md)

---

## Flow actions catalog

### Browser

`navigate` `click` `fill` `type` `select` `check` `press` `hover` `wait` `wait:text` `wait:url` `wait:ms`  
`assert:text` `assert:url` `assert:visible` `assert:element` `assert:title` `assert:value` `assert:count`  
`extract` `scroll:bottom` `scroll:load` `screenshot` `reload` `eval` `iframe:enter` `iframe:exit`

### API (no browser)

`http:request` `assert:status` `assert:body` `assert:header` `extract:json` `set:variable` `env:switch`

### SaaS email (optional Mailpit)

| Action | Fields | Notes |
|--------|--------|-------|
| `email:wait` | `to`, `subject` or `value`, `variable` | Polls Mailpit; sets `lastEmailBody` |
| `email:extract-link` | `variable` (source), `to` (output var) | Extracts first URL |
| `email:click-link` | `variable` (link var) | Browser navigate to magic link |
| `email:extract-otp` | `variable`, `value` (digit length) | 6-digit OTP |

### Webhooks & fixtures (optional)

| Action | Notes |
|--------|-------|
| `webhook:wait` | `path` or `value` — waits for hook catcher POST |
| `webhook:assert` | Assert JSON fields on captured webhook body (Razorpay/Meta payloads) |
| `assert:webhook-signature` | Verify HMAC signature (`header`, `secretSecret`, optional `prefix: sha256=`) |
| `services:seed` | Runs SQL fixtures from profile `services.postgres` |
| `db:query` | Run read-only SQL; stores rows in `variable` (default `queryResult`) |
| `db:assert` | SQL assertion — `assertType`: `scalar`, `count`, `empty`, `contains` |

Variables: `{{name}}` resolved from `--var`, profile, environment, prior extract steps.

---

## MCP tools (16)

Configure with `ghostrun-mcp` and **set cwd to the app repo**.

| Tool | Use when |
|------|----------|
| `list_flows` | Discover what tests exist |
| `get_flow` | Inspect steps before editing |
| `run_flow` | Execute single flow; pass `vars` object |
| `get_run_result` | Deep-dive on failure (steps, screenshots, AI summary) |
| `list_runs` | Recent history |
| `run_suite` | Batch run with optional `profile` |
| `list_profiles` | Check staging baseUrl + auth |
| `list_repair_proposals` / `get_repair_proposal` | Failure remediation |
| `author_flow` | Generate flow from natural language |
| `scrape_website` / `scrape_and_run_flow` | Page context + test |
| `get_status` / `get_ai_usage` | Health + cost |

**Agent workflow — investigate failure:**
1. `run_flow` → if failed, note `runId`
2. `get_run_result` → read `aiSummary`, failed step, `screenshotPath`
3. `list_repair_proposals` → suggest fix
4. **Do not apply repairs in CI** — human review or local `repair apply`

See [MCP-SETUP.md](MCP-SETUP.md) for config examples.

---

## CI/CD contract

```yaml
- run: npx playwright install chromium
- run: ghostrun suite:run smoke --profile staging --ci --reporter junit
  env:
    STAGING_QA_PASSWORD: ${{ secrets.STAGING_QA_PASSWORD }}
- run: ghostrun report publish --dir ./test-results/ --create-issues
  if: always()
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Rules for agents in CI:**
- Always pass `--ci` (no silent healing, non-zero exit on failure)
- Never mutate flows during CI runs
- Secrets via env / CI secret store — never commit
- Artifacts: `report publish` writes `ghostrun-report.html`, `ghostrun-junit.xml`, `manifest.json`

Details: [docs/ci-cd.md](docs/ci-cd.md)

---

## Reporting on failure

Every run writes evidence to `.ghostrun/runs/<id>/`:

| File | Content |
|------|---------|
| `manifest.json` | Schema v1.3 — artifact index |
| `failure.v1.json` | Canonical failure (headline, step, selector, signature) |
| `steps.jsonl` | Step-by-step log |
| `report.html` | Run Report v2 — sparkline, repair panel, next steps |

Publish for CI: `ghostrun report publish --dir ./test-results/`

Standards: [docs/reporting-standards.md](docs/reporting-standards.md)

---

## What agents should NOT do

- Assume global DB at `~/.ghostrun/` — use **project** `.ghostrun/data/ghostrun.db`
- Assume Mailpit is running — check profile or use form auth
- Auto-apply repairs in CI or on production-like profiles
- Commit secrets — use `auth/secrets/` (gitignored) or env vars
- Use removed legacy commands (`flow:schedule`, etc.) — use `monitor schedule` or `profile list`

---

## SaaS QA readiness (honest)

### Ready now ✅

- Per-repo isolation (flows, runs, profiles)
- Form login with shared QA credentials + env secrets
- **OTP bypass** — phone/WhatsApp staging flows with `otp-bypass` + test OTP env var
- **Multi-account by role** — superadmin, admin, manager, guest with email + password each
- **Postgres assertions** — `db:query` / `db:assert` for RLS and multi-tenant checks
- **Webhook assertions** — payload schema + HMAC signature verification
- Bearer token / basic auth / storage-state for OAuth
- Browser + API flows in one tool
- CI mode, JUnit, evidence bundles, Run Report v2
- GitHub issue creation on failure (`--create-issues`)
- MCP for autonomous run/investigate/repair-suggest loops
- Monitoring, suites, visual baselines, repair proposals
- PII sanitization + `ghostrun audit`

### Optional / manual setup ⚠️

- Magic-link email → enable Mailpit + `email:*` actions
- OAuth/SSO → record `storage-state` once
- Webhook-driven flows → `ghostrun services hook --daemon`
- Postgres fixtures → `services.postgres` + `pg` package

### Not yet / alpha limitations ❌

- Passkey / CAPTCHA / manual MFA (human must take over)
- Cloud email inboxes (only local Mailpit)
- Silent auto-heal in CI (by design — proposals only)
- Multi-repo dashboard (each repo is isolated)
- Package still monolith CLI (executor packages exist but CLI is primary)

**Verdict:** Ready as a **staging QA agent** for typical SaaS (form login, OTP bypass, CRUD flows, API checks, RLS assertions, CI gates). Treat **2.0.0-alpha.3** as alpha — pin version, run `ghostrun doctor` after upgrades.

---

## Doc index

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | Product overview + install |
| [REFERENCE.md](REFERENCE.md) | Complete CLI + flow JSON reference |
| [MCP-SETUP.md](MCP-SETUP.md) | MCP configuration |
| [docs/getting-started.md](docs/getting-started.md) | Human onboarding |
| [docs/workspace.md](docs/workspace.md) | `.ghostrun/` layout |
| [docs/ci-cd.md](docs/ci-cd.md) | Pipeline contract |
| [docs/security.md](docs/security.md) | Secrets + privacy |
| [docs/monitoring.md](docs/monitoring.md) | Schedules + alerts |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
