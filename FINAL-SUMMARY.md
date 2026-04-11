# 🧠 Flowmind V1 - Complete Documentation

## What is Flowmind?

**Flowmind** is a memory-driven web automation tool that learns how a web application works by observing user actions, builds a memory graph of flows, and can replay those flows to test the application and detect failures.

Unlike simple automation tools, Flowmind:
- Builds a **graph-based memory** of user flows
- Stores **context** about each step (screenshots, console logs, network logs)
- **Detects failures intelligently** with meaningful error context
- **Sanitizes PII** before any processing

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+

### Installation

```bash
cd flowmind
npm install
```

### Run the Demo

```bash
./TEST-DEMO.sh
```

This will:
1. Initialize Flowmind
2. Create a test flow
3. Run the flow
4. Show results with screenshots

---

## 📁 Project Structure

```
flowmind/
├── flowmind.js              # Main CLI (JavaScript, ready to use)
├── flowmind.ts              # Source (TypeScript)
├── package.json             # Dependencies
├── install-local.sh         # Install as local dependency
├── TEST-DEMO.sh            # Automated demo script
├── start-desktop.sh        # Desktop viewer launcher
│
├── mock-app/               # Test web application
│   ├── index.html          # Home page
│   ├── login.html          # Login form
│   ├── dashboard.html      # Dashboard
│   ├── profile.html         # Profile with PII data
│   ├── settings.html        # Settings page
│   └── test-direct.ts       # Standalone test
│
├── apps/
│   ├── desktop-viewer/     # Electron desktop app
│   │   └── src/
│   │       ├── main.js     # Electron main process
│   │       └── index.html  # UI
│   ├── cli/               # CLI application (stub)
│   ├── desktop/           # Tauri desktop (stub)
│   ├── runtime/           # Fastify API (stub)
│   └── mcp-server/       # MCP server (stub)
│
└── packages/              # Monorepo packages (ready to wire)
    ├── core/             # Type definitions
    ├── database/         # SQLite ORM
    ├── privacy/          # PII sanitization
    ├── memory/           # Flow graph storage
    ├── recorder/         # Event capture
    ├── executor/          # Flow runner
    ├── reporting/         # Report generator
    ├── vault/             # Credential storage
    └── adapters-web/       # Playwright adapter
```

---

## 🎯 Usage

### CLI Commands

```bash
# Initialize (creates ~/.flowmind directory)
node flowmind.js init

# Learn a new flow (interactive)
node flowmind.js learn http://example.com/login

# List all flows
node flowmind.js flow:list

# Run a flow (by ID or partial ID)
node flowmind.js run <id>

# List recent runs
node flowmind.js run:list

# Show run details
node flowmind.js run:show <id>

# Show statistics
node flowmind.js status

# Help
node flowmind.js help
```

### Learn Mode Commands

While in learn mode, type these commands:

| Command | Description | Example |
|---------|-------------|---------|
| `click <selector>` | Click an element | `click #submit` |
| `fill <selector> <value>` | Fill an input | `fill #email test@example.com` |
| `navigate <url>` | Go to URL | `navigate /dashboard` |
| `wait <selector>` | Wait for element | `wait #loading` |
| `done` | Finish recording | `done` |
| `cancel` | Cancel and discard | `cancel` |
| `help` | Show help | `help` |

---

## 🖥️ Desktop Viewer

Launch the desktop viewer to see a visual interface:

```bash
./start-desktop.sh
```

The desktop viewer provides:
- **Dashboard**: Overview with statistics
- **Flows**: List and view all flows
- **Runs**: View run history with screenshots
- **Status**: System statistics

### Features
- View flow details and graphs
- View run steps and screenshots
- Run flows from the UI
- Click-through navigation

---

## 📦 Local Installation

To use Flowmind in any project:

```bash
# From your project directory
bash /path/to/flowmind/install-local.sh

# Then use:
npx flowmind init
npx flowmind flow:list
```

This copies Flowmind to `node_modules/@flowmind/cli`.

---

## 🔒 Privacy & Security

Flowmind automatically **sanitizes PII** before any processing:

| Type | Before | After |
|------|--------|-------|
| Email | `john@example.com` | `[EMAIL]` |
| Phone | `555-123-4567` | `[PHONE]` |
| Credit Card | `4111-1111-1111-1111` | `[CARD]` |
| API Key | `sk_live_abc123xyz...` | `API_KEY=[TOKEN]` |
| JWT | `eyJhbGciOiJIUzI1NiIs...` | `[JWT]` |

### What's Sanitized
- Input values during recording
- URLs with query parameters
- Console logs
- Network request/response bodies

---

## 📁 Data Storage

All data is stored locally in `~/.flowmind/`:

