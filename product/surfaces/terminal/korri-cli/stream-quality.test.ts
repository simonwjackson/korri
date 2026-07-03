import { describe, expect, test } from "bun:test"
import type {
  MoonlightControlClient,
  MoonlightControlEventDelivery,
} from "@platform/stream/moonlight-control-client"
import type {
  MoonlightControlStateSnapshotResult,
  MoonlightControlSuccessResponse,
} from "@platform/stream/moonlight-control-protocol"
import {
  formatSetOutcome,
  formatState,
  newestSocketPath,
  parseResolution,
  resolveMoonlightControlRoot,
  runStreamSet,
  runStreamShow,
  type StreamQualityIo,
} from "./stream-quality"

function snapshot(
  overrides: Partial<{
    appliedBitrateKbps: number
    appliedFps: number
    appliedResolution: { width: number; height: number }
    lastCommand: { command: string; status: string }
    streamBitrateKbps: number
    streamFps: number
    width: number
    height: number
  }> = {},
): MoonlightControlStateSnapshotResult {
  return {
    _tag: "state.snapshot",
    seq: 1,
    session: { sessionId: "moonlight-abc", state: "streaming" },
    streamQuality: {
      connection: "good",
      bitrateKbps: overrides.streamBitrateKbps,
      fps: overrides.streamFps,
      width: overrides.width,
      height: overrides.height,
    },
    runtimeSettings: {
      appliedBitrateKbps: overrides.appliedBitrateKbps,
      appliedFps: overrides.appliedFps,
      appliedResolution: overrides.appliedResolution,
      lastCommand: overrides.lastCommand
        ? {
            requestId: 7,
            command: overrides.lastCommand.command,
            status: overrides.lastCommand.status,
          }
        : undefined,
    },
    input: {
      route: "moonlight-embedded",
      status: "available",
      capabilities: [],
    },
  } as MoonlightControlStateSnapshotResult
}

function successResponse(
  result: MoonlightControlStateSnapshotResult | { readonly _tag: string },
): MoonlightControlSuccessResponse {
  return { jsonrpc: "2.0", id: 1, result } as MoonlightControlSuccessResponse
}

interface ClientLog {
  readonly calls: string[]
}

function stateClient(
  states: readonly MoonlightControlStateSnapshotResult[],
  log: ClientLog,
  behavior: { readonly rejectSet?: string } = {},
): MoonlightControlClient {
  let index = 0
  const nextState = () => {
    const value = states[Math.min(index, states.length - 1)]
    index += 1
    return successResponse(value)
  }
  const reject = () => Promise.reject(new Error(behavior.rejectSet ?? ""))
  return {
    hello: async () => successResponse({ _tag: "protocol.hello" }),
    state: async () => {
      log.calls.push("state")
      return nextState()
    },
    setBitrate: async params => {
      log.calls.push(`setBitrate:${params.bitrateKbps}`)
      if (behavior.rejectSet) return reject()
      return successResponse({ _tag: "command.accepted" })
    },
    setFps: async params => {
      log.calls.push(`setFps:${params.fps}`)
      if (behavior.rejectSet) return reject()
      return successResponse({ _tag: "command.accepted" })
    },
    setResolution: async params => {
      log.calls.push(`setResolution:${params.width}x${params.height}`)
      if (behavior.rejectSet) return reject()
      return successResponse({ _tag: "command.accepted" })
    },
    setTouchBounds: async () => successResponse({ _tag: "command.accepted" }),
    subscribe: async () => successResponse({ _tag: "events.subscribed" }),
    onEvent:
      (_listener: (delivery: MoonlightControlEventDelivery) => void) =>
      () => {},
    close: () => {
      log.calls.push("close")
    },
  }
}

function io(
  states: readonly MoonlightControlStateSnapshotResult[],
  out: string[],
  err: string[],
  log: ClientLog,
  behavior: { rejectSet?: string; noSocket?: boolean } = {},
): StreamQualityIo {
  return {
    discoverSocket: async () =>
      behavior.noSocket ? undefined : "/run/user/2000/x/control.sock",
    connect: async () => stateClient(states, log, behavior),
    write: line => out.push(line),
    writeError: line => err.push(line),
    sleep: async () => {},
  }
}

describe("parseResolution", () => {
  test("parses WxH", () => {
    expect(parseResolution("1280x720")).toEqual({ width: 1280, height: 720 })
  })
  test("rejects bad shapes", () => {
    expect(parseResolution("1280")).toBeUndefined()
    expect(parseResolution("1280x")).toBeUndefined()
    expect(parseResolution("0x720")).toBeUndefined()
  })
})

