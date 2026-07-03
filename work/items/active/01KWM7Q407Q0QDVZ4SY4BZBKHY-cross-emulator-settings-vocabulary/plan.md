---
title: "feat: Cross-launcher launch preferences (Phase 1)"
type: feat
status: completed
date: 2026-07-03
origin: work/items/active/01KWM7Q407Q0QDVZ4SY4BZBKHY-cross-emulator-settings-vocabulary/item.md
verify_command: "just typecheck && just test-unit"
---

# feat: Cross-launcher launch preferences (Phase 1)

## Summary

Let an operator declare common launch preferences ONCE in plain, launcher-neutral
terms at any config layer — a new `preferences.launch` block, sibling of
`moonlight:`, folded across the seven layers the same way — and have each
launcher translate them into its own native settings. Set fullscreen, aspect
ratio, and volume once and they land on both RPCS3 (PS3) and Ryubing (Switch);
set a resolution and RPCS3 honors it while Ryubing, which has no absolute-pixel
knob, silently drops it. Phase 1 ships the plumbing plus four preferences
(`video.fullscreen`, `video.resolution`, `video.aspect-ratio`, `audio.volume`);
the vocabulary grows in later phases.

---

## Problem Frame

Common preferences — fullscreen, aspect ratio, volume, resolution — are
re-authored per launcher today, each in the launcher's own private shape under
`settings.plugin`. There is no shared vocabulary: to set 720p + 16:9 + volume 70
for both an RPCS3 and a Ryubing release, an operator writes it twice in two
dialects. The north star (origin `item.md`;
`work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md`
§10) is "configure my whole library's common preferences once." Two shipped
launcher policies (RPCS3, Ryubing) now exist, so the shared vocabulary is
**derived from** them rather than guessed — the deliberate gate against
premature abstraction is met.

---

## Requirements

- R1. A shared, launcher-neutral launch-preferences vocabulary exists at the inheritable/cascade layer (modeled like `MoonlightPolicy`), covering an obviously-portable subset.
- R2. RPCS3 and Ryubing each translate the shared preferences into native config via a per-launcher mapping; per-launcher-only settings under `settings.plugin` still work unchanged.
- R3. Setting a shared preference once at a shared cascade layer applies correctly across both launchers (proven by an integration test through the cascade).
- R4. No lossy common-denominator: a launcher with a capability honors a shared preference; one without silently drops it (Ryubing has no absolute resolution → drops `video.resolution`), with no error.
- R5. Launcher-specific `settings.plugin.<provider>` still overrides a shared preference; shared preferences are additive, never a ceiling.
- R6. The design is derived from the two existing launcher policies and documented.

**Origin actors:** operator (sets shared preferences), launcher-plugin author (writes a translator).
**Origin flows:** F1 set-once-apply-everywhere (fullscreen/volume); F2 launcher-specific override of a shared preference; F3 capability drop (Switch + resolution).

---

## The Vocabulary (agreed authoring shape)

The shared block lives at `preferences.launch` on any layer (a `preferences`
namespace with a `launch` sub-key, leaving room for a future
`preferences.display` covering the physical monitor / desktop resolution).
Field names are **kebab-case** to match the existing Ryubing policy style.

```yaml
users:
  simon:
    preferences:
      launch:
        video:
          fullscreen: true
          resolution: { width: 1280, height: 720 }   # structured ints, not a string
          aspect-ratio: "16:9"                        # free string (non-empty) for now
        audio:
          volume: 70                                  # 0–100
```

Phase 1 set: `video.fullscreen`, `video.resolution`, `video.aspect-ratio`,
`audio.volume`. What each launcher does with it:

| Shared preference | PS3 → RPCS3 native | Switch → Ryubing native |
|---|---|---|
| `video.fullscreen` | `Miscellaneous.Start games in fullscreen mode` + `--fullscreen` | `start_fullscreen` + `--fullscreen` |
| `video.aspect-ratio` | `Video.Aspect ratio` (only when value is one RPCS3 accepts) | `aspect_ratio` |
| `audio.volume` | `Audio.Master Volume` | `audio_volume` |
| `video.resolution` | `Video.Resolution` (`"1280x720"`) | **silently dropped — no absolute-pixel knob** |

