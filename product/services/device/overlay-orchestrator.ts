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
  /**
   * Touch selection reported by the renderer (which owns the on-screen layout).
   * A non-negative index selects and confirms that option directly (a tap acts);
   * a negative index cancels an open menu. Ignored when no menu is open.
   */
  readonly onTouchSelect: (index: number) => void
  readonly isMenuOpen: () => boolean
}

export function createOverlayOrchestrator(deps: {
  readonly renderer: OverlayRendererClient
  readonly intercept: OverlayInterceptController
  readonly actions: OverlayActions
  readonly sessionKind: () => OverlaySessionKind
  /** A foreground game/stream session is active. The overlay is a no-op otherwise. */
  readonly isSessionActive: () => boolean
}): OverlayOrchestrator {
  let menu: OverlayMenu | null = null
  let menuOptions: readonly OverlayMenuOption[] = []
  let gated = false

  // Gate as soon as the chord engages (on press), not only when the menu opens.
  // The chord buttons otherwise leak to the foreground game/stream and can
  // trigger its own exit hotkey (observed: a stream quitting immediately). While
  // gated, input is routed to us; nav is ignored until a menu is actually open.
  function ensureGated(): Promise<void> {
    if (gated) return Promise.resolve()
    gated = true
    return Promise.resolve(
      deps.intercept.activate(
        nav => {
          if (!menu) return
          const result = menu.handle(nav)
          if (!result) {
            deps.renderer.menu(menuOptions, menu.state().selected)
            return
          }
          closeMenu(result.kind === "chosen" ? result.id : null)
        },
        () => {
          // The same quit chord, pressed again while the menu is open, dismisses
          // it -- equivalent to "keep playing". This is the gated counterpart to
          // the second-tap dismiss (inputd can't see the chord on the pad while
          // gated, so the intercept surfaces it from dbus0).
          if (menu) closeMenu(null)
        },
      ),
    )
  }

  function ungate(): void {
    if (!gated) return
    gated = false
    void deps.intercept.deactivate()
  }

  function openMenu(): void {
    const kind = deps.sessionKind()
    menuOptions = overlayMenuOptionsFor(kind)
    menu = createOverlayMenu(menuOptions, safeDefaultIndex(menuOptions))
    const opened = menu
    // Draw the menu only AFTER the intercept is confirmed hot (InterceptMode 2).
    // Enabling intercept spawns a busctl round-trip (~100-300ms); if we drew the
    // menu first, a fast accept press would race that window and leak to the pad
    // instead of the menu -- the "first press didn't register" double-press. The
    // menu model exists synchronously so any nav that does arrive is handled; we
    // just defer the visible frame until input is actually routed to us.
    void ensureGated().then(() => {
      if (menu === opened)
        deps.renderer.menu(menuOptions, opened.state().selected)
    })
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

  function dismissForNoSession(): void {
    // Scope guard: if no game/stream session is active (e.g. on the hub, or the
    // session ended mid-gesture), the overlay must show nothing and hold no
    // input. Tear down anything in flight.
    if (menu) {
      menu = null
    }
    deps.renderer.hide()
    ungate()
  }

  return {
    onTouchSelect(index) {
      if (!deps.isSessionActive()) {
        dismissForNoSession()
        return
      }
      if (!menu) return
      if (index < 0 || index >= menuOptions.length) {
        closeMenu(null)
        return
      }
      closeMenu(menuOptions[index].id)
    },
    onHoldUpdate(update) {
      if (!deps.isSessionActive()) {
        dismissForNoSession()
        return
      }
      switch (update.phase) {
        case "press":
          // Buffer: show nothing yet, and do NOT gate here. inputd reads the
          // emulated pad to time the hold; enabling the intercept now would make
          // InputPlumber release the held chord buttons on that pad, so inputd
          // would see an instant release and the hold would collapse to a tap.
          // Gating happens only once the menu opens.
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
          // A second tap while the menu is open dismisses it (repeat the motion
          // to cancel); otherwise open it.
          if (menu) closeMenu(null)
          else openMenu()
          return
        case "cancel":
          // Released mid-hold: abandon the gesture, back to the game.
          deps.renderer.hide()
          ungate()
          return
      }
    },
    isMenuOpen: () => menu !== null,
  }
}
