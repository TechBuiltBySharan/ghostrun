#!/usr/bin/env bash
# Populate GitHub releases, milestones, and historical closed issues for GhostRun.
# Requires: gh CLI authenticated as a collaborator on TechBuiltBySharan/ghostrun
set -euo pipefail

REPO="TechBuiltBySharan/ghostrun"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NOTES="$ROOT/.github/release-notes"

# Avoid invalid GITHUB_TOKEN overriding keyring auth
unset GITHUB_TOKEN GH_TOKEN 2>/dev/null || true

gh_cmd() { gh "$@" --repo "$REPO"; }

log() { printf '→ %s\n' "$*"; }

ensure_tag() {
  local tag="$1" sha="$2" message="$3"
  if git rev-parse "$tag" >/dev/null 2>&1; then
    log "tag $tag already exists"
  else
    log "creating tag $tag at ${sha:0:8}"
    git tag -a "$tag" "$sha" -m "$message"
    git push origin "$tag"
  fi
}

create_release() {
  local tag="$1" title="$2" prerelease="${3:-false}" notes_file="$4"
  if gh_cmd release view "$tag" >/dev/null 2>&1; then
    log "updating release $tag"
    gh_cmd release upload "$tag" "$notes_file" --clobber 2>/dev/null || true
    gh_cmd release edit "$tag" --title "$title" --notes-file "$notes_file" \
      $( [ "$prerelease" = "true" ] && echo --prerelease || echo --prerelease=false )
  else
    log "creating release $tag"
    gh_cmd release create "$tag" --title "$title" --notes-file "$notes_file" \
      $( [ "$prerelease" = "true" ] && echo --prerelease )
  fi
}

write_notes() {
  local file="$1"; shift
  mkdir -p "$NOTES"
  cat > "$file"
}

cd "$ROOT"

log "Updating repository metadata"
gh repo edit "$REPO" \
  --description "Local-first QA agent for SaaS teams — browser flows, API tests, CI gates, and MCP for AI assistants." \
  --homepage "https://www.npmjs.com/package/ghostrun-cli" \
  --add-topic qa-automation --add-topic playwright --add-topic test-automation \
  --add-topic cli --add-topic mcp --add-topic e2e-testing --add-topic local-first \
  --add-topic saas --add-topic browser-automation --enable-issues

log "Creating version milestones"
for m in "v1.0.x" "v1.1.x" "v1.2.x" "v1.3.x" "v2.0.0-alpha"; do
  if ! gh api "repos/TechBuiltBySharan/ghostrun/milestones" --jq ".[].title" 2>/dev/null | grep -qx "$m"; then
    gh api "repos/TechBuiltBySharan/ghostrun/milestones" -f title="$m" -f state=open >/dev/null
    log "milestone $m"
  fi
done

# --- Tags & releases (commit SHAs on master history) ---
ensure_tag v1.0.0 7b13d56 "GhostRun 1.0.0 — initial public release"
ensure_tag v1.1.0 d70fa5c "GhostRun 1.1.0 — repair proposals, report publish, MCP author_flow"
ensure_tag v1.1.1 d8684c0 "GhostRun 1.1.1 — ghostrun audit, publish safety gate"
ensure_tag v1.2.0 12c4755 "GhostRun 1.2.0 — visual regression, monitor daemon"
ensure_tag v1.3.0 9299118 "GhostRun 1.3.0 — evidence bundle v1, failure.v1.json"
ensure_tag v2.0.0-alpha.1 9299118 "GhostRun 2.0.0-alpha.1 — GitHub Issues integration"
ensure_tag v2.0.0-alpha.2 052ba91 "GhostRun 2.0.0-alpha.2 — project scope, Service Bridge"
ensure_tag v2.0.0-alpha.4 1b7b4a1 "GhostRun 2.0.0-alpha.4 — CI and e2e test fixes"

write_notes "$NOTES/v1.0.4.md" <<'EOF'
## GhostRun 1.0.4

### Added
- `--version` flag on the CLI
- MCP marked as beta in README

