# GhostRun MCP Server Setup

> **AI agents:** See [AGENTS.md](AGENTS.md) for when to use each MCP tool, auth patterns, and SaaS workflows.

## What is the GhostRun MCP Server?

The GhostRun MCP (Model Context Protocol) server exposes your local GhostRun automation library as a set of tools that AI assistants — Claude Desktop, Cursor, VS Code Copilot, and any other MCP-compatible client — can call directly. Instead of running `ghostrun run <id>` in a terminal, you can ask Claude to run your smoke suite, inspect failure details, apply a repair proposal, or summarise AI token costs, and the assistant will call the right tool, read the structured JSON result, and give you a human-readable answer.

The server reads from the same SQLite database and `.ghostrun/` directory as the CLI. **Since v2.0, the database is project-scoped:** `.ghostrun/data/ghostrun.db` in the app repo — not `~/.ghostrun/data/ghostrun.db`.

---

## Prerequisites

- **Node.js 18 or later** — the server targets Node 18 and uses ES2022 features. Check with `node --version`.
- **ghostrun-cli installed** — either globally (`npm install -g ghostrun-cli`) or locally in a project. The MCP server delegates all flow execution to the `ghostrun.js` binary that ships alongside it.
- **Playwright browsers** (for browser automation flows only) — run `npx playwright install chromium` once after install.

---

## Configuration for Claude Desktop

### 1. Find the path to mcp-server.js after a global install

```bash
# macOS / Linux
ls $(npm root -g)/ghostrun-cli/mcp-server.js

# Windows (PowerShell)
ls "$(npm root -g)\ghostrun-cli\mcp-server.js"
```

The output will be something like `/usr/local/lib/node_modules/ghostrun-cli/mcp-server.js` or `/Users/you/.nvm/versions/node/v20.0.0/lib/node_modules/ghostrun-cli/mcp-server.js`.

If you installed locally inside a project, the path is `./node_modules/ghostrun-cli/mcp-server.js` relative to that project — use the absolute equivalent.

Alternatively, after a global install the binary `ghostrun-mcp` is on your PATH. You can use that instead of `node /path/to/mcp-server.js`.

### 2. Edit claude_desktop_config.json

Open the file at:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Add the `ghostrun` entry inside `mcpServers`. Create the file if it does not exist yet.

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/ghostrun-cli/mcp-server.js"]
    }
  }
}
```

If you use `ghostrun-mcp` on your PATH:

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "ghostrun-mcp",
      "args": [],
      "cwd": "/Users/you/projects/my-saas-app"
    }
  }
}
```

**Always set `cwd` to your app repo** so the server finds `.ghostrun/data/ghostrun.db` and `.ghostrun/profiles/`.

### Optional: pass environment variables

For browser flows with form auth, pass QA secrets:

```json
"env": {
  "STAGING_QA_PASSWORD": "...",
  "ANTHROPIC_API_KEY": "sk-ant-..."
}
```

### 3. Restart Claude Desktop

Quit Claude Desktop completely and reopen it. The GhostRun tools will appear in the tools panel on the left side of a new conversation.

---

## Configuration for Cursor / VS Code

### Cursor — workspace MCP settings

Create `.cursor/mcp.json` at the root of your project:

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/ghostrun-cli/mcp-server.js"]
    }
  }
}
```

Or, using the `ghostrun-mcp` binary:

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "ghostrun-mcp",
      "args": []
    }
  }
}
```

Cursor picks up workspace MCP config automatically when you open the folder. You can also add a global MCP config in Cursor Settings > MCP using the same JSON structure.

### VS Code with the Copilot MCP extension

In `.vscode/settings.json` (or User Settings):

```json
{
  "mcp.servers": {
    "ghostrun": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/ghostrun-cli/mcp-server.js"]
    }
  }
}
```

---

## Tools Reference

The server exposes 16 tools. Inputs marked **required** must be provided; all others are optional.

### 1. `list_flows`

List every saved flow with ID (first 8 chars), name, description, step count, type (`browser` or `api`), target URL, and last-updated timestamp.

**Inputs:** none

**Example output:**
```json
{
  "total": 3,
  "flows": [
    {
      "id": "a1b2c3d4",
      "name": "Login smoke test",
      "description": "Verifies the login page accepts valid credentials",
      "steps": 5,
      "type": "browser",
      "url": "https://app.example.com",
      "updated": "2026-05-30T10:00:00Z"
    }
  ]
}
```

