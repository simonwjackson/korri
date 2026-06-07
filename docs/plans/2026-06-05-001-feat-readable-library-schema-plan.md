---
title: feat: Big-bang readable library schema realignment
type: feat
status: active
date: 2026-06-05
verify_command: "just test-unit && just typecheck && just lint"
---

# feat: Big-bang readable library schema realignment

## Summary

Replace Korri's current library/config contract with the readable YAML schema as the canonical ProseQL-backed application contract. This is a big-bang switch: delete the old `games` / `launchers` / `modules` / `config.global` vocabulary, realign platform library records, repository APIs, launch resolution, source handling, importers/scanners, app callers, tests, and minimal UI flows around `host`, `storage`, `sources`, `systems`, `apps`, `runtimes`, `profiles`, `collections`, `users`, and `library`.

---

## Problem Frame

The existing ProseQL shape is human-readable in the narrow key-derived-id sense, but its domain language still exposes old runtime implementation concepts: `games`, `launchers`, `modules`, a singleton `config.global`, single `contentPath` launch identity, and camelCase placeholder values. The desired shape is not a friendly import format for that old runtime; it is the new application model.

The implementation must make the readable schema the real saved library format and the real runtime contract for list, launch, source discovery, and user-facing library behavior.

---

## Requirements

- R1. Big-bang replace the old library schema; no compatibility layer for old canonical collections.
- R2. Use the new canonical ProseQL sections: `host`, `storage`, `sources`, `systems`, `apps`, `runtimes`, `profiles`, `collections`, `users`, and `library`.
- R3. Use `library` as the saved playable/package surface; non-playable-only discoveries stay in source/search results until saved with at least one launchable release.
- R4. A top-level library item is playable by default unless it has `contains`; `contains` makes the package container-only by default.
- R5. `contains` keys are local to the package. Global playable references use path-style ids such as `super-mario-advance-2/super-mario-world`.
- R6. All references use the same playable-id format: launch calls, `version-of`, favorites, hidden entries, and collection items.
- R7. Use `version-of` plus optional `relation` for same-game/port/edition/variant relationships.
- R8. Every library item/package uses an ordered `releases` list, even for one release.
- R9. Release order is preserved for UI display, but launch selection is explicit when needed.
- R10. A single launchable release may be launched without naming a release; multiple launchable releases require a selected release and ambiguous launch is rejected.
- R11. Releases without `target` are allowed as known-only metadata releases, but a saved library item/package must have at least one release with `target`.
- R12. `target` is the concrete locator Korri can try to launch or resolve. Service targets should be full URIs when the service has a URI scheme, e.g. `steam://rungameid/360740`.
- R13. File-backed targets are relative to the source storage root; absolute file targets are rejected for `files` sources.
- R14. Release `system` is required. Release `target`, `app`, and `runtime` are optional for known-only releases; launch requires enough resolved launch data.
- R15. `source` is inheritable from library item/package to releases.
- R16. `app` replaces `launcher` in schema vocabulary.
- R17. `runtime` replaces `module` in schema vocabulary.
- R18. App templates use readable placeholders such as `{target}`, `{content.path}`, and `{runtime.path}`; old placeholders such as `{contentPath}`, `{modulePath}`, and `{settings.appid}` are removed.
- R19. Resolved launch templates receive resolved values; app templates do not know how `storage` or `sources` work.
- R20. Keep the large cascade as a vital design feature, renamed into the new vocabulary.
- R21. Profiles are cascade level 10: selected named modes applied after release resolution and before one-off UI overrides. Profiles are not under `host`.
- R22. `host` is a single plain block for this machine, not a keyed record map and not a multi-host inventory.
- R23. `sources.kind` is always an array with fixed v1 values: `service`, `files`, `metadata`.
- R24. `sources` identify user-meaningful origins/provenance, not implementation plugins such as scanners or Bazzar internals.
- R25. `storage` describes local roots/paths only and does not have `provider`.
- R26. Only `files` sources require `storage`; `service` sources may optionally name storage for local install/discovery.
- R27. `metadata` can combine with `service` or `files` and can also stand alone.
- R28. Evidence stays next to the claim it supports, e.g. display evidence under `display.sources`.
- R29. Display shorthand is preserved: missing `resolution` means unknown; `unrestricted` means any; arrays encode known aspect ratios or resolution modes.
- R30. Realign the entire application: platform library, API/RPC contracts, UI callers, importers/scanners, fixtures, and tests must compile and operate against the new schema.

---

## Scope Boundaries

