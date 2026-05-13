---
title: Refactor Device Runtime Naming and Guest Integration
type: refactor
status: active
date: 2026-05-13
---

# Refactor Device Runtime Naming and Guest Integration

## Summary

Hard-cut Korri's device-runtime surfaces from Odin-specific naming to DEVICE naming, then coordinate the adjacent NixOS guest config to consume the new Korri package and binary. The implementation keeps Korri responsible for its package/module/frontend runtime contract, keeps the NixOS guest responsible for session/device policy, and moves Korri's mutable device state toward the explicit `/storage/.guest/korri` seam.

---

## Problem Frame

Korri currently uses “Odin” as a deployment/runtime abstraction even though the same code now targets multiple physical devices and the product-facing runtime is moving into a NixOS guest. That makes package names, environment variables, scripts, docs, and guest configuration misleading, while old `/storage/korri` rsync-based deployment assumptions conflict with the newer guest-owned direction.

---

## Requirements

- R1. Replace Korri's live Odin-specific runtime abstraction with DEVICE terminology; physical device names such as Thor, Odin, Bandai, and Sobo remain only per-device identifiers.
- R2. Do a hard cut with no compatibility aliases, fallback environment variables, or duplicate old package/app outputs.
- R3. Keep Korri's runtime abstraction DEVICE, not ROCKNIX; ROCKNIX-specific sources remain explicit tooling/import concepts only.
- R4. Preserve the existing Electrobun packaging/runtime postconditions while renaming the package, binary, wrapper profile, tests, and Nix flake outputs.
- R5. Align default device runtime state with the guest seam under `/storage/.guest/korri`, not the old synced project checkout `/storage/korri`.
- R6. Coordinate `../rocknix-nix-guest` so its NixOS configs, Sway launch binding, static checks, and docs consume the new Korri DEVICE package.
- R7. Retain validation coverage that proves the guest launches the new DEVICE binary, not stale Odin artifacts.

---

## Scope Boundaries

- No compatibility aliases such as `korri-desktop-odin = korri-desktop-device`.
- No fallback reading of old `ODIN_*` environment variables after the cut.
- No use of ROCKNIX as the Korri-side runtime profile name.
- No broad `/storage` bind design or revival of host-owned product configuration.
- No emulator packaging redesign beyond preserving the future path for Korri launch profiles.
- No full redesign of the guest promotion pipeline; this plan only defines how Korri fits into the existing guest-owned deployment model.

### Deferred to Follow-Up Work

- Physical-device smoke on every supported device: land Thor/Bandai first, then repeat for the Odin 2 Portal/Sobo profile once the shared DEVICE contract builds.
- Full removal or archival of historical docs that mention Odin: this plan updates active docs/contracts/checks; old solution docs may retain historical terminology when clearly retrospective.
- A richer Korri device service module, if later needed for supervised sessiond/inputd ownership beyond the package/module contract described here.

---

## Context & Research

### Target Repositories

- **Korri repo:** current repository. File paths in Korri implementation units are relative to this repo root.
- **Guest repo:** `../rocknix-nix-guest`. File paths explicitly labeled “Guest repo” are relative to that repo root.

### Relevant Code and Patterns

- `flake.nix` currently exposes `korri-desktop-odin` package/app outputs, `korriPortalOdin`, and Odin-named runtime library variables.
- `nix/korri-desktop.nix` emits both `korri-desktop` and `korri-desktop-odin`; the Odin wrapper sets `KORRI_DESKTOP_PROFILE=odin`.
- `korri/deploy/desktop/window-options.ts` models `DesktopProfile = "default" | "odin"` and applies the handheld window shape only to `odin`.
- `korri/shared/library/library-source-layer-live.ts` defaults `KORRI_DESKTOP_PROFILE=odin` to live ROCKNIX gamelists and defaults ProseQL library storage to `/storage/korri/library`.
- `tools/odin/sessiond-electrobun.ts` and related tests default to `korri-desktop-odin`, `/storage/.local/share/nix-apps/korri-electrobun`, and `KORRI_DESKTOP_PROFILE=odin`.
- `scripts/odin/*`, `tools/odin/*`, and `justfile` expose the old rsync/project-root deployment loop through `ODIN_*` variables and `*-odin` recipes.
- Guest repo `flake.nix` imports `korri.nixosModules.korri-frontend`, enables `services.korri`, and selects `korri.packages.${targetSystem}.korri-desktop-odin`.
- Guest repo `profiles/main-space.nix` launches Korri from Sway with `bindsym k exec korri-desktop-odin` and already uses `/storage/.guest/games-launcher.sh` for guest-owned helper launchers.
- Guest repo `scripts/static-checks.sh`, `README.md`, and `docs/contracts/layer14-main-space-contract.md` assert the current Odin package contract.

