# GhostRun Product Operating Model

## Why this document exists

This is the canonical product note for GhostRun.

It explains:

- what GhostRun is
- who it is for
- how the product should behave
- what data it should keep
- what command model we should converge on
- what safeguards must exist so the product stays trustworthy

This is written for engineers and contributors who need a clear shared model before adding features.

## Product definition

GhostRun should become:

**a local-first regression, monitoring, and AI-assisted browser/API automation product for SaaS teams**

The product should work in three places:

1. on a developer laptop
2. inside CI/CD pipelines
3. on a schedule against deployed environments

The key product property is that GhostRun should feel like part of the user's application lifecycle, not like a detached script runner.

## What the product must do

At a minimum, GhostRun should let a team:

- create flows quickly
- store them as explicit project artifacts
- run them against local, staging, preview, and production targets
- use the same assets in local development, CI, and monitoring
- inspect failures with useful evidence
- propose repairs safely
- learn from past runs without falling into bad autonomous loops

## Product pillars

GhostRun should stay organized around four pillars:

### 1. Author

Create or update test assets.

Examples:

- record browser flows
- generate flows from prompts
- import from cURL or OpenAPI
- explore an app and turn behavior into reusable checks

Output from authoring must become explicit project assets. AI output is not the source of truth; the saved flow is.

### 2. Run

Execute saved assets deterministically.

Examples:

- run a smoke test locally
- run a regression suite in CI
- run a scheduled monitor against staging or production

Run mode should not silently rewrite tests.

### 3. Repair

When a run fails, GhostRun should produce a repair path.

Examples:

- selector repair
- assertion repair
- wait tuning
- configuration or environment suggestions

Repair should create a reviewable proposal first.

### 4. Improve

GhostRun should analyze its own history and suggest where the system needs to get better.

Examples:

- repeated failure patterns
- stale repair proposals
- flaky flows
- missing profile data
- high AI usage with low value

Improve should start as report-first, not mutation-first.

## Core operating modes

GhostRun should support two user interaction modes across the product:

### `assist`

Human-in-loop.

GhostRun asks before important actions such as:

- mutating a saved flow
- applying a repair proposal
- changing configuration with operational impact
- using sensitive secrets where policy requires review

### `auto`

Perform and inform.

GhostRun acts directly where policy allows, then reports what it did.

Even in `auto`, hard safeguards still apply. Autonomous behavior is allowed only inside clear boundaries.

## Command model

The long-term CLI should stay small and product-shaped.

The command model we should converge on is:

- `ghostrun init`
- `ghostrun run`
- `ghostrun author ...`
- `ghostrun repair ...`
- `ghostrun monitor ...`
- `ghostrun report ...`
- `ghostrun profile ...`
- `ghostrun ai ...`
- `ghostrun improve`
- `ghostrun doctor`

### Design rule

Do not keep adding raw top-level commands for every feature.

We should prefer:

- a few stable verbs
- short subcommands
- flags for advanced behavior
- guided terminal menus for discoverability

That is easier for real teams to learn and easier for us to maintain.

## Terminal UX

GhostRun should win easy points in terminal UX.

That means:

- useful no-args menu
- short, plain questions
- visible current status
- obvious defaults
- clear next step after each action

A user should not need to memorize the CLI before getting value.

The terminal UI should help them:

- browse what GhostRun can do
- select the action
- answer only the minimum required questions
- see where artifacts were written

## Project workspace

GhostRun should keep project-local memory in:

`./.ghostrun/`

This is what makes the tool grow with the product.

### Current workspace shape

```text
.ghostrun/
  config.json
  .gitignore
  profiles/
  flows/
    browser/
    api/
    generated/
  suites/
  environments/
  auth/
    storage-state/
  fixtures/
  baselines/
  proposals/
    repairs/
  runs/
  reports/
    improve/
  ai/
    sessions/
    usage/
    summaries/
  knowledge/
```

### What belongs here

Stable or semi-stable project artifacts:

- project config
- profiles
- flow definitions
- suites
- baselines
- repair proposals
- app knowledge caches

Generated or local operational state:

- run artifacts
- reports
- auth state
- AI session logs

Machine-global operational data can still live in:

`~/.ghostrun/`

Examples:

- SQLite data
- shared caches
- local machine-only operational data

## Configuration and profiles

GhostRun should have two separate concepts:

### `config.json`

Project behavior and policy.

Examples:

- interaction mode
- active profile
- AI policy
- CI AI policy
- approval policy
- auto-improve policy
- loop guard thresholds

### `profiles/*.json`

Environment targets.

Examples:

- local
- staging
- preview
- production

Each profile should describe:

- `baseUrl`
- `variables`
- `auth.strategy`
- `auth.loginFlow`
- `auth.storageState`
- `auth.usernameVar`
- `auth.passwordSecret`
- `auth.tokenSecret`
- `metadata`

### Why profiles matter

Profiles are how the same flow becomes useful across environments.

