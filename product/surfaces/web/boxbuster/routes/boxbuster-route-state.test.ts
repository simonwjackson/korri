import { describe, expect, it } from "bun:test"
import {
  boxbusterPathForPlay,
  boxbusterRouteState,
} from "./BoxbusterStoreRoute"

const games = [
  {
    id: "hollow-knight",
    title: "Hollow Knight",
    year: 2017,
    platform: "PC",
    genre: "Metroidvania",
    players: "1 Player",
    blurb: "A tiny knight explores Hallownest.",
  },
  {
    id: "celeste",
    title: "Celeste",
    year: 2018,
    platform: "PC",
    genre: "Platformer",
    players: "1 Player",
    blurb: "Climb the mountain.",
  },
]

describe("boxbusterRouteState", () => {
  it("resolves /game/$id to the playing game", () => {
    expect(boxbusterRouteState(games, "hollow-knight").playing).toMatchObject({
      id: "hollow-knight",
    })
  })

  it("treats / and unknown game ids as browsing", () => {
    expect(boxbusterRouteState(games, undefined).playing).toBeNull()
    expect(boxbusterRouteState(games, "missing").playing).toBeNull()
  })

  it("maps in-world play and eject actions to canonical routes", () => {
    expect(boxbusterPathForPlay(games[0] ?? null)).toEqual({
      to: "/game/$id",
      params: { id: "hollow-knight" },
    })
    expect(boxbusterPathForPlay(null)).toEqual({ to: "/" })
  })
})
