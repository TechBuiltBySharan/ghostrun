# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 2.0.x (alpha) | ✅ Active development |
| 1.3.x | ✅ Maintenance fixes |
| 1.2.x and below | ❌ Upgrade recommended |

Install the latest from [npm](https://www.npmjs.com/package/ghostrun-cli) or [GitHub Releases](https://github.com/TechBuiltBySharan/ghostrun/releases).

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

1. Email **security@builtbysharan.com** (or open a private [GitHub Security Advisory](https://github.com/TechBuiltBySharan/ghostrun/security/advisories/new) if enabled).
2. Include: affected version, reproduction steps, and impact.
3. We aim to acknowledge within **48 hours** and provide a fix timeline within **7 days** for confirmed issues.

## Secrets and safe usage

GhostRun is designed for **staging QA** — not production credentials in committed files.

- Store passwords in env vars or CI secrets — never in profile JSON
- Run `ghostrun audit` before committing `.ghostrun/` changes
- Use `.ghostrun/auth/secrets/` (gitignored) for local secret files

Full guide: [docs/security.md](docs/security.md)

## npm supply chain

The published package is built from tagged releases via GitHub Actions. Verify integrity:

```bash
npm view ghostrun-cli dist.tarball
npm install -g ghostrun-cli@<version>
```

Report suspicious npm publishes immediately.
