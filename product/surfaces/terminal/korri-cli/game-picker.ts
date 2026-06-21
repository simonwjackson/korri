import { BunServices } from "@effect/platform-bun"
import type { GameRecord } from "@platform/fixtures/games/game"
import { getGameDisplayName } from "@platform/fixtures/games/game"
import { Effect } from "effect"
import * as Terminal from "effect/Terminal"
import { Prompt } from "effect/unstable/cli"

export interface GameChoice {
  readonly title: string
  readonly description?: string
  readonly value: GameRecord
}

export type GamePicker = (
  games: readonly GameRecord[],
) => Promise<GameRecord | undefined>

export function gameChoiceFor(game: GameRecord): GameChoice {
  const title = getGameDisplayName(game)
  return {
    title,
    description: title === game.id ? undefined : game.id,
    value: game,
  }
}

export function createEffectGamePicker(): GamePicker {
  return async games =>
    await Effect.runPromise(
      Prompt.run(
        Prompt.select({
          message: "Choose a game to stream",
          choices: games.map(gameChoiceFor),
        }),
      ).pipe(
        Effect.catchIf(Terminal.isQuitError, () => Effect.succeed(undefined)),
        Effect.provide(BunServices.layer),
      ),
    )
}

export function createStaticGamePicker(gameId: string): GamePicker {
  return async games => games.find(game => game.id === gameId)
}