### Institutional Learnings

- `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md`: device deploy must be convergence between package, service, display/session env, and running state; the new shape should make that convergence declarative in the guest rather than preserving mutable rsync deployment.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`: if supervised renderer/session behavior remains in scope, it should fail closed and be owned by the runtime configuration rather than silently falling back.
- `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md`: keep the Nix-managed Electrobun runtime and do not revive portable/proot or fallback rendering flags.
- `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md`: preserve derivation checks for required Electrobun bundle files while renaming outputs.
- `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md`: Korri runtime data should be canonical Korri-owned ProseQL data; external gamelists belong to import/snapshot tooling.

### External References

- Not used. Existing repo patterns and the adjacent guest repo provide the relevant contracts for this refactor.

---

## Key Technical Decisions

- **Use DEVICE as the Korri runtime abstraction:** `korri-desktop-device`, `KORRI_DESKTOP_PROFILE=device`, and DEVICE-named tests/scripts replace Odin-specific runtime terminology. Physical devices remain represented by host configs such as Thor/Bandai and Odin 2 Portal/Sobo in the guest repo.
- **Hard cut, no aliases:** old package/app outputs, wrapper binaries, and environment fallback names are removed rather than kept as aliases. This forces stale call sites to fail during evaluation or tests instead of silently preserving confusing behavior.
- **Separate app runtime from guest session policy:** Korri owns package outputs, wrapper environment, module API, frontend/native bridge configuration, and library defaults. The guest repo owns Sway, display/input/audio/session environment, and per-device hardware profiles.
- **Default DEVICE library runtime to ProseQL:** explicit ROCKNIX/live-gamelist source mode may remain as tooling/import behavior, but the DEVICE profile must not implicitly select it.
- **Use `/storage/.guest/korri` for mutable device state defaults:** this gives Korri a narrow subdirectory under the one deliberate host/guest seam without reviving `/storage/korri` as a synced checkout or product state root.
- **Coordinate as a two-repo cut:** Korri and the guest repo must be validated together with a local Korri flake override before either repo advances references that would break the other.

---

## Open Questions

### Resolved During Planning

- **Should the new abstraction be DEVICE or HANDHELD?** DEVICE.
- **Should old Odin names remain as fallbacks?** No; this is a hard cut.
- **Should Korri use ROCKNIX as the replacement abstraction?** No; ROCKNIX is host/substrate context, not Korri's runtime profile.
- **What should replace `PROJECT`?** The old project-root concept is not central to the NixOS guest path. Where a remote target variable remains temporarily useful, use device targeting names; persistent runtime state should be expressed as a state root under `/storage/.guest/korri`.

### Deferred to Implementation

- **Exact migration mechanics for existing `/storage/korri` state:** implementation should decide whether to provide a one-shot migration helper or a documented manual copy based on the current device data shape, but must not keep `/storage/korri` as a default.
- **Whether sessiond/inputd survive as DEVICE-named guest services:** the hard-cut rename should update names and defaults where these tools remain, but a deeper product decision about direct Sway launch vs supervised services can follow after the package/profile cut is stable.
- **Final list of historical docs to archive vs edit:** active contracts and current dev docs should be updated; retrospective solution docs may keep old terms when they describe past Odin-specific work.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  K[Korri flake] -->|exports| P[korri-desktop-device]
  K -->|exports| M[services.korri module]
  P -->|wrapper env| E[KORRI_DESKTOP_PROFILE=device]
  E -->|defaults| S[/storage/.guest/korri state]
  G[Guest flake] -->|selects package| P
  G -->|Sway PATH + binding| B[Home then k: korri-desktop-device]
  B --> A[Korri Electrobun app]
  A -->|library runtime| L[Korri ProseQL library]
```

The important shape is that the guest consumes Korri through the Korri-owned flake/module API, while Korri no longer depends on an Odin-named wrapper or old `/storage/korri` project checkout for runtime behavior.

---

## Implementation Units

### U1. Rename Korri package, app, binary, and desktop profile surfaces

**Goal:** Replace the Korri package/app/profile contract from Odin-specific names to DEVICE names without adding aliases.

**Requirements:** R1, R2, R4

**Dependencies:** None

