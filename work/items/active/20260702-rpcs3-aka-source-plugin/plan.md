---
title: feat: Add RPCS3 source-machine plugin for Aka
type: feat
status: active
date: 2026-07-02
verify_command: "just test-unit && just test-nix"
---

# feat: Add RPCS3 source-machine plugin for Aka

## Summary

Add a first-party `@korri:rpcs3` plugin that discovers PS3 JB disc folders from the Towada gaming library, materializes RPCS3 launches through Korri's readable launch pipeline, and wires Aka as the first source-machine host for live validation. The implementation extends existing plugin/discovery/materializer patterns and keeps RPCS3-specific runtime details inside plugin-owned code and host composition.

---

## Problem Frame

Aka already has a PS3 library at `/srv/lakes/towada/gaming/games/sony-playstation-3` and existing RPCS3 state/config remnants, but Korri has no first-party RPCS3 provider. Without a plugin, PS3 titles cannot be discovered into Aka's Korri catalog, cannot be launched through sessiond, and therefore cannot participate in Aka-to-client streaming.

---

## Requirements

- R1. Korri must expose a first-party `@korri:rpcs3` plugin with stable IDs, app/runtime/system records, and plugin-gated registration.
- R2. The plugin must discover PS3 JB disc folders from the configured PS3 games storage root using scanner-supplied evidence only.
- R3. The launch materializer must turn a discovered PS3 disc marker into an RPCS3 launch spec that boots the game folder through the existing readable launch path.
- R4. The materializer must fail closed with actionable errors for missing content paths, unreadable game folders, and missing RPCS3 firmware/state prerequisites rather than spawning a blank headless emulator session.
- R5. RPCS3 runtime and storage defaults must be provided by plugin-owned NixOS wiring, with source-machine-safe behavior and without putting RPCS3 references in generic platform code.
- R6. Aka must enable `@korri:rpcs3`, point it at the Towada PS3 library, and have RPCS3 available to `korri-sessiond` for source-machine launches.
- R7. The initial live validation target is Skate 3 / `BLUS30464` from the existing PS3 library.
- R8. The plan must preserve existing federation/sessiond behavior: Aka's catalog advertisement and source-machine launch lifecycle should work through current Korri mechanisms, not a separate RPCS3-specific control plane.

---

## Scope Boundaries

- Do not install, bundle, download, or redistribute PS3 firmware or game assets.
- Do not parse binary `PARAM.SFO` title metadata in the initial slice; directory/folder identity is acceptable until a later discovery-polish pass.
- Do not build Android/Z Fold-specific RPCS3 runtime support.
- Do not add Bandai/SM8550 RPCS3 execution support or FEX wrapping in this slice; Aka is `x86_64-linux` and is the installation target.
- Do not productize or validate RPCS3 kiosk execution on other hosts; this slice targets Aka's source-machine role first.
- Do not tune Skate 3 graphics, audio, controller mapping, shaders, or performance beyond what is required to prove the generic discovery/materialization/process-launch/session-lifecycle path.
- Do not refactor unrelated plugin/federation/sessiond architecture beyond seams required for RPCS3.
- Do not use live network calls, content hashing, art scraping, or background mutation during discovery.

### Deferred to Follow-Up Work

- Human-readable PS3 title extraction from `PARAM.SFO` or a title database: future discovery-polish plan.
- Per-user RPCS3 save/state isolation: future multi-user/runtime-state plan if more than one Korri user starts sharing the same RPCS3 data root.
- RPCS3 on ARM64/Bandai via FEX: future plugin-runtime portability plan using `@korri:fex` substrate facts.
- Remote teardown hardening on Moonlight client death: existing source-machine/sessiond follow-up, not part of the minimal RPCS3 plugin slice.
- Aka cold-start / xdg-desktop-portal cleanup: existing operational follow-up before judging RPCS3 launch latency.

---

## Target Repositories

- **Korri repo:** this plan's home. Korri file paths are repo-relative to the current repository.
- **Mountainous repo:** Aka host configuration repository. Mountainous file paths are repo-relative to that repository and are labeled as `Mountainous:` in implementation units.

