import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { connectMoonlightControl } from "./moonlight-control-client"
import { MOONLIGHT_CONTROL_PROTOCOL_LIMITS } from "./moonlight-control-protocol"

describe("moonlight local control client", () => {
  it("connects to a Unix socket and decodes hello and state responses", async () => {
    await withSocketServer(async ({ socketPath, writes }) => {
      const client = await connectMoonlightControl({ socketPath })
      try {
        const hello = await client.hello()
        const state = await client.state()

        expect(writes.map(write => JSON.parse(write).method)).toEqual([
          "protocol.hello",
          "state.get",
        ])
        expect(hello.result._tag).toBe("protocol.hello")
        expect(state.result._tag).toBe("state.snapshot")
      } finally {
        client.close()
      }
    })
  })

  it("preserves request correlation while events interleave with responses", async () => {
    await withSocketServer(
      async ({ socketPath }) => {
        const events: string[] = []
        const client = await connectMoonlightControl({ socketPath })
        try {
          client.onEvent(event => events.push(event.event.name))
          const state = await client.state()

          expect(state.result._tag).toBe("state.snapshot")
          expect(events).toEqual(["lifecycle.streaming"])
        } finally {
          client.close()
        }
      },
      { interleaveStateEvent: true },
    )
  })

  it("sends a bounded runtime bitrate command", async () => {
    await withSocketServer(async ({ socketPath, writes }) => {
      const client = await connectMoonlightControl({ socketPath })
      try {
        const response = await client.setBitrate({ bitrateKbps: 45000 })

        expect(response.result).toEqual({
          _tag: "command.accepted",
          requestId: "cmd-1",
          command: "runtime.setBitrate",
        })
        expect(JSON.parse(writes[0] ?? "{}")).toMatchObject({
          method: "runtime.setBitrate",
          params: { bitrateKbps: 45000 },
        })
      } finally {
        client.close()
      }
    })
  })

  it("sends a bounded runtime FPS command while preserving interleaved events", async () => {
    await withSocketServer(
      async ({ socketPath, writes }) => {
        const events: string[] = []
        const client = await connectMoonlightControl({ socketPath })
        try {
          client.onEvent(delivery => events.push(delivery.event.name))
          const response = await client.setFps({ fps: 90 })

          expect(response.result).toEqual({
            _tag: "command.accepted",
            requestId: "cmd-2",
            command: "runtime.setFps",
          })
          expect(events).toEqual(["quality.connection"])
          expect(JSON.parse(writes[0] ?? "{}")).toMatchObject({
            method: "runtime.setFps",
            params: { fps: 90 },
          })
        } finally {
          client.close()
        }
      },
      { interleaveFpsEvent: true },
    )
  })

  it("sends a runtime resolution command", async () => {
    await withSocketServer(async ({ socketPath, writes }) => {
      const client = await connectMoonlightControl({ socketPath })
      try {
        const response = await client.setResolution({
          width: 1280,
          height: 720,
        })

        expect(response.result).toEqual({
          _tag: "command.accepted",
          requestId: "cmd-3",
          command: "runtime.setResolution",
        })
        expect(JSON.parse(writes[0] ?? "{}")).toMatchObject({
          method: "runtime.setResolution",
          params: { width: 1280, height: 720 },
        })
      } finally {
        client.close()
      }
    })
  })

  it("rejects requests after close", async () => {
    await withSocketServer(async ({ socketPath }) => {
      const client = await connectMoonlightControl({ socketPath })
      await client.hello()
      client.close()

      await expect(client.state()).rejects.toEqual({
        _tag: "MoonlightControlClientProtocolError",
        message: "Moonlight control socket closed",
      })
    })
  })

  it("rejects JSON-RPC command errors as protocol errors", async () => {
    await withSocketServer(
      async ({ socketPath }) => {
        const client = await connectMoonlightControl({ socketPath })
        try {
          await expect(
            client.setBitrate({ bitrateKbps: 45000 }),
          ).rejects.toEqual({
            code: -32000,
            message: "runtime commands unsupported",
            data: { _tag: "unsupported" },
          })
        } finally {
          client.close()
        }
      },
      { rejectRuntimeCommands: true },
    )
  })

  it("reports sequence gaps and lets callers resnapshot", async () => {
    await withSocketServer(
      async ({ socketPath }) => {
        const gaps: Array<{
          readonly expectedSeq: number
          readonly actualSeq: number
        }> = []
        const client = await connectMoonlightControl({
          socketPath,
          onSequenceGap: gap => gaps.push(gap),
        })
        try {
          client.onEvent(() => undefined)
          await client.subscribe()
          expect(gaps).toEqual([{ expectedSeq: 2, actualSeq: 4 }])
        } finally {
          client.close()
        }
      },
      { sequenceGap: true },
    )
  })

  it("rejects malformed blank oversized and protocol mismatch frames as typed errors", async () => {
    await withSocketServer(
      async ({ socketPath }) => {
        const client = await connectMoonlightControl({
          socketPath,
          maxFrameBytes: 16,
        })
        try {
          await expect(client.hello()).rejects.toMatchObject({
            _tag: "MoonlightControlClientProtocolError",
          })
        } finally {
          client.close()
        }
      },
      { oversizedHello: true },
    )
  })
})

