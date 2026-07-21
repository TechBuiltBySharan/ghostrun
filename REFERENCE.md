# GhostRun CLI Reference

Complete reference for the `ghostrun` command-line tool.

---

## Commands

### Record & Run

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `learn` | `ghostrun learn <url> [name]` | Record a new flow by opening a real browser and capturing interactions | `ghostrun learn https://app.example.com "Login Flow"` |
| `run` | `ghostrun run <id\|name> [flags]` | Execute a recorded flow headlessly | `ghostrun run login-flow` |
| `create` | `ghostrun create [description]` | Generate a flow from a natural-language description (AI) | `ghostrun create "log in with email and password"` |
| `author` | `ghostrun author` | Interactive menu: record, generate, import from curl, import from spec, or explore | `ghostrun author` |
| `code:scan` | `ghostrun code:scan <directory>` | Scan a codebase and create draft flows from detected routes/forms (AI) | `ghostrun code:scan ./src` |

### Flow Management

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `flow:list` | `ghostrun flow:list` | List all flows with creator and pass rate | `ghostrun flow:list` |
| `flow:fix` | `ghostrun flow:fix <id\|name>` | Interactively repair broken selectors in a flow | `ghostrun flow:fix login-flow` |
| `flow:delete` | `ghostrun flow:delete <id\|name>` | Delete a flow permanently | `ghostrun flow:delete abc12345` |
| `flow:export` | `ghostrun flow:export <id\|name>` | Export a flow to a `.flow.json` file in the current directory | `ghostrun flow:export login-flow` |
| `flow:import` | `ghostrun flow:import <file>` | Import a flow from a `.flow.json` file | `ghostrun flow:import login-flow.flow.json` |
| `flow:rename` | `ghostrun flow:rename <id\|name> <new-name>` | Rename a flow | `ghostrun flow:rename abc12345 "New Login"` |
| `flow:clone` | `ghostrun flow:clone <id\|name>` | Duplicate a flow (appends " (copy)" to name) | `ghostrun flow:clone login-flow` |
| `flow:from-curl` | `ghostrun flow:from-curl [cmd]` | Parse a curl command and create an API flow | `ghostrun flow:from-curl 'curl -X POST https://api.example.com/login'` |
| `flow:from-spec` | `ghostrun flow:from-spec <file>` | Import flows from an OpenAPI/Swagger JSON or YAML spec | `ghostrun flow:from-spec openapi.yaml` |
| `flow:schedule` | `ghostrun flow:schedule <id\|name> "<cron>"` | Schedule a flow with a cron expression | `ghostrun flow:schedule login-flow "0 9 * * *"` |

### Profiles

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `profile:list` | `ghostrun profile:list` | List all project profiles | `ghostrun profile:list` |
| `profile:show` | `ghostrun profile:show <name>` | Show the contents of a profile | `ghostrun profile:show staging` |
| `profile:create` | `ghostrun profile:create <name> [url]` | Create a profile with an optional base URL | `ghostrun profile:create staging https://staging.example.com` |
| `profile:use` | `ghostrun profile:use <name>` | Set the active project profile | `ghostrun profile:use staging` |
| `profile:set` | `ghostrun profile:set <name> <key> <value>` | Set a profile field (baseUrl, auth.*, meta.*, or a variable) | `ghostrun profile:set staging baseUrl https://staging.example.com` |
| `profile:delete` | `ghostrun profile:delete <name>` | Delete a profile | `ghostrun profile:delete old-profile` |

### Scheduling

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `schedule:list` | `ghostrun schedule:list` | List all scheduled flows | `ghostrun schedule:list` |
| `schedule:remove` | `ghostrun schedule:remove <id>` | Remove a schedule by ID | `ghostrun schedule:remove sched-abc123` |
| `serve` | `ghostrun serve` | Start the scheduler daemon | `ghostrun serve` |
| `serve --ui` | `ghostrun serve --ui [--port 3000]` | Launch the web dashboard (default port 3000) | `ghostrun serve --ui --port 4000` |

### Test Suites

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `suite:create` | `ghostrun suite:create <name>` | Create a new test suite | `ghostrun suite:create smoke` |
| `suite:add` | `ghostrun suite:add <suite> <flow>` | Add a flow to a suite | `ghostrun suite:add smoke login-flow` |
| `suite:list` | `ghostrun suite:list` | List all suites | `ghostrun suite:list` |
| `suite:show` | `ghostrun suite:show <suite>` | Show all flows in a suite | `ghostrun suite:show smoke` |
| `suite:run` | `ghostrun suite:run <suite> [--var k=v] [--parallel]` | Run all flows in a suite | `ghostrun suite:run smoke --parallel` |

