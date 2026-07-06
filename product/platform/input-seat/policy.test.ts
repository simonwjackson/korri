import { describe, expect, it } from "bun:test"
import { decodeInputSeatPolicy, resolveInputSeatPolicy } from "./policy"

describe("input-seat policy", () => {
  it("defaults remote managed launches to P1-P4 for validated extra-seat runtimes", () => {
    const policy = resolveInputSeatPolicy(undefined, {
      launchKind: "remote-managed",
      runtimeSupportsExtraSeats: true,
    })

    expect(policy).toEqual({
      enabled: true,
      playerCount: 4,
      source: "sunshine-moonlight",
      seatNamePrefix: "Korri Seat",
      runtimeSupportsExtraSeats: true,
    })
  })

  it("keeps unknown runtimes conservative instead of silently enabling P1-P4", () => {
    const policy = resolveInputSeatPolicy(undefined, {
      launchKind: "remote-managed",
      runtimeSupportsExtraSeats: false,
    })

    expect(policy).toMatchObject({ enabled: false, playerCount: 0 })
  })

  it("preserves deterministic P1-first ordering when a release opts down", () => {
    const policy = resolveInputSeatPolicy({ playerCount: 2 }, {
      launchKind: "remote-managed",
      runtimeSupportsExtraSeats: true,
    })

    expect(policy.playerCount).toBe(2)
  })

  it("treats player count zero as an explicit disabled policy", () => {
    const policy = decodeInputSeatPolicy({ playerCount: 0 })

    expect(policy).toMatchObject({ enabled: false, playerCount: 0 })
  })

  it("rejects player counts above the supported maximum", () => {
    expect(() => decodeInputSeatPolicy({ playerCount: 5 })).toThrow(
      /supports at most 4 players/,
    )
  })

  it("rejects unknown keys", () => {
    expect(() => decodeInputSeatPolicy({ playerCount: 1, typo: true })).toThrow()
  })
})
