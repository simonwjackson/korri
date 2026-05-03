---
title: "feat: Build and launch Korri Electrobun on the Odin"
type: feat
status: active
date: 2026-05-03
origin:
  - docs/brainstorms/2026-05-02-personal-mvp-scope-requirements.md
  - docs/brainstorms/2026-04-30-electrobun-nix-native-build-requirements.md
---

# feat: Build and launch Korri Electrobun on the Odin

## Overview

Yes — Korri can target the Odin, but the work should be treated as a staged deployment path rather than a simple `desktop-build` invocation. The repo already has an aarch64-linux Electrobun/Nix package and an Odin API loop; this plan joins those two surfaces so a self-contained Electrobun app can be built for the AYN Odin 2 Portal, staged to ROCKNIX, launched into the live Sway session, and smoke-verified against the real ROCKNIX library and launcher.

The key constraint is that the Odin is not a normal Linux workstation. ROCKNIX has a read-only root filesystem, no general package manager, and EmulationStation is actively respawned by `essway.service`. The supported path is therefore:

1. build the aarch64 Electrobun package from the existing Nix derivation,
2. preflight that the Odin has the runtime substrate required to run a Nix-built GUI closure,
3. stage and launch through reversible `/storage`-owned tooling,
4. mask only the EmulationStation relaunch service for the current session, and
5. prove the same loopback HTTP/RPC contract works on device.

If the preflight shows the Odin cannot run a Nix store closure yet, the plan fails early with an actionable message and keeps the existing Chromium kiosk loop as the fallback. It should not flatten or vendor the Nix closure into arbitrary `/storage` paths as a first cut.

## Problem Frame

The personal MVP requires the full open-Korri → choose recent game → launch real game loop on the developer's Odin 2 Portal (see origin: `docs/brainstorms/2026-05-02-personal-mvp-scope-requirements.md`). The current Odin loop runs the API on the device and the renderer on the dev machine through Vite; this proves real `runemu.sh` launches but is not the final device experience.

Separately, the Electrobun/Nix work already proves a Linux desktop package for `x86_64-linux` and `aarch64-linux` while preserving the same-origin `/api/rpc` contract (see origin: `docs/brainstorms/2026-04-30-electrobun-nix-native-build-requirements.md`). What is missing is an Odin-specific packaging and launch seam: build the aarch64 package, deploy it to ROCKNIX, run it in the handheld's Wayland session, and verify it uses the real library and launcher without changing ROCKNIX-owned files.

## Requirements Trace

- R1. Build an `aarch64-linux` Korri Electrobun artifact using the existing desktop wrapper and Nix packaging. It must preserve the loopback HTTP composition and bundled portal assets from the desktop plans.
- R2. Launch Korri on the Odin screen under ROCKNIX/Sway, not just in a dev-machine browser or Chromium kiosk.
- R3. Keep runtime configuration on the device under `/storage` and source the existing Odin `.env` so `KORRI_ROCKNIX_GAMELIST_ROOTS`, Wayland, DBus, and display variables match the working API loop.
- R4. Do not patch `runemu.sh`, EmulationStation configs, `essway.service`, or the read-only ROCKNIX root filesystem. Any service interruption must be runtime-only and reversible.
- R5. Fail fast when the device lacks the required substrate for a Nix-built GUI closure: available `/nix/store` or equivalent Nix integration, Sway active, enough `/storage`, and a readable project/env location.
- R6. Keep all Electrobun/Odin build and launch recipes out of default `just check`, `just build`, and web/API dev paths.
- R7. Provide smoke verification that proves the running Electrobun app serves `/`, `/api/health`, and `app.library.list` from the device-local loopback server.
- R8. Preserve the personal MVP's library/launch behavior: real `gamelist.xml` data from `/storage/roms`, launch via `runemu.sh`, and no new off-rail browse UI.

## Scope Boundaries

- **In scope:** aarch64 Electrobun build target, Odin preflight, staging/deploy recipe, launch/stop/status recipes, runtime-mask of `essway.service`, and on-device smoke verification.
- **Out:** Android APK packaging, native Android WebView, AppImage/tarball public distribution, code signing, auto-updates, release hosting, or public installer UX.
- **Out:** rebuilding the ROCKNIX image, adding packages to the immutable rootfs, or changing ROCKNIX-owned services/configs permanently.
- **Out:** changing product UI, RPC contracts, spatial navigation architecture, `runemu.sh`, or the library/launcher seams introduced for the personal MVP.
- **Out:** making default CI run a real Odin device test. Device smoke remains an explicit local recipe.