**Files:**
- Modify: `flake.nix`
- Modify: `nix/korri-desktop.nix`
- Modify: `korri/deploy/desktop/window-options.ts`
- Test: `korri/deploy/desktop/window-options.test.ts`

**Approach:**
- Rename internal Nix variables from Odin-specific package/runtime names to DEVICE-specific names.
- Expose only `packages.${system}.korri-desktop-device` and `apps.${system}.korri-desktop-device` for the device variant.
- Emit `bin/korri-desktop-device` from the Electrobun derivation and set `KORRI_DESKTOP_PROFILE=device` in that wrapper.
- Change the DEVICE wrapper so stale ambient `KORRI_DESKTOP_PROFILE=odin` cannot override the wrapper's profile.
- Keep the existing generic `korri-desktop` package/app unchanged for non-device desktop usage.
- Preserve the existing device-specific runtime libraries and native bridge portal behavior while renaming the owning symbols.

**Execution note:** Start with failing tests/flake checks that reference the new DEVICE package/profile and prove the old package/profile is gone.

**Patterns to follow:**
- Current `korriDesktopOdin` package construction in `flake.nix`.
- Existing wrapper-writing pattern in `nix/korri-desktop.nix`.
- Existing profile parsing tests in `korri/deploy/desktop/window-options.test.ts`.

**Test scenarios:**
- Happy path: `desktopProfileFromEnv("device")` returns the device profile and `createDesktopWindowOptions(..., "device")` returns the existing hidden-titlebar device-sized window shape.
- Edge case: `desktopProfileFromEnv("odin")` returns `default`, proving old profile values do not remain valid.
- Integration: Nix package/app evaluation exposes `korri-desktop-device` and does not expose `korri-desktop-odin`.
- Integration: generated wrapper inspection shows `KORRI_DESKTOP_PROFILE=device` and binary name `korri-desktop-device`.
- Error path: launching the DEVICE wrapper with an ambient `KORRI_DESKTOP_PROFILE=odin` still results in the DEVICE profile, not the stale old profile.

**Verification:**
- Korri's desktop window profile tests pass with DEVICE terminology.
- The device Electrobun package still contains the required app bundle resources and launches through the renamed wrapper.
- Static search of live Nix/package surfaces finds no `korri-desktop-odin` output or `KORRI_DESKTOP_PROFILE=odin` default.

---

### U2. Move DEVICE runtime defaults to Korri-owned guest state

**Goal:** Make the DEVICE runtime default to Korri-owned ProseQL data under `/storage/.guest/korri` and remove the implicit Odin-to-live-gamelist source selection.

**Requirements:** R3, R5

**Dependencies:** U1

**Files:**
- Modify: `korri/shared/library/library-source-layer-live.ts`
- Modify: `korri/shared/library/library-source-layer-live.test.ts`
- Modify: `tools/importers/rocknix/rocknix-importer.ts`
- Modify: `korri/shared/library/rocknix/rocknix-source.ts`
- Test: `korri/shared/library/library-source-layer-live.test.ts`
- Test: `tools/importers/rocknix/rocknix-importer.test.ts`

**Approach:**
- Change the default ProseQL library root for DEVICE contexts to `/storage/.guest/korri/library` while keeping explicit `KORRI_LIBRARY_ROOT` override behavior.
- Remove profile-driven defaulting from DEVICE to live ROCKNIX gamelists; live gamelists should be selected only by explicit source configuration or importer tooling.
- Move importer/media defaults that are Korri-owned runtime state toward `/storage/.guest/korri/media/games` where they are not explicitly external snapshot inputs.
- Update live source media defaults as well as importer defaults so no active runtime path keeps `/storage/korri/media/games` by default.
- Keep the existing ROCKNIX importer/source code as a named integration boundary, not as the default DEVICE runtime path.

**Execution note:** Characterize the current source-selection behavior first, then flip the DEVICE expectation.

**Patterns to follow:**
- Existing `KORRI_LIBRARY_SOURCE` explicit selection in `korri/shared/library/library-source-layer-live.ts`.
- ProseQL canonical storage guidance in `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md`.

