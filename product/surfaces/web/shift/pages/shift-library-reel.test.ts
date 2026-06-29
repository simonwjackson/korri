import { describe, expect, it } from "bun:test"
import { reelIndexFromSteps, reelWindow } from "./shift-library-reel"

describe("reelIndexFromSteps", () => {
  it("wraps positive and negative spins onto the wheel", () => {
    expect(reelIndexFromSteps(0, 4)).toBe(0)
    expect(reelIndexFromSteps(5, 4)).toBe(1)
    expect(reelIndexFromSteps(-1, 4)).toBe(3)
  })

  it("is safe on an empty reel", () => {
    expect(reelIndexFromSteps(3, 0)).toBe(0)
  })
})

describe("reelWindow", () => {
  it("returns centre-out neighbours, nearest first", () => {
    expect(reelWindow(2, 6, 2)).toEqual([2, 3, 1, 4, 0])
  })

  it("wraps around the ends", () => {
    expect(reelWindow(0, 4, 1)).toEqual([0, 1, 3])
  })

  it("never repeats an index on a short reel", () => {
    expect(reelWindow(0, 3, 5)).toEqual([0, 1, 2])
  })
})
