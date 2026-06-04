import { describe, expect, it } from "bun:test"
import { games } from "@platform/fixtures/games/games"
import { Effect, Layer, Schema } from "effect"
import {
  ContentItem,
  type ContentSourceService,
  ContentSources,
  LibrarySource,
  type LibrarySourceService,
} from "./library-services"

const game = games[0]

describe("ContentSource contract", () => {
  it("keeps games as a tagged content item for catalog plugins", () => {
    const item = Schema.decodeUnknownSync(ContentItem)({
      _tag: "GameItem",
      game,
    })

    expect(item._tag).toBe("GameItem")
    if (item._tag === "GameItem") {
      expect(item.game.id).toBe(game.id)
    }
  })

  it("lets the host collect content source services without replacing LibrarySource", async () => {
    const source: ContentSourceService = {
      id: "korri.wasm4",
      kinds: ["GameItem"],
      list: () => Effect.succeed([{ _tag: "GameItem", game }] as const),
    }
    const contentSourcesLayer = Layer.succeed(ContentSources, [source])

    const librarySource: LibrarySourceService = {
      list: () => Effect.succeed([game] as const),
      launchSpecFor: id =>
        Effect.succeed(
          id === game.id ? { command: "wasm4", args: [id] } : undefined,
        ),
      resolveLaunchForGame: id =>
        Effect.succeed({
          spec: { command: "wasm4", args: [id] },
          artifacts: {
            root: "/tmp/korri-launch-artifacts/wasm4",
            paths: {
              contentPath: "/tmp/korri-launch-artifacts/wasm4/game.wasm",
            },
          },
        }),
    }
    const librarySourceLayer = Layer.succeed(LibrarySource, librarySource)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const contentSources = yield* ContentSources
        const library = yield* LibrarySource
        const contentItems = yield* contentSources[0].list()
        const libraryGames = yield* library.list()
        const launch = yield* library.resolveLaunchForGame(game.id)
        return { contentItems, libraryGames, launch }
      }).pipe(
        Effect.provide(Layer.merge(contentSourcesLayer, librarySourceLayer)),
      ),
    )

    expect(result.contentItems).toEqual([{ _tag: "GameItem", game }])
    expect(result.libraryGames).toEqual([game])
    expect(result.launch.artifacts?.root).toBe(
      "/tmp/korri-launch-artifacts/wasm4",
    )
  })
})
