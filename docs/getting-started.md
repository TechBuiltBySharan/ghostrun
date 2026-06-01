# Getting Started with GhostRun

GhostRun is a local-first CLI for browser automation and API testing. You record a flow once, then replay it as many times as you like — in your terminal, in CI, or through an AI assistant. Nothing leaves your machine.

> **Using Claude or another AI agent?** Read [AGENTS.md](../AGENTS.md) first — it lists every capability, auth pattern, MCP workflow, and what is optional vs required.

This guide walks you through everything from installation to running flows in a CI pipeline.

---

## Prerequisites

- Node.js 18 or later
- npm 9 or later
- A terminal (macOS, Linux, or WSL on Windows)

---

## 1. Installation

Install the CLI globally with npm:

```bash
npm install -g ghostrun-cli
```

Then run the init command. This sets up the local data directory (`~/.ghostrun/`) and installs the Playwright browsers GhostRun uses for browser automation:

```bash
ghostrun init
```

You should see output confirming that browsers were installed and the global machine config was created under `~/.ghostrun/`.

When you run GhostRun **inside your app repo**, it also creates a **project workspace** at `.ghostrun/` — flows, runs, evidence, and the SQLite database are isolated per repo (`.ghostrun/data/ghostrun.db`).

Verify everything is working:

```bash
ghostrun --version
```

---

## 2. Recording Your First Flow

You can record flows three ways:

### Option A: Auto-discover with explore (recommended for new apps)

Point GhostRun at your staging URL. It crawls the site (BFS), captures page structure, and uses AI to suggest candidate test flows:

```bash
ghostrun explore https://staging.yourapp.com
```

Review the HTML report, then confirm flows you want to keep:

```bash
ghostrun explore:confirm <report-id>
```

### Option B: Record manually

GhostRun's interactive author command is the main entry point for creating new flows. Run it and choose "Record browser flow" from the menu:

```bash
ghostrun author
```

You will be prompted to choose a flow type. Select **Record browser flow**. GhostRun opens a visible Chromium window. Navigate the site exactly as a user would — click links, fill forms, submit searches. GhostRun records every interaction.

When you are done, return to the terminal and press Enter to stop recording. GhostRun saves the flow with an auto-generated ID and name.

To see your saved flows:

```bash
ghostrun flow:list
```

You will see output like:

```
ID                                    Name              Steps  Type
------------------------------------  ----------------  -----  -------
a1b2c3d4-e5f6-...                    Wikipedia Search  3      browser
```

---

## 3. Running Flows

Run any saved flow by its ID:

```bash
ghostrun run a1b2c3d4-e5f6-...
```

By default, GhostRun runs headless (no visible browser window) for speed. To watch the browser while the flow runs — useful when debugging a failing step — add `--visible`:

```bash
ghostrun run a1b2c3d4-e5f6-... --visible
```

You can also use a partial ID or the flow name if it is unique enough. GhostRun will match on prefix.

### Understanding Run Output

A passing run looks like this:

```
Running flow: Wikipedia Search
  [1/3] navigate https://en.wikipedia.org      OK   (342ms)
  [2/3] fill input[name=search] "JavaScript"   OK   (89ms)
  [3/3] click button[type=submit]              OK   (201ms)

Flow passed in 632ms.
```

A failing run prints which step failed, the error, and whether a repair proposal was created (see section 8).

---

## 4. Setting Up Profiles for Your Environments

Profiles let you run the same flow against different environments — local dev, staging, production — without editing the flow file each time. Profile configs are stored in `.ghostrun/profiles/` and should be committed to git so the whole team shares consistent environment definitions.

### Create a Profile

```bash
# Staging environment
ghostrun profile:create staging --base-url https://staging.example.com --env API_KEY=s3cr3t

# Local development
ghostrun profile:create local --base-url http://localhost:3000

# Production (read-only, no destructive flows)
ghostrun profile:create production --base-url https://example.com
```

### Use a Profile

Switch the active profile globally:

```bash
ghostrun profile:use staging
```

Or pass a profile for a single run only:

```bash
ghostrun run a1b2c3d4-e5f6-... --profile staging
```

### Commit Profiles to Git

Your profiles directory should be tracked in version control so teammates and CI get the same environment definitions automatically:

```bash
git add .ghostrun/profiles/
git commit -m "chore: add ghostrun environment profiles"
```

Variables defined in a profile are injected into flows at runtime using `{{variableName}}` syntax. For example, a flow step referencing `{{base_url}}/login` will resolve to `https://staging.example.com/login` when running under the `staging` profile.

---

## 4b. SaaS QA Agent Setup (2.0)

Most SaaS apps authenticate with **shared QA credentials** — email/password, API tokens, or saved browser sessions. You do **not** need Mailpit unless you test magic-link flows.

### Recommended: credentials per account type

Most SaaS apps need **email and password for each role**. This product uses **superadmin, admin, manager, guest**:

```bash
ghostrun profile accounts list staging
ghostrun run platform-settings --profile staging --account superadmin
ghostrun run workspace-home --profile staging --account manager
```

