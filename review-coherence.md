# Coherence Review — RPCS3 unified settings plan

Plan reviewed: `.worktrees/feat/rpcs3-aka-source-plugin/work/items/active/20260702-rpcs3-settings-surface/plan.md`

## Structural checks

- U-ID enumeration: `U1` through `U10` are present once each; declared unit dependencies reference valid U-IDs.
- Requirement trace: `R1`-`R8` are each cited by at least one unit with test scenarios. The inconsistencies below are about conflicting wording, not missing unit coverage.

## Findings

### 1. Phase count disagrees between summary/requirements and delivery section

- Evidence: Summary says the settings surface is delivered across "four sequenced phases" (lines 19-23). R2 repeats "four sequenced phases" (lines 49-55). Phased Delivery then defines Phase 0 plus Phase 1, Phase 2, Phase 3, and Phase 4 (lines 745-763).
- Why it matters: A reader can count either four phases or five phases, which affects how Phase 0 boot essentials are tracked against the rest of the plan.
- Suggested fix: Rewrite the summary/R2 to say "four user-facing settings phases plus Phase 0 foundation" or renumber/remove Phase 0 so the count matches the body.

### 2. Scope excludes per-game tuning that U9/Phase 3 puts in scope

- Evidence: Scope says "no per-game tuning" (lines 93-95). U9 is titled "Phase 3 — per-game tuning (CPU/GPU accuracy)" and models those knobs (lines 607-645). Phased Delivery also includes "Phase 3 (per-game tuning) — U9" (lines 757-759).
- Why it matters: Implementers could either skip U9 as out of scope or implement it as a required phase.
- Suggested fix: If U9 is in scope, change the scope bullet to exclude only per-game profile/content authoring or device-specific rollout, not per-game tuning knobs. If per-game tuning is out of scope, remove/defer U9 and Phase 3.

### 3. Device scope says Aka is changed, operational notes say no device rollout

- Evidence: Scope says "Not changing devices other than the Aka source machine" (line 93), which reads as Aka being the one device changed. Documentation / Operational Notes says "No device rollout in this plan" (lines 771-772).
- Why it matters: A reader can diverge on whether the plan includes any Aka device mutation or only code/plugin changes validated later.
- Suggested fix: Reword the scope bullet to something like: "No device rollout in this plan; Aka is only the intended validation target once operator-supplied firmware is available."

### 4. Domain terminology drifts across sections

- Evidence: Key Technical Decisions says `settings.plugin` groups by `display`/`performance`/`audio`/`boot` plus `state`/`firmware` (lines 157-159). Later units introduce `graphics` (U8/U9, lines 583-589 and 627-630), `core` (lines 622-626), `system` (lines 587-589), and `net`/`savestate`/`vfs`/`misc`/`log` (lines 671-675). U10 also places nested Vulkan and Performance Overlay under `display.vulkan` / `display.performanceOverlay` (lines 668-670), while U8 places renderer/shader Video settings under `graphics.*` (lines 583-587).
- Why it matters: The document does not define whether Video-backed settings belong under `display`, `graphics`, or both; implementers may choose different schema group names for later phases.
- Suggested fix: Add a single authoritative domain taxonomy. For example, expand the Key Technical Decisions list to include every planned group and state why `display.*` and `graphics.*` are distinct, or normalize all Video-backed settings under one group.

### 5. U1 merge rule contradicts its own test scenario

- Evidence: U1 Approach defines last-write-wins "per sub-field" for `args.prepend`, `args.append`, `config.prepend`, `config.append`, etc. (lines 295-299). The U1 merge test then says unrelated sub-fields from the less-specific layer "are not carried" when the specific layer sets the same sub-field (lines 310-312).
- Why it matters: Per-sub-field merge implies unrelated sub-fields should be preserved; the test text implies a broader replacement behavior.
- Suggested fix: If per-sub-field merge is intended, change the test scenario to assert that unrelated sub-fields from the less-specific layer are carried forward, while the same sub-field is replaced. If parent-object replacement is intended, change the Approach and R5 explanation accordingly.

### 6. `--config` emission is left undecided despite R7/U5 treating it as required

- Evidence: R7 says the per-launch config is materialized and passed via `--config` (lines 68-69). U5's happy path expects `--config <path>` present (lines 477-479). U4's edge case leaves the behavior open: "no `--config` emitted (or an empty-but-valid file, per chosen behavior — assert the chosen one)" (lines 440-441).
- Why it matters: The implementation can legitimately choose either behavior from U4, but R7/U5 imply one of them is the contract.
- Suggested fix: Pick the contract in the plan. Either always materialize/pass an empty valid config when no entries exist, or rewrite R7/U5 to say `--config` is emitted only when config entries or `overrides.config` exist.

### 7. `overrides.args.replace` scope is ambiguous

- Evidence: R4 describes `overrides.args` `prepend`/`append`/`replace` as applying to argv (lines 59-61). U5 narrows `replace` to "the routed-flags segment only," preserving `--no-gui`, `--config`, and the game path (lines 465-468).
- Why it matters: Readers may disagree on whether `replace` is a full argv replacement escape hatch or only a plugin-controlled flags replacement.
- Suggested fix: Amend R4 or the Key Technical Decisions section to explicitly state that `overrides.args.replace` replaces only routed/plugin-controlled args, not safety-critical command/config/game-path args; or change U5 if whole-argv replacement is intended.

### 8. High-level design says the full mapping table is in U3, but later units extend it

- Evidence: The delivery decision matrix says the "full table" is in U3 (lines 256-257). U3 only covers Phase 0/1 value maps (lines 381-385). U8, U9, and U10 add additional schema/mapping rows for Phases 2-4 (lines 582-590, 621-632, 667-678).
- Why it matters: A reader may expect U3 to enumerate all final mappings, while the implementation units actually spread the final table across U3/U8/U9/U10.
- Suggested fix: Change the matrix intro to "initial table in U3, extended by U8-U10" or make U3 own a complete table scaffold with later units filling rows.

### 9. Output Structure omits files declared in implementation units

- Evidence: Output Structure lists rpcs3 `src/` files and two platform config files (lines 207-226). U7 declares `product/plugins/rpcs3/README.md` (lines 536-540), and U1 declares `product/platform/library/config/readable-cascade-resolver.test.ts` (lines 287-290), but neither appears in Output Structure.
- Why it matters: The Output Structure reads like an inventory of files changed/created; omitting peer entries makes the plan's file map inconsistent.
- Suggested fix: Add `product/plugins/rpcs3/README.md` and `product/platform/library/config/readable-cascade-resolver.test.ts` to Output Structure, or label Output Structure as a non-exhaustive excerpt.
