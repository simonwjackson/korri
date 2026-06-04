import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MOONLIGHT_CONTROL_PROTOCOL_LIMITS } from "@platform/stream/moonlight-control-protocol"
import { decodeMoonlightRuntimeWatchArtifact } from "@platform/stream/moonlight-runtime-watch-artifact"
import { runMoonlightRuntimeWatchCommand } from "./moonlight-runtime-watch"

describe("moonlight-runtime-watch cli", () => {
  it("runs an attach-only probe and writes a machine-readable artifact summary", async () => {
    await withRuntimeWatchSocket(async ({ socketPath }) => {
      const writes: string[] = []
      const artifacts = new Map<string, string>()
      const exitCode = await runMoonlightRuntimeWatchCommand(
        ["probe", "--socket", socketPath, "--artifact", "/tmp/probe.json"],
        {
          write: line => writes.push(line),
          writeArtifact: async (path, content) => {
            artifacts.set(path, content)
          },
          createRunId: () => "run-probe",
          now: () => new Date("2026-05-26T00:00:00.000Z"),
        },
      )

      expect(exitCode).toBe(0)
      const summary = JSON.parse(writes.at(-1) ?? "{}")
      expect(summary).toEqual({
        terminalResult: "probe-succeeded",
        exitCode: 0,
        artifactPath: "/tmp/probe.json",
      })
      const artifact = decodeMoonlightRuntimeWatchArtifact(
        JSON.parse(artifacts.get("/tmp/probe.json") ?? "{}"),
      )
      expect(artifact.scenario._tag).toBe("probe")
      expect(artifact.terminal.result).toBe("probe-succeeded")
      expect(artifact.commandResponse).toBeUndefined()
    })
  })

  it("uses the generated run id for the default artifact path", async () => {
    await withRuntimeWatchSocket(async ({ socketPath }) => {
      const writes: string[] = []
      const artifacts = new Map<string, string>()
      let idCounter = 0
      const exitCode = await runMoonlightRuntimeWatchCommand(
        ["probe", "--socket", socketPath],
        {
          write: line => writes.push(line),
          writeArtifact: async (path, content) => {
            artifacts.set(path, content)
          },
          createRunId: () => `run-${++idCounter}`,
          now: () => new Date("2026-05-26T00:00:00.000Z"),
        },
      )

      expect(exitCode).toBe(0)
      const summary = JSON.parse(writes.at(-1) ?? "{}")
      expect(summary.artifactPath).toBe(
        "out/artifacts/moonlight-runtime-watch/run-1.json",
      )
      const artifact = decodeMoonlightRuntimeWatchArtifact(
        JSON.parse(artifacts.get(summary.artifactPath) ?? "{}"),
      )
      expect(artifact.run.id).toBe("run-1")
    })
  })

  it("watches a bitrate mutation until a correlated applied event arrives", async () => {
    await withRuntimeWatchSocket(async ({ socketPath, requests }) => {
      const writes: string[] = []
      const artifacts = new Map<string, string>()
      const exitCode = await runMoonlightRuntimeWatchCommand(
        [
          "set-bitrate",
          "--bitrate-kbps",
          "45000",
          "--socket",
          socketPath,
          "--artifact",
          "/tmp/bitrate.json",
          "--timeout-ms",
          "200",
        ],
        {
          write: line => writes.push(line),
          writeArtifact: async (path, content) => {
            artifacts.set(path, content)
          },
          createRunId: () => "run-bitrate",
          now: () => new Date("2026-05-26T00:00:00.000Z"),
        },
      )

      expect(exitCode).toBe(0)
      expect(requests.map(request => request.method)).toContain(
        "runtime.setBitrate",
      )
      const artifact = artifactAt(artifacts, "/tmp/bitrate.json")
      expect(artifact.terminal.result).toBe("applied")
      expect(artifact.commandResponse).toMatchObject({
        _tag: "command.accepted",
        command: "runtime.setBitrate",
      })
      expect(JSON.parse(writes.at(-1) ?? "{}").terminalResult).toBe("applied")
    })
  })

  it("correlates command events with the native command id rather than the JSON-RPC id", async () => {
    await withRuntimeWatchSocket(
      async ({ socketPath }) => {
        const artifacts = new Map<string, string>()
        const exitCode = await runMoonlightRuntimeWatchCommand(
          [
            "set-bitrate",
            "--bitrate-kbps",
            "45000",
            "--socket",
            socketPath,
            "--artifact",
            "/tmp/native-id.json",
            "--timeout-ms",
            "200",
          ],
          {
            write: () => undefined,
            writeArtifact: async (path, content) => {
              artifacts.set(path, content)
            },
            createRunId: () => "run-native-id",
            now: () => new Date("2026-05-26T00:00:00.000Z"),
          },
        )

        expect(exitCode).toBe(0)
        const artifact = decodeMoonlightRuntimeWatchArtifact(
          JSON.parse(artifacts.get("/tmp/native-id.json") ?? "{}"),
        )
        expect(artifact.commandResponse).toMatchObject({ requestId: 100001 })
        expect(artifact.observedEvents).toContainEqual(
          expect.objectContaining({
            event: expect.objectContaining({ requestId: 100001 }),
          }),
        )
        expect(artifact.terminal.result).toBe("applied")
      },
      { bitrateCommandId: 100001 },
    )
  })

  it("watches an FPS mutation until a correlated applied event arrives", async () => {
    await withRuntimeWatchSocket(async ({ socketPath, requests }) => {
      const artifacts = new Map<string, string>()
      const exitCode = await runMoonlightRuntimeWatchCommand(
        [
          "set-fps",
          "--fps",
          "90",
          "--socket",
          socketPath,
          "--artifact",
          "/tmp/fps.json",
          "--timeout-ms",
          "200",
        ],
        {
          write: () => undefined,
          writeArtifact: async (path, content) => {
            artifacts.set(path, content)
          },
          createRunId: () => "run-fps",
          now: () => new Date("2026-05-26T00:00:00.000Z"),
        },
      )

      expect(exitCode).toBe(0)
      expect(requests.map(request => request.method)).toContain(
        "runtime.setFps",
      )
      const artifact = artifactAt(artifacts, "/tmp/fps.json")
      expect(artifact.terminal.result).toBe("applied")
      expect(artifact.commandResponse).toMatchObject({
        command: "runtime.setFps",
      })
    })
  })

  it("watches a resolution mutation until a correlated applied event and state arrive", async () => {
    await withRuntimeWatchSocket(async ({ socketPath, requests }) => {
      const artifacts = new Map<string, string>()
      const exitCode = await runMoonlightRuntimeWatchCommand(
        [
          "set-resolution",
          "--width",
          "1280",
          "--height",
          "720",
          "--socket",
          socketPath,
          "--artifact",
          "/tmp/resolution.json",
          "--timeout-ms",
          "200",
        ],
        {
          write: () => undefined,
          writeArtifact: async (path, content) => {
            artifacts.set(path, content)
          },
          createRunId: () => "run-resolution",
          now: () => new Date("2026-05-26T00:00:00.000Z"),
        },
      )

      expect(exitCode).toBe(0)
      expect(requests.map(request => request.method)).toContain(
        "runtime.setResolution",
      )
      const artifact = decodeMoonlightRuntimeWatchArtifact(
        JSON.parse(artifacts.get("/tmp/resolution.json") ?? "{}"),
      )
      expect(artifact.terminal.result).toBe("applied")
      expect(artifact.commandResponse).toMatchObject({
        command: "runtime.setResolution",
      })
      expect(artifact.postSnapshot?.runtimeSettings.appliedResolution).toEqual({
        width: 1280,
        height: 720,
      })
    })
  })

  it("classifies accepted command results as not terminal", async () => {
    await withRuntimeWatchSocket(
      async ({ socketPath }) => {
        const artifacts = new Map<string, string>()
        const exitCode = await runMoonlightRuntimeWatchCommand(
          [
            "set-bitrate",
            "--bitrate-kbps",
            "45000",
            "--socket",
            socketPath,
            "--artifact",
            "/tmp/accepted.json",
            "--timeout-ms",
            "200",
          ],
          {
            write: () => undefined,
            writeArtifact: async (path, content) => {
              artifacts.set(path, content)
            },
            createRunId: () => "run-accepted",
            now: () => new Date("2026-05-26T00:00:00.000Z"),
          },
        )

        expect(exitCode).toBe(32)
        const artifact = decodeMoonlightRuntimeWatchArtifact(
          JSON.parse(artifacts.get("/tmp/accepted.json") ?? "{}"),
        )
        expect(artifact.terminal.result).toBe("sent-no-terminal-outcome")
      },
      { commandStatus: "accepted" },
    )
  })

  it("rejects resolution locally when capability is not advertised", async () => {
    await withRuntimeWatchSocket(
      async ({ socketPath, requests }) => {
        const artifacts = new Map<string, string>()
        const exitCode = await runMoonlightRuntimeWatchCommand(
          [
            "set-resolution",
            "--width",
            "1280",
            "--height",
            "720",
            "--socket",
            socketPath,
            "--artifact",
            "/tmp/resolution-rejected.json",
          ],
          {
            write: () => undefined,
            writeArtifact: async (path, content) => {
              artifacts.set(path, content)
            },
            createRunId: () => "run-resolution-rejected",
            now: () => new Date("2026-05-26T00:00:00.000Z"),
          },
        )

        expect(exitCode).toBe(30)
        expect(requests.map(request => request.method)).not.toContain(
          "runtime.setResolution",
        )
        const artifact = decodeMoonlightRuntimeWatchArtifact(
          JSON.parse(artifacts.get("/tmp/resolution-rejected.json") ?? "{}"),
        )
        expect(artifact.terminal.result).toBe("local-rejected")
      },
      { commands: ["runtime.setBitrate", "runtime.setFps"] },
    )
  })

  it("does not report applied when post-snapshot state does not match", async () => {
    await withRuntimeWatchSocket(
      async ({ socketPath }) => {
        const artifacts = new Map<string, string>()
        const exitCode = await runMoonlightRuntimeWatchCommand(
          [
            "set-bitrate",
            "--bitrate-kbps",
            "45000",
            "--socket",
            socketPath,
            "--artifact",
            "/tmp/mismatch.json",
            "--timeout-ms",
            "200",
          ],
          {
            write: () => undefined,
            writeArtifact: async (path, content) => {
              artifacts.set(path, content)
            },
            createRunId: () => "run-mismatch",
            now: () => new Date("2026-05-26T00:00:00.000Z"),
          },
        )

        expect(exitCode).toBe(31)
        const artifact = decodeMoonlightRuntimeWatchArtifact(
          JSON.parse(artifacts.get("/tmp/mismatch.json") ?? "{}"),
        )
        expect(artifact.terminal.result).toBe("host-rejected")
        expect(artifact.terminal.reason).toBe(
          "applied state did not match requested setting",
        )
      },
      { mismatchedAppliedState: true },
    )
  })

  it("records local touch-bounds command proof without host-apply proof", async () => {
    await withRuntimeWatchSocket(
      async ({ socketPath, requests }) => {
        const artifacts = new Map<string, string>()
        const exitCode = await runMoonlightRuntimeWatchCommand(
          [
            "set-touch-bounds",
            "--x",
            "960",
            "--y",
            "0",
            "--w",
            "960",
            "--h",
            "1080",
            "--socket",
            socketPath,
            "--artifact",
            "/tmp/touch.json",
            "--timeout-ms",
            "200",
          ],
          {
            write: () => undefined,
            writeArtifact: async (path, content) => {
              artifacts.set(path, content)
            },
            createRunId: () => "run-touch",
            now: () => new Date("2026-05-26T00:00:00.000Z"),
          },
        )

        expect(exitCode).toBe(0)
        expect(requests.map(request => request.method)).toContain(
          "input.setTouchBounds",
        )
        const artifact = decodeMoonlightRuntimeWatchArtifact(
          JSON.parse(artifacts.get("/tmp/touch.json") ?? "{}"),
        )
        expect(artifact.scenario).toMatchObject({
          _tag: "set-touch-bounds",
          x: 960,
          y: 0,
          w: 960,
          h: 1080,
        })
        expect(artifact.terminal.result).toBe("applied")
        expect(artifact.proof).toMatchObject({
          controlPlane: "observed",
          hostApply: "not-collected",
        })
      },
      { commands: ["input.setTouchBounds"] },
    )
  })

  it("classifies host/runtime command rejection separately from local rejection", async () => {
    await withRuntimeWatchSocket(
      async ({ socketPath }) => {
        const artifacts = new Map<string, string>()
        const exitCode = await runMoonlightRuntimeWatchCommand(
          [
            "set-bitrate",
            "--bitrate-kbps",
            "45000",
            "--socket",
            socketPath,
            "--artifact",
            "/tmp/host-rejected.json",
            "--timeout-ms",
            "200",
          ],
          {
            write: () => undefined,
            writeArtifact: async (path, content) => {
              artifacts.set(path, content)
            },
            createRunId: () => "run-host-rejected",
            now: () => new Date("2026-05-26T00:00:00.000Z"),
          },
        )

        expect(exitCode).toBe(31)
        const artifact = decodeMoonlightRuntimeWatchArtifact(
          JSON.parse(artifacts.get("/tmp/host-rejected.json") ?? "{}"),
        )
        expect(artifact.terminal.result).toBe("host-rejected")
        expect(artifact.terminal.reason).toBe("unsupported")
      },
      { commandStatus: "unsupported" },
    )
  })

  it("writes an attach-failed artifact when the socket cannot be reached", async () => {
    const artifacts = new Map<string, string>()
    const exitCode = await runMoonlightRuntimeWatchCommand(
      [
        "probe",
        "--socket",
        "/tmp/does-not-exist.sock",
        "--artifact",
        "/tmp/attach.json",
      ],
      {
        write: () => undefined,
        writeError: () => undefined,
        writeArtifact: async (path, content) => {
          artifacts.set(path, content)
        },
        createRunId: () => "run-attach",
        now: () => new Date("2026-05-26T00:00:00.000Z"),
      },
    )

    expect(exitCode).toBe(20)
    const artifact = decodeMoonlightRuntimeWatchArtifact(
      JSON.parse(artifacts.get("/tmp/attach.json") ?? "{}"),
    )
    expect(artifact.socket.attached).toBe(false)
    expect(artifact.terminal.result).toBe("attach-failed")
  })

  it("rejects unsupported mutation scenarios locally without sending a command", async () => {
    await withRuntimeWatchSocket(
      async ({ socketPath, requests }) => {
        const artifacts = new Map<string, string>()
        const exitCode = await runMoonlightRuntimeWatchCommand(
          [
            "set-fps",
            "--fps",
            "90",
            "--socket",
            socketPath,
            "--artifact",
            "/tmp/local-rejected.json",
          ],
          {
            write: () => undefined,
            writeArtifact: async (path, content) => {
              artifacts.set(path, content)
            },
            createRunId: () => "run-rejected",
            now: () => new Date("2026-05-26T00:00:00.000Z"),
          },
        )

        expect(exitCode).toBe(30)
        expect(requests.map(request => request.method)).not.toContain(
          "runtime.setFps",
        )
        const artifact = decodeMoonlightRuntimeWatchArtifact(
          JSON.parse(artifacts.get("/tmp/local-rejected.json") ?? "{}"),
        )
        expect(artifact.terminal.result).toBe("local-rejected")
      },
      { commands: ["runtime.setBitrate"] },
    )
  })

  it("classifies an accepted command without a terminal event as sent-no-terminal-outcome", async () => {
    await withRuntimeWatchSocket(
      async ({ socketPath }) => {
        const artifacts = new Map<string, string>()
        const exitCode = await runMoonlightRuntimeWatchCommand(
          [
            "set-bitrate",
            "--bitrate-kbps",
            "45000",
            "--socket",
            socketPath,
            "--artifact",
            "/tmp/timeout.json",
            "--timeout-ms",
            "20",
          ],
          {
            write: () => undefined,
            writeArtifact: async (path, content) => {
              artifacts.set(path, content)
            },
            createRunId: () => "run-timeout",
            now: () => new Date("2026-05-26T00:00:00.000Z"),
          },
        )

        expect(exitCode).toBe(32)
        const artifact = decodeMoonlightRuntimeWatchArtifact(
          JSON.parse(artifacts.get("/tmp/timeout.json") ?? "{}"),
        )
        expect(artifact.terminal.result).toBe("sent-no-terminal-outcome")
      },
      { emitCommandResult: false },
    )
  })

  it("gives artifact-write-failed precedence over an observed success", async () => {
    await withRuntimeWatchSocket(async ({ socketPath }) => {
      const writes: string[] = []
      const exitCode = await runMoonlightRuntimeWatchCommand(
        ["probe", "--socket", socketPath, "--artifact", "/tmp/fail.json"],
        {
          write: line => writes.push(line),
          writeArtifact: async () => {
            throw new Error("disk full")
          },
          createRunId: () => "run-artifact-failed",
          now: () => new Date("2026-05-26T00:00:00.000Z"),
        },
      )

      expect(exitCode).toBe(40)
      expect(JSON.parse(writes.at(-1) ?? "{}")).toEqual({
        terminalResult: "artifact-write-failed",
        exitCode: 40,
        artifactPath: "/tmp/fail.json",
      })
    })
  })
})

