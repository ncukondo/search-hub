# Task: Self-Upgrade Command (`search-hub upgrade`) + Update Notification

## Purpose

search-hub has no way to discover or apply new releases. reference-manager
already ships a complete self-upgrade feature (`ref upgrade` + async update
notification); port it to search-hub.

Reference implementation (read it directly, it is on this machine):
`~/src/github.com/ncukondo/reference-manager/`

- Spec: `spec/features/self-upgrade.md`
- Code: `src/upgrade/{detect,check,notifier,apply-binary,apply-npm}.ts` (+ tests)
- CLI wiring: `src/cli/commands/upgrade.ts`, notifier hookup in `src/cli/index.ts`

The module is mostly generic; repo-specific parts are constants:

| reference-manager | search-hub |
|---|---|
| REPO `ncukondo/reference-manager` | `ncukondo/search-hub` |
| asset name `ref-{os}-{arch}[.exe]` | `search-hub-{os}-{arch}[.exe]` (matches existing release assets & `scripts/build-binary.sh`) |
| binary basename `ref` / `ref.exe` | `search-hub` / `search-hub.exe` |
| env `REFERENCE_MANAGER_NO_UPDATE_CHECK` | `SEARCH_HUB_NO_UPDATE_CHECK` |
| user-agent `reference-manager-update-check` | `search-hub-update-check` |
| npm package `@ncukondo/reference-manager` | `@ncukondo/search-hub` |
| cache `{data}/update-check.json` | use search-hub's XDG data dir (see `src/utils/` platform paths from task #12) |

## Goal

- `search-hub upgrade` upgrades single-binary and npm-global installs;
  dev/npx installs get guidance only (exit code 2).
- Options: `--check`, `--version <tag>`, `-y/--yes`, `--install-dir <path>`.
- After any normal command finishes, a one-line ASCII notice is printed when a
  newer release exists (async check, 24h cache, silent on network failure).
- Suppression: non-TTY stdout, `SEARCH_HUB_NO_UPDATE_CHECK=1`,
  `--no-update-check`, and the `upgrade` command itself.

## Related Specs

- reference-manager `spec/features/self-upgrade.md` (source of truth for behavior)
- [spec/cli/commands.md](../cli/commands.md) — add `upgrade` command section
- Releases: `gh release list -R ncukondo/search-hub` (assets already follow
  `search-hub-{platform}-{arch}` naming; `install.sh`/`install.ps1` included)

## Related Source Files (new/modified)

- `src/upgrade/detect.ts` / `.test.ts` (new)
- `src/upgrade/check.ts` / `.test.ts` (new)
- `src/upgrade/notifier.ts` / `.test.ts` (new)
- `src/upgrade/apply-binary.ts` / `.test.ts` (new)
- `src/upgrade/apply-npm.ts` / `.test.ts` (new)
- `src/cli/commands/upgrade.ts` / `.test.ts` (new)
- `src/cli/index.ts` (register command + notifier hookup + `--no-update-check`)
- `src/version.ts` (existing VERSION source — reuse, do not duplicate)
- `spec/cli/commands.md`

## Implementation Steps

Each step follows the TDD cycle: Red → Green → Refactor. Port the
reference-manager tests alongside each module and adapt constants/paths —
do not start test suites from scratch.

- [x] Step 1: `src/upgrade/detect.ts` — install-method detection
  - [x] Port tests: binary (`~/.local/bin/search-hub`), npm-global, dev
        (repo checkout / npm link), npx heuristics
  - [x] Note: the single binary is Bun-compiled (`bun build --compile`,
        entry `src/cli/entry-bun.ts`); verify what `process.argv[1]` /
        `process.execPath` look like in a Bun-compiled binary and adjust
        detection accordingly (reference-manager may differ here — document
        what you find in code comments)
        — Bun 1.x: `argv[1]` is a virtual `/$bunfs/root/...` (Unix) or
        `B:\~BUN\root\...` (Windows) path; `process.execPath` is the real
        binary. `resolveInvocationPath()` falls back to execPath for these.
  - [x] Acceptance: unit tests cover all four methods

- [x] Step 2: `src/upgrade/check.ts` — latest-release lookup with cache
  - [x] Port tests: GitHub API hit, 24h TTL cache read/write, network
        failure silence
  - [x] Cache at search-hub's platform data dir as `update-check.json`
  - [x] Acceptance: no network call when cache is fresh

- [x] Step 3: `src/upgrade/apply-binary.ts` + `src/upgrade/apply-npm.ts`
  - [x] Port tests: asset URL construction
        (`https://github.com/ncukondo/search-hub/releases/download/{tag}/search-hub-{os}-{arch}`),
        download → chmod → atomic replace, already-up-to-date, `--check`,
        pinned `--version`, npm-global flow with `-y`
  - [x] Acceptance: strategies return the same `UpgradeResult` shape as
        reference-manager

- [x] Step 4: `src/cli/commands/upgrade.ts` — command wiring
  - [x] Port tests: option parsing, dev/npx guidance + exit code 2,
        error exit code 1
  - [x] Register in `src/cli/index.ts`
  - [x] Acceptance: `search-hub upgrade --check` works end to end (manual)
        — verified via `node dist/cli/index.js upgrade --check` in the
        worktree: dev install detected, guidance printed, exit code 2

- [ ] Step 5: `src/upgrade/notifier.ts` — async update notice
  - [ ] Port tests: notice printed after command completes, all suppression
        rules (non-TTY, env var, flag, `upgrade` command)
  - [ ] Hook into CLI entry; ensure notice never delays or corrupts command
        output (search-hub prints JSON/YAML to stdout in several commands —
        notice must go to stderr or only print when stdout is a TTY;
        follow the reference spec's suppression rules strictly)
  - [ ] Acceptance: `search-hub status` in a TTY with stale version shows
        the one-line notice; piped output never contains it

- [ ] Step 6: Spec update
  - [ ] Add `upgrade` command to `spec/cli/commands.md` (options, exit codes,
        notification behavior, suppression rules)

### Final Step: E2E Integration Tests (MANDATORY)

- [ ] `src/upgrade/upgrade.e2e.test.ts` (or extend CLI e2e):
  - full `upgrade --check` flow against a mocked GitHub API (no real network)
  - binary replace flow with a temp dir standing in for the install dir
  - notifier end-to-end with a fake cache file
- [ ] Run full test suite: `npm test` (and `npm run test:all`)
- [ ] Manual verification: build a local binary via `scripts/build-binary.sh`
      and run `./dist/search-hub-* upgrade --check`
- [ ] Acceptance: All tests pass

## Notes

- **Do not** copy reference-manager's notifier suppression list verbatim —
  search-hub has no `mcp`/`server`/`completion` commands; suppress for
  `upgrade` itself and any machine-facing output paths instead.
- Keep `src/version.ts` as the single version source.
- Network access in tests must be mocked; live GitHub API calls only in the
  optional manual verification.
- No workflow changes needed: release assets already match the expected names.