- Do not build a polished release-picker UX in this plan. The app must remain functional, but minimal UI affordances are acceptable.
- Do not keep old `games`, `launchers`, `modules`, or `config.global` as supported persisted input.
- Do not introduce a hidden normalized ProseQL format behind the readable YAML. Derived runtime views are allowed in memory, but users edit the canonical readable shape.
- Do not place implementation plugins/scanners in `sources` unless a config file is specifically configuring that implementation. Library `sources` describe origins such as Steam, local ROMs, PCGamingWiki, and curator pages.
- Do not model multi-host inventory in this local config.
- Do not add roleful multi-target objects in v1. Keep `target: string | string[]`; add roles only when a concrete launcher/source requires them.
- Do not store manual observation as a source kind or a `manual` source in v1.
- Do not expand into full source discovery/search UX polish; include only the contract seams required for transient candidates and saved library entries.

### Deferred Follow-Up Work

- Polished release chooser UI.
- Full migration tooling from old libraries after the big-bang schema lands.
- External metadata refresh/cache sidecars for large provider data.
- Advanced install/download policy UI for source candidates.
- Roleful multi-file release targets when a concrete launcher needs them.

---

## Key Decisions From Challenge Pass

- The readable schema is the canonical ProseQL shape, not an authoring layer compiled into the old runtime shape.
- There is no backwards compatibility target for old persisted library records.
- `host` stays a singleton block.
- `profiles` are applied near the end of launch resolution, just before UI override, and are not stored under `host`.
- Release choice is a UI concern. The launch layer rejects ambiguous multi-launchable-release launches unless a release is selected.
- `releases` is an ordered list, not a keyed map.
- `contains` keys are local to the package; global playable identity uses path-style ids.
- Packages with `contains` are container-only by default.
- `collections` is plural on library items and contained playables.
- Every item/package has `releases`; no shortcut top-level `system` / `target` / `app` / `runtime` shape.
- Package releases apply to contained playables.
- `target` is optional in schema but required to launch. Missing `target` means known-only/unlaunchable release metadata.
- Service targets should use full URI schemes where available.
- File targets are relative and absolute file targets are rejected.
- `app`, not `launcher`, is the schema term.
- Source kind vocabulary is exactly `service`, `files`, `metadata`, always as an array.
- `storage.provider` is removed.
- Evidence stays next to the claim it supports.
- The plan includes full application realignment, not just platform library internals.

---

## Proposed Canonical Shape

Directional example shape for the contract; the implementation should keep `korri-catalog-display-metadata.example.yaml` as the readable fixture and update it to match these decisions.

```yaml
host:
  id: aka
  title: AKA desktop host
  gamescope:
    enabled: true
    backend: wayland

profiles:
  handheld:
    title: Handheld 640x480
    gamescope:
      args: ["-W", "640", "-H", "480"]

storage:
  steam:
    root: /home/simon/.local/share/Steam
    path:
      apps: steamapps
      compat: steamapps/compatdata

  roms:
    root: /games

sources:
  steam:
    title: Steam
    kind: [service, metadata]
    storage: steam

  roms:
    title: Local ROM library
    kind: [files]
    storage: roms

  pcgamingwiki:
    title: PCGamingWiki
    kind: [metadata]

apps:
  steam:
    command: steam
    args: ["{target}"]
    systems: [windows, linux]

  executable:
    command: "{content.path}"
    args: []
    systems: [windows, linux]

  retroarch:
    command: retroarch
    args: ["-L", "{runtime.path}", "{content.path}"]
    systems: [genesis, nes, snes, gba]

library:
  downwell:
    title: Downwell
    source: steam
    collections: [steam, handheld]

    releases:
      - id: windows
        system: windows
        target: steam://rungameid/360740
        app: steam
        display:
          aspect: [1.333333]
          sources:
            steam-4x3: supported

  sonic-the-hedgehog:
    title: Sonic the Hedgehog
    collections: [sonic, handheld]

    releases:
      - id: genesis
        source: roms
        system: genesis
        target: genesis/Sonic The Hedgehog.md
        app: retroarch
        runtime: genesis-plus-gx

      - id: windows-known
        source: pcgamingwiki
        system: windows
        display:
          aspect: unrestricted
          sources:
            pcgamingwiki: inferred
```

---

## Cascade Model

The large cascade remains first-class. The new vocabulary should replace old launch/module naming while preserving inheritance power.

Least-specific to most-specific:

