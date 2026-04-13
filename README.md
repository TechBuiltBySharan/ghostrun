# GhostRun

Record once. Replay as a ghost.

Memory-driven browser automation and API testing CLI — record real browser flows, replay them headlessly, test REST APIs with assertions and variable extraction, run load tests, detect failures with AI analysis, and chat with your test suite. Entirely local.

![GhostRun Demo](demo/out/ghostrun-demo.gif)

---

## Install

```bash
npm install -g ghostrun-cli
```

Or run from source:

```bash
git clone https://github.com/your-org/ghostrun
cd ghostrun
npm install
npm run build
node ghostrun.js init   # guided setup
```

---

## Quick Start

```bash
ghostrun init                          # setup wizard: installs Chromium, configures AI
ghostrun learn https://yourapp.com     # record a browser flow
ghostrun api:learn                     # import a .flow.json with API actions
ghostrun run <flow-id>                 # replay headlessly (browser or API)
ghostrun perf:run <flow-id>            # load test an API flow (VU-based)
ghostrun chat                          # AI chat: ask questions, run flows by name
ghostrun serve --ui                    # web dashboard at http://localhost:3000
```

---

## What Needs AI vs What Doesn't

Every core feature works with zero AI. AI is an optional enhancement.

| Feature | AI Required? | Notes |
|---------|:------------:|-------|
| Browser recording | No | Real click/input capture via Playwright |
| Flow execution | No | Headless Playwright replay |
| Screenshot capture | No | PNG per step, pass and fail |
| Failure detection | No | Stops on error, shows what failed |
| Selector repair (`flow:fix`) | No | Interactive browser-based fix |
| Screenshot diff (`run:diff`) | No | Pixel comparison, no AI needed |
| Flow scheduling | No | Cron-based, runs offline |
| Monitor & diff extracted data | No | `ghostrun monitor <flow>` |
| PII sanitization | No | Regex-based, local only |
| Web dashboard | No | `ghostrun serve --ui` |
| **API testing** | No | HTTP requests, assertions, variable extraction |
| **Environment profiles** | No | Named env sets, injected at runtime |
| **Load testing** | No | VU-based perf runs, p50/p95/p99 stats |
| **k6 export** | No | `perf:export` generates a k6 script |
| **Failure analysis** | Optional ✨ | Plain-English explanation of why it failed |
| **Auto run summary** | Optional ✨ | Attached to every failed run automatically |
| **Chat assistant** | Optional ✨ | Q&A + run flows by name via `ghostrun chat` |

**Bottom line:** Record, replay, schedule, diff, and fix flows entirely offline. AI adds explanations and a conversational interface.

---

## AI Setup

### Option 1 — Local (Default, Recommended)

GhostRun uses **Ollama** by default. No API key, no internet, runs on your machine.

```bash
brew install ollama
ollama serve &
ollama pull gemma3:4b          # 2.6 GB, fast on Apple Silicon
node ghostrun.js status        # → AI Provider: Ollama (gemma3:4b)
```

**Model options by hardware:**

| Model | Size | Best for |
|-------|------|---------|
| `gemma3:4b` | 2.6 GB | Apple Silicon M1/M2/M3, fast |
| `gemma2:9b` | 5.4 GB | Better quality, more RAM needed |
| `llama3.2:3b` | 2.0 GB | Fastest, lighter quality |

Override model: `export GHOSTRUN_OLLAMA_MODEL=llama3.2:3b`

### Option 2 — Anthropic Cloud (Fallback)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### Fallback chain