### Visual Baselines

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `baseline:set` | `ghostrun baseline:set <flow-id>` | Capture reference screenshots for a flow | `ghostrun baseline:set login-flow` |
| `baseline:clear` | `ghostrun baseline:clear <flow-id>` | Clear saved baselines for a flow | `ghostrun baseline:clear login-flow` |
| `baseline:show` | `ghostrun baseline:show <flow-id>` | List baseline screenshots for a flow | `ghostrun baseline:show login-flow` |

### Run History & Analysis

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `run:list` | `ghostrun run:list` | List recent runs with status and timing | `ghostrun run:list` |
| `run:show` | `ghostrun run:show <id>` | Show full step details and screenshots for a run | `ghostrun run:show run-abc12345` |
| `run:diff` | `ghostrun run:diff <id1> <id2>` | Pixel-diff screenshots between two runs | `ghostrun run:diff run-abc1 run-abc2` |
| `run:analyze` | `ghostrun run:analyze <id>` | Plain-English AI failure analysis for a run | `ghostrun run:analyze run-abc12345` |
| `repair:list` | `ghostrun repair:list` | List stored repair proposals | `ghostrun repair:list` |
| `repair:show` | `ghostrun repair:show <id>` | Show details of a repair proposal | `ghostrun repair:show rep-abc123` |
| `repair:apply` | `ghostrun repair:apply <id>` | Apply a stored repair proposal to the flow | `ghostrun repair:apply rep-abc123` |
| `improve` | `ghostrun improve` | Analyze GhostRun data and suggest improvements (AI) | `ghostrun improve` |

### Template Store

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `store list` | `ghostrun store list` | Browse ready-made flow templates | `ghostrun store list` |
| `store install` | `ghostrun store install <name>` | Install a template (sets `{{variables}}` for customisation) | `ghostrun store install github-login` |
| `store:list` | `ghostrun store:list` | Alias for `store list` | `ghostrun store:list` |
| `store:install` | `ghostrun store:install <name>` | Alias for `store install <name>` | `ghostrun store:install github-login` |

### Data Extraction & Monitoring

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `monitor` | `ghostrun monitor <id\|name>` | Run a flow and show extracted data changes (one-shot) | `ghostrun monitor price-checker` |
| `monitor --interval` | `ghostrun monitor <id> --interval <s>` | Continuously run a flow every N seconds (default 60) | `ghostrun monitor price-checker --interval 30` |
| `scrape` | `ghostrun scrape <url> [opts]` | Scrape website data with Crawlee (if enabled) | `ghostrun scrape https://example.com --max-pages 5` |
| `scrape:run` | `ghostrun scrape:run <url> --flow <id>` | Scrape a site, then run a flow with the data | `ghostrun scrape:run https://shop.com --flow price-flow` |
| `scrape:list` | `ghostrun scrape:list` | List saved scrape datasets | `ghostrun scrape:list` |
| `scrape:show` | `ghostrun scrape:show <id>` | Show a saved scrape result as JSON | `ghostrun scrape:show scrape-abc123` |

### API Testing

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `api:learn` | `ghostrun api:learn` | Interactively build an HTTP API test flow | `ghostrun api:learn` |
| `env:create` | `ghostrun env:create <name>` | Create an environment (dev, staging, prod) | `ghostrun env:create staging` |
| `env:list` | `ghostrun env:list` | List all environments | `ghostrun env:list` |
| `env:set` | `ghostrun env:set <env> <key> <value>` | Set a variable in an environment | `ghostrun env:set staging BASE_URL https://staging.example.com` |
| `env:use` | `ghostrun env:use <name>` | Activate an environment for runs | `ghostrun env:use staging` |
| `env:show` | `ghostrun env:show <name>` | Show all variables in an environment | `ghostrun env:show staging` |
| `env:delete` | `ghostrun env:delete <name>` | Delete an environment | `ghostrun env:delete old-env` |
| `var:dump` | `ghostrun var:dump <run-id>` | Show extracted variables and API calls from a run | `ghostrun var:dump run-abc12345` |

### Load & Performance Testing

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `perf:run` | `ghostrun perf:run <flow> [opts]` | Run a load test against a flow | `ghostrun perf:run login-flow --vus 20 --duration 30s` |
| `perf:export` | `ghostrun perf:export <flow> [opts]` | Export a k6 script for a flow | `ghostrun perf:export login-flow --p95 500 --max-errors 1` |
| `perf:list` | `ghostrun perf:list` | List past performance runs | `ghostrun perf:list` |
| `perf:show` | `ghostrun perf:show <run-id>` | Show detailed stats for a perf run | `ghostrun perf:show perf-abc12345` |
| `perf:compare` | `ghostrun perf:compare <id-A> <id-B>` | Side-by-side comparison of two perf runs | `ghostrun perf:compare perf-abc1 perf-abc2` |