---

### 2. `get_flow`

Retrieve full step-by-step details for one flow: each step's label, action type, CSS selector, URL, and a masked indicator for any stored value.

**Inputs:**
- `flowId` **required** — flow ID or the first 8 characters of it; also accepts the exact flow name

**Example output:**
```json
{
  "id": "a1b2c3d4-...",
  "name": "Login smoke test",
  "stepCount": 5,
  "steps": [
    { "step": 1, "label": "Navigate to login", "action": "navigate", "selector": null, "value": null, "url": "https://app.example.com/login" },
    { "step": 2, "label": "Type username", "action": "type", "selector": "#username", "value": "***", "url": null }
  ]
}
```

---

### 3. `run_flow`

Execute a flow and return a complete result: pass/fail status, per-step breakdown, extracted data, and a hint pointing to `get_run_result` on failure.

**Inputs:**
- `flowId` **required** — flow ID (or first 8 chars, or exact name)
- `vars` optional — key/value object to inject as flow variables, e.g. `{ "env": "staging", "username": "alice" }`

**Example output:**
```json
{
  "runId": "f3e2d1c0-...",
  "runIdShort": "f3e2d1c0",
  "status": "passed",
  "flowName": "Login smoke test",
  "duration": "3421ms",
  "stepsTotal": 5,
  "stepsPassed": 5,
  "stepsFailed": 0,
  "extractedData": { "pageTitle": "Dashboard" },
  "steps": [],
  "errorMessage": null,
  "hint": "All steps passed."
}
```

---

### 4. `scrape_website`

Scrape one or more pages and return structured data: title, headings, links, forms, buttons, body text, and any CSS-targeted content. Useful for giving the AI page context before running a flow.

**Inputs:**
- `url` **required** — full URL to scrape
- `maxPages` optional — maximum pages to follow (default 1)
- `selector` optional — CSS selector; when provided, only content inside matching elements is returned

**Example output:**
```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "headings": ["Example Domain"],
  "links": [{ "text": "More information...", "href": "https://www.iana.org/domains/reserved" }],
  "forms": [],
  "buttons": [],
  "text": "This domain is for use in illustrative examples..."
}
```

---

### 5. `get_scrape_result`

Fetch a previously saved scrape result by ID, including the full JSON dataset and the path to the artifact file on disk.

**Inputs:**
- `scrapeId` **required** — scrape ID or the first 8 characters of it

**Example output:**
```json
{
  "scrapeId": "bb112233-...",
  "status": "completed",
  "url": "https://example.com",
  "pagesCount": 1,
  "resultPath": "/Users/you/.ghostrun/data/scrapes/bb112233.json",
  "errorMessage": null,
  "data": {}
}
```

---

### 6. `scrape_and_run_flow`

Scrape a URL and immediately run a flow in a single tool call. Useful for workflows where the AI needs page context and test results together.

**Inputs:**
- `url` **required** — URL to scrape
- `flowId` **required** — flow ID or name to run after scraping
- `maxPages` optional — pages to follow during scrape
- `selector` optional — CSS selector for targeted extraction
- `vars` optional — key/value variables for the flow

**Example output:** combined scrape and run result as a single JSON object.

---

### 7. `get_run_result`

Get the full detail of a previous run: every step with timing and error messages, the AI-generated failure summary, screenshot paths, and scrape diagnostics if the flow used scraping.

**Inputs:**
- `runId` **required** — run ID or the first 8 characters of it

**Example output:**
```json
{
  "runId": "f3e2d1c0-...",
  "flowName": "Login smoke test",
  "status": "failed",
  "duration": "2100ms",
  "aiSummary": "Step 3 failed because the selector #submit-btn was not found. The button may have been renamed to #btn-login.",
  "steps": [
    {
      "step": 3,
      "name": "Click submit",
      "action": "click",
      "selector": "#submit-btn",
      "status": "failed",
      "duration": "500ms",
      "errorMessage": "Element not found: #submit-btn",
      "screenshotPath": "/Users/you/.ghostrun/screenshots/..."
    }
  ]
}
```

---

### 8. `list_runs`

List recent flow runs in reverse chronological order with status, duration, and whether an AI summary is available.