---

## Context & Research

### Relevant Code and Patterns

- `product/plugins/AGENTS.md` defines first-party plugin layout, stable identity rules, discovery provider constraints, and plugin-owned Nix/runtime boundaries.
- `product/plugins/retroarch/src/discovery.ts` and `product/plugins/retroarch/src/discovery.test.ts` are the primary `file-release` discovery references.
- `product/plugins/retroarch/src/plugin.ts` shows app/runtime/system records, launcher policy, and discovery contribution shape.
- `product/plugins/ryubing/src/materializer.ts` and `product/plugins/ryubing/src/launch-spec.ts` show a standalone emulator materializer that validates state roots, resolves storage tokens, writes emulator config, and emits `--no-gui` launch specs.
- `product/plugins/steam/src/materializer.ts` shows a provider-owned readable launch integration with plugin policy defaults and launch metadata.
- `product/plugins/index.ts` registers first-party plugins and first-party readable launch integrations behind `KORRI_ENABLED_PLUGINS`.
- `product/systems/nixos/flake/plugins.nix` collects plugin `nix/composition.nix` outputs for first-party plugin composition.
- `product/systems/nixos/images/common.nix` distinguishes kiosk plugin modules from source-machine plugin modules; source-machine-safe plugin wiring must opt in explicitly.
- `product/systems/nixos/images/source-machine.nix` is the source-machine role Aka consumes through Mountainous.
- `product/systems/nixos/modules/korri-daemon.nix` renders `services.korri.daemon.library.platformDefaults` as a generated config root.
- `Mountainous: hosts/aka/default.nix` currently enables `@korri:gamescope,@korri:retroarch`, manually puts RetroArch on `korri-sessiond.path`, and imports Korri's source-machine module.
- `Mountainous: features/gaming/rpcs3.nix` already manages RPCS3 Home Manager VFS/save/install symlinks, including firmware caveats.
- `Mountainous: features/gaming/options.nix` already defines `mountainous.features.gaming.rpcs3.gamePath`, `savePath`, and `installPath`.
- `Mountainous: flake.nix` confirms Aka is `x86_64-linux` and imports `inputs.korri.nixosModules.korri-source-machine`.

### Institutional Learnings

