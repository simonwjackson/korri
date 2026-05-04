import { getNextFocus } from "@bbc/tv-lrud-spatial"
import { createInputBus, type InputBus } from "@shared/input/bus"
import { createGamepadAdapter } from "@shared/input/gamepad-adapter"
import { createKeyboardAdapter } from "@shared/input/keyboard-adapter"
import {
  createNativeInputAdapter,
  type NativeInputAdapterOptions,
} from "@shared/input/native-adapter"
import { createPointerAdapter } from "@shared/input/pointer-adapter"
import type { Direction } from "@shared/input/types"
import { createWheelAdapter } from "@shared/input/wheel-adapter"
import {
  installNavigationDiagnostics,
  type NavigationDiagnosticsOptions,
} from "./diagnostics"
import {
  createFocusEngine,
  type FocusEngineOptions,
  type NextFocusFn,
} from "./focus-engine"
import { createInputModeStore, type InputModeStore } from "./input-mode"

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
  /** Disable the pointer adapter. */
  readonly pointer?: false | Parameters<typeof createPointerAdapter>[0]
  /** Disable the wheel adapter. */
  readonly wheel?: false | Parameters<typeof createWheelAdapter>[0]
  /** Enable the native input bridge adapter. Omitted by default. */
  readonly native?: false | NativeInputAdapterOptions
  /** Disable the input-mode store + DOM-attribute side effect. */
  readonly inputMode?: false
  /** Log navigation input actions and focus changes to the browser console. */
  readonly diagnostics?: boolean | NavigationDiagnosticsOptions
}

export interface SpatialNavigationHandle {
  readonly bus: InputBus
  readonly inputMode: InputModeStore | null
  dispose(): void
}

type SpatialNavigationListener = (
  handle: SpatialNavigationHandle | null,
) => void

let currentHandle: SpatialNavigationHandle | null = null
const listeners = new Set<SpatialNavigationListener>()

export function getSpatialNavigationSnapshot(): SpatialNavigationHandle | null {
  return currentHandle
}

export function subscribeSpatialNavigation(
  listener: SpatialNavigationListener,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setCurrentHandle(handle: SpatialNavigationHandle | null): void {
  currentHandle = handle
  for (const listener of [...listeners]) listener(currentHandle)
}

export function getSpatialNavigation(): SpatialNavigationHandle {
  if (!currentHandle) {
    throw new Error(
      "startSpatialNavigation() has not been called — initialize it in your app entrypoint before reading the spatial navigation bus",
    )
  }

  return currentHandle
}

export function getInputBus(): InputBus {
  return getSpatialNavigation().bus
}

export function startSpatialNavigation(
  options: StartSpatialNavigationOptions = {},
): SpatialNavigationHandle {
  currentHandle?.dispose()

  const bus = createInputBus()
  const disposeDiagnostics =
    options.diagnostics === true
      ? installNavigationDiagnostics(bus)
      : options.diagnostics
        ? installNavigationDiagnostics(bus, options.diagnostics)
        : () => {}

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

  // Input-mode store + dispatch matrix. Subscribes to the bus once and maps
  // source-tagged actions to mode flips. See plan unit 5 dispatch matrix:
  //
  //   source=pointer|wheel                     -> setPointerMode
  //   source=keyboard|gamepad|native + direction -> setDirectionalMode
  //   anything else (untagged, confirm/back/options/menu) -> no change
  //
  // The store owns the [data-input-mode] DOM attribute. When disabled
  // (inputMode: false in tests), no listener is attached.
  const inputMode = options.inputMode === false ? null : createInputModeStore()
  if (inputMode) {
    const store = inputMode
    bus.on(action => {
      const source = action.source
      if (source === "pointer" || source === "wheel") {
        store.setPointerMode()
        return
      }
      if (
        (source === "keyboard" ||
          source === "gamepad" ||
          source === "native") &&
        action.type === "direction"
      ) {
        store.setDirectionalMode()
      }
    })
  }

  if (options.keyboard !== false) {
    bus.use(createKeyboardAdapter(options.keyboard ?? undefined))
  }
  if (options.gamepad !== false) {
    bus.use(createGamepadAdapter(options.gamepad ?? undefined))
  }
  if (options.pointer !== false) {
    bus.use(createPointerAdapter(options.pointer ?? undefined))
  }
  if (options.wheel !== false) {
    bus.use(createWheelAdapter(options.wheel ?? undefined))
  }
  if (options.native !== false && options.native) {
    bus.use(createNativeInputAdapter(options.native))
  }

  const handle: SpatialNavigationHandle = {
    bus,
    inputMode,
    dispose: () => {
      disposeDiagnostics()
      bus.dispose()
      inputMode?.dispose()
      if (currentHandle === handle) setCurrentHandle(null)
    },
  }

  setCurrentHandle(handle)
  return handle
}
