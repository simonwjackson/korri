---
title: "feat: Headless streaming audio option and module identity audit"
type: feat
status: completed
date: 2026-05-26
verify_command: "just test-nix"
---

# feat: Headless streaming audio option and module identity audit

## Summary

Adds an opaque `services.korri.server.streaming.audio.pulseServer` option that maps to `PULSE_SERVER` on `korri-sunshine.service`, so headless streaming hosts can route audio without Korri reaching into the host's user identity, audio stack, or socket conventions. Ships alongside a `nix/tests/`-level audit that fails the build if any `nix/modules/korri-*.nix` file starts hardcoding usernames, literal UIDs, `/run/user/<uid>` paths, or audio-stack module mutations — preserving the trivial-swap property when Korri eventually moves to a dedicated `korri` system user.

---

## Problem Frame

The system-mode `korri-sunshine.service` introduced earlier today (commit `2d1b3b5`) no longer inherits the logged-in user's pulseaudio/pipewire session environment, so it can't capture audio for the stream. Sobo connects, video flows, the wrapper launches the game — and the stream is silent. The naive fix (`PULSE_SERVER=unix:/run/user/1000/pulse/native` in mountainous's aka config) works for today but bakes in the streaming user's UID and the host's specific audio stack at exactly the layer that needs to stay portable for the upcoming korri-system-user migration. This plan introduces the integration seam without making those assumptions inside Korri.

---

## Requirements

- R1. Korri exposes a single opaque option that a host can use to point `korri-sunshine.service` at a PulseAudio/PipeWire-pulse server.
- R2. Korri makes no decisions about the host's user identity (no hardcoded usernames or UIDs), audio stack (no `services.pipewire`/`services.pulseaudio` mutation), or runtime-directory shape (no literal `/run/user/<uid>` paths) outside of option documentation.
- R3. When the option is enabled, Korri fails eval with a clear message if no server address is provided.
- R4. Existing streaming behavior is unchanged when the option is left at its default (off) — no `PULSE_SERVER` is set, no new dependencies, no new assertions fire.
- R5. A `nix/tests/`-level audit fails the build if any future change introduces a hardcoded user identity or audio-stack mutation in `nix/modules/korri-*.nix`.

---

## Scope Boundaries

- The mountainous-side host opt-in is not in this plan (linger, `services.pipewire.enable`, `korri-sunshine.{after,wants}`, and the actual `pulseServer` value live in the host repo).
- This plan does not introduce or migrate to a `korri` system user — it only preserves the property that doing so later requires zero Korri-module changes.
- Sunshine's internal audio capture path is unchanged. The plan models the audio surface as `PULSE_SERVER` only, not also `PIPEWIRE_REMOTE` or `PULSE_RUNTIME_PATH`.
- Existing `example = "/run/user/1000/..."` strings in option `example` and `description` fields are not rewritten. The audit excludes those contexts by design — option documentation is not the surface this audit governs.
- No `docs/solutions/` writeup. Inline option documentation is the only deliverable docs.

### Deferred to Follow-Up Work

- Mountainous host opt-in for aka: separate change in the `mountainous` repo, lands after this plan ships.
- Future `korri` system-user migration: separate change, expected to be a host-only edit by construction once this plan lands.

---

## Context & Research

### Relevant Code and Patterns

- `nix/modules/korri-server.nix` — owns `services.korri.server.streaming.*` options (line ~353) and the `systemd.services.korri-sunshine` config block (line ~640). The new audio option subtree and PULSE_SERVER env wiring both land here.
- `nix/modules/korri-server.nix:691-693` — the existing `environment = compositorEnv // { WAYLAND_DISPLAY = ...; }` merge is the extension point for adding `PULSE_SERVER`.
- `nix/modules/korri-server.nix:413-450` — existing `assertions = [{ assertion = ...; message = ''...''; }]` list — the new assertion uses the same shape.
- `nix/tests/korri-server-module-check.nix` — pure-Nix `evalConfig` + `check` list pattern. New audio scenarios extend the existing file.
- `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix` — closest neighbor for the audit's shape: a `pkgs.runCommand` that reads source files at build time and fails with a clear message. New audit follows this template.
- `flake.nix:528-545` — checks output where new test files get wired.

### Institutional Learnings

- None directly applicable. The audit is a new pattern; the rest extends well-established conventions.

### External References

- None — local patterns are sufficient.

---

## Key Technical Decisions

- **Option lives under existing `streaming` subtree, not a sibling**: matches the rest of the streaming surface (`appName`, `runtimeDir`, `intentPath`, `statusPath`), all of which are scoped to streaming and live in the same module. Avoids a parallel top-level audio tree that would invite drift.
- **Explicit `audio.enable` boolean rather than `pulseServer != null` as the on/off switch**: matches the streaming surface convention and lets a host keep a known-good `pulseServer` value while temporarily disabling audio without erasing it. Also produces a clearer assertion message.
- **`PULSE_SERVER` only, not `PIPEWIRE_REMOTE` or `PULSE_RUNTIME_PATH`**: narrowest viable surface. Sunshine speaks the PulseAudio API today; pipewire-pulse compatibility is the documented integration story across the ecosystem. Adding additional env vars would broaden the contract without evidence of need.
- **Audit is a build-time grep, not a Nix-eval-time check**: the forbidden patterns are textual conventions about module source code, not semantic properties of the evaluated config. Build-time `grep` produces clearer failure messages, mirrors the existing `korri-sunshine-runtime-bitrate-patch-check.nix` pattern, and avoids parsing Nix source in Nix.
- **Audit excludes `example =` and `description = ''…''` contexts**: option documentation is allowed to reference concrete socket paths (and currently does, in `korri-game-stream.nix:213,228`). The audit governs config behavior, not docstring prose.

---

## Open Questions

### Resolved During Planning

- Where the option lives: `services.korri.server.streaming.audio.*` (see Key Technical Decisions).
- What env var Korri sets: `PULSE_SERVER` only.
- How the audit handles existing documentation: excludes `example =` and `description` contexts.

### Deferred to Implementation

- Exact `sed`/`grep` pipeline for skipping `description = ''…''` multi-line blocks — straightforward but more readable to land with the actual file in front of you.

---

## Implementation Units

### U1. Add `streaming.audio` option and plumb PULSE_SERVER into korri-sunshine.service

**Goal:** Introduce the opaque audio-server option, wire it into the existing korri-sunshine environment merge, and assert that `audio.enable = true` requires a non-null server address.

**Requirements:** R1, R3, R4

**Dependencies:** None

**Files:**
- Modify: `nix/modules/korri-server.nix`

**Approach:**
- Add an `audio` submodule beside `appName`/`runtimeDir`/`intentPath`/`statusPath` inside the existing `streaming` option tree (around line ~353+). Two options: `enable` (mkEnableOption, default false) and `pulseServer` (nullable string, default null) with a clear `description` explaining that the host owns the value and Korri does not derive or validate it.
- In the `systemd.services.korri-sunshine` config block (around line ~640+), extend the `environment = compositorEnv // { WAYLAND_DISPLAY = ...; }` merge with a conditional `PULSE_SERVER` attr using `lib.optionalAttrs (cfg.streaming.audio.enable && cfg.streaming.audio.pulseServer != null)`. When the option is off or null, the unit env is unchanged.
- Add an assertion to the existing `assertions = [ ... ]` list: `assertion = !cfg.streaming.audio.enable || cfg.streaming.audio.pulseServer != null;` with a message that names both option paths and explains that the host config owns the value.
- The option `description` must explicitly state that Korri does not derive, discover, or validate the path, and that the host config is responsible for ensuring the socket is reachable at unit start.

**Patterns to follow:**
- Option declaration shape: existing `services.korri.server.streaming.{appName,runtimeDir,intentPath,statusPath}` in the same file.
- Environment merge shape: existing `compositorEnv // { WAYLAND_DISPLAY = ...; }` at `nix/modules/korri-server.nix:691-693`.
- Assertion shape: existing assertions block around `nix/modules/korri-server.nix:413-450`.

**Test scenarios:**
- (covered in U2)

**Verification:**
- With `audio.enable = false` (default), `systemd.services.korri-sunshine.environment` contains no `PULSE_SERVER` key and is otherwise byte-identical to the pre-change shape.
- With `audio.enable = true` and `pulseServer` set, `systemd.services.korri-sunshine.environment.PULSE_SERVER` equals the configured value.
- With `audio.enable = true` and `pulseServer = null`, the module's `config.assertions` list contains an entry whose `assertion` is `false` and whose `message` names both `services.korri.server.streaming.audio.enable` and `services.korri.server.streaming.audio.pulseServer`.

---

### U2. Cover U1 in korri-server-module-check

**Goal:** Add the test scenarios that lock in U1's behavior under the existing module-check harness.

**Requirements:** R1, R3, R4

**Dependencies:** U1

**Files:**
- Modify: `nix/tests/korri-server-module-check.nix`

**Approach:**
- Add four `check ".audio: ..."` entries alongside the existing checks. Use the same `evalConfig` + `assertion` shape already in use.
- The scenarios construct test configurations (`audioDisabled`, `audioEnabledWithServer`, `audioEnabledMissingServer`) layered on top of the existing base module used by neighbouring tests, then assert on `systemd.services.korri-sunshine.environment` or on whether eval throws.

**Patterns to follow:**
- Existing checks in `nix/tests/korri-server-module-check.nix` that query `serverSystemUnit <config>` to inspect unit env. The "system mode absolute overrides: env reflects overrides" check is a near-identical template — assert on a specific env-attr value.
- Asserting that a module assertion would fire: read `config.assertions` from the evaluated module and find the entry whose message matches; verify `assertion == false` under the failing config and `assertion == true` under the passing config. This avoids `builtins.tryEval` because module assertions do not throw until something forces a system build — reading `config.assertions` is non-throwing and gives a structured handle on each entry.

**Test scenarios:**
- Happy path: `audio.enable = false` (default) — no `PULSE_SERVER` key in the unit env.
- Happy path: `audio.enable = true` with `pulseServer = "unix:/run/user/1000/pulse/native"` — unit env contains `PULSE_SERVER=unix:/run/user/1000/pulse/native`.
- Error path: `audio.enable = true` with `pulseServer = null` — eval throws and the assertion message mentions both `services.korri.server.streaming.audio.enable` and `services.korri.server.streaming.audio.pulseServer`.
- Integration scenario: audio plumbing is sunshine-only — `audio.enable = true` with `pulseServer` set does NOT cause `PULSE_SERVER` to appear in the `korri-game-stream-sunshine-app` wrapper env or in `korri-server.service`'s environment. (Sunshine captures audio; the wrapper and server have no business with it.)

**Verification:**
- The `korri-server-module` flake check passes with the four new scenarios included.
- Each new scenario produces a distinct `check "audio: …"` entry in the failures list when broken intentionally during local iteration (proves the scenarios are exercising the module, not silently passing).

---

### U3. Add module-identity audit and wire into flake checks

**Goal:** Lock in the forward-compat property that `nix/modules/korri-*.nix` stays free of hardcoded user identity and audio-stack mutation, so the future korri-system-user swap is a host-only edit.

**Requirements:** R2, R5

**Dependencies:** None (independent of U1/U2; can land first or last)

**Files:**
- Create: `nix/tests/korri-module-identity-audit-check.nix`
- Modify: `flake.nix`

**Approach:**
- New check is a `pkgs.runCommand "korri-module-identity-audit" { } '' ... ''` derivation that takes the `nix/modules/` directory as input, iterates over `korri-*.nix`, strips `example =` lines and `description = ''…''` blocks, then `grep -nE`'s for forbidden patterns. On any match it prints the file, line number, and pattern, and exits 1 with a message pointing the contributor at this plan and the relevant Key Technical Decision.
- Forbidden patterns (regex set):
  - `\bsimonwjackson\b` — literal username
  - `/run/user/[0-9]+` — UID-prefixed runtime paths
  - `\bservices\.(pipewire|pulseaudio|jack)\b` — Korri mutating the host's audio stack
  - `\busers\.users\.[a-z_][a-zA-Z0-9_-]*\s*\.\s*(linger|uid)\s*=` — Korri setting literal-username linger or uid (allows `${cfg.user}`-style references because those have `${` after `users.users.`)
- Filter strategy: pipe the file through `sed` that deletes `example =` lines and `description = ''` through matching `''` blocks, then `grep` the result. The audit's failure message includes the file, the original (un-filtered) line number, and which pattern matched.
- Wire the check into `flake.nix` in the existing `// {` module-checks block (around line 528-545), passing `src = ./nix/modules`.

**Patterns to follow:**
- `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix` — closest neighbour for a `runCommand`-based source-file audit. Mirror its argument-passing shape (pass the source path in, `cd $src` inside the script, `touch $out` on success).
- Existing flake-checks wiring at `flake.nix:528-545` — add the new check beside `korri-server-module`, `korri-compositor-module`, etc.

**Test scenarios:**
- Happy path: audit passes against the current `nix/modules/korri-*.nix` tree. This is the most important scenario — if the audit fails on the current tree, the rules are over-tight and need adjustment.
- Edge case: lines containing `example = "/run/user/1000/..."` (currently present in `korri-game-stream.nix:213,228`) do NOT trigger the audit.
- Edge case: lines inside `description = ''…''` blocks that mention `simonwjackson` or `/run/user/1000` or `services.pipewire` (added as test prose during implementation, removed after verification) do NOT trigger the audit.
- Error path: a synthetic single-line test fixture containing `users.users.simonwjackson.linger = true;` triggers the audit and the failure message names the file, line, and matched pattern. This can be exercised inline in the check script (write a temp fixture, run the audit logic on it, assert it exits non-zero, then continue).
- Error path: a fixture containing `services.pipewire.enable = true;` triggers the audit.
- Error path: a fixture containing `XDG_RUNTIME_DIR=/run/user/1000` triggers the audit.
- Edge case: a fixture containing `users.users.${cfg.user}.linger = true;` does NOT trigger the audit (the `${cfg.user}` interpolation is the supported form).

**Verification:**
- The `korri-module-identity-audit` flake check passes against the current `nix/modules/korri-*.nix` tree.
- The new check is wired into the flake checks aggregate so the project's standard nix-test recipe includes it.
- Introducing a deliberately-forbidden line into any `nix/modules/korri-*.nix` file causes the audit to fail with a clear message naming the file, line number, and which forbidden pattern matched.

---

## System-Wide Impact

- **Interaction graph:** `korri-sunshine.service` env gains one optional attr (`PULSE_SERVER`). No other unit, wrapper, or process is affected. The `korri-game-stream-sunshine-app` wrapper and the `korri-server.service` are deliberately untouched.
- **Error propagation:** Eval-time assertion when `audio.enable = true` without `pulseServer`. Build-time audit failure when forbidden patterns are introduced into `nix/modules/korri-*.nix`. Both are loud and pointed.
- **State lifecycle risks:** None. The new option is a single env-var passthrough with no on-disk state, no service ordering, and no startup-time discovery.
- **API surface parity:** New public NixOS option (`services.korri.server.streaming.audio.{enable,pulseServer}`). Default values mean existing host configs are unaffected; opt-in only.
- **Integration coverage:** The cross-layer scenario "audio plumbing is sunshine-only" is in U2's test scenarios — verifies the new option doesn't leak into wrapper or server env.
- **Unchanged invariants:** Existing streaming options, the `korri-sunshine.service` unit shape (`User`/`Group`/`WorkingDirectory`/`ExecStart`/`ExecStartPre`/wants/requires/after), the wrapper script env, and the assertion list's other entries are all explicitly unchanged by this plan.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Audit's `sed` filter for `description = ''` blocks is brittle if a module nests `''` inside a docstring (rare in this codebase). | U3's "happy path" test against the current tree is the canary; if a description block ever breaks the filter, the audit fails loudly with a parseable line reference. Easy to fix forward. |
| The audit may be too tight and reject a legitimate future use of `users.users.<literal>` (e.g. a system-account declaration with a fixed name). | If that case arises, the audit becomes a forcing function: either the literal belongs in a host config and is wrongly in `nix/modules/`, or the rule needs a documented carve-out. Either resolution is a healthy signal. |
| Mountainous host config still needs to opt audio in. Audio remains silent until that lands. | Tracked under "Deferred to Follow-Up Work". Today's failure mode (silent stream) is unchanged by this plan, so shipping in isolation is safe. |

---

## Documentation / Operational Notes

- The option's inline `description` is the primary documentation. It must state:
  - Korri does not derive, discover, or validate the path.
  - The host config owns the streaming user, audio stack, and socket location.
  - The host config is responsible for ensuring the socket is reachable at unit start (e.g. via lingering, system-level pipewire, or explicit `after`/`wants` ordering).
- No `docs/solutions/` writeup. The forward-compat audit is the institutional learning, expressed in code.

---

## Sources & References

- Today's session, commits `2d1b3b5` … `fedda7b` (system-mode sunshine landing, SWAYSOCK plumbing).
- `nix/modules/korri-server.nix:353-410` — existing `streaming.*` option tree.
- `nix/modules/korri-server.nix:640-720` — `systemd.services.korri-sunshine` unit construction.
- `nix/tests/korri-server-module-check.nix` — module-check test harness pattern.
- `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix` — source-file audit pattern.
- `flake.nix:528-545` — module-checks wiring.