- `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`: plugin contributions own data/content/actions and must preserve stable plugin identity.
- `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md`: generic Korri platform code must not name specific plugins; plugin-specific runtime behavior belongs under `product/plugins/<plugin>/**` and explicit composition seams.
- `work/items/parking-lot/01KWGN0GJ8A52VCD1EQ6JDXBA6-support-retroarch-on-headless-korri-source-machines-plugin-m.md`: RetroArch's kiosk-only plugin module stranded source-machine launches; RPCS3 must be source-machine-safe from the start.
- `work/items/parking-lot/01KWGPRQW5RW63BSXAZN88X69T-make-retroarch-launcher-command-absolute-for-source-machine-.md`: source-machine launch intents require absolute commands, so RPCS3 cannot rely on a bare `rpcs3` command for streaming.
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`: source-machine launches should stay on the standard sessiond lifecycle (`child-running -> child-exited -> restoring -> idle-ready`).

### External References

- RPCS3 command-line usage supports `--no-gui` for direct game boot, and examples use either a game directory/path or an RPCS3 VFS path such as `%RPCS3_VFS%:dev_hdd0/...`. The initial Korri slice should boot the existing JB disc folder path and defer installed-title VFS shortcuts unless needed by live validation.

---

## Key Technical Decisions

- **Use `PS3_DISC.SFB` as the discovery marker:** The Towada library contains `Skate 3 [BLUS30464]/PS3_DISC.SFB`, which is the stable disc-folder evidence. This avoids binary `PARAM.SFO` parsing and avoids treating `_dev_hdd0` as discoverable content.
- **Model initial content as JB disc folders, not installed `_dev_hdd0` titles:** `_dev_hdd0` is RPCS3's virtual hard-drive/install state, not a library root for discovery in this slice. Installed-title launch by VFS path is deferred until there is a clear game that only exists in installed form.
- **Discovery must preserve parent-folder identity:** `PS3_DISC.SFB` is evidence, but persisted playable/release identity must come from the parent game folder. Use the smallest explicit scan-to-catalog seam that supports this (scanner identity override or provider-ref resolution) rather than relying on marker-file basename behavior.
- **Use plugin policy/storage for state and firmware checks:** The plugin should expose default storage for games and state/install roots, then validate firmware/state prerequisites before spawning RPCS3 so headless launches fail with actionable Korri errors.
- **Require an absolute RPCS3 launch command before materialization succeeds:** The plugin's host/Nix wiring must project a stable absolute launcher path through platform defaults or plugin policy, and the materializer must fail before emitting a launch spec if the resolved command is absent or relative.
- **Start bare under Sway, not wrapped in Gamescope:** Aka already runs the source-machine Sway/Sunshine/sessiond stack. Add Gamescope wrapping only if live validation proves Sunshine cannot capture RPCS3's surface.
- **Keep federation unchanged:** Once Aka discovers a PS3 entry and the plugin is enabled, existing catalog/fabric behavior should advertise it; no RPCS3-specific federation protocol is planned.

---

## Open Questions

### Resolved During Planning

- **Is Aka an x86_64 host?** Yes. `Mountainous: flake.nix` declares `aka = mkHost { system = "x86_64-linux"; ... }`.
- **What is `_dev_hdd0` in the Towada PS3 library?** Treat it as RPCS3 virtual HDD/install state. The disc-library entry is `Skate 3 [BLUS30464]` with `PS3_DISC.SFB` and `PS3_GAME/`.
- **Should discovery parse PS3 title metadata?** No for this slice. The plugin uses disc folder identity and defers binary SFO parsing.
- **Does this need new federation behavior?** No. Aka already advertises a source-machine Korri daemon; plugin enablement and catalog discovery should flow through existing federation.

### Deferred to Implementation

- **Exact firmware sentinel path:** U3 must include a small preflight to identify the exact RPCS3 firmware sentinel under the same user/env that `korri-sessiond` uses on Aka, then document and test that sentinel before launch materialization is considered complete.
- **Exact absolute RPCS3 command projection:** Implementation should use platform defaults/plugin policy to pass a stable absolute RPCS3 command into the readable context; U3 must reject missing or relative commands and U4 must assert the generated Nix defaults provide an absolute command.
- **Whether Sunshine captures bare RPCS3 correctly:** This requires live Aka validation after the plugin and host wiring land.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  Storage[PS3 storage root\nsony-playstation-3]
  Marker[Skate 3 [BLUS30464]/PS3_DISC.SFB]
  Discovery[@korri:rpcs3 discovery provider]
  Catalog[Aka readable catalog]
  Resolver[Korri launch resolver]
  Materializer[RPCS3 readable launch integration]
  Sessiond[Aka korri-sessiond]
  Sunshine[Aka Sunshine stream]
  Client[Bandai / Moonlight client]

  Storage --> Marker --> Discovery --> Catalog --> Resolver --> Materializer --> Sessiond --> Sunshine --> Client
  Materializer -. validates .-> Firmware[RPCS3 state + firmware]
  Materializer -. derives parent .-> GameFolder[Skate 3 [BLUS30464] folder]
```

---

## Implementation Units

### U1. Create the RPCS3 plugin descriptor and IDs

**Goal:** Add the first-party `@korri:rpcs3` plugin shell with stable identity, app/runtime/system records, default storage records, and plugin-gated registration.

**Requirements:** R1, R2, R5

**Dependencies:** None

**Files:**
- Create: `product/plugins/rpcs3/index.ts`
- Create: `product/plugins/rpcs3/README.md`
- Create: `product/plugins/rpcs3/src/ids.ts`
- Create: `product/plugins/rpcs3/src/plugin.ts`
- Create: `product/plugins/rpcs3/src/plugin.test.ts`
- Modify: `product/plugins/index.ts`
- Test: `product/plugins/rpcs3/src/plugin.test.ts`
- Test: `product/plugins/index.test.ts`

