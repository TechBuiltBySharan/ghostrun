# Flowmind V1 - System Specification

## Overview
Flowmind is a local-first desktop application that learns how a web app works by observing user actions, builds a memory graph of flows, and can replay those flows intelligently to test the application and detect failures.

## Architecture

### Technology Stack
- **Desktop Shell**: Tauri v2 (Rust backend + JS frontend)
- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- **Runtime Engine**: Node.js + TypeScript
- **Automation**: Playwright
- **Local API Server**: Fastify
- **CLI**: Node + Commander
- **Database**: SQLite + Drizzle ORM

### Monorepo Structure
```
flowmind/
├── apps/
│   ├── desktop/          # Tauri desktop application
│   ├── runtime/          # Local API server + runtime engine
│   ├── cli/              # Command-line interface
│   └── mcp-server/       # MCP protocol server (stub)
├── packages/
│   ├── core/             # Shared types and utilities
│   ├── recorder/         # Browser event capture
│   ├── memory/           # Graph-based flow storage
│   ├── executor/         # Flow replay engine
│   ├── reporting/        # Test results and reports
│   ├── privacy/          # PII stripping layer
│   ├── vault/            # Secure credential storage
│   └── adapters-web/     # Playwright web adapter
```

## Core Modules

### 1. Recorder Module
- Capture user actions (click, input, navigation, scroll)
- Track DOM context (selectors, xpath, bounding boxes)
- Track route changes (SPA navigation)
- Track network requests (XHR, Fetch)
- Track console logs (errors, warnings, info)
- Condense raw events into meaningful steps

### 2. Memory Graph Module
- **Nodes**: Represent screens/states
  - `id`: Unique identifier
  - `type`: screen | action | decision | end
  - `label`: Human-readable description
  - `selectors`: Key DOM elements
  - `url`: Current URL pattern
  - `metadata`: Additional context
- **Edges**: Represent transitions
  - `id`: Unique identifier
  - `source`: Source node ID
  - `target`: Target node ID
  - `action`: Action type (click, input, navigate)
  - `selector`: Target element
  - `value`: Input value (sanitized)
  - `conditions`: Validation rules

### 3. Flow Engine
- Save flows from Learn Mode
- Represent flows as graph paths
- Define start and end nodes
- Store success conditions
- Store slot candidates (dynamic input fields)

### 4. Execution Engine
- Replay flows using Playwright
- Match current screen to graph node
- Execute next action intelligently
- Validate transitions between nodes
- Stop on failure and capture context
- Handle dynamic content with selectors

### 5. Reporting Module
- Store run results in SQLite
- Attach screenshots per step
- Attach network logs (HAR format)
- Attach console logs
- Generate readable failure summaries
- Track execution timing

### 6. Privacy Layer (MANDATORY DAY 1)
- Strip PII before any AI call
- Replace sensitive values with placeholders:
  - `[EMAIL]` - Email addresses
  - `[TOKEN]` - Bearer tokens, API keys
  - `[PASSWORD]` - Passwords
  - `[PHONE]` - Phone numbers
  - `[SSN]` - Social security numbers
  - `[CREDIT_CARD]` - Credit card numbers
  - `[UUID]` - UUIDs and IDs
- Regex-based detection and replacement
- Audit log of sanitized data

### 7. Local Vault
- Store credentials securely
- OS keychain integration (macOS Keychain, Windows Credential Manager)
- Environment-based key storage
- Never expose raw secrets to AI

## V1 Features

### Included
- [x] Learn Mode (start/stop recording)
- [x] Save flow with name
- [x] Run single flow
- [x] Run all flows
- [x] View run report
- [x] View screenshots
- [x] View network logs
- [x] View console logs

### Excluded (V1)
- Mobile support
- ADB integration
- MCP integrations (stub only)
- Full AI planner
- Auto exploration
- Cloud sync

## AI Usage Guidelines

### Use AI ONLY for:
- Classifying screen type (login, dashboard, form, etc.)
- Extracting slot meaning (field purpose)
- Summarizing failures

### DO NOT:
- Let AI control browser actions
- Depend on AI for deterministic execution

## Data Storage

### SQLite Schema
- `flows`: Stored flow definitions
- `runs`: Execution run history
- `steps`: Individual step results
- `screenshots`: Screenshot references
- `logs`: Network and console logs

### File Storage
```
~/.flowmind/
├── data/
│   ├── flowmind.db
│   ├── flows/
│   │   └── {flow-id}/
│   │       └── graph.json
│   ├── runs/
│   │   └── {run-id}/
│   │       ├── report.json
│   │       └── screenshots/
│   ├── logs/
│   └── vault/
│       └── credentials.enc
```

## Success Criteria

### V1 Must Achieve:
1. Learn a login flow
2. Replay it reliably
3. Detect when login fails
4. Show:
   - Where it failed
   - What was expected
   - Screenshot of failure
   - Relevant network error if any

## Implementation Phases

### Phase 1: Foundation
- [x] Project scaffolding
- [ ] Core types and interfaces
- [ ] Basic Tauri app shell
- [ ] Database setup

### Phase 2: Recording
- [ ] Browser extension / content script
- [ ] Event capture
- [ ] Action condensation
- [ ] Storage

### Phase 3: Memory Graph
- [ ] Graph data structure
- [ ] Node/Edge management
- [ ] Flow serialization

### Phase 4: Execution
- [ ] Playwright integration
- [ ] Flow replay
- [ ] State matching
- [ ] Failure detection

### Phase 5: Reporting
- [ ] Screenshot capture
- [ ] Log aggregation
- [ ] Report generation

### Phase 6: Privacy & Vault
- [ ] PII stripping
- [ ] Secure storage
- [ ] Keychain integration
