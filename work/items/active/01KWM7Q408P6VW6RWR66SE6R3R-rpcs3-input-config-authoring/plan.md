---
title: "feat: RPCS3 --input-config content authoring (pad/keyboard mappings)"
type: feat
status: active
date: 2026-07-03
origin: work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/item.md
verify_command: "bun test product/plugins/rpcs3/src"
---

# feat: RPCS3 --input-config content authoring (pad/keyboard mappings)

## Summary

Give the `@korri:rpcs3` plugin the ability to **author the body of an RPCS3
input profile** declaratively, not just reference a pre-existing one. Add a
delivery-agnostic `input` group to the unified `Rpcs3Policy` tree (per-player
handler/device, button/axis bindings, deadzones, stick multipliers,
keyboard/mouse handlers), an input mapping/value-map table that translates clean
Korri names into RPCS3's exact input-config strings (verified against RPCS3
source, the same discipline the `config.yml` value maps used), and a renderer
that materializes `<state.root>/input_configs/<korri-name>.yml` **atomically**
into a **Korri-owned profile name** so operator profiles are never clobbered.
The materializer then passes that name via `--input-config`. This mirrors the
just-shipped settings surface — `policy.ts` → `mapping.ts` → `config-render.ts`
→ `materializer.ts` — as the input-file analogue (`input-policy.ts` →
`input-mapping.ts` → `input-config-render.ts` → materializer wiring).

---

## Problem Frame

`composeRpcs3LaunchSpec` already accepts an optional `inputConfig` and emits
`--input-config <name>` after `--config`, but the **readable materializer never
passes it** and nothing in the plugin writes the profile. So input authoring is
100% hand-config today: operators open RPCS3's pad UI (or hand-edit
`input_configs/*.yml`) to define button/axis maps, deadzones, per-player pad
assignments, and keyboard/mouse handlers. That is the last hand-config gap
blocking fully unattended, reproducible PS3 launches, and it is the input analogue
of the `config.yml` gap the settings-surface plan just closed. RPCS3 stores input
profiles **separately** from `config.yml` — under `<state.root>/input_configs/<name>.yml`
(`state.root` is the RPCS3 config dir; `XDG_CONFIG_HOME`/`HOME` derive from its
parent — see `product/plugins/rpcs3/src/materializer.ts` `buildLaunchEnv`) — as
its own per-player YAML schema. Full rationale is in the origin item.

---

## Requirements

- R1. RPCS3 pad/keyboard mappings — per-player handler/device, button/axis
  bindings, deadzones/ranges, trigger thresholds, stick multipliers,
  keyboard/mouse handlers — are **declarable** in the plugin's unified settings
  tree, delivery-agnostic (no RPCS3 target strings in the authoring schema).
  *(origin AC 1)*
- R2. The plugin **materializes** `<state.root>/input_configs/<name>.yml`
  atomically and references it via `--input-config <name>`, without hand-editing
  RPCS3. *(origin AC 2)*
- R3. Input-config keys/values are **verified against RPCS3 source** (handler
  enum strings, button target keys, stick/deadzone keys) the same way the
  `config.yml` value maps were verified against `system_config.h`. *(origin AC 3)*
- R4. The operator's existing input configs are **not clobbered**: Korri writes
  a dedicated **Korri-owned profile name**, never an operator profile file.
  *(origin AC 4)*
- R5. The design documents how this **converges** with the normalized
  cross-emulator input vocabulary and Korri's existing controller /
  inputplumber ownership work, so Korri does not end up authoring pad maps two
  different ways. *(origin AC 5)*

**Origin actors/flows/acceptance examples:** the origin is a parked backlog
item with acceptance-criteria bullets, not a brainstorm requirements doc, so it
defines no A/F/AE IDs. R-IDs above are derived during planning and traced to the
origin AC bullets.

---

## Scope Boundaries

- Not building the **normalized cross-emulator input vocabulary** — RPCS3 stays a
  standalone typed `input` tree this plan; U7 only produces the convergence
  **design note** that the (now-active) preferences/vocabulary initiative
  (`01KWM7Q407`, Phase 1 video/audio shipped) will consume. The landed
  `preferences.launch` covers video/audio only; input is not yet a neutral sibling.
- Not taking over runtime controller ownership / inputplumber wiring. This plan
  authors the RPCS3 **profile file**; it does not change how physical pads are
  discovered, hot-plugged, or owned at runtime (that is the
  `refactor/inputplumber-runtime-ownership` effort). U7 documents the seam so the
  two do not collide.
- Not authoring **camera / move / buzz / turntable / GHLtar / USIO** exotic
  device configs — pad + keyboard/mouse handlers only; exotic handlers stay
  reachable via the raw escape hatch.
- Not adding a new **generic** cross-plugin input surface; the input authoring
  lives inside the RPCS3 plugin, mirroring how the settings surface stayed
  plugin-local before cross-emulator generalization.
- No device rollout in this plan; on-Aka live validation stays gated on
  operator-supplied firmware (same gate as the settings surface).
- The existing raw `--input-config <name>` **passthrough** (referencing a
  pre-existing operator profile) is retained, not removed; this plan adds
  authoring alongside it and defines precedence (U5).

