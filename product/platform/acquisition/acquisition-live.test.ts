import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { Acquisition, makeLiveAcquisitionLayer } from "./acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "./plugin-loader"
import { approvedTypeScriptPluginDefinitions } from "./plugins/approved"
import type { AcquisitionPluginDefinition } from "./plugins/registry"

const fixturePlugin: AcquisitionPluginDefinition = {
  metadata: {
    sourceName: "fixture-source",
    displayName: "Fixture Source",
    module: "product/platform/acquisition/plugins/fixture-source",
    builtIn: true,
    enabledByDefault: true,
    legalRisk: "low",
    credentialRequired: false,
  },
  search: () =>
    Effect.succeed([
      {
        _tag: "SourceCandidate",
        sourceName: "fixture-source",
        id: "game-1",
        title: "Game One",
        url: "https://example.com/game-1",
        platform: "gb",
      },
    ]),
  details: () =>
    Effect.succeed({
      _tag: "SourceDetails",
      sourceName: "fixture-source",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
      description: "A fixture game.",
    }),
  validateSource: ({ checkedAt }) =>
    Effect.succeed({
      _tag: "HealthySource",
      sourceName: "fixture-source",
      checkedAt,
    }),
  resolveDownload: () =>
    Effect.succeed({
      _tag: "FinalDownload",
      sourceName: "fixture-source",
      url: "https://example.com/game-1.zip",
      filename: "game-1.zip",
    }),
}

describe("live acquisition service", () => {
  it("runs search, details, validation, and download resolution through registered TypeScript plugins", async () => {
    const registry = createStaticAcquisitionPluginRegistry([fixturePlugin])
    const layer = makeLiveAcquisitionLayer({ registry })

    const program = Effect.gen(function* () {
      const acquisition = yield* Acquisition
      return {
        search: yield* acquisition.search({ query: "game" }),
        details: yield* acquisition.details({
          sourceName: "fixture-source",
          id: "game-1",
        }),
        health: yield* acquisition.validateSources({}),
        download: yield* acquisition.resolveDownload({
          sourceName: "fixture-source",
          candidateUrl: "https://example.com/game-1",
        }),
      }
    })

    const result = await Effect.runPromise(Effect.provide(program, layer))

    expect(result.search.candidates).toHaveLength(1)
    expect(result.search.candidates[0]?.sourceName).toBe("fixture-source")
    expect(result.details.description).toBe("A fixture game.")
    expect(result.health.sources[0]?._tag).toBe("HealthySource")
    expect(result.download._tag).toBe("FinalDownload")
  })

  it("rejects unsafe download URLs before calling plugin code", async () => {
    let called = false
    const registry = createStaticAcquisitionPluginRegistry([
      {
        ...fixturePlugin,
        resolveDownload: () => {
          called = true
          return Effect.succeed({
            _tag: "FinalDownload",
            sourceName: "fixture-source",
            url: "https://example.com/unreachable.zip",
          })
        },
      },
    ])
    const layer = makeLiveAcquisitionLayer({ registry })
    const program = Effect.gen(function* () {
      const acquisition = yield* Acquisition
      return yield* acquisition.resolveDownload({
        sourceName: "fixture-source",
        candidateUrl: "http://127.0.0.1/private.zip",
      })
    })

    const error = await Effect.runPromise(
      Effect.provide(program, layer).pipe(
        Effect.match({
          onFailure: error => error,
          onSuccess: () => undefined,
        }),
      ),
    )

    expect(error).toMatchObject({ reason: "unsafe-url" })
    expect(called).toBe(false)
  })

  it("returns malformed plugin output as a typed defective-source error", async () => {
    const registry = createStaticAcquisitionPluginRegistry([
      {
        ...fixturePlugin,
        search: () => Effect.succeed([{ bad: "shape" }] as never),
      },
    ])
    const layer = makeLiveAcquisitionLayer({ registry })
    const program = Effect.gen(function* () {
      const acquisition = yield* Acquisition
      return yield* acquisition.search({ query: "game" })
    })

    const error = await Effect.runPromise(
      Effect.provide(program, layer).pipe(
        Effect.match({
          onFailure: error => error,
          onSuccess: () => undefined,
        }),
      ),
    )

    expect(error).toMatchObject({
      reason: "defective-source",
      sourceName: "fixture-source",
    })
  })

  it("keeps quarantined mjs providers out of active approved TypeScript metadata", () => {
    const registry = createStaticAcquisitionPluginRegistry(
      approvedTypeScriptPluginDefinitions,
    )
    const sourceNames = [...registry.sourceNames].sort()

    expect(sourceNames).toEqual([
      "chip8archive",
      "homebrewhub",
      "itchio",
      "pico8bbs",
      "portmaster",
      "puzzlescript",
      "retrobrews",
      "tic80gallery",
      "wasm4gallery",
    ])
    expect(sourceNames).not.toContain("coolrom")
    expect(sourceNames).not.toContain("retrostic")
    expect(sourceNames).not.toContain("romhustler")
    expect(sourceNames).not.toContain("steamgriddb")
    expect(sourceNames).not.toContain("wowroms")
  })
})