```bash
export STAGING_SUPERADMIN_EMAIL='...'
export STAGING_SUPERADMIN_PASSWORD='...'
export STAGING_ADMIN_EMAIL='...'
export STAGING_ADMIN_PASSWORD='...'
export STAGING_MANAGER_EMAIL='...'
export STAGING_MANAGER_PASSWORD='...'
export STAGING_GUEST_EMAIL='...'
export STAGING_GUEST_PASSWORD='...'
```

```bash
cp node_modules/ghostrun-cli/templates/ghostrun-profile-staging-accounts-example.json .ghostrun/profiles/staging.json
```

Record a shared `login` flow once; each `--account` injects the right email and password before that flow runs.

### Single QA user (smaller teams)

```bash
cp node_modules/ghostrun-cli/templates/ghostrun-profile-staging-minimal.json .ghostrun/profiles/staging.json
export STAGING_QA_PASSWORD='...'
ghostrun run login --profile staging
```

Auth strategies:

| Strategy | When to use |
|----------|-------------|
| `form` | Email + password login (most common) |
| `otp-bypass` | Phone / WhatsApp OTP — staging test code via `STAGING_TEST_OTP` (default `000000`) |
| `storage-state` | OAuth / SSO — record session once, reuse |
| `bearer-token` | API-heavy flows |
| `basic-auth` | Staging behind HTTP basic auth |

OTP bypass example — template: `templates/ghostrun-profile-staging-otp-example.json`:

```bash
export STAGING_TEST_OTP='000000'
ghostrun run community-join --profile staging
```

Login flows should fill the OTP field with `{{testOtp}}`.

### Optional: Mailpit (magic-link email only)

Only enable if your app sends sign-in links by email and you want GhostRun to read them locally:

```json
"services": {
  "email": { "provider": "mailpit", "apiUrl": "http://localhost:8025" }
}
```

```bash
docker compose -f .ghostrun/services/dev.compose.yml --profile mailpit up -d
ghostrun services doctor
```

Flow actions `email:wait`, `email:extract-link`, and `email:click-link` require this block. Password login does not.

**Postgres RLS checks** — add `services.postgres.connectionSecret` and use `db:query` / `db:assert` steps after browser flows to verify tenant isolation. Requires the optional `pg` npm package in your project.

**Webhook testing** — run `ghostrun services hook --daemon`, then use `webhook:wait`, `webhook:assert`, and `assert:webhook-signature` in flows (Razorpay, Meta, etc.).

See `templates/ghostrun-profile-staging-example.json` for the full optional services block (webhooks, Postgres fixtures).

---

## 5. Running in CI

GhostRun works in GitHub Actions and any other CI environment. Use `--ci` to disable interactive prompts and ensure a non-zero exit code on any flow failure. Use `--reporter junit` to produce a JUnit XML file that CI dashboards can display.

### Basic GitHub Actions Workflow

```yaml
name: GhostRun Flows

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ghostrun:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run GhostRun flows
        run: ghostrun run --ci --reporter junit --output junit-results.xml

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ghostrun-results
          path: |
            junit-results.xml
            ~/.ghostrun/screenshots/
```

### Targeting a Specific Environment in CI

Pass the profile name so CI hits staging rather than production:

```yaml
- name: Run flows against staging
  run: ghostrun run --ci --profile staging --reporter junit --output junit-results.xml
  env:
    API_KEY: ${{ secrets.STAGING_API_KEY }}
```

### CI Flags Reference

| Flag | Effect |
|------|--------|
| `--ci` | Disables interactive prompts, exits non-zero on failure |
| `--reporter junit` | Writes JUnit XML output |
| `--output <file>` | Path for the report file |
| `--profile <name>` | Selects an environment profile |
| `--ai off` | Disables AI features entirely during the run |

GhostRun will not silently auto-heal selectors or mutate flow definitions during a CI run. Failures produce repair proposals for human review; they do not self-correct.

---

## 6. AI Features

GhostRun ships with Claude-powered features for chatting about your flows, generating flows from descriptions, and proposing selector repairs. These features require an Anthropic API key.

### Set Your API Key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Add this to your shell profile (`~/.zshrc`, `~/.bashrc`) to persist it.

### Interactive AI Chat

Open an interactive session where you can ask questions about your flows, runs, and test setup:

```bash
ghostrun chat
```

Example questions you can ask:

- "Which flows failed in the last 7 days?"
- "What selectors are most likely to break?"
- "Summarize the Wikipedia Search flow"
- "How do I assert that a page title contains a specific string?"

### Generate a Flow from a Description

Describe what you want to test in plain English and GhostRun will produce a flow file:

```bash
ghostrun create "log in to the app at https://app.example.com with email admin@example.com and password from the LOGIN_PASSWORD env variable, then verify the dashboard loads"
```

GhostRun outputs the flow JSON and saves it with an auto-generated ID. Review the generated steps before committing:

```bash
ghostrun flow:list
ghostrun run <generated-id> --visible
```

### AI and Privacy

GhostRun only sends flow definitions and error context to the AI. It does not send screenshots, database contents, or file system data. PII sanitization runs before any prompt is constructed.

---

## 7. Using the MCP Server with Claude Desktop