1. **host** — Machine-wide defaults and local runtime policy.
2. **user** — Player preferences and per-user library view/state.
3. **system** — Platform defaults such as display behavior and common launch expectations.
4. **source** — Origin/storage/service defaults.
5. **app** — Executable adapter defaults and command template policy.
6. **runtime** — Runtime/core/tool defaults such as libretro cores or Proton.
7. **library item** — Shared game/package defaults across releases.
8. **contained playable** — Specific playable inside a package/cart/app.
9. **release** — Concrete release defaults and launch locator when available.
10. **profile** — Selected named mode, applied intentionally after normal resolution.
11. **UI override** — Final one-off launch choice from the UI.

Rules:

- `system` is required on each release.
- `target` is not inheritable; if present it belongs to a release.
- `source` is inheritable from library item/package to releases.
- `app` is inheritable but commonly set at release/source/app layers.
- `runtime` is optional and inheritable.
- Launch resolution must explain which layer supplied each major launch value in diagnostics or testable debug output.

---

## Implementation Units

### U1. Replace ProseQL schema with readable canonical collections

**Goal:** Big-bang the persisted library database configuration to the new sections and remove old persisted collections.

**Requirements:** R1, R2, R16, R17, R22, R23, R24, R25, R26, R27

**Dependencies:** None

**Files:**
- Modify: `product/platform/library/proseql/library-db.ts`
- Delete/replace record schemas under: `product/platform/library/config/records/*`
- Create: `product/platform/library/config/records/host.ts`
- Create: `product/platform/library/config/records/storage.ts`
- Create: `product/platform/library/config/records/source.ts`
- Create: `product/platform/library/config/records/runtime.ts`
- Create: `product/platform/library/config/records/library-item.ts`
- Create/modify tests near: `product/platform/library/proseql/library-db.test.ts`

**Approach:**
- Replace old collections with `host`, `storage`, `sources`, `systems`, `apps`, `runtimes`, `profiles`, `collections`, `users`, and `library`.
- Support `host` as a singleton plain block, not a keyed map.
- Keep map-keyed records for peer sections.
- Remove persisted old aliases: `games`, `launchers`, `modules`, `config`.
- Keep strict decode posture so typo keys fail loudly.
- Model `source.kind` as a required array with fixed values: `service`, `files`, `metadata`.
- Reject `storage.provider`.

**Test scenarios:**
- Happy path: decode a root with the new canonical sections.
- Error path: old top-level `games`, `launchers`, `modules`, or `config` are rejected or ignored only if impossible to see; prefer rejection.
- Error path: `host` as a keyed map fails.
- Error path: `source.kind: store`, `observation`, scalar string, or unknown kind fails.
- Error path: `storage.provider` fails.

**Verification:**
- ProseQL opens a new-style library root and refuses old-style persisted records.

---

### U2. Define library item, contained playable, and release records

**Goal:** Make the saved `library` section expressive enough for packages, contained playables, multiple releases, known-only releases, and unified references.

**Requirements:** R3, R4, R5, R6, R7, R8, R9, R10, R11, R14, R15

**Dependencies:** U1

**Files:**
- Create/modify: `product/platform/library/config/records/library-item.ts`
- Create: `product/platform/library/config/playable-id.ts`
- Create: `product/platform/library/config/playable-id.test.ts`
- Create/modify: `product/platform/library/config/records/library-item.test.ts`

**Approach:**
- Model `releases` as an ordered array with required `id` and required `system`.
- Allow release `target`, `app`, and `runtime` to be omitted for known-only releases.
- Require every saved library item/package to have at least one release with `target`.
- Reject top-level release shortcut fields (`system`, `target`, `app`, `runtime`) outside `releases`.
- Model `contains` as local ids under the package.
- Derive global playable ids:
  - top-level playable: `<item-id>`
  - contained playable: `<package-id>/<contained-id>`
- Validate user/library references with the same playable-id format.
- Use `collections`, not `collection`.

**Test scenarios:**
- Happy path: single playable with one release.
- Happy path: multi-release playable with ordered releases.
- Happy path: package with `contains` derives contained playable ids and is container-only by default.
- Happy path: known-only release without target is accepted when another launchable release exists.
- Error path: item with no launchable release fails.
- Error path: `collection` singular fails.
- Error path: contained ids that escape path syntax fail.
- Error path: top-level `target` fails.

**Verification:**
- Schema tests lock the new library item/playable identity semantics before runtime integration.

---

### U3. Rebuild cascade resolver with new vocabulary

