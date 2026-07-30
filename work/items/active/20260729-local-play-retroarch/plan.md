---
title: "feat: Local play v1 — one game via stock RetroArch"
type: feat
status: completed
date: 2026-07-29
verify_command: "just korrid-check"
---

# feat: Local play v1 — one game via stock RetroArch

## Summary

Put one local game (Wario Land 4, GBA, mGBA core) in the portal next to the streaming games and make it play on-device via stock RetroArch. korrid owns all RetroArch knowledge (the hardcoded entry, the generated config, the launch instruction); the Android shell only translates a launcher-neutral launch instruction into an Android intent. This is the first inhabitant of the "launchers live in the brain, platforms only execute" shape that Linux will share later.

---

## Problem Frame

Korri's launch model so far only streams from a host. The RetroArch transport spike (2026-07-28, see Sources) proved on-device emulation works end-to-end with zero RetroArch UI — but as a hardcoded hack in a sibling checkout: the shell WebView knew ROM filenames, the bridge method was RetroArch-specific, and nothing lived in korri proper. The user constraint for bringing it home: launcher support must be holistic across Linux and Android with differences at the edges, designed so a future plugin model can extract the launcher without rewriting the app or portal.

---

## Requirements

- R1. The portal shows Wario Land 4 as a local game alongside stream entries (no library scan — one hardcoded entry)
- R2. Confirming it launches straight into gameplay via stock RetroArch (`com.retroarch.aarch64`), kiosk-locked, no RetroArch UI reachable
- R3. korrid owns RetroArch knowledge: the game entry, the generated `retroarch.cfg` (crash-fix + lockdown + save paths from the spike), and the launch instruction. The shell contains no ROM/core/config knowledge — only a launcher-id → intent template
- R4. The launch instruction shape is launcher-neutral: adding a second launcher later must not change the bridge method or portal flow
- R5. Failures (RetroArch not installed, ROM file missing) surface as a portal notice; the portal stays usable
- R6. Returning from RetroArch lands back in the portal; streaming and all stock Artemis flows are unaffected
- R7. Saves land under the Korri-owned tree (`korri-retro/saves/`) — the spike's SRAM autosave floor keeps working under our generated config

---

## Scope Boundaries

- No library scanning — the folder scan (and its index storage) waits for proseQL-in-Rust to land in korrid
- No other systems or cores (mGBA/GBA only)
- No `com.korri.retroarch` fork (quit/status channel, bundled cores, savestate-on-pause) — next slice, spike doc §"consolidated fork"
- No session participation: local games make no "now playing" claims; joining the session model waits for the web-session-lifecycle contract + fork signals
- No overlay service (AccessibilityService universal overlay) — own future slice
- No plugin registry/install/acquisition machinery — the launcher module only keeps its boundary clean for that future
- No RetroArch APK/core/ROM provisioning automation — device is provisioned manually (spike already did this on the tablet)

---

## Context & Research

### Relevant Code and Patterns

- `docs/research/retroarch-local-emulation-transport.md` (legacy branch) — the authoritative spike handoff: proven intent contract (`RetroActivityFuture` + `ROM`/`LIBRETRO`/`CONFIGFILE` extras), the working generated config verbatim (incl. the `video_driver = "gl"` Mali crash fix), landmine table, savestate matrix, `QUITFOCUS` prohibition
- `services/korrid/src/upstream.rs` + dispatch arms in `services/korrid/src/lib.rs` — the pattern for korrid ops: serde/typeshare types, tagged outcomes, unit tests with fixtures
- `contracts/bridge/korri-native-bridge.ts` — treaty conventions: additive changes, JSON-string methods on `KorriNative`, tagged results
- `clients/portal/src/launchables/state.ts` — multi-source fold with failure-degrades-to-notice; `clients/portal/src/korrid/client.ts` — HTTP + in-memory korrid clients
- Legacy `product/plugins/retroarch/` (`discovery.ts`, `launch-spec.ts`, `ids.ts`) — the plugin boundary this slice's module shape must stay extractable toward
- Spike code in `~/code/sandbox/artemis` (branch `custom`): `KorriShellActivity.launchLocalRetro` + korri-shell local-play card — reference for the intent construction, superseded by this slice's shapes

### Institutional Learnings

- Device gates must exercise the whole installed app (WebView + RPC), never one channel
- Generated-config ownership is load-bearing: stock RetroArch defaults segfault on this device (Vulkan-on-Mali); Korri's config is not a nicety
- Don't provision device files via adb (FUSE ownership landmine) — the app writes through its own storage APIs, or files are placed by RetroArch itself

---

## Key Technical Decisions