### Deferred to Follow-Up Work

- Normalized cross-emulator **input** vocabulary (one mapping serving multiple
  emulators): the settings side is **active/partly shipped**
  (`work/items/active/01KWM7Q407…`, Phase 1 video/audio). The input sibling is the
  natural next extension; this plan feeds it the RPCS3 instance + U7 design note
  only.
- Exotic RPCS3 input handlers (camera/move/buzz/etc.): escape-hatch-only until a
  concrete need appears.
- `overrides`-style raw **input-config** passthrough text (author raw
  `input_configs` YAML) if a need arises beyond the named passthrough — evaluate
  after U5.

---

## Context & Research

### Relevant Code and Patterns

- `product/plugins/rpcs3/src/launch-spec.ts` — `composeRpcs3LaunchSpec` already
  accepts `inputConfig` and emits `--input-config <name>` after `--config`; the
  single argv authority. Only the **materializer** needs to start supplying the
  name.
- `product/plugins/rpcs3/src/policy.ts` — unified `Rpcs3Policy` Effect Schema
  (`video`/`audio`/`boot`/`system`/`state`/`firmware`); the `input` group is
  composed in here. `NonEmptyString`/`IntInRange`/`STRICT` helpers to reuse.
- `product/plugins/rpcs3/src/mapping.ts` — `routeSettings` + value maps, all
  strings verified against RPCS3 source with the version pinned in the file
  header (`0.0.41-nixpkgs-40e9ee5`). The **direct template** for `input-mapping.ts`.
- `product/plugins/rpcs3/src/config-render.ts` — `renderConfigYaml`:
  parse/deep-merge/`stringify` via the `yaml` package, serialize-once discipline.
  Template for `input-config-render.ts`.
- `product/plugins/rpcs3/src/materializer.ts` — `materializeReadableRpcs3Resources`,
  `writeAtomic` (temp+rename, `0o640`), `readOptionalFile` (ENOENT-only swallow),
  `buildLaunchEnv` (state-root → XDG). New input write mirrors `writeLaunchConfig`.
- `product/plugins/rpcs3/src/plugin.ts` — default `settings.plugin` record; where
  a default/example `input` block and the README pointer land.
- `product/plugins/rpcs3/src/gui-preseed.ts` — precedent for a second
  state-root-targeted materialized artifact alongside `config.yml`.
- `product/plugins/ryubing/src/policy.ts` — reference for a rich nested typed
  policy with per-domain `Schema.Struct` groups + value maps.
- **NEW (landed since planning) — the launcher-neutral preferences system:**
  - `product/platform/library/config/inheritable-fields.ts` — `LaunchPreferences`
    / `Preferences` neutral schema (`preferences.launch.{video,audio}`), folded
    like `MoonlightPolicy` across every cascade layer; the `preferences`
    namespace is explicitly reserved for future siblings.
  - `product/plugins/rpcs3/src/preferences-mapping.ts` — the RPCS3 **translator**:
    `translatePreferencesToRpcs3(launch)` → partial `settings.plugin` object, and
    `resolveRpcs3PolicyInput({preferences, plugin})` deep-merges preferences
    **under** the plugin policy (plugin wins) and decodes once. Capability gaps
    drop cleanly (unmapped key = no error).
  - `product/plugins/rpcs3/src/materializer.ts:253` — `rpcs3PolicyInput` already
    routes decode through `resolveRpcs3PolicyInput`, so `Rpcs3Policy.input` (U2)
    rides the merged/decoded policy for free; preferences carry **no** input yet,
    so `resolvedPolicy.input` comes purely from the plugin layer.
  - Design: `work/items/active/01KWM7Q407Q0QDVZ4SY4BZBKHY-cross-emulator-settings-vocabulary/design.md`
    (Phase 1: video/audio only; input not yet in the neutral vocabulary).

### Institutional Learnings

- **Predecessor fully landed on trunk** (commits `b86ac5df`…`6222bace`): the
  unified settings surface shipped through Phase 3 (per-game accuracy, list-valued
  renderer), and the cross-launcher **preferences** system + RPCS3 translator
  landed on top (`b74162a6`…`15b1861b`). The template this plan mirrors is now
  real, richer than at plan time, and proven end-to-end
  (`launch-preferences.integration.test.ts`).
- Settings-surface `work.md` (predecessor): the `--config` contract was resolved
  from **RPCS3 source** (`Emu/System.cpp`) rather than the device — same
  source-grounding approach applies to the input-config serializer (U1).
- `docs/solutions/runtime-errors/retroarch-*-2026-05-27.md` — keep CLI/argv
  unambiguous; hidden flag precedence bites. Relevant to `--input-config` vs
  passthrough precedence (U5).

### External References

- **U1 is done** — the full contract is captured in `input-config-contract.md`,
  source-grounded against RPCS3 `pad_config.h` / `pad_config.cpp` /
  `pad_config_types.cpp` / `system_utils.cpp` and the live Aka device
  (`0.0.41-nixpkgs-40e9ee5`). Profiles live at
  `<config_dir>/input_configs/global/<name>.yml`, per-player (`Player N Input:` →
  `Handler`, `Device`, `Config:` map, `Buddy Device`), `--input-config` takes the
  bare name and its override branch wins over title/active selection. The obsolete
  `config_linuxjoystick.yml` gist format was explicitly rejected in favor of source.

