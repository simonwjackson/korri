---
title: "feat: RPCS3 settings surface Phase 3 — per-game CPU/GPU accuracy tuning"
type: feat
status: active
date: 2026-07-03
origin: work/items/active/20260702-rpcs3-settings-surface/plan.md
verify_command: "bun test product/plugins/rpcs3/src"
---

# feat: RPCS3 settings surface Phase 3 — per-game CPU/GPU accuracy tuning

## Summary

Extend the shipped RPCS3 unified settings tree with the **per-game accuracy
tranche** — a new `core.*` group (PPU/SPU decoders, SPU block size, XFloat
accuracy, preferred SPU threads, clocks scale, and the LLE `librariesControl`
list) plus GPU-accuracy toggles on the existing `video.*` group (write/read
color & depth buffers, strict rendering, MSAA, ZCull). This realizes **U9** of
the settings-surface plan. It follows the exact same three-seam pattern already
in place — delivery-agnostic Effect Schema (`policy.ts`) → delivery router
(`mapping.ts`) → read-merge-canonical renderer (`config-render.ts`) — and adds
one genuinely new capability: the **first list-valued `config.yml` entry**, so
the renderer must emit and round-trip a YAML sequence.

---

## Problem Frame

The shipped surface (Phases 0–2, plan units U0–U8) covers the settings everyone
flips globally (resolution, aspect, frame limit, renderer, audio, locale,
headless boot). It does **not** yet name the knobs people flip **per game** for
compatibility — CPU/SPU accuracy, LLE module selection, and GPU buffer/render
accuracy. These map almost 1:1 onto RPCS3's own per-game "custom config" model,
so they are the settings that most earn a typed home at the release/profile
cascade layer. Until this lands they are only reachable through the
`overrides.config` escape hatch (raw YAML), which works but gives no names,
validation, or discoverability. This phase was deliberately deferred as
demand-driven; it is being pulled forward now.

---

## Requirements

- R1. Per-game CPU/SPU accuracy knobs are declarable as typed, delivery-agnostic
  settings under a new `core.*` group and route to `Core.*` `config.yml` keys.
  *(realizes parent R2, R8)*
- R2. GPU-accuracy toggles are declarable under the existing `video.*` group and
  route to `Video.*` `config.yml` boolean/enum keys. *(realizes parent R2, R8)*
- R3. `core.librariesControl` (LLE selection) is a **list-valued** setting that
  renders as a `config.yml` YAML sequence and round-trips through a YAML parser;
  a more-specific list **replaces** (does not element-merge) a less-specific
  one, consistent with the existing deep-merge semantics. *(realizes parent R2)*
- R4. All Core/Video target key labels and enum value strings are **verified
  against RPCS3 source** (`Emu/system_config.h`, `Emu/system_config_types.cpp`)
  for the pinned build `0.0.41-nixpkgs-40e9ee5` before the value maps are
  finalized. *(realizes parent R8)*
- R5. The escape hatch and all shipped Phase 0–2 behavior are unchanged; new
  keys are additive and strict excess-property rejection still steers unmodeled
  keys to `overrides.config`. *(realizes parent R1, R4)*

**Origin trace:** this plan implements **U9** of
`work/items/active/20260702-rpcs3-settings-surface/plan.md`. That plan's origin
(`rpcs3-settings-maximalist-proposal.md`) is a design document with no A/F/AE
IDs; requirements above are derived during planning and traced to the parent
plan's R2 (curated `config.yml` surface) and R8 (strict decode + value maps).

---

## Scope Boundaries

- Not adding two-level nested config keys (`Video.Vulkan.*`,
  `Video.Performance Overlay.*`). Phase 3 stays single-level `Section.Key`; the
  LLE list is single-level with a list *value*, not a nested subtree.
- Not modeling value-free debug/telemetry toggles — they stay escape-hatch-only.
- Not changing the cascade resolver, materializer argv assembly, GUI preseed, or
  overrides folding — those seams are complete and untouched.
- Not wiring per-game *acceptance targets* (specific games) into automated
  tests; correctness is proven by decode/route/render unit tests against known
  RPCS3 strings, not by launching a title.

