# Changelog

All notable changes to GhostRun are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- **`ghostrun learn --cdp <endpoint>`** — attach to an already-running browser over the Chrome DevTools Protocol instead of always launching a new one. Lets an AI agent (or anything else already driving a browser) hand that same session to GhostRun for recording, using the current tab and current URL if none is given. Never closes the attached browser when the recording session ends.

### Fixed

- **`ghostrun learn <url>`** — the command README/REFERENCE.md/in-app help have always documented as the primary way to record a flow was actually being rejected as a "removed legacy command," pointing users at `ghostrun author record <url>` instead. Restored as a real top-level command.

---

## [2.0.0-alpha.6] — 2026-06-01

### Fixed

- **Dependabot / supply chain** — removed stale `pnpm-lock.yaml` (source of 15+ false alerts), removed legacy `apps/` stubs with vulnerable `fastify`, dropped unused `uuid` from `@ghostrun/database` (uses `crypto.randomUUID`)
- Pinned `@modelcontextprotocol/sdk` to `^1.29.0`
- Added `.github/dependabot.yml` scoped to root npm package only

### Removed

- `pnpm-lock.yaml`, `pnpm-workspace.yaml` — project uses npm (`package-lock.json`) for CI and publish
- `apps/cli`, `apps/runtime` — unused monorepo stubs (main CLI is root `ghostrun.ts`)

### Changed

- Package version **2.0.0-alpha.6**

---

## [2.0.0-alpha.5] — 2026-06-01

### Fixed

- E2E Hacker News tests skip gracefully when datacenter IPs are blocked (`Sorry.` page)
- **0 npm audit vulnerabilities** — removed unused `electron` devDependency, applied Dependabot-aligned dependency updates

### Changed

- Package version **2.0.0-alpha.5**

---

## [2.0.0-alpha.3] — 2026-06-01

### Added

- **`package.json` repository field** — links to GitHub for issues and contributions
- **`otp-bypass` auth strategy** — phone/WhatsApp OTP flows with staging test code via env var (`STAGING_TEST_OTP`, default `000000`)
- **`db:query` / `db:assert` flow actions** — Postgres queries and SQL assertions for RLS / multi-tenant verification (requires `profile.services.postgres` + `pg` package)
- **`webhook:assert`** — assert JSON payload fields on captured webhooks
- **`assert:webhook-signature`** — verify HMAC webhook signatures (Razorpay, Meta, custom headers)
- **OTP profile template** — `templates/ghostrun-profile-staging-otp-example.json`
- **Explore in quick-start docs** — `ghostrun explore <url>` surfaced in README and getting-started
- **Multi-account profiles** — superadmin, admin, manager, guest with email + password per role; `--account` / `GHOSTRUN_ACCOUNT`

### Changed

- Package version **2.0.0-alpha.3**
- **Mailpit is optional** — staging profiles no longer auto-enable Service Bridge; setup funnel prompts for QA credentials first
- `doctor` / `services doctor` skip Mailpit unless `profile.services.email` is configured
- `webhook:wait` stores capture headers in `{var}Headers` for signature verification
- Documentation updated across README, AGENTS.md, REFERENCE.md for new auth and actions

---

## [2.0.0-alpha.2] — 2026-06-01

### Added

- **Per-repo project scope** — flows, runs, screenshots, and SQLite DB live under `.ghostrun/` in each repo (`.ghostrun/data/ghostrun.db`)
- **Flow file sync** — flows dual-write to `.ghostrun/flows/**/*.flow.json` for git-friendly review and `ghostrun sync flows`
- **`ghostrun migrate project-scope`** — copy flows from legacy `~/.ghostrun/data/ghostrun.db` into the current project
- **Service Bridge** — Mailpit email (`email:wait`, `email:extract-link`, `email:click-link`, `email:extract-otp`), local webhook catcher (`webhook:wait`), optional SQL fixtures (`services:seed`)
- **`ghostrun services`** — `list`, `doctor`, `inbox`, `hooks`, `hook --daemon`, `up`, `seed`
- **Dev stack template** — `.ghostrun/services/dev.compose.yml` (Mailpit, Redis, Postgres)
- **Staging profile template** — `services` block with Mailpit + webhook + Postgres fixtures
- **MCP server** — resolves project-scoped DB from cwd

### Changed

