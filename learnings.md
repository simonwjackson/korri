# Institutional Learnings Search Results

## Search Context

- **Feature/Task**: No-backwards-compat Korri plugin/config schema big-bang refactor — standardizing plugin-contributed launcher definitions, `target`/`launch` split, common normalized settings packs, provider-linked identity, and system registry, as drafted in `work/items/active/01KVGDKT01DNT9NRDKS846CJQ1-plugin-launcher-standardization/config-sketch.korri.yaml`.
- **Keywords Used**: plugin, launcher, cascade, schema, first-party, provider, retroarch, steam, gamescope, registry, boundary, settings, migration, big-bang, explicit-policy, YAML, library, systems, runtime, contract
- **Files Scanned**: 54 total files across `docs/solutions/`
- **Relevant Matches**: 12 files (5 strong, 5 moderate, 2 active parking-lot items)

---

## Critical Patterns

No `docs/solutions/patterns/critical-patterns.md` exists in this repo.

---

## Relevant Learnings

### 1. Korri Plugin Architecture — Taxonomy, Namespace, and First-Party Layout

- **File**: `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`
- **Module**: Plugin system / korri/plugins
- **Problem Type**: `architecture_pattern`
- **Relevance**: Directly defines the vocabulary and rules for the plugin contribution model the config-sketch is instantiating. Every decision in the sketch — `@korri:retroarch`, `@korri:zquest-classic`, `@korri:steam`, `@korri:nixpkgs`, `@korri:process` — lives inside this contract.
- **Key Insight**:
  - Use the Playnite-shaped taxonomy: `ContentSource`, `MetadataProvider`, `GenericPlugin`. This is the established language; do not invent synonyms.
  - Plugin RPCs use `plugin.<id>.<action>`. Handler files live under the owning plugin directory.
  - First-party plugin code lives under `product/plugins/<id>/*`; reusable host contracts stay in shared/platform code.
  - `@plugins/*` is the alias for the plugin layer, separate from `@app/*` and `@shared/*`.
  - **Plugins contribute data and actions, not DOM, styling, or home-grid slots.** The theme stays in control of rendering.
  - **Intent extensibility starts closed.** The host routes only known intent tags; unknown tags fail at the seam until a registry is deliberately extended.
  - Input contract enforcement: every plugin manifest declares `inputContract: "gamepad-first"`.
  - User-installed plugins live outside the Nix closure under `~/.config/korri/plugins/<id>`. In-tree first-party plugins may have Nix modules; user plugins must not require a system rebuild.
  - The first implementation slice introduces `ContentItem`, `ContentSourceService`, and `ContentSources` alongside `LibrarySource`; existing call sites stay stable until later slices migrate layers behind the generalized contract.
- **Severity**: Not stated (active guidance, dated 2026-06-02 — current)

---

### 2. Gamescope as Plugin-Owned Composition — The Generic Platform Boundary Rule

- **File**: `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md`
- **Module**: plugins + launch-composition + nix-composition
- **Problem Type**: `architecture_boundary`
- **Relevance**: Establishes the authoritative rule for what the platform owns vs what a first-party plugin owns. Gamescope is the canonical worked example; the same rule applies verbatim to `@korri:retroarch`, `@korri:zquest-classic`, `@korri:steam`, and any new plugin the big-bang introduces.
- **Key Insight**:
  - **Generic Korri code (platform, services, apps, themes, reusable Nix modules) does not name specific plugins.** The platform owns: generic provider maps, plugin registries, launch-companion dispatch, stream-control metadata/action transport, session lifecycle hook points, and structured diagnostics.
  - Each plugin owns: its provider id, policy payload shape, launch wrapping, runtime-control protocol, stream-control definitions, and plugin-owned Nix artifacts.
  - Config authors compose launch companions through `launch.with` entries keyed by provider id. The platform decodes the map generically; provider-specific validation and folding belong to the enabled plugin.
  - When an authored launch references a provider that is absent, disabled, or rejects its payload, **dry-run and actual launch return structured plugin diagnostics before process spawn**. Library listing and unrelated launches must not require the missing plugin.
  - Products/images opt into a plugin by enabling it in composition; a no-plugin composition must still evaluate cleanly.
  - The sketched `launch.with."@korri:gamescope"` shape in config examples is the correct form; a retired top-level `gamescope:` field is wrong.
  - Open backlog: generic plugin composition diagnostics for cross-plugin launch constraints (`01KVBNK266WD0D4GX2DSABA9QG`) and generic authored coordination for multi-plugin stream controls (`01KVBPNPXZ3X49XSCFXPY6CVW8`) are still deferred.
- **Severity**: high

---

### 3. Explicit Cascade-Folded Policy Over Incidental Signal Heuristics