```
run → try Ollama → if down → try Anthropic → if no key → skip AI silently
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GHOSTRUN_AI_PROVIDER` | auto | `ollama`, `anthropic`, or auto |
| `GHOSTRUN_OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `GHOSTRUN_OLLAMA_MODEL` | auto-detected | Model to use |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (cloud fallback) |

---

## Commands

### Setup

```bash
ghostrun init                          # guided setup wizard
ghostrun status                        # stats + AI provider info
```

### Recording

```bash
ghostrun learn <url> [name]            # record a flow (real browser opens)
ghostrun learn <url> --name "Login"    # with explicit name
```

### Running

```bash
ghostrun run <id|name>                 # headless execution
ghostrun run <id|name> --visible       # show the browser window
ghostrun run <id|name> --output json   # structured JSON output with extracted data
ghostrun run <id|name> --var key=val   # inject variables
ghostrun run <id|name> --session-save mysession   # save cookies/storage
ghostrun run <id|name> --session-load mysession   # restore cookies/storage
```

### Flow Management

```bash
ghostrun flow:list                     # list all flows
ghostrun flow:show <id|name>           # show steps
ghostrun flow:fix <id|name>            # fix broken selectors interactively
ghostrun flow:delete <id|name>         # delete a flow
ghostrun flow:export <id|name>         # export to .flow.json
ghostrun flow:import <file>            # import from .flow.json
ghostrun flow:clone <id|name>          # duplicate a flow
ghostrun flow:rename <id|name> <new>   # rename a flow
```

### Data Extraction & Monitoring

```bash
ghostrun monitor <id|name>             # run + show extracted data, diff vs previous
ghostrun run:show <id>                 # step details + screenshots + extracted data
```

### Run History

```bash
ghostrun run:list                      # list recent runs
ghostrun run:show <id>                 # step details + screenshots
ghostrun run:diff <id1> <id2>          # visual screenshot diff (no AI needed)
ghostrun run:analyze <id>              # AI failure analysis (optional)
```

### Scheduling

```bash
ghostrun flow:schedule <id> "<cron>"   # e.g. "0 9 * * *" = daily 9am
ghostrun schedule:list                 # list all schedules
ghostrun schedule:remove <id>          # remove a schedule
ghostrun serve                         # start the scheduler daemon
```

### Web Dashboard

```bash
ghostrun serve --ui                    # launch dashboard at http://localhost:3000
ghostrun serve --ui --port 8080        # custom port
```

The dashboard shows:
- All flows with one-click run buttons
- Live run log with SSE streaming
- Run history with status and duration
- Chat tab for natural-language interaction

### Chat Assistant

```bash
ghostrun chat                          # interactive AI chat (requires Ollama or ANTHROPIC_API_KEY)
```

Ask questions in plain English:
- `did my login flow pass recently?`
- `what flows do I have?`
- `run the login flow`  ← executes the flow with confirmation

### Test Suites

```bash
ghostrun suite:create <name>           # create a suite
ghostrun suite:add <suite> <flow>      # add a flow to a suite
ghostrun suite:list                    # list suites
ghostrun suite:show <suite>            # show flows in suite
ghostrun suite:run <suite>             # run all flows in suite
```

### Visual Baselines

```bash
ghostrun baseline:set <flow-id>        # capture reference screenshots
ghostrun baseline:clear <flow-id>      # clear baselines
ghostrun baseline:show <flow-id>       # list baselines
```

### Importing Flows

```bash
ghostrun flow:from-curl                         # paste a curl command → instant flow
ghostrun flow:from-curl "curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{\"name\":\"Alice\"}'"
ghostrun flow:from-spec openapi.json            # import all endpoints from an OpenAPI spec
ghostrun flow:from-spec swagger.yaml            # YAML supported too
ghostrun flow:import <file>                     # import a .flow.json directly
```

`flow:from-curl` parses the curl command (method, headers, body, bearer auth) and creates a ready-to-run flow with a status assertion. `flow:from-spec` reads an OpenAPI/Swagger spec and lets you choose: one flow per tag group, one per endpoint, or one big flow.

### Run Reports

```bash
ghostrun run <id> --report html                 # run + save HTML report
ghostrun perf:run <id> --report html            # load test + save HTML report
```

Reports are dark-themed HTML files saved to the current directory — shareable, self-contained, screenshot-inclusive.

### API Testing

Import an API flow from a `.flow.json` file (no browser needed):

```bash
ghostrun api:learn                     # interactive: pick a .flow.json file to import
ghostrun flow:import <file>            # import directly by path
ghostrun run <id|name>                 # runs pure API flows without launching a browser
```

When all steps in a flow are API actions (`http:request`, `assert:response`, `set:variable`, `extract:json`, `env:switch`), GhostRun skips Playwright entirely — execution is ~30ms.

### Environments

Named variable sets injected at flow start. Great for dev / staging / prod:

```bash
ghostrun env:create <name> [base-url]  # create an environment profile
ghostrun env:list                      # list all environments
ghostrun env:show <name>               # show variables in an environment
ghostrun env:set <name> <key=value>    # add or update a variable
ghostrun env:use <name>                # set as active environment
ghostrun env:delete <name>             # delete an environment
```

The active environment's variables are automatically injected before each flow run. Use `{{variableName}}` in any URL, header, or body field to reference them.

### Variable Inspection

```bash
ghostrun var:dump <run-id>             # show all variables extracted during a run
```

### Load & Performance Testing

```bash
ghostrun perf:run <id|name>            # run a load test against an API flow
ghostrun perf:run <id|name> --vus 20 --duration 30 --ramp-up 5
ghostrun perf:export <id|name>         # generate a k6 script from the flow
ghostrun perf:export <id|name> --output mytest.js
ghostrun perf:list                     # list past perf runs
ghostrun perf:show <perf-run-id>       # show stats for a specific perf run
```

**perf:run options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--vus <n>` | 10 | Number of virtual users |
| `--duration <s>` | 30 | Test duration in seconds |
| `--ramp-up <s>` | 5 | Ramp-up time (VUs staggered over this window) |
| `--timeout <ms>` | 10000 | Per-request timeout in ms |