// fallow-ignore-next-line code-duplication
async function withRuntimeWatchSocket(
  run: (context: {
    readonly socketPath: string
    readonly requests: readonly Record<string, unknown>[]
  }) => Promise<void>,
  behavior: {
    readonly commands?: readonly string[]
    readonly emitCommandResult?: boolean
    readonly commandStatus?: string
    readonly bitrateCommandId?: string | number
    readonly fpsCommandId?: string | number
    readonly resolutionCommandId?: string | number
    readonly touchCommandId?: string | number
    readonly mismatchedAppliedState?: boolean
  } = {},
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "korri-runtime-watch-test-"))
  const socketPath = join(dir, "control.sock")
  const requests: Record<string, unknown>[] = []
  let appliedState: {
    readonly bitrateKbps?: number
    readonly fps?: number
    readonly resolution?: { readonly width: number; readonly height: number }
  } = { bitrateKbps: 40000, fps: 60 }
  const server = createServer(socket => {
    let pending = ""
    socket.on("data", chunk => {
      pending += chunk.toString("utf8")
      while (pending.includes("\n")) {
        const index = pending.indexOf("\n")
        const line = pending.slice(0, index)
        pending = pending.slice(index + 1)
        if (line === "") continue
        const request = JSON.parse(line)
        requests.push(request)
        if (request.method === "protocol.hello") {
          socket.write(
            `${JSON.stringify(helloResponse(request.id, behavior.commands))}\n`,
          )
        } else if (request.method === "state.get") {
          socket.write(
            `${JSON.stringify(stateResponse(request.id, appliedState))}\n`,
          )
        } else if (request.method === "events.subscribe") {
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "events.subscribed", seq: 0 } })}\n`,
          )
        } else if (request.method === "runtime.setBitrate") {
          const commandId = behavior.bitrateCommandId ?? "cmd-bitrate"
          const params = request.params as { readonly bitrateKbps?: number }
          if (
            behavior.commandStatus !== "accepted" &&
            !behavior.mismatchedAppliedState
          ) {
            appliedState = { ...appliedState, bitrateKbps: params.bitrateKbps }
          }
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "command.accepted", requestId: commandId, command: "runtime.setBitrate" } })}\n`,
          )
          if (behavior.emitCommandResult !== false) {
            socket.write(
              `${JSON.stringify(commandResultEvent(commandId, "runtime.setBitrate", behavior.commandStatus ?? "applied"))}\n`,
            )
          }
        } else if (request.method === "runtime.setFps") {
          const commandId = behavior.fpsCommandId ?? "cmd-fps"
          const params = request.params as { readonly fps?: number }
          if (
            behavior.commandStatus !== "accepted" &&
            !behavior.mismatchedAppliedState
          ) {
            appliedState = { ...appliedState, fps: params.fps }
          }
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "command.accepted", requestId: commandId, command: "runtime.setFps" } })}\n`,
          )
          if (behavior.emitCommandResult !== false) {
            socket.write(
              `${JSON.stringify(commandResultEvent(commandId, "runtime.setFps", behavior.commandStatus ?? "applied"))}\n`,
            )
          }
        } else if (request.method === "runtime.setResolution") {
          const commandId = behavior.resolutionCommandId ?? "cmd-resolution"
          const params = request.params as {
            readonly width?: number
            readonly height?: number
          }
          if (
            behavior.commandStatus !== "accepted" &&
            !behavior.mismatchedAppliedState
          ) {
            appliedState = {
              ...appliedState,
              resolution:
                typeof params.width === "number" &&
                typeof params.height === "number"
                  ? { width: params.width, height: params.height }
                  : appliedState.resolution,
            }
          }
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "command.accepted", requestId: commandId, command: "runtime.setResolution" } })}\n`,
          )
          if (behavior.emitCommandResult !== false) {
            socket.write(
              `${JSON.stringify(commandResultEvent(commandId, "runtime.setResolution", behavior.commandStatus ?? "applied"))}\n`,
            )
          }
        } else if (request.method === "input.setTouchBounds") {
          const commandId = behavior.touchCommandId ?? "cmd-touch"
          socket.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { _tag: "input.command.result", requestId: commandId, command: "input.setTouchBounds", status: behavior.commandStatus ?? "applied" } })}\n`,
          )
          if (behavior.emitCommandResult !== false) {
            socket.write(
              `${JSON.stringify(commandResultEvent(commandId, "input.setTouchBounds", behavior.commandStatus ?? "applied", "input.commandResult"))}\n`,
            )
          }
        }
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(socketPath, resolve)
  })

  try {
    await run({ socketPath, requests })
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
}

function artifactAt(artifacts: ReadonlyMap<string, string>, path: string) {
  return decodeMoonlightRuntimeWatchArtifact(
    JSON.parse(artifacts.get(path) ?? "{}"),
  )
}

function helloResponse(
  id: string,
  commands: readonly string[] = [
    "runtime.setBitrate",
    "runtime.setFps",
    "runtime.setResolution",
  ],
) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      _tag: "protocol.hello",
      protocol: { name: "moonlight.local-control", major: 1, minor: 0 },
      session: { sessionId: "session-1", processId: 1234 },
      authority: "controller",
      capabilities: {
        events: ["runtime.commandResult"],
        commands,
        experimental: [],
      },
      limits: MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
    },
  }
}

function stateResponse(
  id: string,
  applied: {
    readonly bitrateKbps?: number
    readonly fps?: number
    readonly resolution?: { readonly width: number; readonly height: number }
  },
) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      _tag: "state.snapshot",
      seq: 1,
      session: { sessionId: "session-1", state: "streaming" },
      streamQuality: { connection: "good", bitrateKbps: 40000, fps: 60 },
      runtimeSettings: {
        appliedBitrateKbps: applied.bitrateKbps,
        appliedFps: applied.fps,
        appliedResolution: applied.resolution,
      },
      input: {
        route: "moonlight-embedded",
        status: "available",
        capabilities: [],
      },
    },
  }
}

function commandResultEvent(
  requestId: string | number,
  command: string,
  status: string,
  name = "runtime.commandResult",
) {
  return {
    jsonrpc: "2.0",
    method: "moonlight.event",
    params: {
      seq: 1,
      monotonicMs: 1,
      event: {
        name,
        requestId,
        command,
        status,
      },
    },
  }
}
