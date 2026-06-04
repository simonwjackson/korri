---
title: "refactor: Harden sessiond system wiring"
type: refactor
status: completed
date: 2026-05-29
origin: backlog/task-011 - harden-sessiond-system-wiring.md
verify_command: "just test-nix"
---

# refactor: Harden sessiond system wiring

## Summary

Tighten the deploy/system seams around `nix/modules/korri-sessiond.nix` and its two consumers (kiosk image, source-machine image): give source-machine a non-root token-sharing path via a small shared Unix group, mirror the kiosk's server-side sessiond wiring, add a both-or-neither assertion to the game-stream module, reconcile a `0700`/`0755` runtime-dir mode mismatch, fix a wrong role-inference comment, and extend Nix eval checks so the kiosk hardening exceptions and the sessiond PATH/env contract are pinned for both kiosk and source-machine images. No daemon runtime behavior changes.

---

## Problem Frame

The sessiond deep dive surfaced several wiring seams that quietly degrade or hard-fail on source-machine hosts and risk silent regressions on kiosk. The most acute is source-machine token sharing: sessiond writes `/run/korri-sessiond/token` as `root:root 0600`, but the game-stream runner that needs to read it runs as a different non-root user (`korri-source`) inside the Sunshine session, so any path that depends on `KORRI_SESSIOND_TOKEN_FILE` cannot authenticate. The kiosk image already solves the analogous problem with `sharedGroup = "korri-server"`, but source-machine never opted in.

Related drift around the same module:
- `services.korri.gameStream.sessiond.url`/`.tokenFile` accept a half-configured pair silently and fall back to the in-process launcher, then explode later at launch time.
- The runtime-dir tmpfiles rule (`0700`) and the token setup script's `install -d -m 0755` disagree, so whichever runs last wins.
- A let-binding comment claims the standalone `inferredRole` default is `"kiosk"`, but the implementation resolves to `"source-machine"`.
- The kiosk hardening exceptions (`ProtectHome = false`, `ReadWritePaths`) are only partially covered by tests, so a refactor could quietly drop one.
- PATH/env requirements (`setsid`, `swaymsg`, `gamescope`, shell, renderer binary) are asserted only inside the SM8550 RockNix config check; the generic kiosk image and source-machine image are not covered.

A correct state machine is not enough if the unit cannot authenticate clients, spawn children with the expected tools, or start in the intended role. Wiring failures turn into black screens, busy hosts, or launch failures that look like lifecycle bugs.

---

## Requirements