---

## Scope Boundaries

- Phase 1 vocabulary is deliberately small: `video.fullscreen`, `video.resolution`, `video.aspect-ratio`, `audio.volume`.
- No new cascade merge machinery beyond mirroring the existing `moonlight` fold — the cascade is already maximal.
- No changes to the launchers' native `routeSettings` / `renderRyubingConfig` internals; the translator produces each launcher's own authoring shape and reuses them.
- No cross-layer specificity tracking BETWEEN the shared tree and the launcher tree (see Key Technical Decisions); launcher-specific overlays shared as a whole.
- No physical-monitor / desktop-resolution control (`preferences.display`) — the namespace is reserved but empty in Phase 1.

### Deferred to Follow-Up Work

- Phase 2 shared preferences: `frame-limit`, `vsync`, `language`, and a launcher-neutral quality/scale concept that maps to RPCS3 `Resolution Scale` AND Ryubing `docked/handheld` + `resolution-scale` (the Switch's real equivalent of "resolution").
- Non-portable knobs — `audio.backend` (RPCS3 cubeb/faudio vs Ryubing openal/sdl2 share no value domain) and `audio.device` (host-specific string, no Ryubing equivalent) — stay launcher-specific until a neutral value domain is designed. Explicitly deferred per the user's phased direction.
- Applying the vocabulary to a third launcher (RetroArch/Dolphin) to validate generality beyond the two derivation instances.
- A cross-launcher INPUT preferences vocabulary (controllers) — same idea for input, tracked separately (origin "Related").

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/config/inheritable-fields.ts` — `MoonlightPolicy` is the precedent: a curated typed policy (typed leaves + value maps) living in the generic cascade, folded per nested key. The new `preferences` field mirrors it exactly; `MoonlightStreamPolicy.resolution` (`{width,height}` positive ints) is the exact shape to copy for `video.resolution`.
- `product/platform/library/config/cascade-resolver.ts` — `foldMoonlight` / `mergeMoonlightValue`, the `viewOf*` / `readableViewOf*` extractors, `foldLayers` / `mergeReadableLayers` / `mergeByLauncher`, and the final `...(folded.moonlight ? {...})` output spread are the shape to mirror for `preferences`.
- `product/platform/library/config/resolved-launch-context.ts` — `moonlight: Schema.optional(MoonlightPolicy)` on both `ResolvedLaunchContext` and `ReadableResolvedLaunchContext`; add `preferences` beside it. **Note the collision risk:** an unrelated placeholder field named `emulator` already exists here — do NOT name anything in this feature `emulator`.
- `product/plugins/rpcs3/src/policy.ts` + `mapping.ts` — RPCS3 native shape: `video.{resolution(string),aspectRatio(Literals 16:9|4:3),fullscreen}`, `audio.volume`; `routeSettings` already turns those into config/flags.
- `product/plugins/ryubing/src/policy.ts` + `launch-spec.ts:renderRyubingConfig` — Ryubing native shape: `display.fullscreen`, `graphics.aspect-ratio` (free string), `audio.volume`; NO absolute-resolution field. Ryubing already uses kebab-case keys, so the shared vocabulary's casing matches.

### Institutional Learnings

- Origin design doc §10 fixes resolution order: normalized layer resolves first, then each launcher's own settings, then `overrides.config`. Phase 1 adopts exactly that ordering.
- Origin §4a/§8 release-layer safety: shared video/audio preferences carry no filesystem roots, so they are release-safe and need no `stripReleaseScopedRootOverrides` treatment.
- Switch resolution model (derived during shaping): Switch has no absolute output resolution — base is set by docked (~1080p) vs handheld (~720p) mode, multiplied by a `resolution-scale`. Absolute pixels is an RPCS3-style capability; the Switch equivalent is deferred to a Phase 2 quality/scale concept.

---

## Key Technical Decisions

- **New inheritable field `preferences`, nested `preferences.launch`.** Not `emulator` (already used as an unrelated placeholder in `resolved-launch-context.ts`, and not every launcher is an emulator) and not `display` (reads as the physical monitor, which `preferences.display` is reserved for later). The `preferences` namespace holds `launch` today and can grow siblings.
- **kebab-case leaf names** (`aspect-ratio`), matching the existing Ryubing policy style; keys are quoted in the Effect Schema struct as Ryubing already does.
- **`video.resolution` is structured `{width, height}` positive ints**, copied from `MoonlightStreamPolicy.resolution` — no string parsing. The RPCS3 translator renders it to RPCS3's native `"WIDTHxHEIGHT"` string.
- **`video.aspect-ratio` is a free non-empty string for now.** Aspect ratios are open-ended and cannot be a fixed list yet. RPCS3's native schema only accepts `16:9`/`4:3`, so the RPCS3 translator forwards the value only when RPCS3 supports it and otherwise drops it — the same silent-discard rule applied to values, not just keys. Ryubing's native `aspect-ratio` is already a free string, so it passes through directly.
- **Translate to each launcher's OWN authoring shape, then decode once.** Each launcher's `preferences-mapping.ts` turns folded `preferences.launch` into a partial of that launcher's raw policy input (RPCS3 → `{ video, audio }`; Ryubing → `{ display, graphics, audio }`). Existing native `routeSettings` / `renderRyubingConfig` are reused unchanged.
- **Precedence: shared is the base, launcher-specific overlays on top (launcher wins).** Deep-merge `translate(preferences.launch)` UNDER the folded `context.plugin[provider]` object before decode (satisfies R5, matches §10 ordering).
- **Capability drop is emergent, not special-cased.** A translator only maps the preferences it can honor; a key it does not list is simply never consumed (Ryubing omits `resolution`). No capability registry, no per-launcher `if`. This is why Switch is not a hardcoded exception.
- **Cross-layer specificity between shared and launcher trees is deliberately NOT tracked in Phase 1.** A launcher-specific key at any layer beats a shared key at any layer. Documented simplification; revisit only if a real conflict case demands per-field layer provenance.

---

## Open Questions

### Resolved During Planning

- Which preferences ship in Phase 1? → `video.fullscreen`, `video.resolution`, `video.aspect-ratio`, `audio.volume`.
- resolution/aspect-ratio value shape? → resolution structured `{width,height}`; aspect-ratio free string for now.
- Block name & casing? → `preferences.launch`, kebab-case leaves.
- Switch + resolution? → Ryubing silently drops it (translator has no rule for the key).
- Non-portable audio backend/device? → Deferred; stay launcher-specific.

### Deferred to Implementation

- The exact set of aspect-ratio values RPCS3 will forward vs drop (currently `16:9`/`4:3`) — settle against RPCS3's native literal when writing the translator.
- Whether `foldPreferences` can be a plain scalar-last-win deep-merge or needs any special-cases like `mergeMoonlightValue` — Phase 1 leaves are scalars plus one `{width,height}` object, so plain deep-merge is expected; confirm when wiring.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Authoring (any layer)                    Resolution (cascade-resolver)          Launcher materializer
─────────────────────                    ─────────────────────────────          ─────────────────────
preferences.launch.video.fullscreen  ─┐
preferences.launch.video.resolution  ├─ foldPreferences (deep-merge,   ─┐
preferences.launch.video.aspect-ratio│   scalars last-win, like         │
preferences.launch.audio.volume     ─┘   moonlight)                     │
                                                                         ├─ context.preferences ─┐
settings.plugin["@korri:rpcs3"] ──────── foldPluginPolicies ────────────┘   context.plugin[p]   │
                                                                                                 │
                                            RPCS3: translatePreferences(preferences.launch) ─────┤ base
                                                   → { video:{ resolution:"1280x720",             │
                                                       aspectRatio, fullscreen }, audio:{volume} }│ deep-merge
                                                   ⊕ context.plugin["@korri:rpcs3"]  (plugin wins)┘
                                                   → decodeRpcs3Policy → routeSettings ✔

                                            Ryubing: translatePreferences(preferences.launch)
                                                   → { display:{fullscreen},
                                                       graphics:{"aspect-ratio"}, audio:{volume} }  # resolution OMITTED
                                                   ⊕ context.plugin["@korri:ryubing"]
                                                   → decodeRyubingPolicy → renderRyubingConfig ✔
```

---

## Implementation Units

### U1. Shared `Preferences` schema at the inheritable layer

**Goal:** Define the Phase 1 launcher-neutral vocabulary as a typed Effect Schema at `preferences.launch` and expose a decoder, mirroring `MoonlightPolicy`.

**Requirements:** R1, R4, R5

**Dependencies:** None

**Files:**
- Modify: `product/platform/library/config/inheritable-fields.ts`
- Test: `product/platform/library/config/inheritable-fields.test.ts`

**Approach:**
- Add `LaunchVideoPreferences` (`fullscreen?: boolean`, `resolution?: { width, height }` positive ints reusing the `MoonlightResolutionPolicy` shape, `"aspect-ratio"?: NonEmptyString`) and `LaunchAudioPreferences` (`volume?: number` bounded 0–100).
- Compose `LaunchPreferences = Schema.Struct({ video?, audio? })` and `Preferences = Schema.Struct({ launch?: LaunchPreferences })`.
- Export `Preferences`, its type, and `decodePreferences` (strict, `onExcessProperty: "error"`) beside `decodeMoonlightPolicy`.
- Add `preferences: Schema.optional(Preferences)` to `InheritableLayer`; extend the header merge-rule comment with `preferences → deep merge per nested key; scalars last-wins`.
- Keep values neutral: no RPCS3/Ryubing strings leak in; kebab-case keys quoted.

**Patterns to follow:** `MoonlightPolicy` / `MoonlightStreamPolicy` / `MoonlightResolutionPolicy` and `decodeMoonlightPolicy` in the same file.

**Test scenarios:**
- Happy path: decode `{ launch: { video: { fullscreen: true, resolution: { width: 1280, height: 720 }, "aspect-ratio": "16:9" }, audio: { volume: 70 } } }` round-trips.
- Edge case: empty `{}` and `{ launch: {} }` decode fine.
- Error path: unknown key (`video: { widht: 1 }`) fails strict decode with the offending path.
- Error path: `audio.volume` out of range (`-1`, `101`) fails with the range message.
- Error path: `resolution: { width: 0 }` fails positive-int check; `aspect-ratio: ""` fails non-empty.

**Verification:** `Preferences` decodes/rejects as specified; `InheritableLayer` accepts a `preferences` block.

---

### U2. Carry `preferences` on the layer-bearing record schemas

**Goal:** Every cascade layer that already carries `moonlight` also carries `preferences`.

**Requirements:** R1, R3

**Dependencies:** U1

**Files:**
- Modify: `product/platform/library/config/records/global.ts`
- Modify: `product/platform/library/config/records/user.ts`
- Modify: `product/platform/library/config/records/host.ts`
- Modify: `product/platform/library/config/records/launcher.ts`
- Modify: `product/platform/library/config/records/runtime.ts`
- Modify: `product/platform/library/config/records/profile.ts`
- Modify: `product/platform/library/config/records/preset.ts`
- Modify: `product/platform/library/config/records/app.ts`
- Modify: `product/platform/library/config/records/game.ts`
- Modify: `product/platform/library/config/records/source.ts`
- Modify: `product/platform/library/config/records/library-item.ts` (item, contained, and `ReleaseLaunch` layers that carry `moonlight`)
- Modify: `product/platform/library/config/ephemeral-override.ts` (declares `moonlight: Schema.optional(MoonlightOverridePolicy)`; add `preferences: Schema.optional(Preferences)` beside it — all shared preferences are release/override-safe, so no override-specific schema is needed)
- Test: `product/platform/library/config/records/readable-schema.test.ts`

**Approach:**
- For the ten `records/*.ts` files, add `preferences: InheritableLayer.fields.preferences` wherever `moonlight: InheritableLayer.fields.moonlight` appears — all ten use that exact idiom.
- For `ephemeral-override.ts`, add `preferences: Schema.optional(Preferences)` mirroring its distinct `moonlight` override line.
- Mechanical, one line per site; verify with a `grep moonlight` sweep that every occurrence has an adjacent `preferences`.

**Execution note:** Characterization-first — add a `readable-schema.test.ts` assertion that a record with a `preferences` block decodes before editing, so the sweep is covered.

**Patterns to follow:** Existing `moonlight: InheritableLayer.fields.moonlight` lines (e.g. `library-item.ts:172,253`).

**Test scenarios:**
- Happy path: a `UserRecord` / `AppRecord` / `ReleaseLaunch` with `preferences: { launch: { video: { fullscreen: true } } }` decodes.
- Error path: a `preferences` block with an unknown nested key fails strict decode at the right layer.

**Verification:** Every record that accepts `moonlight` accepts `preferences`; `just typecheck` passes across the config package.

---

### U3. Fold `preferences` through the resolver and surface it on the launch context

**Goal:** The resolver deep-merges `preferences` across all layers (readable and local paths) and the folded value reaches materializers on both resolved-context types.

**Requirements:** R1, R3, R5

**Dependencies:** U1, U2

**Files:**
- Modify: `product/platform/library/config/cascade-resolver.ts`
- Modify: `product/platform/library/config/resolved-launch-context.ts`
- Test: `product/platform/library/config/cascade-resolver.test.ts` (exists — extend it)

**Approach:**
- Add `preferences?: Preferences` to `InheritableView`, `ReadableLayerView`, and `ReadableOverride`.
- Add a `foldPreferences(base, extra)` helper mirroring `foldMoonlight` — a plain deep-merge (objects deep, scalars last-win); the `{width,height}` object deep-merges naturally.
- Populate `preferences` in every `viewOf*` / `readableViewOf*` extractor that already reads `moonlight`.
- Fold it in `foldLayers`, `mergeByLauncher`, and `mergeReadableLayers` next to the `moonlight` handling.
- Emit `...(folded.preferences ? { preferences: folded.preferences } : {})` in `resolveReadableLaunchContext`.
- Add `preferences: Schema.optional(Preferences)` to both `ResolvedLaunchContext` and `ReadableResolvedLaunchContext`.

**Patterns to follow:** Every `moonlight` touch-point in `cascade-resolver.ts` and `resolved-launch-context.ts`.

**Test scenarios:**
- Integration: `preferences.launch.video.resolution` set only at the user layer surfaces on `context.preferences` for a release launch.
- Integration: `audio.volume` set at user AND overridden at release layer → release value wins (deep-merge last-win).
- Integration: `video` set at user and `audio` set at system → both present on the folded context (deep-merge, not replace).
- Edge case: no `preferences` anywhere → `context.preferences` is absent (not `{}`).

**Verification:** Folded `preferences` appears on the readable launch context with correct per-key last-win semantics.

---

### U4. RPCS3 preferences translator + materializer wiring

**Goal:** RPCS3 honors the shared preferences — `video.fullscreen/resolution/aspect-ratio` and `audio.volume` — with launcher-specific `settings.plugin` still winning.

**Requirements:** R2, R4, R5

**Dependencies:** U3

**Files:**
- Create: `product/plugins/rpcs3/src/preferences-mapping.ts`
- Modify: `product/plugins/rpcs3/src/materializer.ts`
- Test: `product/plugins/rpcs3/src/preferences-mapping.test.ts`

**Approach:**
- `preferences-mapping.ts` exports `translatePreferencesToRpcs3(launch?: LaunchPreferences): Partial<Rpcs3Policy input>` producing `{ video: { resolution, aspectRatio, fullscreen }, audio: { volume } }`, where it renders `{width,height}` → `"1280x720"` and forwards `aspect-ratio` ONLY when the value is one RPCS3 accepts (drop otherwise).
- In `materializer.ts` `decodePolicy`, deep-merge `translatePreferencesToRpcs3(context.preferences?.launch)` UNDER `context.plugin?.[KORRI_RPCS3_PLUGIN_ID] ?? {}` (plugin wins), then `decodeRpcs3Policy` the merged object; `canDecodePolicy` reads the same merged input.
- Existing `routeSettings` handles native→delivery unchanged.

**Patterns to follow:** `decodePolicy` / `canDecodePolicy` in `materializer.ts`; the value-map style in `mapping.ts`.

**Test scenarios:**
- Happy path: `preferences.launch.video.resolution = {1280,720}` alone → routed `Video.Resolution = 1280x720`.
- Happy path: `audio.volume = 70` → `Audio.Master Volume = 70`; `video.fullscreen = true` → `--fullscreen` + config key.
- Edge case: `aspect-ratio = "16:9"` → `Video.Aspect ratio = 16:9`; `aspect-ratio = "21:9"` (unsupported) → dropped, no decode error.
- Integration (R5): shared `video.fullscreen = false` but `plugin.video.fullscreen = true` → RPCS3 gets `true`.
- Edge case: no `preferences` and no plugin block → unchanged behavior.

**Verification:** A shared preference alone materializes the correct RPCS3 config/flags; launcher-specific overrides win; unsupported aspect-ratio drops cleanly.

---

### U5. Ryubing preferences translator + materializer wiring (capability drop)

**Goal:** Ryubing honors `video.fullscreen`, `video.aspect-ratio`, `audio.volume`, and silently OMITS `video.resolution` — proving R4.

**Requirements:** R2, R4, R5

**Dependencies:** U3

**Files:**
- Create: `product/plugins/ryubing/src/preferences-mapping.ts`
- Modify: `product/plugins/ryubing/src/materializer.ts`
- Test: `product/plugins/ryubing/src/preferences-mapping.test.ts`

**Approach:**
- `preferences-mapping.ts` exports `translatePreferencesToRyubing(launch?: LaunchPreferences): Partial<RyubingPolicy input>` producing `{ display: { fullscreen }, graphics: { "aspect-ratio" }, audio: { volume } }`; `video.resolution` is intentionally NOT mapped (no key for it → dropped).
- Ryubing's native `aspect-ratio` is a free string, so the value passes through directly.
- In `materializer.ts` `readPolicy`, deep-merge `translatePreferencesToRyubing(context.preferences?.launch)` UNDER `context.plugin?.[KORRI_RYUBING_PLUGIN_ID] ?? {}`, then `decodeRyubingPolicy`; `canResolve` reads the merged input.

**Patterns to follow:** `readPolicy` in `materializer.ts`; the `kebabEnum` maps in `launch-spec.ts:renderRyubingConfig`.

**Test scenarios:**
- Happy path: `audio.volume = 60` → rendered `audio_volume = 60`; `video.fullscreen = true` → `start_fullscreen = true`.
- Happy path: `video.aspect-ratio = "16:9"` → rendered `aspect_ratio` set.
- R4 drop: `video.resolution = {1280,720}` → NO resolution-related key in the rendered config and no decode error.
- Integration (R5): shared `video.fullscreen = false` but `plugin.display.fullscreen = true` → Ryubing gets `true`.

**Verification:** Ryubing honors supported preferences and silently omits resolution; launcher-specific overrides win.

---

### U6. Cross-cascade integration test + derivation design doc

**Goal:** Prove the end-to-end payoff — one shared preference at a shared layer applies to BOTH launchers, with the Switch resolution drop — and document the derivation (R6).

**Requirements:** R3, R6

**Dependencies:** U4, U5

**Files:**
- Create: `product/platform/library/config/launch-preferences.integration.test.ts` (or nearest existing cross-plugin test home)
- Create: `work/items/active/01KWM7Q407Q0QDVZ4SY4BZBKHY-cross-emulator-settings-vocabulary/design.md`

**Approach:**
- Integration test: build a snapshot with `preferences.launch.audio.volume` and `video.fullscreen` set once at the user/system layer; resolve two releases (one RPCS3, one Ryubing) through `resolveReadableLaunchContext`; materialize each; assert both reflect the shared value (RPCS3 `Audio.Master Volume`, Ryubing `audio_volume`), and that a shared `video.resolution` lands on RPCS3 but is absent from Ryubing's output.
- `design.md`: document the vocabulary derived from the two launcher policies — the neutral key set at `preferences.launch`, value shapes (structured resolution, string aspect-ratio, bounded volume), the precedence rule (shared base → launcher overlay → overrides), the emergent capability-drop rule, and the deferred (Phase 2 / non-portable / `preferences.display`) items with rationale.

**Patterns to follow:** Existing resolver/materializer tests that build a `ReadableConfigSnapshot`; origin design doc §9/§10 for documentation shape.

**Test scenarios:**
- Covers F1: shared `audio.volume` set once at user layer applies to both a resolved RPCS3 and a resolved Ryubing release.
- Covers F3 / R4: shared `video.resolution` set once → present in RPCS3 materialization, absent from Ryubing's.
- Covers F2 / R5: a launcher-specific override at the release layer beats the shared value for that launcher only.

**Verification:** The integration test passes; `design.md` documents the derived vocabulary, precedence, and deferrals.

---

## System-Wide Impact

- **Interaction graph:** New `preferences` field threads through every layer-bearing record → resolver fold → resolved context → both launcher materializers. The only behavioral change to launchers is at their single decode seam.
- **Error propagation:** Strict decode on `Preferences` (typos fail loudly) and unchanged `AppMaterializationFailed` paths in each launcher.
- **State lifecycle risks:** None new — the shared preferences carry no filesystem roots and touch only generated per-launch config/flags.
- **API surface parity:** Other typed launcher plugins (Steam, RetroArch) do not consume `preferences` in Phase 1; they ignore it. Adding a translator later is additive and per-launcher.
- **Integration coverage:** U6 is the cross-layer proof that unit tests on either side cannot show alone.
- **Unchanged invariants:** `settings.plugin`, `moonlight`, `plugin`, `overrides` semantics and every native `routeSettings` / `renderRyubingConfig` output are unchanged when no `preferences` block is present. Release-layer safety is untouched; shared preferences are release-safe by construction. The existing `emulator` placeholder in `resolved-launch-context.ts` is not touched or shadowed.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Missing a `preferences` site among the ~13 records → a layer silently can't carry the field | U2 grep sweep over every `moonlight` occurrence + `readable-schema.test.ts` coverage |
| Shared `aspect-ratio` string value RPCS3 can't accept → decode failure | RPCS3 translator forwards only supported values, drops others (same silent-discard rule); covered by a U4 test |
| Precedence surprises (operator expects a release-layer shared preference to beat a user-layer launcher key) | Documented Phase 1 simplification in Key Technical Decisions + design.md |
| Scope creep into non-portable audio backend/device or Switch resolution-scale | Explicitly deferred in Scope Boundaries per user's phased direction |

---

## Sources & References

- **Origin item:** `work/items/active/01KWM7Q407Q0QDVZ4SY4BZBKHY-cross-emulator-settings-vocabulary/item.md`
- Origin design doc (§10 normalized policy, precedence order): `work/items/active/20260702-rpcs3-aka-source-plugin/rpcs3-settings-maximalist-proposal.md`
- Cascade precedent: `product/platform/library/config/inheritable-fields.ts` (`MoonlightPolicy`), `product/platform/library/config/cascade-resolver.ts`
- Derivation instances: `product/plugins/rpcs3/src/{policy,mapping,materializer}.ts`, `product/plugins/ryubing/src/{policy,materializer,launch-spec}.ts`
