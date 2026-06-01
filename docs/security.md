# GhostRun Security & Privacy

GhostRun is a **local-first QA agent**. Your keys, credentials, and test data should stay on your machine or in your CI secret store — never in the npm package, never in committed flow files, and never sent to AI providers without sanitization.

---

## What ships on npm

The `ghostrun-cli` package publishes **only** this whitelist (`package.json` → `files`):

| Included | Purpose |
|----------|---------|
| `ghostrun.js` | Compiled CLI |
| `mcp-server.js` | MCP server for AI assistants |
| `README.md`, `MCP-SETUP.md`, `REFERENCE.md`, `CHANGELOG.md` | Docs |
| `LICENSE` | License |
| `templates/` | Example flows, profiles, CI templates (placeholders only) |

**Never published:** source `.ts` files, `.ghostrun/`, `.env`, tests, `packages/`, coverage, your database, screenshots, or AI session logs.

Before every publish, `npm run publish:check` runs `scripts/publish-safety-check.mjs` to scan the tarball for forbidden paths and secret patterns.

---

## Where secrets belong

| Secret type | Store here | Never store here |
|-------------|------------|------------------|
| Anthropic / OpenAI API key | Shell env, CI secret (`ANTHROPIC_API_KEY`) | Flow JSON, git, npm |
| App passwords / tokens | CI secrets, `.ghostrun/auth/secrets/` (gitignored) | Profile `variables` in git |
| Bearer tokens | Env var referenced by profile `tokenSecret` | Plain text in profile JSON |
| Session cookies | `.ghostrun/auth/storage-state/` (gitignored) | Committed to git |
| Local overrides | `.ghostrun.env` (gitignored at project root) | `package.json` |

### Profile pattern (safe to commit)

```json
{
  "auth": {
    "strategy": "bearer-token",
    "tokenSecret": "STAGING_API_TOKEN"
  }
}
```

Set `STAGING_API_TOKEN` in GitHub Actions → Settings → Secrets, or export locally.

---

## AI & privacy safeguards

GhostRun works **without AI**. When AI is enabled:

1. **PII sanitization** runs before every prompt (`sanitizePII` — emails, phones, cards, API key shapes).
2. **Sanitized previews only** are stored in `.ghostrun/ai/sessions/` (600 chars max).
3. **CI mode** disables silent flow mutation; repair proposals are review-only.
4. **No screenshots or DB dumps** are sent to models by default.

Disable AI in CI entirely:

```bash
ghostrun run --ci --ai off
```

---

## Project audit

Run before committing or releasing:

```bash
ghostrun audit
```

Checks for:

- Plaintext secrets in profiles, flows, and config
- `.ghostrun.env` / `.env` with real credentials
- Missing `.gitignore` rules for auth state and secrets
- Flows referencing `sk-ant-` or private key material

Also run:

```bash
ghostrun doctor
```

---

## CI checklist

- [ ] `ANTHROPIC_API_KEY` only in GitHub Secrets (optional)
- [ ] App tokens in GitHub Secrets, referenced by profile name
- [ ] `.ghostrun/profiles/` committed — variables only, no plaintext passwords
- [ ] `.ghostrun/auth/` **not** committed (gitignored)
- [ ] `ghostrun run --ci --ai off` for deterministic gates
- [ ] Artifacts uploaded — not pasted into PR comments with secrets

---

## Reporting security issues

Open a private security advisory on GitHub or contact the maintainer. Do not file public issues with real credentials or production URLs.