### Chat, Setup & System

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `chat` | `ghostrun chat` | Ask GhostRun Bot — Q&A and run flows interactively (AI) | `ghostrun chat` |
| `init` | `ghostrun init` | Setup wizard: install Chromium and configure AI provider | `ghostrun init` |
| `config:mode` | `ghostrun config:mode [assist\|auto]` | Show or set the interaction mode | `ghostrun config:mode auto` |
| `ai:status` | `ghostrun ai:status` | Show AI provider, policy, and usage summary | `ghostrun ai:status` |
| `ai:usage` | `ghostrun ai:usage` | Show aggregated AI token and call usage | `ghostrun ai:usage` |
| `ai:sessions` | `ghostrun ai:sessions [limit]` | Show recent sanitized AI session log | `ghostrun ai:sessions 20` |
| `explore` | `ghostrun explore <url>` | Auto-discover flows via BFS crawl (AI) | `ghostrun explore https://app.example.com` |
| `explore:list` | `ghostrun explore:list` | List all explore sessions | `ghostrun explore:list` |
| `explore:confirm` | `ghostrun explore:confirm <report-id>` | Save confirmed flows from an explore session | `ghostrun explore:confirm exp-abc123` |
| `status` | `ghostrun status` | Show stats, creator breakdown, and AI provider info | `ghostrun status` |
| `doctor` | `ghostrun doctor` | Run a health checklist for your GhostRun installation | `ghostrun doctor` |
| `--version` | `ghostrun --version` | Print the installed version | `ghostrun --version` |
| `help` | `ghostrun help` | Print the full command reference | `ghostrun help` |

---

## Flag Reference

Flags are passed after the command and flow ID/name.

| Flag | Applies To | Description | Example |
|------|-----------|-------------|---------|
| `--ci` | `run`, `suite:run` | CI-safe mode: disables implicit AI healing; flow fails fast on first broken selector | `ghostrun run login-flow --ci` |
| `--visible` | `run` | Run the browser in visible (non-headless) mode for debugging | `ghostrun run login-flow --visible` |
| `--output json` | `run`, `monitor`, `scrape` | Output results as JSON (suppresses human-readable output) | `ghostrun run login-flow --output json` |
| `--reporter junit` | `run`, `suite:run` | Write a JUnit XML report to `.ghostrun/reports/junit-<run-id>.xml` after the run | `ghostrun run login-flow --reporter junit` |
| `--report html` | `run`, `perf:run` | Save an HTML report after the run | `ghostrun run login-flow --report html` |
| `--video` | `run` | Record a video of the run (saved to `.ghostrun/runs/<run-id>/`) | `ghostrun run login-flow --video` |
| `--trace` | `run` | Record a Playwright trace file for post-run inspection (saved to `.ghostrun/runs/<run-id>/trace.zip`) | `ghostrun run login-flow --trace` |
| `--profile <name>` | `run`, `suite:run`, `monitor` | Target environment profile | `ghostrun run login-flow --profile staging` |
| `--account <id>` | `run`, `suite:run`, `monitor` | Role: `superadmin`, `admin`, `manager`, or `guest` | `ghostrun run checkout --profile staging --account manager` |
| `--var <key=value>` | `run`, `suite:run` | Pass a flow variable at runtime; repeatable | `ghostrun run login-flow --var USERNAME=alice --var PASSWORD=secret` |
| `--interval <s>` | `monitor` | Loop: re-run the flow every N seconds (minimum 1; default 60) | `ghostrun monitor price-flow --interval 30` |
| `--parallel` | `suite:run` | Run suite flows in parallel | `ghostrun suite:run smoke --parallel` |
| `--vus <n>` | `perf:run`, `perf:export` | Number of virtual users for load test | `ghostrun perf:run login-flow --vus 50` |
| `--duration <Ns>` | `perf:run`, `perf:export` | Duration of load test (e.g. `30s`, `2m`) | `ghostrun perf:run login-flow --duration 60s` |
| `--ramp-up <Ns>` | `perf:run` | Ramp-up period before full VU load | `ghostrun perf:run login-flow --ramp-up 10s` |
| `--max-pages <n>` | `scrape`, `scrape:run` | Maximum pages for a scrape | `ghostrun scrape https://example.com --max-pages 10` |
| `--selector <css>` | `scrape` | CSS selector to extract from each scraped page | `ghostrun scrape https://example.com --selector .price` |
| `--port <n>` | `serve` | Port for the web dashboard (default 3000) | `ghostrun serve --ui --port 4000` |
| `--yes` | `init` | Non-interactive init (accepts defaults) | `ghostrun init --yes` |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | API key for the Anthropic Claude API. Enables all cloud AI features (flow generation, failure analysis, healing, explore, improve). | — (required for cloud AI) |
| `GHOSTRUN_OLLAMA_URL` | Base URL of a locally running Ollama server. | `http://localhost:11434` |
| `GHOSTRUN_OLLAMA_MODEL` | Ollama model to use for AI features. When unset, GhostRun auto-detects the running model. | auto-detect |
| `GHOSTRUN_AI_PROVIDER` | Force AI provider selection: `ollama` or `anthropic`. When unset, GhostRun uses Ollama if running, otherwise Anthropic. | auto |
| `GHOSTRUN_MAILPIT_URL` | Mailpit API URL when using optional email bridge | — |
| `GITHUB_TOKEN` / `GH_TOKEN` | GitHub API for `report publish --create-issues` | — |
| `GHOSTRUN_SUITE` | Suite name for CI helper script (`scripts/ghostrun-ci.sh`) | — |
| `GHOSTRUN_ACCOUNT` | Default account type when profile defines `accounts` | — |

