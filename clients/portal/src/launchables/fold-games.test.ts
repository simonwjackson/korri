import { describe, expect, it } from "bun:test"
import type { Game, GameIdentity, LocalGame } from "@contracts/generated/korrid"
import { foldGameCopies } from "./fold-games"

const hash = (value: string): GameIdentity => ({ kind: "hash", value })
const provider = (ref: string): GameIdentity => ({
  kind: "provider",
  value: { provider: "@korri:store", ref },
})
const local = (id: string, identity?: GameIdentity): LocalGame => ({
  id,
  title: id,
  system: "Game Boy Advance",
  ...(identity === undefined ? {} : { identity }),
})
const remote = (
  id: string,
  host: string,
  identity?: GameIdentity,
): Game => ({
  id,
  title: id,
  host,
  ...(identity === undefined ? {} : { identity }),
})

describe("foldGameCopies", () => {
  it("folds matching local and remote hashes with the local copy first", () => {
    const identity = hash("sha256:wario")
    const folded = foldGameCopies(
      [local("wl4", identity)],
      [remote("wl4", "zao", identity)],
    )

    expect(folded).toEqual([
      {
        primary: { kind: "local", game: local("wl4", identity) },
        alternatives: [
          { kind: "remote", game: remote("wl4", "zao", identity) },
        ],
      },
    ])
  })

  it("folds provider identities only when provider and ref both match", () => {
    const folded = foldGameCopies([], [
      remote("a", "zao", provider("same")),
      remote("b", "aka", provider("same")),
      remote("c", "aka", provider("different")),
      remote("d", "aka", {
        kind: "provider",
        value: { provider: "@korri:other", ref: "same" },
      }),
    ])

    expect(folded).toHaveLength(3)
    expect(folded[0]?.primary).toEqual({
      kind: "remote",
      game: remote("b", "aka", provider("same")),
    })
    expect(folded[0]?.alternatives).toEqual([
      { kind: "remote", game: remote("a", "zao", provider("same")) },
    ])
  })

  it("never folds games without an identity", () => {
    expect(foldGameCopies([local("wl4")], [remote("wl4", "zao")])).toHaveLength(2)
  })
})
