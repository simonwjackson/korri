/**
 * The decision-menu state machine (pure, UI-agnostic).
 *
 * inputd feeds nav events (from the intercept controller) into this model; it
 * tracks the selected option and resolves to a choice on accept or a cancel on
 * back. The renderer is a dumb view that draws `state()` — it never decides
 * anything here.
 */
import type { OverlayNav } from "./overlay-intercept"

export interface OverlayMenuOption {
  readonly id: string
  readonly label: string
  readonly danger?: boolean
}

export type OverlayMenuResult =
  | { readonly kind: "chosen"; readonly id: string }
  | { readonly kind: "cancelled" }

export interface OverlayMenuState {
  readonly options: readonly OverlayMenuOption[]
  readonly selected: number
}

export interface OverlayMenu {
  readonly state: () => OverlayMenuState
  /** Apply a nav event. Returns a result on accept/back, or null when it only moved. */
  readonly handle: (nav: OverlayNav) => OverlayMenuResult | null
}

export function createOverlayMenu(
  options: readonly OverlayMenuOption[],
  initialSelected = 0,
): OverlayMenu {
  if (options.length === 0) {
    throw new Error("overlay menu requires at least one option")
  }
  let selected = clamp(initialSelected, options.length)

  return {
    state: () => ({ options, selected }),
    handle(nav) {
      switch (nav) {
        case "left":
        case "up":
          selected = clamp(selected - 1, options.length)
          return null
        case "right":
        case "down":
          selected = clamp(selected + 1, options.length)
          return null
        case "accept":
          return { kind: "chosen", id: options[selected].id }
        case "back":
          return { kind: "cancelled" }
      }
    },
  }
}

function clamp(value: number, length: number): number {
  if (value < 0) return 0
  if (value > length - 1) return length - 1
  return value
}

export type OverlaySessionKind = "local" | "stream"

/**
 * The choices for a session, with "keep playing" last as the safe default.
 * Local: Quit game / Keep playing. Stream: Close stream / Close game on host /
 * Keep playing (close-stream leaves the remote game running; close-game stops it
 * on the source and lets the stream collapse as a side effect).
 */
export function overlayMenuOptionsFor(
  kind: OverlaySessionKind,
): readonly OverlayMenuOption[] {
  if (kind === "stream") {
    return [
      { id: "close-stream", label: "Close stream" },
      { id: "close-game", label: "Close game on host", danger: true },
      { id: "keep-playing", label: "Keep playing" },
    ]
  }
  return [
    { id: "quit-game", label: "Quit game", danger: true },
    { id: "keep-playing", label: "Keep playing" },
  ]
}

/** Index of the safe default ("keep playing"), for the initial selection. */
export function safeDefaultIndex(options: readonly OverlayMenuOption[]): number {
  const index = options.findIndex(option => option.id === "keep-playing")
  return index >= 0 ? index : options.length - 1
}
