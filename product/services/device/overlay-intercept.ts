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
  /** Gate the game and start delivering nav events. Idempotent. */
  readonly activate: (onNav: (nav: OverlayNav) => void) => Promise<void>
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

export function createOverlayInterceptController(
  port: InputPlumberInterceptPort,
): OverlayInterceptController {
  let active = false
  let unsubscribe: (() => void) | null = null

  return {
    async activate(onNav) {
      if (active) return
      active = true
      // Subscribe before enabling intercept so no press is missed.
      unsubscribe = port.subscribeInputEvents((capability, value) => {
        if (value !== 1) return // press only; ignore release (0)
        const nav = NAV_BY_CAPABILITY[capability]
        if (nav) onNav(nav)
      })
      try {
        await port.setInterceptMode(2)
      } catch (error) {
        // Do not leave the game gated if enabling failed.
        await this.deactivate()
        throw error
      }
    },

    async deactivate() {
      if (!active) return
      active = false
      const stop = unsubscribe
      unsubscribe = null
      try {
        await port.setInterceptMode(0)
      } finally {
        stop?.()
      }
    },

    isActive: () => active,
  }
}
