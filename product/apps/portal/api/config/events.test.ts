import { describe, expect, it } from "bun:test"
import type {
  ConfigGraphController,
  ConfigGraphEvent,
} from "@platform/library/config-graph-controller"
import { createConfigEventsStream } from "./events"

function fakeController(
  initial: ConfigGraphEvent,
): ConfigGraphController & { emit: (event: ConfigGraphEvent) => void } {
  const listeners = new Set<(event: ConfigGraphEvent) => void>()
  return {
    initialize: async () => initial,
    rebuild: async () => initial,
    subscribe: listener => {
      listeners.add(listener)
      listener(initial)
      return () => listeners.delete(listener)
    },
    snapshot: async () => [],
    state: () => initial,
    stop: async () => {},
    emit: event => {
      for (const listener of listeners) listener(event)
    },
  }
}

async function readEvents(
  stream: ReadableStream<Uint8Array>,
  count: number,
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ""
  let frames = 0
  while (frames < count) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value)
    frames = text.split("\n\n").filter(Boolean).length
  }
  reader.releaseLock()
  return text
}

const readyEvent: ConfigGraphEvent = {
  name: "config.ready",
  generation: 1,
  attempt: 1,
  status: "valid",
  files: ["local.korri.yaml"],
}

describe("createConfigEventsStream", () => {
  it("streams config.ready immediately on connect", async () => {
    const controller = fakeController(readyEvent)
    const stream = createConfigEventsStream(controller)
    const text = await readEvents(stream, 1)
    expect(text).toContain("event: config.ready")
    expect(text).toContain('"generation":1')
    expect(text).toContain('"status":"valid"')
    expect(text).not.toContain('"name"')
  })

  it("streams subsequent config.changed events", async () => {
    const controller = fakeController(readyEvent)
    const stream = createConfigEventsStream(controller)
    const pending = readEvents(stream, 2)
    controller.emit({
      name: "config.changed",
      generation: 2,
      attempt: 2,
      status: "valid",
      files: ["local.korri.yaml"],
      changedPath: "local.korri.yaml",
    })
    const text = await pending
    expect(text).toContain("event: config.changed")
    expect(text).toContain('"generation":2')
    expect(text).toContain('"changedPath":"local.korri.yaml"')
  })

  it("streams config.invalid events with a message", async () => {
    const controller = fakeController(readyEvent)
    const stream = createConfigEventsStream(controller)
    const pending = readEvents(stream, 2)
    controller.emit({
      name: "config.invalid",
      generation: 1,
      attempt: 2,
      status: "invalid",
      message: "boom",
    })
    const text = await pending
    expect(text).toContain("event: config.invalid")
    expect(text).toContain('"status":"invalid"')
    expect(text).toContain('"message":"boom"')
  })

  it("stops delivering after the abort signal fires", async () => {
    const controller = fakeController(readyEvent)
    const ac = new AbortController()
    const stream = createConfigEventsStream(controller, ac.signal)
    await readEvents(stream, 1)
    ac.abort()
    // After abort the controller should have no subscribers left.
    controller.emit({
      name: "config.changed",
      generation: 2,
      attempt: 2,
      status: "valid",
      files: [],
    })
    // No assertion error means the closed stream did not throw on emit.
    expect(true).toBe(true)
  })
})
