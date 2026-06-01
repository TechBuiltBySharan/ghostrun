# GhostRun

**The local-first QA agent for SaaS teams.**

Record browser flows once, replay them in CI, monitor staging, and let AI assistants run your test suite via MCP — all on your machine. No cloud account required. Secrets stay in env vars and CI secrets, not in the npm package.

[![npm version](https://img.shields.io/npm/v/ghostrun-cli)](https://www.npmjs.com/package/ghostrun-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **AI agents (Claude, Cursor, etc.):** start with [AGENTS.md](AGENTS.md) — capabilities, auth patterns, MCP workflows, and SaaS readiness.

## Why GhostRun?

| Capability | GhostRun |
|------------|----------|
| Browser + API + load tests | One CLI, one project workspace (`.ghostrun/`) |
| SaaS staging auth | Form login, OTP bypass, bearer — Mailpit optional |
| Multi-tenant verification | `db:query` / `db:assert` against staging Postgres (RLS checks) |
| Webhook testing | `webhook:wait`, `webhook:assert`, `assert:webhook-signature` |
| Flow discovery | `ghostrun explore <url>` — BFS crawl + AI flow suggestions |
| AI assistant integration | MCP server — 16 tools |
| CI/CD gate | `--ci`, JUnit, `report publish`, GitHub issues |
| Failure reporting | Evidence bundle + Run Report v2 per run |
| Self-healing | Reviewable repair proposals (never silent in CI) |
| Monitoring | Intervals, cron, Slack/webhook alerts |

## Install

```bash
npm install -g ghostrun-cli
cd your-saas-app-repo
ghostrun          # interactive setup — .ghostrun/ + staging profile
ghostrun audit      # scan for secret leaks before commit
```

## Quick Start

```bash
# Record a browser flow
ghostrun learn https://staging.yourapp.com

# Or auto-discover candidate flows from a staging URL (BFS crawl + AI)
ghostrun explore https://staging.yourapp.com

# Or interactive menu
ghostrun author

# Run against staging (set password in env first)
export STAGING_QA_PASSWORD='your-qa-password'
ghostrun run login --profile staging

# CI mode
ghostrun run smoke --profile staging --ci --reporter junit

# Publish artifacts for CI dashboard
ghostrun report publish --dir ./test-results/
```

## Project workspace

Each app repo gets its own `.ghostrun/`:

- **Commit:** `profiles/`, `flows/`, `suites/`
- **Gitignore:** `data/`, `runs/`, `auth/secrets/`, `auth/storage-state/`

Database: `.ghostrun/data/ghostrun.db` (per repo, not global).

See [docs/workspace.md](docs/workspace.md).

## SaaS auth (no Mailpit required)

```bash
ghostrun profile create staging https://staging.example.com
ghostrun profile use staging
export STAGING_QA_PASSWORD='...'
ghostrun run checkout --profile staging
```

Profile template: `templates/ghostrun-profile-staging-minimal.json`

Optional Mailpit for magic-link flows only — see [AGENTS.md](AGENTS.md#optional-mailpit-magic-link-flows-only).

**Phone / WhatsApp OTP (staging bypass):** use `auth.strategy: otp-bypass` with `STAGING_TEST_OTP=000000` (or your staging test code). Template: `templates/ghostrun-profile-staging-otp-example.json`

**Multi-tenant RLS checks:** add `profile.services.postgres` and use `db:assert` steps after browser flows — see [REFERENCE.md](REFERENCE.md#flow-actions).

## MCP Server

Connect Claude Desktop or Cursor to run flows, inspect failures, and review repairs:

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "ghostrun-mcp",
      "cwd": "/path/to/your-saas-app"
    }
  }
}
```

Full setup: [MCP-SETUP.md](MCP-SETUP.md) · Agent guide: [AGENTS.md](AGENTS.md)

## Key commands

| Command | Description |
|---------|-------------|
| `ghostrun` | Home menu (zero-config entry) |
| `ghostrun learn <url>` | Record a flow |
| `ghostrun explore <url>` | Auto-discover flows via BFS crawl + AI |
| `ghostrun run <id> --profile staging --ci` | Run in CI mode |
| `ghostrun suite:run smoke --ci` | Run a suite |
| `ghostrun report publish --create-issues` | CI artifacts + GitHub issue |
| `ghostrun repair list` | Review failure fixes |
| `ghostrun doctor` | Health check |
| `ghostrun services doctor` | Optional Mailpit/webhooks only |

Full reference: [REFERENCE.md](REFERENCE.md)

## CI/CD

```yaml
jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npx playwright install chromium
      - run: ghostrun suite:run smoke --profile staging --ci --reporter junit
        env:
          STAGING_QA_PASSWORD: ${{ secrets.STAGING_QA_PASSWORD }}
      - run: ghostrun report publish --dir ./test-results/
        if: always()
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ghostrun-results
          path: test-results/
```

Details: [docs/ci-cd.md](docs/ci-cd.md)

## Documentation

| Doc | Audience |
|-----|----------|
| [AGENTS.md](AGENTS.md) | **AI agents** — start here |
| [docs/getting-started.md](docs/getting-started.md) | Human onboarding |
| [REFERENCE.md](REFERENCE.md) | Complete CLI reference |
| [MCP-SETUP.md](MCP-SETUP.md) | MCP configuration |
| [docs/workspace.md](docs/workspace.md) | `.ghostrun/` layout |
| [docs/security.md](docs/security.md) | Secrets & privacy |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Development

```bash
npm install
npm run build
npm run test:unit    # 108+ tests
```

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/TechBuiltBySharan/ghostrun).

## License

MIT