## Flow JSON Format

Flows are stored internally in SQLite and can be exported with `ghostrun flow:export`. The exported file format is:

```json
{
  "version": "1.0.0",
  "exportedAt": "2026-06-01T12:00:00.000Z",
  "flow": {
    "name": "Login Flow",
    "description": "Tests the login form with valid credentials",
    "appUrl": "https://app.example.com",
    "graph": {
      "appUrl": "https://app.example.com",
      "nodes": [...],
      "edges": []
    }
  }
}
```

Each node in `graph.nodes` has at minimum:

```json
{
  "id": "unique-string",
  "type": "action",
  "label": "Human-readable step name",
  "action": "<action-type>",
  "selector": ".css-selector",
  "value": "optional value"
}
```

### Complete flow JSON example

The example below shows all supported action types:

```json
{
  "version": "1.0.0",
  "exportedAt": "2026-06-01T12:00:00.000Z",
  "flow": {
    "name": "Full Action Type Demo",
    "description": "Demonstrates every action type",
    "appUrl": "https://app.example.com",
    "graph": {
      "appUrl": "https://app.example.com",
      "edges": [],
      "nodes": [

        { "id": "n01", "type": "action", "action": "navigate",
          "label": "Go to login page", "value": "https://app.example.com/login" },

        { "id": "n02", "type": "action", "action": "wait:text",
          "label": "Wait for heading", "value": "Sign in" },

        { "id": "n03", "type": "action", "action": "fill",
          "label": "Enter email", "selector": "#email", "value": "{{USERNAME}}" },

        { "id": "n04", "type": "action", "action": "type",
          "label": "Slow-type password", "selector": "#password",
          "value": "{{PASSWORD}}", "delay": "80" },

        { "id": "n05", "type": "action", "action": "click",
          "label": "Click submit", "selector": "button[type='submit']" },

        { "id": "n06", "type": "action", "action": "dblclick",
          "label": "Double-click item", "selector": ".item-row:first-child" },

        { "id": "n07", "type": "action", "action": "rightclick",
          "label": "Right-click menu", "selector": ".context-target" },

        { "id": "n08", "type": "action", "action": "hover",
          "label": "Hover tooltip trigger", "selector": ".tooltip-target" },

        { "id": "n09", "type": "action", "action": "select",
          "label": "Select role", "selector": "#role-select", "value": "admin" },

        { "id": "n10", "type": "action", "action": "check",
          "label": "Check agreement", "selector": "#agree-checkbox" },

        { "id": "n11", "type": "action", "action": "uncheck",
          "label": "Uncheck newsletter", "selector": "#newsletter-checkbox" },

        { "id": "n12", "type": "action", "action": "press",
          "label": "Press Enter", "selector": "#search-input", "value": "Enter" },

        { "id": "n13", "type": "action", "action": "keyboard",
          "label": "Select all", "value": "Control+A" },

        { "id": "n14", "type": "action", "action": "drag",
          "label": "Drag item to target", "selector": ".draggable-item",
          "value": ".drop-zone" },

        { "id": "n15", "type": "action", "action": "upload",
          "label": "Upload file", "selector": "input[type='file']",
          "value": "/path/to/file.pdf" },

        { "id": "n16", "type": "action", "action": "focus",
          "label": "Focus input", "selector": "#search-input" },

        { "id": "n17", "type": "action", "action": "clear",
          "label": "Clear input", "selector": "#search-input" },

        { "id": "n18", "type": "action", "action": "scroll:bottom",
          "label": "Scroll to bottom" },

        { "id": "n19", "type": "action", "action": "scroll:up",
          "label": "Scroll to top" },

        { "id": "n20", "type": "action", "action": "scroll:load",
          "label": "Infinite scroll (5 times)", "value": "5" },

        { "id": "n21", "type": "action", "action": "scroll:element",
          "label": "Scroll element into view", "selector": ".lazy-loaded-section" },

        { "id": "n22", "type": "action", "action": "next:page",
          "label": "Go to next page", "selector": "a[rel='next']" },

        { "id": "n23", "type": "action", "action": "screenshot",
          "label": "Capture screenshot" },

        { "id": "n24", "type": "action", "action": "wait",
          "label": "Wait for element", "selector": ".dashboard" },

        { "id": "n25", "type": "action", "action": "wait:ms",
          "label": "Wait 2 seconds", "value": "2000" },

        { "id": "n26", "type": "action", "action": "wait:url",
          "label": "Wait for URL pattern", "value": "/dashboard" },

        { "id": "n27", "type": "action", "action": "reload",
          "label": "Reload page" },

        { "id": "n28", "type": "action", "action": "back",
          "label": "Navigate back" },

        { "id": "n29", "type": "action", "action": "forward",
          "label": "Navigate forward" },

        { "id": "n30", "type": "action", "action": "extract",
          "label": "Extract price", "selector": ".price", "variable": "PRICE" },

        { "id": "n31", "type": "action", "action": "assert:text",
          "label": "Assert welcome message", "value": "Welcome back" },

        { "id": "n32", "type": "action", "action": "assert:not-text",
          "label": "Assert error absent", "value": "Something went wrong" },

        { "id": "n33", "type": "action", "action": "assert:url",
          "label": "Assert on dashboard", "value": "/dashboard" },

        { "id": "n34", "type": "action", "action": "assert:element",
          "label": "Assert sidebar exists", "selector": "#sidebar" },

        { "id": "n35", "type": "action", "action": "assert:visible",
          "label": "Assert button visible", "selector": "#logout-btn" },

        { "id": "n36", "type": "action", "action": "assert:hidden",
          "label": "Assert loader hidden", "selector": ".loading-spinner" },

        { "id": "n37", "type": "action", "action": "assert:title",
          "label": "Assert page title", "value": "Dashboard" },

        { "id": "n38", "type": "action", "action": "assert:value",
          "label": "Assert input value", "selector": "#name-input", "value": "Alice" },

        { "id": "n39", "type": "action", "action": "assert:count",
          "label": "Assert 3 rows", "selector": "table tbody tr", "value": "3" },

        { "id": "n40", "type": "action", "action": "assert:attr",
          "label": "Assert href contains docs",
          "selector": "#docs-link", "value": "href=/docs" },

        { "id": "n41", "type": "action", "action": "assert:no-errors",
          "label": "Assert no console errors" },

        { "id": "n42", "type": "action", "action": "cookie:set",
          "label": "Set cookie", "value": "session=abc123;domain=app.example.com" },

        { "id": "n43", "type": "action", "action": "cookie:clear",
          "label": "Clear all cookies" },

        { "id": "n44", "type": "action", "action": "storage:set",
          "label": "Set localStorage", "value": "theme=dark" },

        { "id": "n45", "type": "action", "action": "eval",
          "label": "Run custom JS", "value": "window.sessionStorage.clear()" },

        { "id": "n46", "type": "action", "action": "iframe:enter",
          "label": "Enter iframe", "selector": "iframe#payment-frame" },

        { "id": "n47", "type": "action", "action": "iframe:exit",
          "label": "Exit iframe" },

        { "id": "n48", "type": "action", "action": "http:request",
          "label": "POST API endpoint",
          "method": "POST", "url": "{{BASE_URL}}/api/v1/users",
          "headers": { "Content-Type": "application/json" },
          "body": { "name": "Alice" } },

        { "id": "n49", "type": "action", "action": "assert:response",
          "label": "Assert status 201", "assert": "status", "expected": 201 },

        { "id": "n50", "type": "action", "action": "assert:body",
          "label": "Assert body contains id", "assert": "json:exists", "path": "$.id" },

        { "id": "n51", "type": "action", "action": "assert:header",
          "label": "Assert content-type",
          "assert": "header", "header": "content-type", "expected": "application/json" },

        { "id": "n52", "type": "action", "action": "assert:time",
          "label": "Assert response under 1s", "assert": "time", "expected": 1000 },

        { "id": "n53", "type": "action", "action": "extract:json",
          "label": "Extract user id", "path": "$.id", "variable": "USER_ID" },

        { "id": "n54", "type": "action", "action": "set:variable",
          "label": "Set base URL var",
          "variable": "BASE_URL", "value": "https://app.example.com" },

        { "id": "n55", "type": "action", "action": "env:switch",
          "label": "Switch to staging env", "environment": "staging" }
      ]
    }
  }
}
```