### Deferred to Separate Tasks

- If the Odin does not yet expose a usable `/nix/store` / Nix profile, enabling that belongs to the ROCKNIX fork or a separate device-integration task, not this Korri app PR.
- Public packaging beyond the developer's Odin (cache publishing, installer, end-user onboarding) is deferred until the personal MVP proves the device runtime path.

## Context & Research

### Relevant Code and Patterns

- `electrobun.config.ts` — already points Electrobun at `korri/deploy/desktop/index.ts`, copies `out/build/portal`, and writes outputs under `out/build/electrobun` / `out/artifacts/electrobun`.
- `nix/korri-desktop.nix`, `nix/electrobun-binaries.nix`, `nix/versions.nix`, `flake.nix` — existing hermetic desktop package supports `aarch64-linux` and pins Electrobun CLI/core tarballs.
- `korri/deploy/desktop/main.ts` and `korri/deploy/desktop/create-desktop-app.ts` — package the same loopback HTTP composition that desktop smoke already exercises.
- `korri/deploy/desktop/window-options.ts` — current desktop window profile is workstation-shaped; Odin needs a handheld/kiosk profile without forking the product UI.
- `tools/desktop/desktop-smoke.ts` and `tools/desktop/electrobun-runtime-check.ts` — structured tooling patterns for explicit desktop checks outside default validation.
- `tools/scripts/odin-bootstrap.sh`, `tools/scripts/odin-dev.sh`, `tools/scripts/odin-run-api.sh`, `tools/scripts/odin-smoke.sh` — established Odin conventions: SSH target defaults, `/storage/korri`, sourced `.env`, and explicit `just` recipes.
- `.github/workflows/desktop-stage2.yml` — already builds `packages.aarch64-linux.korri-desktop`; extend it only for static/package assertions, not real device launch.
- `device-report.md` — confirms Odin is aarch64 ROCKNIX, read-only rootfs, writable `/storage`, Sway/Wayland through `essway`, SSH root access, and no general package manager.

### Institutional Learnings

