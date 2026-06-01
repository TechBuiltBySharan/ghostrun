# GhostRun Product Direction

## Positioning

GhostRun is a local-first regression, monitoring, and AI-assisted browser/API automation product for SaaS teams.

It should work in three environments:

1. Developer laptop
2. CI/CD pipeline
3. Scheduled monitoring against deployed environments

## Product Modes

GhostRun should have three explicit modes of operation.

### 1. Author

Create or update test assets from:

- browser recording
- natural language prompts
- cURL commands
- OpenAPI specs
- app exploration

Outputs from authoring must become explicit project artifacts committed to source control. They should not stay as opaque AI state.

### 2. Run

Execute pinned test assets deterministically:

- locally during development
- in CI on pull requests and deploys
- on schedule for regression monitoring

Run mode must not mutate tests implicitly.
AI should be disabled by default during CI execution, except optionally for post-run failure summarization.

### 3. Repair

When a flow breaks, GhostRun should analyze the failure and propose a patch:

- selector repair
- assertion repair
- environment/config suggestions
- retry guidance

Repair mode should produce a reviewable proposal first. CI must not silently rewrite tests by default.

## AI Model

The runner must work without AI.

AI is an optional augmentation layer used for:

- generating first-draft tests
- summarizing failures
- proposing repairs
- expanding coverage

Execution should remain mostly non-AI. Authoring and repair are the intended AI-heavy surfaces.

GhostRun should support BYOK provider configuration so teams can use their own Anthropic/OpenAI-compatible credentials. Local models should remain a supported path for privacy-sensitive teams.

## CI/CD Contract

For GhostRun to be credible in CI/CD, it needs a stable contract:

- deterministic exit codes
- machine-readable output
- JUnit/JSON report output
- environment variable support
- headless browser execution
- no interactive prompts in CI
- no implicit mutation of committed test assets

The default CI story should be:

1. Install GhostRun
2. Restore or install browser dependencies
3. Run a named suite or flow set
4. Produce artifacts and exit non-zero on failure

CI safety rules:

- no silent selector healing during runs
- no direct mutation of committed artifacts
- no raw secret or token material sent to models
- AI repair output should be emitted as a reviewable patch or proposal artifact

## Canonical Product Surface

Near term, the root CLI and MCP server are the canonical product surface:

- `ghostrun.ts`
- `mcp-server.ts`
- root `package.json`

The modular `apps/` and `packages/` structure can continue as a refactor target, but it should not define the marketed product surface until the rewrite is complete and the command surface is aligned.

## Near-Term Priorities

### Priority 1: Reliability

- choose one canonical entrypoint
- align scripts, docs, and CI
- remove stale or misleading commands
- harden local storage and schema evolution

### Priority 2: CI Readiness

- add supported CI scripts
- document pipeline usage
- stabilize machine-readable outputs
- add at least one deterministic non-network validation path

### Priority 3: Test Lifecycle

- make author/run/repair explicit in CLI and docs
- turn generated flows into durable artifacts
- add reviewable repair proposal workflows

### Priority 4: Team Use

- secrets and environment handling
- project profile management for local/staging/production
- suite-based execution
- report publishing
- notifications and deployment gating

## Definition of a Useful v1 for Real SaaS Projects

GhostRun is useful for real SaaS QA when a team can:

- create smoke and regression flows quickly
- commit them as repo assets
- run them against named profiles like local, staging, and production
- run them in CI on every PR or deploy
- run them against staging/production on a schedule
- inspect screenshots, logs, and failures
- accept or reject AI-proposed repairs as normal code changes
