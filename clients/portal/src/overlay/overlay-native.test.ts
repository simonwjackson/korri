import { describe, expect, test } from "bun:test"
import type {
  GameplayOverlayConfig,
  KorriOverlayMessageSurface,
} from "@contracts/bridge/korri-native-bridge"
import { AndroidMoonlightEffect } from "@contracts/generated/korrid"
import { createInputBus } from "../input/bus"
import type { InputAction } from "../input/types"
import { createNativeOverlayConnection } from "./overlay-native"

function recordingSurface(): KorriOverlayMessageSurface & { readonly messages: unknown[] } {
  const messages: unknown[] = []
  return {
    messages,
    postMessage(messageJson) {
      messages.push(JSON.parse(messageJson))
    },
  }
}

describe("native overlay message connection", () => {
  test("uses only the approved ready, dismiss, refresh, execution and one receiver messages", async () => {
    const surface = recordingSurface()
    const bus = createInputBus()
    const input: InputAction[] = []
    bus.on(action => input.push(action))
    const configs: GameplayOverlayConfig[] = []
    const connection = createNativeOverlayConnection(surface, bus)
    const stop = connection.start(config => configs.push(config))

    expect(surface.messages).toEqual([{ type: "ready" }])
    window.__korriOverlayMessage?.(JSON.stringify({
      type: "config",
      payload: {
        korridPort: 43117,
        korridCapability: "opaque-capability",
        launchId: "0123456789abcdef0123456789abcdef",
      },
    }))
    window.__korriOverlayMessage?.(JSON.stringify({
      type: "input",
      payload: {
        type: "direction",
        direction: "right",
        repeat: true,
        source: "gamepad",
      },
    }))
    connection.platform.dismiss()
    connection.platform.requestAuthorityRefresh()
    const instruction = {
      launchId: "0123456789abcdef0123456789abcdef",
      actionId: "fill",
      nonce: "nonce",
      value: { kind: "toggle" as const, value: true },
      effect: {
        kind: "android-moonlight" as const,
        payload: AndroidMoonlightEffect.SetFillMode,
      },
      integrity: "opaque",
    }
    const execution = connection.platform.executeProtectedInstruction(instruction)

    expect(configs).toEqual([
      {
        korridPort: 43117,
        korridCapability: "opaque-capability",
        launchId: "0123456789abcdef0123456789abcdef",
      },
    ])
    expect(input).toEqual([
      {
        type: "direction",
        direction: "right",
        repeat: true,
        source: "gamepad",
      },
    ])
    expect(surface.messages).toEqual([
      { type: "ready" },
      { type: "dismiss" },
      { type: "refresh-authority" },
      {
        type: "execute-protected-instruction",
        requestId: "instruction-1",
        instruction,
      },
    ])

    window.__korriOverlayMessage?.(JSON.stringify({
      type: "instruction-result",
      requestId: "instruction-1",
      outcome: { _tag: "Unavailable", message: "Executor is not installed." },
    }))
    expect(await execution).toEqual({
      _tag: "Unavailable",
      message: "Executor is not installed.",
    })

    stop()
    expect(window.__korriOverlayMessage).toBeUndefined()
  })

  test("ignores malformed and unapproved native messages", () => {
    const surface = recordingSurface()
    const bus = createInputBus()
    const received: InputAction[] = []
    bus.on(action => received.push(action))
    const configs: GameplayOverlayConfig[] = []
    const stop = createNativeOverlayConnection(surface, bus)
      .start(config => configs.push(config))

    for (const value of [
      "not-json",
      JSON.stringify({ type: "launch", payload: {} }),
      JSON.stringify({ type: "config", payload: { korridPort: "43117" } }),
      JSON.stringify({ type: "config", payload: {
        korridPort: 0,
        korridCapability: "capability",
        launchId: "launch",
      } }),
      JSON.stringify({ type: "config", payload: {
        korridPort: 43117,
        korridCapability: " ",
        launchId: "launch",
      } }),
      JSON.stringify({ type: "input", payload: { type: "key", keyCode: 19 } }),
      JSON.stringify({ type: "input", payload: {
        type: "confirm",
        source: "keyboard",
      } }),
      JSON.stringify({ type: "instruction-result", requestId: "request", outcome: {
        _tag: "Executed",
        message: "not allowed",
      } }),
      JSON.stringify({ type: "instruction-result", requestId: "request", outcome: {
        _tag: "Unavailable",
        message: "",
      } }),
    ]) window.__korriOverlayMessage?.(value)

    expect(configs).toEqual([])
    expect(received).toEqual([])
    expect(surface.messages).toEqual([{ type: "ready" }])
    stop()
  })

  test("bounds protected instructions and clears pending timers on response and dispose", async () => {
    const surface = recordingSurface()
    const connection = createNativeOverlayConnection(
      surface,
      createInputBus(),
      { instructionTimeoutMs: 5 },
    )
    const stop = connection.start(() => {})
    const instruction = {
      launchId: "0123456789abcdef0123456789abcdef",
      actionId: "fill",
      nonce: "nonce",
      value: { kind: "toggle" as const, value: true },
      effect: {
        kind: "android-moonlight" as const,
        payload: AndroidMoonlightEffect.SetFillMode,
      },
      integrity: "opaque",
    }

    expect(await connection.platform.executeProtectedInstruction(instruction)).toEqual({
      _tag: "Unavailable",
      message: "The gameplay action timed out.",
    })

    const disposed = connection.platform.executeProtectedInstruction(instruction)
    stop()
    expect(await disposed).toEqual({
      _tag: "Unavailable",
      message: "The gameplay overlay closed before the action completed.",
    })
  })
})