```
~/.flowmind/
├── data/
│   └── flowmind.db          # SQLite database
├── screenshots/
│   └── <run-id>/            # Screenshots per run
│       ├── step-1.png
│       └── step-2-FAILED.png
└── reports/                  # Generated reports
```

### Database Schema

**flows** table:
- `id` - UUID
- `name` - Flow name
- `description` - Description
- `app_url` - Target URL
- `graph` - JSON graph structure
- `created_at` / `updated_at`

**runs** table:
- `id` - UUID
- `flow_id` - Reference to flow
- `status` - pending/running/passed/failed
- `started_at` / `completed_at`
- `duration` - Total time in ms

**steps** table:
- `id` - UUID
- `run_id` - Reference to run
- `step_number` - Order
- `name` - Step description
- `action` - click/fill/navigate/wait
- `selector` / `value`
- `status` - passed/failed
- `screenshot_path`

---

## ✨ V1 Features

| Feature | Status | Description |
|---------|--------|-------------|
| Learn Mode | ✅ | CLI recorder with commands |
| Flow Storage | ✅ | SQLite persistence |
| Flow Replay | ✅ | Playwright headless |
| Screenshots | ✅ | PNG per step |
| Failure Detection | ✅ | Stops on error |
| PII Sanitization | ✅ | Auto-detect & replace |
| Partial ID Lookup | ✅ | `run home` works |
| Beautiful CLI | ✅ | ASCII art, colors |
| Run History | ✅ | SQLite persistence |
| Flow Graph | ✅ | Nodes + Edges |
| Desktop Viewer | ✅ | Electron app |
| Local Install | ✅ | Install anywhere |

---

## 🧪 Testing

### Run the Demo
```bash
./TEST-DEMO.sh
```

### Manual Test
```bash
# Initialize
node flowmind.js init

# Create a test flow (in another terminal, start mock app)
# cd mock-app && python3 -m http.server 3334

# List flows
node flowmind.js flow:list

# Run flow
node flowmind.js run <id>

# Check results
node flowmind.js run:list
node flowmind.js status
```

### Mock App

Start the mock web app for testing:

```bash
cd mock-app
python3 -m http.server 3334
# or
npx serve .
```

Then visit: `http://localhost:3334`

---

## 🎯 Use Cases

### 1. Regression Testing
```bash
# Learn a critical flow once
node flowmind.js learn https://yourapp.com/checkout

# Run before each deployment
node flowmind.js run checkout
```

### 2. Login Testing
```bash
# Test valid login
node flowmind.js learn https://app.com/login
# Record: fill email, fill password, click submit
# Name: "Login Success"

# Test invalid login
# Same flow but wrong password
```

### 3. Multi-step Flows
```bash
# Learn: Login → Browse → Add to Cart → Checkout
node flowmind.js learn https://shop.com
# Record all steps
```

### 4. CI/CD Integration
```bash
# In your CI pipeline
node flowmind.js run flow1
node flowmind.js run flow2
node flowmind.js run:list
```

---

## 🔮 Future Features (V2+)

| Feature | Priority | Status |
|---------|----------|--------|
| Web-based recorder | High | Not started |
| Flow editor UI | High | Stub only |
| Auto slot detection | Medium | Not started |
| Cloud sync | Low | Out of scope |
| Mobile support | Low | Out of scope |

---

## 🐛 Troubleshooting

### "Flow not found"
```bash
# Use full ID or first 8 characters
node flowmind.js run a3aa1f9f
```

### Browser doesn't launch
```bash
npx playwright install chromium
```

### Database locked
```bash
pkill -f flowmind
```

### Screenshots not saved
```bash
# Check permissions
ls -la ~/.flowmind/screenshots/
```

---

## 📞 Help

```bash
# Show all commands
node flowmind.js help

# Show specific command help
node flowmind.js learn --help
```

---

## 📜 Summary

Flowmind V1 is a **working prototype** that demonstrates:

✅ **Learn flows** from browser actions  
✅ **Replay flows** with Playwright  
✅ **Detect failures** with context  
✅ **Capture screenshots** per step  
✅ **Sanitize PII** automatically  
✅ **Store locally** in SQLite  
✅ **Beautiful CLI** interface  
✅ **Desktop viewer** (Electron)  
✅ **Install anywhere** (local install script)

---

## 🚀 To Ship V1

1. ✅ Main CLI - Working
2. ✅ Mock App - Working
3. ✅ Desktop Viewer - Working
4. ✅ Test Demo - Working
5. ⚠️ Browser Recording - CLI only, needs extension
6. ⚠️ Flow Editor - Basic in desktop viewer
7. ⏳ Packaging - Need installers

---

**Version**: 0.1.0  
**License**: MIT  
**Author**: Built with ❤️

---

*For questions or issues, check the troubleshooting section above.*