### Fixed
- Perf HTTP success metric calculation

```bash
npm install -g ghostrun-cli@1.0.4
```
EOF

write_notes "$NOTES/v1.0.0-reliability.md" <<'EOF'
## GhostRun 1.0.0-reliability (milestone)

Reliability milestone release — comprehensive test suite and open-source infrastructure hardening.

### Highlights
- Professional CI/test infrastructure
- Reliability improvements across flow execution
- 100% pass rate on core test suite at time of release

```bash
npm install -g ghostrun-cli
```
EOF

write_notes "$NOTES/v1.1.0.md" <<'EOF'
## GhostRun 1.1.0

### Added
- Repair proposals beyond selectors (assertion, wait, URL/config)
- `ghostrun improve` analytics and markdown reports
- Monitor webhook/Slack notifications
- `ghostrun report publish` — CI artifact bundles
- Canonical subcommands: `repair`, `report`, `profile`, `author create`
- MCP `author_flow` tool
- Profile auth templates (form + bearer-token)

### Fixed
- Monitor alerts now dispatch webhooks/Slack instead of terminal-only warnings
- AI flow preview no longer saves when `--preview --output json`
EOF

write_notes "$NOTES/v1.1.1.md" <<'EOF'
## GhostRun 1.1.1

### Added
- `ghostrun audit` — scan for secret leaks before commit
- `npm run publish:check` + `prepublishOnly` safety gate
- `docs/security.md` — secrets & privacy model
- `ghostrun init --yes` for non-interactive CI setup
- `.ghostrun/auth/secrets/` workspace pattern

### Changed
- README repositioned as local-first QA agent
- Hardened `.gitignore` for env files and run artifacts
EOF

write_notes "$NOTES/v1.2.0.md" <<'EOF'
## GhostRun 1.2.0

### Added
- Visual regression gate: `--baseline --baseline-threshold`
- `ghostrun monitor daemon` and schedule subcommands
- Scheduler PID file at `.ghostrun/scheduler.pid`
- GitHub Check Run template for CI
- Author benchmark tooling

### Changed
- Visual diff threshold via `policies.visualDiffThresholdPercent`
EOF

write_notes "$NOTES/v1.3.0.md" <<'EOF'
## GhostRun 1.3.0

### Added
- Evidence Bundle v1: `manifest.json`, `steps.jsonl`, `report.html` per run
- `failure.v1.json` canonical failure object
- `ghostrun integrations list|test`
- `ghostrun ai status|usage|sessions`
- `ghostrun report list`
- Optional `intent` field on flow nodes

### Changed
- Legacy colon commands removed — use `repair list`, `profile list`, etc.
- `report publish` ships `manifest.json` + `failure.v1.json`
- Loop guards: `maxRepairAttemptsPerRun`
EOF

write_notes "$NOTES/v2.0.0-alpha.1.md" <<'EOF'
## GhostRun 2.0.0-alpha.1

Alpha track for Run Report v2 and GitHub integrations.

### Added
- `ghostrun report publish --create-issues` via GitHub REST API
- Dedup open issues by `ghostrun-run` / `ghostrun-flow` markers
- `failure.v1.json` → `integrations.githubIssue` URL writeback
- `ghostrun integrations test github`
EOF

write_notes "$NOTES/v2.0.0-alpha.2.md" <<'EOF'
## GhostRun 2.0.0-alpha.2

### Added
- **Per-repo project scope** — `.ghostrun/data/ghostrun.db` in each app repo
- Flow file sync to `.ghostrun/flows/**/*.flow.json`
- `ghostrun migrate project-scope`
- **Service Bridge** — Mailpit email, webhook catcher, SQL fixtures
- `ghostrun services` commands + dev compose template
- MCP server resolves project-scoped DB from cwd