**Approach:**
- Follow `product/plugins/AGENTS.md` and mirror the descriptor shape in `product/plugins/retroarch/src/plugin.ts`.
- Define stable local IDs for plugin, app, PS3 system, RPCS3 runtime, games storage, and state/install storage.
- Contribute a `Sony PlayStation 3` system, a standalone RPCS3 runtime, an RPCS3 launcher, and default storage roots suitable for host override.
- Register only the RPCS3 plugin descriptor in `product/plugins/index.ts`; leave readable launch integration registration to U3.
- Do not add RPCS3 names to generic platform code.

**Execution note:** Implement descriptor and registry behavior test-first so stable IDs and enablement gates are locked before launch logic is added.

**Patterns to follow:**
- `product/plugins/retroarch/src/plugin.ts`
- `product/plugins/steam/src/plugin.ts`
- `product/plugins/index.ts`
- `product/plugins/AGENTS.md`

**Test scenarios:**
- Happy path: when `KORRI_ENABLED_PLUGINS` includes `@korri:rpcs3`, `createFirstPartyPluginRegistryFromEnv` exposes the RPCS3 plugin.
- Happy path: the descriptor contributes provider metadata, PS3 system metadata, RPCS3 app/runtime records, and the expected discovery provider ID.
- Happy path: the RPCS3 launcher policy documents the command shape that the U3 materializer will require for Aka.
- Edge case: when `KORRI_ENABLED_PLUGINS` omits `@korri:rpcs3`, the registry does not enable RPCS3.
- Integration: first-party plugin registration keeps existing plugins enabled/disabled exactly as before when RPCS3 is absent.

**Verification:**
- RPCS3 plugin metadata is available only when enabled and does not regress existing plugin registry tests.

---

### U2. Add PS3 disc-folder discovery

**Goal:** Discover PS3 JB disc folders by scanning for direct-child game-folder markers shaped `<game folder>/PS3_DISC.SFB` under the configured PS3 storage root.

**Requirements:** R2, R7

**Dependencies:** U1

**Files:**
- Create: `product/plugins/rpcs3/src/discovery.ts`
- Create: `product/plugins/rpcs3/src/discovery.test.ts`
- Modify: `product/plugins/rpcs3/src/plugin.ts`
- Test: `product/plugins/rpcs3/src/discovery.test.ts`

**Approach:**
- Implement a plugin-owned `releaseDiscoveryProvider` with a stable ID such as `@korri:rpcs3/ps3-disc-folders`.
- Use scanner-supplied file descriptors only; emit observations when the file name is `PS3_DISC.SFB` and the relative path indicates a direct child game folder.
- Add an explicit parent-folder identity seam for PS3 marker discoveries so persisted playable/release identity is based on the game folder, not the marker-file basename.
- Emit observations whose source is the marker file and whose release points at the RPCS3 app/runtime/system records from U1; choose `file-release` plus scanner identity override or `provider-ref-release` based on the smallest platform change that makes folder identity explicit.
- Use the parent folder name as the initial game/release identity. For the real fixture, this may be `Skate 3 [BLUS30464]`; avoid trying to parse `PARAM.SFO`.
- Explicitly skip `_dev_hdd0` and other RPCS3 state/install folders so they do not become duplicate catalog entries.

**Patterns to follow:**
- `product/plugins/retroarch/src/discovery.ts`
- `product/plugins/retroarch/src/discovery.test.ts`
- `product/plugins/steam/src/discovery.ts` only as contrast for provider-ref observations

**Test scenarios:**
- Happy path: `Skate 3 [BLUS30464]/PS3_DISC.SFB` emits one high-confidence PS3 observation using the RPCS3 app/runtime IDs and a playable identity derived from `Skate 3 [BLUS30464]`, not `PS3_DISC.SFB`.
- Happy path: multiple sibling game folders with `PS3_DISC.SFB` emit independent observations.
- Edge case: `_dev_hdd0/BLUS30464/PARAM.SFO` and `_dev_hdd0/...` files emit no observations.
- Edge case: `PS3_GAME/PARAM.SFO`, `EBOOT.BIN`, and arbitrary `.SFO` files emit no observations.
- Edge case: nested `some/path/PS3_DISC.SFB` outside the expected direct game-folder shape is ignored unless implementation deliberately supports that shape with tests.
- Integration: a scan-to-catalog fixture with two PS3 folders persists distinct folder-derived playable identities rather than marker-file-derived duplicates.
- Integration: the provider attached to the plugin descriptor is the same provider tested directly.

