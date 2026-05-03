import { describe, expect, it } from "bun:test"
import { games } from "@shared/fixtures/games/games"
import { Effect } from "effect"
import { LibraryError, LibrarySource } from "./library-services"
import {
  loadingForeverLibrarySourceLayer,
  makeFailingLibrarySourceLayer,
  makeInMemoryLibrarySourceLayer,
} from "./library-source-layer-memory"

const seedGames = games.slice(0, 3)

const listWith = (layer: ReturnType<typeof makeInMemoryLibrarySourceLayer>) =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    return yield* source.list()
  }).pipe(Effect.provide(layer))

describe("makeInMemoryLibrarySourceLayer", () => {
  it("returns configured games", async () => {
    const result = await Effect.runPromise(
      listWith(makeInMemoryLibrarySourceLayer({ games: seedGames })),
    )

    expect(result).toEqual(seedGames)
  })

  it("resolves a default launch spec for a known game", async () => {
    const spec = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* LibrarySource
        return yield* source.launchSpecFor(seedGames[0].id)
      }).pipe(
        Effect.provide(makeInMemoryLibrarySourceLayer({ games: seedGames })),
      ),
    )

    expect(spec).toEqual({
      command: "in-memory-launcher",
      args: [seedGames[0].id],
    })
  })

  it("returns undefined launch specs for unknown games", async () => {
    const spec = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* LibrarySource
        return yield* source.launchSpecFor("missing")
      }).pipe(
        Effect.provide(makeInMemoryLibrarySourceLayer({ games: seedGames })),
      ),
    )

    expect(spec).toBeUndefined()
  })

  it("fails list with the configured error", async () => {
    const error = new LibraryError({ reason: "io", message: "disk" })
    const exit = await Effect.runPromiseExit(
      listWith(makeFailingLibrarySourceLayer(error)),
    )

    expect(exit._tag).toBe("Failure")
  })

  it("can represent an indefinitely loading source", async () => {
    const result = await Effect.runPromise(
      Effect.timeoutOption(
        listWith(loadingForeverLibrarySourceLayer),
        "10 millis",
      ),
    )

    expect(result._tag).toBe("None")
  })
})
