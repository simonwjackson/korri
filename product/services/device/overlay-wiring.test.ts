import { describe, expect, it } from "bun:test"
import { createOverlayHoldHandlerFromEnv } from "./overlay-wiring"

describe("createOverlayHoldHandlerFromEnv", () => {
  it("returns null when the renderer bin is not set (no-overlay mode)", () => {
    const handler = createOverlayHoldHandlerFromEnv({
      env: {},
      forceQuit: () => {},
    })
    expect(handler).toBeNull()
  })

  it("returns a handler when the renderer bin is set", () => {
    const handler = createOverlayHoldHandlerFromEnv({
      env: {
        KORRI_OVERLAY_RENDERER_BIN: "/nix/store/x/bin/korri-overlay-renderer",
      },
      forceQuit: () => {},
    })
    expect(typeof handler).toBe("function")
  })
})