### Deferred to Follow-Up Work

- **U10 / Phase 4 — deep defaults + nested subtrees** (`video.vulkan.*`,
  `video.performanceOverlay.*`, `net.*`, `savestate.*`, `vfs.*`, extended
  `misc.*`/`log.*`): remains deferred and demand-driven. Backlog
  `01KWK3B7K7CV8YTWVATABANMSF`. Phase 4 is where `config-render.ts` gains the
  two-level nesting path; this plan intentionally does not build it.
- Optional `video.readDepthBuffer` toggle: RPCS3 exposes it, but the parent U9
  set omits it. Add only if a concrete game need appears.

---

## Context & Research

### Relevant Code and Patterns

- `product/plugins/rpcs3/src/policy.ts` — `Rpcs3VideoPolicy`, `Rpcs3AudioPolicy`,
  `Rpcs3SystemPolicy`, `Rpcs3BootPolicy` structs assembled into `Rpcs3Policy`;
  helpers `IntInRange`, `NonNegativeNumber`, `NonEmptyString`; `STRICT`
  (`onExcessProperty: "error"`). Phase 3 adds a `Rpcs3CorePolicy` struct and
  extends `Rpcs3VideoPolicy`.
- `product/plugins/rpcs3/src/mapping.ts` — `routeSettings(policy)` fills
  `flags` / `configEntries` / `iniEntries`; value maps are `Record<string,string>`
  (e.g. `RENDERER`, `SHADER_MODE`, `LANGUAGE`). `ConfigValue` and `ConfigEntry`
  types live here. Phase 3 adds value maps + a `core` block and GPU-accuracy
  emission in the `video` block.
- `product/plugins/rpcs3/src/config-render.ts` — `buildConfigObject` splits on
  the **first** dot (single-level), and `deepMerge` replaces non-plain-object
  values (arrays included) rather than merging them, so array values already
  replace correctly; `renderConfigYaml` serializes once via the `yaml` package.
- Proposal §9 mapping rows (ground truth already captured):
  `core.ppuDecoder → Core.PPU Decoder`, `core.spuDecoder → Core.SPU Decoder`,
  `core.spuBlockSize → Core.SPU Block Size` (`safe→Safe`,`mega→Mega`,`giga→Giga`).

### Institutional Learnings

- U3 and U8 both **caught real errors** by verifying enum strings against RPCS3
  source rather than trusting the proposal (e.g. `video_aspect` only `4:3`/`16:9`;
  `vsync_mode` `Disabled`/`Adaptive`/`Full`). The same verification pass is
  mandatory here (R4) — the proposed strings below are candidates, not truth.
- RPCS3 source is **not** checked out locally; verification means fetching
  `Emu/system_config.h` / `Emu/system_config_types.cpp` from `RPCS3/rpcs3` at the
  pinned build, exactly as prior units did.

### External References

- RPCS3 `system_config_types.cpp` — enum string tables for `ppu_decoder_type`,
  `spu_decoder_type`, `spu_block_size_type`, `xfloat_accuracy`, `msaa_level`.
- RPCS3 `system_config.h` — `Core` and `Video` node key labels.

---

## Key Technical Decisions

- **List support is a type widening, not a renderer rewrite.** `buildConfigObject`
  and `stringify` already handle array values; only `ConfigValue` (in `mapping.ts`)
  must be widened to include `readonly string[]`. Doing this as its own first unit
  (U1) keeps the new capability under an explicit round-trip test before any
  setting depends on it.
- **LLE list replace, not merge.** `deepMerge` treats arrays as non-plain-object
  values, so a more-specific `Libraries Control` list replaces a less-specific
  one wholesale. This is the correct per-game semantic (a game's LLE set is a
  complete statement, not an increment) and requires no special-casing.
- **`core` is a standard semantic group**, mirroring `video`/`audio`/`system` —
  delivery-agnostic names in `policy.ts`, RPCS3 strings only in `mapping.ts`.
- **Numeric ranges are guarded** via `IntInRange`: `preferredSpuThreads`
  (`0` = auto) and `clocksScale` (percentage). Exact bounds pinned during R4
  verification.
