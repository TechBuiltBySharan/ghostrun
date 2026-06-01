# GhostRun Project Workspace

GhostRun treats each app repo's `.ghostrun/` directory as the **project workspace**. Flows, runs, profiles, and evidence are isolated per repo.

> **AI agents:** See [AGENTS.md](../AGENTS.md) for layout, auth, and MCP cwd requirements.

## Layout

```text
.ghostrun/
  config.json              # activeProfile, AI policy, integrations
  project.json             # repo id, name, root
  .gitignore
  data/
    ghostrun.db            # SQLite — flows, runs, steps (gitignored)
  profiles/                # COMMIT — environment definitions (no secrets in JSON)
  flows/
    browser/               # COMMIT — *.flow.json dual-written with DB
    api/
    generated/
  suites/                  # COMMIT
  environments/
  auth/
    storage-state/         # gitignored — OAuth sessions
    secrets/               # gitignored — password files
  fixtures/sql/            # optional SQL seeds
  services/
    dev.compose.yml        # optional Mailpit/Postgres template
    webhooks/              # gitignored — captured webhooks
  baselines/
  proposals/repairs/
  runs/                    # gitignored — evidence bundles per run
  reports/                 # JUnit XML
  ai/sessions/             # gitignored
  screenshots/             # gitignored
  sessions/
```

## What to commit

| Commit | Don't commit |
|--------|--------------|
| `profiles/*.json` (no secret values) | `data/ghostrun.db` |
| `flows/**/*.flow.json` | `runs/`, `reports/`, `screenshots/` |
| `suites/*.json` | `auth/secrets/`, `auth/storage-state/` |
| `config.json` (no secrets) | `services/webhooks/*.json` |

## Config

Primary project config: `./.ghostrun/config.json`

- `interactionMode`: `assist` or `auto`
- `activeProfile`
- AI provider policy
- CI AI policy (`allowAiInCi`)
- flow mutation / secret approval policies
- repair loop guards
- `integrations.github` / `integrations.linear`

## Profiles

Path: `./.ghostrun/profiles/*.json`

Typical fields:

- `baseUrl`, `variables`
- `auth.strategy`: `none` | `form` | `otp-bypass` | `storage-state` | `basic-auth` | `bearer-token`
- `auth.loginFlow`, `auth.usernameVar`, `auth.passwordSecret`, `auth.tokenSecret`
- `services` — **optional** (Mailpit, webhooks, Postgres fixtures)
- `metadata`

**Default SaaS path:** form auth + env secrets. Mailpit only for magic-link flows.

Templates:

- `templates/ghostrun-profile-staging-minimal.json`
- `templates/ghostrun-profile-staging-example.json`

Secret resolution order:

1. Environment variables
2. `./.ghostrun/auth/secrets/<NAME>.txt`
3. Local vault (when available)

## Evidence bundles

Each run writes to `./.ghostrun/runs/<run-id>/`:

- `manifest.json` (schema v1.3)
- `failure.v1.json` (on failure)
- `steps.jsonl`
- `report.html` (Run Report v2)

Publish for CI: `ghostrun report publish --dir ./test-results/`

## Repair workflow

Proposals: `./.ghostrun/proposals/repairs/`

Generated from failures → human or policy-gated auto review → `ghostrun repair apply <id>`. Never silent in CI.

## Legacy global DB

Older installs used `~/.ghostrun/data/ghostrun.db`. Migrate with:

```bash
ghostrun migrate project-scope
ghostrun sync flows
```