**Verification:**
- A scanner fixture shaped like the Towada Skate 3 folder produces one launchable candidate and no `_dev_hdd0` duplicate.

---

### U3. Materialize RPCS3 launch specs and policy

**Goal:** Add a readable launch integration that converts discovered marker-file content into a source-machine-safe RPCS3 launch with explicit state/firmware validation.

**Requirements:** R3, R4, R8

**Dependencies:** U1, U2

**Files:**
- Create: `product/plugins/rpcs3/src/policy.ts`
- Create: `product/plugins/rpcs3/src/policy.test.ts`
- Create: `product/plugins/rpcs3/src/launch-spec.ts`
- Create: `product/plugins/rpcs3/src/launch-spec.test.ts`
- Create: `product/plugins/rpcs3/src/materializer.ts`
- Create: `product/plugins/rpcs3/src/materializer.test.ts`
- Modify: `product/plugins/rpcs3/index.ts`
- Modify: `product/plugins/index.ts`
- Test: `product/plugins/rpcs3/src/policy.test.ts`
- Test: `product/plugins/rpcs3/src/launch-spec.test.ts`
- Test: `product/plugins/rpcs3/src/materializer.test.ts`

**Approach:**
- Model RPCS3 plugin policy after Ryubing/Steam: include state root, optional install root, optional firmware root/sentinel, env, and extra args as plugin-owned config.
- Resolve `{storage:...}` tokens through the readable launch context so host defaults can place game/state/install roots under Towada paths without hardcoding them in code.
- In the materializer, require `context.app.plugin === @korri:rpcs3`, require a marker-file content path, derive the game folder with `dirname(content.path)`, and validate that folder is readable.
- Validate firmware/state prerequisites before returning a launch spec. Missing firmware should become `AppMaterializationFailed` with an actionable reason.
- Compose a launch spec only after an absolute command is present from host/platform defaults, include `--no-gui`, and pass the JB game folder path. Keep installed-title VFS launch syntax deferred.
- Return normal readable launch materialization output so sessiond/source-machine behavior remains generic.

**Execution note:** Add materializer tests before host wiring. These tests should document the marker-file-to-parent-folder convention so no platform-wide directory-target change is introduced accidentally.

**Patterns to follow:**
- `product/plugins/ryubing/src/materializer.ts`
- `product/plugins/ryubing/src/launch-spec.ts`
- `product/plugins/steam/src/materializer.ts`
- `product/platform/library/config/errors.ts`

**Test scenarios:**
- Happy path: context with RPCS3 app, `content.path` ending in `PS3_DISC.SFB`, readable parent folder, valid state/firmware policy, and absolute command materializes to RPCS3 `--no-gui <game-folder>`.
- Happy path: storage-token policy resolves game/state/install roots from `context.storage` before validation.
- Edge case: `canResolve` returns false for non-RPCS3 apps, missing `content.path`, or malformed plugin policy.
- Error path: missing `content.path` fails with `AppMaterializationFailed` and does not emit a launch spec.
- Error path: unreadable or missing game folder fails before spawn.
- Error path: missing firmware sentinel fails before spawn with a reason that includes the expected operator action/location.
- Error path: blank or relative command is rejected by the RPCS3 materializer before a launch spec is emitted.
- Integration: materialization output remains compatible with first-party launch integration filtering by enabled plugin ID.

**Verification:**
- The materializer can dry-run a fixture context for `Skate 3 [BLUS30464]/PS3_DISC.SFB` into an RPCS3 launch spec without introducing RPCS3-specific code outside the plugin.

---

### U4. Add plugin-owned Nix composition and source-machine-safe module wiring

**Goal:** Provide the RPCS3 binary/path/default-storage wiring through plugin-owned Nix so source-machine hosts can enable the plugin declaratively.