- **File**: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- **Module**: korri/shared/library/config + tools/device/game-stream-fullscreen
- **Problem Type**: `design_pattern`
- **Relevance**: The config-sketch's common normalized settings packs (`display`, `audio`, `input`, `saves`, `lifecycle`) and the `settings.plugin` typed pack are exactly the layered, cascade-merged policy fields this pattern describes. The refactor introduces a cascade (global → named launchers → system → release `launch` overlay → release `overrides`); this pattern governs how fields in that cascade must be authored.
- **Key Insight**:
  - **Make intent explicit in named, cascade-folded fields.** When a wrapper or composer needs to know something the child owns, add that as a documented policy field — not inferred from argv, environment, or on-disk config the composer cannot read.
  - **The component that knows a fact records it in policy at construction time.** The composer emits from policy strictly, with no env-sniffing or argv-inspection.
  - **Delete the old heuristic when you ship the field.** A heuristic left alongside an explicit field creates a silent parallel universe where both can disagree.
  - **Provide a correct-for-typical-deployment default** at the floor of the cascade. Atypical deployments override in YAML; the common case needs no authoring ceremony.
  - This exact pattern bitten three times before this doc was written: (1) gamescope `--expose-wayland` flag inferred from child argv — wrong for RetroArch's on-disk `retroarch.cfg`; (2) input-bus action source inferred from timing windows; (3) spatial focus attribute inferred from browser's `:focus-visible`. All three were fixed the same way: explicit named field, emitter sets it, consumer reads it.
  - Direct application: `settings.display.fullscreen`, `settings.display.integerScale`, `settings.display.vsync`, etc. must be modeled as cascade-folded named fields, never guessed from launcher argv or environment at runtime.
- **Severity**: medium

---

### 4. RetroArch — nixpkgs Wrapper Silently Injects `-L coredir`, Breaking Explicit Core Launches

- **File**: `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`
- **Module**: nix/images/kiosk.nix
- **Problem Type**: `runtime_error`
- **Relevance**: The config-sketch models `@korri:retroarch` as a named launcher with `plugin: "@korri:retroarch"` and per-runtime core `.so` paths. The Nix packaging of RetroArch must avoid the wrapper trap to honor explicit `-L <core.so>` from the launcher — or the entire runtime selection model silently breaks.
- **Key Insight**:
  - **Do NOT use `pkgs.retroarch-bare.passthru.wrapper { cores = ...; }`** when the launcher passes an explicit `-L <core.so>`. The wrapper unconditionally prepends `-L <coredir> --appendconfig=<cfg>` to every invocation. With two `-L` flags, RetroArch falls back to extension-based content routing, picking the wrong core.
  - **Use `pkgs.symlinkJoin`** to compose `retroarch-bare` + individual core `.so` files. This exposes the binary and cores without injecting any flags. Propagate `passthru.cores` and `passthru.unwrapped` so closure-shape NixOS assertions stay valid.
  - **Expose core paths via `environment.etc."korri/cores/<name>.so".source`** to give the launcher a stable, rebuild-stable absolute path that avoids baking per-build Nix store hashes into user-facing library YAML.
  - The closure-shape test (`nix/tests/korri-rocknix-sm8550-config-check.nix`) matches on `passthru.cores` + `passthru.unwrapped` attrs, not pname (pname drifts with version bumps). Keep it.
  - **Reviewer rule**: when nixpkgs exposes both `<pkg>` and `<pkg>.passthru.wrapper { ... }`, default to `<pkg>` + explicit `symlinkJoin`. Reach for the upstream wrapper only when you want its injected flags.
  - This is one instance of a recurring pattern: _helpers that inject implicit defaults are fine for opaque callers and wrong for explicit ones._
- **Severity**: high

---

### 5. Architectural Posture Belongs in the Image-Level Default — Zero-Back-Compat Nix Migration Pattern

- **File**: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- **Module**: nix/images + nix/modules
- **Problem Type**: `architecture_pattern`
- **Relevance**: The plugin/config big-bang is explicitly no-backwards-compat. Any Nix module options that are being deleted or semantically repurposed follow this pattern — the new posture belongs in the image-base composition layer, not in the module's `lib.mkDefault`, so that all image variants that opt into the new shape inherit it structurally.
- **Key Insight**:
  - **When a capability flips from opt-in to always-on (zero-back-compat), push the new posture to the lowest layer that universally implies it — the image base, not the module.**
  - The module's `lib.mkDefault` stays conservative so a bare one-off NixOS host importing the module doesn't get the fleet posture. The image-base sets the posture for everyone that builds an image.
  - A multi-option capability (e.g., `host`, `openFirewall`, `services.avahi.enable` all needed for federation) must be bundled at the image layer to prevent drift. If any single option is forgotten on the module, the compose silently regressions.
  - **The corresponding NixOS evaluation-time assertion flips at the same layer:** the check lives in `korri-image-outputs-check.nix` at the image level, not buried in the module test.
  - Applies when: a capability was originally opt-in and the deletion of its knob is the zero-back-compat signal; when out-of-band host configs have been silently providing what the image base should provide; when the module is shared between fleet images and one-off single-machine consumers.
