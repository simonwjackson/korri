import { describe, expect, it } from "bun:test"
import { games } from "@shared/fixtures/games/games"
import { Cause, Effect, Exit } from "effect"
import {
  loadingForeverLayer,
  makeFailingListLayer,
  makeInMemoryLibraryLayer,
} from "./library-layer-memory"
import { Library, LibraryError } from "./library-service"

const seedGames = games.slice(0, 3)

const listGames = Effect.gen(function* () {
  const library = yield* Library
  return yield* library.list()
})

const launchGame = (id: string) =>
  Effect.gen(function* () {
    const library = yield* Library
    return yield* library.launch(id)
  })

describe("spike Effect atoms Library layer", () => {
  it("lists configured seed games through the Library service", async () => {
    const layer = makeInMemoryLibraryLayer({
      games: seedGames,
      launch: { kind: "succeed" },
    })

    const result = await Effect.runPromise(
      listGames.pipe(Effect.provide(layer)),
    )

    expect(result).toEqual(seedGames)
  })

  it("launches successfully and honors configured delay", async () => {
    const layer = makeInMemoryLibraryLayer({
      games: seedGames,
      launch: { kind: "succeed", delayMs: 20 },
    })

    const startedAt = Date.now()
    const result = await Effect.runPromise(
      launchGame("crystalline-drift").pipe(Effect.provide(layer)),
    )
    const elapsedMs = Date.now() - startedAt

    expect(result).toEqual({ status: "launched" })
    expect(elapsedMs).toBeGreaterThanOrEqual(15)
  })

  it("returns failed launch data for configured launch failures", async () => {
    const layer = makeInMemoryLibraryLayer({
      games: seedGames,
      launch: { kind: "fail", exitCode: 7 },
    })

    const result = await Effect.runPromise(
      launchGame("any-id").pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ status: "failed", exitCode: 7 })
  })

  it("fails list with the configured LibraryError", async () => {
    const error = new LibraryError({
      reason: "io",
      message: "fixture read failed",
    })
    const exit = await Effect.runPromiseExit(
      listGames.pipe(Effect.provide(makeFailingListLayer(error))),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBe(error)
    }
  })

  it("keeps loadingForeverLayer unresolved", async () => {
    const winner = await Effect.runPromise(
      Effect.race(
        listGames.pipe(
          Effect.provide(loadingForeverLayer),
          Effect.as("list" as const),
        ),
        Effect.sleep("100 millis").pipe(Effect.as("timeout" as const)),
      ),
    )

    expect(winner).toBe("timeout")
  })
})
