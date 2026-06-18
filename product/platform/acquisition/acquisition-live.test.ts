import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createFirstPartyAcquisitionPluginDefinitionsFromEnv } from "@product/plugins/acquisition"
import { Effect } from "effect"
import { Acquisition, makeLiveAcquisitionLayer } from "./acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "./plugin-loader"
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
    providerId: "@korri:fixture-provider",
    displayName: "Fixture Source",
    module: "product/platform/acquisition/plugins/fixture-provider",
    builtIn: true,
    enabledByDefault: true,
    legalRisk: "low",
    credentialRequired: false,
  },
  search: () =>
    Effect.succeed([
      {
        _tag: "ProviderClaim",
        providerId: "@korri:fixture-provider",
        id: "game-1",
        title: "Game One",
        url: "https://example.com/game-1",
        platform: "gb",
      },
    ]),
  details: () =>
    Effect.succeed({
      _tag: "ProviderClaimDetails",
      providerId: "@korri:fixture-provider",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
      description: "A fixture game.",
    }),
  validateProvider: ({ checkedAt }) =>
    Effect.succeed({
      _tag: "HealthyProvider",
      providerId: "@korri:fixture-provider",
      checkedAt,
    }),
  resolveDownload: () =>
    Effect.succeed({
      _tag: "FinalDownload",
      providerId: "@korri:fixture-provider",
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
      sourceData: { "fixture-provider.v1": { id: "game-1" } },
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
            providerId: "@korri:fixture-provider",
            id: "game-1",
          }),
          health: yield* acquisition.validateProviders({}),
          download: yield* acquisition.resolveDownload({
            providerId: "@korri:fixture-provider",
            candidateUrl: "https://example.com/game-1",
          }),
          artifact: yield* acquisition.acquireArtifact({
            providerId: "@korri:fixture-provider",
            id: "game-1",
          }),
        }
      })

      const result = await Effect.runPromise(Effect.provide(program, layer))

      expect(result.search.claims).toHaveLength(1)
      expect(result.search.claims[0]?.providerId).toBe(
        "@korri:fixture-provider",
      )
      expect(result.details.description).toBe("A fixture game.")
      expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
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

    expect(result.claims).toHaveLength(1)
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
            providerId: "@korri:fixture-provider",
            url: "https://example.com/unreachable.zip",
          })
        },
      },
    ])
    const layer = makeLiveAcquisitionLayer({ registry })
    const program = Effect.gen(function* () {
      const acquisition = yield* Acquisition
      return yield* acquisition.resolveDownload({
        providerId: "@korri:fixture-provider",
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
              _tag: "ProviderClaim" as const,
              providerId: "@korri:fixture-provider",
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
      reason: "defective-provider",
      providerId: "@korri:fixture-provider",
    })
  })

  it("returns malformed plugin output as a typed defective-provider error", async () => {
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
      reason: "defective-provider",
      providerId: "@korri:fixture-provider",
    })
  })

  it("keeps quarantined mjs providers out of active product plugin metadata", () => {
    const registry = createStaticAcquisitionPluginRegistry(
      createFirstPartyAcquisitionPluginDefinitionsFromEnv({
        KORRI_ENABLED_PLUGINS:
          "@korri:chip8archive,@korri:homebrewhub,@korri:itchio,@korri:portmaster,@korri:puzzlescript,@korri:retrobrews,@korri:tic80gallery,@korri:wasm4gallery",
      }),
    )
    const providerIds = [...registry.providerIds].sort()

    expect(providerIds).toEqual([
      "@korri:chip8archive",
      "@korri:homebrewhub",
      "@korri:itchio",
      "@korri:portmaster",
      "@korri:puzzlescript",
      "@korri:retrobrews",
      "@korri:tic80gallery",
      "@korri:wasm4gallery",
    ])
    expect(providerIds).not.toContain("coolrom")
    expect(providerIds).not.toContain("retrostic")
    expect(providerIds).not.toContain("romhustler")
    expect(providerIds).not.toContain("steamgriddb")
    expect(providerIds).not.toContain("wowroms")
  })
})
