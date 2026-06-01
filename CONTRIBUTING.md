# Contributing to GhostRun

Thanks for taking the time to contribute! GhostRun is an open-source project and contributions of all kinds are welcome.

---

## Getting started

```bash
git clone https://github.com/TechBuiltBySharan/ghostrun
cd ghostrun
npm install
npm run build        # compile ghostrun.ts → ghostrun.js
node ghostrun.js help
```

---

## Project structure

```
ghostrun.ts          # Main CLI — all commands live here
mcp-server.ts        # MCP server — delegates flow execution to ghostrun.js
service-bridge.ts    # Mailpit, webhooks, Postgres helpers
project-scope.ts     # Per-repo .ghostrun/ workspace
account-scope.ts     # Multi-account profile auth
run-report-v2.ts     # Run Report v2 HTML builder
templates/           # Profile and CI templates
packages/            # Extracted modules (database, executor, core, …)
tests/unit/          # Fast unit tests
tests/e2e/           # Browser and API integration tests
docs/                # Human onboarding and product docs
AGENTS.md            # Guide for AI agents (Claude, Cursor, MCP)
```

The published npm package ships compiled `ghostrun.js` and `mcp-server.js` (esbuild bundle).

---

## How to contribute

### Bug reports

Open an issue with:
- The exact command you ran
- What you expected vs what happened
- Your OS and Node version (`node --version`)
- Any error output

### Feature requests

Open an issue describing the use case. Explain what you're trying to do, not just the feature itself.

### Pull requests

1. Fork the repo and create a branch: `git checkout -b fix/my-fix`
2. Make your changes in `ghostrun.ts`
3. Run `npm run build` to compile
4. Test manually: `node ghostrun.js <your-command>`
5. Open a PR with a clear description of what changed and why

### Adding a flow template

Templates live in `templates/` as `.flow.json` files. Copy an existing one as a starting point. They use `{{VARIABLE}}` placeholders for anything site-specific.

---

## Development tips

```bash
# Quick rebuild and test
npm run build && node ghostrun.js help

# Watch for changes (no watcher built in — just re-run build)
npm run build

# Run against the test API server
node test-api-server.mjs &
ghostrun flow:import test-flows/health-check.flow.json
ghostrun run "API Health Check"
```

---

## Code style

- TypeScript, no external formatter enforced
- Keep functions focused — one command per `async function run*()`
- New commands need: a function, a `case` in the switch, and a help entry
- No new runtime dependencies without discussion (bundle size matters)

---

## Questions?

Open an issue or reach out at [builtbysharan.com](https://builtbysharan.com).