**Goal:** Preserve the large cascade design while replacing old `launcher`/`module`/`contentPath` assumptions.

**Requirements:** R15, R16, R17, R18, R19, R20, R21

**Dependencies:** U1, U2

**Files:**
- Replace/modify: `product/platform/library/config/cascade-resolver.ts`
- Replace/modify: `product/platform/library/config/resolved-launch-context.ts`
- Replace/modify: `product/platform/library/config/inheritable-fields.ts`
- Replace/modify: `product/platform/library/config/launch-block.ts`
- Create/modify: `product/platform/library/config/cascade-resolver.test.ts`

**Approach:**
- Rename cascade concepts to `app` and `runtime`.
- Add cascade support for `host → user → system → source → app → runtime → library item → contained playable → release → profile → UI override`.
- Keep `target` non-inheritable and release-scoped.
- Resolve `source`, `app`, and `runtime` through inheritance.
- Treat `profile` as a named manual override layer applied near the end.
- Produce a resolved launch context with readable fields:
  - `target`
  - `content.path` for file-resolved content
  - `runtime.path`
  - `app.id`
  - selected playable id and release id
- Provide diagnostics for ambiguous/missing launch values.

**Test scenarios:**
- Happy path: source inherited from library item to release.
- Happy path: app inherited from source/app defaults when not set directly on release.
- Happy path: runtime inherited when selected upstream.
- Happy path: selected profile overrides normal cascade but UI override wins over profile.
- Error path: release without target cannot launch.
- Error path: multiple launchable releases without selected release fails as ambiguous.
- Error path: multiple releases with one launchable and one known-only are not ambiguous for launchable resolution only if the API explicitly allows omitted release for a single launchable release.

**Verification:**
- Cascade tests prove the new level order and override behavior.

---

### U4. Replace launch template composition and source-target resolution

**Goal:** Compose launch specs using the new placeholder vocabulary and resolved values.

**Requirements:** R12, R13, R16, R17, R18, R19, R23, R26

**Dependencies:** U1, U2, U3

**Files:**
- Replace/modify: `product/platform/library/config/compose-launch-spec.ts`
- Replace/modify: `product/platform/library/config/app-integrations.ts`
- Create: `product/platform/library/config/source-target-resolution.ts`
- Create: `product/platform/library/config/source-target-resolution.test.ts`
- Create/modify: `product/platform/library/config/compose-launch-spec.test.ts`

**Approach:**
- Remove old placeholder support unless kept only as an explicit failing diagnostic.
- Support `{target}`, `{content.path}`, `{runtime.path}` and other dotted readable fields required by app templates.
- For `files` sources, resolve relative `target` against `sources.<id>.storage` → `storage.<id>.root` to produce `content.path`.
- Reject absolute targets for `files` sources.
- For `service` sources, pass full URI `target` to templates; do not require storage.
- Keep `executable` as the generic file-backed app with `command: "{content.path}"`.
- Keep `steam` as an app whose args can be `['{target}']`.

**Test scenarios:**
- Happy path: Steam URI target composes to `steam steam://rungameid/360740`.
- Happy path: ROM target resolves to absolute `content.path` and RetroArch receives runtime path.
- Happy path: generic executable uses resolved `content.path` as command.
- Error path: `{contentPath}`, `{modulePath}`, `{settings.appid}` fail.
- Error path: files source without storage fails.
- Error path: files source absolute target fails.
- Error path: metadata-only source with target cannot resolve launch unless another launch-capable source kind is present.

**Verification:**
- Unit tests cover source resolution and placeholder substitution without old vocabulary.

---

### U5. Realign repository and public library service/API contracts

**Goal:** Expose list and launch behavior around library items, playable ids, releases, and release-aware launch.

**Requirements:** R3, R5, R6, R9, R10, R11, R30

**Dependencies:** U1, U2, U3, U4

**Files:**
- Replace/modify: `product/platform/library/proseql/library-repository.ts`
- Replace/modify: `product/platform/library/library-source.ts`
- Replace/modify: `product/platform/library/library-services.ts`
- Replace/modify: `product/platform/library/library-source-layer-live.ts`
- Replace/modify API/RPC files under `product/platform/api` or app-specific library RPCs discovered during implementation
- Create/modify repository/service tests

**Approach:**
- Replace `listGames()` with a new list contract that returns playable entries derived from `library`, including contained playable ids.
- Replace `resolveLaunchForGame(gameId)` with release-aware launch inputs, e.g. playable id plus optional release id.
- Allow omitted release id only when exactly one launchable release exists for that playable.
- Reject omitted release id when multiple launchable releases exist.
- Reject launch of known-only release without `target`.
- Include release order and launchability in list output so UI can render choices.
- Keep known-only releases visible as metadata on saved items but not launchable.

