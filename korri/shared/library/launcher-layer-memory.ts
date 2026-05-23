import type { LaunchFailureKind, LaunchResult } from "@shared/library/launcher"
import { Duration, Effect, Layer } from "effect"
import { Launcher, type LibraryError } from "./library-services"

export type InMemoryLauncherBehavior =
  | { readonly kind: "succeed"; readonly delayMs?: number }
  | {
      readonly kind: "fail"
      readonly exitCode: number
      readonly delayMs?: number
      readonly stderrTail?: string
      readonly failureKind?: LaunchFailureKind
    }
  | {
      readonly kind: "defect"
      readonly defect: unknown
      readonly delayMs?: number
    }

export interface InMemoryLauncherConfig {
  readonly behavior: InMemoryLauncherBehavior
}

export function makeInMemoryLauncherLayer(config: InMemoryLauncherConfig) {
  return Layer.succeed(Launcher)({
    run: () =>
      delayIfConfigured(launchEffect(config.behavior), config.behavior.delayMs),
  })
}

function launchEffect(
  behavior: InMemoryLauncherBehavior,
): Effect.Effect<LaunchResult, LibraryError> {
  if (behavior.kind === "succeed") {
    return Effect.succeed({ status: "launched" })
  }

  if (behavior.kind === "defect") {
    return Effect.die(behavior.defect)
  }

  return Effect.succeed(
    behavior.stderrTail !== undefined
      ? {
          status: "failed",
          exitCode: behavior.exitCode,
          stderrTail: behavior.stderrTail,
          ...(behavior.failureKind
            ? { failureKind: behavior.failureKind }
            : {}),
        }
      : {
          status: "failed",
          exitCode: behavior.exitCode,
          ...(behavior.failureKind
            ? { failureKind: behavior.failureKind }
            : {}),
        },
  )
}

function delayIfConfigured<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  delayMs: number | undefined,
): Effect.Effect<A, E, R> {
  if (!delayMs || delayMs <= 0) return effect
  return effect.pipe(Effect.delay(Duration.millis(delayMs)))
}
