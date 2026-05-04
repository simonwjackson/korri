/**
 * Device-agnostic input model.
 *
 * The bus exposes semantic actions, never raw key codes or button indices.
 * Adapters translate device events (keyboard, gamepad, remote, touch) into
 * these actions so the rest of the app never knows which device produced them.
 *
 * Add a new action only when there is a use case in the app. Resist the urge
 * to mirror every gamepad button.
 */

export type Direction = "up" | "down" | "left" | "right"

/**
 * Identifies which adapter emitted an action. Used by the input-mode store
 * (`@shared/navigation/input-mode`) to decide between pointer mode and
 * directional mode without timing heuristics. Adapters populate this on
 * every emission; synthetic / test emits may omit it (no mode change occurs
 * for untagged actions).
 */
export type InputSource =
  | "keyboard"
  | "gamepad"
  | "pointer"
  | "wheel"
  | "native"

export type InputAction =
  | {
      readonly type: "direction"
      readonly direction: Direction
      readonly source?: InputSource
    }
  | { readonly type: "confirm"; readonly source?: InputSource }
  | { readonly type: "back"; readonly source?: InputSource }
  | { readonly type: "options"; readonly source?: InputSource }
  | { readonly type: "menu"; readonly source?: InputSource }
  /**
   * Internal coordination action emitted by the pointer adapter on every
   * qualifying mousemove. Reserved for the input-mode store — product code
   * should NOT subscribe to this via `useInputAction("pointer-activity", ...)`.
   * It signals "the user is using a pointer device right now" so the cursor
   * can reappear even when no focusable is hovered (e.g., the cursor moves
   * across a search box that holds focus).
   */
  | { readonly type: "pointer-activity"; readonly source: "pointer" }

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
