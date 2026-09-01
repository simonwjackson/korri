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
      let nextGestureId = 1
      const activeDirections = new Map<string, { direction: Direction; gestureId: number }>()
      const awaitingRelease = new Set<string>()
      const retireActiveDirections = () => {
        for (const [key, gesture] of activeDirections) {
          awaitingRelease.add(key)
          emit({
            type: "direction-end",
            direction: gesture.direction,
            gestureId: gesture.gestureId,
            source: "keyboard",
          })
        }
        activeDirections.clear()
      }
      const handler = (event: Event) => {
        const ev = event as KeyboardEvent
        if (ev.defaultPrevented) return
        const action = matchAction(ev.key, keymap)
        if (!action) return
        const active = document.activeElement
        const horizontalControl = action.type === "direction" &&
          active instanceof HTMLElement &&
          active.hasAttribute("data-korri-horizontal-control")
        if (ignoreWhenEditable && isEditableElement(active) && !horizontalControl) return
        if (action.type === "confirm" && ev.repeat) {
          ev.preventDefault()
          return
        }

        if (action.type === "direction") {
          if (awaitingRelease.has(ev.key)) {
            ev.preventDefault()
            return
          }
          let gesture = activeDirections.get(ev.key)
          if (!gesture) {
            if (ev.repeat) {
              ev.preventDefault()
              return
            }
            gesture = { direction: action.direction, gestureId: nextGestureId++ }
            activeDirections.set(ev.key, gesture)
          }
          emit({
            ...action,
            direction: gesture.direction,
            releaseExpected: true,
            gestureId: gesture.gestureId,
            ...(ev.repeat ? { repeat: true } : {}),
          })
        } else {
          emit(action)
        }
        ev.preventDefault()
      }
      const releaseHandler = (event: Event) => {
        const ev = event as KeyboardEvent
        if (awaitingRelease.delete(ev.key)) {
          ev.preventDefault()
          return
        }
        const gesture = activeDirections.get(ev.key)
        if (!gesture) return
        activeDirections.delete(ev.key)
        emit({
          type: "direction-end",
          direction: gesture.direction,
          gestureId: gesture.gestureId,
          source: "keyboard",
        })
        ev.preventDefault()
      }

      const visibilityHandler = () => {
        if (document.visibilityState === "hidden") retireActiveDirections()
      }

      target.addEventListener("keydown", handler)
      target.addEventListener("keyup", releaseHandler)
      target.addEventListener("blur", retireActiveDirections)
      document.addEventListener("visibilitychange", visibilityHandler)
      return () => {
        target.removeEventListener("keydown", handler)
        target.removeEventListener("keyup", releaseHandler)
        target.removeEventListener("blur", retireActiveDirections)
        document.removeEventListener("visibilitychange", visibilityHandler)
        activeDirections.clear()
        awaitingRelease.clear()
      }
    },
  }
}

function matchDirection(key: string, keymap: KeyboardKeyMap): Direction | null {
  for (const direction of ["up", "down", "left", "right"] as const) {
    if (keymap.direction[direction].includes(key)) return direction
  }
  return null
}

function matchAction(key: string, keymap: KeyboardKeyMap): InputAction | null {
  const direction = matchDirection(key, keymap)
  if (direction) return { type: "direction", direction, source: "keyboard" }
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
