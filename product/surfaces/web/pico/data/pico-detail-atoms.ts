/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Reactive layer over PicoReleases + PicoStats, plus the per-screen combined
 * atoms the detail/acquire screens read. A detail screen anchors on one game
 * (games[1]) and the acquire screens on a download target (games[2]); both are
 * selectors over PicoLibrary data combined with detail data via
 * `AsyncResult.all`, so each screen reads ONE atom.
 */
import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { PicoReleases, PicoStats } from "./pico-detail-service"
import { picoGamesAtom } from "./pico-library-atoms"

export const picoReleasesLayerAtom = Atom.make(PicoReleases.Fixtures)
export const picoReleasesRuntime = Atom.runtime(get =>
  get(picoReleasesLayerAtom),
)

export const picoStatsLayerAtom = Atom.make(PicoStats.Fixtures)
export const picoStatsRuntime = Atom.runtime(get => get(picoStatsLayerAtom))

/** The game a detail screen anchors on (matches Variant D's pick). */
export const picoDetailGameAtom = Atom.mapResult(
  picoGamesAtom,
  games => games[1] ?? games[0],
)

/** The download target the acquire screens anchor on. */
export const picoAcquireTargetAtom = Atom.mapResult(
  picoGamesAtom,
  games => games[2] ?? games[0],
)

export const picoReleasesAtom = picoReleasesRuntime.atom(
  Effect.gen(function* () {
    const releases = yield* PicoReleases
    return yield* releases.releasesFor("anchor")
  }),
)

export const picoAppChoicesAtom = picoReleasesRuntime.atom(
  Effect.gen(function* () {
    const releases = yield* PicoReleases
    return yield* releases.appChoicesFor("anchor")
  }),
)

export const picoRuntimesAtom = picoReleasesRuntime.atom(
  Effect.gen(function* () {
    const releases = yield* PicoReleases
    return yield* releases.runtimes()
  }),
)

export const picoStatsAtom = picoStatsRuntime.atom(
  Effect.gen(function* () {
    const stats = yield* PicoStats
    return yield* stats.statsFor("anchor")
  }),
)

/** First FEX-runtime release (the "prepare a runtime" target). */
export const picoFexReleaseAtom = Atom.mapResult(picoReleasesAtom, releases =>
  releases.find(release => release.runtime === "FEX"),
)

/* ── Per-screen combined atoms (each screen reads exactly one) ─────────────── */

export const picoReleasePickerAtom = Atom.make(get =>
  AsyncResult.all({
    game: get(picoDetailGameAtom),
    releases: get(picoReleasesAtom),
  }),
)

export const picoEmulatorChooserAtom = Atom.make(get =>
  AsyncResult.all({
    game: get(picoDetailGameAtom),
    appChoices: get(picoAppChoicesAtom),
  }),
)

export const picoCommunityStatsAtom = Atom.make(get =>
  AsyncResult.all({
    game: get(picoDetailGameAtom),
    stats: get(picoStatsAtom),
  }),
)

export const picoMediaGalleryAtom = Atom.make(get =>
  AsyncResult.all({
    game: get(picoDetailGameAtom),
    games: get(picoGamesAtom),
  }),
)

export const picoDownloadConfirmAtom = Atom.make(get =>
  AsyncResult.all({
    target: get(picoAcquireTargetAtom),
    fexRelease: get(picoFexReleaseAtom),
    runtimes: get(picoRuntimesAtom),
  }),
)

export const picoInstallingAtom = Atom.make(get =>
  AsyncResult.all({
    runtimes: get(picoRuntimesAtom),
  }),
)
