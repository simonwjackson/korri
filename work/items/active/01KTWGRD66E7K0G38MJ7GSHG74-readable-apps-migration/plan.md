---
title: "refactor: Migrate readable library launch selection to apps[] app choices"
type: refactor
status: active
date: 2026-06-11
origin: work/items/active/01KTWGRD66E7K0G38MJ7GSHG74-readable-apps-migration/item.md
verify_command: "bun test product/platform/library/config product/platform/library/proseql product/apps/portal/api/library && just typecheck && just lint"
---

# refactor: Migrate readable library launch selection to apps[] app choices

## Summary

Replace the single scalar `release.app`/`release.runtime` launch selection in the readable
library with an `apps[]` **app-choice** grammar (id-reference) on both `systems.<id>` and
`releases[]`, resolved by overlay-and-select in the readable cascade. Land it additive-first so
every commit stays green: introduce `apps[]`, switch the cascade to prefer it (legacy scalar
fallback retained mid-flight), thread an `appId` selector through the repository/API, migrate
fixtures and examples, then take the clean break — remove and reject the legacy fields, drop the
fallback, and delete the dead `resolveLaunchContext` cascade. This is the non-Steam prerequisite
for Steam v1 (`01KTWFJXDKS8VYWPV94QTWCBEH`), which then only adds `kind: steam` on top of the
migrated grammar.

---

## Problem Frame

The readable library binds each launchable release to one folded scalar `app`/`runtime`, resolved
by last-wins across host → user → system (`launch.app`/`launcher`/`launch.module`) → source
(`source.app`/`source.runtime`) → release (`release.app`/`release.runtime`) → profile → override.
That model cannot express "this release offers more than one runnable app choice", makes
app-specific configuration leak loosely onto a release, and gives Steam v1 nowhere clean to attach
per-game launch behavior. Steam v1 wants `apps[]` to already exist so it only adds a `steam` kind.
Migrating the generic grammar first lets Steam land as a clean schema extension rather than a
transitional normalization layer.

---

## Requirements

- R1. Add a generic `AppChoice` schema: references a top-level `apps.<id>` by `id`; `kind` is forbidden on a choice; carries optional `inherit`, optional `runtime`, and the existing inheritable policy fields.
- R2. Add `apps?: AppChoice[]` to both `SystemPayload` and `LibraryReleasePayload`.
- R3. Resolve a release's effective app choices by overlaying `release.apps[]` onto `systems.<system>.apps[]` by `id`, with scoped `inherit: false` resetting the inherited contribution for a matching id while preserving the top-level `apps.<id>` definition.
- R4. Select one app choice: auto-select when exactly one resolves; require an explicit `appId` when more than one resolves; fail with an ambiguity error listing available ids; fail clearly on unknown `appId` or an `id` with no matching top-level `apps.<id>`.
- R5. Derive the resolved `app`/`runtime` from the selected choice (`runtime` = choice override → top-level app default), feeding the existing `ReadableResolvedLaunchContext` without changing downstream rendering/materialization.
- R6. Expose `appId` selection through repository and portal launch inputs; surface available app-choice ids in ambiguity errors; expose `apps[]` in the read-model release entry.
- R7. Remove `release.app`, `release.runtime`, `system.launch`, and `system.launcher`; reject all four at decode time with clear diagnostics.
- R8. Delete the dead legacy `resolveLaunchContext` cascade and any helpers it exclusively owns, while preserving the live `resolveLocalLauncherPolicy` / `resolveLocalLauncherGamescopePolicy` / `enumerateApplicablePresets` and the shared `fold*` / `mergeGamescope*` policy-merge primitives the readable path depends on.
- R9. Migrate tracked fixtures, tests, and example configs (`ryubing-full.korri.yaml`, brainstorm `*.example.yaml`, the Steam brainstorm example) to the `apps[]` grammar.
- R10. Cover schema decode/reject, overlay+selection, repository/API dispatch, and fixture decoding with focused unit tests; keep Nix-owned contracts out of scope.

**Origin item:** `work/items/active/01KTWGRD66E7K0G38MJ7GSHG74-readable-apps-migration/item.md`

---

## Scope Boundaries

