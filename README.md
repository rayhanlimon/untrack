# untrack

Zero-dependency fixer for **".gitignore not working"**: diagnose why an ignored file is still tracked, preview the fix, and apply `git rm --cached` safely (working-tree files always kept).

The classic trap ([SO 25436312](https://stackoverflow.com/questions/25436312/gitignore-not-working), [SO 38983153](https://stackoverflow.com/questions/38983153/git-is-not-respecting-gitignore-instruction-to-ignore-env-files)): you commit `.env`, panic, add `.env` to `.gitignore`, commit again — and the secret is STILL tracked. `.gitignore` never untracks. `git check-ignore` hides tracked files by design, so even diagnosis misleads. untrack explains and fixes it in one command.

## What it does

- `check <file>` — explain status: `tracked-despite-rule` (committed before the rule), `tracked-no-rule` (no pattern matches), `ignored-ok`, `untracked-unignored`, `gone-untracked`
- `scan` — find ALL tracked files that match ignore rules (uses `check-ignore --no-index`, which plain `git check-ignore` hides)
- `fix <file> [--dry-run]` — `git rm --cached` (index only; your file stays on disk), refuses when no rule matches
- `--json` output for scripts

## Install

Requires Node 18+ and git. No npm dependencies.

```sh
npm install -g untrack
# or from source:
git clone https://github.com/rayhanlimon/untrack && cd untrack
node bin/untrack.js --help
```

## Usage

```sh
# why is .env still tracked?
untrack check .env
# == .env [tracked-despite-rule]
#   - tracked AND ignored - classic: file was committed BEFORE the rule existed
#   - rule source: .gitignore:1 pattern=.env
#   - fix: untrack fix .env (git rm --cached, keeps working-tree file)

# preview, then fix
untrack fix .env --dry-run
untrack fix .env && git commit -m "stop tracking .env"

# whole-repo audit
untrack scan
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | ok |
| 1 | a fix step failed |
| 2 | usage error / not a repo / no rule matches |

## Security notes

- `fix` never deletes working-tree files and never rewrites history. Already-pushed secrets still need rotation + history purge (see `git filter-repo`).
- No network access, no telemetry.

## Limitations

- Local glob explainer covers common patterns; exotic `**/` edge cases defer to `git check-ignore --no-index` (the source of truth).
- One repo per invocation (uses `process.cwd()`).

## Roadmap

- [ ] `--all` flag for `fix` (batch-untrack everything `scan` finds)
- [ ] pre-commit hook recipe
- [ ] `filter-repo` purge guide generator for pushed secrets

## Development

```sh
npm test   # node --test test/*.test.js (16 tests, zero deps; fixtures under .test-tmp/)
```

## License

MIT — see [LICENSE](LICENSE).