- **GPU-accuracy toggles are plain booleans** written to `config.yml` (not flags)
  — there are no CLI equivalents, and absence ≠ the desired value, so the value
  is always written when the author sets it (consistent with the `video.vsync`
  precedent).

---

## Open Questions

### Resolved During Planning

- *Does the renderer need a new nesting path for the LLE list?* No — the list is
  a single-level key (`Core.Libraries Control`) whose *value* is a sequence.
  Only the value type widens. Two-level nesting stays in Phase 4.
- *Merge vs replace for LLE lists?* Replace (most-specific-wins), which is the
  existing deep-merge behavior for array values — no change needed.

### Deferred to Implementation

- **Exact enum strings and key labels** for every Core/Video key (R4). The maps
  below are candidates; the implementer confirms each against RPCS3 source for
  the pinned build and corrects any mismatch (expect at least one, per U3/U8).
- **Exact numeric bounds** for `preferredSpuThreads` and `clocksScale` — read
  from the `cfg::uint` declarations during verification.
- Whether `msaa` is a two-value enum (`Disabled`/`Auto`) or richer in this build
  — confirm against `msaa_level`.

---

## Implementation Units

*Local U-IDs U1–U3 decompose parent-plan **U9**. U1 (list type) and U2 (schema)
are independent; U3 (router) depends on both.*

### U1. Permit list-valued config entries in the renderer

**Goal:** Let a routed `config.yml` entry carry a string-list value that renders
as a YAML sequence and round-trips, so `librariesControl` (and any future list
key) has a proven delivery path before anything emits one.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `product/plugins/rpcs3/src/mapping.ts` (widen `ConfigValue`)
- Test: `product/plugins/rpcs3/src/config-render.test.ts`

**Approach:**
- Widen `ConfigValue` from `string | number | boolean` to also include
  `readonly string[]`. `ConfigEntry` and `RoutedSettings` inherit it.
- Confirm (do not rewrite) that `buildConfigObject` assigns the array through
  unchanged (arrays are not plain objects) and `deepMerge` replaces an existing
  array value rather than merging it.
- No change to `renderConfigYaml`'s structure; `stringify` emits the sequence.

**Patterns to follow:**
- Existing `ConfigValue`/`ConfigEntry` definitions and the `deepMerge` array
  branch in `config-render.ts`.

**Test scenarios:**
- Happy path: an entry `["Core.Libraries Control", ["libfoo.sprx:lle"]]` renders
  under `Core: { Libraries Control: [...] }` and `parse()`-round-trips to the
  same array.
- Edge case: an empty list `[]` renders as an empty YAML sequence and
  round-trips (does not vanish or become `null`).
- Integration: a canonical config carrying a `Libraries Control` list is
  **replaced** (not element-merged) by a routed list of different contents.

**Verification:**
- List-valued config entries serialize to valid YAML sequences and survive a
  parse round-trip; array replace semantics hold.

---

### U2. Model the `core` group and GPU-accuracy video toggles in the schema

**Goal:** Add delivery-agnostic typed names for the per-game accuracy surface,
with strict decode and typed errors.

**Requirements:** R1, R2, R5

**Dependencies:** None

**Files:**
- Modify: `product/plugins/rpcs3/src/policy.ts`
- Test: `product/plugins/rpcs3/src/policy.test.ts`

**Approach:**
- Add `Rpcs3CorePolicy` (all optional):
  - `ppuDecoder`: `Literals(["interpreter-static","llvm-recompiler"])`
  - `spuDecoder`: `Literals(["interpreter-static","asmjit-recompiler","llvm-recompiler"])`
  - `spuBlockSize`: `Literals(["safe","mega","giga"])`
  - `spuXFloatAccuracy`: `Literals(["accurate","approximate","relaxed"])`
  - `preferredSpuThreads`: `IntInRange("rpcs3.core.preferredSpuThreads", 0, 6)`
  - `clocksScale`: `IntInRange("rpcs3.core.clocksScale", 10, 3000)`
  - `librariesControl`: `Schema.optional(Schema.Array(Schema.String))`
