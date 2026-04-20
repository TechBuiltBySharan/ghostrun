# GhostRun Reliability And Trust Plan

## Objective

Take GhostRun to a level where releases are predictable, privacy-safe, low-surprise, and easy to trust:

- reliable local installs
- reproducible builds
- deterministic test coverage
- no accidental secret or PII leakage
- no leftover `flowmind` branding in product, packaging, storage paths, or docs

---

## Changes Implemented

### Phase 1: Cleanup (Completed ✅)

**Removed Desktop Apps:**
- `apps/desktop` - Tauri app (empty components, redundant with web dashboard)
- `apps/electron` - Electron wrapper (read-only, non-functional)
- `apps/mcp-server` - Empty scaffolding

**Reason:** The web dashboard (`ghostrun serve --ui`) provides full GUI functionality. Desktop apps were non-functional and added maintenance burden.

### Phase 2: Branding Migration (In Progress 🔄)

**Completed:**
- All package names changed from `@flowmind/*` to `@ghostrun/*`
- All storage paths updated from `.flowmind` to `.ghostrun`
- Core package `packages/core` renamed

**Remaining:**
- Some test files and mock apps still reference `flowmind` (test files only)
- Demo package still named `flowmind-demo` (demo package, low priority)

### Phase 3: Prompt Improvements (Completed ✅)

**Enhanced Prompts:**

1. **Failure Analysis Prompt** - Now includes:
   - Error categorization (ELEMENT_NOT_FOUND, NETWORK_ERROR, etc.)
   - Selector issue detection with specific recommendations
   - More structured response format
   - Helper functions for error analysis

2. **Selector Healing Prompt** - Now includes:
   - Guidelines for robust selector selection
   - Priority order for selector types (data-testid > id > semantic > avoid fragile)
   - Warnings against XPath, text-based, and positional selectors
   - Better format examples

3. **Chat System Prompt** - Now includes:
   - Improved response rules for reliability
   - Removed invented commands
   - More focused command list
   - Better error pattern analysis

4. **Claude Model Updated:**
   - Changed from `claude-haiku-4-5-20251001` (non-existent) to `claude-3-5-haiku-20241022`
   - Increased max_tokens for better responses

### Phase 4: Test Infrastructure (Completed ✅)

**Added Live Website Test Flows:**
- `wikipedia-smoke.flow.json` - Wikipedia homepage smoke test
- `mdn-docs.flow.json` - MDN web docs search test
- `github-home.flow.json` - GitHub homepage navigation test

**Created Reliability Test Runner:**
- `scripts/run-reliability-tests.js` - Full test suite runner
- Reports pass/fail with detailed diagnostics
- Saves results to `~/.ghostrun/reliability-report.json`
- Designed for CI integration

---

## Current Product Shape

### Canonical Entry Point

The root `ghostrun.ts` CLI is the shipping product. The monorepo under `apps/` and `packages/` provides modular packages but is secondary.

**Primary entry:** `node ghostrun.js` or `ghostrun` CLI

### Key Paths

| Path | Description |
|------|-------------|
| `~/.ghostrun/` | Data directory |
| `~/.ghostrun/data/ghostrun.db` | SQLite database |
| `~/.ghostrun/screenshots/` | Flow screenshots |
| `~/.ghostrun/reliability-report.json` | Test results |

---

## Remaining Work

### Phase 5: Validation Pipeline (Not Started)

**Needs:**
- Add `pnpm validate` script that works from fresh clone
- Fix any missing build dependencies
- Remove false-positive `test` scripts from packages
- Add type checking to CI

### Phase 6: Privacy Hardening (Not Started)

**Needs:**
- Unify sanitization into one privacy module
- Classify sensitive data handling
- Add privacy regression tests
- Restore strict CSP for any desktop surfaces

### Phase 7: Operational Boringness (Not Started)

**Needs:**
- Standardize error types
- Add health check commands
- Add deterministic test fixtures

---

## Definition Of Done For "Boringly Reliable"

GhostRun should only be considered near 95% to 100% dependable when:

- [x] Desktop apps removed (no longer needed, web dashboard covers use case)
- [ ] Canonical product surface chosen and documented
- [ ] Branding migration completed
- [ ] Prompts improved and tested
- [ ] Live website tests added and passing
- [ ] Reliability test runner in CI
- [ ] Privacy enforcement unified
- [ ] Error messages standardized
- [ ] Health checks implemented

---

## Quick Start Testing

Run reliability tests against live websites:

```bash
# Build first
npm run build

# Run all live tests
node scripts/run-reliability-tests.js tests/flows/live/

# Run specific test
node scripts/run-reliability-tests.js tests/flows/live/wikipedia-smoke.flow.json
```

---

## Latest Changes Summary

| Date | Change |
|------|--------|
| 2025-01-15 | Removed `apps/desktop`, `apps/electron`, `apps/mcp-server` |
| 2025-01-15 | Renamed all `@flowmind/*` packages to `@ghostrun/*` |
| 2025-01-15 | Updated `.flowmind` storage paths to `.ghostrun` |
| 2025-01-15 | Improved failure analysis prompt with error categorization |
| 2025-01-15 | Enhanced selector healing prompt with guidelines |
| 2025-01-15 | Fixed Claude model name (was invalid) |
| 2025-01-15 | Added Wikipedia, MDN, GitHub smoke test flows |
| 2025-01-15 | Created `run-reliability-tests.js` test runner |