- **Severity**: medium

---

## Additional Matches (Moderate Relevance)

### 6. SessionD Protocol Evolution Rule — Additive Schema, Capability Flags Over Versioning

- **File**: `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` (§ "Protocol evolution rule")
- **Problem Type**: `architecture_pattern`
- **Relevance**: Directly applicable to how the new plugin/config schema evolves after the big-bang ships. The same five rules should govern the config schema wire format.
- **Key Insight** (five rules from `sessiond-managed-launch-protocol.ts`, preserved verbatim):
  1. Schemas update before the daemon emits — add the optional field to client schemas first, deploy the daemon second.
  2. Additive only — required fields are forever; deprecate by marking optional and leaving in the union.
  3. Optional by default for new fields, even when the daemon always emits them.
  4. Mixed-version deployments are supported during incident response and rollback windows.
  5. **Capability flags over schema versioning** — when a daemon-side change is gated, encode the daemon's support as a capability flag. The capability is the contract; the schema is just the wire shape.
  - `onExcessProperty: "error"` is the consumer-side default; relaxing requires a parallel decoder at the specific call site, never flipping the global flag.

### 7. RetroArch Routes `.png` Content to Built-In Image-Display Core

- **File**: `docs/solutions/runtime-errors/retroarch-png-extension-routes-to-image-display-core-2026-05-27.md`
- **Problem Type**: `runtime_error`
- **Relevance**: The config-sketch models PICO-8 content via `target.kind: file` with a `.p8` or `.p8.png` extension. The wrong extension silently routes to the wrong core regardless of an explicit `-L`.
- **Key Insight**:
  - RetroArch's built-in `image display` core claims `.png`, `.jpg`, `.bmp`. When CLI is ambiguous (duplicate `-L`, directory-as-core), `.png` content routes to image-display, ignoring the explicit core.
  - **Fix 1 (primary)**: eliminate CLI ambiguity by using `symlinkJoin` (see Finding 4 above) so the launcher's `-L` arrives unambiguous.
  - **Fix 2 (belt-and-braces)**: store or symlink PICO-8 `.p8.png` carts to `.p8` in library YAML. The launcher references `.p8`; the underlying file remains a PNG-wrapped cart.
  - Library import normalization rule: when ingesting PICO-8 carts, prefer `.p8` (raw) over `.p8.png`.
  - The new schema's `target.kind: file` / `path` field must either carry an extension RA won't claim, or the launcher layer must normalize the extension before invoking RetroArch.

### 8. Korri Product/Platform/Theme Architecture — First-Party Plugin File Layout

- **File**: `docs/solutions/architecture-patterns/korri-product-platform-theme-architecture-2026-06-03.md`
- **Problem Type**: `architecture_direction` (status: proposed)
- **Relevance**: Defines the target monorepo shape that the plugin/config refactor should align to, including exactly where first-party plugin code, Nix packages, and vendor lanes live.
- **Key Insight** (status is `proposed`, not yet `active` — verify current layout before assuming it has landed):
  - Target: `product/plugins/<id>/` for first-party plugin implementations. Plugin-owned Nix packages colocate under `product/plugins/<id>/packages/`.
  - `product/platform/protocol/` is the stable framework-neutral surface (schemas, wire types, RPC contracts, typed errors). This is the right place for plugin contribution point contracts.
  - `tools/` is developer-only automation — never delivered. Anything that ships to a device or user belongs in `product/apps/`, `product/services/`, or `product/systems/`.
  - Vendor/upstream code for a plugin lives with the plugin: `product/plugins/gamescope/packages/gamescope-korri/`.
  - Themes are autonomous and must not import `product/apps/*`, `product/services/*`, or plugin internals.
  - **Conflict check**: current tree uses `product/plugins/` already (as visible in the directory structure). Verify whether `korri/plugins/` alias still applies or whether `product/plugins/` is now canonical.

### 9. ProseQL Library YAML — Separate Payload Schema from Runtime Contract, Key-Derived IDs

- **File**: `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md`
- **Problem Type**: `best_practice`
- **Relevance**: The config-sketch's `library:` section persists as YAML. The lesson applies directly: the persisted shape should separate the payload from the runtime contract, and the YAML key is the ID — not duplicated inside the record.
- **Key Insight**:
  - Object-keyed YAML collections: the YAML key is the record ID. The payload schema should NOT duplicate `id:` inside the record body (noisy, error-prone).
  - `id: { kind: "derivedFromKey", field: "id" }` in ProseQL hydrates the ID at read time from the key.
  - Keep a distinct persistence payload schema separate from the runtime contract. The repository boundary is where payload records get decoded into domain contracts.
  - Snapshot import semantics for external sources (ROCKNIX, Steam catalog): import once, then Korri-owned storage is canonical. External sources are not a live read path.