### Action type quick reference

| Action | Required fields | Optional fields | Notes |
|--------|----------------|-----------------|-------|
| `navigate` | `value` (URL) | — | Full URL or relative path |
| `click` | `selector` | — | Self-heals on selector failure |
| `dblclick` | `selector` | — | |
| `rightclick` | `selector` | — | |
| `fill` | `selector`, `value` | — | Clears field first, then types |
| `type` | `selector`, `value` | `delay` (ms per char, default 50) | Character-by-character; good for autocomplete |
| `clear` | `selector` | — | Fills with empty string |
| `select` | `selector`, `value` | — | Sets `<select>` option by value |
| `check` | `selector` | — | Checks a checkbox |
| `uncheck` | `selector` | — | Unchecks a checkbox |
| `hover` | `selector` | — | |
| `press` | `selector`, `value` | — | `value` is the key name e.g. `Enter`, `Tab` |
| `keyboard` | `value` | `selector` | Key/chord e.g. `Control+A`; scoped to element if `selector` given |
| `focus` | `selector` | — | |
| `drag` | `selector`, `value` | — | `selector` = source, `value` = target selector |
| `upload` | `selector`, `value` | — | `value` = comma-separated file paths |
| `scroll:bottom` | — | — | Scrolls to page bottom |
| `scroll:up` | — | — | Scrolls to page top |
| `scroll:load` | — | `value` (repeat count, default 5) | Infinite-scroll: repeats until no new content |
| `scroll:element` | `selector` | — | Scrolls element into view |
| `next:page` | — | `selector` | Clicks next-page link; auto-detects common selectors |
| `wait` | `selector` | — | Waits for element to be visible |
| `wait:text` | `value` | — | Waits for text to appear in page body |
| `wait:url` | `value` | — | Waits until current URL contains `value` |
| `wait:ms` | `value` (ms) | — | Fixed pause; maximum 30000 ms |
| `reload` | — | — | Reloads the page |
| `back` | — | — | Browser back |
| `forward` | — | — | Browser forward |
| `screenshot` | — | — | No-op; screenshots are captured automatically after every step |
| `extract` | `selector`, `variable` | `attribute` | Extracts inner text (or named attribute) into a variable |
| `assert:text` | `value` | — | Asserts page body contains `value` |
| `assert:not-text` | `value` | — | Asserts page body does NOT contain `value` |
| `assert:url` | `value` | — | Asserts current URL contains `value` |
| `assert:element` | `selector` | — | Asserts element exists in DOM |
| `assert:visible` | `selector` | — | Asserts element is visible (retries 3x for SPAs) |
| `assert:hidden` | `selector` | — | Asserts element is hidden |
| `assert:title` | `value` | — | Asserts page title contains `value` (case-insensitive) |
| `assert:value` | `selector`, `value` | — | Asserts input value contains `value` |
| `assert:count` | `selector`, `value` | — | Asserts exact element count equals `value` |
| `assert:attr` | `selector`, `value` | — | `value` = `"attrName=expected"` |
| `assert:no-errors` | — | — | Passes by default; validates no console errors were recorded |
| `cookie:set` | `value` | — | `value` = `"name=val;domain=example.com"` |
| `cookie:clear` | — | — | Clears all cookies |
| `storage:set` | `value` | — | `value` = `"key=value"`, sets `localStorage` |
| `eval` | `value` | — | Executes JavaScript on the page |
| `iframe:enter` | `selector` | — | Switches action context into an iframe |
| `iframe:exit` | — | — | Returns to main frame context |
| `http:request` | `method`, `url` | `headers`, `body`, `auth` | Makes an HTTP request outside the browser |
| `assert:response` | `assert`, `expected` | — | Asserts on last HTTP response; `assert` = `"status"` \| `"status:range"` \| `"body:contains"` \| `"body:equals"` \| `"json:path"` \| `"json:exists"` \| `"header"` \| `"time"` |
| `assert:status` | `expected` (int) | — | Shorthand for status assertion; `assert` defaults to `"status"` when omitted |
| `assert:body` | `assert` (`"json:path"` or `"json:exists"`), `path` | `expected` (required for `json:path`, unused for `json:exists`) | JSONPath assertion on response body — dispatch is driven by `assert`, not the action name, so it must be set explicitly |
| `assert:header` | `assert: "header"`, `header` | `expected` | Asserts response header value — requires `assert: "header"` explicitly |
| `assert:time` | `assert: "time"`, `expected` (ms) | — | Asserts response time is below threshold — requires `assert: "time"` explicitly |
| `extract:json` | `path`, `variable` | — | Extracts a JSONPath value from the last HTTP response |
| `set:variable` | `variable`, `value` | — | Sets a flow variable at runtime |
| `env:switch` | `environment` | — | Switches to a named environment mid-flow |
| `email:wait` | `to`, `subject` or `value` | `variable`, `timeoutMs` | **Optional Mailpit** — poll inbox; requires `profile.services.email` |
| `email:extract-link` | — | `variable` (source body var), `to` (output var) | Extract first URL from email body |
| `email:click-link` | — | `variable` (link var, default `magicLink`) | Navigate browser to magic link |
| `email:extract-otp` | — | `variable`, `value` (digit length, default 6) | Extract OTP code from email body |
| `webhook:wait` | `path` or `value` | `variable`, `timeoutMs` | Wait for local hook catcher POST |
| `webhook:assert` | `path` or `variable` | `assertions` or `value`+`expected` | Assert JSON fields on webhook body |
| `assert:webhook-signature` | `secretSecret` or `secret` | `header`, `algorithm`, `prefix`, `path` | Verify HMAC signature (Razorpay, Meta, etc.) |
| `services:seed` | — | — | Run SQL fixtures from `profile.services.postgres.fixtures` |
| `db:query` | `value` or `sql` | `params`, `variable` | Query Postgres; stores JSON rows in variable |
| `db:assert` | `value` or `sql`, `expected` | `assertType`, `params` | SQL assertion (`scalar`, `count`, `empty`, `contains`) |

