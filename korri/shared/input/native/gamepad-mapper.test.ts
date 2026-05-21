import { afterEach, describe, expect, it } from "bun:test"
import {
  ABS_HAT0X,
  ABS_X,
  ABS_Y,
  BTN_A,
  BTN_B,
  BTN_DPAD_RIGHT,
  BTN_START,
  BTN_Y,
  EV_ABS,
  EV_KEY,
} from "./button-codes"
import { createNativeGamepadMapper } from "./gamepad-mapper"
import type { InputAction } from "../types"

const mappers: Array<{ reset(): void }> = []

afterEach(() => {
  for (const mapper of mappers.splice(0)) mapper.reset()
})

function createMapper(options = {}) {
  const emitted: InputAction[] = []
  const mapper = createNativeGamepadMapper({
    repeatDelayMs: 20,
    repeatIntervalMs: 10,
    staleReleaseMs: 250,
    ...options,
  })
  mappers.push(mapper)
  return {
    emitted,
    mapper,
    send: (overrides: Parameters<typeof inputEvent>[0]) => {
      mapper.handle(inputEvent(overrides), action => emitted.push(action))
    },
  }
}

describe("createNativeGamepadMapper", () => {
  it("maps gamepad button presses to semantic native actions", () => {
    const { emitted, send } = createMapper()

    send({ code: BTN_A, value: 1 })
    send({ code: BTN_B, value: 1 })
    send({ code: BTN_Y, value: 1 })
    send({ code: BTN_START, value: 1 })

    expect(emitted).toEqual([
      { type: "confirm", source: "native" },
      { type: "back", source: "native" },
      { type: "options", source: "native" },
      { type: "menu", source: "native" },
    ])
  })

  it("emits one direction for a short d-pad press", async () => {
    const { emitted, send } = createMapper()

    send({ code: BTN_DPAD_RIGHT, value: 1 })
    send({ code: BTN_DPAD_RIGHT, value: 0 })
    await Bun.sleep(40)

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "native" },
    ])
  })

  it("repeats held d-pad directions after the configured delay", async () => {
    const { emitted, send } = createMapper()

    send({ code: BTN_DPAD_RIGHT, value: 1 })

    await waitFor(() => emitted.length >= 3, "held d-pad repeats")
    expect(emitted.slice(0, 3)).toEqual([
      { type: "direction", direction: "right", source: "native" },
      { type: "direction", direction: "right", source: "native" },
      { type: "direction", direction: "right", source: "native" },
    ])
  })

  it("stops a held direction if the bridge misses a release event", async () => {
    const { emitted, send } = createMapper({
      repeatDelayMs: 100,
      staleReleaseMs: 35,
    })

    send({ type: EV_ABS, code: ABS_HAT0X, value: 1 })
    await waitFor(() => emitted.length === 1, "initial direction")
    await Bun.sleep(120)

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "native" },
    ])
  })

  it("maps analog axes through dominant-axis selection", () => {
    const { emitted, send } = createMapper({ axisThreshold: 16_000 })

    send({ type: EV_ABS, code: ABS_X, value: 20_000 })
    send({ type: EV_ABS, code: ABS_Y, value: 10_000 })

    expect(emitted[0]).toEqual({
      type: "direction",
      direction: "right",
      source: "native",
    })
  })

  it("reset clears held directions, pressed buttons, and axes", async () => {
    const { emitted, mapper, send } = createMapper({
      repeatDelayMs: 20,
      repeatIntervalMs: 10,
    })

    send({ code: BTN_DPAD_RIGHT, value: 1 })
    send({ code: BTN_A, value: 1 })
    send({ type: EV_ABS, code: ABS_X, value: 20_000 })
    mapper.reset()
    await Bun.sleep(50)
    send({ code: BTN_A, value: 1 })

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "native" },
      { type: "confirm", source: "native" },
      { type: "direction", direction: "right", source: "native" },
      { type: "confirm", source: "native" },
    ])
  })
})

async function waitFor(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(5)
  }
  throw new Error(`timed out waiting for ${description}`)
}

function inputEvent(
  overrides: Partial<{
    deviceId: string
    type: number
    code: number
    value: number
    timestamp: number
  }>,
) {
  return {
    deviceId: "inputplumber-virtual-xbox360",
    type: EV_KEY,
    code: BTN_A,
    value: 1,
    timestamp: Date.now(),
    ...overrides,
  }
}