- **Launcher module inside korrid, not a plugin system**: a `launcher` module boundary (first: retroarch) owning entry, config content, and launch-instruction production. Interface kept extraction-shaped for the future plugin model; zero registry machinery now
- **Separate korrid ops for local games, catalog untouched**: local entries come from a new op rather than being spliced into the aka-federated catalog types. The portal already folds multiple sources; this avoids destabilizing the stream contract while slice 5 is in flight
- **LaunchSpec is launcher-neutral at the bridge**: the treaty method takes an opaque-ish spec (launcher id + Android component + string extras) produced by korrid; Kotlin validates the launcher id and fires the intent. Kotlin never learns what a core is
- **korrid generates config content; the write path is an edge concern**: the Rust module produces the `retroarch.cfg` bytes; where/how they land on external storage is resolved at implementation (direct write from the app process vs. bridge-assisted), see Open Questions
- **Stock RetroArch accepted with its limits**: SRAM 10s autosave is the only persistence; no status/quit channel. Recorded so nobody debugs "savestates don't work" — they can't, by design, until the fork
- **Additive treaty change**: follow the existing additive convention on main; the parallel web-session-lifecycle branch also edits this file — whoever merges second reconciles (small, both additive)

---

## Open Questions

### Resolved During Planning

- Who owns RetroArch knowledge? — korrid (user constraint: holistic launchers, differences at the edges)
- Scan or hardcode? — Hardcode one game; scanning waits for proseQL storage
- Which RetroArch? — Stock buildbot `com.retroarch.aarch64` 1.22.2, already installed + provisioned on the tablet from the spike

### Deferred to Implementation

- External-storage write mechanics for `retroarch.cfg` (app targetSdk 34, scoped storage): try direct write from the korrid process to the app-accessible path; if blocked, the bridge writes korrid-generated content via Android storage APIs. The tablet already has a working config from the spike, so the exit test cannot silently depend on this — the unit must prove a fresh write
- Exact LaunchSpec field names and whether extras are typed or a string map — settle against real code
- Whether return-from-RetroArch needs the existing shell-resumed event or arrives free via normal activity resume

---

## Implementation Units

### U1. korrid: retroarch launcher module + local-games and launch ops

**Goal:** The brain serves one local game and produces everything needed to play it.

**Requirements:** R1, R2, R3, R4, R7

**Dependencies:** None

**Files:**
- Create: `services/korrid/src/launcher/mod.rs`
- Create: `services/korrid/src/launcher/retroarch.rs`
- Modify: `services/korrid/src/lib.rs`
- Modify: `contracts/generated/korrid.ts` (regenerated)
- Test: inline `#[cfg(test)]` in `services/korrid/src/launcher/retroarch.rs`

**Approach:**
- Hardcoded entry: Wario Land 4, GBA, mGBA core, ROM filename — all inside the retroarch module
- Config content generation reproduces the spike's proven `retroarch.cfg` verbatim (kiosk lockdown, `video_driver = "gl"`, Korri directory tree, SRAM autosave cadence, refused-to-lose features)
- New ops: list local games (entry with id/title/system) and launch a local game by id → validates ROM file exists, ensures config is provisioned, returns a LaunchSpec (launcher id, Android component, extras) as a tagged outcome
- Paths (ROM tree, config location) parameterized by a base directory so tests use temp dirs and Android passes its storage root

**Patterns to follow:**
- Op dispatch + tagged outcomes as in existing `lib.rs` arms; typeshare-annotated types; check script regenerates contracts

**Test scenarios:**
- Happy path: local-games op returns exactly the WL4 entry
- Happy path: launch op with ROM present → LaunchSpec carrying the RetroArch component and ROM/core/config paths rooted in the base dir
- Happy path: generated config content contains the load-bearing lines (gl driver, kiosk, save dirs, autosave interval) and omits `QUITFOCUS`-style quit-on-focus behavior
- Error path: launch op with ROM file absent → tagged failure (distinct code), no LaunchSpec
- Error path: unknown game id → tagged failure
- Edge case: config file is (re)written when missing; existing user-side file is overwritten deterministically (korri owns it)

**Verification:**
- `cargo test` green; regenerated contracts committed; `just korrid-check` green

---

### U2. Treaty + shell: launcher-neutral local launch over the bridge

**Goal:** The app can execute a LaunchSpec — and knows nothing else about emulation.

**Requirements:** R2, R3, R4, R5, R6

**Dependencies:** U1

**Files:**
- Modify: `contracts/bridge/korri-native-bridge.ts`
- Modify: `clients/android/app/src/main/java/com/limelight/KorriShellActivity.java`

**Approach:**
- Treaty: one additive `KorriNative` method — launch a local LaunchSpec (JSON in, tagged result out). Spec shape mirrors the korrid-generated type
- Kotlin/Java: allow-list the launcher id (`retroarch` only), build the explicit intent from the spec's component + extras, `startActivity`, return tagged Ok; `ActivityNotFoundException` and malformed specs return tagged errors
- If implementation lands on bridge-assisted config write (see Open Questions), the write happens here, with content passed from korrid — still zero RetroArch semantics in Java

**Patterns to follow:**
- Existing tagged-result bridge methods in `KorriShellActivity` (e.g. `startStream`) and their treaty documentation style

**Test scenarios:**
- Integration (device, verified in U4): valid spec → RetroArch gameplay; RetroArch uninstalled → tagged error surfaces in portal
- Error path (code-level): spec with unknown launcher id → tagged error, no intent fired
- Test expectation: no JVM unit tests beyond the above — the shell side is device-verified, consistent with existing bridge methods

