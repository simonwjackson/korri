import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { SessionScreen } from "./SessionScreen"
import type { SessionLifecycleAdapter } from "./lifecycle-adapter"
import type { SessionLifecycleState } from "./state"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

interface DriverAdapter extends SessionLifecycleAdapter {
  emit(state: SessionLifecycleState): void
  readonly cleanupCount: number
}

function createDriverAdapter(
  initialState?: SessionLifecycleState,
): DriverAdapter {
  let listener: ((state: SessionLifecycleState) => void) | null = null
  let cleanupCount = 0
  return {
    start(onState) {
      listener = onState
      if (initialState !== undefined) onState(initialState)
      return () => {
        cleanupCount += 1
        listener = null
      }
    },
    emit(state) {
      listener?.(state)
    },
    get cleanupCount() {
      return cleanupCount
    },
  }
}

function connecting(
  currentStage: Extract<SessionLifecycleState, { _tag: "Connecting" }>["currentStage"],
  completed: readonly Extract<SessionLifecycleState, { _tag: "Connecting" }>["currentStage"][],
  detail: string | null = null,
): SessionLifecycleState {
  return {
    _tag: "Connecting",
    currentStage,
    completed: completed.filter(stage => stage !== null),
    detail,
  }
}

function failed(
  overrides: Partial<Extract<SessionLifecycleState, { _tag: "Failed" }>> = {},
): SessionLifecycleState {
  return {
    _tag: "Failed",
    reason: "HostUnreachable",
    stage: "handshaking",
    errorCode: -408,
    detail: "RTSP handshake",
    ...overrides,
  }
}

function renderSession(
  adapter: SessionLifecycleAdapter,
  onExit: () => void = () => undefined,
): { container: HTMLElement; root: Root; unmount: () => void } {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(<SessionScreen adapter={adapter} onExit={onExit} />)
  })
  return {
    container,
    root,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function text(container: HTMLElement): string {
  return container.textContent ?? ""
}

function stageLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("li"), item =>
    item.textContent ?? "",
  )
}

let cleanupRender: (() => void) | null = null
let restoreTimers: (() => void) | null = null

afterEach(() => {
  cleanupRender?.()
  cleanupRender = null
  restoreTimers?.()
  restoreTimers = null
  document.body.innerHTML = ""
})

describe("SessionScreen", () => {
  test("renders connecting stages in order with the current detail", () => {
    const adapter = createDriverAdapter(
      connecting("handshaking", ["launching-app", "initializing"], "RTSP handshake"),
    )
    const view = renderSession(adapter)
    cleanupRender = view.unmount

    expect(text(view.container)).toContain("Starting stream")
    expect(stageLabels(view.container)).toEqual([
      "Launching game",
      "Getting ready",
      "Contacting host",
      "Starting streams",
    ])
    expect(text(view.container)).toContain("RTSP handshake")
  })

  test("renders connected and graceful ended presentations", () => {
    const adapter = createDriverAdapter({ _tag: "Connected" })
    const view = renderSession(adapter)
    cleanupRender = view.unmount

    expect(text(view.container)).toContain("Starting…")

    act(() => adapter.emit({ _tag: "Ended" }))
    expect(text(view.container)).toContain("Stream ended")
    expect(text(view.container)).not.toContain("Starting stream")
  })

  test("renders failure detail and lets the user exit manually", () => {
    const adapter = createDriverAdapter(failed())
    const exits: string[] = []
    const view = renderSession(adapter, () => exits.push("exit"))
    cleanupRender = view.unmount

    expect(text(view.container)).toContain("Couldn't start the stream")
    expect(text(view.container)).toContain("HostUnreachable")
    expect(text(view.container)).toContain("RTSP handshake")
    expect(text(view.container)).toContain("error -408")

    const button = view.container.querySelector("button")
    expect(button?.textContent).toBe("Back to Korri")
    act(() => button?.click())
    expect(exits).toEqual(["exit"])
  })

  test("starts the adapter, cleans it up, and ignores late emissions after unmount", () => {
    const adapter = createDriverAdapter(connecting(null, []))
    const exits: string[] = []
    const view = renderSession(adapter, () => exits.push("exit"))
    cleanupRender = view.unmount

    act(() => adapter.emit({ _tag: "Connected" }))
    expect(text(view.container)).toContain("Starting…")

    view.unmount()
    cleanupRender = null
    expect(adapter.cleanupCount).toBe(1)

    act(() => adapter.emit(failed()))
    expect(text(view.container)).toBe("")
    expect(exits).toEqual([])
  })

  test("schedules failure auto-exit without waiting for the product deadline", () => {
    const timers = installTimerRecorder()
    restoreTimers = timers.restore
    const adapter = createDriverAdapter(failed())
    const exits: string[] = []
    const view = renderSession(adapter, () => exits.push("exit"))
    cleanupRender = view.unmount

    expect(timers.scheduled).toEqual([{ id: 1, delay: 8000 }])
    expect(exits).toEqual([])

    act(() => timers.fire(1))
    expect(exits).toEqual(["exit"])
  })

  test("cancels the failure auto-exit when failure leaves or the screen unmounts", () => {
    const timers = installTimerRecorder()
    restoreTimers = timers.restore
    const adapter = createDriverAdapter(failed())
    const view = renderSession(adapter)
    cleanupRender = view.unmount

    expect(timers.scheduled).toEqual([{ id: 1, delay: 8000 }])

    act(() => adapter.emit({ _tag: "Connected" }))
    expect(timers.cleared).toEqual([1])

    act(() => adapter.emit(failed({ reason: "ConnectionLost", errorCode: -100 })))
    expect(timers.scheduled).toEqual([
      { id: 1, delay: 8000 },
      { id: 2, delay: 8000 },
    ])

    view.unmount()
    cleanupRender = null
    expect(timers.cleared).toEqual([1, 2])
  })
})

function installTimerRecorder(): {
  readonly scheduled: readonly { readonly id: number; readonly delay: number }[]
  readonly cleared: readonly number[]
  fire(id: number): void
  restore(): void
} {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  let nextId = 1
  const callbacks = new Map<number, () => void>()
  const scheduled: { id: number; delay: number }[] = []
  const cleared: number[] = []

  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number) => {
    const id = nextId++
    const callback =
      typeof handler === "function" ? () => handler() : () => undefined
    callbacks.set(id, callback)
    scheduled.push({ id, delay: timeout ?? 0 })
    return id as unknown as ReturnType<typeof setTimeout>
  }) as unknown as typeof setTimeout

  globalThis.clearTimeout = ((timer?: ReturnType<typeof setTimeout>) => {
    const id = Number(timer)
    callbacks.delete(id)
    cleared.push(id)
  }) as unknown as typeof clearTimeout

  return {
    scheduled,
    cleared,
    fire(id) {
      callbacks.get(id)?.()
    },
    restore() {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    },
  }
}
