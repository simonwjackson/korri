/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Reactive layer over PicoHosts + PicoSeats. Same swap-seam shape as the library
 * atoms. The dual-screen surfaces read the shared library hero atom directly.
 */
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PicoHosts, PicoSeats } from "./pico-devices-service"

export const picoHostsLayerAtom = Atom.make(PicoHosts.Fixtures)
export const picoHostsRuntime = Atom.runtime(get => get(picoHostsLayerAtom))

export const picoSeatsLayerAtom = Atom.make(PicoSeats.Fixtures)
export const picoSeatsRuntime = Atom.runtime(get => get(picoSeatsLayerAtom))

export const picoHostsAtom = picoHostsRuntime.atom(
  Effect.gen(function* () {
    const hosts = yield* PicoHosts
    return yield* hosts.hosts()
  }),
)

export const picoSeatsAtom = picoSeatsRuntime.atom(
  Effect.gen(function* () {
    const seats = yield* PicoSeats
    return yield* seats.seats()
  }),
)