**Test scenarios:**
- Happy path: with `KORRI_DESKTOP_PROFILE=device` and no explicit `KORRI_LIBRARY_SOURCE`, `LibrarySourceLayerLive` opens ProseQL storage, not live gamelists.
- Edge case: explicit `KORRI_LIBRARY_SOURCE=rocknix` still selects the live/source adapter for tooling scenarios.
- Edge case: explicit `KORRI_LIBRARY_ROOT` overrides the DEVICE default library root.
- Edge case: the generic `korri-desktop` profile keeps the non-device default behavior intentionally, rather than accidentally adopting guest-only state paths.
- Error path: invalid ProseQL data under the DEVICE default root propagates as the existing `LibraryError` data/read failure rather than falling back to gamelists.
- Integration: importer sidecar media defaults point at the new Korri-owned guest seam unless the caller supplies an explicit media root.

**Verification:**
- Library source tests demonstrate DEVICE defaults to ProseQL.
- No DEVICE runtime path silently reads `/storage/roms` or `/storage/korri/library` without an explicit override.

---

### U3. Hard-cut Korri device tooling names and remove mutable Odin deployment assumptions

**Goal:** Rename or retire Korri's active Odin-named scripts, tools, just recipes, tests, and environment variables so developers interact with DEVICE-named validation surfaces only.

**Requirements:** R1, R2, R5, R7

**Dependencies:** U1, U2

**Files:**
- Modify: `justfile`
- Modify: `.fallowrc.json`
- Modify: `scripts/odin/*`
- Modify: `tools/odin/*`
- Modify: `scripts/odin/bin/*`
- Test: `tools/odin/*.test.ts`
- Test: relevant renamed `tools/device/*.test.ts` after file moves

**Approach:**
- Rename active `tools/odin` and `scripts/odin` surfaces to DEVICE terminology where they still represent Korri-owned smoke/session/runtime helpers.
- Remove or quarantine recipes that mutate a synced `/storage/korri` checkout as the primary deployment path; the NixOS guest repo should own rootfs/config deployment.
- Replace `ODIN_*` host-targeting variables with `DEVICE_*` names only where a Korri-side hardware smoke still needs a remote target.
- Replace defaults such as `korri-desktop-odin`, `/storage/korri/sessiond.token`, and `/storage/.local/share/nix-apps/korri-electrobun` with DEVICE binary/state defaults under `/storage/.guest/korri`.
- Ensure direct Sway launch of `korri-desktop-device` and supervised/sessiond launch paths use the same Korri state-root contract; do not rely only on sessiond-only `buildElectrobunCommand` state settings.
- Preserve fail-closed checks that require Nix-managed Electrobun binaries and forbid production fallback rendering flags.

**Patterns to follow:**
- Current `tools/odin/sessiond-electrobun.ts` Nix-managed binary enforcement.
- Current `tools/odin/sessiond-electrobun.test.ts` and `tools/odin/sessiond-service-config.test.ts` env construction tests.
- Current `scripts/odin/smoke-sessiond.sh` style for hardware validation, adapted away from mutable install.

**Test scenarios:**
- Happy path: `buildElectrobunCommand` defaults to `korri-desktop-device`, `KORRI_DESKTOP_PROFILE=device`, and `/storage/.guest/korri/electrobun`-scoped XDG/cache paths.
- Edge case: sanitized Electrobun `PATH` includes guest/Nix-managed binary locations needed by the current guest, without requiring `/storage/.nix-profile` as the only app source.
- Error path: controller still rejects a non-Nix app binary after renaming.
- Error path: controller still rejects forbidden GPU/WebKit fallback flags after renaming.
- Integration: service config generation uses DEVICE env names and state roots, with no `ODIN_PROJECT` or `korri-desktop-odin` defaults.
- Integration: direct `korri-desktop-device` wrapper launch uses `/storage/.guest/korri` state defaults even when sessiond is not involved.
- Integration: active just recipes no longer expose `install-odin`, `deploy-odin`, `dev-odin`, or `check-odin` as current commands.

**Verification:**
- Renamed tool tests pass under DEVICE names.
- Active scripts and just recipes do not contain `ODIN_*` variables or `*-odin` command names.
- Remaining hardware validation targets the guest-owned runtime and does not install an app into `/storage/.nix-profile` or sync a project checkout to `/storage/korri`.

---

### U4. Extend Korri's NixOS module contract for device consumers

**Goal:** Make Korri's exported NixOS module express the DEVICE runtime contract clearly enough for the guest repo to consume without re-implementing Korri packaging or runtime defaults.

**Requirements:** R3, R4, R5, R6

**Dependencies:** U1, U2

**Files:**
- Modify: `nix/modules/korri-frontend.nix`
- Modify: `flake.nix`
- Test: Nix module evaluation checks added in the repo's Nix checks or an existing Nix validation surface

