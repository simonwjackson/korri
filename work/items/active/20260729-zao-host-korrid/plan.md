---
title: "feat: zao host korrid — smallest Rust host slice"
type: feat
status: active
date: 2026-07-29
verify_command: "just korrid-check"
---

# feat: zao host korrid — smallest Rust host slice

## Summary

Run the existing Rust korrid crate as a daemon on zao serving a hand-configured game list and process-spawning prepare over its native tagged wire; teach the tablet's embedded brain to speak Rust-to-Rust for zao while aka keeps the legacy wire. Deployed imperatively (nix profile + systemd user service — no NixOS host-config changes) for a fast rebuild→push→restart loop. One game, streamed to the tablet via zao's Sunshine, proves the direction.

---

## Problem Frame

The host side of Korri still runs the legacy bun daemon on aka, reached through a compatibility client (`services/korrid/src/upstream.rs`) that was declared scaffolding the day it was written. The user's migration rule: zao hosts the Rust version first; aka switches only at 100% parity. This slice is deliberately the smallest end-to-end cut — it exists to prove the Rust-host direction and establish the iteration loop, not to reach parity.

---

## Requirements

- R1. korrid (the same crate Android embeds) runs on zao as a systemd **user** service, installed via `nix profile` — zero NixOS host-configuration edits
- R2. zao's korrid serves a catalog from a hand-written config file (one or two games) over the native tagged `/rpc` wire
- R3. Prepare on zao launches the configured game command such that the game is visible in zao's Sunshine stream
- R4. The Android brain reaches Rust hosts over the native wire while aka stays on the legacy wire — selected per host by configuration
- R5. With both aka and zao paired on the tablet, confirming a zao game attaches to **zao's** "Korri Stream" (host-aware attach)
- R6. aka's existing flows (catalog, prepare, stream) remain unchanged
- R7. The iteration loop is scripted and documented: local rebuild → push to zao → service restart, in well under a minute after first deploy

---

## Scope Boundaries