async function withSocketServer(
  run: (context: {
    readonly socketPath: string
    readonly writes: readonly string[]
  }) => Promise<void>,
  behavior: {
    readonly interleaveStateEvent?: boolean
    readonly interleaveFpsEvent?: boolean
    readonly rejectRuntimeCommands?: boolean
    readonly sequenceGap?: boolean
    readonly oversizedHello?: boolean
  } = {},
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "korri-moonlight-control-test-"))
  const socketPath = join(dir, "control.sock")
  const writes: string[] = []
  const server = createServer(socket => {
    let pending = ""
    socket.on("data", chunk => {
      pending += chunk.toString("utf8")
      while (pending.includes("\n")) {
        const index = pending.indexOf("\n")
        const line = pending.slice(0, index)
        pending = pending.slice(index + 1)
        if (line === "") continue
        writes.push(line)
        const request = JSON.parse(line)
        if (behavior.oversizedHello) {
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { padding: "x".repeat(100) } })}\n`,
          )
          continue
        }
        if (request.method === "runtime.setBitrate") {
          if (behavior.rejectRuntimeCommands) {
            socket.write(
              `${JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: "runtime commands unsupported", data: { _tag: "unsupported" } } })}\n`,
            )
            continue
          }
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "command.accepted", requestId: "cmd-1", command: "runtime.setBitrate" } })}\n`,
          )
        } else if (request.method === "runtime.setFps") {
          if (behavior.interleaveFpsEvent) {
            socket.write(
              `${JSON.stringify(eventFrame(1, "quality.connection"))}\n`,
            )
          }
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "command.accepted", requestId: "cmd-2", command: "runtime.setFps" } })}\n`,
          )
        } else if (request.method === "runtime.setResolution") {
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "command.accepted", requestId: "cmd-3", command: "runtime.setResolution" } })}\n`,
          )
        } else if (request.method === "protocol.hello") {
          socket.write(`${JSON.stringify(helloResponse(request.id))}\n`)
        } else if (request.method === "state.get") {
          if (behavior.interleaveStateEvent) {
            socket.write(
              `${JSON.stringify(eventFrame(1, "lifecycle.streaming"))}\n`,
            )
          }
          socket.write(`${JSON.stringify(stateResponse(request.id))}\n`)
        } else if (request.method === "events.subscribe") {
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "events.subscribed", seq: 0 } })}\n`,
          )
          socket.write(
            `${JSON.stringify(eventFrame(1, "lifecycle.streaming"))}\n`,
          )
          socket.write(
            `${JSON.stringify(eventFrame(behavior.sequenceGap ? 4 : 2, "quality.connection"))}\n`,
          )
        }
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(socketPath, resolve)
  })

  try {
    await run({ socketPath, writes })
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
}

function helloResponse(id: string | number) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      _tag: "protocol.hello",
      protocol: { name: "moonlight.local-control", major: 1, minor: 0 },
      session: { sessionId: "session-1", processId: 1234 },
      authority: "observer",
      capabilities: { events: ["lifecycle"], commands: [], experimental: [] },
      limits: MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
    },
  }
}

function stateResponse(id: string | number) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      _tag: "state.snapshot",
      seq: 1,
      session: { sessionId: "session-1", state: "streaming" },
      streamQuality: { connection: "unknown" },
      runtimeSettings: {},
      input: {
        route: "moonlight-embedded",
        status: "unknown",
        capabilities: [],
      },
    },
  }
}

function eventFrame(seq: number, name: string) {
  return {
    jsonrpc: "2.0",
    method: "moonlight.event",
    params: {
      seq,
      monotonicMs: seq,
      event: { name, state: "streaming", connection: "poor" },
    },
  }
}