---

## Key Technical Decisions

- **Input authoring is a new group inside the SAME unified tree, not a new
  surface.** Add `input?` to `Rpcs3Policy`; the big per-player schema lives in a
  dedicated `input-policy.ts` and is composed into `policy.ts` as
  `input: Schema.optional(Rpcs3InputPolicy)`. Keeps the unified-tree principle
  (author declares *what*, plugin decides *how*) while isolating a large schema
  in its own file, exactly as the origin item requested.
- **Input config is its OWN delivery target — a separate file — so it gets its
  own mapping+render pair, not a fourth bucket in `routeSettings`.** `routeSettings`
  returns `{flags, configEntries, iniEntries}` for the `config.yml`/ini world.
  The input profile is a whole separate YAML file addressed by `--input-config`,
  so `input-mapping.ts` (`routeInputConfig`) + `input-config-render.ts`
  (`renderInputConfigYaml`) mirror `mapping.ts`/`config-render.ts` rather than
  overloading them. This preserves the "one target per module" locality the
  settings surface established.
- **Korri-owned profile name — never clobber operator profiles (R4).** Materialize
  to a deterministic Korri-owned name (default `korri`, or `korri-<releaseId>`
  for per-release isolation — U5 picks based on whether concurrent distinct
  profiles are needed). Korri only ever writes `input_configs/korri*.yml`;
  operator-authored profiles are untouched. This is the "dedicated korri-owned
  profile name" arm of the origin AC, chosen over read-merging an operator file
  because an input profile is a coherent whole (partial merges produce
  half-mapped pads) and a distinct name is unambiguous.
- **Passthrough precedence (R2 + retained passthrough).** When the `input` policy
  is authored, the plugin materializes the Korri-owned profile and passes ITS
  name via `--input-config`, taking precedence over a raw passthrough
  `inputConfig` string. A raw passthrough with no authored `input` policy keeps
  today's behavior (reference an existing profile). Both-set is documented:
  authored wins. Decided in U5; asserted in tests.
- **All RPCS3 input strings are verified and centralized in `input-mapping.ts`
  (R3), with the version pinned in the file header** (same
  `0.0.41-nixpkgs-40e9ee5` build as `mapping.ts`). Handler enum spellings, button
  target keys, and stick/deadzone keys are the single source of truth there;
  version drift is contained to that file, and unmodeled exotic handlers stay
  escape-hatch-only.
- **Serialize-once, atomic write.** Build the input object, `stringify` once via
  the `yaml` package, `writeAtomic` (temp+rename, `mode 0o640`, `mkdir -p
  input_configs/`) — reusing the settings-surface discipline so no yaml-cpp
  duplicate-key or partial-write hazard.
- **Companion `config.yml` `Input/Output` keys — RESOLVED by U1: none needed for
  pad.** The per-player pad handler lives entirely in the profile file
  (`cfg_player.Handler`); `--input-config` alone binds pads. The `config.yml`
  `Input/Output` section selects PS3 *device-class emulation* (keyboard/mouse/
  camera/move as PS3 peripherals) — a distinct concept, deferred/escape-hatch
  here. "Keyboard-as-pad" (`Handler: Keyboard`) is in the profile file, not
  `config.yml`. See `input-config-contract.md` §5.
- **Materialization path (U1-corrected):** `--input-config <name>` loads
  `<state.root>/input_configs/**global**/<name>.yml` (the override branch calls
  `get_input_config_dir()` with an empty title → `global/`), and takes the **bare
  profile name** (no path/extension). Write to `input_configs/global/<korriName>.yml`;
  pass `--input-config <korriName>`.
- **Handler literals are the Linux-available set only (U1):** `null`, `keyboard`,
  `ds3`, `ds4`, `dualsense`, `skateboard`, `move`, `sdl`, `evdev`. `xinput`/`mm`
  are `_WIN32`-only and are omitted (Korri targets Linux devices).
- **Partial profiles are valid (U1):** any `cfg_pad` key absent from the file
  falls back to its RPCS3 default (device `Default.yml` is handler/device-only),
  so the renderer emits only authored keys — no need to write the full ~60-key map.
- **Shape `Rpcs3Policy.input` as the decode target a future input translator will
  feed (forward-compat with the landed preferences pattern).** The neutral
  preferences system (`preferences.launch.{video,audio}` +
  `resolveRpcs3PolicyInput`) shipped while this was planned, but it does **not**
  yet cover input. Keep the `input` schema decode-friendly so that, when a neutral
  controller vocabulary later appears, an RPCS3 input translator (analogous to
  `translatePreferencesToRpcs3`) can produce a partial `input` object, deep-merge
  it **under** the plugin's `input` policy, and decode once — no rework to the
  renderer/materializer. This plan does **not** build that translator (U7 only
  documents the seam); it just avoids foreclosing it.

---

## Open Questions

### Resolved During Planning

- Where the input schema lives: dedicated `input-policy.ts`, composed into
  `Rpcs3Policy.input` (origin item explicitly asked for a separate file inside
  the unified tree).