**Approach:**
- Keep the generic frontend module safe for non-device desktop users, but document and expose the DEVICE package/module contract explicitly.
- Add module options only where they express Korri-owned concerns, such as selected package and optional state/library root environment for the app wrapper or system environment.
- Avoid moving guest-owned Sway, display, input, audio, and per-device policy into Korri.
- Update module descriptions so downstream consumers select `korri-desktop-device`, not an Odin package variant.

**Patterns to follow:**
- Existing minimal `services.korri` module shape in `nix/modules/korri-frontend.nix`.
- Guest repo contract that the guest imports `korri.nixosModules.korri-frontend` and passes `services.korri.package`.

**Test scenarios:**
- Happy path: evaluating the module with `services.korri.enable = true` and `package = korri-desktop-device` installs that package.
- Edge case: generic consumers that do not select the device package still get the generic `korri-desktop` default.
- Integration: module docs/options mention DEVICE package selection and do not mention Odin package examples.

**Verification:**
- Nix module evaluation succeeds for a DEVICE package consumer.
- The module does not duplicate guest-owned Sway/input/audio policy.

---

### U5. Coordinate the adjacent guest repo to consume the DEVICE package

**Goal:** Update `../rocknix-nix-guest` to select and launch Korri's new DEVICE package from its NixOS guest configs.

**Requirements:** R1, R2, R6, R7

**Dependencies:** U1, U4

**Files:**
- Guest repo modify: `flake.nix`
- Guest repo modify: `flake.lock`
- Guest repo modify: `profiles/main-space.nix`
- Guest repo modify: `scripts/static-checks.sh`
- Guest repo modify: `README.md`
- Guest repo modify: `docs/contracts/layer14-main-space-contract.md`

**Approach:**
- Replace `korri.packages.${targetSystem}.korri-desktop-odin` with `korri.packages.${targetSystem}.korri-desktop-device`.
- Update the guest flake lock/input only after the Korri DEVICE package exists; validate first with a local Korri input override.
- Replace the Sway Home then `k` binding command with `korri-desktop-device`.
- Keep `systemd.services.rocknix-sway-kiosk.path = [ config.services.korri.package ];` so the binding resolves through the configured package.
- Update static checks to require the DEVICE package and binding, and to fail on old Korri Odin package references in active guest runtime/config surfaces.
- Update active README/contract text to state that Korri owns the DEVICE package/module/frontend config and the guest owns session/device policy.

**Patterns to follow:**
- Existing guest repo main-space Korri consumption block in `flake.nix`.
- Existing guest repo `profiles/main-space.nix` Sway Home chord mode.
- Existing grep-based static checks in `scripts/static-checks.sh`.

**Test scenarios:**
- Happy path: guest static checks pass with `korri-desktop-device` selected and launched.
- Error path: guest static checks fail if `korri-desktop-odin` appears in active flake/profile/runtime contract files.
- Integration: guest Nix evaluation succeeds with a local Korri override that exposes the DEVICE package.
- Integration: guest flake lock update points at a Korri revision exposing the DEVICE package and no longer requiring the removed Odin output.
- Integration: the Sway binding command matches the binary emitted by Korri's DEVICE package.

**Verification:**
- Guest repo static checks pass.
- Guest main-space/rootfs evaluation succeeds with the local Korri checkout override.
- Active guest docs describe DEVICE package consumption and do not claim an Odin package variant.

---

### U6. Add negative contract checks and active documentation updates

**Goal:** Make the hard cut enforceable by tests/static checks and update current operator/developer guidance to the new DEVICE/guest-owned model.

**Requirements:** R1, R2, R5, R7

