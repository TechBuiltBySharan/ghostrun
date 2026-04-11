# Flowmind

Memory-driven web automation. Record real browser flows, replay them headlessly, detect failures, and get AI explanations — all locally.

---

## Quick Start

```bash
npm install
npx playwright install chromium

node flowmind.js init
node flowmind.js learn https://yourapp.com
node flowmind.js run <flow-id>
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
| PII sanitization | No | Regex-based, local only |
| **Failure analysis** | Optional ✨ | Plain-English explanation of why it failed |
| **Auto run summary** | Optional ✨ | Attached to every failed run automatically |

**Bottom line:** Record, replay, schedule, diff, and fix flows entirely offline. AI adds explanations.

---

## AI Setup

### Option 1 — Local (Default, Recommended)

Flowmind uses **Ollama** by default. No API key, no internet, runs on your machine.

```bash
# Install Ollama
brew install ollama

# Start Ollama (runs in background)
ollama serve &

# Pull a model (2.6 GB, fast on Apple Silicon)
ollama pull gemma3:4b

# That's it — AI features auto-activate
node flowmind.js status   # shows: AI Provider: Ollama (gemma3:4b)
```

**Model options by hardware:**

| Model | Size | Best for |
|-------|------|---------|
| `gemma3:4b` | 2.6 GB | Apple Silicon M1/M2/M3, fast |
| `gemma2:9b` | 5.4 GB | Better quality, more RAM needed |
| `llama3.2:3b` | 2.0 GB | Fastest, lighter quality |

Override model: `export FLOWMIND_OLLAMA_MODEL=llama3.2:3b`

### Option 2 — Anthropic Cloud (Fallback)

If Ollama isn't running, Flowmind falls back to Anthropic:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### How the fallback works

```
run:analyze → try Ollama → if down → try Anthropic → if no key → skip silently
```

Force a specific provider:
```bash
export FLOWMIND_AI_PROVIDER=ollama      # Ollama only
export FLOWMIND_AI_PROVIDER=anthropic   # Anthropic only
# unset = auto (Ollama first, Anthropic fallback)
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

```bash
# Setup
node flowmind.js init

# Recording
node flowmind.js learn <url> [name]          # Real browser capture

# Running
node flowmind.js run <id|name>               # Headless execution

# Flow management
node flowmind.js flow:list
node flowmind.js flow:fix <id|name>          # Fix broken selectors interactively
node flowmind.js flow:delete <id|name>
node flowmind.js flow:export <id|name>       # Export to .flow.json
node flowmind.js flow:import <file>

# Scheduling
node flowmind.js flow:schedule <id> "<cron>" # e.g. "0 9 * * *" = daily 9am
node flowmind.js schedule:list
node flowmind.js schedule:remove <id>
node flowmind.js serve                       # Start scheduler daemon

# Run history
node flowmind.js run:list
node flowmind.js run:show <id>               # Step details + screenshots
node flowmind.js run:diff <id1> <id2>        # Visual screenshot diff (no AI)
node flowmind.js run:analyze <id>            # AI failure analysis (optional AI)

# System
node flowmind.js status                      # Stats + AI provider info
```

---

## Selector Repair (`flow:fix`)

When a flow fails because a selector broke (page changed, element moved):

```bash
node flowmind.js flow:fix <id|name>
```

Browser opens, replays all passing steps automatically, **pauses on broken ones**, and asks you to click the correct element. Selector is updated and saved. No manual editing.

---

## Screenshot Diff (`run:diff`)

Compare any two runs pixel-by-pixel — no AI needed:

```bash
node flowmind.js run:diff <run1-id> <run2-id>

  Step  Status    Diff %  Screenshot
  ──────────────────────────────────────────────────────────
     1  same        0.0%  Navigate to homepage
     2  same        0.1%  Click Login
     3  changed    12.4%  Fill email field
     4  same        0.0%  Submit form

  3 same  1 changed
  Diff images: ~/.flowmind/diffs/abc123_vs_def456/
```

---

## Scheduling

```bash
node flowmind.js flow:schedule login "0 9 * * *"   # daily at 9am
node flowmind.js flow:schedule checkout "0 * * * *" # every hour
node flowmind.js serve                              # keep running
```

---

## MCP Server (Claude Desktop)

Let AI assistants run and inspect flows directly. See [MCP-SETUP.md](MCP-SETUP.md).

```bash
node mcp-server.js
```

Tools: `list_flows`, `get_flow`, `run_flow`, `get_run_result`, `list_runs`, `delete_flow`, `get_status`

---

## Data Storage

Everything local in `~/.flowmind/`:

```
~/.flowmind/
├── data/flowmind.db       # SQLite: flows, runs, steps, schedules
├── screenshots/           # PNG per step per run
└── diffs/                 # Screenshot diff images
```

---

## Privacy

PII is sanitized before storage — emails, phones, cards, JWTs, API keys, passwords all replaced with `[EMAIL]`, `[PHONE]`, etc. Nothing sensitive is sent to AI unless you explicitly call `run:analyze`.

---

## Build from Source

```bash
npm install
npm run build    # compiles .ts → .js via esbuild
```