- Clobber-avoidance strategy: Korri-owned profile name (not read-merge of an
  operator file).
- Module shape: separate `input-mapping.ts` + `input-config-render.ts` pair, not
  a fourth bucket in `routeSettings`.

### Deferred to Implementation

- ~~U1 owns the input-config contract~~ **— RESOLVED (see
  `input-config-contract.md`).** Path is `input_configs/global/`; per-player
  `Handler`/`Device`/`Config`/`Buddy Device`; full `cfg_pad` key set + handler
  strings recorded; no `config.yml` companion needed for pad; partial profiles
  valid; no headless write-back.
- Profile-name scheme (`korri` vs `korri-<releaseId>`) — U5, based on whether
  per-release distinct pad maps are a real need.
- How many players to model (RPCS3 supports up to 7) — U2; start with the
  realistic set and keep the schema extensible.

---

## Output Structure

*(Per-unit **Files** sections are authoritative. Also touched:
`product/plugins/rpcs3/README.md`.)*

    product/plugins/rpcs3/src/
      input-policy.ts            # new: delivery-agnostic per-player input Effect Schema
      input-policy.test.ts       # new
      input-mapping.ts           # new: clean Korri name -> RPCS3 handler/button/setting strings (verified)
      input-mapping.test.ts      # new
      input-config-render.ts     # new: decoded input policy -> input_configs/<name>.yml YAML text
      input-config-render.test.ts# new
      policy.ts                  # modified: compose `input?` into Rpcs3Policy
      policy.test.ts             # modified: input group decode cases
      materializer.ts            # modified: materialize input profile, pass --input-config
      materializer.test.ts       # modified: input write + argv wiring
      launch-spec.test.ts        # modified: --input-config emission with authored name
      plugin.ts                  # modified: optional default/example input block
      plugin.test.ts             # modified
    product/plugins/rpcs3/
      README.md                  # modified: input authoring surface + convergence note
    work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/
      input-config-contract.md   # new (U1): source-grounded RPCS3 input-config contract
      convergence-note.md        # new (U7): cross-emulator input vocab + inputplumber seam

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should treat
> it as context, not code to reproduce.*

The input surface is the file-analogue of the settings surface: one
delivery-agnostic policy group fans out into a dedicated input profile file that
`--input-config` addresses.

```text
settings.plugin.input (delivery-agnostic, per-player)
        │
   Rpcs3InputPolicy (Effect Schema, input-policy.ts) ── composed into Rpcs3Policy
        │
   routeInputConfig (input-mapping.ts)  ── clean Korri names -> RPCS3 strings (verified U1)
        │
   renderInputConfigYaml (input-config-render.ts)  ── Player N Input: {Handler,Device,Config{...}}
        │
   writeAtomic  ->  <state.root>/input_configs/global/korri.yml   (Korri-owned name; operator profiles untouched)
        │
   materializer: composeRpcs3LaunchSpec({ inputConfig: "korri", ... })
        │
   argv:  … --config <path> --input-config korri … <gameFolder>

   (companion, only if U1 finds it required for headless binding:)
   Input/Output handler-selection keys  ->  existing mapping.ts / config-render.ts  ->  config.yml
```

Illustrative authoring shape (delivery-agnostic; exact clean names finalized in
U2, target strings in U3):

```yaml
settings:
  plugin:
    input:
      players:
        - handler: evdev            # -> RPCS3 "Evdev" (verified U1/U3)
          device: "Xbox 360 Controller"
          buttons:
            cross: cross
            circle: circle
          sticks:
            left: { deadzone: 40, multiplier: 100 }
          triggers:
            l2: { threshold: 20 }
        - handler: keyboard         # keyboard-as-pad for player 2
          device: "Keyboard"
          buttons:
            cross: "Return"
```

Input delivery decision (internal; **not** author-facing) — a representative
slice, seeded in U3 from the U1 contract:

| Unified setting | Delivery | Target |
|---|---|---|
| `input.players[n].handler` | input file | `Player N Input.Handler` (e.g. `Evdev`) |
| `input.players[n].device` | input file | `Player N Input.Device` |
| `input.players[n].buttons.cross` | input file | `Player N Input.Config.Cross` |
| `input.players[n].sticks.left.deadzone` | input file | `Player N Input.Config.Left Stick Deadzone` |

> Path resolved by U1: the file is `input_configs/global/<name>.yml`, addressed by
> the bare name via `--input-config <name>`. No `config.yml` companion is needed
> for pad handler selection (per U1).

---

## Implementation Units

### U1. Spike: source-verify the RPCS3 input-config contract  — **DONE**

**Status:** Resolved. Full contract captured in `input-config-contract.md`
(source-grounded + live Aka device). Key outcomes: profile path is
`input_configs/global/<name>.yml`; per-player `Handler`/`Device`/`Config`/`Buddy
Device`; Linux handler set is `null/keyboard/ds3/ds4/dualsense/skateboard/move/
sdl/evdev`; full `cfg_pad` key set + ranges recorded; **no `config.yml`
companion needed for pad handler selection**; partial profiles are valid;
headless has no profile write-back.