- Extend `Rpcs3VideoPolicy` with optional booleans `writeColorBuffers`,
  `writeDepthBuffer`, `readColorBuffers`, `strictRendering`, `disableZcull`, and
  `msaa`: `Literals(["disabled","auto"])`.
- Add `core: Schema.optional(Rpcs3CorePolicy)` to `Rpcs3Policy`.
- Literal sets and bounds are candidates pending U3's R4 verification; keep them
  co-located so a correction touches one place.

**Execution note:** Add the failing decode tests first, then the schema fields.

**Patterns to follow:**
- `Rpcs3VideoPolicy` / `Rpcs3SystemPolicy` struct style; `IntInRange` helper;
  `STRICT` decode in `decodeRpcs3Policy`.

**Test scenarios:**
- Happy path: a policy with `core.spuBlockSize:"mega"`, `core.ppuDecoder:
  "llvm-recompiler"`, and `core.librariesControl:["libfoo.sprx:lle"]` decodes.
- Happy path: `video.strictRendering:true`, `video.msaa:"disabled"` decode.
- Edge case: `core.preferredSpuThreads:0` accepted; out-of-range (e.g. `99`)
  rejected with the labeled error.
- Error path: invalid decoder enum (`core.ppuDecoder:"fast"`) rejected.
- Error path: excess property under `core` (e.g. `core.bogus`) rejected by STRICT.

**Verification:**
- The `core` group and new video toggles decode with typed errors; unmodeled
  keys are rejected, steering authors to `overrides.config`.

---

### U3. Route the core + GPU-accuracy settings through the mapping table

**Goal:** Translate decoded `core.*` and the new `video.*` toggles into the
correct `config.yml` entries, with all RPCS3 strings verified against source.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U1 (list-valued `ConfigValue`), U2 (schema fields)

**Files:**
- Modify: `product/plugins/rpcs3/src/mapping.ts`
- Modify: `product/plugins/rpcs3/README.md`
- Test: `product/plugins/rpcs3/src/mapping.test.ts`

**Approach:**
- Add value maps (verify each against RPCS3 source before finalizing):
  - `PPU_DECODER`: `interpreter-static→"Interpreter (static)"`,
    `llvm-recompiler→"Recompiler (LLVM)"`
  - `SPU_DECODER`: `interpreter-static→"Interpreter (static)"`,
    `asmjit-recompiler→"Recompiler (ASMJIT)"`, `llvm-recompiler→"Recompiler (LLVM)"`
  - `SPU_BLOCK_SIZE`: `safe→"Safe"`, `mega→"Mega"`, `giga→"Giga"`
  - `SPU_XFLOAT`: `accurate→"Accurate"`, `approximate→"Approximate"`,
    `relaxed→"Relaxed"`
  - `MSAA`: `disabled→"Disabled"`, `auto→"Auto"`
- Add a `core` block to `routeSettings` emitting: `Core.PPU Decoder`,
  `Core.SPU Decoder`, `Core.SPU Block Size`, `Core.XFloat Accuracy`,
  `Core.Preferred SPU Threads` (number), `Core.Clocks scale` (number),
  `Core.Libraries Control` (**list value** from U1).
- In the existing `video` block, emit booleans: `Video.Write Color Buffers`,
  `Video.Write Depth Buffer`, `Video.Read Color Buffers`,
  `Video.Strict Rendering Mode`, `Video.Disable ZCull Occlusion Queries`, and
  `Video.MSAA` (enum via `MSAA` map).
- Update `README.md` to document the new `core.*` settings and GPU-accuracy
  `video.*` toggles alongside the existing surface.

**Execution note:** **Before finalizing the value maps, verify every Core/Video
key label and enum string against RPCS3 `Emu/system_config.h` and
`Emu/system_config_types.cpp` for build `0.0.41-nixpkgs-40e9ee5`** (fetch from
`RPCS3/rpcs3`; the source is not local). Expect at least one mismatch, as U3/U8
found. The `mapping.ts` header comment already claims this file is the single
source of truth for these strings — keep that claim honest.

**Patterns to follow:**
- The existing `video`/`audio`/`system` blocks in `routeSettings`; the
  `RENDERER`/`SHADER_MODE` value-map lookups with `?? value` fallback.

