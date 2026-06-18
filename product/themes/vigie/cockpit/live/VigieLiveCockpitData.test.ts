import { describe, expect, it } from "bun:test"
import { type ProviderId, pluginRecordId } from "@platform/plugin"
import { vigieCockpitFixture } from "../../fixtures/cockpit-fixtures"
import {
  createVigieLiveFixture,
  createVigieLoadingFixture,
  type VigieLiveSnapshot,
} from "./VigieLiveCockpitData"

describe("Vigie live cockpit data", () => {
  it("projects available RPC data into the existing cockpit contract", () => {
    const fixture = createVigieLiveFixture(vigieCockpitFixture, liveSnapshot)

    expect(fixture.device).toMatchObject({
      id: "bandai",
      name: "Bandai",
      online: true,
    })
    expect(fixture.scenarios).toHaveLength(1)
    expect(fixture.scenarios[0]?.session).toMatchObject({
      health: "nominal",
      headline: "Running · Steam 584400",
      gameId: "@korri:steam/584400",
      requestId: "launch-1",
    })
    expect(fixture.scenarios[0]?.session.stream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "moonlight-bitrate",
          value: "12.0 Mbps",
        }),
        expect.objectContaining({
          id: `${presentationProvider}/filter`,
          value: "soft",
        }),
        expect.objectContaining({
          id: "@korri:steam/tracked-processes",
          label: "Steam processes",
          value: "1",
        }),
        expect.objectContaining({ id: "battery", value: "82%" }),
      ]),
    )
    expect(fixture.metrics.map(metric => metric.id)).toEqual(
      expect.arrayContaining([
        "moonlight-bitrate",
        `${presentationProvider}/fps`,
        "battery",
      ]),
    )
    expect(fixture.library).toContainEqual(
      expect.objectContaining({
        id: "steam:584400",
        title: "Sonic Mania",
        source: "self",
        system: "steam",
      }),
    )
    expect(fixture.subsystems.map(subsystem => subsystem.id)).toEqual(
      expect.arrayContaining([
        "server",
        "sessiond",
        "@korri:steam/diagnostics",
        "moonlight",
      ]),
    )
    expect(fixture.subsystems).toContainEqual(
      expect.objectContaining({
        id: "@korri:steam/diagnostics",
        label: "Steam diagnostics",
      }),
    )
    expect(fixture.log).toContainEqual(
      expect.objectContaining({
        source: "content_log",
        message: expect.stringContaining("App Running"),
      }),
    )
  })

  it("defaults the active device to the discovered local peer and dedupes the fleet", () => {
    const fixture = createVigieLiveFixture(
      vigieCockpitFixture,
      multiPeerSnapshot,
    )

    // active device is the isLocal self peer, not the fixture device
    expect(fixture.device).toMatchObject({
      id: "zao",
      name: "zao (self)",
      role: "Local catalog",
      online: true,
    })

    // the duplicate zao host (self + bonjour stream peer) collapses to one entry
    const ids = fixture.fleet.map(member => member.id)
    expect(ids).toEqual(["zao", "aka", "bandai"])
    expect(ids.filter(id => id === "zao")).toHaveLength(1)

    // the surviving zao entry is the local/self one
    expect(fixture.fleet.find(member => member.id === "zao")).toMatchObject({
      name: "zao (self)",
      online: true,
    })
    // offline discovered peers are present but not marked online
    expect(fixture.fleet.find(member => member.id === "aka")).toMatchObject({
      online: false,
    })
  })

  it("keeps a live-shaped loading fixture before the first poll returns", () => {
    const fixture = createVigieLoadingFixture(vigieCockpitFixture)

    expect(fixture.scenarios[0]?.id).toBe("live")
    expect(fixture.scenarios[0]?.session.headline).toBe(
      "Connecting to Korri telemetry",
    )
    expect(fixture.log[0]?.source).toBe("vigie")
  })

  it("uses a neutral, non-fixture device while connecting", () => {
    const fixture = createVigieLoadingFixture(vigieCockpitFixture)
    expect(fixture.device.id).toBe("local")
    expect(fixture.device.id).not.toBe(vigieCockpitFixture.device.id)
    expect(fixture.fleet).toHaveLength(1)
  })

  it("treats missing provider diagnostics as optional plugin telemetry", () => {
    const fixture = createVigieLiveFixture(vigieCockpitFixture, {
      observedAt: "2026-06-14T19:40:00.000Z",
      server: {
        serverId: "bandai",
        displayName: "Bandai",
        capabilities: ["source"],
        status: "available",
        sessiond: { mode: "home" },
      },
      source: { status: "available" },
      providerDiagnostics: [
        {
          providerId: "@korri:steam",
          error:
            "Plugin provider @korri:steam is not enabled or does not exist",
        },
      ],
    })

    expect(fixture.scenarios[0]?.session).toMatchObject({
      health: "idle",
      headline: "No active session",
    })
    expect(fixture.subsystems.map(subsystem => subsystem.id)).not.toContain(
      "@korri:steam/diagnostics",
    )
    expect(fixture.log).not.toContainEqual(
      expect.objectContaining({ source: "@korri:steam" }),
    )
  })
})