**Goal:** Settle the `input_configs/<name>.yml` schema — exact key names,
handler enum spellings, button/axis/stick/deadzone/trigger key set, keyboard/mouse
handler settings, and whether companion `config.yml` `Input/Output` keys are
required for a headless profile to bind — from RPCS3 source, before any schema or
mapping fan-out.

**Requirements:** R2, R3

**Dependencies:** None (must precede U3, U4)

**Files:**
- Create: `work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/input-config-contract.md`
- Optional: captured fixture under `product/plugins/rpcs3/src/__fixtures__/` (a
  real RPCS3-written `input_configs/*.yml`).

**Approach:**
- Read RPCS3 source for the pinned build (`0.0.41-nixpkgs-40e9ee5`):
  `Emu/Io/pad_config.cpp` (the `cfg_input` / `cfg_player` serializer), `Input/pad_thread`,
  and `pad_settings` to enumerate the `Player N Input` structure, the `Handler`
  enum strings (Null, Keyboard, Evdev, XInput, DualSense, DualShock 4/3, SDL,
  MMJoystick, …), the `Config` map button/axis target keys, stick multiplier /
  deadzone / trigger-threshold keys, and keyboard/mouse handler settings.
- Determine the top-level shape: is it `Player 1 Input:`/`Player 2 Input:` maps,
  and does the file live at `<config_dir>/input_configs/<name>.yml`?
- Determine whether headless binding also needs `config.yml` `Input/Output`
  handler selection; if so, list those keys (they route through the existing
  `mapping.ts`).
- Record everything as a testable contract; capture a real emulator-written
  profile as a fixture when reachable.

**Execution note:** Investigation spike — no production code; source-grounded
like the predecessor `--config` spike (`Emu/System.cpp`), device not required.

**Test scenarios:**
- Test expectation: none — investigation spike; the recorded contract becomes the
  expectations U3/U4 tests encode.

**Verification:**
- ✅ Done: file location (`input_configs/global/`), per-player structure, handler
  enum strings, and the full `cfg_pad` key set are documented with source
  citations in `input-config-contract.md`; the companion-`config.yml` question is
  answered (no pad companion needed).

---

### U2. `Rpcs3InputPolicy` — delivery-agnostic input Effect Schema

**Goal:** Model the per-player pad/keyboard authoring surface as a strict Effect
Schema with clean Korri names, composed into the unified `Rpcs3Policy.input`.

**Requirements:** R1

**Dependencies:** U1 (shape: player count, handler categories)

**Files:**
- Create: `product/plugins/rpcs3/src/input-policy.ts`
- Create: `product/plugins/rpcs3/src/input-policy.test.ts`
- Modify: `product/plugins/rpcs3/src/policy.ts`
- Modify: `product/plugins/rpcs3/src/policy.test.ts`

**Approach:**
- `Rpcs3InputPolicy = Schema.Struct({ players: Schema.optional(Schema.Array(Rpcs3PlayerInput)) })`
  where `Rpcs3PlayerInput` groups `handler` (Korri-clean `Schema.Literals`, e.g.
  `evdev`/`keyboard`/`xinput`/`sdl`/`null`), `device` (string), `buttons`
  (record of clean pad-button → binding), `sticks` (left/right → `{ deadzone?,
  multiplier? }` with `IntInRange`), `triggers` (l2/r2 → `{ threshold? }`), and
  optional keyboard/mouse handler settings. Delivery-agnostic — **no** RPCS3
  target strings here (those live in U3).
- Reuse `NonEmptyString`/`IntInRange` and `STRICT` (`onExcessProperty: "error"`)
  from `policy.ts`.
- Compose into `Rpcs3Policy`: `input: Schema.optional(Rpcs3InputPolicy)`.
- Keep the schema extensible (up to 7 players) without over-modeling exotic
  handlers.

**Patterns to follow:**
- `Rpcs3VideoPolicy`/`Rpcs3AudioPolicy` structs + `Schema.Literals` in `policy.ts`.
- `RyubingPolicy` nested grouping in `ryubing/src/policy.ts`.

**Test scenarios:**
- Happy path: a two-player tree (evdev pad + keyboard) decodes to the typed policy.
- Edge case: empty `input`/`players: []` decodes; partial player (handler only)
  decodes.
- Error path: unknown handler literal (`handler: "metal"`) fails decode with the
  offending key path.
- Error path: unknown pad-button key or excess property rejected under STRICT.
- Edge case: deadzone/multiplier out of `IntInRange` bounds rejected.

**Verification:**
- Valid per-player input policies decode; malformed handlers/keys fail with clear
  key-path errors; `Rpcs3Policy.input` round-trips.

---

### U3. Input mapping table + value maps (`input-mapping.ts`)

**Goal:** Translate a decoded `Rpcs3InputPolicy` into RPCS3's exact input-config
structure and strings (handler enum, button/axis targets, stick/deadzone keys),
plus any companion `config.yml` `Input/Output` entries U1 requires.

**Requirements:** R1, R3

**Dependencies:** U1, U2

**Files:**
- Create: `product/plugins/rpcs3/src/input-mapping.ts`
- Create: `product/plugins/rpcs3/src/input-mapping.test.ts`

