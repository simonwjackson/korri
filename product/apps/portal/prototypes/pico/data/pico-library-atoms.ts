/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * The reactive layer over PicoLibrary. The provided layer is itself an atom
 * (`picoLibraryLayerAtom`) — THIS is the swap seam: set it to `PicoLibrary.Live`
 * or `PicoLibrary.Fixtures` and every atom built on the runtime re-derives, with
 * no change to any consuming component. Mirrors @platform/react/library/
 * library-atoms (layer atoms → `Atom.runtime` → `runtime.atom`).
 */
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type { PicoGame } from "../fixtures"
import { PicoLibrary, type PicoLaunchInput } from "./pico-library-service"

/** Swappable provided layer. Default: static fixtures (mount-without-mocking). */
export const picoLibraryLayerAtom = Atom.make(PicoLibrary.Fixtures)

/** Runtime reads the layer atom, so swapping the layer rebuilds the runtime. */
export const picoLibraryRuntime = Atom.runtime(get =>
  get(picoLibraryLayerAtom),
)

/** What a screen actually reads. It yields the service; the layer supplies it. */
export const picoGamesAtom = picoLibraryRuntime.atom(
  Effect.gen(function* () {
    const library = yield* PicoLibrary
    return yield* library.list()
  }),
)

/** Continue-playing rail: recently played, most-recent first. Derived selector
 * over PicoLibrary data — not its own service. */
const recentOf = (games: readonly PicoGame[]): readonly PicoGame[] =>
  [...games]
    .filter(game => game.lastPlayedAt !== null)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))

export const picoRecentAtom = Atom.mapResult(picoGamesAtom, recentOf)

/** A representative "current" game for in-session screens (first recent). */
export const picoHeroAtom = Atom.mapResult(
  picoGamesAtom,
  games => recentOf(games)[0] ?? games[0],
)

/** Showcase screens need both rails at once. */
export const picoShowcaseAtom = Atom.make(get =>
  AsyncResult.all({
    games: get(picoGamesAtom),
    recent: get(picoRecentAtom),
  }),
)

/** The launch mutation, as a `runtime.fn` — mirrors `app.library.launch`.
 * Writing an input runs `launch()` through the provided layer and exposes the
 * result as an AsyncResult. */
export const picoLaunchFn = picoLibraryRuntime.fn<PicoLaunchInput>()(input =>
  Effect.gen(function* () {
    const library = yield* PicoLibrary
    return yield* library.launch(input)
  }),
)