Output includes: HTTP Requests, HTTP Success Rate, Avg RPS, p50/p95/p99 latency, min/max, per-step breakdown, and separate Checks Passed/Failed count.

**perf:compare** — diff two runs side by side to see if a deploy made things faster or slower:

```bash
ghostrun perf:compare <run-A-id> <run-B-id>
```

Shows p50/p95/p99/RPS for both runs with color-coded deltas (green = better, red = worse).

**perf:export** generates a valid k6 JavaScript file with:
- VU stages matching your `--vus`/`--duration`/`--ramp-up` config
- `http.get`/`http.post` calls with headers and JSON body
- `check()` assertions mapped to your `assert:response` steps
- `Trend` metrics per step for p95 thresholds
- `{{variable}}` → template literal interpolation

### MCP Server

```bash
node mcp-server.js                     # start MCP server (Claude Desktop, Cursor, etc.)
```

See [MCP-SETUP.md](MCP-SETUP.md) for connection setup.

Tools exposed: `list_flows`, `get_flow`, `run_flow`, `get_run_result`, `list_runs`, `delete_flow`, `get_status`

---

## CI/CD Integration

### GitHub Actions

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

      - name: Import test flows
        run: |
          ghostrun flow:import test-flows/health-check.flow.json
          ghostrun flow:import test-flows/auth-and-users.flow.json

      - name: Run flows
        run: |
          ghostrun run "API Health Check" --report html
          ghostrun run "Auth + User List" --report html

      - name: Upload reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ghostrun-reports
          path: ghostrun-report-*.html
```

### Exit Codes

GhostRun exits with code `1` on failure and `0` on pass — standard CI behaviour, no extra flags needed.

### API-only flows in CI

API flows skip Playwright entirely — no `playwright install` step needed:

```yaml
      - name: Install GhostRun (API testing only)
        run: npm install -g ghostrun-cli
        # No playwright install needed for pure API flows

      - name: Run API tests
        run: ghostrun run "Auth + User List"
```

---

## Selector Repair (`flow:fix`)

When a flow fails because a selector broke:

```bash
ghostrun flow:fix <id|name>
```

Browser opens, replays all passing steps automatically, **pauses on broken ones**, and asks you to click the correct element. Selector is updated and saved. No manual editing.

---

## Screenshot Diff (`run:diff`)

Compare any two runs pixel-by-pixel — no AI needed:

```bash
ghostrun run:diff <run1-id> <run2-id>

  Step  Status    Diff %  Screenshot
  ──────────────────────────────────────────────────────────
     1  same        0.0%  Navigate to homepage
     2  same        0.1%  Click Login
     3  changed    12.4%  Fill email field
     4  same        0.0%  Submit form

  3 same  1 changed
  Diff images: ~/.ghostrun/diffs/abc123_vs_def456/