**Inputs:**
- `flowId` optional — filter to runs for a specific flow
- `limit` optional — number of results to return (default 20)

**Example output:**
```json
{
  "total": 5,
  "runs": [
    {
      "id": "f3e2d1c0",
      "flowName": "Login smoke test",
      "status": "failed",
      "startedAt": "2026-05-30T09:45:00Z",
      "duration": "2100ms",
      "hasAiSummary": true
    }
  ]
}
```

---

### 9. `delete_flow`

Permanently delete a flow and all its run history from the database.

**Inputs:**
- `flowId` **required** — flow ID or first 8 characters of it

**Example output:**
```
Deleted flow "Login smoke test" (a1b2c3d4)
```

---

### 10. `get_status`

Return system-wide statistics: flow count, total runs, pass/fail counts, overall success rate, data directory path, and whether an Anthropic API key is configured.

**Inputs:** none

**Example output:**
```json
{
  "flows": 3,
  "totalRuns": 47,
  "passed": 39,
  "failed": 8,
  "successRate": "83%",
  "dataPath": "/Users/you/projects/myapp/.ghostrun/data/ghostrun.db",
  "aiEnabled": true
}
```

---

### 11. `list_profiles`

List all named environment profiles stored in `.ghostrun/profiles/` in the current working directory. Profiles carry variables like `baseUrl`, `username`, and `password` for a named environment (e.g. `staging`, `production`).

**Inputs:** none

**Example output:**
```json
{
  "total": 2,
  "profiles": [
    { "name": "staging", "baseUrl": "https://staging.example.com", "username": "qa-user" },
    { "name": "production", "baseUrl": "https://example.com" }
  ]
}
```

---

### 12. `list_suites`

List all test suites stored in `.ghostrun/suites/` in the current working directory. Each suite groups multiple flows for batch execution.

**Inputs:** none

**Example output:**
```json
{
  "total": 1,
  "suites": [
    { "name": "smoke", "description": "Critical path smoke tests", "flows": ["a1b2c3d4", "e5f6a7b8"] }
  ]
}
```

---

### 13. `run_suite`

Run a named test suite, optionally with a named profile. Returns per-flow pass/fail status and aggregate counts.

**Inputs:**
- `suiteName` **required** — suite filename without the `.json` extension
- `profile` optional — profile name to use for all flows in the suite

**Example output:**
```json
{
  "suite": "smoke",
  "profile": "staging",
  "total": 2,
  "passed": 2,
  "failed": 0,
  "results": []
}
```

---

### 14. `list_repair_proposals`

List all AI-generated repair proposals in `.ghostrun/proposals/repairs/`. Each proposal contains suggested selector or step changes for a failing flow.

**Inputs:** none

**Example output:**
```json
{
  "total": 1,
  "proposals": [
    {
      "id": "rp-a1b2c3",
      "status": "pending",
      "flowName": "Login smoke test",
      "createdAt": "2026-05-30T10:30:00Z"
    }
  ]
}
```

---

### 15. `get_repair_proposal`

Read the full content of one repair proposal. The proposal includes the original failing step, the proposed replacement selector or value, and the reasoning from the AI.

**Inputs:**
- `proposalId` **required** — proposal ID or a prefix that uniquely identifies it

**Example output:**
```json
{
  "id": "rp-a1b2c3",
  "flowName": "Login smoke test",
  "status": "pending",
  "failingStep": { "step": 3, "selector": "#submit-btn" },
  "proposedFix": { "selector": "#btn-login" },
  "reasoning": "The submit button selector changed in the latest deployment. The new selector #btn-login was found on the page.",
  "createdAt": "2026-05-30T10:30:00Z"
}
```

---

### 16. `get_ai_usage`

Summarise AI token consumption and estimated cost across all sessions logged in `.ghostrun/ai/usage/`. Shows totals and the 10 most recent sessions.

**Inputs:** none

**Example output:**
```json
{
  "totalInputTokens": 24800,
  "totalOutputTokens": 6300,
  "totalTokens": 31100,
  "totalCost": 0.00412,
  "sessions": 7,
  "lastSessions": [
    {
      "sessionId": "s-abc123",
      "model": "claude-opus-4-5",
      "inputTokens": 3400,
      "outputTokens": 900,
      "cost": 0.000580,
      "createdAt": "2026-05-30T09:00:00Z"
    }
  ]
}
```

