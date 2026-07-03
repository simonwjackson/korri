/**
 * Ties the overlay pieces into the actual interaction, driven by the chord-hold
 * supervisor's updates:
 *
 *   press     -> show the hold ring at 0%
 *   progress  -> fill the ring
 *   fired     -> hide + force-quit the foreground (the deliberate 2s hold)
 *   tap       -> open the decision menu: gate the game (intercept), render the
 *                menu, drive selection from ui_* nav, and run the chosen action
 *
 * inputd owns this; the renderer is a dumb view and the intercept controller is
 * the input source. All collaborators are injected so the flow is unit-tested.
 */
import type { ChordHoldUpdate } from "@platform/input/native/chord-hold-supervisor"
import type { OverlayInterceptController } from "./overlay-intercept"
import {
  createOverlayMenu,
  overlayMenuOptionsFor,
  safeDefaultIndex,
  type OverlayMenu,
  type OverlayMenuOption,
  type OverlaySessionKind,
} from "./overlay-menu"

export interface OverlayRendererClient {
  readonly ring: (pct: number) => void
  readonly menu: (
    options: readonly OverlayMenuOption[],
    selected: number,
  ) => void
  readonly hide: () => void
}

export interface OverlayActions {
  /** Quit the foreground: local game, or on a stream close the local view (remote lives). */
  readonly forceQuit: () => void | Promise<void>
  /** Stream only: stop the game on the source; the stream collapses as a side effect. */
  readonly closeRemoteGame: () => void | Promise<void>
}

export interface OverlayOrchestrator {
  readonly onHoldUpdate: (update: ChordHoldUpdate) => void
  readonly isMenuOpen: () => boolean
}

export function createOverlayOrchestrator(deps: {
  readonly renderer: OverlayRendererClient
  readonly intercept: OverlayInterceptController
  readonly actions: OverlayActions
  readonly sessionKind: () => OverlaySessionKind
}): OverlayOrchestrator {
  let menu: OverlayMenu | null = null
  let menuOptions: readonly OverlayMenuOption[] = []
  let gated = false

  // Gate as soon as the chord engages (on press), not only when the menu opens.
  // The chord buttons otherwise leak to the foreground game/stream and can
  // trigger its own exit hotkey (observed: a stream quitting immediately). While
  // gated, input is routed to us; nav is ignored until a menu is actually open.
  function ensureGated(): void {
    if (gated) return
    gated = true
    void deps.intercept.activate(nav => {
      if (!menu) return
      const result = menu.handle(nav)
      if (!result) {
        deps.renderer.menu(menuOptions, menu.state().selected)
        return
      }
      closeMenu(result.kind === "chosen" ? result.id : null)
    })
  }

  function ungate(): void {
    if (!gated) return
    gated = false
    void deps.intercept.deactivate()
  }

  function openMenu(): void {
    ensureGated()
    const kind = deps.sessionKind()
    menuOptions = overlayMenuOptionsFor(kind)
    menu = createOverlayMenu(menuOptions, safeDefaultIndex(menuOptions))
    deps.renderer.menu(menuOptions, menu.state().selected)
  }

  function closeMenu(chosenId: string | null): void {
    menu = null
    deps.renderer.hide()
    ungate()
    if (chosenId) performChoice(chosenId)
  }

  function performChoice(id: string): void {
    switch (id) {
      case "quit-game":
      case "close-stream":
        void deps.actions.forceQuit()
        return
      case "close-game":
        void deps.actions.closeRemoteGame()
        return
      case "keep-playing":
      default:
        return
    }
  }

  return {
    onHoldUpdate(update) {
      switch (update.phase) {
        case "press":
          ensureGated()
          deps.renderer.ring(0)
          return
        case "progress":
          deps.renderer.ring(Math.round(update.progress * 100))
          return
        case "fired":
          deps.renderer.hide()
          void deps.actions.forceQuit()
          ungate()
          return
        case "tap":
          openMenu()
          return
      }
    },
    isMenuOpen: () => menu !== null,
  }
}
