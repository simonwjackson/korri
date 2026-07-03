---
title: "refactor: Converge fleet escape hatches onto settled LaunchOverrides"
type: refactor
status: active
date: 2026-07-03
origin: work/items/active/01KWM7Q404QGHCX0XVA8R7PF50-converge-fleet-overrides/item.md
verify_command: "just typecheck && just test-unit"
---

# refactor: Converge fleet escape hatches onto settled LaunchOverrides

## Summary

Converge Ryubing, Steam, and RetroArch off their bespoke
`extra`/`extraArgs`/`extraSettings` fields onto `release.launch.overrides.{args,
config}` — the surface RPCS3 already proved. To avoid guessing the shared shape,
converge Ryubing directly first, then extract the shared override-application
helpers (argv prepend/append/replace of a routed segment; native-config
deep-merge) from RPCS3 + Ryubing together and retrofit both, then bring RetroArch
and Steam onto the helpers. Each plugin materializer already receives
`context.overrides` from the cascade — the work is to consume it uniformly. This
is a **big-bang removal**: the software is in alpha, so the old fields are
deleted outright and every in-repo config, fixture, and test that used them is
updated in the same change — no compat shim, no deprecation warning, no migration
path. Existing security guards are preserved (release-scoped-only sourcing,
RetroArch structural-flag and credential-key rejection).

---

## Problem Frame

Every emulator plugin invented its own break-glass under `settings.plugin`:
Ryubing `extra:{args,config}`, Steam `extra:{args}` + `launch-options`,
RetroArch `extraSettings`/`extraArgs`/`configFile.append`. Authors must remember
which field each plugin uses for the same conceptual need ("append a raw flag",
"force a raw config key"), and each plugin re-implements merge semantics with
subtle differences. The RPCS3 settings-surface work established the settled shape
— `LaunchOverrides` on `release.launch.overrides` — and proved it end-to-end on
one launcher (see origin RPCS3 plan
`work/items/active/20260702-rpcs3-settings-surface/plan.md`). The pattern is
proven; the fleet has not yet adopted it.

---

## Requirements

- R1. A shared platform helper applies `overrides.args` to an argv (`prepend`
  before the routed segment, `append` after it, `replace` swapping ONLY the
  routed segment) with the documented merge semantics, covered by unit tests.
- R2. A shared platform helper applies `overrides.config` to an object-tree
  native config (YAML/JSON): `prepend`/`append` parse-and-deep-merge,
  `replace` wins the whole file. Covered by unit tests.
- R3. The generic readable composer (`compose-launch-spec.ts`) consumes
  `context.overrides.args` for launchers with no plugin integration.