**Approach:**
- `routeInputConfig(policy.input) -> { players: RoutedPlayerInput[] , configEntries: ConfigEntry[] }`
  where each routed player carries `{ handler, device, config: [key, value][] }`
  in RPCS3's exact spelling, and `configEntries` are any companion `Input/Output`
  keys (empty if U1 finds none) reusing the `ConfigEntry` type from `mapping.ts`.
- Value maps (clean Korri name → RPCS3 string), each **verified against the U1
  contract**: handler map (`evdev → "Evdev"`, `keyboard → "Keyboard"`, …), pad
  button map (`cross → "Cross"`, `circle → "Circle"`, dpad, L1/L2/L3/R*, start/
  select/ps), stick keys (`Left Stick Deadzone`, `Left Stick Multiplier`, …),
  trigger threshold keys.
- Pin the RPCS3 build in the file header (mirror `mapping.ts`); centralize every
  string here so drift is contained.

**Patterns to follow:**
- `mapping.ts` value-map style (`RENDERER`/`SHADER_MODE`/`LANGUAGE` records +
  `routeSettings`), including the "verified against RPCS3 source" header comment.

**Test scenarios:**
- Happy path: `handler: evdev` → `"Evdev"`; `buttons.cross: cross` →
  `["Cross", "Cross"]` (or the U1-verified target/value shape).
- Happy path: `sticks.left.deadzone: 40` → `["Left Stick Deadzone", 40]`.
- Edge case: a player with only `handler`/`device` routes with an empty config
  list; unset stick/trigger groups contribute nothing.
- Edge case (only if U1 requires): active-handler selection emits the correct
  `Input/Output.*` companion `configEntries`.
- Error/guard: an unmapped-but-schema-valid value surfaces via the value-map
  fallback path consistently with `mapping.ts` (`MAP[x] ?? x`).

**Verification:**
- A representative multi-player policy fans out to the exact verified
  handler/device/config strings (and companion config entries, if any).

---

### U4. Input config renderer (`input-config-render.ts`)

**Goal:** Render routed player input into `input_configs/<name>.yml` text —
serialized once via the `yaml` package into the `Player N Input:` structure.

**Requirements:** R2, R4

**Dependencies:** U1, U3

**Files:**
- Create: `product/plugins/rpcs3/src/input-config-render.ts`
- Create: `product/plugins/rpcs3/src/input-config-render.test.ts`