**Test scenarios:**
- Happy path: `downwell` lists one launchable release and launches without release id.
- Happy path: `sonic-the-hedgehog` lists ordered Genesis + known/Steam releases.
- Happy path: `sonic-the-hedgehog` launches only when release id is supplied if multiple launchable releases exist.
- Happy path: `super-mario-advance-2/super-mario-world` resolves package release and contained playable identity.
- Error path: `launch sonic-the-hedgehog` with multiple launchable releases fails as ambiguous.
- Error path: launching known-only release fails clearly.

**Verification:**
- Repository/service tests exercise real temp ProseQL YAML roots using the new canonical schema.

---

### U6. Realign UI and app callers around playable ids and releases

**Goal:** Keep the app operational after the schema/API switch.

**Requirements:** R6, R9, R10, R30

**Dependencies:** U5

**Files:**
- Modify affected React atoms/components discovered by grep, including likely files under:
  - `product/platform/react/library/*`
  - `product/apps/portal/*`
  - `product/themes/*`
  - `product/platform/library/launch-state.ts`
- Update tests for affected UI/state seams

**Approach:**
- Replace `GameRecord` UI assumptions with new playable entry/list contract.
- Show top-level and contained playable entries with stable playable ids.
- Preserve release order in the UI data model.
- Minimal release selection behavior:
  - single launchable release: Play works directly.
  - multiple launchable releases: require choosing a release before Play.
  - known-only releases: visible as unavailable/metadata if shown, not selectable for launch.
- Keep release-picker design simple; defer polish.

**Test scenarios:**
- UI/state can start a single-release playable.
- UI/state refuses or prompts for multi-release playable without selected release.
- Contained playable id can be passed through launch state.
- Known-only release cannot be launched from UI state.

**Verification:**
- Unit/component tests as available plus `just typecheck` prove callers are realigned.

---

### U7. Realign importers, scanners, and transient source candidates

**Goal:** Make discovery/scanning speak the same release shape as saved library entries without leaking plugin implementation names into config.

**Requirements:** R12, R13, R23, R24, R30

**Dependencies:** U2, U4, U5

**Files:**
- Modify importers under `tools/importers/*`
- Modify source/discovery code under `product/platform/acquisition`, `product/platform/library`, or Bazzar-related areas discovered during implementation
- Create/modify importer/source tests

**Approach:**
- Source plugins/scanners produce transient candidates shaped like library releases/playable entries.
- Transient candidates can be launched directly if they have a launchable `target` and resolvable `source`/`app`/`runtime`.
- Transient candidates can be saved into `library` later without changing shape.
- Do not write plugin names such as Bazzar into `sources` unless configuring that implementation itself.
- ROCKNIX/ROM imports should write `sources`/`storage`/`library` entries using `files` sources and relative targets.
- Steam imports/discovery should write service URI targets when persisted.

**Test scenarios:**
- Importer creates `library` records with ordered `releases` and `app`, not old `games` records.
- File importer targets are relative.
- Service candidates use URI targets.
- Metadata-only candidates can be represented but cannot be saved as library-only entries without at least one launchable release.

**Verification:**
- Importer tests pass with the new schema and no old collection writes remain.

---

### U8. Update canonical example fixture and contract tests

**Goal:** Make `korri-catalog-display-metadata.example.yaml` executable as the schema contract.

**Requirements:** R1–R30

**Dependencies:** U1–U7

**Files:**
- Modify: `korri-catalog-display-metadata.example.yaml`
- Create/modify: `product/platform/library/config/authoring/examples.test.ts` or equivalent schema fixture test
- Remove/update old game fixture tests under `product/platform/fixtures/games/*` as needed

**Approach:**
- Update example to the final schema:
  - `profiles` top-level or agreed storage location, not `host.profiles`.
  - `kind` arrays.
  - no `storage.provider`.
  - `collections` plural.
  - ordered `releases` lists.
  - `app`, not `launcher`.
  - Steam URI targets.
  - new placeholders in `apps`.
  - at least one known-only release without `target`.
- Treat the example as a real fixture: parse, decode, list derived playables, resolve representative launches, and assert rejection paths.
- Keep comments short and readable; dense edge cases belong in smaller test fixtures.

