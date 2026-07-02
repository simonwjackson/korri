/**
 * pico surface.
 *
 * Reactive layer over PicoSocial + PicoStore, plus the combined atoms the Future
 * screens read (profile counts, game-of-the-day) via `AsyncResult.all`.
 */
import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { picoGamesAtom, picoHeroAtom } from "./pico-library-atoms"
import { PicoSocial, PicoStore } from "./pico-social-service"

export const picoSocialLayerAtom = Atom.make(PicoSocial.Fixtures)
export const picoSocialRuntime = Atom.runtime(get => get(picoSocialLayerAtom))

export const picoStoreLayerAtom = Atom.make(PicoStore.Fixtures)
export const picoStoreRuntime = Atom.runtime(get => get(picoStoreLayerAtom))

export const picoFriendsAtom = picoSocialRuntime.atom(
  Effect.gen(function* () {
    const social = yield* PicoSocial
    return yield* social.friends()
  }),
)

export const picoAchievementsAtom = picoSocialRuntime.atom(
  Effect.gen(function* () {
    const social = yield* PicoSocial
    return yield* social.achievementsFor("anchor")
  }),
)

export const picoScoresAtom = picoSocialRuntime.atom(
  Effect.gen(function* () {
    const social = yield* PicoSocial
    return yield* social.leaderboardFor("anchor")
  }),
)

export const picoStoreItemsAtom = picoStoreRuntime.atom(
  Effect.gen(function* () {
    const store = yield* PicoStore
    return yield* store.list()
  }),
)

/* ── Combined atoms (each screen reads exactly one) ───────────────────────── */

/** Profile counts: number of games + number of friends. */
export const picoProfileAtom = Atom.make(get =>
  AsyncResult.all({
    games: get(picoGamesAtom),
    friends: get(picoFriendsAtom),
  }),
)

/** Game-of-the-day: the hero plus "more like this". */
export const picoFeaturedAtom = Atom.make(get =>
  AsyncResult.all({
    hero: get(picoHeroAtom),
    games: get(picoGamesAtom),
  }),
)
