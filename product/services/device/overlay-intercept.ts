/**
 * Controls InputPlumber intercept for the decision overlay.
 *
 * While active, InputPlumber InterceptMode is set so the emulated gamepad the
 * game/stream reads goes silent (the game is gated) and controller input is
 * delivered to us as semantic navigation events (ui_up/down/left/right/accept/
 * back). This is the input brain for the overlay: inputd owns it, the renderer
 * never reads the controller. Proven live on Bandai (38->0 gating; ui_* capture).
 *
 * The DBus transport is injected as a port so the mapping and on/off lifecycle
 * are unit-testable without a bus.
 */

export type OverlayNav = "up" | "down" | "left" | "right" | "accept" | "back"

/** 0 = none, 1 = pass (guide only), 2 = all (route input to the DBus channel). */
export type InterceptMode = 0 | 1 | 2

export interface InputPlumberInterceptPort {
  readonly setInterceptMode: (mode: InterceptMode) => Promise<void>
  /**
   * Subscribe to intercepted input events. `value` is 1 on press, 0 on release.
   * Returns an unsubscribe function.
   */
  readonly subscribeInputEvents: (
    onEvent: (capability: string, value: number) => void,
  ) => () => void
}

export interface OverlayInterceptController {
  /**
   * Gate the game and start delivering nav events. Idempotent. `onChord` fires
   * when the dismiss chord (the same L1+R1+Start+Select the overlay opened with)
   * is pressed again while gated — the game's chord is routed to us as
   * ui_l1+ui_r1+ui_select+ui_option, so the player can close the menu with the
   * exact gesture that opened it.
   */
  readonly activate: (
    onNav: (nav: OverlayNav) => void,
    onChord?: () => void,
  ) => Promise<void>
  /** Restore input to the game and stop nav events. Always safe to call. */
  readonly deactivate: () => Promise<void>
  readonly isActive: () => boolean
}

const NAV_BY_CAPABILITY: Readonly<Record<string, OverlayNav>> = {
  ui_up: "up",
  ui_down: "down",
  ui_left: "left",
  ui_right: "right",
  ui_accept: "accept",
  ui_back: "back",
}

// While gated (InterceptMode 2), the physical quit chord (L1+R1+Start+Select) is
// routed to us as these DBus capabilities. When all four are held at once we
// treat it as "dismiss" so the player closes the menu with the same gesture that
// opened it (verified on Bandai's InputPlumber profile).
const DISMISS_CHORD_CAPABILITIES: readonly string[] = [
  "ui_l1",
  "ui_r1",
  "ui_select",
  "ui_option",
]

export function createOverlayInterceptController(
  port: InputPlumberInterceptPort,
): OverlayInterceptController {
  let active = false
  let handler: ((nav: OverlayNav) => void) | null = null
  let chordHandler: (() => void) | null = null
  const chordHeld = new Set<string>()
  let chordFired = false

  // Subscribe ONCE, up front, and keep the subscription for the controller's
  // lifetime. If we subscribed per-activate, the monitor would still be
  // connecting when intercept goes hot, and the first press after opening the
  // menu would be dropped. With a persistent monitor there is no startup race:
  // when intercept is off no events reach the DBus channel anyway, and when it
  // is on the first event is delivered immediately. We gate delivery on `active`.
  port.subscribeInputEvents((capability, value) => {
    // Dismiss-chord tracking runs on both press and release so we can detect the
    // full combo and re-arm cleanly. Only fires once per chord press.
    if (DISMISS_CHORD_CAPABILITIES.includes(capability)) {
      if (value === 1) chordHeld.add(capability)
      else chordHeld.delete(capability)
      if (
        active &&
        !chordFired &&
        chordHeld.size === DISMISS_CHORD_CAPABILITIES.length
      ) {
        chordFired = true
        chordHandler?.()
      }
      if (chordHeld.size < DISMISS_CHORD_CAPABILITIES.length) chordFired = false
    }

    if (!active || value !== 1) return // active + press only; ignore release (0)
    const nav = NAV_BY_CAPABILITY[capability]
    if (nav && handler) handler(nav)
  })

  return {
    async activate(onNav, onChord) {
      if (active) return
      active = true
      handler = onNav
      chordHandler = onChord ?? null
      chordHeld.clear()
      chordFired = false
      try {
        await port.setInterceptMode(2)
      } catch (error) {
        // Do not leave the game gated if enabling failed.
        active = false
        handler = null
        chordHandler = null
        chordHeld.clear()
        chordFired = false
        try {
          await port.setInterceptMode(0)
        } catch {
          // best-effort restore
        }
        throw error
      }
    },

    async deactivate() {
      if (!active) return
      active = false
      handler = null
      chordHandler = null
      chordHeld.clear()
      chordFired = false
      await port.setInterceptMode(0)
    },

    isActive: () => active,
  }
}
