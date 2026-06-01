# GhostRun CI/CD Notes

> **AI agents:** Pipeline contract and CI rules in [AGENTS.md](../AGENTS.md#cicd-contract).

## Goal

GhostRun is a deterministic pipeline gate for SaaS projects:

- headless execution
- stable exit codes
- machine-readable output (JUnit, JSON, evidence manifest)
- no interactive prompts
- no silent AI mutation during CI

## Recommended pipeline

1. Checkout app repo (includes `.ghostrun/profiles/`, flows)
2. `npm ci` + `npx playwright install chromium`
3. Set secrets: `STAGING_QA_PASSWORD`, `GITHUB_TOKEN` (for issue creation)
4. `ghostrun suite:run smoke --profile staging --ci --reporter junit`
5. `ghostrun report publish --dir ./test-results/ [--create-issues]`
6. Upload `test-results/` artifact
7. Fail job on non-zero exit from step 4

## Example GitHub Actions

```yaml
name: GhostRun QA

on: [push, pull_request]

jobs:
  ghostrun:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npx playwright install chromium

      - name: Run smoke suite
        run: ghostrun suite:run smoke --profile staging --ci --reporter junit
        env:
          STAGING_QA_PASSWORD: ${{ secrets.STAGING_QA_PASSWORD }}

      - name: Publish report
        if: always()
        run: ghostrun report publish --dir ./test-results/ --create-issues
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ghostrun-results
          path: test-results/
```

Template: `templates/github-actions-ghostrun.yml`

## Available today (v2.0.0-alpha.2)

| Feature | Command / flag |
|---------|----------------|
| CI-safe runs | `--ci` |
| JUnit output | `--reporter junit` |
| JSON output | `--output json` |
| Profile targeting | `--profile staging` |
| Artifact bundle | `ghostrun report publish` |
| Failure object | `.ghostrun/runs/<id>/failure.v1.json` |
| GitHub issues | `report publish --create-issues` |
| Secret scan | `ghostrun audit` |

## Operating rules

**CI runs pinned artifacts only.**

AI may:

- generate tests before commit
- summarize failures after a run
- propose repair patches (stored as proposals)

AI must not:

- rewrite committed tests during CI execution
- alter secrets or environment configuration
- apply repairs silently in CI

Selector failures produce **reviewable repair proposals**, not implicit runtime healing in `--ci` mode.

## Narrow auto-apply lane (local only)

Auto-apply is allowed only when **all** are true:

- project policy enables it
- interaction mode is `auto`
- run is **not** in CI
- target is not production-like
- repair attempt limits not exceeded

Even then: current run stays failed; rerun proves the fix.

## Mailpit in CI

**Not required** for password-login SaaS. Only add Mailpit to CI if testing magic-link flows — run Mailpit as a service container and set `profile.services.email`.

## Helper script

`scripts/ghostrun-ci.sh` — env vars `GHOSTRUN_SUITE` or `GHOSTRUN_FLOW`.