- `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` — keep web and desktop on the same loopback HTTP origin so `/api/rpc` stays unchanged.
- `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md` — Linux Electrobun bundles must contain `Resources/app/bun/index.js`, `Resources/app/views/mainview/index.html`, `Resources/version.json`, and `Resources/build.json`; keep derivation assertions for these.
- `docs/development/odin-iterative-loop.md` — current Odin loop proves the API and `runemu.sh` behavior but explicitly defers renderer-on-device packaging.
- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md` — stop EmulationStation by runtime-masking `essway.service`, not by killing child processes or editing service files.
- `docs/solutions/integration-issues/reverse-ssh-tunnel-for-odin-chromium-vite-2026-05-03.md` — historical fallback for pre-Tailscale connectivity; the current Odin loop assumes Tailscale and avoids SSH port forwarding.
- `docs/solutions/integration-issues/effect-rpc-json-dates-need-decodable-schemas-2026-05-03.md` — smoke verification should exercise real RPC decode, because browser/device JSON date behavior has already regressed once.

### External References

- External web search was unavailable in this planning session. The existing Electrobun/Nix plan already captured upstream v1.16.0 evidence for Linux arm64 CLI/core artifacts and the flat-bundle contract.

## Key Technical Decisions

| Decision | Rationale | Tradeoff |
|---|---|---|
| Reuse the existing `aarch64-linux` Nix package as the build source | It already pins Electrobun Linux arm64 artifacts, backfills the flat bundle, and packages the same desktop loopback app. | Requires the Odin to run a Nix-store closure or equivalent; preflight must gate this honestly. |
| Add an Odin runtime profile instead of forking the desktop app | Product code, RPC, library source, and launcher stay identical; only launch environment/window behavior changes. | `korri/deploy/desktop/window-options.ts` and the Nix wrapper need small profile-aware seams. |
| Source `$ODIN_PROJECT/.env` at launch time | The API loop already depends on harvested Wayland/DBus env and `KORRI_ROCKNIX_GAMELIST_ROOTS=/storage/roms`; duplicating that logic risks drift. | The launch script becomes the owner of environment setup; the Electrobun binary itself remains generic. |
| Runtime-mask `essway.service` during Korri sessions | This is the proven reversible way to stop ES from reclaiming the screen while leaving Sway running. | Requires a stop/restore path and clear failure handling so the handheld is not left in a confusing state. |
| Bind desktop status to a device-local status file | Electrobun's server binds an ephemeral loopback port; smoke tooling needs a deterministic way to discover it on the device. | Adds a small status-file writer to the desktop runtime, guarded by an env var so normal desktop usage is unchanged. |
| Keep device launch explicit and outside default validation | Running a GUI on a physical handheld is stateful and environment-dependent. Default CI should only prove build/package invariants. | The final confidence signal remains a local `just odin-desktop-smoke` run on the developer's device. |
| Stop rather than flattening the Nix closure if `/nix/store` is unavailable | Nix-built binaries contain store paths and GTK/WebKit module lookups; ad-hoc relocation would create a fragile second packaging system. | If ROCKNIX Nix integration is absent, this plan delivers an actionable blocker rather than a runnable app. |

## Open Questions

### Resolved During Planning

- **Should this be an Android build?** No. The device is running ROCKNIX Linux on aarch64, and the existing Electrobun target is Linux/GTK/WebKitGTK, not Android.
- **Should the renderer keep using Chromium kiosk?** No for this plan; Chromium kiosk remains a fallback and debugging path. The planned deliverable is an Electrobun app on the device.
- **Should this patch ROCKNIX to install GTK/WebKit?** No. Use the Nix package closure if the device can host it; do not mutate the immutable rootfs.
- **Should desktop and Odin use separate RPC clients?** No. The loopback HTTP composition remains the contract, so `/api/rpc` is unchanged.

### Deferred to Implementation

- Whether the current Odin image exposes `/nix/store` in a way that can run a copied closure. The preflight records this as a hard gate before deployment.
- Whether Electrobun's GTK/WebKit wrapper runs cleanly under ROCKNIX Sway with `GDK_BACKEND=wayland` or needs fallback env such as X11/Xwayland, cairo rendering, or WebKit compositing flags. Implementation should adjust only wrapper/env defaults.
- Whether the aarch64 package should be built locally via QEMU, remotely on the Odin, or via an available ARM builder/cache. The script should support a build result path without baking in one machine topology.
- Exact status-file schema fields beyond URL, PID, profile, and timestamp. Keep it minimal and evolve only if smoke verification needs more.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
sequenceDiagram
    participant Dev as Dev machine
    participant Nix as Nix aarch64 build
    participant Odin as Odin /storage
    participant Sway as ROCKNIX Sway
    participant App as Korri Electrobun
    participant API as Loopback Hono/RPC
    participant Runemu as runemu.sh

    Dev->>Nix: build korri-desktop-odin for aarch64-linux
    Nix-->>Dev: package result with flat bundle + GTK/WebKit closure
    Dev->>Odin: preflight runtime substrate
    Odin-->>Dev: ok or actionable blocker
    Dev->>Odin: stage package reference + launch scripts/config
    Dev->>Odin: launch Korri session
    Odin->>Sway: runtime-mask essway; keep sway active
    Odin->>App: source /storage/korri/.env; start Electrobun
    App->>API: bind 127.0.0.1:0; write status file
    Dev->>Odin: smoke reads status URL
    Odin->>API: GET / and /api/health
    Odin->>API: POST /api/rpc app.library.list
    App->>Runemu: later, confirm on tile launches real game
```

## Implementation Units

- [ ] **Unit 1: Add Odin desktop capability preflight**

**Goal:** Provide an explicit, testable check that says whether the current Odin can run a Nix-built Electrobun GUI package before any build/deploy recipe proceeds.

**Requirements:** R3, R4, R5, R6.

**Dependencies:** None.

**Files:**
- Create: `tools/desktop/odin-desktop-preflight.ts`
- Test: `tools/desktop/odin-desktop-preflight.test.ts`
- Create: `tools/scripts/odin-desktop-preflight.sh`
- Modify: `justfile`