See [CHANGELOG.md](https://github.com/TechBuiltBySharan/ghostrun/blob/master/CHANGELOG.md) for full details.
EOF

write_notes "$NOTES/v2.0.0-alpha.3.md" <<'EOF'
## GhostRun 2.0.0-alpha.3

### Added
- `package.json` repository metadata for GitHub/npm discoverability
- **`otp-bypass` auth** — phone/WhatsApp staging with `STAGING_TEST_OTP`
- **`db:query` / `db:assert`** — Postgres RLS / multi-tenant verification
- **`webhook:assert`** and **`assert:webhook-signature`** (Razorpay, Meta, etc.)
- Multi-account profiles: superadmin, admin, manager, guest
- OTP profile template + explore in quick-start docs

```bash
npm install -g ghostrun-cli@2.0.0-alpha.3
```
EOF

write_notes "$NOTES/v2.0.0-alpha.4.md" <<'EOF'
## GhostRun 2.0.0-alpha.4

Patch release on the 2.0 alpha track — CI reliability and test portability.

### Fixed
- E2E tests use portable imports instead of hardcoded macOS paths
- Isolated temp `.ghostrun/` workspace for programmatic CLI tests
- CI matrix requires Node 20+ (Vitest 4 / Rolldown needs `util.styleText`)

```bash
npm install -g ghostrun-cli@2.0.0-alpha.3
# (package version unchanged; install from master until npm publish)
```
EOF

create_release v1.0.0 "GhostRun 1.0.0" false "$NOTES/v1.0.0.md"
# v1.0.3 release already published — leave as-is unless missing
if ! gh_cmd release view v1.0.3 >/dev/null 2>&1; then
  create_release v1.0.3 "GhostRun 1.0.3" false "$NOTES/v1.0.0.md"
fi
create_release v1.0.4 "GhostRun 1.0.4" false "$NOTES/v1.0.4.md"
create_release v1.0.0-reliability "GhostRun 1.0.0-reliability" true "$NOTES/v1.0.0-reliability.md"
create_release v1.1.0 "GhostRun 1.1.0" false "$NOTES/v1.1.0.md"
create_release v1.1.1 "GhostRun 1.1.1" false "$NOTES/v1.1.1.md"
create_release v1.2.0 "GhostRun 1.2.0" false "$NOTES/v1.2.0.md"
create_release v1.3.0 "GhostRun 1.3.0" false "$NOTES/v1.3.0.md"
create_release v2.0.0-alpha.1 "GhostRun 2.0.0-alpha.1" true "$NOTES/v2.0.0-alpha.1.md"
create_release v2.0.0-alpha.2 "GhostRun 2.0.0-alpha.2" true "$NOTES/v2.0.0-alpha.2.md"
create_release v2.0.0-alpha.3 "GhostRun 2.0.0-alpha.3" true "$NOTES/v2.0.0-alpha.3.md"
create_release v2.0.0-alpha.4 "GhostRun 2.0.0-alpha.4" true "$NOTES/v2.0.0-alpha.4.md"

# Mark latest stable release
gh_cmd release edit v1.0.4 --latest 2>/dev/null || true

log "Creating historical closed issues"
create_closed_issue() {
  local title="$1" body="$2" labels="$3" milestone="$4"
  local existing
  existing=$(gh_cmd issue list --state all --search "$title in:title" --json number --jq '.[0].number' 2>/dev/null || true)
  if [ -n "$existing" ] && [ "$existing" != "null" ]; then
    log "issue already exists: #$existing — $title"
    return
  fi
  local num
  num=$(gh_cmd issue create --title "$title" --body "$body" --label "$labels" --milestone "$milestone" | tail -1 | tr -cd '0-9')
  gh_cmd issue close "$num" --comment "Resolved in **$milestone**. See [releases](https://github.com/TechBuiltBySharan/ghostrun/releases)."
  log "closed #$num — $title"
}

create_closed_issue "bug: CLI missing --version flag" \
  "Running \`ghostrun --version\` did not print the package version.\n\n**Fixed in:** v1.0.4" \
  "bug" "v1.0.x"

create_closed_issue "bug: Monitor alerts not dispatching webhooks" \
  "Monitor consecutive failures printed terminal warnings but did not POST to configured webhook/Slack URLs.\n\n**Fixed in:** v1.1.0" \
  "bug" "v1.1.x"

create_closed_issue "feat: Secret leak audit before commit" \
  "Need a command to scan profiles, flows, and env files for accidental credential commits.\n\n**Shipped:** \`ghostrun audit\` in v1.1.1" \
  "enhancement" "v1.1.x"

create_closed_issue "feat: Visual regression baseline gate" \
  "Flows should fail CI when screenshots drift beyond a configurable pixel threshold.\n\n**Shipped:** \`--baseline --baseline-threshold\` in v1.2.0" \
  "enhancement" "v1.2.x"

create_closed_issue "feat: Evidence bundle and failure.v1.json" \
  "Runs need a canonical artifact layout for CI dashboards and future GitHub/Linear integrations.\n\n**Shipped:** Evidence Bundle v1 in v1.3.0" \
  "enhancement" "v1.3.x"

create_closed_issue "feat: GitHub Issue creation on CI failure" \
  "When a suite fails in CI, GhostRun should optionally open a deduplicated GitHub issue with failure context.\n\n**Shipped:** \`report publish --create-issues\` in v2.0.0-alpha.1" \
  "enhancement" "v2.0.0-alpha"

create_closed_issue "feat: Project-scoped .ghostrun/ workspace" \
  "Flows and runs should live per app repo under \`.ghostrun/\`, not a global \`~/.ghostrun\` DB.\n\n**Shipped:** v2.0.0-alpha.2" \
  "enhancement" "v2.0.0-alpha"

create_closed_issue "feat: OTP bypass auth for phone/WhatsApp staging" \
  "Community member flows using phone OTP are untestable without Mailpit. Staging should accept a fixed test OTP via env var.\n\n**Shipped:** \`auth.strategy: otp-bypass\` in v2.0.0-alpha.3" \
  "enhancement" "v2.0.0-alpha"

create_closed_issue "feat: db:assert for Postgres RLS testing" \
  "Browser-only flows cannot verify multi-tenant isolation. Need SQL assertions after UI steps.\n\n**Shipped:** \`db:query\` / \`db:assert\` in v2.0.0-alpha.3" \
  "enhancement" "v2.0.0-alpha"

create_closed_issue "feat: Webhook payload and HMAC signature assertions" \
  "webhook:wait captures payloads but cannot assert schema or Razorpay/Meta signatures.\n\n**Shipped:** \`webhook:assert\` + \`assert:webhook-signature\` in v2.0.0-alpha.3" \
  "enhancement" "v2.0.0-alpha"

create_closed_issue "bug: package.json missing repository field" \
  "npm package had no repository URL — hard for users to file issues or contribute.\n\n**Fixed in:** v2.0.0-alpha.3" \
  "bug" "v2.0.0-alpha"

create_closed_issue "feat: Multi-account profiles by SaaS role" \
  "Need superadmin, admin, manager, guest accounts with \`--account\` flag for role-based flows.\n\n**Shipped:** v2.0.0-alpha.3" \
  "enhancement" "v2.0.0-alpha"

create_closed_issue "bug: E2E tests use hardcoded macOS import paths" \
  "CI failed: Cannot find module /Volumes/DevAPFS/... in browser.test.ts\n\n**Fixed in:** v2.0.0-alpha.4" \
  "bug" "v2.0.0-alpha"

create_closed_issue "bug: CI fails on Node 18 with Vitest 4" \
  "Vitest 4 / Rolldown requires \`util.styleText\` (Node 20.12+).\n\n**Fixed in:** v2.0.0-alpha.4 — CI matrix now Node 20/22" \
  "bug" "v2.0.0-alpha"

create_closed_issue "documentation: Surface ghostrun explore in quick-start" \
  "Auto-discover flows via BFS crawl is powerful but buried in docs.\n\n**Fixed in:** v2.0.0-alpha.3 README and getting-started" \
  "documentation" "v2.0.0-alpha"

log "Done. View releases: https://github.com/TechBuiltBySharan/ghostrun/releases"
