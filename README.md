# 🧠 Flowmind V1

**Memory-driven web automation that learns, replays, and tests flows.**

```
npm install → ./TEST-DEMO.sh → Done!
```

## ✨ Features

- **Learn Mode**: Record browser actions to create flows
- **Flow Replay**: Execute flows with Playwright automation
- **Failure Detection**: Detect and report failures with context
- **Screenshots**: Capture screenshots at each step
- **Privacy**: Automatic PII sanitization
- **Desktop Viewer**: Visual Electron app
- **Local Install**: Install anywhere with `install-local.sh`

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the demo (fully automated test)
./TEST-DEMO.sh

# 3. See it working!
```

---

## 📋 Commands

```bash
# CLI
node flowmind.js init              # Initialize
node flowmind.js flow:list        # List flows
node flowmind.js run <id>         # Run a flow
node flowmind.js run:list         # List runs
node flowmind.js run:show <id>    # Show run details
node flowmind.js status           # Statistics

# Learn Mode
node flowmind.js learn <url>      # Start recording
```

### Learn Mode Commands

```
click <selector>      Click an element
fill <selector> <val>  Fill an input
navigate <url>         Go to URL
wait <selector>         Wait for element
done                    Finish recording
```

---

## 🖥️ Desktop Viewer

```bash
./start-desktop.sh
```

Provides visual interface for:
- Dashboard with statistics
- Flow list and details
- Run history with screenshots
- Run flows from UI

---

## 📦 Install Anywhere

```bash
# In any project
bash /path/to/flowmind/install-local.sh

# Then use as local dependency
npx flowmind init
```

---

## 🔒 Privacy

Automatic PII sanitization:
- `john@example.com` → `[EMAIL]`
- `555-123-4567` → `[PHONE]`
- `4111-...` → `[CARD]`
- `sk_live_...` → `[TOKEN]`

---

## 📁 Data Storage

```
~/.flowmind/
├── data/flowmind.db    # SQLite database
└── screenshots/        # Screenshots per run
```

---

## 🧪 Testing

```bash
# Start mock web app
cd mock-app && python3 -m http.server 3334

# In another terminal:
node flowmind.js learn http://localhost:3334/login.html
# Record: fill #email, fill #phone, fill #password, click #submit
# Type: done

node flowmind.js run <id>
```

---

## 🎯 V1 Status

| Feature | Status |
|---------|--------|
| CLI | ✅ Working |
| Flow Replay | ✅ Working |
| Screenshots | ✅ Working |
| Failure Detection | ✅ Working |
| PII Sanitization | ✅ Working |
| Desktop Viewer | ✅ Working |
| Local Install | ✅ Working |

---

## 📄 Documentation

See [FINAL-SUMMARY.md](./FINAL-SUMMARY.md) for complete documentation.

---

**Version**: 0.1.0 | **License**: MIT