GhostRun ships an MCP (Model Context Protocol) server. When connected to Claude Desktop, you can list, run, and inspect your flows directly from a Claude conversation without leaving the chat.

### Configure Claude Desktop

Open your Claude Desktop configuration file. On macOS it is at:

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

If you installed GhostRun via npm, add the `ghostrun-mcp` bin:

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "ghostrun-mcp"
    }
  }
}
```

If you are working from a local clone, point directly at the server file:

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "node",
      "args": ["/absolute/path/to/ghostrun/mcp-server.js"]
    }
  }
}
```

Restart Claude Desktop after saving the config.

### What You Can Do From Claude

Once connected, you can ask Claude things like:

- "List my GhostRun flows"
- "Run the Wikipedia Search flow and show me the result"
- "What did the last run of my login flow return?"
- "Scrape https://example.com and tell me what forms are on the page"

### Available MCP Tools

| Tool | What It Does |
|------|--------------|
| `list_flows` | Lists all saved flows with IDs, names, step counts, and type |
| `get_flow` | Returns full details of a flow including every step and selector |
| `run_flow` | Executes a flow and returns pass/fail status and per-step results |
| `get_run_result` | Returns step-by-step results, timings, and AI summary for a past run |
| `list_runs` | Lists recent runs, optionally filtered by flow |
| `scrape_website` | Scrapes a URL and returns structured page data |
| `get_status` | Returns system stats: flow count, run counts, success rate |
| `delete_flow` | Deletes a flow and all its run history |

---

## 8. The Repair Workflow

When a flow fails, GhostRun does not silently modify the flow and pretend it passed. Instead, it creates a **repair proposal** — a suggested fix you can review and apply manually.

### What Happens on Failure

1. The run fails and the failing step is logged with the error.
2. If the error looks like a selector change (the element moved or was renamed), GhostRun sends the page state and the broken selector to Claude.
3. Claude proposes a replacement selector with reasoning.
4. The proposal is saved but not applied automatically.
5. The run remains marked as failed.

### Viewing Repair Proposals

List all pending proposals:

```bash
ghostrun repair:list
```

Output:

```
ID         Flow                  Step  Broken Selector       Proposed Selector    Status
---------  --------------------  ----  --------------------  -------------------  -------
r-abc123   Wikipedia Search      2     input[name=search]    #searchInput         pending
```

Inspect a specific proposal in detail:

```bash
ghostrun repair:show r-abc123
```

This shows the original selector, the proposed replacement, Claude's reasoning, and the surrounding page context it was based on.

### Applying a Repair

If the proposal looks correct, apply it:

```bash
ghostrun repair:apply r-abc123
```

This updates the selector in the saved flow. Run the flow again to confirm the repair actually works:

```bash
ghostrun run <flow-id> --visible
```

The repair workflow is intentionally manual. Auto-apply is available in local interactive mode (not in CI) when project policy enables it, but the repaired run is always kept as failed until you run it again and it passes cleanly.

---

## 9. The `ghostrun doctor` Command

If something is not working as expected, `ghostrun doctor` runs a series of checks and reports what it finds:

```bash
ghostrun doctor
```

It checks:

- Node.js and npm versions
- Whether Playwright browsers are installed
- Whether the `~/.ghostrun/` data directory exists and is writable
- Whether the SQLite database can be opened
- Whether `ANTHROPIC_API_KEY` is set (required for AI features)
- Whether the MCP server binary is on PATH
- Any stale repair proposals or failed flows worth knowing about

Example output:

```
GhostRun Doctor
===============
Node.js       v20.11.0    OK
npm           10.2.4      OK
Playwright    installed   OK
Data dir      ~/.ghostrun OK
Database      accessible  OK
API key       set         OK
MCP server    on PATH     OK

No issues found.
```

If a check fails, doctor prints a short explanation and a fix command. Run doctor first whenever you are debugging an unexpected failure or setting up a new machine.

---

## Quick Reference

```bash
# Install and set up
npm install -g ghostrun-cli
ghostrun init

# Create flows
ghostrun author                          # interactive recorder
ghostrun create "description"            # AI-generated flow (requires ANTHROPIC_API_KEY)

# Run flows
ghostrun run <id>                        # headless
ghostrun run <id> --visible              # with browser window
ghostrun run <id> --profile staging      # with a named profile

# Manage flows
ghostrun flow:list
ghostrun flow:import my-flow.flow.json

# Profiles
ghostrun profile:create staging --base-url https://staging.example.com
ghostrun profile:use staging

# CI
ghostrun run --ci --reporter junit --output results.xml

# AI features
ghostrun chat
ghostrun create "log in and verify dashboard"

# Repair
ghostrun repair:list
ghostrun repair:show <id>
ghostrun repair:apply <id>

# Debug
ghostrun doctor
```

---

## Next Steps

- Read [EXAMPLES.md](EXAMPLES.md) for full flow JSON examples including API testing and assertions.
- Read [API.md](API.md) for the complete list of supported actions and assertion types.
- Read [ci-cd.md](ci-cd.md) for the recommended CI pipeline contract and notes on AI policy in pipelines.
