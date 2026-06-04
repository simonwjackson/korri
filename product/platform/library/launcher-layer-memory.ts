import type {
  LaunchFailureKind,
  LaunchResult,
  ManagedLaunchResult,
} from "@platform/library/launcher"
import { Duration, Effect, Layer } from "effect"
import { Launcher, type LibraryError } from "./library-services"

export interface ManagedInMemoryLauncherControl {
  readonly signals: string[]
  resolveExit: (result: {
    readonly exitCode: number
    readonly stderrTail?: string
  }) => void
}

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
      readonly kind: "managed"
      readonly control: ManagedInMemoryLauncherControl
      readonly processId?: number
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
      delayIfConfigured(
        launchEffect(config.behavior),
        delayMs(config.behavior),
      ),
    spawn: () =>
      delayIfConfigured(spawnEffect(config.behavior), delayMs(config.behavior)),
  })
}

makeInMemoryLauncherLayer.createManagedControl =
  function createManagedControl(): ManagedInMemoryLauncherControl {
    let resolveExit!: (result: {
      readonly exitCode: number
      readonly stderrTail?: string
    }) => void
    const exit = new Promise<{
      readonly exitCode: number
      readonly stderrTail?: string
    }>(resolve => {
      resolveExit = resolve
    })
    const signals: string[] = []
    return {
      signals,
      resolveExit,
      get exit() {
        return exit
      },
    } as ManagedInMemoryLauncherControl & {
      readonly exit: Promise<{
        readonly exitCode: number
        readonly stderrTail?: string
      }>
    }
  }

function launchEffect(
  behavior: InMemoryLauncherBehavior,
): Effect.Effect<LaunchResult, LibraryError> {
  if (behavior.kind === "managed") {
    return Effect.promise(async () => {
      const control = behavior.control as ManagedInMemoryLauncherControl & {
        readonly exit: Promise<{
          readonly exitCode: number
          readonly stderrTail?: string
        }>
      }
      return launchResultFromExit(await control.exit)
    })
  }

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

function spawnEffect(
  behavior: InMemoryLauncherBehavior,
): Effect.Effect<ManagedLaunchResult, LibraryError> {
  if (behavior.kind === "defect") return Effect.die(behavior.defect)

  if (behavior.kind !== "managed") {
    return launchEffect(behavior).pipe(
      Effect.map(result =>
        result.status === "failed"
          ? { status: "failed" as const, result }
          : managedFromTerminal(Promise.resolve({ exitCode: 0 }), 999),
      ),
    )
  }

  const control = behavior.control as ManagedInMemoryLauncherControl & {
    readonly exit: Promise<{
      readonly exitCode: number
      readonly stderrTail?: string
    }>
  }
  const exit = control.exit
  return Effect.succeed(
    managedFromTerminal(exit, behavior.processId ?? 999, control),
  )
}

function managedFromTerminal(
  exit: Promise<{ readonly exitCode: number; readonly stderrTail?: string }>,
  processId: number,
  control?: ManagedInMemoryLauncherControl,
): Extract<ManagedLaunchResult, { readonly status: "started" }> {
  let settled = false
  const terminal = exit.then(result => {
    settled = true
    return result
  })
  return {
    status: "started",
    result: terminal.then(launchResultFromExit),
    session: {
      id: `in-memory:${processId}`,
      processId,
      exited: terminal.then(result => ({ exitCode: result.exitCode })),
      isGone: () => settled,
      terminate: () => {
        control?.signals.push("SIGTERM")
        control?.resolveExit({ exitCode: 143 })
      },
      terminateNow: () => {
        control?.signals.push("SIGKILL")
        control?.resolveExit({ exitCode: 137 })
      },
    },
  }
}

function launchResultFromExit(input: {
  readonly exitCode: number
  readonly stderrTail?: string
}): LaunchResult {
  if (input.exitCode === 0) return { status: "launched" }
  return input.stderrTail !== undefined
    ? {
        status: "failed",
        exitCode: input.exitCode,
        stderrTail: input.stderrTail,
      }
    : { status: "failed", exitCode: input.exitCode }
}

function delayMs(behavior: InMemoryLauncherBehavior): number | undefined {
  return "delayMs" in behavior ? behavior.delayMs : undefined
}

function delayIfConfigured<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  delayMs: number | undefined,
): Effect.Effect<A, E, R> {
  if (!delayMs || delayMs <= 0) return effect
  return effect.pipe(Effect.delay(Duration.millis(delayMs)))
}