**Test scenarios:**
- Example decodes.
- Example list output includes top-level and contained playable ids.
- Example preserves release order.
- Example launches Downwell/Steam URI and Sonic/Genesis ROM release.
- Example rejects ambiguous multi-launchable release launch.
- Example rejects known-only release launch.
- Example contains no old vocabulary: `launcher`, `modules`, `games`, `config.global`, `provider`, `settings.appid`, `contentPath`, `modulePath`.

**Verification:**
- Fixture tests make the example both readable documentation and executable contract.

---

### U9. Remove old vocabulary from code, tests, and docs references touched by implementation

**Goal:** Finish the big-bang realignment by deleting old names and stale tests so future contributors do not reintroduce the old model.

**Requirements:** R1, R16, R17, R18, R30

**Dependencies:** U1–U8

**Files:**
- Grep-driven cleanup across `product/`, `tools/`, and tests
- Update docs only where touched/necessary; do not create broad new docs unless explicitly requested

**Approach:**
- Remove or rename old symbols where they represent persisted schema concepts:
  - `GameRecord` → playable/library entry-oriented names
  - `LauncherRecord` → app
  - `ModuleRecord` → runtime
  - `contentPath` → resolved `content.path`
- Keep words like “launch” only for behavior/launch specs, not as a persisted schema key replacing `app`.
- Update tests to assert new names and failure modes.

**Verification:**
- `rg` checks for forbidden persisted-schema vocabulary in schema/example areas.
- Full validation passes.

---

## System-Wide Impact

- **Persistence:** The saved library root changes shape. Existing old-style roots are not supported by this plan.
- **Runtime model:** Launch resolution becomes playable/release-aware instead of game/contentPath-only.
- **API contracts:** List and launch APIs must carry playable ids, release ids, release order, launchability, and known-only release metadata.
- **UI behavior:** Play is direct for one launchable release, requires selection for multiple launchable releases, and rejects known-only releases.
- **Import/discovery:** Importers and source candidates speak the same release shape as saved library entries.
- **Error handling:** Errors should name authored paths and domain concepts: missing target, ambiguous release, unknown source, files source without storage, absolute files target, unknown app/runtime.
- **Docs/fixtures:** The example file becomes the executable contract.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Big-bang churn breaks many callers at once | Sequence through schema → cascade/launch → repository/API → UI/importers; keep each unit testable and run typecheck after API changes. |
| Release-aware launch spreads ambiguous semantics | Centralize playable id and release selection rules in repository/service tests. |
| Profiles become fuzzy again | Treat profile as level 10 only; do not store under `host`; test profile order against UI override. |
| Source kinds drift into plugin capabilities | Keep fixed origin vocabulary only: `service`, `files`, `metadata`; do not write scanner/plugin names into `sources`. |
| Known-only releases look launchable | Missing `target` must be accepted by schema but rejected by launch; list output should carry launchability. |
| Service URI targets and file targets get conflated | Source-target resolver owns source-kind-specific validation. |
| Old vocabulary lingers in examples/tests | Add fixture assertions or grep-style tests for forbidden schema vocabulary in the example and schema records. |

---

## Verification Plan

Primary command:

```bash
just test-unit && just typecheck && just lint
```

Targeted checks during implementation:

```bash
bun test product/platform/library/config/records/*.test.ts
bun test product/platform/library/config/*resolver*.test.ts
bun test product/platform/library/proseql/*.test.ts
bun test product/platform/library/*.test.ts
```

Additional grep checks after migration:

```bash
rg "\blauncher\b|\bmodules\b|\bcontentPath\b|\bmodulePath\b|settings\.appid|config\.global|provider:" korri-catalog-display-metadata.example.yaml product/platform/library product/platform/fixtures tools/importers
```

The grep is not a blanket ban on the English word “launch”; it is a guard against old persisted schema terms remaining in schema/example/importer code.

---

## Sources & References

- Schema sketch: `korri-catalog-display-metadata.example.yaml`
- Current ProseQL database config to replace: `product/platform/library/proseql/library-db.ts`
- Current old game payload schema to replace: `product/platform/library/config/records/game.ts`
- Current old app/launcher/runtime/module records to realign: `product/platform/library/config/records/app.ts`, `product/platform/library/config/records/launcher.ts`, `product/platform/library/config/records/module.ts`
- Current cascade resolver to preserve conceptually but rename structurally: `product/platform/library/config/cascade-resolver.ts`
- Current repository seam to replace contractually: `product/platform/library/proseql/library-repository.ts`
- Existing key-derived ProseQL guidance: `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md`