**Approach:**
- Mirror the current Odin script defaults: `ODIN_HOST`, `ODIN_PROJECT`, and SSH access patterns from `tools/scripts/odin-dev.sh`.
- Keep the classifier pure in `tools/desktop/odin-desktop-preflight.ts`; the shell script gathers remote facts and feeds them to the classifier.
- Check for: SSH reachability, `$ODIN_PROJECT/.env`, `/storage` free space, active `sway.service`, runtime-mask ability for `essway.service`, an available Nix store/profile path or equivalent Nix integration, and a readable `/storage/roms` source.
- Return structured statuses: `ready`, `blocked`, or `warning`. `blocked` must name the missing substrate and point to the fallback (`just dev-odin` / Chromium kiosk) rather than continuing.
- Add `just odin-desktop-preflight` as an explicit recipe; do not add it to `just check`.

**Execution note:** Implement the classifier test-first; the SSH-gathering shell wrapper should stay thin.

**Patterns to follow:**
- `tools/desktop/electrobun-runtime-check.ts` for report shape and actionable recommendations.
- `tools/scripts/odin-smoke.sh` for Odin SSH defaults, direct API targeting, and clear log prefixes.
- `device-report.md` for the exact ROCKNIX filesystem and service assumptions.

**Test scenarios:**
- Happy path: facts include SSH reachable, `.env` present, Sway active, `/storage` space above threshold, `/nix/store` usable, and `/storage/roms` readable -> report is `ready` with no blocking recommendations.
- Edge case: `essway.service` is active but maskable -> report is `ready` with a warning that launch will runtime-mask it.
- Error path: no usable Nix store/profile -> report is `blocked` and recommends the ROCKNIX/Nix integration task or existing Chromium fallback.
- Error path: Sway inactive -> report is `blocked` and recommends booting ROCKNIX to its normal frontend session.
- Error path: `$ODIN_PROJECT/.env` missing -> report is `blocked` and recommends `just bootstrap-odin`.
- Edge case: `/storage` free space below threshold -> report is `blocked` before deployment.

**Verification:**
- The recipe prints one unambiguous readiness line and exits non-zero only for hard blockers.
- The preflight never modifies the device.

- [ ] **Unit 2: Add an Odin runtime profile to the desktop package**

**Goal:** Let the existing Electrobun desktop runtime start in a handheld/kiosk-oriented profile without forking product UI or RPC behavior.

**Requirements:** R1, R2, R3, R6, R8.

**Dependencies:** Unit 1 for target assumptions.

**Files:**
- Modify: `korri/deploy/desktop/window-options.ts`
- Test: `korri/deploy/desktop/window-options.test.ts`
- Modify: `korri/deploy/desktop/main.ts`
- Create: `korri/deploy/desktop/status-file.ts`
- Test: `korri/deploy/desktop/status-file.test.ts`
- Modify: `nix/korri-desktop.nix`
- Modify: `flake.nix`

**Approach:**
- Add a minimal desktop runtime profile selected by environment, e.g. generic desktop vs. Odin. The profile should affect only window shape, wrapper defaults, and optional status-file writing.
- Keep `createDesktopApp` unchanged so API/static serving remains identical.
- Add optional status-file writing when `KORRI_DESKTOP_STATUS_FILE` is set. Include the loopback URL, process id, profile, and timestamp so device smoke can discover the app without scraping logs.
- Add a flake/package alias for the Odin profile, reusing the same source package and aarch64 Electrobun artifacts while setting Odin-safe wrapper env (`KORRI_DESKTOP_PROFILE`, Wayland-oriented GTK/WebKit defaults, and no product-specific RPC changes).
- Preserve the existing `korri-desktop` output for workstation use.

**Patterns to follow:**
- `korri/deploy/desktop/main.ts` for the single loopback server lifecycle.
- `nix/korri-desktop.nix` wrapper env style for GTK/WebKit variables.
- `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md` for required flat-bundle postconditions.

**Test scenarios:**
- Happy path: default profile -> existing desktop window options remain unchanged.
- Happy path: Odin profile -> window options use the handheld/kiosk values while still pointing at the loopback URL.
- Edge case: invalid bound port -> URL construction still rejects as today.
- Happy path: status file env set -> status writer emits JSON with URL, PID, profile, and ISO timestamp.
- Edge case: status file env absent -> no status file is written and desktop startup behavior is unchanged.
- Error path: status file path is unwritable -> desktop logs a clear failure or exits before pretending the app is smokeable.
- Integration: `korri-desktop` and `korri-desktop-odin` packages both include the four required Electrobun bundle files.

