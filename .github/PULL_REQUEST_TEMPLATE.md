## What does this PR do?

<!-- One sentence. "Fixes #123 — the run command crashed when..." -->

## Type of change

- [ ] Bug fix
- [ ] New feature / command
- [ ] New flow action or template
- [ ] Docs / REFERENCE update
- [ ] Refactor (no behavior change)
- [ ] Other: ___

## How to test

<!--
For browser flows:
    npm run build && node ghostrun.js learn <url> --visible

For API flows:
    node ghostrun.js flow:from-curl "curl ..." && node ghostrun.js run "<name>"

For load tests:
    node ghostrun.js perf:run "<name>" --vus 10 --duration 10
-->

1.
2.

## Checklist

- [ ] `npm run build` compiles without errors
- [ ] Tested manually with `node ghostrun.js <command>`
- [ ] New command added to the `help` switch block (if applicable)
- [ ] CHANGELOG.md updated (if this adds or changes behavior)
- [ ] No new runtime dependencies added without discussion

## Related issues

Closes #
