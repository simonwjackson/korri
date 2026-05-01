import type { Direction, InputAction, InputAdapter } from "./types"

/**
 * Keyboard adapter: translates KeyboardEvent.key values to semantic actions.
 *
 * The keymap is fully configurable. Defaults aim at the lowest common
 * denominator: arrow keys for direction, Enter/Space for confirm,
 * Escape/Backspace for back. Options/menu are intentionally unmapped on
 * keyboard so they don't steal accessibility-critical keys (Tab, etc.);
 * supply your own mapping if you need them.
 */

export interface KeyboardKeyMap {
  readonly direction: Readonly<Record<Direction, ReadonlyArray<string>>>
  readonly confirm: ReadonlyArray<string>
  readonly back: ReadonlyArray<string>
  readonly options: ReadonlyArray<string>
  readonly menu: ReadonlyArray<string>
}

export const defaultKeyboardKeyMap: KeyboardKeyMap = {
  direction: {
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
  },
  confirm: ["Enter", " "],
  back: ["Escape", "Backspace"],
  options: [],
  menu: [],
}

export interface KeyboardAdapterOptions {
  /** Override key bindings. */
  readonly keymap?: KeyboardKeyMap
  /** Where to attach the keydown listener. Defaults to window. */
  readonly target?: EventTarget
  /** When the focused element is editable, ignore the event entirely. */
  readonly ignoreWhenEditable?: boolean
}

export function createKeyboardAdapter(
  options: KeyboardAdapterOptions = {},
): InputAdapter {
  const keymap = options.keymap ?? defaultKeyboardKeyMap
  const target = options.target ?? window
  const ignoreWhenEditable = options.ignoreWhenEditable ?? true

  return {
    name: "keyboard",
    start(emit) {
      const handler = (event: Event) => {
        const ev = event as KeyboardEvent
        if (ev.defaultPrevented) return
        if (ignoreWhenEditable && isEditableElement(document.activeElement))
          return

        const action = matchAction(ev.key, keymap)
        if (!action) return

        emit(action)
        ev.preventDefault()
      }

      target.addEventListener("keydown", handler)
      return () => target.removeEventListener("keydown", handler)
    },
  }
}

function matchAction(key: string, keymap: KeyboardKeyMap): InputAction | null {
  for (const direction of ["up", "down", "left", "right"] as const) {
    if (keymap.direction[direction].includes(key))
      return { type: "direction", direction, source: "keyboard" }
  }
  if (keymap.confirm.includes(key))
    return { type: "confirm", source: "keyboard" }
  if (keymap.back.includes(key)) return { type: "back", source: "keyboard" }
  if (keymap.options.includes(key))
    return { type: "options", source: "keyboard" }
  if (keymap.menu.includes(key)) return { type: "menu", source: "keyboard" }
  return null
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return (el as HTMLElement).isContentEditable === true
}
