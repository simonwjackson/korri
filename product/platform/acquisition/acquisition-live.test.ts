import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { Acquisition, makeLiveAcquisitionLayer } from "./acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "./plugin-loader"
import { approvedTypeScriptPluginDefinitions } from "./plugins/approved"
import type { AcquisitionPluginDefinition } from "./plugins/registry"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-live-acquisition-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

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
  acquireArtifact: () =>
    Effect.succeed({
      kind: "content",
      system: "smbr",
      format: { id: "smbr-level" },
      file: { name: "level.lvl", extension: "lvl" },
      bytesBase64: Buffer.from('{"Info":{},"Levels":[]}').toString("base64"),
      sourceData: { "fixture-source.v1": { id: "game-1" } },
    }),
}

describe("live acquisition service", () => {
  it("runs search, details, validation, download resolution, and artifact acquisition through registered TypeScript plugins", async () => {
    await withTempRoot(async stagingRoot => {
      const registry = createStaticAcquisitionPluginRegistry([fixturePlugin])
      const layer = makeLiveAcquisitionLayer({
        registry,
        artifactStagingRoot: stagingRoot,
      })

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
          artifact: yield* acquisition.acquireArtifact({
            sourceName: "fixture-source",
            id: "game-1",
          }),
        }
      })

      const result = await Effect.runPromise(Effect.provide(program, layer))

      expect(result.search.candidates).toHaveLength(1)
      expect(result.search.candidates[0]?.sourceName).toBe("fixture-source")
      expect(result.details.description).toBe("A fixture game.")
      expect(result.health.sources[0]?._tag).toBe("HealthySource")
      expect(result.download._tag).toBe("FinalDownload")
      expect(result.artifact.format.id).toBe("smbr-level")
      expect(await readFile(result.artifact.stagedPath, "utf8")).toBe(
        '{"Info":{},"Levels":[]}',
      )
    })
  })

  it("does not require artifact staging root configuration for non-artifact operations", async () => {
    const registry = createStaticAcquisitionPluginRegistry([fixturePlugin])
    const layer = makeLiveAcquisitionLayer({ registry, env: {} })
    const program = Effect.gen(function* () {
      const acquisition = yield* Acquisition
      return yield* acquisition.search({ query: "game" })
    })

    const result = await Effect.runPromise(Effect.provide(program, layer))

    expect(result.candidates).toHaveLength(1)
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

  it("rejects plugin search output above the 200-candidate cap", async () => {
    const registry = createStaticAcquisitionPluginRegistry([
      {
        ...fixturePlugin,
        search: () =>
          Effect.succeed(
            Array.from({ length: 201 }, (_, index) => ({
              _tag: "SourceCandidate" as const,
              sourceName: "fixture-source",
              id: `game-${index}`,
              title: `Game ${index}`,
              url: `https://example.com/game-${index}`,
            })),
          ),
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
