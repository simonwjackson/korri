import { Schema } from "effect"

/**
 * RPCS3 input-config authoring surface — delivery-agnostic, per-player pad /
 * keyboard-as-pad mappings. Clean Korri names only; the value→RPCS3 string
 * translation (handler enum, `Config` key names) lives in the mapping table
 * (input-mapping.ts), never here.
 *
 * Shape and ranges are verified against RPCS3 `Emu/Io/pad_config.h` +
 * `pad_config_types.cpp` (build 0.0.41-nixpkgs-40e9ee5) and the live Aka
 * device — see `work/items/active/.../input-config-contract.md`. Only the
 * common subset is modeled (handler/device, buttons, stick deadzone/multiplier,
 * trigger thresholds, keyboard/mouse-as-pad basics); the deep `cfg_pad` tail
 * (sensors, LEDs, lerp, squircling, vibration, device identity) stays reachable
 * via the `overrides` escape hatch.
 */

const IntInRange = (label: string, min: number, max: number) =>
  Schema.Int.check(
    Schema.makeFilter<number>(value =>
      Number.isInteger(value) && value >= min && value <= max
        ? undefined
        : `${label} must be an integer in [${min}, ${max}]`,
    ),
  )

/**
 * Linux-available `pad_handler` values (RPCS3 `pad_config_types.h`): the
 * `_WIN32`-only `xinput`/`mm` are intentionally omitted since Korri targets
 * Linux devices; unmodeled exotic handlers stay escape-hatch-only.
 */
const Rpcs3InputHandler = Schema.Literals([
  "null",
  "keyboard",
  "ds3",
  "ds4",
  "dualsense",
  "skateboard",
  "move",
  "sdl",
  "evdev",
])

/**
 * Per-button binding tokens. Values are handler-specific strings (an evdev key
 * name, an SDL button, or a keyboard key for keyboard-as-pad); the schema fixes
 * the clean button vocabulary but not the token grammar. Stick-direction
 * bindings matter for keyboard-as-pad, where analog sticks are driven by keys.
 */
const Rpcs3InputButtons = Schema.Struct({
  cross: Schema.optional(Schema.String),
  circle: Schema.optional(Schema.String),
  square: Schema.optional(Schema.String),
  triangle: Schema.optional(Schema.String),
  up: Schema.optional(Schema.String),
  down: Schema.optional(Schema.String),
  left: Schema.optional(Schema.String),
  right: Schema.optional(Schema.String),
  l1: Schema.optional(Schema.String),
  l2: Schema.optional(Schema.String),
  l3: Schema.optional(Schema.String),
  r1: Schema.optional(Schema.String),
  r2: Schema.optional(Schema.String),
  r3: Schema.optional(Schema.String),
  start: Schema.optional(Schema.String),
  select: Schema.optional(Schema.String),
  ps: Schema.optional(Schema.String),
  leftStickUp: Schema.optional(Schema.String),
  leftStickDown: Schema.optional(Schema.String),
  leftStickLeft: Schema.optional(Schema.String),
  leftStickRight: Schema.optional(Schema.String),
  rightStickUp: Schema.optional(Schema.String),
  rightStickDown: Schema.optional(Schema.String),
  rightStickLeft: Schema.optional(Schema.String),
  rightStickRight: Schema.optional(Schema.String),
})

/** Analog stick tuning (RPCS3 uint ranges from `cfg_pad`). */
const Rpcs3InputStick = Schema.Struct({
  deadzone: Schema.optional(
    IntInRange("rpcs3.input.stick.deadzone", 0, 1000000),
  ),
  multiplier: Schema.optional(
    IntInRange("rpcs3.input.stick.multiplier", 0, 200),
  ),
})

const Rpcs3InputSticks = Schema.Struct({
  left: Schema.optional(Rpcs3InputStick),
  right: Schema.optional(Rpcs3InputStick),
})

/** Analog trigger threshold (RPCS3 `Left/Right Trigger Threshold`, 0-1000000). */
const Rpcs3InputTrigger = Schema.Struct({
  threshold: Schema.optional(
    IntInRange("rpcs3.input.trigger.threshold", 0, 1000000),
  ),
})

const Rpcs3InputTriggers = Schema.Struct({
  l2: Schema.optional(Rpcs3InputTrigger),
  r2: Schema.optional(Rpcs3InputTrigger),
})

/** Keyboard/mouse-as-pad pointer tuning (RPCS3 `cfg_pad` mouse fields). */
const Rpcs3InputMouse = Schema.Struct({
  movementMode: Schema.optional(Schema.Literals(["relative", "absolute"])),
  deadzoneX: Schema.optional(IntInRange("rpcs3.input.mouse.deadzoneX", 0, 255)),
  deadzoneY: Schema.optional(IntInRange("rpcs3.input.mouse.deadzoneY", 0, 255)),
  accelerationX: Schema.optional(
    IntInRange("rpcs3.input.mouse.accelerationX", 0, 999999),
  ),
  accelerationY: Schema.optional(
    IntInRange("rpcs3.input.mouse.accelerationY", 0, 999999),
  ),
})

/**
 * One RPCS3 player slot (`Player N Input`). `handler` selects the RPCS3 pad
 * backend; `device`/`buddyDevice` name the physical (or virtual) device. All
 * of `buttons`/`sticks`/`triggers`/`mouse` are optional so partial profiles are
 * valid — unset `cfg_pad` keys fall back to RPCS3 defaults.
 */
const Rpcs3InputPlayer = Schema.Struct({
  handler: Rpcs3InputHandler,
  device: Schema.optional(Schema.String),
  buddyDevice: Schema.optional(Schema.String),
  buttons: Schema.optional(Rpcs3InputButtons),
  sticks: Schema.optional(Rpcs3InputSticks),
  triggers: Schema.optional(Rpcs3InputTriggers),
  mouse: Schema.optional(Rpcs3InputMouse),
})
export type Rpcs3InputPlayer = Schema.Schema.Type<typeof Rpcs3InputPlayer>

/**
 * Defaults applied to RPCS3 players derived from Korri input seats. This lets a
 * game tune all virtual seats without replacing the derived P1-P4 device list.
 */
const Rpcs3DerivedSeatDefaults = Schema.Struct({
  buttons: Schema.optional(Rpcs3InputButtons),
  sticks: Schema.optional(Rpcs3InputSticks),
  triggers: Schema.optional(Rpcs3InputTriggers),
  mouse: Schema.optional(Rpcs3InputMouse),
})
export type Rpcs3DerivedSeatDefaults = Schema.Schema.Type<
  typeof Rpcs3DerivedSeatDefaults
>

/** RPCS3 `cfg_input` exposes exactly 7 player slots (Player 1..7 Input). */
const RPCS3_MAX_PLAYERS = 7

/**
 * Per-player input authoring. Players are positional (index 0 → Player 1 Input,
 * …); RPCS3 supports up to 7. Unlisted players default to `Handler: "Null"` at
 * render time.
 */
export const Rpcs3InputPolicy = Schema.Struct({
  players: Schema.optional(
    Schema.Array(Rpcs3InputPlayer).check(
      Schema.makeFilter<readonly Rpcs3InputPlayer[]>(value =>
        value.length <= RPCS3_MAX_PLAYERS
          ? undefined
          : `rpcs3.input.players supports at most ${RPCS3_MAX_PLAYERS} players`,
      ),
    ),
  ),
  derivedSeatDefaults: Schema.optional(Rpcs3DerivedSeatDefaults),
})
export type Rpcs3InputPolicy = Schema.Schema.Type<typeof Rpcs3InputPolicy>