Without profiles, the product stays stuck in ad hoc local testing.

With profiles, GhostRun becomes suitable for:

- real CI pipelines
- deploy validation
- scheduled monitoring
- shared QA conventions inside a repo

### Variable resolution order

The intended order is:

1. explicit CLI flags
2. selected profile
3. `.ghostrun.env`
4. project config defaults
5. legacy DB-backed environment data where still applicable

This preserves local override ergonomics without making `.env` the product model.

### Supported auth strategies

Profiles should be able to drive runtime auth setup directly.

Current supported strategies are:

- `none`
- `storage-state`
- `form`
- `basic-auth`
- `bearer-token`

Secret references should resolve from environment variables first, then project-local secret files, then the local GhostRun vault when available.

## AI model

AI should be an augmentation layer, not the execution core.

GhostRun should work without AI.

AI should be used for:

- authoring drafts
- repair proposals
- summaries
- bounded improvement analysis

AI should not be a hidden runtime dependency for basic execution.

## AI ledger

If GhostRun uses AI, it should keep an audit trail.

For each AI interaction, we should record:

- provider
- model
- mode
- start/end or duration
- token usage
- estimated cost
- prompt hash
- sanitized prompt preview
- sanitized response preview
- links to run, flow, or proposal context

This data enables:

- cost reporting
- usage analysis
- debugging
- governance
- future billing if the product gains hosted/team features

## Repair proposals

Repair proposals should be stored under:

`./.ghostrun/proposals/repairs/`

They should replace silent runtime healing.

### Repair rule

When GhostRun finds a likely fix during a failed run:

- do not silently mutate the flow
- do not pretend the run passed cleanly
- create a proposal artifact
- let the user review or apply it under policy

This is a hard product trust rule, especially for CI.

### Narrow auto-apply lane

One narrow exception is acceptable outside CI:

- selector repairs only
- only in `auto` mode
- only when project policy explicitly allows it
- only when the target is not production-like
- only while loop guard thresholds remain below limit

Even in that lane, GhostRun should keep the current run failed and require a rerun to prove the change.

## Improve workflow

GhostRun should keep data about what it has done so it can analyze itself.

That is the purpose of `ghostrun improve`.

It should examine:

- failed runs
- repeated failure patterns
- open repair proposals
- AI activity
- profile gaps
- repeated no-op behavior

### Initial improve rule

Start with:

- analyze
- summarize
- recommend
- stop

Do not start with autonomous mutation.

### Future auto-improve rule

If we later allow limited auto-improve behavior, it must be:

- narrow in scope
- explicit in config
- bounded by loop guards
- observable in reports
- reversible

## Safeguards

GhostRun must not get trapped in loops or make hidden destructive decisions.

### Safeguard policy surface

The project config should carry limits such as:

- `autoImproveEnabled`
- `maxAutoImproveIterations`
- `maxRepairAttemptsPerRun`
- `maxSameFailureRepeats`

### What safeguards should prevent

- repeating the same failed repair forever
- mutating tests silently in CI
- applying widening assertions repeatedly
- retrying without changing the underlying condition
- using AI continuously without producing actionable output
- touching secrets or production settings without approval

### Practical stop conditions

Any future autonomous workflow should stop when:

- the same proposal keeps recurring
- the same failure repeats past threshold
- no material change was made in the last iteration
- the policy forbids mutation in the current context
- CI mode is active and the change would alter committed assets

## CI/CD contract

For GhostRun to be credible in CI/CD, it needs a stable contract:

- deterministic exit codes
- headless execution
- machine-readable reports
- no interactive prompts
- no implicit flow mutation
- clear artifacts on failure

The expected pattern is:

1. install GhostRun
2. install or restore browser dependencies
3. select profile and suite or flow
4. run in CI-safe mode
5. publish artifacts
6. fail the job on test failure

## Architecture direction

Today, the canonical shipping surface is still the root CLI and MCP server:

- `ghostrun.ts`
- `mcp-server.ts`

The monorepo packages remain useful implementation modules and a future cleanup path, but they should not define the marketed product surface until the rewrite is actually coherent.

## What is implemented now

The current direction already includes:

- project workspace scaffolding
- project config
- profiles
- interaction mode
- AI session and usage logging
- repair proposal artifacts
- profile-aware run resolution
- bounded improve reports
- better terminal discoverability

## What still needs to be built

The next high-value steps are:

1. apply profile auth strategies during runs
2. broaden repair proposals beyond selectors
3. finish moving the CLI toward the smaller command model
4. strengthen machine-readable CI reporting
5. enforce loop guards for any future auto-apply lane
6. build stronger report and audit surfaces on top of stored GhostRun data

## Product standard

Every new feature should be judged against these questions:

1. Does this make GhostRun easier to use?
2. Does this make GhostRun more reliable?
3. Does this make GhostRun more transparent?
4. Does this reduce the chance of unproductive autonomous behavior?

If the answer is weak, the feature is probably the wrong shape.
