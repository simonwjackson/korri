/**
 * pico surface.
 *
 * Reactive layer over PicoSession. Same swap-seam shape as the library atoms.
 */
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PicoSession } from "./pico-session-service"

export const picoSessionLayerAtom = Atom.make(PicoSession.Fixtures)

export const picoSessionRuntime = Atom.runtime(get => get(picoSessionLayerAtom))

/** Current gate state — mirrors the real foreground-session status atom. */
export const picoSessionStatusAtom = picoSessionRuntime.atom(
  Effect.gen(function* () {
    const session = yield* PicoSession
    return yield* session.status()
  }),
)

export const picoFailureKindsAtom = picoSessionRuntime.atom(
  Effect.gen(function* () {
    const session = yield* PicoSession
    return yield* session.failureKinds()
  }),
)

export const picoBootStepsAtom = picoSessionRuntime.atom(
  Effect.gen(function* () {
    const session = yield* PicoSession
    return yield* session.bootSteps()
  }),
)
