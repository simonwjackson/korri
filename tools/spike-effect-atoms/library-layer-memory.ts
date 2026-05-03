import { Duration, Effect, Layer } from "effect"
import { type GameRecord, Library, type LibraryError } from "./library-service"

export type InMemoryLaunchConfig =
  | { readonly kind: "succeed"; readonly delayMs?: number }
  | {
      readonly kind: "fail"
      readonly exitCode: number
      readonly delayMs?: number
    }

export interface InMemoryLibraryConfig {
  readonly games: readonly GameRecord[]
  readonly launch: InMemoryLaunchConfig
}

export function makeInMemoryLibraryLayer(config: InMemoryLibraryConfig) {
  return Layer.succeed(Library, {
    list: () => Effect.succeed(config.games),
    launch: () =>
      delayIfConfigured(
        Effect.succeed(launchResult(config.launch)),
        config.launch.delayMs,
      ),
  })
}

export function makeFailingListLayer(error: LibraryError) {
  return Layer.succeed(Library, {
    list: () => Effect.fail(error),
    launch: () => Effect.never,
  })
}

export const loadingForeverLayer = Layer.succeed(Library, {
  list: () => Effect.never,
  launch: () => Effect.never,
})

function launchResult(config: InMemoryLaunchConfig) {
  if (config.kind === "succeed") return { status: "launched" } as const
  return { status: "failed", exitCode: config.exitCode } as const
}

function delayIfConfigured<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  delayMs: number | undefined,
): Effect.Effect<A, E, R> {
  if (!delayMs || delayMs <= 0) return effect
  return effect.pipe(Effect.delay(Duration.millis(delayMs)))
}