**Test scenarios:**
- Happy path: `core.spuBlockSize:"mega"` → `["Core.SPU Block Size","Mega"]`.
- Happy path: `core.librariesControl:["libfoo.sprx:lle"]` →
  `["Core.Libraries Control", ["libfoo.sprx:lle"]]` (list value preserved).
- Happy path: `core.ppuDecoder:"llvm-recompiler"` →
  `["Core.PPU Decoder","Recompiler (LLVM)"]`.
- Happy path: `core.preferredSpuThreads:2` and `core.clocksScale:150` emit
  numeric values.
- Happy path: `video.strictRendering:true` → boolean `true`;
  `video.writeColorBuffers:false` → boolean `false` (value written, not omitted).
- Happy path: `video.msaa:"disabled"` → `["Video.MSAA","Disabled"]`.
- Integration: a policy spanning `core.*` + new `video.*` routes through
  `routeSettings` and, fed to `renderConfigYaml`, produces valid `config.yml`
  YAML that round-trips (proves list + scalars co-render).

**Verification:**
- `core.*` and GPU-accuracy `video.*` settings (including the LLE list) route to
  the correct, source-verified `config.yml` entries and render to valid YAML.

---

## System-Wide Impact

- **Interaction graph:** Changes are confined to the three rpcs3 seams
  (`policy.ts`, `mapping.ts`, `config-render.ts`). No cascade-resolver,
  materializer, argv, GUI-preseed, or overrides changes. `routeSettings` and
  `renderConfigYaml` callers are unaffected (additive output only).
- **Error propagation:** New decode failures surface as `AppMaterializationFailed`
  with the offending `core.*`/`video.*` key path, identical to the existing path.
- **State lifecycle risks:** None new — entries flow through the existing
  read-merge-canonical write to `korri/config-<releaseId>.yml`; the operator's
  canonical `config.yml` is still never clobbered.
- **API surface parity:** `ConfigValue` widening is backward-compatible (a
  superset); existing scalar entries are unaffected.
- **Unchanged invariants:** The escape hatch, argv order, GUI preseed, XDG
  derivation, and all Phase 0–2 routing behavior are explicitly unchanged; this
  plan only adds new keys and one new value shape.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Proposed enum strings / key labels are wrong for this build | R4 mandatory source-verification pass (fetch RPCS3 source at pinned build); U3/U8 precedent shows this catches real errors. |
| List value silently mis-serializes (e.g. becomes `null` or a string) | U1's explicit round-trip + empty-list tests before any setting emits a list. |
| LLE list unexpectedly element-merges across cascade layers | U1 integration test asserts array **replace** semantics via `deepMerge`. |
| Numeric bounds (`preferredSpuThreads`, `clocksScale`) guessed wrong | Bounds confirmed from the `cfg::uint` declarations during R4; deferred as an implementation-time read. |
| Scope creep into Phase 4 nesting | Scope Boundaries explicitly fence two-level nesting to U10; the LLE list is single-level. |

---

## Documentation / Operational Notes

- `product/plugins/rpcs3/README.md` gains the `core.*` and GPU-accuracy `video.*`
  settings in the surface reference (part of U3).
- No rollout, migration, or monitoring impact — additive, opt-in settings behind
  the existing plugin; unset keys change nothing.

---

## Sources & References

- **Parent plan (origin / U9 detail):** `work/items/active/20260702-rpcs3-settings-surface/plan.md`
- **Design proposal (§9 mapping rows, §11 phasing):** `work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md`
- **Work item:** `work/items/active/20260702-rpcs3-settings-phases-3-4/work.md`
- **Backlog:** `01KWK3B7K4YABNC10E0HY105J5` (this plan / U9); `01KWK3B7K7CV8YTWVATABANMSF` (deferred U10)
- Code seams: `product/plugins/rpcs3/src/policy.ts`, `product/plugins/rpcs3/src/mapping.ts`, `product/plugins/rpcs3/src/config-render.ts`
- Ground-truth strings: RPCS3 `Emu/system_config.h`, `Emu/system_config_types.cpp` (build `0.0.41-nixpkgs-40e9ee5`)
