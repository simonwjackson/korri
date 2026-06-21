/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Reactive layer over PicoParty, plus the combined atoms the Multiplayer screens
 * read. The session screens anchor on a co-op title (games[4]) and combine it
 * with the party players (and, on the hub, online friends) via `AsyncResult.all`
 * so each screen reads ONE atom.
 */
import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { picoGamesAtom } from "./pico-library-atoms"
import { PicoParty } from "./pico-party-service"
import { picoFriendsAtom } from "./pico-social-atoms"

export const picoPartyLayerAtom = Atom.make(PicoParty.Fixtures)
export const picoPartyRuntime = Atom.runtime(get => get(picoPartyLayerAtom))

export const picoPlayersAtom = picoPartyRuntime.atom(
  Effect.gen(function* () {
    const party = yield* PicoParty
    return yield* party.players()
  }),
)

/** The co-op title the session screens anchor on (Cuphead — hero + logo). */
export const picoPartyGameAtom = Atom.mapResult(
  picoGamesAtom,
  games => games[4] ?? games[0],
)

/* ── Per-screen combined atoms (each screen reads exactly one) ─────────────── */

/** Hub: anchor game + party players + online friends. */
export const picoPartyHubAtom = Atom.make(get =>
  AsyncResult.all({
    game: get(picoPartyGameAtom),
    players: get(picoPlayersAtom),
    friends: get(picoFriendsAtom),
  }),
)

/** Lobby / crew / countdown / seat-assign / session HUD / toast: game + players. */
export const picoPartySessionAtom = Atom.make(get =>
  AsyncResult.all({
    game: get(picoPartyGameAtom),
    players: get(picoPlayersAtom),
  }),
)

/** Inline strip: library rail + party players. */
export const picoInlineStripAtom = Atom.make(get =>
  AsyncResult.all({
    games: get(picoGamesAtom),
    players: get(picoPlayersAtom),
  }),
)