**Requirements:** R5, R6, R8

**Dependencies:** U1, U3

**Files:**
- Create: `product/plugins/rpcs3/nix/composition.nix`
- Create: `product/plugins/rpcs3/nix/nixos-module.nix`
- Create: `product/plugins/rpcs3/nix/module-check.nix`
- Modify: `product/systems/nixos/flake/default.nix`
- Modify: `product/systems/nixos/flake/modules.nix`
- Modify: `product/systems/nixos/flake/checks.nix`
- Test: `product/plugins/rpcs3/nix/module-check.nix`
- Test: `tools/testing/nix/korri-source-machine-module-check.nix` *(if the source-machine aggregate check needs an assertion for source-machine plugin module inclusion)*

**Approach:**
- Follow `product/plugins/steam/nix/composition.nix` and `product/plugins/retroarch/nix/composition.nix` for first-party composition output.
- Expose a plugin NixOS module that defines RPCS3-specific options for games root, state root, install root, firmware sentinel/root, and package/command projection.
- Target Aka/source-machine wiring first; kiosk evaluation is a compatibility/no-regression check, not a productized validation target.
- Put the RPCS3 package or wrapper on `systemd.user.services.korri-sessiond.path` only where launch-capable sessiond exists.
- Render platform defaults under `services.korri.daemon.library.platformDefaults` for `@korri:rpcs3` storage/policy, including a stable absolute command value suitable for source-machine launch intents.
- Expose the RPCS3 NixOS module to downstream source-machine consumers either through an explicit exported module (for Mountainous to import) or a source-machine plugin-module output that `korri-source-machine` includes.
- If current first-party source-machine composition only includes Gamescope modules, extend the explicit source-machine plugin module list to include the RPCS3 module once it is source-machine-safe, and add an aggregate Nix check proving `korri-source-machine` imports it.

**Patterns to follow:**
- `product/plugins/steam/nix/composition.nix`
- `product/plugins/retroarch/nix/nixos-module.nix`
- `product/systems/nixos/flake/plugins.nix`
- `product/systems/nixos/images/common.nix`
- `tools/testing/nix/korri-source-machine-module-check.nix`

**Test scenarios:**
- Happy path: enabling the RPCS3 NixOS module on an x86_64 source-machine config adds RPCS3 to `korri-sessiond.path`.
- Happy path: platform defaults render an RPCS3 games storage root, state/install roots, and absolute command/policy values.
- Happy path: `KORRI_ENABLED_PLUGINS` can include `@korri:rpcs3` without disabling existing source-machine plugins.
- Edge case: a non-launch-capable config does not evaluate sessiond path mutations that require missing sessiond options.
- Error path: unsupported platforms fail clearly or skip RPCS3 package wiring without breaking unrelated plugin composition.
- Integration: `korri-source-machine` aggregate evaluation imports the source-machine-safe RPCS3 module or exposes a downstream-importable module used by Aka.
- Integration: first-party plugin composition still evaluates with existing plugin modules and checks.

**Verification:**
- Nix checks prove RPCS3 plugin module output is available to source-machine compositions and does not require per-host manual binary injection for source-machine launches.

---

### U5. Wire Aka to enable RPCS3 against the Towada PS3 library

**Goal:** Enable `@korri:rpcs3` on Aka and configure the PS3 games/state roots using existing Mountainous host and gaming feature seams.

**Requirements:** R6, R7, R8

**Dependencies:** U4