```

---

## Flow Actions Reference

All actions you can use in recorded or imported `.flow.json` files:

### Navigation

| Action | Fields | Description |
|--------|--------|-------------|
| `navigate` | `url` | Go to URL |
| `reload` | — | Reload the current page |
| `back` | — | Browser back |
| `forward` | — | Browser forward |

### Interaction

| Action | Fields | Description |
|--------|--------|-------------|
| `click` | `selector` | Left-click an element |
| `dblclick` | `selector` | Double-click an element |
| `fill` | `selector`, `value` | Clear field and type value |
| `type` | `selector`, `value`, `delay?` | Type with configurable key delay (ms) |
| `clear` | `selector` | Clear a field |
| `select` | `selector`, `value` | Select a dropdown option by value |
| `check` | `selector`, `value: "true"\|"false"` | Check/uncheck a checkbox |
| `focus` | `selector` | Focus an element |
| `hover` | `selector` | Mouse hover |
| `drag` | `selector`, `targetSelector` | Drag one element to another |
| `keyboard` | `key`, `selector?` | Press a key (e.g. `Enter`, `Tab`, `Control+a`) |
| `upload` | `selector`, `value` | Set file input (comma-separated paths) |

### Waiting

| Action | Fields | Description |
|--------|--------|-------------|
| `wait` | `selector` | Wait for element to appear |
| `wait:text` | `selector`, `value` | Wait until element contains text |
| `wait:url` | `value` | Wait for URL to match pattern |
| `wait:ms` | `value` | Wait for N milliseconds |

### Scrolling

| Action | Fields | Description |
|--------|--------|-------------|
| `scroll` | `selector?` | Scroll to element (or page) |
| `scroll:element` | `selector` | Scroll element into view |
| `scroll:bottom` | — | Scroll to bottom of page |
| `scroll:load` | `value?` | Scroll to bottom, wait for load (repeat N times) |
| `next:page` | `selector?` | Click next page link and wait |

### Assertions

| Action | Fields | Description |
|--------|--------|-------------|
| `assert:visible` | `selector` | Assert element is visible |
| `assert:hidden` | `selector` | Assert element is not visible |
| `assert:text` | `selector`, `value` | Assert element contains text |
| `assert:not-text` | `selector`, `value` | Assert element does NOT contain text |
| `assert:value` | `selector`, `value` | Assert input value |
| `assert:count` | `selector`, `value` | Assert number of matching elements |
| `assert:attr` | `selector`, `value: "attr=expected"` | Assert element attribute |

### Data Extraction

| Action | Fields | Description |
|--------|--------|-------------|
| `extract` | `selector`, `value: "variableName"` | Extract text → variable |
| `screenshot` | — | Capture screenshot at this step |

### Browser State

| Action | Fields | Description |
|--------|--------|-------------|
| `cookie:set` | `value: "name=value; domain=..."` | Set a cookie |
| `cookie:clear` | — | Clear all cookies |
| `storage:set` | `selector: "key"`, `value: "val"` | Set localStorage item |
| `eval` | `value` | Execute JavaScript on the page |
| `iframe:enter` | `selector` | Enter an iframe context |
| `iframe:exit` | — | Exit iframe context, return to main frame |

### API — HTTP Requests

| Action | Fields | Description |
|--------|--------|-------------|
| `http:request` | `method`, `url`, `headers?`, `body?`, `auth?`, `extract?` | Make an HTTP request. `auth` supports `{ type: "bearer", token: "{{var}}" }`. `extract` is a map of `variableName → $.jsonPath`. |

### API — Assertions

| Action | Fields | Description |
|--------|--------|-------------|
| `assert:response` | `assert: "status"`, `expected` | Assert HTTP status code |
| `assert:response` | `assert: "json:path"`, `path`, `expected` | Assert JSONPath value equals expected |
| `assert:response` | `assert: "json:exists"`, `path` | Assert JSONPath exists in response |
| `assert:response` | `assert: "header"`, `header`, `expected` | Assert response header value |
| `assert:response` | `assert: "body:contains"`, `expected` | Assert raw body contains string |
| `assert:response` | `assert: "time"`, `expected` | Assert response time < expected ms |

### API — Variables & Flow Control

| Action | Fields | Description |
|--------|--------|-------------|
| `set:variable` | `variable`, `value` | Set a named variable (supports `{{interpolation}}`) |
| `extract:json` | `variable`, `path` | Extract a value from the last response body via JSONPath |
| `env:switch` | `value` | Switch active environment mid-flow |

### Variables

Use `{{variableName}}` in any `value`, `url`, `selector`, or `body` field to inject variables:

```json
{ "action": "fill", "selector": "#email", "value": "{{userEmail}}" }
```

Pass at runtime: `ghostrun run <id> --var userEmail=user@example.com`

Extracted values (from `extract:` steps) are automatically available as variables in subsequent steps.

---

## Unsupported / Limited Interactions

The following browser patterns have limited or no support today:

| Interaction | Status | Notes |
|------------|--------|-------|
| Canvas drawing | ❌ Not supported | `<canvas>` elements — no visual capture |
| WebGL / Three.js | ❌ Not supported | GPU-rendered content |
| Browser native dialogs | ⚠️ Partial | `alert()`/`confirm()`/`prompt()` auto-dismissed |
| File download verification | ⚠️ Partial | Download triggers but content is not validated |
| WebRTC / media streams | ❌ Not supported | Camera, mic, screen capture APIs |
| Browser extensions | ❌ Not supported | Extension UI is not accessible via Playwright |
| Shadow DOM (closed mode) | ⚠️ Limited | Open shadow DOM works; closed mode requires `eval:` workaround |
| Multi-tab / popup flows | ⚠️ Partial | New tabs opened by click are not automatically followed |
| OS-level dialogs | ❌ Not supported | Native file picker, print dialog, OS auth prompts |
| CAPTCHAs | ❌ Not supported | By design — no circumvention |
| Biometric auth | ❌ Not supported | Touch ID, Face ID, WebAuthn |
| Browser gestures (pinch/zoom) | ❌ Not supported | Mobile multi-touch gestures |
| Hover-only menus (CSS `:hover`) | ✅ Works | Use `hover` action before clicking submenu items |
| Right-click context menus | ⚠️ Limited | Browser context menus not accessible; app-level menus often work |
| Drag and drop | ✅ Works | Use `drag` action with `selector` + `targetSelector` |
| Infinite scroll / lazy load | ✅ Works | Use `scroll:load` with repeat count |

**Workarounds for unsupported interactions:**
- Use `eval:` to run JavaScript directly: `{ "action": "eval", "value": "document.querySelector('#btn').click()" }`
- Use `wait:ms:` to pause before difficult timing-sensitive interactions
- For shadow DOM: `{ "action": "eval", "value": "document.querySelector('my-el').shadowRoot.querySelector('button').click()" }`

---

## Data Storage

All data is local in `~/.ghostrun/`:

```
~/.ghostrun/
├── data/ghostrun.db       # SQLite: flows, runs, steps, schedules, extracted data,
│                          #         environments, api_responses, perf_runs
├── screenshots/           # PNG per step per run
├── baselines/             # Visual baseline reference screenshots
└── diffs/                 # Screenshot diff images
```

---

## Privacy

PII is sanitized before storage — emails, phones, cards, JWTs, API keys, passwords are replaced with `[EMAIL]`, `[PHONE]`, etc. Nothing sensitive is sent to AI unless you explicitly call `run:analyze`.

---

## Build from Source

```bash
npm install
npm run build    # compiles .ts → .js via esbuild
```

---

## Publishing to npm

```bash
# 1. Log in to npm
npm login

# 2. Make sure the build is fresh
npm run build

# 3. Dry-run to verify what gets published
npm publish --dry-run

# 4. Publish
npm publish --access public
```

After publishing, users can install with:
```bash
npm install -g ghostrun-cli
ghostrun init
```

---

## Built with

This project was built with the help of [Claude](https://claude.ai) and [Goose](https://goose-docs.ai).

---

## License

MIT
