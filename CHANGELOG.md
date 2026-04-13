# Changelog

All notable changes to GhostRun are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
