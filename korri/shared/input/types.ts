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

export type InputAction =
  | { readonly type: "direction"; readonly direction: Direction }
  | { readonly type: "confirm" }
  | { readonly type: "back" }
  | { readonly type: "options" }
  | { readonly type: "menu" }

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