**Files:**
- Modify: `Mountainous: hosts/aka/default.nix`
- Modify: `Mountainous: features/gaming/rpcs3.nix` *(only if it must be usable independently of `mountainous.features.gaming.enable` for Aka's headless source-machine role)*
- Test: `Mountainous: hosts/aka/default.nix` *(host evaluation through Mountainous flake)*

**Approach:**
- Extend Aka's forced `KORRI_ENABLED_PLUGINS` to include `@korri:rpcs3` while preserving `@korri:gamescope,@korri:retroarch`.
- Configure RPCS3 games root as `/srv/lakes/towada/gaming/games/sony-playstation-3`.
- Configure RPCS3 install/state roots consistently with the existing `_dev_hdd0` structure and Mountainous RPCS3 feature options.
- Prefer the Korri plugin NixOS module from U4 for binary/path/platform-default wiring. Remove or avoid duplicating host-local workaround code once the plugin module owns it.
- If Mountainous's `features.gaming.rpcs3` remains gated by the global gaming feature, either enable the minimal per-feature path for Aka or leave Home Manager VFS/symlink management out of the Korri launch path and document the manual prerequisite.

**Patterns to follow:**
- `Mountainous: hosts/aka/default.nix` existing RetroArch source-machine wiring
- `Mountainous: features/gaming/rpcs3.nix`
- `Mountainous: features/gaming/options.nix`

**Test scenarios:**
- Happy path: Aka host evaluation includes `@korri:rpcs3` in `KORRI_ENABLED_PLUGINS` without dropping existing plugin IDs.
- Happy path: Aka host evaluation points RPCS3 games storage to the Towada PS3 library.
- Happy path: Aka host evaluation exposes an absolute RPCS3 launch command through Korri platform defaults or plugin policy.
- Edge case: disabling or omitting Mountainous's broad `gaming.enable` does not silently prevent the Korri source-machine RPCS3 launch path from being configured.
- Integration: Aka still evaluates as `x86_64-linux` with Korri source-machine module imports intact.

**Verification:**
- Mountainous evaluation for Aka shows the plugin enabled, storage roots configured, and RPCS3 available to the source-machine session environment.

---

### U6. Validate discovery, federation visibility, and live source-machine launch on Aka

**Goal:** Prove the plugin works end-to-end on the real target: Aka discovers Skate 3, advertises it through Korri, and can launch it as a source-machine stream.

**Requirements:** R6, R7, R8

**Dependencies:** U5

**Files:**
- Test: `product/plugins/rpcs3/src/discovery.test.ts`
- Test: `product/plugins/rpcs3/src/materializer.test.ts`
- Test: `Mountainous: hosts/aka/default.nix`

**Approach:**
- Deploy the Korri + Mountainous changes to Aka through the established NixOS rebuild path.
- Confirm korrid's plugin registry includes `@korri:rpcs3` and discovery sees exactly the Skate 3 disc-folder candidate from the Towada PS3 root.
- Confirm Aka remains in source-machine idle-ready state before launch.
- Dry-run or prepare a launch for the discovered Skate 3 entry and verify the materialized command is absolute and points at the JB folder, not `_dev_hdd0`.
- Launch via the normal source-machine streaming path and verify sessiond lifecycle reaches child-running, then exits/restores to idle-ready after stop.
- Verify an actual client stream shows observable RPCS3/Skate 3 video, not just a successful backend prepare response. If bare Sway capture fails, include the minimal capture fix needed to make the generic launch path observable before declaring U6 complete.
- Verify a client/federated catalog can see the Aka-sourced PS3 entry before declaring success.

**Patterns to follow:**
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- Existing Aka source-machine live validation notes in `work/items/active/01KWF99H29Q52N3BSD8RP0X45V-aka-headless-stream-host/plan.md`
- Korri daemon RPC/library inspection tooling already used for Aka/Bandai validation

**Test scenarios:**
- Happy path: Aka library discovery includes a PS3/Skate 3 entry whose source path is `Skate 3 [BLUS30464]/PS3_DISC.SFB`.
- Happy path: launch dry-run resolves to an absolute RPCS3 command with `--no-gui` and the `Skate 3 [BLUS30464]` folder.
- Happy path: the client stream shows observable RPCS3/Skate 3 video and basic input reaches the game or RPCS3 window.
- Happy path: after launch stop, source-machine status returns to idle-ready.
- Error path: if firmware is missing, launch prepare fails before spawn with a user-actionable materialization error.
- Error path: if the PS3 games root is unavailable, discovery produces no false `_dev_hdd0` entries and surfaces storage-root diagnostics through existing scanner behavior.
- Integration: Bandai or another Korri client can see the Aka-sourced PS3 entry through fabric/federated catalog scope.

**Verification:**
- End-to-end validation shows discovery, dry-run/materialization, source-machine launch, teardown/restore, and catalog federation for the Aka PS3 entry.

---

## System-Wide Impact

- **Interaction graph:** Discovery provider feeds scanner/reconciliation; readable catalog feeds launch resolver; RPCS3 materializer feeds sessiond; existing source-machine stream/federation paths remain unchanged.
- **Error propagation:** Plugin materialization failures should use existing typed resolution errors so UI/RPC callers see launch-preparation failure instead of blank stream sessions.
- **State lifecycle risks:** RPCS3 state and `_dev_hdd0` are mutable and may contain saves/installed data. The initial plan assumes single-user shared state and avoids writing during discovery.
- **API surface parity:** CLI/RPC/UI launch surfaces should all resolve through the same readable launch integration; no separate RPCS3-only launch endpoint is introduced.
- **Integration coverage:** Unit tests cover descriptor/discovery/materializer/Nix evaluation; live validation is required for Sunshine capture and session restore.
- **Unchanged invariants:** Existing plugins, source-machine federation, sessiond lifecycle, and storage reconciliation contracts remain plugin-agnostic.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| RPCS3 firmware is absent or not where the plugin expects | Fail before spawn with a typed materialization error and document the configured sentinel/root. |
| Source-machine launch rejects bare `rpcs3` commands | Project an absolute command through plugin-owned Nix/platform defaults and cover it in tests. |
| `_dev_hdd0` produces duplicate or invalid catalog entries | Discover only direct-child game-folder `PS3_DISC.SFB` markers and skip state/install folders. |
| RPCS3 window is not captured by Sunshine when launched bare under Sway | Make live capture validation part of U6; add the minimal capture fix in-scope if needed to prove the generic Aka source-machine launch path. |
| Host-local Mountainous RPCS3 feature gating conflicts with Aka's `gaming.enable = false` | Keep Korri plugin launch requirements in Korri's plugin module; use Mountainous Home Manager wiring only for optional VFS/symlink setup or adjust its gating deliberately. |
| Shared RPCS3 state can collide across users/devices | Document single-user assumption and defer per-user state isolation. |
| First-party source-machine plugin module inclusion is too narrow today | Extend explicit source-machine plugin module composition only for modules proven stream-host-safe. |

---

## Documentation / Operational Notes

- Update `product/plugins/rpcs3/README.md` with supported PS3 library shape, firmware prerequisite, Aka validation target, and out-of-scope installed-title/VFS launching.
- Do not document firmware download automation; point operators at the fact that firmware must be supplied manually and legally.
- Record live Aka validation results in the implementation PR rather than expanding this plan with execution logs.
- If U6 reveals Sunshine capture or teardown issues, capture those as separate backlog items unless a minimal in-scope fix is required for the first launch to succeed.

---

## Sources & References

- Related code: `product/plugins/AGENTS.md`
- Related code: `product/plugins/retroarch/src/discovery.ts`
- Related code: `product/plugins/retroarch/src/plugin.ts`
- Related code: `product/plugins/ryubing/src/materializer.ts`
- Related code: `product/plugins/index.ts`
- Related code: `product/systems/nixos/flake/plugins.nix`
- Related code: `product/systems/nixos/images/common.nix`
- Related code: `product/systems/nixos/images/source-machine.nix`
- Related code: `product/systems/nixos/modules/korri-daemon.nix`
- Related code: `Mountainous: hosts/aka/default.nix`
- Related code: `Mountainous: features/gaming/rpcs3.nix`
- Related code: `Mountainous: features/gaming/options.nix`
- Related code: `Mountainous: flake.nix`
- Institutional learning: `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`
- Institutional learning: `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md`
- Institutional learning: `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- Related backlog: `work/items/parking-lot/01KWGN0GJ8A52VCD1EQ6JDXBA6-support-retroarch-on-headless-korri-source-machines-plugin-m.md`
- Related backlog: `work/items/parking-lot/01KWGPRQW5RW63BSXAZN88X69T-make-retroarch-launcher-command-absolute-for-source-machine-.md`
- External docs: RPCS3 command-line examples for `--no-gui` and VFS path launches