---

## Active Parking-Lot Items Directly Touching This Refactor

Three deferred items are adjacent to the plugin/config schema work and should be consulted or parked against the big-bang plan:

| ID | Title | Why It Matters Here |
|----|-------|---------------------|
| `01KTRYCK5XYMCSVYD55P7XWBDY` | Define Korri config authoring write-target semantics | CLI/import/editor flows need a safe, explicit destination for creating or updating config. The new multi-root config model leaves this undefined. |
| `01KTTHJ7SPYEB5M1RTAT20RZ05` | Surface config-graph diagnostics and provenance in portal UI | Broken fragments now silently skip; diagnostics are the only signal. Record provenance is unexposed for slice D write-target routing. Absolute server paths currently leak in serialized events. |
| `01KTVX0FH3M3CVCQ8CCG53GV8S` | Sweep config paths for storage-template tokens | Config schema has repeated absolute mount paths. `{storage:<id>}`-style tokens would improve portability and avoid hardcoded paths across the config sketch's `storage:`, `launchers:`, and `runtimes:` sections. |

---

## Recommendations

### Plugin boundary
1. **Platform code must not name specific plugins by id** (`@korri:retroarch`, `@korri:gamescope`, etc.). The platform holds open maps (provider maps, `launch.with`, plugin registries) and decodes them generically. Plugin-specific validation, schema folding, and runtime protocol handling belong to the enabled plugin. Verify every generic platform file being touched in the big-bang for any hardcoded plugin ids.
2. **Each first-party plugin owns its contribution to the systems registry**, not the platform. System support mappings like `gba → retroarch + mgba` are plugin-contributed; the platform joins them. The config-sketch's `systems:` top-level is a user-facing additive registry — confirm the platform only validates shape, not the closed list of ids.

### Settings cascade
3. **Common normalized packs (`display`, `audio`, `saves`, `lifecycle`, `input`) are the right design** — they are cascade-mergeable across disparate launchers. However, every field in those packs must be a named, documented, explicitly-set field. No pack field should be inferred at compose time by inspecting argv, env, or on-disk launcher config files. Lean on `DEFAULT_*` floor values in the cascade and let authors override in YAML.
4. **`settings.plugin` is the correct seam for plugin-specific typed settings.** Do not add `settings.retroarch`, `settings.zquest`, etc. as first-class common pack names. The selected `plugin:` selects the schema for `settings.plugin`; only `overrides.config.append` remains as an escape hatch for unmodeled raw config.

### RetroArch Nix packaging
5. **Use `pkgs.symlinkJoin` + `environment.etc."korri/cores/<name>.so".source` for the `@korri:retroarch` plugin's Nix packaging.** Do not use `retroarch-bare.passthru.wrapper`. Keep `passthru.cores` and `passthru.unwrapped` on the composed package to preserve closure-shape assertions.
6. **Avoid passing `.p8.png` content directly to RetroArch.** The library import path for PICO-8 should normalize `.p8.png` carts to a `.p8` symlink or copy. Consider adding a schema-level warning (or validation rule) when a fake-08 launcher targets a `.png`-extension file.

### Zero-back-compat Nix migration
7. **New postures introduced by the big-bang (e.g., "launcher plugins declare runtime mode") belong as image-base defaults**, not as NixOS module defaults. The module's `lib.mkDefault` stays conservative for one-off consumers. Add or update image-level NixOS evaluation-time assertions at the same layer the option is deleted/replaced.
8. **Schema evolution after the big-bang ships must follow the additive-only rule**: required fields are forever, new fields default to optional, capability flags gate gated changes, mixed-version deployments must be tolerated during rollback windows.

### Config authoring gaps (from parking lot)
9. **The write-target semantics for the new multi-root config model are undefined** (`01KTRYCK5XYMCSVYD55P7XWBDY`). Before shipping authoring tools (CLI import, portal editor) that create or update config, define which root is written to and how the system refuses or warns when no writable target exists.
10. **Absolute storage paths in the config sketch's `launchers:` and `runtimes:` sections** (`/storage/saves/retroarch`, `/storage/bios`, `/etc/korri/cores/...`) are candidates for `{storage:<id>}`-style tokens (`01KTVX0FH3M3CVCQ8CCG53GV8S`). Surface this as a design question before the schema is locked: are these paths intentionally absolute, or should they resolve through the storage root registry?