---

## Service Bridge (optional)

Mailpit, webhooks, and Postgres fixtures are **opt-in**. Password-login SaaS apps use profile auth only.

| Command | Description |
|---------|-------------|
| `ghostrun services list` | Overview — creds-first; Mailpit optional |
| `ghostrun services doctor` | Health check for **configured** services only |
| `ghostrun services inbox` | Mailpit inbox (requires `services.email` on profile) |
| `ghostrun services hooks` | List captured webhooks |
| `ghostrun services hook --daemon` | Start hook catcher on `:8787` |
| `ghostrun services up` | Print docker compose command |
| `ghostrun services seed` | Apply SQL fixtures |

Profile `services` block example (all optional):

```json
{
  "services": {
    "email": { "provider": "mailpit", "apiUrl": "http://localhost:8025" },
    "webhook": { "provider": "local", "baseUrl": "http://127.0.0.1:8787" },
    "postgres": {
      "connectionSecret": "GHOSTRUN_TEST_DATABASE_URL",
      "fixtures": ["seed.sql"]
    }
  }
}
```

Set `email.provider` to `"none"` or omit `services` entirely for creds-only profiles.

---

## Reporting & integrations

| Command | Description |
|---------|-------------|
| `ghostrun report list` | List recent runs |
| `ghostrun report publish [--dir ./test-results/]` | Bundle HTML, JUnit, manifest, screenshots |
| `ghostrun report publish --create-issues` | Create GitHub issue on failure |
| `ghostrun integrations list` | Show GitHub/Linear config |
| `ghostrun integrations test github` | Verify GitHub token + repo access |
| `ghostrun ai status` / `ai usage` / `ai sessions` | AI provider and usage |