- R4. The RPCS3 materializer's bespoke inline override application is replaced by
  the shared helpers (AC#2: "removed in favor of the generic path or proven
  equivalent"), with existing behavior preserved.
- R5. Ryubing, Steam, and RetroArch consume `release.launch.overrides` and no
  longer define plugin-buried `extra`/`extraArgs`/`extraSettings`.
- R6. The old fields (`extra`, `extraArgs`, `extraSettings`) are deleted
  outright; every in-repo config, fixture, and test that referenced them is
  updated to `release.launch.overrides` in the same change. No compat shim, no
  deprecation warning, no migration path (alpha, big-bang).
- R7. Security boundary preserved: overrides are sourced from the persisted
  `release.launch.overrides` layer only (never the ephemeral layer); the
  release-scoped root-redirect strip stays; RetroArch's structural-flag and
  plaintext-credential rejection guards continue to apply to the override path.

**Origin actors:** config authors (operators writing `*.korri.yaml`), plugin
materializers (Ryubing/Steam/RetroArch/RPCS3), the unauthenticated
`app.library.launch` trusted-LAN surface.

---

## Scope Boundaries

- Not building the normalized cross-emulator *typed* settings vocabulary (that is
  a separate parked initiative — this plan is only the raw escape-hatch
  convergence, not semantic normalization of curated settings).
- Not changing the cascade fold of `overrides` (`foldLaunchOverrides` in
  `cascade-resolver.ts` already ships and stays as-is) beyond consuming its
  output.
- Not migrating the legacy `ResolvedLaunchContext` / `composeLaunchSpec` path;
  `ResolvedLaunchContext` has no `overrides` field and that path is not the live
  readable launch surface. Only the readable path is in scope.
- Not adding new override *capabilities* (no new `prepend`/`append`/`replace`
  targets); this is a convergence of existing behavior, not a feature expansion.
- No device rollout or on-device validation in this plan.

### Plugin-specific fields that are NOT escape hatches (kept, not converged)

The whole convergence ships in this one plan (big-bang) — nothing is deferred to
a follow-up. Two existing fields are deliberately kept because they are genuinely
different mechanisms, not raw escape hatches:

- Steam `launch-options` (`%command%` templating) stays Steam-specific — it is
  substitution, not a pure argv/config override.
- RetroArch `configFile.append` (`--appendconfig` external-file references) stays
  RetroArch-specific — it references external cfg *files*, which the inline-text
  `overrides.config` cannot express. Retiring it would mean building a new
  file-reference override capability, which this plan explicitly does not do (see
  the "no new override capabilities" boundary above). Resolved, not deferred.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/config/records/library-item.ts` — settled
  `LaunchOverrides` schema (`args:{prepend,append,replace}`,
  `config:{prepend,append,replace}`), attached as `ReleaseLaunch.overrides`.
- `product/platform/library/config/cascade-resolver.ts` — `foldLaunchOverrides`
  (already shipped) folds release-layer overrides; `readableViewOfRelease` sets
  `overrides: release.launch?.overrides` (release-scoped only);
  `stripReleaseScopedRootOverrides` is the security strip precedent.
- `product/platform/library/config/resolved-launch-context.ts` — `overrides` on
  `ReadableResolvedLaunchContext` (consumed by materializers).
- `product/platform/library/config/compose-launch-spec.ts` —
  `composeReadableLaunchSpec` (generic non-plugin composer; does NOT yet read
  overrides).
- `product/plugins/rpcs3/src/launch-spec.ts` — `composeRpcs3LaunchSpec`, the
  reference argv-override implementation (routed-segment replace, structural
  flags protected). **Extraction source for the shared args helper.**
- `product/plugins/rpcs3/src/config-render.ts` — `renderConfigYaml`, the
  reference config-override implementation (canonical read + deep-merge +
  replace-wins). **Extraction source for the shared object-tree config helper.**
- `product/plugins/ryubing/src/launch-spec.ts` / `materializer.ts` — `extra.args`
  appended to argv; `extra.config` deep-merged (`deepMerge`, `deepMergeJson`).
- `product/plugins/steam/src/materializer.ts` — `extra.args` threaded to
  `state-materializer` as `extraArgs`; `launch-options` is `%command%`
  templating (kept).
- `product/plugins/retroarch/src/launch-spec.ts` — `extraArgs` (with
  `DANGEROUS_*` structural-flag guards), `extraSettings` (rendered last, with
  config-key-shape + plaintext-credential validation), `configFile.append`.
- `product/platform/library/proseql/library-repository.ts` —
  `findReadableLaunchIntegration` + `composeReadableLaunchSpec` fallback selects
  plugin materializer vs generic composer.

### Institutional Learnings

- No existing `docs/solutions/` entry covers the override vocabulary; the
  authoritative record is the RPCS3 plan's Key Technical Decisions (routed-segment
  replace, read-merge-canonical config, release-scoped-only sourcing).

### External References

- None required; the merge semantics and security posture are already settled
  in-repo. This is an internal refactor following a proven local pattern.

---

## Key Technical Decisions

- **The "generic composer" framing in the origin item is imprecise; correct it.**
  `compose-launch-spec.ts` only serves launchers WITHOUT a plugin integration.
  Ryubing/Steam/RetroArch/RPCS3 are each `ReadableLaunchIntegration`s that own
  their own materializer and bypass the generic composer entirely. Therefore the
  convergence lands in **each plugin's own materializer/launch-spec consuming
  `context.overrides`**, reusing shared helpers — NOT by routing every plugin
  through `compose-launch-spec.ts`. Wiring overrides into the generic composer
  (R3) is a real but *separate* benefit for generic-process/built-in launchers,
  not a prerequisite that blocks plugin convergence.
- **Convergence is on the authoring vocabulary, not a single merge
  implementation.** Config application stays format-native (YAML for RPCS3, JSON
  for Ryubing, flat cfg for RetroArch) because the file formats genuinely differ.
  The shared object-tree helper (R2) serves the YAML/JSON plugins; RetroArch's
  flat-cfg override stays line-based. What every plugin shares is the INPUT
  surface (`release.launch.overrides.{args,config}`) and the argv helper (R1).
- **`overrides.args.replace` semantics are plugin-parameterized.** Only the
  plugin knows which argv slice is its "routed flags" segment vs structural flags
  (`--no-gui`, `--config`, `-L`, `-c`) and the content path. The shared helper
  takes the argv split as parameters and never touches the structural/positional
  parts. Crucially, `append` is inserted **before the trailing positional**, not
  immediately after the routed segment — in RPCS3 the structural `--config` sits
  between the routed flags and where `append` must land, so a naive three-part
  split would reorder the command line. For the generic composer (no routed
  segment concept), `replace` targets the authored `argsAppend` tail only,
  documented explicitly.
- **Prove the shape before extracting the shared piece.** Do NOT design the
  shared argv/config helpers against RPCS3 alone. Converge one more plugin
  directly first, so the helper signature is shaped by two real, different
  command-line layouts rather than a guess. Only then extract the shared helper
  and retrofit RPCS3 onto it. RetroArch and Steam then land as consumers that can
  still nudge the shape if they stress it. This trades a little rework for a
  helper that fits reality, per the project's "don't add abstractions on
  speculation" rule.
- **RetroArch security guards move onto the override path, not away from it.**
  `extraArgs`→`overrides.args` and `extraSettings`→`overrides.config` must carry
  the same `DANGEROUS_*` structural-flag rejection and config-key-shape /
  plaintext-credential validation. Dropping these to "raw escape hatch" would
  regress a real security boundary. RetroArch keeps a validation layer over the
  converged override input.
- **Big-bang removal, no back-compat.** The software is in alpha, so the old
  fields are removed from each plugin's policy schema entirely and every in-repo
  config/fixture/test that used them is rewritten to `release.launch.overrides`
  in the same change. No decoder shim, no `diagnostics` deprecation warning, no
  translate path. In-repo footprint is small (only plugin src/tests author these
  fields today; no reference configs do), so the rewrite is contained.

---

## Open Questions

### Resolved During Planning

- *Does the generic composer block plugin convergence?* No — plugins already
  receive `context.overrides`; convergence lands in each materializer. Generic
  composer wiring is independent (see Key Technical Decisions).
- *Is `overrides.config` a single shared merge?* No — it is format-native;
  shared object-tree helper serves YAML/JSON only. RetroArch stays line-based.
- *Does `launch-options` convert to an override?* No — it is `%command%`
  substitution, kept Steam-specific.
- *RetroArch `configFile.append` disposition?* Kept as RetroArch-specific. It
  references external cfg files, which inline `overrides.config` cannot express;
  retiring it would require a new file-reference capability this plan does not
  build. Not deferred — resolved to keep.
- *Should the second-tier work (generic launcher wiring, `configFile.append`)
  split into a separate plan?* No — everything ships in this one big-bang plan
  (U1–U6).

### Deferred to Implementation


- *Whether Ryubing's `overrides.config` should accept a plain-text JSON string
  (matching the settled `LaunchOverrides.config` string shape) vs a structured
  object.* The settled schema is string-valued, so Ryubing parses the string as
  JSON before deep-merging. Confirm when converging Ryubing (U1).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should treat
> it as context, not code to reproduce.*

```
release.launch.overrides.{args,config}            ← ONE authoring surface
        │  (folded release-scoped-only by foldLaunchOverrides — already ships)
        ▼
context.overrides on ReadableResolvedLaunchContext
        │
        ├── prove first: Ryubing converges directly (U1), then the shared
        │   helpers are extracted from RPCS3 + Ryubing (U2) and reused by
        │   RetroArch (U3) and Steam (U4)
        │
        ├── plugin materializer (rpcs3/ryubing/steam/retroarch)
        │       args   → shared argv helper (prepend/append/replace of routed segment)
        │       config → shared object-tree helper (YAML/JSON deep-merge, replace wins)
        │                 └ RetroArch: line-based cfg + DANGEROUS_*/credential guards, native
        │
        └── generic composeReadableLaunchSpec (no plugin)
                args   → shared argv helper over the argsAppend tail (U5)
                config → unsupported (no native target) — documented no-op

deprecation shim (per-plugin decoder):
    old extra/extraArgs/extraSettings  →  translate → overrides.{args,config} + diagnostics warn
```

---

## Implementation Units

### U1. Converge Ryubing directly onto `overrides` (first real example)

**Goal:** Make Ryubing consume `context.overrides`, writing its own override
application inline (no shared helper yet), and delete `RyubingExtraPolicy`
(`extra.args`/`extra.config`) outright. This is the second real command-line
layout (alongside RPCS3's existing one) that the shared piece will later be
shaped against.

**Requirements:** R5, R6

**Dependencies:** None

**Files:**
- Modify: `product/plugins/ryubing/src/policy.ts`
- Modify: `product/plugins/ryubing/src/launch-spec.ts`
- Modify: `product/plugins/ryubing/src/materializer.ts`
- Modify: `product/plugins/ryubing/src/launch-spec.test.ts`
- Modify: `product/plugins/ryubing/src/materializer.test.ts`

**Approach:**
- `composeRyubingLaunchSpec` applies `context.overrides.args` to argv (prefix
  `--no-gui --root-data-dir <root> --use-main-config`; routed =
  `renderTypedHeadlessArgs` output; trailing positional = game path) instead of
  `policy.extra?.args`. Write the placement logic inline for now.
- `renderRyubingConfig` applies `context.overrides.config` (parsed from the
  settled string shape as JSON) via Ryubing's existing `deepMergeJson` instead of
  `deepMerge(config, policy.extra?.config)`.
- Delete `RyubingExtraPolicy` (`extra.args`/`extra.config`) from the policy
  schema outright; update any in-repo Ryubing config/fixture/test that used it.
- **Deliberately do NOT extract a shared helper in this unit** — the goal is to
  see how Ryubing's real layout differs from RPCS3's before designing one.

**Patterns to follow:** RPCS3's `composeRpcs3LaunchSpec` for placement intent;
Ryubing's existing `deepMergeJson`.

**Test scenarios:**
- Happy path: `overrides.args` append reaches argv in the right spot;
  `overrides.config` deep-merges into `Config.json`.
- Happy path: `overrides.args.replace` swaps only the typed-flags segment, never
  `--root-data-dir`/`--use-main-config` or the game path.
- Edge case: `overrides` absent → argv/config identical to today.
- Regression: existing Ryubing materializer tests pass (with `extra` cases
  rewritten to `overrides`).

**Verification:** `RyubingExtraPolicy` removed from the schema; `overrides` is
the only escape hatch; no `extra` references remain in-repo.

---

### U2. Extract the shared helpers from RPCS3 + Ryubing; retrofit both

**Goal:** With two real command-line layouts now visible (RPCS3 existing, Ryubing
from U1), extract the shared argv helper and the shared object-tree config helper
— shaped by reality — then retrofit RPCS3 and Ryubing onto them. Retiring RPCS3's
inline override code satisfies AC#2.

**Requirements:** R1, R2, R4

**Dependencies:** U1

**Files:**
- Create: `product/platform/library/config/apply-overrides.ts`
- Create: `product/platform/library/config/apply-overrides.test.ts`
- Modify: `product/plugins/rpcs3/src/launch-spec.ts`
- Modify: `product/plugins/rpcs3/src/config-render.ts`
- Modify: `product/plugins/rpcs3/src/launch-spec.test.ts`
- Modify: `product/plugins/rpcs3/src/config-render.test.ts`
- Modify: `product/plugins/ryubing/src/launch-spec.ts`
- Modify: `product/plugins/ryubing/src/materializer.ts`

**Approach:**
- Argv helper: model the split so `prepend` lands before the routed segment and
  `append` lands **before the trailing positional** (not right after routed).
  The structural block (`--config <p>`, `--input-config`) that sits between
  routed flags and the positional in RPCS3 must be carried in a part the helper
  never reorders. Confirm the same signature expresses Ryubing's layout too.
- Config helper: parameterize over a parse/stringify pair so YAML (RPCS3) and
  JSON (Ryubing) share one deep-merge + replace-wins core, reconciled from
  `renderConfigYaml` and `deepMergeJson`.
- Retrofit RPCS3 and Ryubing to call the helpers; delete their inline logic.

**Execution note:** Characterization-first — the existing RPCS3 and Ryubing
tests are the equivalence oracle; assert byte-for-byte identical argv/config
before and after the swap.

**Patterns to follow:** `composeRpcs3LaunchSpec` argv order; `renderConfigYaml`
precedence; `deepMergeJson`.

**Test scenarios:**
- Happy path: no overrides → argv/config unchanged for both plugins.
- Edge case: `append` lands before the trailing positional even when a structural
  block sits between routed and positional (the RPCS3 reorder trap).
- Edge case: `replace` swaps only the routed segment; structural + positional
  untouched.
- Edge case: config `replace` returns the fragment verbatim; empty fragments are
  no-ops.
- Integration: RPCS3 and Ryubing suites pass unchanged after the swap.

**Verification:** Both plugins run on the shared helpers; RPCS3/Ryubing inline
override code deleted; no behavioral diff.

---

### U3. Converge RetroArch onto the shared helper, preserving security guards

**Goal:** RetroArch consumes `context.overrides`, retires
`extraArgs`/`extraSettings`, and carries the existing structural-flag and
credential-key validation onto the override path. If RetroArch's layout stresses
the U2 helper signature, adjust the helper here. `configFile.append` disposition
per Open Questions.

**Requirements:** R5, R6, R7

**Dependencies:** U2

**Files:**
- Modify: `product/plugins/retroarch/src/launch-spec.ts`
- Modify: `product/plugins/retroarch/src/policy.ts`
- Modify: `product/plugins/retroarch/src/setting-policy.ts`
- Modify: `product/plugins/retroarch/src/launch-spec.test.ts`

**Approach:**
- `renderRetroArchArgs` applies `context.overrides.args` via the shared argv
  helper (routed = current `extraArgs` slot between `-L core` and content path),
  running the args through the existing `DANGEROUS_CORE_ARGS`/`CONFIG_ARGS`/
  `APPEND_CONFIG`/`LOG_FILE` rejection before composition.
- `renderRetroArchSettings` applies `overrides.config` as trailing flat-cfg lines
  (matching `extraSettings` "rendered last" precedent), running each key through
  `isRetroArchConfigKey` + `isRetroArchPlaintextCredentialSettingKey`. RetroArch
  stays line-based; it does NOT use the U2 object-tree config helper.
- Delete `extraArgs`/`extraSettings` from the policy schema outright; update any
  in-repo RetroArch config/fixture/test that used them. Leave `configFile.append`
  untouched (Open Questions).

**Execution note:** Add characterization tests for the current
`DANGEROUS_*`/credential rejections before moving them onto the override path, so
the guard cannot silently weaken.

**Patterns to follow:** `validateRetroArchPolicy` guard set; `extraSettings`
render-last precedent.

**Test scenarios:**
- Happy path: `overrides.args` appended between core and content; `overrides.config`
  cfg lines render last.
- Security: `overrides.args` containing `-L`/`--config`/`--appendconfig`/
  `--log-file` is REJECTED (guard preserved).
- Security: `overrides.config` with a plaintext-credential key or invalid cfg key
  is REJECTED.
- Edge case: `overrides` absent → argv/config identical to today.
- Regression: existing RetroArch launch-spec tests green (with `extraArgs`/
  `extraSettings` cases rewritten to `overrides`).

**Verification:** `extraArgs`/`extraSettings` removed from the schema; the
override path enforces every guard they enforced; no legacy references remain.

---

### U4. Converge Steam onto `overrides` (keep `launch-options`)

**Goal:** Steam consumes `context.overrides.args`, retires `extra.args`; keeps
`launch-options` (`%command%` templating) as Steam-specific.

**Requirements:** R5, R6

**Dependencies:** U2

**Files:**
- Modify: `product/plugins/steam/src/materializer.ts`
- Modify: `product/plugins/steam/src/state-materializer.ts`
- Modify: `product/plugins/steam/src/materializer.test.ts`

**Approach:**
- Feed `context.overrides.args` into `materializeSteamDesiredState`'s `extraArgs`
  slot via the shared argv helper (Steam has a simple argv tail; routed = the
  extra args, no structural flags to protect beyond the wrapper contract).
- Delete `extra.args` from the Steam policy schema outright; update any in-repo
  Steam config/fixture/test that used it. Leave `launch-options`, `compat-tool*`,
  `first-launch` untouched.

**Patterns to follow:** Steam's existing `DecodedSteamPluginPolicy` validation
structure.

**Test scenarios:**
- Happy path: `overrides.args` reaches the Steam wrapper argv.
- Regression: `launch-options` behavior unchanged; existing Steam materializer
  tests green (with `extra.args` cases rewritten to `overrides`).
- Edge case: `overrides` absent → argv identical to today.

**Verification:** `extra` removed from Steam's authored policy; `launch-options`
retained; overrides is the argv escape hatch.

---

### U5. Wire `overrides.args` into the generic readable composer

**Goal:** Launchers with no plugin integration honor `context.overrides.args`.

**Requirements:** R3

**Dependencies:** U2

**Files:**
- Modify: `product/platform/library/config/compose-launch-spec.ts`
- Modify: `product/platform/library/config/compose-launch-spec.test.ts`
- Modify: `product/platform/library/config/compose-readable-launch-spec.test.ts`

**Approach:**
- In `composeReadableLaunchSpec`, treat the authored `argsAppend` tail as the
  routed segment and apply the shared argv helper with the composed
  command+authored args as the leading part and no trailing positional. Document
  that `overrides.config` is a no-op for generic launchers (no native config
  target).

**Patterns to follow:** Existing `argsAppend` handling in
`composeReadableLaunchSpec`.

**Test scenarios:**
- Happy path: generic launcher with `overrides.args.append` appends to argv.
- Happy path: `overrides.args.replace` replaces only the `argsAppend` tail.
- Edge case: no overrides → argv identical to today (regression guard).
- Edge case: `overrides.config` present on a generic launcher → ignored, no
  error, documented.

**Verification:** Generic launcher argv reflects overrides; config override is a
documented no-op.

---

### U6. Documentation of the converged escape-hatch vocabulary

**Goal:** One documented escape-hatch vocabulary across the fleet; plugin READMEs
and any authoring docs point authors at `release.launch.overrides`.

**Requirements:** R5, R6

**Dependencies:** U2, U3, U4, U5

**Files:**
- Modify: `product/plugins/rpcs3/README.md`
- Modify: `product/plugins/ryubing/README.md` (create if absent)
- Modify: `product/plugins/steam/README.md` (create if absent)
- Modify: `product/plugins/retroarch/README.md` (create if absent)

**Approach:**
- Document the single override surface, the merge semantics (prepend/append
  accumulate; replace most-specific-wins; routed-segment-only for args), the
  release-scoped-only security note, and each plugin's format for
  `overrides.config` (YAML/JSON/cfg). Note that the old fields were removed (no
  compat path) so any external notes referencing them are stale.

**Test scenarios:**
- Test expectation: none — documentation only.

**Verification:** Each converged plugin's README describes `overrides` as the
escape hatch; no README still references the removed field.

---

## System-Wide Impact

- **Interaction graph:** `foldLaunchOverrides` (cascade) → `context.overrides` →
  four plugin materializers + generic composer. The shared helpers (extracted in
  U2) are the new convergence point every consumer routes through.
- **Error propagation:** override validation failures surface as
  `AppMaterializationFailed` (existing channel); RetroArch guard rejections stay
  hard failures, not silent drops.
- **State lifecycle risks:** none new — config writes remain atomic
  (`writeAtomic`) and per-release; canonical configs are never clobbered.
- **API surface parity:** the four plugins converge on ONE authoring field; the
  old per-plugin fields are removed outright and all in-repo configs are rewritten
  in the same change (big-bang, alpha).
- **Integration coverage:** per-plugin materializer tests prove the override
  reaches the real argv/config output; U2's characterization tests prove the
  extracted helper matches each bespoke merge byte-for-byte.
- **Unchanged invariants:** `foldLaunchOverrides` merge semantics, release-scoped
  sourcing (`readableViewOfRelease` + `stripReleaseScopedRootOverrides`), Steam
  `launch-options`, RetroArch `configFile.append` (pending Open Questions), and
  all curated typed settings remain exactly as they are.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Shared helper shaped wrong because designed against RPCS3 alone (append lands in the wrong spot) | Prove-then-extract: U1 converges Ryubing directly first; U2 extracts from two real layouts; U3/U4 can still nudge the signature. Characterization tests catch any reorder. |
| RetroArch security guards weakened when moving `extraArgs`/`extraSettings` to the override path | U3 adds characterization tests for every `DANGEROUS_*`/credential rejection BEFORE the move; guards run on the override input. |
| Behavioral drift in RPCS3 when swapping inline logic for shared helpers | U2 is characterization-first; existing RPCS3 tests are the equivalence oracle; no test changes beyond internal wiring. |
| Ryubing `extra.config` object vs `overrides.config` plain-text mismatch | Resolve the object-vs-string decoding in U1 with an explicit test; shim auto-serializes if needed. |
| Big-bang field removal breaks an un-updated config | Alpha, by design: no back-compat. Footprint is small (only plugin src/tests author these fields; no reference configs). U1/U3/U4 each rewrite every in-repo reference in the same change; a repo-wide grep for the old field names is the completion gate. |
| `configFile.append` accidentally removed | Left explicitly untouched — it is a kept RetroArch-specific feature, not a retired escape hatch (resolved in Open Questions). |

---

## Sources & References

- **Origin item:** `work/items/active/01KWM7Q404QGHCX0XVA8R7PF50-converge-fleet-overrides/item.md`
- **Settled pattern:** `work/items/active/20260702-rpcs3-settings-surface/plan.md`
- Reference argv override: `product/plugins/rpcs3/src/launch-spec.ts`
- Reference config override: `product/plugins/rpcs3/src/config-render.ts`
- Cascade fold (shipped): `product/platform/library/config/cascade-resolver.ts` (`foldLaunchOverrides`)
