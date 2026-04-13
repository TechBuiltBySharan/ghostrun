# GhostRun

Record once. Replay as a ghost.

Memory-driven browser automation CLI — record real browser flows, replay them headlessly, detect failures with AI analysis, extract data, and chat with your test suite. Entirely local.

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
ghostrun learn https://yourapp.com     # record a flow in a real browser
ghostrun run <flow-id>                 # replay headlessly
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

Override model: `export FLOWMIND_OLLAMA_MODEL=llama3.2:3b`

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
| `FLOWMIND_AI_PROVIDER` | auto | `ollama`, `anthropic`, or auto |
| `FLOWMIND_OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `FLOWMIND_OLLAMA_MODEL` | auto-detected | Model to use |
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

### MCP Server

```bash
node mcp-server.js                     # start MCP server (Claude Desktop, Cursor, etc.)
```

See [MCP-SETUP.md](MCP-SETUP.md) for connection setup.

Tools exposed: `list_flows`, `get_flow`, `run_flow`, `get_run_result`, `list_runs`, `delete_flow`, `get_status`

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

### Variables

Use `{{variableName}}` in any `value`, `url`, or `selector` field to inject variables:

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
├── data/ghostrun.db       # SQLite: flows, runs, steps, schedules, extracted data
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

## License

MIT
