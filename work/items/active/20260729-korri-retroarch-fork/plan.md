---
title: "feat: com.korri.retroarch — patch-series RetroArch fork"
type: feat
status: active
date: 2026-07-29
verify_command: "just ra-check"
---

# feat: com.korri.retroarch — patch-series RetroArch fork

## Summary

Turn the proven Nix build of upstream RetroArch v1.22.2 into Korri's emulation runtime: a pinned upstream plus an ordered patch series (legacy `patches/NNNN-*.patch` model) producing `com.korri.retroarch` — installable beside stock RA, no launcher icon, crash-safe defaults, bundled mGBA core, an outside control channel (status/quit), and savestates that actually fire. Ends with korrid's retroarch launcher pointing at the fork and the Wario Land 4 journey passing on device.

---

## Problem Frame

The transport spike proved stock RetroArch works as Korri's invisible emulation runtime, but every capability gap it found lands in the same place: stock RA can't report status, can't be quit gracefully from outside, therefore can never savestate under Korri's kiosk lockdown (SRAM's 10-second flush is the only persistence), ships zero cores (forcing a manual install safari through FUSE landmines), and shares a package id with the buildbot build. The spike handoff's conclusion: build the fork; stock RA proves the transport, the fork is where control lives. The user's chosen structure: PR-shaped numbered patches over a pinned upstream, exactly like legacy's `gamescope-korri` / `moonlight-embedded-korri` series.

---

## Requirements

- R1. The build produces `com.korri.retroarch`: installs alongside stock RA (no id/signature conflict), no launcher icon, reachable only via Korri intents
- R2. The fork is a pinned upstream + ordered patch series: each patch one concern, numbered, described, applying cleanly from a scripted fetch — no divergent fork branch to maintain
- R3. Crash-safe shipped defaults: boots correctly on the tablet even with no Korri config present (`gl` video driver, kiosk lockdown as defaults) — the generated config becomes preference, not survival
- R4. mGBA core ships inside the APK at a stable path korrid can reference — no core-install UI safari, no FUSE provisioning
- R5. Korri can ask "what's running?" and command a graceful quit from outside the process (localhost/broadcast channel — the spike found stock's network command interface compiled out)
- R6. Graceful quit and activity pause produce savestates; relaunch auto-loads — frame-exact resume becomes real
- R7. korrid's retroarch launcher targets the fork; the WL4 device journey passes; the stock-RA install and its device state stay untouched until we choose to remove them
- R8. GPL v3 compliance holds: the pin + patch series are published with the repo (they are the "source" of our distribution)

---

## Scope Boundaries

- No session-model integration: the fork *emits* lifecycle signals eventually, but wiring them into korrid's session contract belongs to a later slice (after web-session-lifecycle lands its contract) — the channel patch here only has to answer status/quit
- No cores beyond mGBA; no multi-system mapping (still WL4-only downstream)
- No overlay work (universal overlay service is its own slice; the fork ships no overlay of its own)
- No RA asset-pack bundling decision beyond what kiosk mode needs to boot clean (resolved during implementation; bundling more is follow-up)
- No CI pipeline / build caching for the fork (deferred until the build is exercised by more than one machine)
- No upstream version bump (stay on v1.22.2 = `69a4f0e`, the device-validated commit)

### Deferred to Follow-Up Work

- Session lifecycle broadcasts feeding korrid's unified session model: after the session-lifecycle slice defines the contract
- Automated provisioning of the fork APK from the shell (PackageInstaller consent flow): with the demolition/provisioning work
- Dropping the x86_64 ABI to halve native build time: fold into whichever patch touches build config first

---

## Context & Research

### Relevant Code and Patterns

- `runtimes/retroarch/` — proven foundation: `devshell.nix` (JDK 11, SDK 30, NDK 22, aapt2 override), `flake.nix`, `NOTES.md` (pin `v1.22.2` = `69a4f0e`, toolchain facts, caveats incl. the do-not-install-over-stock warning)
- `docs/research/retroarch-local-emulation-transport.md` (legacy branch) — fork scope source (§"The consolidated fork"), savestate matrix, command-interface absence evidence, landmine table
- Legacy patch series to mirror: `product/plugins/gamescope/packages/gamescope-korri/patches/` (5 patches + README) and `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/` (19 patches, lettered sub-series) — naming, granularity, README conventions
- `work/items/active/20260729-local-play-retroarch/plan.md` — the downstream consumer: korrid's launcher module produces the LaunchSpec whose component this fork changes
- RA build entry: `upstream/pkg/android/phoenix` (`assembleAarch64Release`), native build `phoenix-common/jni/Android.mk`

### Institutional Learnings

- Owning defaults is load-bearing: stock RA 1.22.2 segfaults at boot on this device (Vulkan-on-Mali) — R3 exists because of a real crash
- `QUITFOCUS` is forbidden (skips deinit, kills auto-savestate) — quit must go through the graceful path
- Don't provision device files via adb (FUSE ownership) — bundling cores in the APK is the durable fix
- Device gates validate the whole surface; the exit test must include stock-RA coexistence, not just the fork working

---

## Key Technical Decisions

- **Patch series over fork branch**: upstream stays pristine at a pin; Korri changes are `runtimes/retroarch/patches/NNNN-*.patch` applied by script. Upstream bumps = re-pin + reapply; failures localize to a numbered patch. Mirrors legacy exactly (user call)
- **Package identity first**: the id/icon patch lands before anything else so every subsequent device test installs cleanly beside stock RA (which guards the local-play device state, R7)
- **Control channel: prefer compiling in RA's existing command interface** (the code exists; the Android build excludes it) over inventing a new broadcast protocol — smallest diff, proven protocol. If the compile-in proves gnarly, fall back to a minimal Android-native channel; the decision point is documented in the patch's README entry either way
- **Savestate patches follow the spike's sketch**: graceful-quit reachability + synchronous savestate on `onPause()` (must complete before suspend; covers screen-off, app-switch, shutdown per the spike doc) — small, targeted C changes, not a lifecycle rewrite
- **mGBA core is its own build target**: built separately (libretro core build for Android arm64) and packaged into the APK; the fork patch only teaches RA's package where cores live. Keeps the core pipeline reusable for future systems
- **korrid owns the transition**: the launcher module's component/core-path constants flip to the fork in one commit, after the fork passes device checks — stock RA remains installed as fallback until explicitly retired

---

## Open Questions

### Resolved During Planning

- Fork structure? — Patch series over pinned upstream (user call, legacy model)
- Which upstream version? — v1.22.2 `69a4f0e`, the commit already validated on the tablet
- Install path for the fork APK during this slice? — Manual adb/consent install; automated provisioning deferred

### Deferred to Implementation

- Exact mGBA-for-Android build path (mGBA upstream cmake vs libretro-super recipes) — research at the unit, pick the one that pins cleanly in Nix
- Whether bundled cores ride `jniLibs` (auto-extracted, exec-safe) or assets + first-run copy — depends on how RA's core loader resolves paths; decide against the code
- How much of RA's asset pack kiosk mode needs (possibly none) — observe on device with a bare build
- Command-interface compile: which build flags/ifdefs the Android make excludes and whether UDP localhost or a bound service is the safer Android citizen — decide in-patch
- Savestate-on-pause synchronicity: verify the state write completes before the process can be suspended (spike doc flags this as the one sharp edge in the patch)

---

## Implementation Units

### U1. Build recipe: pinned fetch + patch pipeline

**Goal:** The spike scaffolding becomes a repeatable recipe: fetch pinned upstream, apply the (initially empty) series, build.

**Requirements:** R2, R8

**Dependencies:** None (foundation already on this branch)

**Files:**
- Create: `runtimes/retroarch/fetch-upstream.sh`
- Create: `runtimes/retroarch/patches/README.md`
- Modify: `justfile` (fetch/apply/build/check recipes for the fork)
- Modify: `runtimes/retroarch/NOTES.md`

**Approach:**
- Fetch script: shallow clone at the pin, verify commit hash, apply `patches/NNNN-*` in order, refuse on fuzz — the spike's manual clone dies
- Patches README follows the legacy convention: one line per patch (number, intent, upstream-facing rationale)
- `just ra-check`: fetch-if-missing, apply, build `assembleAarch64Release` — becomes the plan's verify command

**Patterns to follow:**
- Legacy `gamescope-korri/patches/README.md` structure; existing justfile recipe style

**Test scenarios:**
- Happy path: clean checkout → `just ra-check` → APK exists
- Error path: tampered pin (wrong hash) → script refuses
- Error path: patch that no longer applies → loud failure naming the patch
- Test expectation: no unit-test framework — the pipeline is its own test; scenarios above are scripted behaviors

**Verification:**
- `just ra-check` green from a fresh clone of the repo

---

### U2. Patch 0001: Korri package identity

**Goal:** The build produces `com.korri.retroarch`, no launcher icon, "Korri RetroArch" label — installable beside stock RA.

**Requirements:** R1, R7

**Dependencies:** U1

**Files:**
- Create: `runtimes/retroarch/patches/0001-korri-package-identity.patch`

**Approach:**
- Application id, app name, launcher-icon removal (intent-only activity stays exported for explicit component launches), and — since this patch owns build config — drop the x86_64 ABI
- Keep the diff minimal: gradle/manifest only, no source moves

**Test scenarios:**
- Integration (device): fork installs with stock RA present; no icon in the launcher; explicit-component intent still resolves
- Happy path: APK inspection shows the new id and single ABI

**Verification:**
- Both APKs coexist on the tablet; `am start -n com.korri.retroarch/...` reaches the activity

---

### U3. Patch 0002: crash-safe shipped defaults

**Goal:** A configless boot works on the tablet: `gl` driver, kiosk lockdown, no first-run surprises.

**Requirements:** R3

**Dependencies:** U1 (independent of U2 in content; series order fixed by number)

**Files:**
- Create: `runtimes/retroarch/patches/0002-korri-default-config.patch`

**Approach:**
- Bake the spike's proven config values as shipped defaults (RA's default-config layer, not a bundled cfg file), so korrid's generated config becomes an override rather than a survival requirement
- The korrid-generated config keeps working unchanged on top

**Test scenarios:**
- Integration (device): delete `korri-retro/retroarch.cfg`, launch fork directly → boots without segfault, no menu reachable
- Happy path: with korrid's config present, behavior identical to stock-RA transport spike

**Verification:**
- Configless boot verified on the tablet (the stock build demonstrably crashes in this scenario)

---

### U4. Bundled mGBA core

**Goal:** The APK carries `mgba_libretro_android.so`; no core install step exists anywhere.

**Requirements:** R4, R7

**Dependencies:** U1, U2

**Files:**
- Create: `runtimes/retroarch/cores/` (Nix build target for mGBA arm64)
- Create: `runtimes/retroarch/patches/0003-bundle-korri-cores.patch`
- Modify: `runtimes/retroarch/fetch-upstream.sh` or justfile (core build wired into `ra-check`)

**Approach:**
- Separate pinned Nix build for the mGBA libretro core (build path researched at implementation — see Open Questions); output packaged into the APK
- The patch teaches the RA package where bundled cores live (jniLibs vs assets decided against RA's loader code)
- korrid's `LIBRETRO` path constant will point at the fork's core location (flipped in U7)

**Execution note:** Riskiest unit — timebox the core-build research; if mGBA's Android build fights Nix, fall back to pinning the buildbot core artifact by hash as an interim, and record the debt in NOTES.md.

**Test scenarios:**
- Happy path: fresh fork install on a wiped test dir → WL4 launches with the bundled core, zero manual core steps
- Error path: core missing from spec'd path → RA's failure mode observed and noted (feeds korrid's error mapping)
- Happy path: core `.so` in the APK matches the built artifact (hash)

**Verification:**
- Device launch succeeds with stock RA's privately-installed core deleted from the equation (fork never touches it)

---

### U5. Patch 0004: outside control channel (status + graceful quit)

**Goal:** Korri can query what's running and command a clean quit — the two verbs stock RA cannot offer.

**Requirements:** R5, R6 (quit path is the savestate trigger)

**Dependencies:** U1, U2

**Files:**
- Create: `runtimes/retroarch/patches/0004-korri-control-channel.patch`

**Approach:**
- First choice: compile in RA's existing network command interface (localhost UDP, `GET_STATUS`/`QUIT`) — the code exists upstream; the Android build excludes it. Fall back to a minimal Android-native channel only if the compile-in is gnarly (decision recorded in patches README)
- Bind loopback only; no LAN exposure

**Test scenarios:**
- Happy path: during WL4 gameplay, status query answers with core/content identity
- Happy path: quit command → RA exits cleanly (deinit path runs)
- Edge case: query with nothing running → distinguishable idle answer
- Error path: channel unreachable (RA not running) → caller times out cleanly (documents korrid's client behavior later)

**Verification:**
- Both verbs proven from the tablet shell against a live session

---

### U6. Patch 0005: savestates that actually fire

**Goal:** Graceful quit and activity pause write savestates; relaunch resumes frame-exact.

**Requirements:** R6

**Dependencies:** U5 (graceful quit is the trigger path)

**Files:**
- Create: `runtimes/retroarch/patches/0005-savestate-on-quit-and-pause.patch`

**Approach:**
- With the quit path reachable (U5), upstream's `savestate_auto_save`/`auto_load` finally function — verify before writing new code
- Add synchronous savestate on activity pause per the spike sketch (covers screen-off, app switch, shutdown broadcast; only hard power loss escapes, bounded by SRAM cadence)
- Keep SRAM autosave untouched as the independent persistence floor

**Test scenarios:**
- Happy path: play → quit via channel → relaunch → resumes at the quit frame
- Happy path: play → HOME mid-game → process killed by hand → relaunch → resumes at the pause frame
- Edge case: pause savestate completes before suspend (no torn state file) — verified by killing immediately after pause
- Edge case: auto-load absent (fresh game) → cold boot, no error

**Verification:**
- The savestate matrix from the spike doc re-run on device: every ❌ that the fork promised now ✅

---

### U7. korrid flips to the fork + device exit gate

**Goal:** Local play runs on Korri's own runtime; the whole journey re-proven.

**Requirements:** R1, R3, R4, R5, R6, R7

**Dependencies:** U2–U6

**Files:**
- Modify: `services/korrid/src/launcher/retroarch.rs` (component + core path constants; test fixtures)
- Modify: `runtimes/retroarch/NOTES.md` (device state, transition record)

**Approach:**
- One commit flips the launcher's target component and core path to the fork; korrid unit tests updated
- Exit journey: portal → WL4 → fork gameplay (no RA pixels) → HOME → relaunch resumes frame-exact → quit via channel → savestate present → stock RA still installed and untouched
- Coordinate with the local-play branch if it hasn't merged: whichever lands second reconciles the launcher constants

**Test scenarios:**
- Happy path: korrid tests pass with fork component/paths in fixtures
- Integration (device): full exit journey above
- Edge case: stock RA uninstalled entirely → fork journey still passes (proves zero hidden dependence)

**Verification:**
- Exit journey green; `just korrid-check` green; NOTES.md records the tablet's post-transition state

---

## System-Wide Impact

- **Interaction graph:** korrid's retroarch launcher is the only Korri consumer; the fork itself touches nothing else in the monorepo — blast radius is the patch series + one Rust constants change
- **Error propagation:** fork launch failures surface through the existing LaunchSpec tagged-error path; the control channel adds a timeout failure mode korrid will consume in the session slice
- **State lifecycle risks:** savestate-on-pause writing torn files under kill (tested explicitly in U6); two RA installs coexisting during transition (separate ids/data dirs — no shared state)
- **API surface parity:** none — no treaty or portal changes in this slice
- **Unchanged invariants:** stock RA install + its core + `korri-retro/` tree untouched until U7's journey passes; local-play plan's korrid module shape unchanged (only constants flip)

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| mGBA Android core build fights Nix (unknown build system fit) | Timeboxed research; interim fallback = pin buildbot core artifact by hash, debt recorded (U4 execution note) |
| RA's command interface won't compile into the Android build cleanly | Fallback channel decision pre-authorized in U5; either way the patch README records why |
| Savestate-on-pause races process suspension | Explicit torn-file kill test in U6; synchronous write requirement carried from spike doc |
| Patch series drifts as upstream moves | Not this slice's problem (pin frozen at device-validated commit); the series structure is the long-term mitigation |
| Parallel local-play branch edits `launcher/retroarch.rs` | U7 flips constants only; second-to-land reconciles — both changes are small |

---

## Documentation / Operational Notes

- `runtimes/retroarch/patches/README.md` is the fork's public face: pin, patch intents, and the GPL v3 source-offer story (R8) live there
- NOTES.md keeps the running device-state ledger (which tablet has which RA installs/cores)

---

## Sources & References

- **Origin research:** `docs/research/retroarch-local-emulation-transport.md` (legacy branch), §"The consolidated fork" — scope list this plan implements
- Foundation: `runtimes/retroarch/NOTES.md` (build spike, pin, toolchain facts)
- Pattern: legacy `product/plugins/gamescope/packages/gamescope-korri/patches/`, `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/`
- Downstream consumer: `work/items/active/20260729-local-play-retroarch/plan.md`
