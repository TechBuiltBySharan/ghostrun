# GhostRun

[![npm version](https://img.shields.io/npm/v/ghostrun-cli)](https://www.npmjs.com/package/ghostrun-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Downloads](https://img.shields.io/npm/dm/ghostrun-cli)](https://www.npmjs.com/package/ghostrun-cli)

**Record once. Replay as a ghost.**

GhostRun is a local-first CLI for browser automation, API testing, and load testing — all in one tool. Record a real browser flow, replay it headlessly, test REST APIs with assertions, and run VU-based load tests. No cloud. No account. Runs entirely on your machine.

```bash
npm install -g ghostrun-cli
```

![GhostRun Demo](https://raw.githubusercontent.com/TechBuiltBySharan/ghostrun/master/demo/out/ghostrun-demo.gif)

---

## Table of Contents

- [What is GhostRun?](#what-is-ghostrun)
- [Install](#install)
- [Quick Start](#quick-start)
- [The Three Modes](#the-three-modes)
  - [Browser Automation](#1-browser-automation)
  - [API Testing](#2-api-testing)
  - [Load Testing](#3-load-testing)
- [Commands](#commands)
  - [Setup](#setup)
  - [Recording](#recording)
  - [Running Flows](#running-flows)
  - [Flow Management](#flow-management)
  - [Environments](#environments)
  - [Run History](#run-history)
  - [Scheduling](#scheduling)
  - [Test Suites](#test-suites)
  - [Web Dashboard](#web-dashboard)
  - [Chat Assistant](#chat-assistant)
  - [MCP Server](#mcp-server)
- [Reports](#reports)
- [Selector Repair](#selector-repair)
- [Screenshot Diff](#screenshot-diff)
- [CI/CD Integration](#cicd-integration)
- [AI Setup](#ai-setup)
- [Data & Privacy](#data--privacy)
- [Contributing](#contributing)
- [Tech Stack](#tech-stack)
- [Trust & Transparency](#trust--transparency)
- [License](#license)

---

## What is GhostRun?

Most testing tools make you choose — browser OR API OR load testing. GhostRun does all three from a single CLI, using the same flow format.

| What you want to do | How GhostRun helps |
|---------------------|-------------------|
| Test a web UI regression | Record a browser flow once, replay headlessly on every deploy |
| Test a REST API | Write or import flows with HTTP requests, assertions, and variable extraction |
| Stress-test an endpoint | Run any API flow as a load test with configurable VUs and duration |
| Monitor a live site | Schedule flows to run on a cron and alert on failure |
| Give AI agents your test suite | MCP server exposes all flows as tools for Claude, Cursor, etc. |

Everything is stored locally in SQLite (`~/.ghostrun/`). No accounts, no telemetry, no cloud.

---

## Install

```bash
npm install -g ghostrun-cli
ghostrun init        # guided setup: installs Chromium, configures AI (optional)
```

Or run from source:

```bash
git clone https://github.com/TechBuiltBySharan/ghostrun
cd ghostrun && npm install && npm run build
node ghostrun.js init
```

**Requirements:** Node 18+, macOS/Linux/Windows

---

## Quick Start

**Record a browser flow:**

```bash
ghostrun learn https://yourapp.com     # real browser opens, you interact, GhostRun records
ghostrun run "My Flow"                 # replay headlessly
```

**Test an API:**

```bash
ghostrun flow:from-curl "curl -X POST https://api.example.com/login \
  -H 'Content-Type: application/json' \
  -d '{\"email\":\"user@example.com\",\"password\":\"secret\"}'"
ghostrun run "POST /login"
```

**Run a load test:**

```bash
ghostrun perf:run "POST /login" --vus 20 --duration 30
```

---

## The Three Modes

### 1. Browser Automation

GhostRun opens a real browser (Playwright/Chromium), watches your interactions, and saves them as a flow. Replay runs headlessly.

```bash
ghostrun learn https://yourapp.com     # record
ghostrun run <id|name>                 # replay headlessly
ghostrun run <id|name> --visible       # replay with browser window visible
```

**What gets recorded:** clicks, form fills, navigation, waits, checkboxes, dropdowns, keyboard input, file uploads, scroll, drag and drop.

**Selector repair:** If a flow breaks after a UI update, `ghostrun flow:fix <id>` opens the browser, replays up to the broken step, and lets you click the correct element. Selector is updated automatically — no manual JSON editing.

---

### 2. API Testing

When all steps in a flow are API actions (no `click`, `fill`, etc.), GhostRun skips Playwright entirely. Execution is ~30ms per run.

**Three ways to create an API flow:**

```bash
# From a curl command
ghostrun flow:from-curl "curl -X GET https://api.example.com/users \
  -H 'Authorization: Bearer {{token}}'"

# From an OpenAPI/Swagger spec
ghostrun flow:from-spec openapi.json       # JSON or YAML
ghostrun flow:from-spec swagger.yaml

# Import a hand-crafted .flow.json
ghostrun flow:import my-api-tests.flow.json
```

**API flow features:**
- HTTP requests with custom headers, JSON body, bearer auth
- Response assertions (status code, JSON path, headers, response time)
- Variable extraction from responses — use in subsequent steps
- Named environment profiles (dev / staging / prod)

---

### 3. Load Testing

Run any API flow as a load test. GhostRun sends parallel VU requests, collects timing, and prints a latency breakdown.

```bash
ghostrun perf:run <id|name>                               # defaults: 10 VUs, 30s
ghostrun perf:run <id|name> --vus 50 --duration 60 --ramp-up 10
ghostrun perf:compare <run-A-id> <run-B-id>              # diff two runs
ghostrun perf:export <id|name>                           # generate a k6 script
```

**Output includes:** HTTP requests, success rate, avg RPS, p50 / p95 / p99 latency, min/max, per-step breakdown, checks passed/failed.

**perf:compare** shows side-by-side deltas with color-coded improvement/regression:

```
                       Before     After      Delta
  p50 latency          142ms      98ms       ↓ 44ms  ✓
  p95 latency          310ms      201ms      ↓ 109ms ✓
  p99 latency          580ms      390ms      ↓ 190ms ✓
  avg RPS              47.2       68.1       ↑ 20.9  ✓
```

**perf:export** generates a valid k6 script with VU stages, `http.get`/`http.post` calls, `check()` assertions, and `Trend` metrics per step.

---

## Commands

### Setup

```bash
ghostrun init                          # guided setup wizard
ghostrun status                        # stats, AI provider, data path
```

### Recording

```bash
ghostrun learn <url>                   # open browser and record a flow
ghostrun learn <url> --name "Login"    # with an explicit name
```

### Running Flows

```bash
ghostrun run <id|name>                         # headless execution
ghostrun run <id|name> --visible               # show the browser window
ghostrun run <id|name> --var key=val           # inject a variable
ghostrun run <id|name> --output json           # JSON output (for scripting/CI)
ghostrun run <id|name> --report html           # save an HTML run report
ghostrun run <id|name> --session-save <name>   # save browser cookies/storage
ghostrun run <id|name> --session-load <name>   # restore browser cookies/storage
```

### Flow Management

```bash
ghostrun flow:list                         # list all flows
ghostrun flow:rename <id|name> <new-name>  # rename a flow
ghostrun flow:clone <id|name>              # duplicate a flow
ghostrun flow:delete <id|name>             # delete a flow
ghostrun flow:export <id|name>             # export to .flow.json
ghostrun flow:import <file>                # import from .flow.json
ghostrun flow:fix <id|name>                # fix broken selectors interactively
ghostrun flow:from-curl "<curl>"           # create a flow from a curl command
ghostrun flow:from-spec <file>             # create flows from an OpenAPI spec
```

### Environments

Named variable sets injected at run time. Perfect for dev / staging / prod.

```bash
ghostrun env:create <name>             # create an environment (dev/staging/prod)
ghostrun env:set <name> <key> <value>  # add or update a variable
ghostrun env:list                      # list all environments
ghostrun env:show <name>               # show variables in an environment
ghostrun env:use <name>                # set as the active environment
```

Reference variables in any URL, header, or body field with `{{variableName}}`. The active environment's variables are injected automatically before each run.

### Run History

```bash
ghostrun run:list                      # list recent runs
ghostrun run:show <id>                 # step-by-step detail, screenshots, extracted data
ghostrun run:diff <id1> <id2>          # pixel-level screenshot comparison
ghostrun run:analyze <id>              # AI failure analysis (requires AI setup)
ghostrun var:dump <run-id>             # show all variables extracted during a run
```

### Scheduling

```bash
ghostrun flow:schedule <id> "<cron>"   # e.g. "0 9 * * *" = daily at 9am
ghostrun schedule:list                 # list all schedules
ghostrun schedule:remove <id>          # remove a schedule
ghostrun serve                         # start the scheduler daemon
```

### Test Suites

Group flows and run them together:

```bash
ghostrun suite:create <name>           # create a suite
ghostrun suite:add <suite> <flow>      # add a flow to the suite
ghostrun suite:run <suite>             # run all flows in the suite
ghostrun suite:list                    # list suites
ghostrun suite:show <suite>            # show flows in a suite
```

### Web Dashboard

```bash
ghostrun serve --ui                    # launch dashboard at http://localhost:3000
ghostrun serve --ui --port 8080        # custom port
```

The dashboard shows all flows with one-click run, a live log stream, run history, and a chat tab.

### Chat Assistant

Ask questions about your flows in plain English:

```bash
ghostrun chat
```

Examples:
- `did my login flow pass recently?`
- `what flows do I have?`
- `run the login flow`  ← executes with confirmation

Requires Ollama (local, free) or an Anthropic API key. See [AI Setup](#ai-setup).

### MCP Server

Expose GhostRun to AI agents (Claude Desktop, Cursor, etc.):

```bash
node mcp-server.js
```

Tools exposed: `list_flows`, `get_flow`, `run_flow`, `get_run_result`, `list_runs`, `delete_flow`, `get_status`.

See [MCP-SETUP.md](MCP-SETUP.md) for connection setup.

---

## Reports

```bash
ghostrun run <id> --report html           # browser or API run report
ghostrun perf:run <id> --report html      # load test report
```

Dark-themed, self-contained HTML files saved to the current directory. Include per-step timing, status, screenshots (for browser flows), and extracted data. Shareable without any external dependencies.

---

## Selector Repair

When a UI update breaks a selector:

```bash
ghostrun flow:fix <id|name>
```

The browser opens, replays all passing steps automatically, then **pauses on the broken step** and asks you to click the correct element. The selector is updated and saved. No JSON editing needed.

---

## Screenshot Diff

Compare any two runs pixel-by-pixel — no AI needed:

```bash
ghostrun run:diff <run1-id> <run2-id>
```

```
  Step  Status    Diff %  Name
  ───────────────────────────────────────────
     1  same        0.0%  Navigate to homepage
     2  same        0.1%  Click Login
     3  changed    12.4%  Fill email field
     4  same        0.0%  Submit form

  3 same  1 changed
  Diff images: ~/.ghostrun/diffs/abc123_vs_def456/
```

---

## CI/CD Integration

GhostRun exits with code `1` on failure and `0` on success — standard CI behaviour, no extra flags needed.

### GitHub Actions example

```yaml
# .github/workflows/ghostrun.yml
name: GhostRun Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install GhostRun
        run: npm install -g ghostrun-cli

      - name: Install Playwright browsers
        run: npx playwright install chromium --with-deps
        # Skip this step for pure API flows — no browser needed

      - name: Import and run flows
        run: |
          ghostrun flow:import test-flows/auth.flow.json
          ghostrun run "Auth Flow" --report html

      - name: Upload reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ghostrun-reports
          path: ghostrun-report-*.html
```

---

## AI Setup

Every core feature works with zero AI. AI adds failure explanations and a chat interface — both are optional.

### Option 1 — Ollama (local, recommended)

No API key, no internet required. Runs on your machine.

```bash
brew install ollama
ollama serve &
ollama pull gemma3:4b          # 2.6 GB, fast on Apple Silicon
```

| Model | Size | Best for |
|-------|------|---------|
| `gemma3:4b` | 2.6 GB | Apple Silicon M1/M2/M3 |
| `gemma2:9b` | 5.4 GB | Better quality |
| `llama3.2:3b` | 2.0 GB | Fastest, lighter quality |

Override: `export GHOSTRUN_OLLAMA_MODEL=llama3.2:3b`

### Option 2 — Anthropic (cloud fallback)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### Fallback order

```
Run → try Ollama → if down → try Anthropic → if no key → skip AI silently
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GHOSTRUN_AI_PROVIDER` | `auto` | `ollama`, `anthropic`, or `auto` |
| `GHOSTRUN_OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `GHOSTRUN_OLLAMA_MODEL` | auto-detected | Model to use with Ollama |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (cloud fallback) |

---

## Data & Privacy

All data lives locally in `~/.ghostrun/`:

```
~/.ghostrun/
├── data/ghostrun.db       # SQLite: flows, runs, steps, schedules, environments
├── screenshots/           # PNG per step per run
├── baselines/             # Visual baseline reference screenshots
└── diffs/                 # Screenshot diff images
```

**PII sanitization:** Emails, phone numbers, credit cards, JWTs, API keys, and passwords are redacted before storage. Nothing sensitive is sent to AI unless you explicitly call `run:analyze`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started, and [REFERENCE.md](REFERENCE.md) for the full flow actions reference.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (Node.js 18+) |
| Browser automation | [Playwright](https://playwright.dev) / Chromium |
| Database | [SQLite](https://www.sqlite.org) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Bundler | [esbuild](https://esbuild.github.io) |
| CLI framework | [Yargs](https://yargs.js.org) |
| Web dashboard | [Express](https://expressjs.com) |
| Screenshot diff | [Pixelmatch](https://github.com/mapbox/pixelmatch) |
| Local AI | [Ollama](https://ollama.com) (optional) |
| Cloud AI | [Anthropic Claude](https://www.anthropic.com) (optional fallback) |
| MCP server | [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) |

---

## Trust & Transparency

- **100% local by default** — no cloud, no telemetry, no tracking
- **Open source (MIT)** — full source at [github.com/TechBuiltBySharan/ghostrun](https://github.com/TechBuiltBySharan/ghostrun)
- **No surprise costs** — AI works offline via [Ollama](https://ollama.com) (free); Anthropic key is optional
- **No vendor lock-in** — flows are plain JSON files you own; export, import, version-control them like code

---

## License

MIT — see [LICENSE](LICENSE)
