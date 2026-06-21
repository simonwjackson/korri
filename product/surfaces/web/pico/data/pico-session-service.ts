/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * The launch gate + foreground-session lifecycle. Highest-fidelity mirror in the
 * prototype: `status()` returns a `PicoSessionGateState` that copies the real
 * `ForegroundSessionGateState` ADT 1:1 (foreground-session-gate-state.ts:22 —
 * Ready / Preparing{state} / Running / Cooling{state} / Recovering{state,stage,
 * message} / Unknown{state} / LoadError{message}), and `status()` is error-free
 * like the real `ForegroundSessionStatusSource.get` (Effect<State>, never).
 *
 * The gallery's launch-failure and boot screens render reference catalogs rather
 * than a single live state, so `failureKinds()` / `bootSteps()` expose those —
 * the failure kinds map onto `Recovering{stage,message}`, the boot steps onto
 * `Preparing{state}`.
 */
import { Context, Duration, Effect, Layer } from "effect"
import { PICO_BOOT_STEPS, PICO_FAILURE_KINDS } from "../fixtures-extra"

/** One launch-failure kind the gate surfaces (mirrors a `Recovering` cause). */
export interface PicoFailureKind {
  readonly kind: string
  readonly title: string
  readonly detail: string
}

/** Mirrors `ForegroundSessionGateState` (foreground-session-gate-state.ts:22). */
export type PicoSessionGateState =
  | { readonly _tag: "Ready" }
  | {
      readonly _tag: "Preparing"
      readonly state: "Preparing" | "Spawning" | "Foregrounding"
      readonly requestId?: string
      readonly gameId?: string
    }
  | {
      readonly _tag: "Running"
      readonly requestId?: string
      readonly gameId?: string
    }
  | {
      readonly _tag: "Cooling"
      readonly state: "ExitObserved" | "TearingDown" | "VerifyingReady"
      readonly requestId?: string
      readonly gameId?: string
    }
  | {
      readonly _tag: "Recovering"
      readonly state: "Failed" | "Recovering"
      readonly requestId?: string
      readonly gameId?: string
      readonly stage?: string
      readonly message?: string
    }
  | { readonly _tag: "Unknown"; readonly state?: string }
  | { readonly _tag: "LoadError"; readonly message: string }

export interface PicoSessionService {
  readonly status: () => Effect.Effect<PicoSessionGateState>
  readonly failureKinds: () => Effect.Effect<readonly PicoFailureKind[]>
  readonly bootSteps: () => Effect.Effect<readonly string[]>
}

function makePicoSessionImpl(): PicoSessionService {
  return {
    status: () => Effect.succeed<PicoSessionGateState>({ _tag: "Ready" }),
    failureKinds: () => Effect.succeed(PICO_FAILURE_KINDS),
    bootSteps: () => Effect.succeed(PICO_BOOT_STEPS),
  }
}

export class PicoSession extends Context.Service<
  PicoSession,
  PicoSessionService
>()("PicoSession") {
  static readonly Fixtures = Layer.succeed(this)(makePicoSessionImpl())

  /** TODO: swap to real ForegroundSessionStatusLayerLive
   * (home/foreground-session-status-layer-live.ts); poll at ~1 Hz. */
  static readonly Live = Layer.succeed(this)({
    status: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(400))
        return { _tag: "Ready" } as const
      }),
    failureKinds: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(400))
        return PICO_FAILURE_KINDS
      }),
    bootSteps: () =>
      Effect.gen(function* () {
        yield* Effect.sleep(Duration.millis(400))
        return PICO_BOOT_STEPS
      }),
  })
}
