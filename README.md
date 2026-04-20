# GhostRun

**Record once. Replay as a ghost.**

A local-first CLI for browser automation, API testing, and load testing. No cloud. No account. Runs entirely on your machine.

[![npm version](https://img.shields.io/npm/v/ghostrun-cli)](https://www.npmjs.com/package/ghostrun-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://github.com/TechBuiltBySharan/ghostrun/workflows/CI/badge.svg)](https://github.com/TechBuiltBySharan/ghostrun/actions)
[![Downloads](https://img.shields.io/npm/dm/ghostrun-cli)](https://img.shields.io/npm/dm/ghostrun-cli)

## Install

```bash
npm install -g ghostrun-cli
ghostrun init
```

## Quick Start

```bash
# Record a browser flow
ghostrun record

# Run a saved flow
ghostrun run <flow-id>

# Explore a website and generate flows
ghostrun explore <url>

# Test an API
ghostrun api get https://jsonplaceholder.typicode.com/posts/1

# Run load test
ghostrun load --vus 10 --duration 30s <flow-id>

# Start web dashboard
ghostrun serve --ui

# AI-powered chat
ghostrun chat
```

## Features

| Feature | Description |
|---------|-------------|
| **Browser Automation** | Record/replay with Playwright, smart waits, selector healing |
| **API Testing** | REST testing with assertions, variables, chaining |
| **Load Testing** | Local VU-based load tests, exportable to k6 |
| **AI Integration** | Claude-powered selector healing and chat |
| **Web Dashboard** | Visual UI for flows and runs |
| **Privacy** | Local-only, PII sanitization |

## Commands

| Command | Description |
|---------|-------------|
| `ghostrun record` | Record a new flow |
| `ghostrun run <id>` | Run a flow |
| `ghostrun explore <url>` | Explore and generate flows |
| `ghostrun api <method> <url>` | Test APIs |
| `ghostrun load <flow-id>` | Run load test |
| `ghostrun serve --ui` | Start web dashboard |
| `ghostrun chat` | AI chat assistant |
| `ghostrun flow:list` | List all flows |
| `ghostrun flow:import <file>` | Import a flow |
| `ghostrun perf` | View performance reports |
| `ghostrun init` | Setup and install browsers |

## Testing

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests (100% pass rate)
npm test           # Unit tests (58)
npm run test:flows # Comprehensive (29)
npm run test:all   # All tests
```

## Examples

### Browser Flow
```json
{
  "name": "Wikipedia Search",
  "graph": {
    "nodes": [
      { "id": "n1", "type": "action", "action": "navigate", "url": "https://wikipedia.org" },
      { "id": "n2", "type": "action", "action": "fill", "selector": "input[name=search]", "value": "Playwright" },
      { "id": "n3", "type": "action", "action": "press", "selector": "input[name=search]", "value": "Enter" }
    ],
    "edges": [
      { "source": "n1", "target": "n2" },
      { "source": "n2", "target": "n3" }
    ]
  }
}
```

### API Test
```json
{
  "name": "Health Check",
  "api": {
    "method": "GET",
    "url": "https://api.example.com/health",
    "assert": [
      { "type": "status", "value": 200 },
      { "type": "jsonpath", "value": "$.status", "expected": "ok" }
    ]
  }
}
```

## Architecture

```
ghostrun/
├── ghostrun.ts       # Main CLI (6000+ lines)
├── packages/
│   ├── executor/     # Flow execution engine
│   ├── adapters-web/ # Playwright adapter
│   ├── database/    # SQLite manager
│   ├── privacy/     # PII sanitization
│   └── ...
└── tests/           # Test suites
```

## Privacy

All data stays local:
- No cloud dependency
- PII automatically sanitized
- Database stored at `~/.ghostrun/`

## License

MIT