---

## Example AI Workflows

### Ask Claude to run your smoke suite

Once the MCP server is connected, open a new Claude conversation and say:

> "Run my smoke suite and tell me if everything passed."

Claude will call `list_suites` to confirm the suite exists, call `run_suite` with `suiteName: "smoke"`, read the JSON result, and summarise which flows passed and which failed — with step-level error details for any failure.

---

### Ask Claude to show repair proposals and apply one

After a failing run, ask:

> "Show me any open repair proposals and apply the one for the login flow."

Claude will:
1. Call `list_repair_proposals` to find pending proposals.
2. Call `get_repair_proposal` with the matching ID to read the suggested fix.
3. Present the proposed selector change and reasoning to you.
4. If you confirm, Claude can call `run_flow` with the repaired configuration or instruct you to run `ghostrun repair apply <id>` in the terminal to persist the change.

---

### Ask Claude to run a suite against the staging profile

> "Run the full-regression suite against staging."

Claude will:
1. Call `list_profiles` to confirm `staging` exists and note its `baseUrl`.
2. Call `list_suites` to find the `full-regression` suite.
3. Call `run_suite` with `suiteName: "full-regression"` and `profile: "staging"`.
4. Return a table of results with per-flow status, total duration, and any error summaries.

---

### Ask Claude to investigate a failing run

> "Run the checkout flow and if it fails, explain why."

Claude will:
1. Call `run_flow` with the checkout flow ID.
2. If the status is `"failed"`, call `get_run_result` with the returned `runId`.
3. Read the `aiSummary` field and the failed step's `errorMessage` and `screenshotPath`.
4. Explain the failure in plain English and suggest what to check in your application.

---

## Troubleshooting

### The MCP server does not appear in Claude Desktop

- Confirm the path in `claude_desktop_config.json` is absolute and the file exists: `ls /path/to/mcp-server.js`
- Check for JSON syntax errors in `claude_desktop_config.json` (missing comma, trailing comma after the last entry, wrong bracket).
- Quit Claude Desktop fully (not just close the window) before reopening it.

### The MCP server crashes on startup

The server writes startup errors to stderr, which Claude Desktop captures in its MCP logs.

On macOS, logs are at:
```
~/Library/Logs/Claude/mcp-server-ghostrun.log
```

Common causes:
- **`better-sqlite3` binary mismatch** — if you switched Node versions after install, run `npm rebuild better-sqlite3` inside the ghostrun-cli package directory.
- **Database not found** — the server returns a graceful empty response for most operations when the database does not exist yet. Run `ghostrun init` in your project, or record your first flow with `ghostrun learn <url>`.
- **Missing mcp-server.js** — the file is compiled during `npm run build`. If you cloned the repo rather than installing from npm, run `npm run build` first.

### Tools return "No database found"

The server looks for `.ghostrun/data/ghostrun.db` in the **MCP process cwd**. If you have not initialized the project workspace:

```bash
cd /path/to/your-saas-app
ghostrun          # or: ghostrun init && ghostrun learn https://yourapp.com
```

Ensure MCP config includes `"cwd": "/path/to/your-saas-app"`.

### Tools that read profiles, suites, or proposals return empty results

`list_profiles`, `list_suites`, `list_repair_proposals`, and `get_ai_usage` read from the **current working directory** of the process that launched the MCP server — not from your home directory. When launched via Claude Desktop the working directory is typically your home directory.

To point these tools at a specific project, set the working directory in your MCP config:

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/ghostrun-cli/mcp-server.js"],
      "cwd": "/Users/you/projects/myapp"
    }
  }
}
```

### run_flow fails with "Failed to spawn ghostrun"

The MCP server resolves the CLI binary relative to its own location (`__dirname`). If `ghostrun.js` is missing from the same directory as `mcp-server.js`, re-install or rebuild:

```bash
npm install -g ghostrun-cli   # global reinstall
# or, from the repo:
npm run build
```

### Checking what tools are registered

Ask Claude: "List all GhostRun MCP tools available." Claude will enumerate them from the server's `list_tools` response. If fewer than 16 tools appear, you may be running an older version of the package — upgrade with `npm install -g ghostrun-cli@latest` and restart your MCP client.