- No `kind: steam`, Steam materializer, VDF lifecycle, `launch-options`, or runtime `title`/`tool` — those belong to Steam v1 (`01KTWFJXDKS8VYWPV94QTWCBEH`).
- No `apps[]` on `source`, `user`, `profile`, or `global`; app selection in the readable path comes only from `system.apps[]` + `release.apps[]`. (`user`/`game`/`global`/`preset` keep `launch`/`launcher` for the live `resolveLocalLauncherPolicy` and preset machinery.)
- No profile-level singular `app` override (`01KTWNSW2HD32CV1X2ZJ3M4WE3`).
- No source/provenance modeling changes (`01KTWPQN3M0TED877M2ESWK4D2`).
- No new app-choice picker UI; v1 only needs `appId` selection and clear ambiguity errors.
- No new `extra-args` app-choice field; variant-specific args use the existing inheritable `argsAppend`. A dedicated app-choice `extra` is deferred to the app-kind work.
- No changes to the legacy `GameRecord` model, `db.games`, the rocknix importer's game/launch-block output, or the live moonlight launch-policy path beyond what deleting `resolveLaunchContext` mechanically requires.

### Deferred to Follow-Up Work

- Steam `kind: steam` adapter and everything in `01KTWFJXDKS8VYWPV94QTWCBEH` (builds on this migration's grammar).
- Whether the now-orphaned legacy `GameRecord` launch path (`db.games`, rocknix importer game output) should be retired: separate cleanup, out of scope here.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/config/records/library-item.ts` — release schema; owns `release.app`/`release.runtime` today; gains `apps[]`.
- `product/platform/library/config/records/system.ts` — system schema; owns `launch` (`LaunchBlock`)/`launcher`/`cores`; gains `apps[]`, loses `launch`/`launcher`.
- `product/platform/library/config/records/app.ts` — `AppKind`, kind-specific flat-field guards (`RYUBING_APP_FIELD_KEYS`, `isTypedAppPayload`); pattern for strict per-kind validation.
- `product/platform/library/config/inheritable-fields.ts` — `InheritableLayer` field whitelist and `inherit` truncation semantics to mirror for `AppChoice` and overlay reset.
- `product/platform/library/config/playable-id.ts` — `selectLaunchableRelease` + `ReleaseSelectionResult` tagged union; mirror this exact shape for `selectAppChoice`.
- `product/platform/library/config/cascade-resolver.ts` — `resolveReadableLaunchContext` (readable path, lines ~1813+), `ReadableLayerView`, `readableViewOf*`, `mergeReadableLayers`; legacy `resolveLaunchContext` (~1282) to delete; `resolveLocalLauncherPolicy`/`enumerateApplicablePresets` (live, keep); shared `foldGamescope`/`foldMoonlight`/`foldRetroArch`/`foldRyubing`/`mergeGamescope*` (keep).
- `product/platform/library/config/resolved-launch-context.ts` — `ReadableResolvedLaunchContext` (carries resolved `app: AppRecord`, optional `runtime`); selection must populate the same shape.
- `product/platform/library/config/errors.ts` — `Data.TaggedError` style; `AppNotFound`, `LauncherUnresolvable`, `AmbiguousRelease` (mirror for an app-choice ambiguity error).
- `product/platform/library/proseql/library-repository.ts` — `toPlayableReleaseEntry` (reads `release.app`/`release.runtime`, ~880), readable launch resolution/dispatch (~290–390), launch inputs.
- `product/apps/portal/api/library/launch.rpc.ts` / `launch.rpc-handler.ts` — `LaunchLibraryPayload` (`releaseId`/`userId`/`profileId`/`override`); add `appId`.
- Fixtures: `product/platform/library/config/fixtures/ryubing-full.korri.yaml`; examples under `docs/brainstorms/*.example.yaml` and `docs/brainstorms/2026-06-11-001-steam-readable-library-example.korri.yaml`.

### Institutional Learnings

- `work/items/active/01KTWFJXDKS8VYWPV94QTWCBEH-steam-readable-apps-v1/plan.md` — downstream Steam plan; this migration owns the generic grammar so Steam U1 only adds `kind: steam`. R2 there (id-reference, `kind` forbidden on a choice) is the grammar this plan implements.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md` — launch behavior should come from explicit cascade-folded policy, not incidental signal sniffing; keeps app selection explicit by id.

### External References

- None; this is an internal schema/cascade refactor with strong local patterns.

---

## Key Technical Decisions

- **App choices are id-references, not kind-inline.** `apps: [{ id: "retroarch", runtime: "mgba" }]`; the discriminating `kind` lives only on top-level `apps.<id>`. Chosen over the stale brainstorm's inline-`kind` shape because by-id overlay/`inherit:false` is well-defined and matches the existing top-level `apps`/`runtimes` registries. (Settled with the user.)
- **`apps[]` on systems and releases.** Replaces the scalar app/runtime selection in the readable path; source/user/profile no longer select the app. (Settled with the user.)
- **Remove `system.launch`/`launcher`.** System app selection comes from `system.apps[]`; `cores` is retained (still consumed by the legacy `core` resolution and importer). (Settled with the user.)
- **Delete the dead `resolveLaunchContext` cascade.** It has no production caller (tests only). Keep the live `resolveLocalLauncherPolicy` family and all shared `fold*`/`mergeGamescope*` primitives `mergeReadableLayers` depends on. (Settled with the user.)
- **Additive-first sequencing.** Introduce `apps[]` and switch the cascade to prefer it with a legacy scalar fallback before any field removal, so each commit compiles and passes; the removal + legacy deletion is the final clean-break slice.
- **Reuse `InheritableLayer` field whitelist for `AppChoice`** rather than inventing a parallel field set; `inherit:false` on a choice reuses the existing truncation semantics for the overlay reset.
- **Mirror `selectLaunchableRelease`** (`ReleaseSelectionResult` tagged union) for `selectAppChoice`, so selection/ambiguity is a pure, unit-tested adapter consistent with release selection.

---

## Open Questions

### Resolved During Planning

- Grammar: id-reference (`kind` forbidden on a choice). Resolved with the user.
- Scope: `apps[]` on systems + releases; remove `system.launch`/`launcher`; delete dead `resolveLaunchContext`. Resolved with the user.
- App-choice fields: `id`, optional `inherit`, optional `runtime`, plus existing inheritable policy fields. No `launch-options`/`extra` (Steam/app-kind scope).
- Only the rocknix importer references launch blocks outside cascade/repository, and it targets the legacy `GameRecord` (untouched), not readable releases.

### Deferred to Implementation

- Exact set of cascade-resolver helpers that become unreferenced after deleting `resolveLaunchContext` — determined at implementation time via typecheck + `fallow dead-code`, keeping anything still referenced by `resolveLocalLauncherPolicy`/`enumerateApplicablePresets`/readable path.
- Exact merge precedence wiring for the by-id overlay relative to existing inheritable-field folding — validated by cascade tests.
- Final helper/selector names (`AppChoice`, `selectAppChoice`, `resolveEffectiveAppChoices`, ambiguity error tag) — directional in this plan.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
  Sys[systems.<id>.apps] --> Overlay[overlay by id]
  Rel[releases[].apps] --> Overlay
  Overlay --> Select[selectAppChoice appId]
  Select -->|one / matched| Choice[selected AppChoice]
  Select -->|>1 no appId| Ambig[AmbiguousAppChoice ids]
  Select -->|unknown id| Fail[AppChoiceNotFound]
  Choice --> Resolve[id -> apps.<id> kind; runtime = choice ?? app default]
  Resolve --> Ctx[ReadableResolvedLaunchContext app + runtime]
  Ctx --> Dispatch[repository typed materializer dispatch unchanged]
```

App-choice resolution matrix:

| Effective choices (system⊕release by id) | `appId` input | Outcome |
|---|---|---|
| none, no target | any | metadata-only: not launchable (unchanged) |
| none, has target, legacy scalar present (pre-U5) | any | legacy scalar fallback resolves app |
| none, has target, no legacy scalar (post-U5) | any | fail: no resolvable app choice |
| one (system or release) | absent | auto-select the single choice |
| many | matching `appId` | select the matching choice |
| many | absent | fail: ambiguous; error lists ids |
| release id overlaps system id | inherited + override | merge by id; `inherit:false` resets inherited contribution |

---

## Implementation Units

### U1. Introduce the generic `AppChoice` schema and add `apps[]` (additive)

**Goal:** Define the id-reference `AppChoice` schema and add `apps?: AppChoice[]` to release and system records without removing any legacy field, so the tree stays green.

**Requirements:** R1, R2, R10

**Dependencies:** None

**Files:**
- Create: `product/platform/library/config/records/app-choice.ts`
- Modify: `product/platform/library/config/records/library-item.ts`
- Modify: `product/platform/library/config/records/system.ts`
- Create: `product/platform/library/config/records/app-choice.test.ts`
- Modify: `product/platform/library/config/records/library-item.test.ts`
- Modify: `product/platform/library/config/records/system.test.ts`

**Approach:**
- Define `AppChoice` as a strict struct: required `id` (non-empty), optional `inherit`, optional `runtime` (non-empty), plus the `InheritableLayer` policy fields (gamescope/moonlight/retroarch/ryubing/env/cwd/argsAppend/patches). Forbid `kind` and any other excess key via `STRICT` decode.
- Add `apps: Schema.optional(Schema.Array(AppChoice))` to `LibraryReleasePayload` and `SystemPayload`. Reject empty `apps: []`; require unique `id`s within a single `apps[]`.
- Do not remove `release.app`/`release.runtime`/`system.launch`/`system.launcher` yet.

**Patterns to follow:**
- Strict struct + `Schema.check`/`makeFilter` diagnostics in `records/library-item.ts` (release id uniqueness) and `records/app.ts`.
- `InheritableLayer.fields.*` inlining used across `records/*.ts`.

**Test scenarios:**
- Happy path: `apps: [{ id: "retroarch" }]` decodes on a release; `apps: [{ id: "retroarch", runtime: "mgba" }]` decodes on a system.
- Happy path: an app choice with `inherit: false` and inheritable policy fields decodes.
- Edge case: a multi-entry `apps[]` with distinct ids decodes.
- Error path: `kind` present on an app choice fails with a clear diagnostic.
- Error path: empty `apps: []` fails; duplicate `id`s within one `apps[]` fail.
- Error path: an unknown excess key on an app choice fails (STRICT).
- Regression: existing release/system fixtures (still using legacy fields) continue to decode.

**Verification:**
- `AppChoice` decode tests lock the id-reference grammar and `kind`-forbidden rule; release/system decode both legacy fields and the new `apps[]`.

---

### U2. Resolve app choices in the readable cascade (overlay + select), prefer over legacy scalar

**Goal:** Compute effective app choices by overlaying `release.apps[]` onto `system.apps[]` by id, select one via `appId`, derive `app`/`runtime` from the selected choice, and feed the existing `ReadableResolvedLaunchContext`; fall back to the legacy scalar path only when no `apps[]` resolves.

**Requirements:** R3, R4, R5, R10

**Dependencies:** U1

**Files:**
- Create: `product/platform/library/config/app-choice-selection.ts`
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Modify: `product/platform/library/config/errors.ts`
- Create: `product/platform/library/config/app-choice-selection.test.ts`
- Modify: `product/platform/library/config/readable-cascade-resolver.test.ts`

**Approach:**
- Add a pure `resolveEffectiveAppChoices(systemApps, releaseApps)` that overlays by `id` (release wins, merge fields), honoring scoped `inherit: false` to drop the inherited system contribution for that id while keeping the top-level `apps.<id>` definition.
- Add a pure `selectAppChoice(choices, appId)` returning a tagged union mirroring `ReleaseSelectionResult`: `Selected | NotFound(appId) | Ambiguous(appIds) | None`.
- Add `appId?: string` to `ResolveReadableLaunchInputs`. In `resolveReadableLaunchContext`, compute effective choices, select, resolve the chosen `id` to a top-level `AppRecord` (existing `resolveReadableAppRecord`), and resolve `runtime` = choice override → top-level app default. Populate the existing `ReadableResolvedLaunchContext` app/runtime fields.
- Keep the existing scalar `selected.app`/`selected.runtime` path as a fallback used only when no effective app choice resolves (so un-migrated fixtures still pass mid-flight).
- Add an `AmbiguousAppChoice` (and reuse `AppNotFound`/add `AppChoiceNotFound`) tagged error per `errors.ts` conventions; carry available ids.

**Execution note:** Test-first — write the `selectAppChoice`/overlay unit tests and a cascade selection test before wiring `resolveReadableLaunchContext`.

**Patterns to follow:**
- `selectLaunchableRelease` + `ReleaseSelectionResult` in `playable-id.ts`; `selectReadableRelease` wrapper in `cascade-resolver.ts`.
- `inherit:false` truncation in `cascade-resolver.ts` / `inheritable-fields.ts`.

**Test scenarios:**
- Happy path: release with no `apps[]` inherits the single `system.apps[]` choice and auto-selects it.
- Happy path: a `release.apps[]` entry overlays the inherited system choice by id, keeping inherited `runtime` and adding fields.
- Happy path: `inherit: false` on a release app choice drops the inherited system contribution but keeps the top-level app definition.
- Happy path: `runtime` resolves from the choice override, else the top-level app default.
- Edge case: explicit single-entry `apps[]` resolves identically to inference.
- Error path: multiple resolved choices without `appId` → ambiguity error listing ids.
- Error path: unknown `appId` → clear error; app-choice `id` with no matching `apps.<id>` → `AppNotFound`.
- Integration: `resolveReadableLaunchContext` populates `ReadableResolvedLaunchContext.app`/`runtime` from the selected choice and still resolves target/policy folds.
- Regression: a release still using legacy `release.app`/`release.runtime` (no `apps[]`) resolves via the fallback path.

**Verification:**
- Resolved contexts expose the selected app and runtime via `apps[]`; un-migrated scalar configs still resolve through the fallback.

---

### U3. Thread `appId` through repository and portal launch inputs

**Goal:** Accept `appId` on repository and RPC launch inputs, pass it into the readable cascade, surface available app-choice ids in ambiguity errors, and expose `apps[]` in the read-model release entry.

**Requirements:** R6, R10

**Dependencies:** U2

**Files:**
- Modify: `product/platform/library/proseql/library-repository.ts`
- Modify: `product/apps/portal/api/library/launch.rpc.ts`
- Modify: `product/apps/portal/api/library/launch.rpc-handler.ts`
- Modify: `product/platform/library/proseql/library-repository.test.ts`
- Modify: `product/apps/portal/api/library/launch.rpc-handler.test.ts`

**Approach:**
- Add optional `appId` to the repository readable launch input and to `LaunchLibraryPayload`; pass it through to `resolveReadableLaunchContext`.
- Extend `PlayableReleaseEntry` and `toPlayableReleaseEntry` to expose `apps` (the choice ids) alongside the existing fields; keep `app`/`runtime` on the entry until U5 (additive).
- Route app-choice ambiguity/not-found through existing launch error surfaces with recoverable ids; do not widen the stable list-output contract for a picker.

**Patterns to follow:**
- Release-aware launch inputs / ambiguity tests in `library-repository.test.ts`; RPC validation/error tests in `launch.rpc-handler.test.ts`.

**Test scenarios:**
- Happy path: launching a single-choice release without `appId` dispatches normally.
- Happy path: launching a multi-choice release with a matching `appId` selects that choice.
- Error path: multi-choice release without `appId` → ambiguity error carrying available ids.
- Error path: unknown `appId` → clear launch error.
- Happy path: `toPlayableReleaseEntry` exposes `apps[]` ids for a migrated release.
- Regression: a single RetroArch/Ryubing choice still dispatches to its existing materializer.

**Verification:**
- `appId` is reachable from public launch inputs; ambiguity errors carry ids; read-model exposes `apps[]` without regressing existing app kinds.

---

### U4. Migrate fixtures, tests, and example configs to `apps[]`

**Goal:** Convert every tracked readable config that uses the legacy scalar shape to the `apps[]` grammar, including the multi-choice and Steam-shaped examples, ahead of removing the legacy fields.

**Requirements:** R9, R10

**Dependencies:** U2

**Files:**
- Modify: `product/platform/library/config/fixtures/ryubing-full.korri.yaml`
- Modify: `docs/brainstorms/2026-06-11-001-steam-readable-library-example.korri.yaml`
- Modify: `docs/brainstorms/2026-06-08-003-retroarch-policy-one-to-one.example.yaml`
- Modify: `docs/brainstorms/2026-06-08-004-retroarch-policy-minimal-v1.example.yaml`
- Modify: `docs/brainstorms/2026-06-08-001-gamescope-policy-one-to-one.example.yaml`
- Modify: `product/platform/library/config/records/readable-schema.test.ts`
- Modify: `product/platform/library/config/authoring/examples.test.ts` (if it decodes these examples)

**Approach:**
- Rewrite each release's `app: X` / `runtime: Y` to `apps: [{ id: X, runtime: Y }]`, defining any required top-level `apps.<id>` entries (e.g. distinct retroarch variants) as needed.
- Rewrite the Steam brainstorm example to the id-reference grammar per the Steam plan's U6 intent: `apps: [{ id: steam }]` referencing top-level `apps.steam`; no `kind` on a choice. Keep Steam-specific fields illustrative/commented since `kind: steam` is not implemented here.
- Update `system.launch`/`launcher` usages in fixtures to `system.apps[]`.
- Keep comments noting that readiness/VDF/wrapper details remain implementation-owned (for the Steam example).

**Execution note:** Characterization-first — confirm each fixture still decodes via its schema test before and after migration.

**Patterns to follow:**
- `fixtures/ryubing-full.korri.yaml` structure and its decode coverage in `records/readable-schema.test.ts`.

**Test scenarios:**
- Happy path: every migrated fixture/example decodes through host/storage/systems/apps/runtimes/library.
- Happy path: a migrated multi-choice release decodes and resolves via `appId`.
- Regression: schema tests that previously asserted decode of these files still pass against the new shape.

**Verification:**
- No tracked readable config relies on `release.app`/`release.runtime`/`system.launch`/`system.launcher`; all decode under the `apps[]` grammar.

---

### U5. Clean break: remove and reject legacy fields, drop the scalar fallback

**Goal:** Remove `release.app`/`release.runtime`/`system.launch`/`system.launcher`, reject them at decode time with clear diagnostics, and drop the readable cascade's legacy scalar fallback now that all configs are migrated.

**Requirements:** R7, R10

**Dependencies:** U2, U3, U4

**Files:**
- Modify: `product/platform/library/config/records/library-item.ts`
- Modify: `product/platform/library/config/records/system.ts`
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Modify: `product/platform/library/proseql/library-repository.ts`
- Modify: `product/platform/library/config/records/library-item.test.ts`
- Modify: `product/platform/library/config/records/system.test.ts`
- Modify: `product/platform/library/config/readable-cascade-resolver.test.ts`

**Approach:**
- Delete `app`/`runtime` from `LibraryReleasePayload` and `launch`/`launcher` from `SystemPayload`. Because decode is STRICT (`onExcessProperty: "error"`), their presence already fails; add explicit, friendlier diagnostics naming `apps[]` as the replacement.
- Remove the `app`/`runtime` selection contributions from `readableViewOfRelease`/`readableViewOfSystem`/`readableViewOfSource`/`ReadableLayerView` and the legacy scalar fallback in `resolveReadableLaunchContext`; a launchable release now requires a resolvable app choice.
- Drop `release.app`/`release.runtime` from `toPlayableReleaseEntry` / `PlayableReleaseEntry`.
- Update `system.test.ts` to assert `launch`/`launcher` are rejected; keep `cores`.

**Execution note:** Characterization-first — assert the new rejection diagnostics and the "release with target but no app choice is not launchable" behavior before deleting the fallback.

**Patterns to follow:**
- Diagnostic `makeFilter` messages in `records/library-item.ts`.

**Test scenarios:**
- Error path: `release.app`, `release.runtime`, `system.launch`, `system.launcher` each fail decode with a clear `apps[]`-pointing diagnostic.
- Error path: a release with `target` but no resolvable app choice is not launchable.
- Regression: metadata-only release without `target` stays valid and needs no app choice.
- Regression: migrated fixtures still resolve and launch via `apps[]` only.

**Verification:**
- Legacy launch fields are gone and rejected; the readable path resolves the app exclusively from `apps[]`.

---

### U6. Delete the dead `resolveLaunchContext` cascade and unreferenced helpers

**Goal:** Remove the legacy `resolveLaunchContext` (no production caller) and any helpers it exclusively owned, preserving the live `resolveLocalLauncherPolicy` family and all shared policy-merge primitives the readable path depends on.

**Requirements:** R8, R10

**Dependencies:** U5

**Files:**
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Modify: `product/platform/library/config/cascade-resolver.test.ts`

**Approach:**
- Delete `resolveLaunchContext` and the legacy `resolveLaunchContext`-only blocks in `cascade-resolver.test.ts`.
- Remove helpers that become unreferenced after that deletion — candidates: `viewOfUser`/`viewOfSystem`/`viewOfGame`/`viewOfPreset`, `resolveLauncherId`, `resolveExplicitLaunchApp`/`resolveExplicitLaunchModule`, and any `mergeByLauncher`/preset-skeleton helper used only by the legacy path. Determine the exact set by typecheck + `fallow dead-code`.
- Keep `resolveLocalLauncherPolicy`, `resolveLocalLauncherGamescopePolicy`, `enumerateApplicablePresets`, their `viewOfGlobal`/`viewOfLauncher`/`viewOfOverride`/`foldLayers`/`presetsOnLayer`/`truncateChain` dependencies, and all `fold*`/`mergeGamescope*` primitives `mergeReadableLayers` uses.

**Execution note:** Pure dead-code removal — behavior-preserving; rely on existing live-path tests + typecheck + `fallow dead-code` rather than new tests. Stop and reassess if any deletion candidate turns out to be referenced by a live path.

**Patterns to follow:**
- Existing module boundaries in `cascade-resolver.ts`; `fallow dead-code` for unreferenced-symbol confirmation.

**Test scenarios:**
- Test expectation: none — behavior-preserving deletion. Coverage is: `just typecheck` clean, `fallow dead-code` shows no new dead code, the readable cascade + `resolveLocalLauncherPolicy` test suites stay green, and removed legacy `resolveLaunchContext` tests are deleted (not skipped).

**Verification:**
- `resolveLaunchContext` is gone; the live moonlight launch-policy path and the readable cascade are unaffected; no orphaned helpers remain.

---

## System-Wide Impact

- **Interaction graph:** YAML decode → readable cascade overlay/select → repository launch resolution → launch RPC payloads → existing typed materializer dispatch. Only the app/runtime selection step changes; rendering/materialization are unchanged.
- **Error propagation:** New app-choice ambiguity / not-found errors surface through existing launch RPC error surfaces with recoverable ids; decode rejections name `apps[]` as the fix.
- **API surface parity:** Repository and portal launch inputs share the same `appId` selector; future CLI/agent surfaces should reuse it.
- **Unchanged invariants:** `target` stays release-scoped and non-inheritable; storage/source target resolution unchanged; `system.cores` retained; the live `resolveLocalLauncherPolicy` / preset machinery and all `fold*`/`mergeGamescope*` primitives are preserved; the legacy `GameRecord` model and rocknix importer game output are untouched.
- **Integration coverage:** Schema, overlay/selection, repository dispatch, and fixtures are unit-covered; no Nix-owned contracts change.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Removing legacy fields ripples into cascade/repository readers | Additive-first sequencing (U1–U4) keeps every commit green; removal is isolated to U5 after all readers prefer `apps[]`. |
| Deleting `resolveLaunchContext` accidentally removes a shared helper | U6 keeps the live `resolveLocalLauncherPolicy` family + shared `fold*` primitives explicitly; determine deletions via typecheck + `fallow dead-code`; stop if a candidate is live-referenced. |
| `system.launch`/`launcher` removal is inconsistent with user/game/global/preset | Intentional and scoped: only the readable system layer moves to `apps[]`; the legacy launcher grammar elsewhere stays for the live policy/preset machinery; documented in Scope Boundaries. |
| Un-migrated config breaks at the U2 selection switch | U2 retains a legacy scalar fallback so un-migrated fixtures pass until U4 migrates them and U5 removes the fallback. |
| Drift from the downstream Steam plan's grammar | This plan implements Steam plan R2 (id-reference, `kind` forbidden) verbatim and migrates the Steam brainstorm example to match, so Steam U1 only adds `kind: steam`. |

---

## Sources & References

- Origin item: `work/items/active/01KTWGRD66E7K0G38MJ7GSHG74-readable-apps-migration/item.md`
- Downstream Steam plan: `work/items/active/01KTWFJXDKS8VYWPV94QTWCBEH-steam-readable-apps-v1/plan.md`
- Related code: `product/platform/library/config/records/library-item.ts`, `records/system.ts`, `records/app.ts`, `cascade-resolver.ts`, `resolved-launch-context.ts`, `playable-id.ts`, `inheritable-fields.ts`, `proseql/library-repository.ts`
- Related API: `product/apps/portal/api/library/launch.rpc.ts`, `launch.rpc-handler.ts`
- Related deferred items: `01KTWNSW2HD32CV1X2ZJ3M4WE3` (profile app override), `01KTWPQN3M0TED877M2ESWK4D2` (source/provenance modeling)
- Institutional learning: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
