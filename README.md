# GhostRun

**Record once. Replay as a ghost.**

GhostRun is a local-first CLI for browser automation, API testing, and load testing. Record browser flows, test REST APIs with assertions, and run load tests. No cloud. No account. Runs entirely on your machine.

[![npm version](https://img.shields.io/npm/v/ghostrun-cli)](https://www.npmjs.com/package/ghostrun-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://github.com/TechBuiltBySharan/ghostrun/workflows/CI/badge.svg)](https://github.com/TechBuiltBySharan/ghostrun/actions)
[![Downloads](https://img.shields.io/npm/dm/ghostrun-cli)](https://img.shields.io/npm/dm/ghostrun-cli)

## Install

```bash
npm install -g ghostrun-cli
```

## Quick Start

```bash
# Record a new flow
ghostrun record

# Run a flow
ghostrun run <flow-id>

# Explore a website
ghostrun explore <url>

# Run tests
npm test
```

## Features

- **Browser Automation** - Record and replay browser flows with Playwright
- **API Testing** - Test REST APIs with assertions and variables
- **Load Testing** - Run VU-based load tests locally
- **Web Dashboard** - Visual UI at `ghostrun serve --ui`
- **AI Integration** - Claude-powered selector healing

## Commands

| Command | Description |
|---------|-------------|
| `record` | Record a new flow |
| `run <id>` | Run a flow |
| `explore <url>` | Explore a website |
| `serve --ui` | Start web dashboard |
| `flow:list` | List all flows |
| `flow:import <file>` | Import a flow |
| `chat` | Start AI chat |
| `perf` | View performance reports |

## Testing

```bash
npm install
npm test           # Unit + E2E tests
npm run test:all   # All tests including comprehensive
npm run test:flows # Flow execution tests
```

## Documentation

- [API Documentation](docs/API.md)
- [Examples](docs/EXAMPLES.md)
- [Test Results](tests/RESULTS.md)

## License

MIT
