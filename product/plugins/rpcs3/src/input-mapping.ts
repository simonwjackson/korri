import type { Rpcs3InputPlayer, Rpcs3InputPolicy } from "./input-policy"

/**
 * Input-config delivery router — the single place that translates the clean
 * Korri input vocabulary into RPCS3's exact `input_configs` strings: the
 * `pad_handler` enum, the per-player `Config` button/tuning keys, and the mouse
 * movement-mode enum.
 *
 * All RPCS3 target strings are verified against RPCS3 `Emu/Io/pad_config.h`
 * and `pad_config_types.cpp` (build 0.0.41-nixpkgs-40e9ee5) and the live Aka
 * device — see `input-config-contract.md`. This is the single source of truth
 * for those strings, so version drift is contained to this file.
 *
 * Unlike `mapping.ts` (config.yml/argv/ini), input authoring targets a separate
 * profile FILE addressed by `--input-config`, so it gets its own router. RPCS3's
 * per-player `Handler` lives in the profile, so no `config.yml` companion is
 * needed for pad selection (U1).
 */

export type Rpcs3InputConfigValue = string | number
export type Rpcs3InputConfigEntry = readonly [
  key: string,
  value: Rpcs3InputConfigValue,
]

export interface RoutedInputPlayer {
  readonly handler: string
  readonly device?: string
  readonly buddyDevice?: string
  readonly config: readonly Rpcs3InputConfigEntry[]
}

export interface RoutedInputConfig {
  readonly players: readonly RoutedInputPlayer[]
}

/** Clean handler name → RPCS3 `pad_handler` string (`pad_config_types.cpp`). */
const HANDLER: Readonly<Record<string, string>> = {
  null: "Null",
  keyboard: "Keyboard",
  ds3: "DualShock 3",
  ds4: "DualShock 4",
  dualsense: "DualSense",
  skateboard: "Skateboard",
  move: "PS Move",
  sdl: "SDL",
  evdev: "Evdev",
}

/**
 * Clean button name → RPCS3 `cfg_pad` Config key. Ordered so routed output is
 * deterministic (schema field order); iterate this map, not the input object.
 */
const BUTTON_KEY: ReadonlyArray<readonly [keyof ButtonInput, string]> = [
  ["cross", "Cross"],
  ["circle", "Circle"],
  ["square", "Square"],
  ["triangle", "Triangle"],
  ["up", "Up"],
  ["down", "Down"],
  ["left", "Left"],
  ["right", "Right"],
  ["l1", "L1"],
  ["l2", "L2"],
  ["l3", "L3"],
  ["r1", "R1"],
  ["r2", "R2"],
  ["r3", "R3"],
  ["start", "Start"],
  ["select", "Select"],
  ["ps", "PS Button"],
  ["leftStickUp", "Left Stick Up"],
  ["leftStickDown", "Left Stick Down"],
  ["leftStickLeft", "Left Stick Left"],
  ["leftStickRight", "Left Stick Right"],
  ["rightStickUp", "Right Stick Up"],
  ["rightStickDown", "Right Stick Down"],
  ["rightStickLeft", "Right Stick Left"],
  ["rightStickRight", "Right Stick Right"],
]

type ButtonInput = NonNullable<Rpcs3InputPlayer["buttons"]>

/** Clean mouse movement mode → RPCS3 `mouse_movement_mode` string. */
const MOUSE_MOVEMENT_MODE: Readonly<Record<string, string>> = {
  relative: "Relative",
  absolute: "Absolute",
}

const routePlayer = (player: Rpcs3InputPlayer): RoutedInputPlayer => {
  const config: Array<Rpcs3InputConfigEntry> = []

  const buttons = player.buttons
  if (buttons) {
    for (const [clean, target] of BUTTON_KEY) {
      const binding = buttons[clean]
      if (binding !== undefined) config.push([target, binding])
    }
  }

  const left = player.sticks?.left
  if (left?.deadzone !== undefined) {
    config.push(["Left Stick Deadzone", left.deadzone])
  }
  if (left?.multiplier !== undefined) {
    config.push(["Left Stick Multiplier", left.multiplier])
  }
  const right = player.sticks?.right
  if (right?.deadzone !== undefined) {
    config.push(["Right Stick Deadzone", right.deadzone])
  }
  if (right?.multiplier !== undefined) {
    config.push(["Right Stick Multiplier", right.multiplier])
  }

  const l2 = player.triggers?.l2
  if (l2?.threshold !== undefined) {
    config.push(["Left Trigger Threshold", l2.threshold])
  }
  const r2 = player.triggers?.r2
  if (r2?.threshold !== undefined) {
    config.push(["Right Trigger Threshold", r2.threshold])
  }

  const mouse = player.mouse
  if (mouse) {
    if (mouse.movementMode !== undefined) {
      config.push([
        "Mouse Movement Mode",
        MOUSE_MOVEMENT_MODE[mouse.movementMode] ?? mouse.movementMode,
      ])
    }
    if (mouse.deadzoneX !== undefined) {
      config.push(["Mouse Deadzone X Axis", mouse.deadzoneX])
    }
    if (mouse.deadzoneY !== undefined) {
      config.push(["Mouse Deadzone Y Axis", mouse.deadzoneY])
    }
    if (mouse.accelerationX !== undefined) {
      config.push(["Mouse Acceleration X Axis", mouse.accelerationX])
    }
    if (mouse.accelerationY !== undefined) {
      config.push(["Mouse Acceleration Y Axis", mouse.accelerationY])
    }
  }

  return {
    handler: HANDLER[player.handler] ?? player.handler,
    ...(player.device !== undefined ? { device: player.device } : {}),
    ...(player.buddyDevice !== undefined
      ? { buddyDevice: player.buddyDevice }
      : {}),
    config,
  }
}

/**
 * Route a decoded input policy into RPCS3 profile shape. Returns `undefined`
 * when there are no players to author, so the materializer writes no profile
 * and passes no `--input-config`.
 */
export const routeInputConfig = (
  input: Rpcs3InputPolicy | undefined,
): RoutedInputConfig | undefined => {
  const players = input?.players
  if (players === undefined || players.length === 0) return undefined
  return { players: players.map(routePlayer) }
}