**Approach:**
- `renderInputConfigYaml({ players }) -> string | undefined`. Build the nested
  object (`Player 1 Input: { Handler, Device, Config: {…} }`, `Player 2 Input:
  {…}`, …) from the routed players, then `stringify` once (mirror
  `renderConfigYaml`'s serialize-once discipline). Returns `undefined` when there
  are no players to write.
- Per U1: emit only authored `Config` keys (partial profiles are valid — unset
  keys fall to RPCS3 defaults); include optional `Buddy Device`; default unlisted
  players to `Handler: "Null"` to match RPCS3's written shape.
- Do **not** read-merge an operator profile — the Korri-owned name means we own
  the whole file (R4). (If U1 surprises us and merging is needed, revisit; the
  default is own-the-file.)
- Round-trip the emitted YAML through a parser in tests to prove validity.

**Patterns to follow:**
- `config-render.ts` `buildConfigObject` + `stringify` (single serialization).

**Test scenarios:**
- Happy path: two routed players render to valid nested `Player 1/2 Input` YAML
  with `Handler`/`Device`/`Config`.
- Happy path: the emitted text round-trips through `yaml.parse` to the expected
  object.
- Edge case: no players → `undefined` (no file written by the materializer).
- Edge case: a keyboard player renders string key bindings; a pad player renders
  numeric deadzone/multiplier values.

**Verification:**
- A policy renders to valid `input_configs` YAML that parses back to the intended
  per-player structure.

---

### U5. Materializer wiring — write profile + emit `--input-config`

**Goal:** Materialize the Korri-owned input profile atomically under the state
root and pass its name to `composeRpcs3LaunchSpec`, with documented precedence
over the raw passthrough.

**Requirements:** R2, R4

**Dependencies:** U2, U3, U4

**Files:**
- Modify: `product/plugins/rpcs3/src/materializer.ts`
- Modify: `product/plugins/rpcs3/src/materializer.test.ts`
- Modify: `product/plugins/rpcs3/src/launch-spec.test.ts`

**Approach:**
- Read `resolvedPolicy.input` from the **already-merged** decoded policy
  (`decodeRpcs3Policy(resolveRpcs3PolicyInput({preferences, plugin}))`, landed at
  `materializer.ts:253`). Preferences carry no input today, so `resolvedPolicy.input`
  is purely the plugin layer — but wiring off the merged policy keeps a future
  input translator transparent (no second decode path).
- Add a `writeInputConfig` step (mirroring `writeLaunchConfig`): route via
  `routeInputConfig`, render via `renderInputConfigYaml`, and when text is
  produced, `writeAtomic` to `<stateRoot>/input_configs/global/<korriName>.yml`
  (U1-corrected path — the `global/` subdir; `mkdir -p input_configs/global/`).
  Return the profile **name** (not path — RPCS3's `--input-config` takes a bare
  profile name that resolves under `input_configs/global/`).
- Pick the profile name: default `korri`; use `korri-<slugReleaseId(releaseId)>`
  if per-release isolation is warranted (reuse `slugReleaseId`). Document the
  choice.
- If U1 found companion `Input/Output` keys, fold `routeInputConfig`'s
  `configEntries` into the existing `writeLaunchConfig` entry stream so they land
  in `config.yml` (not the input file).
- Pass the authored name to `composeRpcs3LaunchSpec({ inputConfig })`.
  **Precedence:** authored `input` policy wins over any raw passthrough
  `inputConfig`; passthrough-only keeps today's reference-existing-profile
  behavior; both-set → authored, documented.
- Never write an operator profile name (R4): Korri only writes `korri*.yml`.

**Patterns to follow:**
- `writeLaunchConfig`/`writeGuiPreseed` in `materializer.ts`; `writeAtomic`,
  `slugReleaseId`.

**Test scenarios:**
- Happy path: an authored `input` policy materializes
  `<stateRoot>/input_configs/global/korri.yml` and the spec argv includes
  `--input-config korri`.
- Integration: the file written is under `input_configs/global/` and no operator
  profile (e.g. `input_configs/global/Default.yml`) is created or modified.
- Edge case: no `input` policy and no passthrough → no input file, no
  `--input-config` in argv.
- Edge case: passthrough `inputConfig` set, no `input` policy → argv references
  the passthrough name; no file written by Korri.
- Precedence: both authored `input` and passthrough set → authored Korri-owned
  name used; asserted in argv.
- Integration (companion, if U1 requires): active-handler `Input/Output` keys
  appear in the materialized `config.yml`, not the input file.

**Verification:**
- Materializing an input policy produces a readable Korri-owned
  `input_configs/*.yml` and argv that binds it via `--input-config`, without
  touching operator profiles.

---

### U6. Plugin default/example + README documentation

**Goal:** Surface the input authoring in the plugin record (optional example) and
document the input surface, the delivery-is-internal principle, and precedence.

**Requirements:** R1, R5

**Dependencies:** U2, U5

**Files:**
- Modify: `product/plugins/rpcs3/src/plugin.ts`
- Modify: `product/plugins/rpcs3/src/plugin.test.ts`
- Modify: `product/plugins/rpcs3/README.md`

**Approach:**
- Keep the default launcher record's `settings.plugin` behavior unchanged by
  default (no forced input profile), but document a copy-paste example `input`
  block in the README. Only add an actual default `input` block if there is a
  sensible universal pad map; otherwise leave it author-supplied.
- README: document the unified `input` tree, that delivery (the separate
  `input_configs` file + `--input-config`) is internal, the Korri-owned-profile /
  no-clobber guarantee, precedence vs raw passthrough, and the pinned RPCS3 build
  for the input value maps.

**Patterns to follow:**
- Existing `plugin.ts` `settings.plugin` block; the settings-surface README
  section shape.

**Test scenarios:**
- Happy path: plugin record still decodes; if an example `input` block is added,
  it decodes through `Rpcs3Policy`.
- Edge case: default record with no `input` block materializes with no input file
  (parity with pre-change behavior).

**Verification:**
- Plugin discovery/config tests pass; README documents the input surface and the
  no-clobber guarantee.

---

### U7. Convergence design note (cross-emulator input vocab + inputplumber seam)

**Goal:** Document how RPCS3 input authoring converges with the normalized
cross-emulator input vocabulary and Korri's controller / inputplumber ownership
work, so pad maps are not authored two different ways.

**Requirements:** R5

**Dependencies:** U2, U3 (the concrete RPCS3 instance the note reasons from)

**Files:**
- Create: `work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/convergence-note.md`

**Approach:**
- Anchor on the **landed** cross-launcher preferences pattern, not a hypothetical:
  `Preferences` (`inheritable-fields.ts`), the RPCS3 translator
  (`preferences-mapping.ts`: `translatePreferencesToRpcs3` +
  `resolveRpcs3PolicyInput`), and its design
  (`work/items/active/01KWM7Q407…/design.md`, Phase 1 = video/audio only).
- Recommend the **input analogue as a reserved `preferences` sibling** (the design
  already reserves the namespace, e.g. `preferences.display`): a neutral controller
  vocabulary (`preferences.input` or `preferences.launch.input`) declared once,
  with an RPCS3 input translator that emits a partial `Rpcs3Policy.input` object
  deep-merged **under** the plugin's `input` policy and decoded once — exactly the
  `resolveRpcs3PolicyInput` shape. Note that this plan's U2 schema is already that
  merge target, so the future translator is additive, not a rewrite.
- Apply the design's **capability-drop** rule to input: a neutral binding a
  launcher cannot express is simply unmapped (no error) — mirror the aspect-ratio
  value-guard precedent.
- Draw the boundary with `refactor/inputplumber-runtime-ownership`: this plan
  authors the **profile file** RPCS3 reads; inputplumber owns **runtime** physical
  pad discovery/ownership. State the seam (who normalizes device identity, whether
  a Korri-normalized device name feeds both `cfg_player.Device` and inputplumber)
  so the two efforts do not double-author pad maps.
- Recommend the next step (feed the active cross-emulator vocabulary initiative)
  without building it here.

**Execution note:** Design/documentation unit — no production code; feeds the
deferred cross-emulator initiative.

**Test scenarios:**
- Test expectation: none — design note; no behavioral change.

**Verification:**
- The note maps input authoring onto the **already-landed** preferences/translator
  pattern (naming `preferences-mapping.ts` and `resolveRpcs3PolicyInput`), proposes
  the neutral input sibling concretely, and states the inputplumber
  runtime-vs-profile boundary clearly enough for the active cross-emulator
  initiative to consume it.

---

## System-Wide Impact

- **Interaction graph:** Changes are contained to the RPCS3 plugin plus its work
  item. `composeRpcs3LaunchSpec` already supports `inputConfig`; the materializer
  starts supplying it. No shared cascade/resolver change (unlike the settings
  surface's U1), so blast radius is the plugin only.
- **Error propagation:** Input policy decode failures surface as
  `AppMaterializationFailed` with the offending key path (U2); input-file write
  failures surface as materialization errors via `writeAtomic`, never silent
  partial writes.
- **State lifecycle risks:** A new artifact (`input_configs/<korriName>.yml`) is
  written under the state root. Atomic temp+rename; Korri-owned name only, so the
  operator's own profiles and `Default.yml` are never clobbered.
- **API surface parity:** No new context contract fields. If U1 requires companion
  `config.yml` `Input/Output` keys, they route through the **existing**
  `mapping.ts` path, keeping a single config-write authority.
- **Integration coverage:** Prove end-to-end that an authored `input` policy
  produces a real `input_configs` file AND an argv that binds it — unit tests of
  the render alone won't prove the materializer→argv wiring.
- **Unchanged invariants:** Discovery, firmware/state gating, absolute-command
  requirement, the `config.yml`/GUI-ini settings surface, and the raw
  passthrough all remain; the generic composer and other plugins are untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Assumed input-config schema (keys/handler strings) is wrong → RPCS3 ignores or rejects the profile | **Mitigated (U1 done):** whole contract verified against RPCS3 source + live device in `input-config-contract.md`; every string centralized+pinned in `input-mapping.ts` |
| Headless binding also needs `config.yml` `Input/Output` handler selection | **Resolved (U1):** per-player pad handler lives in the profile file; `--input-config` alone binds pads; no `config.yml` companion required |
| Wrong profile path (`input_configs/` vs `input_configs/global/`) | **Resolved (U1):** override branch resolves `get_input_config_dir()` = `global/`; plan U4/U5 corrected to write `input_configs/global/<name>.yml` |
| Korri clobbers an operator input profile | Korri-owned profile name only (`korri*.yml`); never write an operator/`Default` profile; asserted in U5 tests |
| Precedence between authored `input` and raw passthrough is ambiguous | U5 documents "authored wins", passthrough-only keeps existing behavior; asserted in tests |
| Input value maps drift across RPCS3 versions | Pin the build in the `input-mapping.ts` header (mirror `mapping.ts`); exotic/unmodeled handlers stay escape-hatch-only; drift is a test-guarded, documented edit |
| Double-authoring pad maps vs inputplumber runtime ownership | U7 draws the runtime-vs-profile boundary and the shared-device-identity seam before the cross-emulator initiative builds on it |
| Emitted input YAML is malformed (nesting) | U4 round-trips the emitted YAML through a parser in tests; serialize-once via the `yaml` package |

---

## Documentation / Operational Notes

- Update `product/plugins/rpcs3/README.md` (U6): input authoring tree,
  delivery-is-internal, Korri-owned-profile/no-clobber guarantee, precedence, and
  the pinned RPCS3 build for input value maps.
- Convergence note (U7) is a work-item design artifact feeding the deferred
  cross-emulator input vocabulary initiative.
- No device rollout in this plan; live validation on Aka stays gated on
  operator-supplied firmware (same as the settings surface).

---

## Sources & References

- **Origin item:** [work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/item.md](work/items/active/01KWM7Q408P6VW6RWR66SE6R3R-rpcs3-input-config-authoring/item.md)
- **Predecessor plan (input analogue of):** `work/items/active/20260702-rpcs3-settings-surface/plan.md`
- Argv authority: `product/plugins/rpcs3/src/launch-spec.ts`
- Settings-surface pattern: `product/plugins/rpcs3/src/{policy,mapping,config-render,materializer}.ts`
- Cross-emulator vocabulary sibling (**now active, Phase 1 shipped**):
  `work/items/active/01KWM7Q407Q0QDVZ4SY4BZBKHY-cross-emulator-settings-vocabulary/design.md`
- Landed preferences translator pattern: `product/plugins/rpcs3/src/preferences-mapping.ts`,
  `product/platform/library/config/inheritable-fields.ts` (`Preferences`/`LaunchPreferences`)
- Runtime ownership effort: `.worktrees/refactor/inputplumber-runtime-ownership`
- Reference plugin: `product/plugins/ryubing/src/policy.ts`