- R1. Source-machine sessiond token sharing works for the non-root game-stream/Sunshine path without a broad chmod hack (origin AC #1).
- R2. `services.korri.gameStream.sessiond.url` and `.tokenFile` have a both-or-neither eval-time assertion mirroring the server module (origin AC #2).
- R3. The sessiond runtime directory mode is consistent across tmpfiles and the token setup script, with the intentional choice documented in code (origin AC #3).
- R4. The `services.korri.sessiond.role` inference comment matches the implementation's actual default behavior (origin AC #4).
- R5. Kiosk hardening exceptions (`ProtectHome = false`, `ReadWritePaths = [compositor.home]`) are preserved intentionally and covered by tests or module assertions (origin AC #5).
- R6. PATH/env requirements for `setsid`, `swaymsg`, `gamescope`, shell, renderer binary, and role-specific child processes are verified through Nix eval checks on both kiosk and source-machine images (origin AC #6).
- R7. `just test-nix` and the existing module/image checks pass after the change (origin AC #7).

---

## Scope Boundaries

- No changes to sessiond TypeScript runtime code (`tools/device/sessiond*.ts`).
- No changes to sessiond HTTP token authentication, ExecStartPost retry script, or the daemon's runtime state model.
- No work on running sessiond as a non-root user — tracked separately as `../../parking-lot/01KSRGFP03RFZQGFSS6FJ1FCTJ-stop-running-as-root`.
- No new whole-image eval checks beyond the sessiond/PATH scope (live-USB persistence, audio plumbing, etc.).
- No renaming or relocating of the sessiond / game-stream / server modules; the boundary refactor already landed.

### Deferred to Follow-Up Work

- Migrating sessiond off root (`../../parking-lot/01KSRGFP03RFZQGFSS6FJ1FCTJ-stop-running-as-root`): once that lands, the shared-group story introduced here may collapse into a simpler "everyone is the same non-root user" story, or stay as-is. Out of scope here.
- Adding a Bun unit test for `createSessionLauncherFromEnv()`'s both-or-neither behavior on the runtime side: the Nix-side eval assertion is the load-bearing gate; the runtime assertion can land separately if needed.

---

## Context & Research

### Relevant Code and Patterns

- `nix/modules/korri-sessiond.nix` — sessiond module: `tokenSetupScript`, `inferredRole`, `sharedGroup` option, tmpfiles rule, `path` option, `extraEnvironment` option.
- `nix/modules/korri-game-stream.nix` — game-stream module: `sessiond.url` / `sessiond.tokenFile` options, Sunshine app wrapper that exports `KORRI_SESSIOND_URL` / `KORRI_SESSIOND_TOKEN_FILE`. No both-or-neither assertion today.
- `nix/modules/korri-server.nix` — already has the both-or-neither assertion pattern (search for "Sessiond wiring is both-or-neither"). Reuse the same shape for the game-stream module.
- `nix/images/kiosk.nix` — reference wiring: `sharedGroup = "korri-server"`, full `path` list (bash, sway, gamescope, retroarch, client), `extraEnvironment` for renderer identity, `ProtectHome = lib.mkForce false`, `ReadWritePaths = [compositor.home]`, `services.korri.server.sessiond.{url,tokenFile}` wired.
- `nix/images/source-machine.nix` — current gap: only `gameStream.sessiond` is wired; `server.sessiond` is unset; no `sharedGroup`; no `path` extension.
- `nix/images/headless.nix` — declares `users.users.korri-server` / `users.groups.korri-server`. Source-machine declares `users.users.korri-source` / `users.groups.korri-source`. Both users need to be in the shared sessiond-clients group.
- `nix/tests/korri-sessiond-module-check.nix` — already exercises `sharedGroup = "korri-server"` and `util-linux` on PATH. Extension point for runtime-dir mode and the corrected role-inference default text.
- `nix/tests/korri-game-stream-module-check.nix` — extension point for the new both-or-neither assertion permutations.
- `nix/tests/korri-source-machine-image-check.nix` — extension point for source-machine sessiond `sharedGroup`, `server.sessiond` wiring, and source-machine PATH assertions.
- `nix/tests/korri-rocknix-sm8550-config-check.nix` — already asserts `ReadWritePaths`; extension point for `ProtectHome = false`.

### Institutional Learnings

- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` — sessiond owns the kiosk renderer; the PATH/env contract on sessiond's unit is renderer-load-bearing.
- The "korri-server falls through to bare PATH" runtime error doc referenced in `nix/images/kiosk.nix` line 153 explains why both `server.sessiond` and `gameStream.sessiond` must be wired on streaming hosts.

### External References

- None — this is a local-pattern extension; nixpkgs `systemd.tmpfiles` and `serviceConfig.RuntimeDirectory` semantics are already understood and used in the module.

---

## Key Technical Decisions

- **Introduce `korri-sessiond-clients` as the shared Unix group on source-machine, declared in `nix/images/source-machine.nix`.** Both `korri-server` and `korri-source` are added via `extraGroups`. Sessiond's `sharedGroup` on source-machine is set to this new group. Rationale: kiosk's "share with `korri-server`" works because there's only one consuming user; source-machine has two (the system korri-server unit and the in-Sunshine korri-source runner), so a single purpose-named group is clearer than overloading `korri-server` or `korri-source` to mean "people who can read the sessiond token."
- **Keep the kiosk's `sharedGroup = "korri-server"` as-is.** No reason to introduce the new group on kiosk where only one user reads the token.
- **Wire `services.korri.server.sessiond.{url,tokenFile}` on source-machine.** This closes the asymmetry with kiosk and ensures korri-server's managed-launch path delegates to sessiond instead of silently falling back to the bare-PATH in-process launcher.
- **Put the both-or-neither assertion in `korri-game-stream.nix`, not `korri-server.nix`.** The game-stream module is consumable standalone (the assertion needs to fire whether or not the server module is loaded). Use the same message shape as the existing server-side assertion.
- **Land runtime-dir mode at `0700` everywhere.** The token setup script's `install -d -m 0755` becomes `install -d -m 0700`. Add a one-line comment naming the intentional choice (the runtime dir holds the capability token; group/world read on the directory leaks token presence/timing even when the file itself is `0640`).
- **Role-inference comment is doc-only.** Rewrite the let-binding comment to match `if kioskEnabled then "kiosk" else "source-machine"`. Leave `defaultText` and the option description alone — they already match the implementation.
- **Hardening exceptions stay in `nix/images/kiosk.nix` (the layering boundary is intentional: the module is role-agnostic, the kiosk image carries kiosk-specific relaxations).** Add an explicit `ProtectHome = false` assertion to the SM8550 RockNix config check, mirroring the existing `ReadWritePaths` assertion. Do not move the relaxations into the module.
- **PATH/env coverage extension uses fixtures, not full image builds.** Extend module-level checks where possible (sessiond `sharedGroup` permutations, runtime-dir mode); extend the existing source-machine image check for source-machine sessiond PATH. Do not introduce a separate kiosk-image-only check — the SM8550 RockNix config check already covers the kiosk PATH contract for the platforms that matter.

---

## Open Questions

### Resolved During Planning

- Q: Should the shared group be `korri-server` (reuse existing) or a new `korri-sessiond-clients`? A: New group on source-machine. Rationale documented in Key Technical Decisions.
- Q: Should the both-or-neither assertion live in the server module or game-stream module? A: Both, but the game-stream module is the new home for the game-stream-specific assertion (mirrors the existing pattern in the server module).
- Q: Should the runtime-dir mode mismatch resolve to `0700` or `0755`? A: `0700`. The directory holds a capability token; minimum permission is correct.

### Deferred to Implementation

- Whether source-machine's sessiond should also extend `path` with shell/util-linux beyond the module default. The module already pushes `pkgs.util-linux` for `setsid`; source-machine's sessiond does not spawn Electrobun and the game-stream runner pre-resolves to absolute paths, so a bare PATH is likely sufficient. Verify during implementation: if the new source-machine PATH assertion (U6) needs anything beyond what the module already provides, add it explicitly.

---

## Implementation Units

### U1. Reconcile runtime-dir mode to 0700 in token setup script

**Goal:** Stop the token setup script's `install -d -m 0755` from clobbering the tmpfiles `0700` rule.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `nix/modules/korri-sessiond.nix`
- Test: `nix/tests/korri-sessiond-module-check.nix`

**Approach:**
- In `tokenSetupScript`, change `install -d -m 0755` to `install -d -m 0700`.
- Add a one-line comment naming why the mode is `0700` (capability-token directory; group/world readable directory leaks presence even when the file is `0640`).
- No tmpfiles change.

**Patterns to follow:**
- Existing inline rationale comments in `tokenSetupScript` for the `tr`-vs-`sed` choice and the `od` token shape.

**Test scenarios:**
- Edge case: ExecStartPre script string contains `install -d -m 0700` (not `0755`). Verify by extending the existing module-check `withSharedGroup` / `baselineKiosk` fixtures.
- Edge case: tmpfiles rule still lands at `0700 root root` (regression guard for the existing assertion).

**Verification:**
- `nix build .#checks.x86_64-linux.korri-sessiond-module --no-link` passes.

---

### U2. Fix the role-inference comment to match implementation

**Goal:** Eliminate the doc/code drift in the `inferredRole` let-binding comment.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `nix/modules/korri-sessiond.nix`

**Approach:**
- Rewrite the let-binding comment block above `inferredRole` to describe the actual behavior: `kiosk` when `services.korri.compositor.kiosk.enable` is true (typically via the kiosk image), `source-machine` otherwise (including the standalone module-eval case).
- Leave `defaultText` and the option description unchanged.

**Test scenarios:**
- Test expectation: none — doc-only change with no observable behavior.

**Verification:**
- `nix build .#checks.x86_64-linux.korri-sessiond-module --no-link` still passes (regression guard).
- Visual inspection of the rewritten comment confirms it matches the code.

---

### U3. Add both-or-neither assertion to korri-game-stream module

**Goal:** Fail evaluation when only one of `services.korri.gameStream.sessiond.url` / `.tokenFile` is set, mirroring the server module.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Modify: `nix/modules/korri-game-stream.nix`
- Test: `nix/tests/korri-game-stream-module-check.nix`

**Approach:**
- Add an assertion block to the existing `assertions` list in `korri-game-stream.nix` that requires both `cfg.sessiond.url` and `cfg.sessiond.tokenFile` to be set together or both null, with the same prose shape as `nix/modules/korri-server.nix`'s server-side assertion (search for "sessiond.url and").
- Message names both option paths and explains the silent fall-back failure mode.

**Patterns to follow:**
- `nix/modules/korri-server.nix` — the existing `services.korri.server.sessiond.url and tokenFile must be set together` assertion. Use the same shape.

**Test scenarios:**
- Happy path: both `sessiond.url` and `sessiond.tokenFile` set → assertions pass. Reuse the source-machine wiring in a new module-check fixture.
- Error path: only `sessiond.url` set → assertion fires with a message containing both option paths.
- Error path: only `sessiond.tokenFile` set → assertion fires with a message containing both option paths.
- Edge case: both null → assertions pass (the default).

**Verification:**
- `nix build .#checks.x86_64-linux.korri-game-stream-module --no-link` passes.

---

### U4. Add ProtectHome assertion to SM8550 kiosk config check

**Goal:** Pin the kiosk's `ProtectHome = false` hardening relaxation so a future refactor cannot quietly re-enable it.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `nix/tests/korri-rocknix-sm8550-config-check.nix`

**Approach:**
- Add a per-system `check` entry alongside the existing `sessiond serviceConfig.ReadWritePaths must cover compositor.home` assertion that asserts `sessiondService.serviceConfig.ProtectHome == false`.
- Use the same per-system `checkSystem` helper shape already in the file.

**Patterns to follow:**
- The existing `ReadWritePaths` assertion in the same file (around line 214). Mirror its structure.

**Test scenarios:**
- Integration: Thor + Sobo systems both pass with `ProtectHome = false` on sessiond's serviceConfig (covers `Covers AC #5`).
- Regression guard: if `ProtectHome` is removed from `nix/images/kiosk.nix`, this assertion must fail. Verify by reading the kiosk image file and confirming the assertion targets `lib.mkForce false`.

**Verification:**
- `nix build .#checks.x86_64-linux.korri-rocknix-sm8550-config --no-link` passes for both Thor and Sobo permutations.

---

### U5. Introduce shared sessiond-clients group on source-machine and wire sharedGroup

**Goal:** Make the sessiond token readable by both `korri-server` and `korri-source` users via a small shared Unix group, without changing file permissions across the board.

**Requirements:** R1

**Dependencies:** U1 (mode reconciliation lands first so the test fixtures don't pick up a stale `0755`).

**Files:**
- Modify: `nix/images/source-machine.nix`
- Test: `nix/tests/korri-source-machine-image-check.nix`

**Approach:**
- Declare `users.groups.korri-sessiond-clients` in `nix/images/source-machine.nix`.
- Add `korri-sessiond-clients` to `extraGroups` on `users.users.korri-source` (already declared in the file) and on `users.users.korri-server` (declared in `headless.nix`, override via `users.users.korri-server.extraGroups = [ "korri-sessiond-clients" ]` in the source-machine image).
- Set `services.korri.sessiond.sharedGroup = "korri-sessiond-clients"` on source-machine.
- Add a code comment explaining why the group exists and why it is not `korri-server` (source-machine has two consuming users).

**Patterns to follow:**
- `nix/images/kiosk.nix` line 161-164 — the existing `sharedGroup = "korri-server"` wiring on kiosk. Mirror the code-comment shape.
- `nix/images/source-machine.nix` existing `extraGroups` block on `korri-source`.

**Test scenarios:**
- Happy path: source-machine image evaluates with `services.korri.sessiond.sharedGroup = "korri-sessiond-clients"`. Assert in `korri-source-machine-image-check.nix`.
- Happy path: `users.users.korri-source.extraGroups` contains `"korri-sessiond-clients"`.
- Happy path: `users.users.korri-server.extraGroups` contains `"korri-sessiond-clients"`.
- Happy path: `users.groups."korri-sessiond-clients"` is declared.
- Integration: rendered `ExecStartPre` script contains `chown root:korri-sessiond-clients` and `chmod 0640` (cross-check via the sessiond module's token setup script rendering).

**Verification:**
- `nix build .#checks.x86_64-linux.korri-source-machine-image --no-link` passes.

---

### U6. Wire korri-server.sessiond on source-machine and assert source-machine sessiond PATH

**Goal:** Close the kiosk/source-machine asymmetry — korri-server's managed-launch path delegates to sessiond on source-machine too — and pin the source-machine sessiond PATH/env contract via eval check.

**Requirements:** R1, R6

**Dependencies:** U3 (the both-or-neither assertion on the game-stream module is in place, so this wiring is covered symmetrically), U5 (sharedGroup is set so the token is actually readable when the server consumes it).

**Files:**
- Modify: `nix/images/source-machine.nix`
- Test: `nix/tests/korri-source-machine-image-check.nix`

**Approach:**
- In `nix/images/source-machine.nix`, add `services.korri.server.sessiond.url` and `services.korri.server.sessiond.tokenFile` wired to the same loopback URL and token file already used for `gameStream.sessiond`. Reuse the existing `sessiondPort` / `sessiondTokenFile` let-bindings.
- Code comment cross-references `nix/images/kiosk.nix`'s equivalent server-side wiring.
- Verify whether source-machine sessiond needs any explicit `path` extension. Default expectation: no — `util-linux` for `setsid` is already pushed in by the module, and source-machine sessiond does not spawn Electrobun. If the new source-machine image-check fails because a downstream child needs something else, add it explicitly.
- Extend `nix/tests/korri-source-machine-image-check.nix` with:
  - Assertion: `cfg.services.korri.server.sessiond.url` is non-null and points at `127.0.0.1:<sessiondPort>`.
  - Assertion: `cfg.services.korri.server.sessiond.tokenFile` matches the sessiond token file path.
  - Assertion: sessiond unit `path` contains `pkgs.util-linux` (regression guard on the module-level default).
  - Assertion: sessiond unit environment includes `KORRI_SESSIOND_ROLE = "source-machine"` (already covered) and `KORRI_GAME_STREAM_STATUS_PATH` non-null.
  - Assertion: server unit environment includes `KORRI_SESSIOND_URL` and `KORRI_SESSIOND_TOKEN_FILE` (server-side delegation env).

**Patterns to follow:**
- `nix/images/kiosk.nix` lines ~240+ — `services.korri.server.sessiond = { url = ...; tokenFile = ...; };`.
- Existing assertions in `nix/tests/korri-source-machine-image-check.nix` (gameStream sessiond.url / tokenFile shape).

**Test scenarios:**
- Happy path: source-machine image evaluates with both `gameStream.sessiond.{url,tokenFile}` AND `server.sessiond.{url,tokenFile}` wired (covers AC #1's "verified and fixed" + AC #2 implicitly via the both-or-neither assertion that would fire on a partial wire).
- Happy path: sessiond unit's `path` contains `pkgs.util-linux` (so `setsid` in the shell-launcher resolves on source-machine too).
- Integration: server unit `environment` has `KORRI_SESSIOND_URL` and `KORRI_SESSIOND_TOKEN_FILE` set, both pointing at the same in-image sessiond.
- Edge case: removing `gameStream.sessiond.url` from the image (without removing `tokenFile`) makes the eval fail — verified indirectly because the source-machine image is a known-good wire and a regression there would surface via U3's both-or-neither assertion.

**Verification:**
- `nix build .#checks.x86_64-linux.korri-source-machine-image --no-link` passes.

---

### U7. Run the full Nix test suite

**Goal:** Confirm no module/image check regressed; the change is whole-repo clean.

**Requirements:** R7

**Dependencies:** U1, U2, U3, U4, U5, U6

**Files:**
- None (verification only).

**Approach:**
- Run `just test-nix`.
- If a check unrelated to this plan fails, investigate whether it is a true regression caused by this work or pre-existing breakage; do not paper over unrelated failures.

**Test scenarios:**
- Test expectation: none -- verification-only unit.

**Verification:**
- `just test-nix` exits zero.
- Specifically: `korri-sessiond-module`, `korri-game-stream-module`, `korri-server-module`, `korri-source-machine-image`, `korri-rocknix-sm8550-config` all pass.

---

## System-Wide Impact

- **Interaction graph:** sessiond is the only foreground-session supervisor; its token is read by the server unit (managed-launch delegation) and the game-stream runner (lifecycle:"foreground" intents). The shared-group change widens the set of processes that can read the token on source-machine — both consumers are intentional. Kiosk path is unchanged.
- **Error propagation:** the new game-stream both-or-neither assertion converts a runtime ENOENT-style "shell launcher fell through" failure into an eval-time error with a clear message. Net reduction in surface area.
- **State lifecycle risks:** no changes to sessiond's runtime state. Token rotation behavior preserved (ExecStartPre preserves an existing token; only the chown/chmod step is materially touched, and only for `sharedGroup != null`).
- **API surface parity:** the game-stream module's `sessiond.{url,tokenFile}` options now behave consistently with the server module's equivalent options (both-or-neither). No option renames or removals.
- **Integration coverage:** the new source-machine image check exercises the kiosk-equivalent wiring shape for the first time. Existing module checks remain green; image check is extended, not replaced.
- **Unchanged invariants:** the sessiond HTTP token authentication header, the `/control/start` ExecStartPost handshake, the 40-attempt retry budget, and the `KORRI_SESSIOND_ROLE` env contract are all untouched. The kiosk's `extraEnvironment` block is untouched. Default-when-unset behavior of `sharedGroup` (token stays `root:root 0600`) is unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Adding `korri-server` to a new `extraGroups` on source-machine triggers nixpkgs' "user mutation requires rebuild" behavior or order-of-evaluation surprises. | Use `users.users.korri-server.extraGroups = [ "korri-sessiond-clients" ]` (an attribute set extension, not a definition replacement) so it composes with the `headless.nix` definition. Verify via the new image check. |
| The source-machine sessiond child process needs something on PATH that the module default does not provide, surfacing only at first managed launch. | The new image check (U6) asserts the PATH baseline; if implementation reveals a gap (e.g., a missing shell), extend `services.korri.sessiond.path` explicitly with a code comment naming the consumer. |
| Test fixtures for `korri-sessiond-module-check.nix` shadow the new `0700` mode incorrectly because the existing `baselineKiosk` fixture reuses the module default. | U1's test scenarios explicitly assert `install -d -m 0700` in the rendered `ExecStartPre` script, catching any stale fixture. |
| A reader of the role-inference comment fix interprets it as a behavior change rather than doc-only. | The plan explicitly flags U2 as doc-only; the commit message will say so; `defaultText` and the option description (which the user sees) are unchanged. |

---

## Documentation / Operational Notes

- No user-visible behavior changes; no operator docs need updating.
- No rollout sequencing concerns — this is a build-time + eval-time hardening.
- Existing solutions docs (`docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`, the "korri-server falls through to bare PATH" runtime error doc) remain accurate; no updates needed.

---

## Sources & References

- **Origin document:** `backlog/task-011 - harden-sessiond-system-wiring.md`
- Related code: `nix/modules/korri-sessiond.nix`, `nix/modules/korri-game-stream.nix`, `nix/modules/korri-server.nix`, `nix/images/kiosk.nix`, `nix/images/source-machine.nix`, `nix/images/headless.nix`
- Related tests: `nix/tests/korri-sessiond-module-check.nix`, `nix/tests/korri-game-stream-module-check.nix`, `nix/tests/korri-server-module-check.nix`, `nix/tests/korri-source-machine-image-check.nix`, `nix/tests/korri-rocknix-sm8550-config-check.nix`
- Related backlog: `../../parking-lot/01KSRGFP03RFZQGFSS6FJ1FCTJ-stop-running-as-root.md` (deferred follow-up)