Evidence per run: `.ghostrun/runs/<id>/manifest.json`, `failure.v1.json`, `steps.jsonl`, `report.html`

---

## Project scope

| Command | Description |
|---------|-------------|
| `ghostrun sync flows` | Import `.ghostrun/flows/*.flow.json` into DB |
| `ghostrun migrate project-scope` | Copy flows from legacy `~/.ghostrun/data/ghostrun.db` |

Flows are stored in `.ghostrun/data/ghostrun.db` and dual-written to `.ghostrun/flows/**/*.flow.json`.

---

## Modern vs legacy command syntax

Preferred (v1.3+):

```bash
ghostrun profile list
ghostrun profile create staging https://staging.example.com
ghostrun repair list
ghostrun monitor schedule add login "0 9 * * *"
```

Legacy colon commands (`profile:list`, `flow:schedule`, etc.) are **removed** — CLI prints migration hint.

---

### Variables in flows

Use `{{VAR_NAME}}` placeholders in `value`, `url`, and other string fields. Variables are resolved at runtime from (in order):

1. `--var KEY=value` flags on the command line
2. The active profile's `variables` map
3. The active environment's variables
4. Variables extracted by earlier `extract`, `extract:json`, or `set:variable` steps
5. A `.ghostrun.env` file in the current working directory