describe("resolveMoonlightControlRoot", () => {
  test("prefers XDG_RUNTIME_DIR", () => {
    expect(
      resolveMoonlightControlRoot({ XDG_RUNTIME_DIR: "/run/user/2000" }),
    ).toBe("/run/user/2000/korri-moonlight")
  })
  test("falls back to the uid runtime dir", () => {
    expect(resolveMoonlightControlRoot({}, 2000)).toBe(
      "/run/user/2000/korri-moonlight",
    )
  })
  test("returns undefined with no basis", () => {
    expect(resolveMoonlightControlRoot({})).toBeUndefined()
  })
})

describe("newestSocketPath", () => {
  test("picks the highest mtime", () => {
    expect(
      newestSocketPath([
        { path: "/a", mtimeMs: 10 },
        { path: "/b", mtimeMs: 30 },
        { path: "/c", mtimeMs: 20 },
      ]),
    ).toBe("/b")
  })
  test("undefined when empty", () => {
    expect(newestSocketPath([])).toBeUndefined()
  })
})

describe("formatState", () => {
  test("shows applied settings and last change", () => {
    const text = formatState(
      snapshot({
        streamBitrateKbps: 20000,
        streamFps: 60,
        width: 1920,
        height: 1080,
        appliedBitrateKbps: 20000,
        appliedFps: 60,
        appliedResolution: { width: 1920, height: 1080 },
        lastCommand: { command: "runtime.setBitrate", status: "applied" },
      }),
    )
    expect(text).toContain("20000 kbps, 60 fps, 1920x1080")
    expect(text).toContain("last change:  runtime.setBitrate -> applied")
  })
})

describe("formatSetOutcome", () => {
  test("reports requested versus applied", () => {
    const text = formatSetOutcome(
      { kind: "bitrate", bitrateKbps: 5000 },
      snapshot({ appliedBitrateKbps: 20000 }),
      snapshot({
        appliedBitrateKbps: 5000,
        lastCommand: { command: "runtime.setBitrate", status: "applied" },
      }),
    )
    expect(text).toContain("requested:    5000 kbps")
    expect(text).toContain("now applied:  5000 kbps")
    expect(text).toContain("device says:  runtime.setBitrate -> applied")
    expect(text).toContain("was applied:  20000 kbps")
  })
})

describe("runStreamShow", () => {
  test("prints current state and closes", async () => {
    const out: string[] = []
    const err: string[] = []
    const log: ClientLog = { calls: [] }
    const code = await runStreamShow(
      io(
        [snapshot({ appliedBitrateKbps: 15000, appliedFps: 60 })],
        out,
        err,
        log,
      ),
    )
    expect(code).toBe(0)
    expect(out.join("\n")).toContain("15000 kbps")
    expect(log.calls).toContain("close")
  })

  test("no running stream reports a clear error", async () => {
    const out: string[] = []
    const err: string[] = []
    const log: ClientLog = { calls: [] }
    const code = await runStreamShow(
      io([snapshot()], out, err, log, { noSocket: true }),
    )
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("no running stream found")
  })
})

describe("runStreamSet", () => {
  test("sends the change then reads back applied state", async () => {
    const out: string[] = []
    const err: string[] = []
    const log: ClientLog = { calls: [] }
    const code = await runStreamSet(
      { kind: "bitrate", bitrateKbps: 5000 },
      io(
        [
          snapshot({ appliedBitrateKbps: 20000 }),
          snapshot({
            appliedBitrateKbps: 5000,
            lastCommand: { command: "runtime.setBitrate", status: "applied" },
          }),
        ],
        out,
        err,
        log,
      ),
    )
    expect(code).toBe(0)
    expect(log.calls).toEqual(["state", "setBitrate:5000", "state", "close"])
    expect(out.join("\n")).toContain("now applied:  5000 kbps")
  })

  test("a rejected command surfaces the host error", async () => {
    const out: string[] = []
    const err: string[] = []
    const log: ClientLog = { calls: [] }
    const code = await runStreamSet(
      { kind: "fps", fps: 60 },
      io([snapshot()], out, err, log, {
        rejectSet: "runtime.setFps unsupported for this session",
      }),
    )
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("unsupported")
    expect(log.calls).toContain("close")
  })
})
