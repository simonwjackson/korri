import { describe, expect, it } from "bun:test"
import {
  type AcquisitionService,
  makeInMemoryAcquisitionLayer,
} from "@platform/acquisition/acquisition-service"
import { DataError } from "@platform/api/rpc/errors"
import { AcquisitionError } from "@platform/protocol/acquisition/errors"
import { Cause, Effect, Exit } from "effect"
import { appRpcGroup } from "../app-rpc-group"
import { serverRpcGroup } from "../server/rpc-group"
import { toAcquisitionRpcError } from "./acquisition-rpc-errors"
import { handleAcquisitionDetails } from "./details.rpc-handler"
import { handleAcquisitionPlugins } from "./plugins.rpc-handler"
import { handleAcquisitionResolveDownload } from "./resolve-download.rpc-handler"
import { handleAcquisitionSearch } from "./search.rpc-handler"
import { handleAcquisitionValidateSources } from "./validate-sources.rpc-handler"

const acquisitionTags = [
  "app.acquisition.details",
  "app.acquisition.plugins",
  "app.acquisition.resolve-download",
  "app.acquisition.search",
  "app.acquisition.validate-sources",
]

const acquisitionService: AcquisitionService = {
  search: () =>
    Effect.succeed({
      candidates: [
        {
          _tag: "SourceCandidate",
          sourceName: "fixture-source",
          id: "game-1",
          title: "Game One",
          url: "https://example.com/game-1",
        },
      ],
    }),
  details: () =>
    Effect.succeed({
      _tag: "SourceDetails",
      sourceName: "fixture-source",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
      description: "A fixture game.",
    }),
  detailsByUrl: () =>
    Effect.succeed({
      _tag: "SourceDetails",
      sourceName: "fixture-source",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
      description: "A fixture game.",
    }),
  plugins: () =>
    Effect.succeed({
      plugins: [
        {
          sourceName: "fixture-source",
          displayName: "Fixture Source",
          module: "product/platform/acquisition/plugins/fixture-source",
          builtIn: true,
          enabledByDefault: true,
          legalRisk: "low",
          credentialRequired: false,
        },
      ],
    }),
  validateSources: () =>
    Effect.succeed({
      sources: [
        {
          _tag: "HealthySource",
          sourceName: "fixture-source",
          checkedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    }),
  resolveDownload: () =>
    Effect.succeed({
      _tag: "NonFinalDownload",
      sourceName: "fixture-source",
      reason: "interstitial",
      url: "https://example.com/download",
    }),
  acquireArtifact: () =>
    Effect.succeed({
      id: `sha256:${"a".repeat(64)}`,
      kind: "content",
      system: "smbr",
      format: { id: "smbr-level" },
      file: { name: "level.lvl", extension: "lvl" },
      stagedPath: "/tmp/staged/level.lvl",
      digests: { sha256: "a".repeat(64) },
    }),
}

const acquisitionLayer = makeInMemoryAcquisitionLayer(acquisitionService)

describe("acquisition RPC handlers", () => {
  it("calls all five acquisition operations through the Acquisition service", async () => {
    const program = Effect.gen(function* () {
      return {
        search: yield* handleAcquisitionSearch({ query: "game" }),
        details: yield* handleAcquisitionDetails({
          sourceName: "fixture-source",
          id: "game-1",
        }),
        plugins: yield* handleAcquisitionPlugins({}),
        health: yield* handleAcquisitionValidateSources({}),
        download: yield* handleAcquisitionResolveDownload({
          sourceName: "fixture-source",
          candidateUrl: "https://example.com/game-1",
        }),
      }
    })

    const result = await Effect.runPromise(
      Effect.provide(program, acquisitionLayer),
    )

    expect(result.search.candidates[0]?.sourceName).toBe("fixture-source")
    expect(result.details.description).toBe("A fixture game.")
    expect(result.plugins.plugins[0]?.sourceName).toBe("fixture-source")
    expect(result.health.sources[0]?._tag).toBe("HealthySource")
    expect(result.download).toMatchObject({
      _tag: "NonFinalDownload",
      reason: "interstitial",
    })
  })

  it("maps acquisition errors to safe RPC errors through handler wiring", async () => {
    const failingLayer = makeInMemoryAcquisitionLayer({
      ...acquisitionService,
      search: () =>
        Effect.fail(
          new AcquisitionError({
            reason: "defective-source",
            message: "token=secret\nfull stack should not leak",
            sourceName: "fixture-source",
          }),
        ),
    })

    const exit = await Effect.runPromiseExit(
      Effect.provide(handleAcquisitionSearch({ query: "game" }), failingLayer),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("expected failure")
    const error = Cause.squash(exit.cause)
    expect(error).toBeInstanceOf(DataError)
    expect(error).toMatchObject({
      _tag: "DataError",
      reason: "Unavailable",
      message: "token=[REDACTED]",
    })
  })

  it("maps acquisition errors to safe RPC errors", () => {
    const error = toAcquisitionRpcError(
      new AcquisitionError({
        reason: "defective-source",
        message: "token=secret\nfull stack should not leak",
        sourceName: "fixture-source",
      }),
    )

    expect(error).toMatchObject({
      _tag: "DataError",
      reason: "Unavailable",
      message: "token=[REDACTED]",
    })

    const urlError = toAcquisitionRpcError(
      new AcquisitionError({
        reason: "infrastructure",
        message: "https://user:secret@dl.example.com/game.zip Bearer abc123",
      }),
    )

    expect(urlError).toMatchObject({
      _tag: "DataError",
      reason: "ReadFailed",
      message:
        "https://user:[REDACTED]@dl.example.com/game.zip Bearer [REDACTED]",
    })
  })

  it("registers exactly the migrated acquisition RPC tags on the headless server group only", () => {
    const serverTags = Array.from(serverRpcGroup.requests.keys()).sort()
    const appTags = Array.from(appRpcGroup.requests.keys()).sort()
    const serverAcquisitionTags = serverTags.filter(tag =>
      tag.startsWith("app.acquisition."),
    )
    const appAcquisitionTags = appTags.filter(tag =>
      tag.startsWith("app.acquisition."),
    )

    expect(serverAcquisitionTags).toEqual([...acquisitionTags].sort())
    expect(appAcquisitionTags).toEqual([])
  })
})