---

## Profile JSON Format

Profiles are stored as JSON files under `.ghostrun/profiles/<name>.json`.

```json
{
  "name": "staging",
  "baseUrl": "https://staging.example.com",
  "variables": {
    "USERNAME": "testuser@example.com",
    "API_KEY": "sk-staging-abc123"
  },
  "auth": {
    "strategy": "bearer-token",
    "tokenSecret": "STAGING_TOKEN"
  },
  "metadata": {
    "owner": "qa-team",
    "tier": "staging"
  }
}
```

### Profile fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Profile identifier (used with `--profile <name>`) |
| `baseUrl` | string | Base URL prepended to relative paths in flows |
| `variables` | object | Key-value pairs injected as flow variables |
| `auth.strategy` | string | One of: `none`, `form`, `otp-bypass`, `storage-state`, `basic-auth`, `bearer-token` |
| `auth.loginFlow` | string | Flow name/ID to run for `form` or `otp-bypass` strategy login |
| `auth.username` | string | Literal username/phone for `form`, `otp-bypass`, or `basic-auth` |
| `auth.usernameVar` | string | Variable name whose value is the username or phone |
| `auth.usernameSecret` | string | Secret name to resolve the username from |
| `auth.passwordSecret` | string | Secret name to resolve the password from |
| `auth.otpSecret` | string | Env var for staging test OTP (`otp-bypass`; default `STAGING_TEST_OTP`, falls back to `000000`) |
| `auth.otpVar` | string | Flow variable for OTP code (default `testOtp`) |
| `auth.tokenSecret` | string | Secret name to resolve the bearer token from |
| `auth.storageState` | string | Path or inline JSON for Playwright storage state (`storage-state` strategy) |
| `metadata` | object | Arbitrary key-value metadata |
| `defaultAccount` | string | Account id used when `--account` is omitted |
| `accounts` | object | Map of account id → `{ emailVar, emailSecret, passwordSecret, loginFlow?, label? }` |
| `services.email` | object | **Optional** — Mailpit config for magic-link flows |
| `services.webhook` | object | **Optional** — local hook catcher |
| `services.postgres` | object | **Optional** — SQL fixture connection + files |

See `templates/ghostrun-profile-staging-minimal.json` (creds only), `templates/ghostrun-profile-staging-otp-example.json` (phone OTP), and `templates/ghostrun-profile-staging-example.json` (with optional services).

---

## JUnit XML Output Format

When `--reporter junit` is passed, GhostRun writes a JUnit-compatible XML file to `.ghostrun/reports/junit-<run-id>.xml`. CI systems (GitHub Actions, GitLab CI, Jenkins, CircleCI) parse this natively.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="GhostRun" tests="5" failures="1" time="12.345">
  <testsuite name="Login Flow" tests="5" failures="1" time="12.345" id="run-abc12345-...">
    <testcase name="Go to login page" classname="Login Flow" time="1.234">
    </testcase>
    <testcase name="Enter email" classname="Login Flow" time="0.891">
    </testcase>
    <testcase name="Enter password" classname="Login Flow" time="0.543">
    </testcase>
    <testcase name="Click submit" classname="Login Flow" time="2.100">
      <failure message="Timeout 10000ms exceeded waiting for selector &quot;button[type=&#39;submit&#39;]&quot;">Timeout 10000ms exceeded waiting for selector &quot;button[type=&#39;submit&#39;]&quot;</failure>
    </testcase>
    <testcase name="Assert dashboard" classname="Login Flow" time="0.012">
    </testcase>
  </testsuite>
</testsuites>
```

- `tests` — total number of steps
- `failures` — number of failed steps
- `time` — total duration in seconds (3 decimal places)
- Each step maps to a `<testcase>`. Failed steps include a `<failure>` element containing the error message.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All flows and steps passed |
| `1` | One or more flows (or steps) failed |
| `2` | Configuration error (missing required argument, invalid flag, or unknown command) |
