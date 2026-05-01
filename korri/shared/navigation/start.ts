import { getNextFocus } from "@bbc/tv-lrud-spatial"
import { createInputBus, type InputBus } from "@shared/input/bus"
import { createGamepadAdapter } from "@shared/input/gamepad-adapter"
import { createKeyboardAdapter } from "@shared/input/keyboard-adapter"
import type { Direction } from "@shared/input/types"
import {
  createFocusEngine,
  type FocusEngineOptions,
  type NextFocusFn,
} from "./focus-engine"

/**
 * One-shot wiring: input bus + adapters + focus engine.
 *
 * Call once from the app entrypoint (e.g. main.tsx). The returned bus is the
 * extension point — routes, modals, and feature code subscribe to it for
 * `back`, `options`, `menu`, etc., without ever touching component internals.
 *
 * Components remain framework-native HTML. Spatial navigation is read off the
 * live DOM via LRUD, so adding a new focusable means rendering a `<button>`,
 * not importing a hook.
 */

const DIRECTION_KEY_CODE: Record<Direction, number> = {
  up: 38,
  down: 40,
  left: 37,
  right: 39,
}

const lrudNextFocus: NextFocusFn = (current, direction, scope) =>
  getNextFocus(current, DIRECTION_KEY_CODE[direction], scope) ?? null

export interface StartSpatialNavigationOptions
  extends Omit<FocusEngineOptions, "nextFocus"> {
  /** Override the spatial-navigation algorithm. Defaults to LRUD. */
  readonly nextFocus?: NextFocusFn
  /** Disable the keyboard adapter. */
  readonly keyboard?: false | Parameters<typeof createKeyboardAdapter>[0]
  /** Disable the gamepad adapter. */
  readonly gamepad?: false | Parameters<typeof createGamepadAdapter>[0]
}

export interface SpatialNavigationHandle {
  readonly bus: InputBus
  dispose(): void
}

export function startSpatialNavigation(
  options: StartSpatialNavigationOptions = {},
): SpatialNavigationHandle {
  const bus = createInputBus()
  const engine = createFocusEngine({
    nextFocus: options.nextFocus ?? lrudNextFocus,
    scope: options.scope,
    onConfirm: options.onConfirm,
    onBack: options.onBack,
    onOptions: options.onOptions,
    onMenu: options.onMenu,
    initialFocusSelector: options.initialFocusSelector,
  })

  bus.on(engine.handle)

  if (options.keyboard !== false) {
    bus.use(createKeyboardAdapter(options.keyboard ?? undefined))
  }
  if (options.gamepad !== false) {
    bus.use(createGamepadAdapter(options.gamepad ?? undefined))
  }

  return {
    bus,
    dispose: () => bus.dispose(),
  }
}
