/**
 * Device-agnostic input model.
 *
 * The bus exposes semantic actions, never raw key codes or button indices.
 * Adapters translate device events (keyboard, gamepad, remote) into these
 * actions so the rest of the app never knows which device produced them.
 *
 * Touch is deliberately absent: surfaces render native focusable controls, so
 * a tap is already a click on the thing that was touched. Routing it through
 * the bus would only re-derive what the DOM already knows.
 *
 * Add a new action only when there is a use case in the app. Resist the urge
 * to mirror every gamepad button.
 */

export type Direction = "up" | "down" | "left" | "right"

/**
 * Identifies which adapter emitted an action. Action semantics do not vary by
 * source, but release-capable gestures use it as an opaque identity namespace
 * so two adapters cannot release one another. Synthetic / test emits may omit it.
 */
export type InputSource = "keyboard" | "gamepad" | "native"

export type InputAction =
  | {
      readonly type: "direction"
      readonly direction: Direction
      /** Semantic held-direction repeat; no hardware timing or key data leaks. */
      readonly repeat?: boolean
      readonly releaseExpected?: never
      readonly gestureId?: never
      readonly source?: InputSource
    }
  | {
      readonly type: "direction"
      readonly direction: Direction
      /** Semantic held-direction repeat; no hardware timing or key data leaks. */
      readonly repeat?: boolean
      /** This adapter will emit one matching direction-end edge. */
      readonly releaseExpected: true
      /** Opaque process-local gesture identity; never a hardware identifier. */
      readonly gestureId: number
      readonly source?: InputSource
    }
  | {
      readonly type: "direction-end"
      readonly direction: Direction
      readonly gestureId: number
      readonly source?: InputSource
    }
  | { readonly type: "confirm"; readonly source?: InputSource }
  | { readonly type: "back"; readonly source?: InputSource }
  | { readonly type: "options"; readonly source?: InputSource }
  | { readonly type: "menu"; readonly source?: InputSource }
  | { readonly type: "system"; readonly source?: InputSource }

export type InputActionType = InputAction["type"]

export type InputListener = (action: InputAction) => void

/**
 * An input adapter knows how to listen to one device and emit InputActions.
 * `start` is called once with an emit fn and returns a disposer.
 */
export interface InputAdapter {
  readonly name: string
  start(emit: InputListener): () => void
}