**Verification:**
- Existing desktop tests still pass, and a new Odin package alias can build for `aarch64-linux` without changing web/API build outputs.

- [ ] **Unit 3: Add an explicit Odin Electrobun build/stage surface**

**Goal:** Make building and staging the aarch64 Odin-targeted package discoverable and safe, while accepting a prebuilt result path when the developer uses a remote builder or cache.

**Requirements:** R1, R5, R6.

**Dependencies:** Units 1 and 2.

**Files:**
- Create: `tools/desktop/odin-desktop-artifact.ts`
- Test: `tools/desktop/odin-desktop-artifact.test.ts`
- Create: `tools/scripts/odin-desktop-build.sh`
- Modify: `justfile`
- Modify: `.github/workflows/desktop-stage2.yml`

**Approach:**
- Add `just odin-desktop-build` as an explicit recipe that targets the Odin profile package for `aarch64-linux` and records the resulting artifact/store path for later deploy.
- Keep build topology flexible: local QEMU, remote ARM builder, or an already-built result path should all feed the same artifact inspector.
- The artifact inspector should verify package architecture/profile and the flat-bundle required files before anything is staged to the device.
- Extend CI only to build/assert the aarch64 package and static bundle contents. Do not try to launch a GUI on CI.

**Patterns to follow:**
- `.github/workflows/desktop-stage2.yml` for existing aarch64 build coverage.
- `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md` for required package file assertions.
- `tools/artifacts/paths.ts` conventions if a local output marker under `out/` is useful.

**Test scenarios:**
- Happy path: artifact inspector sees an aarch64 Odin-profile package with launcher and required `Resources/*` files -> accepted.
- Error path: artifact is x86_64 -> rejected with a message naming the expected `aarch64-linux` target.
- Error path: missing `Resources/app/bun/index.js` -> rejected with the flat-bundle remediation context.
- Error path: missing launcher wrapper -> rejected before deployment.
- Edge case: caller supplies a prebuilt result path -> inspector accepts it without requiring a local rebuild.

**Verification:**
- Developers can build or point at an Odin package through one documented recipe, and bad artifacts are rejected locally before touching the device.

- [ ] **Unit 4: Add reversible Odin launch lifecycle scripts**

**Goal:** Stage and launch the Electrobun app on the Odin in a way that uses the harvested device environment, avoids EmulationStation contention, and can be stopped/restored cleanly.

**Requirements:** R2, R3, R4, R5, R8.

**Dependencies:** Units 1–3.

**Files:**
- Create: `tools/desktop/odin-desktop-launch.ts`
- Test: `tools/desktop/odin-desktop-launch.test.ts`
- Create: `tools/scripts/odin-desktop-run.sh`
- Create: `tools/scripts/odin-desktop-stop.sh`
- Create: `tools/scripts/odin-desktop-status.sh`
- Modify: `justfile`

**Approach:**
- Keep launch planning pure in `tools/desktop/odin-desktop-launch.ts`: given preflight results, artifact metadata, and desired session state, produce a launch plan with warnings/blockers.
- `odin-desktop-run.sh` should source `$ODIN_PROJECT/.env`, runtime-mask and stop `essway.service`, verify `sway.service` remains active, set `KORRI_DESKTOP_STATUS_FILE`, and start the Electrobun app detached with logs under `/storage`.
- `odin-desktop-stop.sh` should stop Korri's process, remove the runtime mask, and restart `essway.service` unless the user asks to leave ES stopped for debugging.
- `odin-desktop-status.sh` should report process, status-file URL, service state, and log path.
- Recipes should be explicit: `odin-desktop-run`, `odin-desktop-stop`, `odin-desktop-status`. None belong in default checks.

