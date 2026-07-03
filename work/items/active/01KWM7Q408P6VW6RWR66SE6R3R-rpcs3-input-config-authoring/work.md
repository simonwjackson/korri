---
title: RPCS3 --input-config content authoring (pad/keyboard mappings)
type: feat
status: active
date: 2026-07-03
---

# RPCS3 --input-config content authoring (pad/keyboard mappings)

Let the `@korri:rpcs3` plugin AUTHOR the body of a pad/keyboard input profile
declaratively — per-player handler/device, button/axis bindings, deadzones,
stick multipliers, keyboard/mouse handlers — inside the unified settings tree,
materialize it atomically to `<state.root>/input_configs/<name>.yml`, and
reference it via `--input-config <name>`. Today the plugin only PASSES THROUGH
a named `--input-config` (referencing a profile RPCS3 already has on disk); it
cannot write the profile content. This closes the last hand-config gap for
unattended, reproducible PS3 launches.

Origin (graduated parking-lot item): `item.md`

Predecessor pattern (input analogue of): `work/items/active/20260702-rpcs3-settings-surface/plan.md`

## Progress

- Planned (see `plan.md`).
- **Implemented (/se-work) on branch `feat/rpcs3-input-config-authoring`** — all
  units shipped as atomic commits (not pushed, not integrated to trunk):
  - **U1** — source-verified contract (`input-config-contract.md`).
  - **U2** — `Rpcs3InputPolicy` per-player Effect Schema, composed into `Rpcs3Policy.input`.
  - **U2b** — cap authored players at RPCS3's 7 slots.
  - **U3** — `input-mapping.ts` router + verified value maps (handler enum,
    `Config` keys, mouse mode).
  - **U4** — `input-config-render.ts` serialize-once `Player N Input` YAML.
  - **U5** — materializer writes `input_configs/global/korri-<releaseId>.yml`
    atomically and passes `--input-config`; operator profiles untouched.
  - **U6** — README input authoring section.
  - **U7** — `convergence-note.md` (neutral `preferences.input` sibling +
    inputplumber boundary).
  Verification: `bun test product/plugins/rpcs3/src` = 84 pass / 0 fail; my files
  type-clean (`just typecheck`) and biome-clean. Pre-existing unrelated trunk
  failures (game.test.ts userData.playtime; ~86 repo-wide TS errors) left as-is.
  All requirements R1–R5 satisfied.
- **U1 spike DONE** — RPCS3 input-config contract settled from source + live Aka
  device (`0.0.41-nixpkgs-40e9ee5`). Full findings in `input-config-contract.md`.
  Headlines:
  - `--input-config <name>` → loads `input_configs/**global**/<name>.yml` (bare
    name; override branch wins over title/active selection). Plan path corrected
    from `input_configs/<name>.yml`.
  - Per-player schema: `Player N Input:` → `Handler` (enum), `Device`, `Config`
    (full `cfg_pad` map), `Buddy Device`.
  - Linux handler strings: `Null/Keyboard/DualShock 3/DualShock 4/DualSense/
    Skateboard/PS Move/SDL/Evdev` (`XInput`/`MMJoystick` are Windows-only).
  - Full `cfg_pad` key set + ranges/defaults recorded (buttons=strings; stick/
    trigger tuning=uints).
  - **No `config.yml` companion needed** for pad handler selection; `Input/Output`
    is PS3 device-emulation, a separate concern. "Keyboard-as-pad" is in the
    profile.
  - Partial profiles valid (unset keys → RPCS3 defaults); headless has no profile
    write-back.
- **Reevaluated against recent trunk landings (no rework needed):**
  - The unified settings surface fully shipped on trunk (through Phase 3 per-game
    accuracy), and a **launcher-neutral preferences** system landed on top:
    `Preferences`/`LaunchPreferences` (`inheritable-fields.ts`) folded through the
    cascade + an RPCS3 **translator** (`preferences-mapping.ts`:
    `resolveRpcs3PolicyInput`). The cross-emulator vocabulary sibling `01KWM7Q407`
    is now **active** (`.../cross-emulator-settings-vocabulary/design.md`), Phase 1
    = video/audio only; **input is not yet a neutral sibling**.
  - Impact: the input profile is a distinct *file* delivery target, so it stays
    outside the video/audio preferences translator — core plan (U1–U6) unchanged.
    `materializer.ts:253` already decodes via `resolveRpcs3PolicyInput`, so
    `Rpcs3Policy.input` (U2) rides the merged policy for free.
  - Plan sharpened: U7 convergence note now targets the **real** preferences/
    translator pattern (propose a neutral `preferences.input` sibling + RPCS3 input
    translator feeding `Rpcs3Policy.input`); added a forward-compat decision to keep
    the `input` schema translator-friendly; fixed sibling refs from parking-lot to
    active.