- Setup funnel creates staging profile with Service Bridge defaults and dev compose template
- Home menu adds **Service Bridge** submenu; `doctor` checks project DB + services
- Package version **2.0.0-alpha.2**

---

## [2.0.0-alpha.1] — 2026-06-01

### Added

- **GitHub Issues integration** — `ghostrun report publish --create-issues` creates issues via GitHub REST API (`GITHUB_TOKEN` / `GH_TOKEN`) when `integrations.github.enabled` is set
- **Dedup** — open issues with the configured labels are searched for matching `ghostrun-run` / `ghostrun-flow` markers before creating a new issue
- **`failure.v1.json` → `integrations.githubIssue`** — issue URL written back to the publish bundle and run evidence copy after create or dedup match
- **`ghostrun integrations test github`** — verifies repo API access, not only token presence

### Changed

- Package version **2.0.0-alpha.1** (alpha track for Run Report v2 + integrations)

---

## [1.3.0] — 2026-06-01

### Added

- **Evidence Bundle v1**: every run writes `.ghostrun/runs/<id>/manifest.json`, `steps.jsonl`, `report.html`
- **failure.v1.json** on failed runs — canonical failure object for reports, CI, and future Linear/GitHub integrations
- **Report headline** — HTML reports show a one-line failure summary at the top
- **`ghostrun integrations list|test`** — scaffold for GitHub Issues and Linear config validation
- **`ghostrun ai status|usage|sessions`** — canonical AI subcommands
- **`ghostrun report list`** — list recent runs
- **`templates/ci/open-repair-pr.mjs`** — structured issue body from `failure.v1.json`
- Optional **`intent`** field on recorded flow nodes (Flow Contract v2 prep)
- [docs/reporting-standards.md](docs/reporting-standards.md) — world-class reporting spec for 2.0

### Changed

- **Legacy colon commands removed** — use `ghostrun repair list`, `profile list`, `report show`, `monitor schedule`, `author record`, etc.
- **`ghostrun report publish`** — publishes `manifest.json` + `failure.v1.json` (replaces `ghostrun-manifest.json`)
- **Loop guards enforced** — `maxRepairAttemptsPerRun` blocks excess repair proposals per run

### Removed

- Deprecated aliases: `repair:list`, `profile:*`, `run:*`, `schedule:*`, `flow:schedule`, `learn`, `create`, `ai:*` (colon form)

---

## [1.2.0] — 2026-06-01

### Added

- **Visual regression gate**: `ghostrun run --baseline --baseline-threshold 5` fails on pixel diff; creates visual repair proposals
- **Monitor command model**: `ghostrun monitor daemon`, `monitor schedule list/add/remove`
- **Scheduler daemon**: PID file at `.ghostrun/scheduler.pid` with `--daemon` flag
- **GitHub Check Run**: `templates/ci/publish-github-check.mjs` for CI status integration
- **Author benchmark**: `ghostrun benchmark author` + `scripts/author-benchmark.mjs`
- **Legacy deprecation warnings**: colon-style commands warn with v1.3.0 removal date
- [docs/monitoring.md](docs/monitoring.md) — production (GHA) vs local monitoring guide

### Changed

- Visual diff threshold configurable via `policies.visualDiffThresholdPercent` in project config
- GitHub Actions template publishes Check Run + reports on every run

---

## [1.1.1] — 2026-06-01

### Added

- `ghostrun audit` — scan profiles, flows, and env files for secret leaks before commit
- `npm run publish:check` + `prepublishOnly` gate — blocks npm publish if tarball contains secrets or forbidden paths
- `docs/security.md` — full security & privacy model for SaaS QA teams
- `templates/ci/post-pr-comment.mjs` — PR comment script (no secrets in comment body)
- `ghostrun init --yes` — non-interactive init for CI
- `.ghostrun/auth/secrets/` workspace with gitignore + README

### Changed

- README repositioned as a **local-first QA agent** with discoverability keywords
- GitHub Actions template: report publish, PR comments, pinned version
- Project `.gitignore` hardened for env files, auth state, and run artifacts

---

## [1.1.0] — 2026-06-01

### Added