**Patterns to follow:**
- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md` for service handling.
- `tools/scripts/odin-dev.sh` for detached process and log handling style.
- `tools/scripts/odin-run-api.sh` for sourcing `.env` before launching Bun-managed children.

**Test scenarios:**
- Happy path: preflight ready + artifact accepted + Sway active -> launch plan masks `essway`, sources `.env`, sets status file, and starts Korri.
- Edge case: `essway.service` already inactive -> launch plan does not treat it as an error and still verifies Sway.
- Error path: Sway inactive after stopping `essway` -> launch plan aborts and recommends restoring ES.
- Error path: status file is not created within the startup window -> run script reports startup failure and points to `/storage` log path.
- Happy path: stop plan sees Korri running and runtime mask present -> stops Korri, unmasks `essway`, restarts ES.
- Edge case: stop plan sees Korri already stopped -> still restores `essway` idempotently.

**Verification:**
- Running and stopping Korri leaves the Odin in a known state, with no persistent service changes and no modifications outside `/storage` plus systemd runtime mask state.

- [ ] **Unit 5: Add on-device Electrobun smoke verification**

**Goal:** Prove that the running Electrobun app on the Odin serves the portal shell and real RPC data from its device-local loopback server.

**Requirements:** R2, R3, R7, R8.

**Dependencies:** Units 2 and 4.

**Files:**
- Create: `tools/desktop/odin-desktop-smoke.ts`
- Test: `tools/desktop/odin-desktop-smoke.test.ts`
- Create: `tools/scripts/odin-desktop-smoke.sh`
- Modify: `justfile`

**Approach:**
- Read the status file written by the running desktop app to discover the loopback URL.
- Execute HTTP checks from the Odin side of the connection so device-local networking is what gets verified.
- Reuse the RPC wire-format approach from `tools/scripts/odin-smoke-rpc.ts` where practical, but target the Electrobun loopback URL instead of the standalone API loop.
- Smoke checks should cover: `GET /`, `GET /api/health`, `POST /api/rpc` for `app.library.list`, and a minimal assertion that returned games are real device records rather than fixture-only placeholders.
- Keep launch of an actual game as manual verification after smoke. Spawning `runemu.sh` is destructive/stateful enough that it should not be automatic in the first smoke recipe.

**Patterns to follow:**
- `tools/scripts/odin-smoke.sh` and `tools/scripts/odin-smoke-rpc.ts` for RPC smoke shape.
- `tools/desktop/desktop-smoke.ts` for desktop HTTP composition expectations.
- `docs/solutions/integration-issues/effect-rpc-json-dates-need-decodable-schemas-2026-05-03.md` for real RPC decode coverage.

**Test scenarios:**
- Happy path: status file contains a loopback URL and all three HTTP/RPC checks pass -> smoke report is `ready`.
- Error path: status file missing -> smoke fails with a recommendation to run `just odin-desktop-status` and inspect the launch log.
- Error path: `/` does not return HTML -> smoke reports the portal bundle failure separately from API failures.
- Error path: `/api/health` fails -> smoke reports loopback server/API composition failure.
- Error path: `app.library.list` returns an empty list when `/storage/roms` is expected to have scraped games -> smoke warns that runtime config may not have loaded.
- Integration: smoke uses the running Electrobun process URL, not the standalone `ODIN_API_PORT` from `dev-odin`.

**Verification:**
- A single explicit recipe can demonstrate the app is alive on the device and using real RPC data before the developer manually confirms game launch.

- [ ] **Unit 6: Update operational docs and guardrails**

**Goal:** Make the new Odin Electrobun path discoverable without blurring it with the existing Level 2 API/Vite loop.

**Requirements:** R4, R5, R6, R7.

**Dependencies:** Units 1–5.

**Files:**
- Modify: `docs/development/odin-iterative-loop.md`
- Modify: `justfile`
- Modify: `.github/workflows/desktop-stage2.yml`

**Approach:**
- Add a small Level 3 section to the existing Odin development doc: preflight, build, run, status, smoke, stop, and fallback to Chromium kiosk.
- Document that the launch masks `essway.service` only at runtime and that `odin-desktop-stop` or reboot restores the normal ROCKNIX frontend.
- Keep just recipes explicit and grouped near existing Odin recipes.
- CI should assert the Odin-profile package builds for `aarch64-linux` and contains required bundle files; physical-device smoke stays local.

**Patterns to follow:**
- Existing `docs/development/odin-iterative-loop.md` tone and structure.
- Current `justfile` comments for discoverable `just --list` output.

**Test scenarios:**
- Test expectation: none for prose documentation itself; CI/build assertions belong to Units 3 and 5.

**Verification:**
- `just --list` clearly separates Level 2 (`dev-odin`, `check-odin`) from Level 3 Electrobun recipes.
- The doc tells the developer how to recover the normal EmulationStation session if launch fails.

## System-Wide Impact

- **Interaction graph:** New entry points are explicit Odin desktop recipes and scripts. Existing web dev, API dev, desktop workstation recipes, Storybook, Playwright, and BDD generation remain unchanged.
- **Runtime process model:** The standalone Odin API loop and the Electrobun Odin app are alternative runtime modes. The Electrobun app owns its own loopback Hono server and should not depend on `ODIN_API_PORT`.
- **Error propagation:** Preflight/build/deploy failures should stop before device state changes. Launch failures after masking `essway` must print restore instructions and leave `odin-desktop-stop` idempotent.
- **State lifecycle risks:** `essway.service` masking is runtime-only; status files and logs live under `/storage`; no writes to `/`, `/usr`, `/etc`, or ROCKNIX config should be introduced.
- **API surface parity:** `/`, `/api/health`, and `/api/rpc` must behave the same in Odin Electrobun, workstation Electrobun, and the dev API/portal composition.
- **Integration coverage:** Unit tests cover pure classification/planning helpers; CI covers aarch64 package shape; local Odin smoke covers the physical GUI/runtime surface.
- **Unchanged invariants:** Shift UI components, feature gates, game library schemas, launch RPC contracts, `runemu.sh` invocation semantics, and spatial navigation architecture are unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| The Odin cannot run Nix-store paths yet. | Unit 1 preflight blocks with an explicit message; do not attempt fragile relocation. Continue using Chromium kiosk until ROCKNIX/Nix integration is ready. |
| Electrobun GTK/WebKit does not render under ROCKNIX Sway. | Odin profile isolates GTK/WebKit env defaults; smoke checks fail before game launch; Chromium kiosk remains fallback. |
| EmulationStation respawns and covers Korri. | Use the proven runtime-mask of `essway.service`; verify Sway remains active; provide idempotent stop/restore. |
| The package builds but is not actually arm64. | Artifact inspector rejects non-aarch64 outputs before staging. |
| The app starts but smoke accidentally targets the standalone API loop. | Status-file URL from the Electrobun process is the only smoke target. |
| Runtime config drift means the app reads fixtures or wrong ROM roots. | Launch sources `$ODIN_PROJECT/.env`; smoke asserts real device library data from `app.library.list`. |
| Physical-device recipes accidentally enter default validation. | Keep recipes explicit; CI only builds/asserts artifacts, no device launch. |

## Documentation / Operational Notes

- Update `docs/development/odin-iterative-loop.md` rather than creating a new doc. The new section should describe this as Level 3: renderer and API both on the Odin under Electrobun.
- Recovery should be prominent: run `just odin-desktop-stop` or reboot to clear the runtime mask and restore EmulationStation.
- The first successful manual verification should capture: preflight ready, package build artifact, launch status URL, smoke output, and one manual confirm-to-`runemu.sh` launch.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-02-personal-mvp-scope-requirements.md](docs/brainstorms/2026-05-02-personal-mvp-scope-requirements.md)
- **Origin document:** [docs/brainstorms/2026-04-30-electrobun-nix-native-build-requirements.md](docs/brainstorms/2026-04-30-electrobun-nix-native-build-requirements.md)
- Related plan: [docs/plans/2026-04-30-004-feat-electrobun-desktop-wrapper-plan.md](docs/plans/2026-04-30-004-feat-electrobun-desktop-wrapper-plan.md)
- Related plan: [docs/plans/2026-04-30-006-feat-electrobun-nix-native-build-plan.md](docs/plans/2026-04-30-006-feat-electrobun-nix-native-build-plan.md)
- Related plan: [docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md](docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md)
- Device context: [device-report.md](device-report.md)
- Development loop: [docs/development/odin-iterative-loop.md](docs/development/odin-iterative-loop.md)
- Institutional learning: [docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md](docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md)
- Institutional learning: [docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md](docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md)
- Institutional learning: [docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md](docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md)
- Institutional learning: [docs/solutions/integration-issues/reverse-ssh-tunnel-for-odin-chromium-vite-2026-05-03.md](docs/solutions/integration-issues/reverse-ssh-tunnel-for-odin-chromium-vite-2026-05-03.md)
