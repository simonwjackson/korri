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
import { handleAcquisitionValidateProviders } from "./validate-providers.rpc-handler"

const acquisitionTags = [
  "app.acquisition.acquire",
  "app.acquisition.acquire-status",
  "app.acquisition.details",
  "app.acquisition.providers",
  "app.acquisition.resolve-download",
  "app.acquisition.search",
  "app.acquisition.validate-providers",
]

const acquisitionService: AcquisitionService = {
  search: () =>
    Effect.succeed({
      claims: [
        {
          _tag: "ProviderClaim",
          providerId: "@korri:fixture-source",
          id: "game-1",
          title: "Game One",
          url: "https://example.com/game-1",
        },
      ],
    }),
  details: () =>
    Effect.succeed({
      _tag: "ProviderClaimDetails",
      providerId: "@korri:fixture-source",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
      description: "A fixture game.",
    }),
  detailsByUrl: () =>
    Effect.succeed({
      _tag: "ProviderClaimDetails",
      providerId: "@korri:fixture-source",
      id: "game-1",
      title: "Game One",
      url: "https://example.com/game-1",
      description: "A fixture game.",
    }),
  providers: () =>
    Effect.succeed({
      providers: [
        {
          providerId: "@korri:fixture-source",
          displayName: "Fixture Provider",
          module: "product/platform/acquisition/plugins/fixture-source",
          builtIn: true,
          enabledByDefault: true,
          legalRisk: "low",
          credentialRequired: false,
        },
      ],
    }),
  validateProviders: () =>
    Effect.succeed({
      providers: [
        {
          _tag: "HealthyProvider",
          providerId: "@korri:fixture-source",
          checkedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    }),
  resolveDownload: () =>
    Effect.succeed({
      _tag: "NonFinalDownload",
      providerId: "@korri:fixture-source",
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
          providerId: "@korri:fixture-source",
          id: "game-1",
        }),
        providers: yield* handleAcquisitionPlugins({}),
        health: yield* handleAcquisitionValidateProviders({}),
        download: yield* handleAcquisitionResolveDownload({
          providerId: "@korri:fixture-source",
          candidateUrl: "https://example.com/game-1",
        }),
      }
    })

    const result = await Effect.runPromise(
      Effect.provide(program, acquisitionLayer),
    )

    expect(result.search.claims[0]?.providerId).toBe("@korri:fixture-source")
    expect(result.details.description).toBe("A fixture game.")
    expect(result.providers.providers[0]?.providerId).toBe(
      "@korri:fixture-source",
    )
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
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
            reason: "defective-provider",
            message: "token=secret\nfull stack should not leak",
            providerId: "@korri:fixture-source",
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
        reason: "defective-provider",
        message: "token=secret\nfull stack should not leak",
        providerId: "@korri:fixture-source",
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
