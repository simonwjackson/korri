import { describe, expect, it } from "bun:test"
import {
  MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA,
  MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION,
  decodeMoonlightRuntimeWatchArtifact,
} from "./moonlight-runtime-watch-artifact"

describe("Moonlight runtime watch artifact", () => {
  it("decodes a successful bitrate watch artifact with additive fields", () => {
    const artifact = decodeMoonlightRuntimeWatchArtifact({
      schema: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA,
      version: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION,
      futureField: true,
      run: {
        id: "run-1",
        startedAt: "2026-05-26T00:00:00.000Z",
        completedAt: "2026-05-26T00:00:01.000Z",
        durationMs: 1000,
      },
      socket: { path: "/tmp/moonlight.sock", attached: true },
      scenario: { _tag: "set-bitrate", bitrateKbps: 45000 },
      hello: protocolHello(),
      preSnapshot: stateSnapshot({ seq: 4 }),
      subscription: { _tag: "events.subscribed", seq: 4 },
      commandResponse: {
        _tag: "command.accepted",
        requestId: "cmd-1",
        command: "runtime.setBitrate",
      },
      observedEvents: [
        {
          seq: 5,
          event: {
            name: "runtime.commandResult",
            requestId: "cmd-1",
            command: "runtime.setBitrate",
            status: "applied",
          },
        },
      ],
      sequenceGaps: [],
      proof: {
        controlPlane: "observed",
        hostApply: "reported",
        deviceRender: "not-collected",
      },
      terminal: { result: "applied", exitCode: 0 },
    })

    expect(artifact.scenario._tag).toBe("set-bitrate")
    expect(artifact.terminal.result).toBe("applied")
    expect(artifact.proof.deviceRender).toBe("not-collected")
  })

  it("decodes a probe artifact without a command response", () => {
    const artifact = decodeMoonlightRuntimeWatchArtifact({
      schema: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA,
      version: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION,
      run: { id: "run-2", startedAt: "2026-05-26T00:00:00.000Z" },
      socket: { path: "/tmp/moonlight.sock", attached: true },
      scenario: { _tag: "probe" },
      hello: protocolHello(),
      preSnapshot: stateSnapshot({ seq: 1 }),
      subscription: { _tag: "events.subscribed", seq: 1 },
      observedEvents: [],
      sequenceGaps: [],
      proof: {
        controlPlane: "observed",
        hostApply: "not-collected",
        deviceRender: "not-collected",
      },
      terminal: { result: "probe-succeeded", exitCode: 0 },
    })

    expect(artifact.scenario._tag).toBe("probe")
    expect(artifact.commandResponse).toBeUndefined()
  })

  it("decodes an attach failure without protocol data", () => {
    const artifact = decodeMoonlightRuntimeWatchArtifact({
      schema: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA,
      version: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION,
      run: { id: "run-3", startedAt: "2026-05-26T00:00:00.000Z" },
      socket: { path: "/tmp/missing.sock", attached: false },
      scenario: { _tag: "probe" },
      observedEvents: [],
      sequenceGaps: [],
      proof: {
        controlPlane: "not-collected",
        hostApply: "not-collected",
        deviceRender: "not-collected",
      },
      terminal: { result: "attach-failed", exitCode: 20, reason: "ENOENT" },
      error: { category: "attach", message: "connect ENOENT" },
    })

    expect(artifact.socket.attached).toBe(false)
    expect(artifact.hello).toBeUndefined()
    expect(artifact.terminal.result).toBe("attach-failed")
  })

  it("rejects malformed terminal results, scenarios, and proof states", () => {
    expect(() =>
      decodeMoonlightRuntimeWatchArtifact({
        schema: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA,
        version: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION,
        run: { id: "bad", startedAt: "2026-05-26T00:00:00.000Z" },
        socket: { path: "/tmp/moonlight.sock", attached: true },
        scenario: { _tag: "set-resolution", width: 1280, height: 720 },
        observedEvents: [],
        sequenceGaps: [],
        proof: {
          controlPlane: "observed",
          hostApply: "reported",
          deviceRender: "not-collected",
        },
        terminal: { result: "applied", exitCode: 0 },
      }),
    ).toThrow()

    expect(() =>
      decodeMoonlightRuntimeWatchArtifact({
        schema: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_SCHEMA,
        version: MOONLIGHT_RUNTIME_WATCH_ARTIFACT_VERSION,
        run: { id: "bad", startedAt: "2026-05-26T00:00:00.000Z" },
        socket: { path: "/tmp/moonlight.sock", attached: true },
        scenario: { _tag: "probe" },
        observedEvents: [],
        sequenceGaps: [],
        proof: {
          controlPlane: "observed",
          hostApply: "reported",
          deviceRender: "device-rendered",
        },
        terminal: { result: "success", exitCode: 0 },
      }),
    ).toThrow()
  })
})

function protocolHello() {
  return {
    _tag: "protocol.hello",
    protocol: { name: "moonlight.local-control", major: 1, minor: 0 },
    session: { sessionId: "session-1", processId: 42 },
    authority: "controller",
    capabilities: {
      events: ["runtime.commandResult"],
      commands: ["runtime.setBitrate", "runtime.setFps"],
      experimental: [],
    },
    limits: {
      maxFrameBytes: 65536,
      maxClients: 4,
      eventHistory: 256,
      maxInFlightMutationsPerFamily: 1,
      minCommandIntervalMs: 250,
      bitrateKbps: { min: 500, max: 150000 },
      fps: { min: 15, max: 240 },
      resolution: {
        width: { min: 320, max: 7680 },
        height: { min: 240, max: 4320 },
      },
    },
  }
}

function stateSnapshot({ seq }: { readonly seq: number }) {
  return {
    _tag: "state.snapshot",
    seq,
    session: { sessionId: "session-1", state: "streaming", appName: "Game" },
    streamQuality: { connection: "good", bitrateKbps: 40000, fps: 60 },
    runtimeSettings: { appliedBitrateKbps: 40000, appliedFps: 60 },
    input: { route: "desktop", status: "available", capabilities: [] },
  }
}
