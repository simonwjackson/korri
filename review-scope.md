# Scope review — RPCS3 settings surface plan

Document type: plan  
Origin: `.worktrees/feat/rpcs3-aka-source-plugin/work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md`

## What already exists / minimum-change baseline

- The RPCS3 plugin already has the launch-critical seam: `policy.ts`, `materializer.ts`, and `launch-spec.ts` validate command/content/state/firmware and assemble `--no-gui ... gameFolder`.
- The readable config stack already deep-merges `settings.plugin`; the missing piece is not cascade infrastructure, but a richer RPCS3 policy plus materialization.
- `LaunchOverrides` already exists on release launch records, but is not surfaced onto `ReadableResolvedLaunchContext`; wiring that is a legitimate Phase 0 dependency.
- Existing plugin patterns cover most of the needed mechanics: Ryubing has Effect Schema policy + state-root atomic config writes; RetroArch has typed settings plus a break-glass layer rendered last.
- The repo already depends on YAML tooling. A custom YAML string renderer should be kept narrow or avoided.

## Recommendation

The all-four-phases expansion is **not warranted as one active plan**. Ship the foundation and Phase 1 settings first: U1-U7, with U2/U3 limited to boot essentials + the seven “everyone has an opinion” settings. Keep U8 as a short candidate follow-up if Aka actually needs renderer/backend/language/resolution-scale defaults. Move U9 and U10 out of this plan.

The plugin-local unified schema and mapping table are proportionate **only while scoped to the current launch-enabling settings**. They stop earning their keep when used to justify typed curation of the ~200-key long tail that `overrides.config` already reaches.

## Findings

### P1 — Cut Phase 4 and do not treat the full `config.yml` surface as required

The plan makes “full curated `config.yml` surface” a requirement and scope boundary, including deep defaults and nested subtrees. The origin says the opposite for the long tail: the raw escape hatch is present from Phase 0, later phases “never unblock something,” and Phase 4 settings are “sane defaults nobody touches” that should get nice names “on demand.”

**Impact:** U10 turns reachable-but-rare emulator internals into permanent Korri API surface, maintenance, value maps, tests, and version-drift liability without serving the current Aka launch goal.

**Recommendation:** Remove U10 from active scope. Replace it with a deferred note: “Add individual deep settings only when a concrete game/operator need appears; otherwise use `overrides.config`.”

**Confidence:** 100

### P1 — U9 conflicts with the plan’s own scope boundary

The plan explicitly says “no per-game tuning,” but U9 is “Phase 3 — per-game tuning” and models CPU/GPU accuracy knobs people flip for specific troublesome games.

**Impact:** This pulls game-specific tuning API work into a launcher-surface slice with no per-game acceptance target, making the plan harder to finish and verify.

**Recommendation:** Move U9 to a separate per-game-tuning work item with concrete game examples and acceptance checks. Until then, use `overrides.config` for one-off accuracy knobs.

**Confidence:** 100

### P2 — U8 is plausible follow-up work, not necessary for this slice

U8’s renderer/backend/language/resolution-scale settings are more defensible than U9/U10, but the origin still classifies them after Phase 1 and says unmodeled settings are reachable day one through the escape hatch.

**Impact:** Including U8 in the same active plan expands validation/mapping surface before proving the launch-enabling path works.

**Recommendation:** Keep U8 out of the required implementation path. Promote only the subset that Aka’s default launcher actually needs now; otherwise defer it as “Phase 2 candidates.”

**Confidence:** 75

### P2 — The mapping/router abstraction is acceptable only if kept plugin-local and phase-limited

A unified policy plus an internal mapping table earns its keep for Phase 0/1 because the same authoring tree must fan out to argv, config YAML, GUI ini, env, and assertions. But the plan’s “full table” framing and U8-U10 expansion make the router look like a miniature settings framework for one plugin.

**Impact:** Implementers may build a generalized delivery-router abstraction to support speculative future keys instead of a simple RPCS3-local mapper for current settings.

**Recommendation:** Keep `mapping.ts` concrete and local: a small list of current leaves plus value maps. Do not generalize delivery routing beyond RPCS3, and do not design it around U9/U10 until those are re-promoted.

**Confidence:** 75

### P2 — Avoid a bespoke YAML renderer growing to match U10

U4 proposes `renderConfigYaml(entries)`, U9 adds sequence rendering, and U10 adds multi-level nesting. That path grows a handwritten YAML serializer because the plan expanded to nested long-tail settings.

**Impact:** Custom YAML serialization is avoidable complexity and becomes more brittle as the modeled surface grows.

**Recommendation:** For the active slice, build a plain object from routed config entries and use existing YAML tooling to stringify/parse in tests. If U10 is deferred, `config-render.ts` only needs to own RPCS3 config assembly and override application, not YAML syntax mechanics.

**Confidence:** 75

### P2 — U9 dependency order is incomplete

U9 lists dependencies only on U2/U3, but its approach says `config-render.ts` must render the first list-valued config entry (`core.librariesControl`). That makes U9 depend on U4’s config renderer too.

**Impact:** The dependency graph understates implementation order and verification coupling.

**Recommendation:** If U9 is ever re-promoted, declare U4 as a dependency and include list rendering in the config-render acceptance for that unit.

**Confidence:** 100