const multiPeerSnapshot = {
  observedAt: "2026-06-15T03:35:56.050Z",
  catalog: {
    entries: [],
    peers: [
      {
        hostId: "zao",
        displayName: "zao (self)",
        controlUrl: "http://127.0.0.1:3333",
        isLocal: true,
        caps: ["source"],
        status: "ready",
        entryCount: 2,
        updatedAt: "2026-06-15T03:35:56.050Z",
      },
      {
        hostId: "aka",
        displayName: "Korri Stream on aka",
        controlUrl: "http://192.168.1.117:3001",
        isLocal: false,
        caps: ["source", "stream"],
        status: "failed",
        entryCount: 0,
        updatedAt: "2026-06-15T03:35:53.382Z",
      },
      {
        hostId: "zao",
        displayName: "Korri Stream on zao",
        controlUrl: "http://192.168.1.243:39217",
        isLocal: false,
        caps: ["source", "stream"],
        status: "failed",
        entryCount: 0,
        updatedAt: "2026-06-15T03:35:54.389Z",
      },
      {
        hostId: "bandai",
        displayName: "Korri Stream on bandai",
        controlUrl: "http://192.168.1.237:3001",
        isLocal: false,
        caps: ["source", "stream"],
        status: "failed",
        entryCount: 0,
        updatedAt: "2026-06-15T03:35:53.383Z",
      },
    ],
    generation: 2821,
    updatedAt: "2026-06-15T03:35:56.050Z",
    health: {
      coordinatorReachable: true,
      self: "ready",
      loadingPeers: 0,
      readyPeers: 0,
      failedPeers: 3,
      generation: 2821,
    },
  },
} satisfies VigieLiveSnapshot

const presentationProvider = "@example:presentation" as ProviderId

const liveSnapshot = {
  observedAt: "2026-06-14T19:40:00.000Z",
  server: {
    serverId: "bandai",
    displayName: "Bandai",
    protocolVersion: "1",
    capabilities: ["source", "steam"],
    status: "available",
    streamControl: "enabled",
    catalog: "available",
    sessiond: {
      mode: "game",
      active: { launchId: "launch-1", mode: "game", phase: "anchored" },
      restoreAttempts: 0,
    },
  },
  source: {
    status: "available",
    streamControl: "enabled",
    catalog: "available",
    runnerMode: "running",
  },
  catalog: {
    entries: [
      {
        id: "steam:584400",
        itemId: "steam:584400",
        title: "Sonic Mania",
        collections: ["Platformers"],
        releases: [{ id: "steam", system: "steam", launchable: true }],
        launchable: true,
        system: "steam",
        source: {
          hostId: "bandai",
          controlUrl: "http://bandai:3001",
          isLocal: true,
        },
      },
    ],
    peers: [
      {
        hostId: "bandai",
        displayName: "Bandai",
        controlUrl: "http://bandai:3001",
        isLocal: true,
        caps: ["source"],
        status: "ready",
        entryCount: 12,
        updatedAt: "2026-06-14T19:39:59.000Z",
      },
    ],
    generation: 4,
    updatedAt: "2026-06-14T19:39:59.000Z",
    health: {
      coordinatorReachable: true,
      self: "ready",
      loadingPeers: 0,
      readyPeers: 1,
      failedPeers: 0,
      generation: 4,
    },
  },
  providerDiagnostics: [
    {
      providerId: "@korri:steam",
      diagnostics: {
        observer: {
          state: "running",
          logDir: "/var/lib/korri/steam/logs",
          watchedFiles: ["content_log.txt", "gameprocess_log.txt"],
          activeFiles: ["content_log.txt"],
          missingFiles: [],
          lastLineAt: "2026-06-14T19:39:58.000Z",
        },
        active: {
          appId: "584400",
          status: "Running",
          confidence: "confirmed",
          ownership: "korri-correlated",
          firstObservedAt: "2026-06-14T19:39:02.000Z",
          lastObservedAt: "2026-06-14T19:39:58.000Z",
          lastProgressAt: "2026-06-14T19:39:58.000Z",
          steam: {
            appState: "Fully Installed,App Running,",
            running: true,
            taskHistory: ["CreatingProcess"],
            trackedPids: [1234],
            removedPids: [],
          },
          evidence: [],
        },
        recentEvidence: [
          {
            source: "content_log",
            logFile: "content_log.txt",
            steamTimestamp: "2026-06-14 19:39:02",
            observedAt: "2026-06-14T19:39:02.000Z",
            sequence: 1,
            confidence: "confirmed",
            parser: "content_log",
            excerpt:
              "AppID 584400 state changed : Fully Installed,App Running,",
          },
        ],
      },
    },
  ],
  streamConfig: {
    moonlight: { enabled: true },
    brightness: { enabled: true },
    battery: { enabled: true },
    plugins: { [presentationProvider]: { enabled: true } },
    artifactDir: "/tmp/korri",
  },
  streamControls: {
    controls: [
      {
        id: pluginRecordId(presentationProvider, "filter"),
        label: "Filter",
        subsystem: "presentation",
        provider: presentationProvider,
        access: "read-write",
        status: "supported",
        unavailableReason: null,
        action: pluginRecordId(presentationProvider, "filter.set"),
        readback: pluginRecordId(presentationProvider, "filter"),
        value: { kind: "options", values: ["soft", "crisp"] },
      },
    ],
  },
  streamState: {
    moonlight: {
      status: "ok",
      readback: {
        bitrateKbps: 12_000,
        fps: 60,
        resolution: { width: 1920, height: 1080 },
      },
    },
    plugins: {
      [presentationProvider]: {
        status: "ok",
        readback: {
          fps: 60,
          resolution: { width: 1920, height: 1080 },
          sharpness: 2,
          filter: "soft",
        },
      },
    },
    brightness: {
      status: "ok",
      readback: {
        devices: [],
        percent: 71,
      },
    },
    battery: {
      status: "ok",
      readback: {
        percent: 82,
        status: "Discharging",
        supplies: [],
      },
    },
  },
} satisfies VigieLiveSnapshot