- No session status/stop for zao (portal already degrades gracefully when a host can't answer; joins the session model later)
- No parity checklist or aka switchover work
- No sessiond-style lifecycle orchestration or compositor recipes beyond "the game shows up in the stream"
- No discovery/mDNS (zao's address is configuration)
- No proseQL/storage (catalog is a static file; proseQL slots in here later)
- No NixOS module for korrid (comes when deployment graduates from iteration to fleet)
- No auth on the host RPC (LAN-bound, trusted-network assumption — recorded as accepted risk)
- No UI work beyond the minimal host-aware attach in R5

### Deferred to Follow-Up Work

- zao session ops feeding the unified session model: after the web-session-lifecycle contract lands
- Sunshine pairing/provisioning automation: manual for this slice
- Multi-game / scanned catalogs on hosts: with proseQL storage

---

## Context & Research

### Relevant Code and Patterns

- `services/korrid/src/lib.rs` — the tagged `RpcRequest`/`RpcResponse` dispatch and Axum `/rpc` server; `Game`/`CatalogSnapshot` types (no host field today); bind address via `KORRID_ADDRESS`
- `services/korrid/src/upstream.rs` — the legacy-wire client (aka); its `catalog_snapshot`/`prepare_stream` seam is what upstream selection must generalize
- `clients/portal/src/launchables/LaunchablesRoot.tsx` — attach flow: finds the "Korri Stream" app across paired hosts (`bridge.startStream(hostUuid, appId)`); today host choice is not game-aware — the R5 gap
- `contracts/generated/korrid.ts` — typeshare output; additive `Game.host` change regenerates here
- `runtimes/retroarch/devshell.nix` + root `flake.nix` — the pattern for per-area Nix composition; korrid already builds for x86_64-linux in the dev flow
- zao audit (2026-07-29, live): NixOS x86_64 (kernel 6.18), Sunshine in system path but **inactive**, `steam` and `gamescope` present, no active graphical session (greeter on seat0), user `simonwjackson`

### Institutional Learnings

- The legacy wire is scaffolding by decision — new host ops must NOT extend it; they go native-first (AGENTS.md standing decisions)
- Device gates validate the whole surface: the exit test must include the aka regression, not just the zao happy path
- Sunshine needs something to capture: a host with no session streams nothing — provisioning is real work, not config

---

## Key Technical Decisions

- **No compatibility server**: the Rust host speaks its own tagged wire; the Android brain gains a native client beside the legacy one. Building an Effect-RPC server in Rust would be throwaway work against a wire already scheduled to die
- **Same crate, host mode**: one binary; a runtime mode/config selects "Android brain" behavior (loopback, federate upstream) vs "host" behavior (LAN bind, serve catalog/prepare locally). Types shared by construction — no codegen between the two ends
- **Catalog is a config file** on zao (id, title, launch command per game): smallest honest catalog; the file is the seam proseQL later replaces
- **Prepare = spawn the configured command**: no session daemon, no lifecycle tracking beyond "did it start". Sunshine's existing stream carries the pixels
- **Host-aware attach is in scope** (supersedes the synthesis bet "zero portal changes"): `Game` gains an optional host label and the portal prefers the matching stream host for attach. Without it, a two-host tablet may attach to the wrong machine — the slice's exit test would be dishonest. Additive contract change, small portal diff, fallback to current behavior when absent
- **Imperative deployment on purpose** (user call): `nix profile` install + systemd user unit (+ linger), pushed from the dev machine; iteration speed over fleet purity. The NixOS module is explicitly future work
- **zao display strategy is an execution-time choice**: audit shows no active session; options are enabling the existing desktop autologin or a gamescope-based headless session. The unit's outcome is defined (Sunshine streams, game visible); the method is recorded, not prescribed

---

## Open Questions

### Resolved During Planning

- Compat wire or native wire? — Native; both ends are ours and the legacy wire is dying by decision
- Where does the plan's "smallest" stop? — At one config-file game streaming from zao; everything session/parity-shaped is out
- Deployment mechanism? — nix profile + systemd user service (user call, recorded in work.md)

### Deferred to Implementation

- zao display/session method for Sunshine capture (desktop autologin vs gamescope headless) — decided on the machine, recorded in the work item
- Native client transport details (timeouts, error mapping to existing tagged failures) — settle against real code
- Host config file format (likely TOML given the Rust side) and its location under `~/.config` — settle at implementation
- Whether prepare should refuse or no-op when the command is already running — observe what Sunshine attach needs and pick
- How the pushed closure lands on zao (`nix copy` to the store vs profile install from a flake ref) — pick whichever makes R7's loop fastest

---

## Implementation Units

### U1. zao baseline: Sunshine streams something

**Goal:** zao can stream to the paired tablet with a "Korri Stream" app defined — the substrate every later unit assumes.

**Requirements:** R3 (substrate), R7 (partially — establishes the target environment)

**Dependencies:** None

**Files:**
- Modify: `work/items/active/20260729-zao-host-korrid/work.md` (provisioning record: method chosen, versions, pairing state)

**Approach:**
- Bring up a capturable session on zao (autologin desktop or gamescope headless — execution-time choice), run Sunshine as a systemd **user** service consistent with the deployment stance, pair the tablet, define "Korri Stream" and verify a manual stream end-to-end
- Everything done imperatively; every step recorded in the work item so it is repeatable and later automatable

**Test scenarios:**
- Integration (manual): tablet Moonlight-attaches to zao's "Korri Stream" and sees the session
- Test expectation: no automated tests — provisioning unit; the record is the artifact

**Verification:**
- A human-driven stream from zao to the tablet works; pairing survives zao reboot

---

### U2. korrid host mode: config-file catalog over the native wire

**Goal:** The crate learns to be a host: serve its own catalog instead of federating.

**Requirements:** R1 (binary shape), R2

**Dependencies:** None (parallel with U1)

**Files:**
- Create: `services/korrid/src/host/mod.rs`
- Create: `services/korrid/src/host/config.rs`
- Modify: `services/korrid/src/lib.rs`
- Modify: `contracts/generated/korrid.ts` (regenerated: optional host label on `Game`)
- Test: inline `#[cfg(test)]` in `services/korrid/src/host/config.rs` and dispatch tests in `lib.rs`

**Approach:**
- Mode selection via config/env: brain mode (today's behavior, loopback) vs host mode (configurable bind, serve locally)
- Host config file: per-game id, title, launch command; parsed leniently with clear errors
- Catalog op in host mode returns the configured games, each carrying the host's label; `Game.host` is optional/additive so aka-sourced entries stay valid

**Patterns to follow:**
- Existing dispatch arms and tagged outcomes in `lib.rs`; typeshare regeneration via the check script

**Test scenarios:**
- Happy path: valid config file → catalog op returns its games with the host label
- Error path: missing/malformed config → tagged failure naming the problem, server stays up
- Edge case: empty games list → empty catalog, not an error
- Happy path: brain mode untouched — existing tests still green with no config present

**Verification:**
- `just korrid-check` green; a locally-run host-mode instance answers the catalog op over HTTP

---

### U3. Host prepare: spawn the configured command

**Goal:** "Launch this game" works on the host: prepare spawns the command; the game lands in the Sunshine-captured session.

**Requirements:** R3

**Dependencies:** U2

**Files:**
- Create: `services/korrid/src/host/prepare.rs`
- Modify: `services/korrid/src/lib.rs`
- Test: inline `#[cfg(test)]` in `services/korrid/src/host/prepare.rs`

**Approach:**
- Prepare op in host mode: look up game id, spawn the configured command detached (environment for the capturable session supplied via config), return the existing prepared-outcome shape
- Track just enough child state to answer "already running" sanely (refuse vs no-op decided at implementation)
- Spawn failures map to the existing tagged failure vocabulary

**Test scenarios:**
- Happy path: prepare with a known id spawns the command (observable via a test stub command) and returns prepared
- Error path: unknown game id → tagged failure
- Error path: command that cannot start (bad path) → tagged failure carrying the cause
- Edge case: second prepare while running → the chosen semantics, tested explicitly once decided
- Happy path: brain-mode prepare (federation to aka) untouched

**Verification:**
- On zao (post-U1): prepare via curl launches the game visibly into the stream

---

### U4. Android brain: native upstream beside the legacy one

**Goal:** The tablet's brain reaches Rust hosts natively; aka keeps the legacy wire; selection is per-host configuration.

**Requirements:** R4, R6

**Dependencies:** U2 (wire shapes)

**Files:**
- Create: `services/korrid/src/upstream_native.rs`
- Modify: `services/korrid/src/upstream.rs` (extract the client seam both implement)
- Modify: `services/korrid/src/lib.rs` (upstream registry: host entries with kind + address; catalog merges, prepare routes by game's host)
- Test: inline `#[cfg(test)]` in `services/korrid/src/upstream_native.rs`

**Approach:**
- Small client trait over catalog/prepare; legacy client (aka) and native client (Rust hosts) both implement it
- Upstream registry from config/env: ordered host entries; catalog merges per-host results, per-host failure degrades that host's games without failing the whole snapshot; prepare routes to the game's origin host
- Native client is thin: POST the tagged request, decode the tagged response — same serde types, no translation layer

**Test scenarios:**
- Happy path: native client round-trips catalog and prepare against an in-process host-mode server
- Happy path: registry with legacy-aka + native-zao merges both catalogs, host labels intact
- Error path: one host unreachable → its games absent, other host's games present, failure noted
- Happy path: prepare for a zao game routes to zao; for an aka game routes through the legacy client
- Edge case: duplicate game ids across hosts remain distinguishable (host-qualified)

**Verification:**
- `just korrid-check` green; on-device brain with both upstreams configured serves a merged catalog

---

### U5. Host-aware attach in the portal

**Goal:** Confirming a zao game attaches to zao's stream even with aka paired.

**Requirements:** R5

**Dependencies:** U2 (host label), U4 (merged catalog reaching the portal)

**Files:**
- Modify: `clients/portal/src/launchables/state.ts`
- Modify: `clients/portal/src/launchables/LaunchablesRoot.tsx`
- Test: `clients/portal/src/launchables/state.test.ts`

**Approach:**
- Game entries carry the optional host label through the fold; the attach step prefers the paired stream host whose name matches the game's host, falling back to today's first-match behavior when absent
- No treaty change — `startStream(hostUuid, appId)` already takes the host

**Test scenarios:**
- Happy path: game with host "zao", both hosts paired with "Korri Stream" → attach targets zao's uuid
- Happy path: game without host label → today's behavior preserved
- Edge case: game's host not among paired hosts → existing "no Korri Stream on a paired host" notice path
- Error path: attach failure on the matched host surfaces the existing notice

**Verification:**
- `bun test` + typecheck green

---

### U6. Deploy loop + device exit gate

**Goal:** korrid installed and iterable on zao; the whole slice proven from the couch.

**Requirements:** R1, R7, and the end-to-end proof of R2–R6

**Dependencies:** U1, U3, U4, U5

**Files:**
- Modify: `flake.nix` (korrid package output for x86_64-linux)
- Create: `services/korrid/deploy/korrid.service` (systemd user unit template)
- Modify: `justfile` (push/restart/logs recipes for zao)
- Modify: `work/items/active/20260729-zao-host-korrid/work.md` (deploy record)

**Approach:**
- Package the korrid binary as a flake output; push via the fastest workable path (`nix copy` + profile add, decided at implementation); user unit + linger so the daemon survives logout
- `just` recipes make R7's loop one command
- Exit journey: tablet portal lists the zao game (host label visible in dev tools at minimum) → confirm → prepare spawns it on zao → attach lands on zao's Korri Stream → gameplay → aka regression: aka games still list and stream
- Kill test: restart the user service mid-idle → catalog recovers without tablet-side intervention

**Test scenarios:**
- Integration (device): the exit journey above, including the aka regression and the wrong-host guard (zao game must not attach to aka)
- Error path (device): stop zao's korrid service → zao games vanish from the list with a notice, aka games unaffected
- Happy path: `just` push recipe completes an edit→restart cycle in under a minute

**Verification:**
- Exit journey green; deploy loop timed and recorded; work.md holds zao's final state

---

## System-Wide Impact

- **Interaction graph:** the Android brain's upstream seam becomes a registry (first structural step toward multi-host); host mode adds a second personality to the korrid binary; portal attach becomes host-aware
- **Error propagation:** per-host catalog failures degrade to partial snapshots + notices (new behavior — previously one upstream meant all-or-nothing); host prepare failures reuse the existing tagged vocabulary end-to-end
- **State lifecycle risks:** spawned game processes are fire-and-forget this slice (no reaping/ownership) — accepted, recorded; profile-installed binary can drift from repo HEAD — the deploy record tracks the installed rev
- **API surface parity:** `Game.host` is additive; legacy-wire shapes untouched; no treaty change
- **Integration coverage:** wrong-host attach is only provable on device with both hosts paired — explicitly in the U6 journey
- **Unchanged invariants:** aka's daemon, wire, and flows; the portal's non-game sources; the Android brain's loopback posture on device

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Sunshine-on-zao provisioning rabbit-holes (headless capture, NixOS specifics) | U1 is timeboxed to "any capturable session"; autologin desktop is the acceptable ugly fallback |
| Unauthenticated LAN-bound RPC on zao | Accepted for trusted LAN this slice; recorded in Scope Boundaries; auth rides the parity track |
| Catalog merge changes brain behavior for aka-only users | Registry with a single legacy entry must be bit-identical to today — pinned by U4 tests |
| Spawned games outlive/escape korrid's knowledge | Accepted this slice (no session claims made anywhere for zao) |
| Parallel streams touch `lib.rs`/portal launchables (local play, session lifecycle) | Own worktree; additive arms/fields; second-to-land reconciles — same drill as the other slices |

---

## Documentation / Operational Notes

- work.md doubles as zao's provisioning + deploy ledger (method, versions, installed rev) — the future NixOS module is written from this record
- AGENTS.md gains one line when this lands: hosts speak the native wire; the legacy client exists only for aka until parity

---

## Sources & References

- Related code: `services/korrid/src/upstream.rs`, `services/korrid/src/lib.rs`, `clients/portal/src/launchables/LaunchablesRoot.tsx`
- Standing decisions: `AGENTS.md` (Rust services, scaffolding wire, brain-behind-localhost)
- Related in-flight work: `work/items/active/20260729-local-play-retroarch/plan.md` (shares `lib.rs` dispatch), `work/items/active/20260729-web-session-lifecycle/plan.md` (session model this slice stays out of)
- Live audit: zao via SSH, 2026-07-29 (recorded in work.md)
