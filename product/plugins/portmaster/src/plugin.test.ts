import { describe, expect, it } from "bun:test"
import {
  Acquisition,
  makeLiveAcquisitionLayer,
} from "@platform/acquisition/acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "@platform/acquisition/plugin-loader"
import { acquisitionPluginDefinitionsFromPluginRegistry } from "@platform/acquisition/product-plugin-adapter"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { Effect } from "effect"
import {
  createPortMasterPlugin,
  KORRI_PORTMASTER_PLUGIN_ID,
  portmasterPlugin,
} from ".."

const catalogFixture = {
  ports: {
    "2048.zip": {
      name: "2048.zip",
      attr: {
        title: "2048",
        desc: "The 2048 puzzle game.",
        inst: "Ready to run.",
        genres: ["puzzle"],
        porter: ["Christian_Haitian"],
        rtr: true,
        exp: false,
        runtime: [],
        reqs: [],
        arch: ["aarch64", "armhf"],
        availability: "full",
      },
      source: {
        md5: "96a5de9fbc08bb5ae8498a9f4fd43b11",
        release_id: "2026-04-12_1606",
        size: 12345,
        url: "https://github.com/PortsMaster/PortMaster-New/releases/download/2026-04-12_1606/2048.zip",
      },
    },
    "absolutereflex.zip": {
      name: "absolutereflex.zip",
      attr: {
        title: "Absolute Reflex",
        desc: "A non-ready-to-run PortMaster entry.",
        inst: "Copy commercial game data into the port folder.",
        genres: ["action"],
        porter: ["Porter"],
        rtr: false,
        exp: false,
        runtime: [],
        reqs: [],
        arch: ["aarch64"],
        availability: "paid",
      },
      source: {
        url: "https://github.com/PortsMaster/PortMaster-New/releases/download/2025-01-01_0000/absolutereflex.zip",
      },
    },
  },
}

describe("PortMaster plugin", () => {
  it("declares a stable executable package resource and acquisition handlers", () => {
    expect(portmasterPlugin.id).toBe(KORRI_PORTMASTER_PLUGIN_ID)
    expect(
      portmasterPlugin.contributes.config.modules?.portmaster,
    ).toMatchObject({
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#portmaster",
        binary: "portmaster",
      },
    })
    expect(portmasterPlugin.handlers.map(handler => handler.operation)).toEqual(
      [
        "claims.search",
        "claims.details",
        "claims.parse-url",
        "provider.validate",
        "artifact.resolve-download",
        "diagnostics.collect",
      ],
    )
  })

  it("exposes PortMaster as a fulfillable executable when enabled", () => {
    const registry = createPluginRegistry([portmasterPlugin], {
      enabledPluginIds: [KORRI_PORTMASTER_PLUGIN_ID],
    })

    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["portmaster"])
  })

  it("runs catalog search, details, health, parsing, and download through the acquisition boundary", async () => {
    const productRegistry = createPluginRegistry(
      [
        createPortMasterPlugin({
          catalogPath: "/catalog/ports.json",
          readFileText: async () => JSON.stringify(catalogFixture),
        }),
      ],
      { enabledPluginIds: [KORRI_PORTMASTER_PLUGIN_ID] },
    )
    const acquisitionRegistry = createStaticAcquisitionPluginRegistry(
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry),
    )
    const layer = makeLiveAcquisitionLayer({ registry: acquisitionRegistry })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const acquisition = yield* Acquisition
        return {
          search: yield* acquisition.search({ query: "2048" }),
          details: yield* acquisition.details({
            providerId: KORRI_PORTMASTER_PLUGIN_ID,
            id: "2048.zip",
          }),
          health: yield* acquisition.validateProviders({
            providerIds: [KORRI_PORTMASTER_PLUGIN_ID],
          }),
          download: yield* acquisition.resolveDownload({
            providerId: KORRI_PORTMASTER_PLUGIN_ID,
            candidateUrl: "https://portmaster.games/detail.html?name=2048",
          }),
          directDownload: yield* acquisition.resolveDownload({
            providerId: KORRI_PORTMASTER_PLUGIN_ID,
            candidateUrl:
              "https://github.com/PortsMaster/PortMaster-New/releases/download/2026-04-12_1606/2048.zip",
          }),
          notReady: yield* acquisition.resolveDownload({
            providerId: KORRI_PORTMASTER_PLUGIN_ID,
            candidateUrl:
              "https://portmaster.games/detail.html?name=absolutereflex",
          }),
        }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.search.claims).toHaveLength(1)
    expect(result.search.claims[0]).toMatchObject({
      providerId: KORRI_PORTMASTER_PLUGIN_ID,
      id: "2048.zip",
      title: "2048",
      platform: "linux-port",
      playable: {
        id: "2048",
        releases: [
          {
            id: "linux-port",
            system: "linux-port",
            display: {
              readyToRun: true,
              arch: ["aarch64", "armhf"],
            },
          },
        ],
      },
    })
    expect(result.details.description).toContain("The 2048 puzzle game")
    expect(result.details.facets?.tags).toContain("ready-to-run")
    expect(result.details.facets?.tags).toContain("arch:aarch64")
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
    expect(result.download).toMatchObject({
      _tag: "FinalDownload",
      providerId: KORRI_PORTMASTER_PLUGIN_ID,
      url: "https://github.com/PortsMaster/PortMaster-New/releases/download/2026-04-12_1606/2048.zip",
      filename: "2048.zip",
      contentType: "application/zip",
    })
    expect(result.directDownload).toMatchObject({
      _tag: "FinalDownload",
      filename: "2048.zip",
    })
    expect(result.notReady).toMatchObject({
      _tag: "FailedDownload",
      reason: "not-found",
      message: "PortMaster entry is not ready-to-run",
    })
  })
})