**Verification:**
- APK builds; treaty and Java mirror agree; device smoke deferred to U4

---

### U3. Portal: local game entry and launch flow

**Goal:** WL4 appears in the list; confirm plays it; failures degrade to notices.

**Requirements:** R1, R2, R5, R6

**Dependencies:** U1, U2

**Files:**
- Modify: `clients/portal/src/korrid/client.ts`
- Modify: `clients/portal/src/launchables/state.ts`
- Modify: `clients/portal/src/launchables/LaunchablesRoot.tsx`
- Modify: `clients/portal/src/launchables/LaunchablesList.tsx`
- Test: `clients/portal/src/launchables/state.test.ts`

**Approach:**
- korrid client gains the two ops (HTTP + in-memory variants for browser dev)
- State: local games fold in as a third source with its own entry kind; source failure degrades to a notice like the others
- Confirm on a local game: call korrid launch op → pass the LaunchSpec to the bridge method → tagged failure at either step becomes a notice; success needs no further portal action (Android brings RetroArch forward)
- Return from RetroArch: rely on normal shell resume; existing refresh behavior re-renders the list

**Patterns to follow:**
- Source-fold + notice degradation in `clients/portal/src/launchables/state.ts`; prepare-then-stream confirm flow in `LaunchablesRoot.tsx`

**Test scenarios:**
- Happy path: local source with WL4 folds into the list alongside stream/game entries
- Happy path: confirm on WL4 → launch op called with its id → bridge invoked with the returned spec
- Error path: korrid launch op fails (ROM missing) → notice, selection preserved, no bridge call
- Error path: bridge returns tagged error (RA missing) → notice, portal usable
- Edge case: local source unavailable (op fails) → list renders stream entries with a notice, no crash
- Edge case: in-memory client (browser dev) serves the WL4 fixture so the flow is demoable off-device

**Verification:**
- `bun test` + typecheck green; browser dev shows and "launches" the entry against the in-memory client

---

### U4. Device exit test

**Goal:** The slice's promise proven on the tablet, plus no-regression on streaming.

**Requirements:** R1, R2, R5, R6, R7

**Dependencies:** U2, U3

**Files:**
- Modify: `services/korrid/android-smoke.sh` (extend where feasible: local-games op probe through the on-device brain)

**Approach:**
- Precondition check (manual, from spike device state): RetroArch installed with mGBA core, `korri-retro/roms/wl4.gba` present; document as the unit's setup notes
- Fresh-config proof: delete `korri-retro/retroarch.cfg`, run the flow, verify korrid's write recreated it (guards the scoped-storage open question against silent reliance on spike leftovers)
- Journey: portal → WL4 visible → confirm → gameplay with no RetroArch UI → play past one autosave interval → HOME/back to portal → `saves/mGBA/wl4.srm` mtime advanced → launch a stream game → still works
- Failure honesty: temporarily rename the ROM → confirm → portal notice; restore

**Test scenarios:**
- Covers R1, R2, R5, R6, R7 as the on-device acceptance pass above

**Verification:**
- Automated gates green; journey confirmed; failure injection shows a notice and recovery

---

## System-Wide Impact

- **Interaction graph:** portal confirm flow gains a third branch (local launch) beside app-launch and prepare-then-stream; korrid gains its first non-federated (device-local) ops
- **Error propagation:** korrid tagged failures and bridge tagged failures both terminate in the existing portal notice mechanism — no new error surface
- **State lifecycle risks:** config file ownership (korrid overwrites deterministically); none of this slice touches session or stream state
- **API surface parity:** treaty change is additive; the parallel `feat/web-session-lifecycle` branch edits the same treaty file — second merger reconciles
- **Unchanged invariants:** aka-federated catalog types, prepare-then-stream flow, stock Artemis activities, pairing — untouched

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Scoped storage (targetSdk 34) blocks korrid's direct config/ROM-check file access | Fallback path decided at implementation: bridge-assisted write with korrid-generated content; U4's fresh-config proof makes the outcome observable either way |
| Treaty merge conflict with the in-flight session-lifecycle branch | Both changes additive; own worktree off main; reconcile at second merge |
| Stock RA limits get mistaken for bugs (no savestates, no status) | Recorded in Key Technical Decisions; SRAM mtime check in U4 sets the honest persistence expectation |
| Device state drifts from spike provisioning (core moved, DeX mode) | U4 precondition checklist; spike doc's landmine table linked for symptoms |

---

## Sources & References

- **Origin research:** `docs/research/retroarch-local-emulation-transport.md` (legacy branch) — spike handoff, intent contract, config, landmines
- Spike code: `~/code/sandbox/artemis` branch `custom` (korri-shell local-play card, `launchLocalRetro`)
- Legacy plugin shape: `product/plugins/retroarch/` (legacy branch) — extraction target for the future plugin model
- Related in-flight work: `work/items/active/20260729-web-session-lifecycle/plan.md` (session model this slice deliberately stays out of)