**Dependencies:** U1, U2, U3, U5

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/odin-iterative-loop.md` or replace with a DEVICE/guest deployment doc
- Modify: active `docs/solutions/integration-issues/*` only when they are current guidance rather than historical records
- Modify: `justfile`
- Modify: `.fallowrc.json`
- Guest repo modify: `scripts/static-checks.sh`
- Guest repo modify: `README.md`
- Guest repo modify: `docs/contracts/layer14-main-space-contract.md`

**Approach:**
- Define the static-search boundary: active runtime/config/script/test/README/contract surfaces must be free of Odin-as-abstraction terms; archived historical docs may retain them only when clearly describing past work.
- Update project instructions and active developer commands away from `install-odin`, `deploy-odin`, `dev-odin`, and `check-odin`.
- Replace old rsync-based development guidance with guest-flake validation guidance that uses local Korri overrides from the guest repo.
- Add negative checks that catch stale active references to `ODIN_*`, `korri-desktop-odin`, and `KORRI_DESKTOP_PROFILE=odin`.

**Patterns to follow:**
- Existing project Justfile command documentation.
- Guest repo `scripts/static-checks.sh` contract assertions.
- Existing active development docs structure in `docs/odin-iterative-loop.md`, rewritten or superseded rather than incrementally patched if that is clearer.

**Test scenarios:**
- Happy path: active docs and command listings use DEVICE naming and point to guest-owned Nix validation/deployment.
- Error path: static checks fail if old package/profile/env names are reintroduced in live runtime files.
- Edge case: historical solution docs are either excluded from negative grep scope or explicitly labeled retrospective so they do not block the hard cut.

**Verification:**
- Project command listing no longer advertises Odin-named active recipes.
- Static negative checks pass in both repos.
- Documentation gives one clear route for local Korri-to-guest validation and does not instruct users to sync a mutable project checkout into `/storage/korri`.

---

## System-Wide Impact

- **Interaction graph:** Korri flake outputs feed the guest flake; guest Sway launches the Korri binary through `services.korri.package`; Korri runtime reads library state through `LibrarySourceLayerLive` and ProseQL repository code.
- **Error propagation:** missing DEVICE package should fail Nix evaluation; missing DEVICE binary should fail guest static checks or Sway launch smoke; bad library state should surface as existing Korri library errors, not trigger source fallback.
- **State lifecycle risks:** existing `/storage/korri` state may appear lost unless migration/import is explicit; stale installed Odin binaries/services can mask incomplete implementation.
- **API surface parity:** package outputs, app outputs, wrapper binary names, desktop profile env, just recipes, scripts/tools paths, and guest Sway binding must move together.
- **Integration coverage:** unit tests cover naming/env behavior, but guest flake evaluation and hardware smoke are needed to prove package consumption and Sway launch.
- **Unchanged invariants:** generic `korri-desktop` remains the non-device desktop package; guest repo remains owner of session/display/input/audio policy; historical per-device profiles such as Thor and Odin 2 Portal remain device identifiers.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Cross-repo merge order breaks guest evaluation because there are no aliases. | Validate Korri and guest repo together using a local Korri flake override; land/update the guest input in the same release window as the Korri hard cut. |
| Stale `/storage/.nix-profile/bin/korri-desktop-odin` or old services hide an incomplete cut. | Add negative smoke/static checks for old active binary/service names and verify the launched process resolves to DEVICE. |
| User-visible library appears empty after moving defaults to `/storage/.guest/korri`. | Make migration/import explicit and verify state root behavior before device smoke; do not silently fallback to old paths. |
| Removing old deploy scripts slows iteration. | Replace mutable install/deploy guidance with guest-flake local override validation; keep only DEVICE-named smoke tools that target the guest-owned runtime. |
| Renaming package surfaces weakens Electrobun runtime checks. | Preserve existing derivation checks, Nix-managed binary origin enforcement, and forbidden fallback flag tests under DEVICE names. |
| Negative grep overreaches into historical docs. | Scope checks to live runtime/config/scripts/tests/current docs, with retrospective docs explicitly excluded or labeled. |

---

## Documentation / Operational Notes

- Active Korri docs should describe DEVICE as the runtime abstraction and physical names as host/profile identifiers.
- Active guest docs should describe Korri consumption through `korri-desktop-device` and `services.korri`, while retaining the guest's ownership of Sway/input/audio/session environment.
- Local dev validation should be documented from the guest repo using a local Korri input override, not as rsyncing the Korri repo into `/storage/korri`.
- Any one-shot state migration from old `/storage/korri` should be documented as explicit operator action, not as fallback runtime behavior.

---

## Sources & References

- Related code: `flake.nix`
- Related code: `nix/korri-desktop.nix`
- Related code: `nix/modules/korri-frontend.nix`
- Related code: `korri/deploy/desktop/window-options.ts`
- Related code: `korri/shared/library/library-source-layer-live.ts`
- Related code: `tools/odin/sessiond-electrobun.ts`
- Related code: `justfile`
- Guest repo related code: `flake.nix`
- Guest repo related code: `profiles/main-space.nix`
- Guest repo related code: `scripts/static-checks.sh`
- Guest repo related docs: `README.md`
- Guest repo related docs: `docs/contracts/layer14-main-space-contract.md`
- Institutional learning: `docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md`
- Institutional learning: `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md`
- Institutional learning: `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md`
- Institutional learning: `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md`