**Product pillars**
- Repair proposals beyond selectors: assertion, wait, and URL/config failure proposals
- `ghostrun improve` analytics: failure rates, stale proposals, flaky flows, never-run flows, markdown reports
- Monitor notifications: `--notify-webhook`, `GHOSTRUN_SLACK_WEBHOOK`, `--notify-after`, per-profile metadata
- `ghostrun report publish` — bundle HTML, JUnit, screenshots, and manifest into `./test-results/`
- Canonical subcommands: `ghostrun repair`, `ghostrun report`, `ghostrun profile`, `ghostrun author create`

**Authoring**
- Context-rich AI flow generation using profile baseUrl, existing flows, and recent scrape selectors
- `ghostrun create` / `ghostrun author create` support `--profile`, `--base-url`, `--preview`, `--output json`

**MCP**
- `author_flow` tool — generate and save flows from natural language descriptions

**Profiles**
- Example local profile with form auth + staging bearer-token profile templates

**Tests**
- Unit tests for repair types, profile secret resolution, executor URL validation, and product feature helpers

### Changed

- Repair list/show/apply surfaces display repair type and value proposals
- Profile example templates aligned with supported auth strategies (`tokenSecret`, `loginFlow`)

### Fixed

- Monitor alerts now dispatch webhooks/Slack instead of terminal-only warnings
- AI flow preview mode no longer saves flows when `--preview --output json` is used

---

## [1.0.4] — 2026-05-31

### Added

- Initial release.

---

## [1.0.0] — 2026-04-14

### Added

**Core CLI**
- `ghostrun learn <url>` — record browser flows interactively with Playwright
- `ghostrun run <flow>` — replay flows, with `--output json` for machine-readable results
- `ghostrun run <flow> --report html` — generate a self-contained HTML run report
- `ghostrun list` — list all saved flows
- `ghostrun flow:import` / `ghostrun flow:export` — share flows as JSON files
- `ghostrun flow:rename <id> <new-name>` — rename a saved flow
- `ghostrun flow:clone <id>` — duplicate a flow with a new ID
- `ghostrun flow:from-curl "<curl command>"` — generate an API test flow from a curl command
- `ghostrun flow:from-spec <openapi.json|yaml>` — generate flows from an OpenAPI/Swagger spec
- `ghostrun env:set` / `ghostrun env:list` — manage named environment profiles (staging, prod, etc.)

**API Testing**
- `http:request` action — supports GET, POST, PUT, PATCH, DELETE with headers and body
- `assert:response` action — assert status codes, JSON body values, response time
- `extract:json` action — pull values from responses into variables for downstream steps
- `set:variable` action — define variables inline within flows

**Performance Testing**
- `ghostrun perf:run <flow>` — run load tests with configurable VUs and duration
- `ghostrun perf:run <flow> --report html` — HTML performance report with p50/p95/p99 charts
- `ghostrun perf:compare <run1> <run2>` — side-by-side comparison of two perf runs

**MCP Server**
- Full MCP server (`mcp-server.js`) exposing 7 tools: `list_flows`, `get_flow`, `run_flow`, `get_run_result`, `list_runs`, `delete_flow`, `get_status`
- `run_flow` delegates to the CLI via `--output json` — always in sync, no duplication
- Works with Claude Desktop, Cursor, and any MCP-compatible client

**Templates** (installed via `ghostrun store install`)
- `github-login` — GitHub OAuth flow
- `checkout-flow` — e-commerce checkout automation
- `form-submit` — generic form fill and submit
- `api-auth-flow` — token auth + protected endpoint test
- `api-crud` — full CRUD lifecycle (create → read → update → delete)
- `load-baseline` — warmup → ramp → sustained → cooldown perf baseline

**Misc**
- `ghostrun monitor <url>` — continuous uptime monitoring with alerts
- `ghostrun init` — initialize GhostRun with guided setup
- `ghostrun store list` / `ghostrun store install` — template marketplace
- `--visible` flag on `learn` / `run` — show the browser window during execution
- SQLite-backed storage (`~/.ghostrun/data/ghostrun.db`)
- AI-powered failure summaries (requires `GHOSTRUN_ANTHROPIC_API_KEY`)

---

## Versioning

GhostRun follows [Semantic Versioning](https://semver.org/):
- **MAJOR** — breaking changes to CLI commands or flow JSON schema
- **MINOR** — new commands, new flow actions, new MCP tools
- **PATCH** — bug fixes, performance improvements, doc updates
