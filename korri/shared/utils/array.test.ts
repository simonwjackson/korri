/**
 * Tests for array utility functions
 * @module ArrayUtilsTests
 */

import { describe, expect, it } from "bun:test"
import {
  allDefined,
  allFalse,
  allNullish,
  allTrue,
  allTruthy,
  anyFalse,
  anyFalsy,
  anyNullish,
  anyTrue,
  noneFalse,
  noneFalsy,
  noneTrue,
} from "./array"

describe("array utilities", () => {
  describe("anyFalse", () => {
    it("should return true if any value is false", () => {
      expect(anyFalse([true, false, true])).toBe(true)
      expect(anyFalse([false, false, false])).toBe(true)
      expect(anyFalse([false])).toBe(true)
    })

    it("should return false if no values are false", () => {
      expect(anyFalse([true, true, true])).toBe(false)
      expect(anyFalse([true])).toBe(false)
      expect(anyFalse([])).toBe(false)
    })
  })

  describe("allFalse", () => {
    it("should return true if all values are false", () => {
      expect(allFalse([false, false, false])).toBe(true)
      expect(allFalse([false])).toBe(true)
    })

    it("should return false if any value is true", () => {
      expect(allFalse([false, true, false])).toBe(false)
      expect(allFalse([true, true, true])).toBe(false)
    })

    it("should return true for empty array", () => {
      expect(allFalse([])).toBe(true)
    })
  })

  describe("noneFalse", () => {
    it("should return true if no values are false", () => {
      expect(noneFalse([true, true, true])).toBe(true)
      expect(noneFalse([true])).toBe(true)
      expect(noneFalse([])).toBe(true)
    })

    it("should return false if any value is false", () => {
      expect(noneFalse([true, false, true])).toBe(false)
      expect(noneFalse([false])).toBe(false)
    })
  })

  describe("anyTrue", () => {
    it("should return true if any value is true", () => {
      expect(anyTrue([false, true, false])).toBe(true)
      expect(anyTrue([true, true, true])).toBe(true)
      expect(anyTrue([true])).toBe(true)
    })

    it("should return false if no values are true", () => {
      expect(anyTrue([false, false, false])).toBe(false)
      expect(anyTrue([false])).toBe(false)
      expect(anyTrue([])).toBe(false)
    })
  })

  describe("allTrue", () => {
    it("should return true if all values are true", () => {
      expect(allTrue([true, true, true])).toBe(true)
      expect(allTrue([true])).toBe(true)
    })

    it("should return false if any value is false", () => {
      expect(allTrue([true, false, true])).toBe(false)
      expect(allTrue([false, false, false])).toBe(false)
    })

    it("should return true for empty array", () => {
      expect(allTrue([])).toBe(true)
    })
  })

  describe("noneTrue", () => {
    it("should return true if no values are true", () => {
      expect(noneTrue([false, false, false])).toBe(true)
      expect(noneTrue([false])).toBe(true)
      expect(noneTrue([])).toBe(true)
    })

    it("should return false if any value is true", () => {
      expect(noneTrue([false, true, false])).toBe(false)
      expect(noneTrue([true])).toBe(false)
    })
  })

  describe("anyNullish", () => {
    it("should return true if any value is null", () => {
      expect(anyNullish([1, null, 3])).toBe(true)
      expect(anyNullish([null])).toBe(true)
    })

    it("should return true if any value is undefined", () => {
      expect(anyNullish([1, undefined, 3])).toBe(true)
      expect(anyNullish([undefined])).toBe(true)
    })

    it("should return false if no values are nullish", () => {
      expect(anyNullish([1, 2, 3])).toBe(false)
      expect(anyNullish(["hello", "world"])).toBe(false)
      expect(anyNullish([])).toBe(false)
    })

    it("should not consider falsy non-nullish values as nullish", () => {
      expect(anyNullish([0, "", false])).toBe(false)
    })
  })

  describe("anyFalsy", () => {
    it("should return true if any value is falsy", () => {
      expect(anyFalsy([1, 0, 3])).toBe(true)
      expect(anyFalsy(["hello", "", "world"])).toBe(true)
      expect(anyFalsy([true, false, true])).toBe(true)
      expect(anyFalsy([1, null, 3])).toBe(true)
      expect(anyFalsy([1, undefined, 3])).toBe(true)
    })

    it("should return false if all values are truthy", () => {
      expect(anyFalsy([1, "hello", true])).toBe(false)
      expect(anyFalsy([1, 2, 3])).toBe(false)
      expect(anyFalsy([])).toBe(false)
    })
  })

  describe("allNullish", () => {
    it("should return true if all values are null or undefined", () => {
      expect(allNullish([null, undefined, null])).toBe(true)
      expect(allNullish([null, null])).toBe(true)
      expect(allNullish([undefined])).toBe(true)
    })

    it("should return false if any value is not nullish", () => {
      expect(allNullish([null, 2, undefined])).toBe(false)
      expect(allNullish([0])).toBe(false)
    })

    it("should return true for empty array", () => {
      expect(allNullish([])).toBe(true)
    })
  })

  describe("allTruthy", () => {
    it("should return true if all values are truthy", () => {
      expect(allTruthy([1, "hello", true])).toBe(true)
      expect(allTruthy([1, 2, 3])).toBe(true)
      expect(allTruthy(["a"])).toBe(true)
    })

    it("should return false if any value is falsy", () => {
      expect(allTruthy([1, "", true])).toBe(false)
      expect(allTruthy([1, 0, 3])).toBe(false)
      expect(allTruthy([1, null, 3])).toBe(false)
    })

    it("should return true for empty array", () => {
      expect(allTruthy([])).toBe(true)
    })
  })

  describe("allDefined", () => {
    it("should return true if all values are non-nullish", () => {
      expect(allDefined([1, 2, 3])).toBe(true)
      expect(allDefined(["hello", "world"])).toBe(true)
      expect(allDefined([0, "", false])).toBe(true) // Falsy but not nullish
    })

    it("should return false if any value is null", () => {
      expect(allDefined([1, null, 3])).toBe(false)
      expect(allDefined([null])).toBe(false)
    })

    it("should return false if any value is undefined", () => {
      expect(allDefined([1, undefined, 3])).toBe(false)
      expect(allDefined([undefined])).toBe(false)
    })

    it("should return true for empty array", () => {
      expect(allDefined([])).toBe(true)
    })

    it("should act as a type guard", () => {
      const values: Array<string | null> = ["hello", "world"]
      if (allDefined(values)) {
        // TypeScript should narrow the type to string[]
        const first: string = values[0]
        expect(first).toBe("hello")
      }
    })
  })

  describe("noneFalsy", () => {
    it("should return true if no values are falsy", () => {
      expect(noneFalsy([1, "hello", true] as const)).toBe(true)
      expect(noneFalsy([1, 2, 3] as const)).toBe(true)
    })

    it("should return false if any value is falsy", () => {
      expect(noneFalsy([1, 0, 3] as const)).toBe(false)
      expect(noneFalsy([1, "", 3] as const)).toBe(false)
      expect(noneFalsy([1, null, 3] as const)).toBe(false)
      expect(noneFalsy([1, undefined, 3] as const)).toBe(false)
      expect(noneFalsy([1, false, 3] as const)).toBe(false)
    })

    it("should return true for empty array", () => {
      expect(noneFalsy([] as const)).toBe(true)
    })

    it("should act as a type guard", () => {
      const strategy: string | null = "test"
      const id: number | undefined = 42
      const values = [strategy, id] as const
      if (noneFalsy(values)) {
        // TypeScript should narrow the types
        const [s, i] = values
        expect(s).toBe("test")
        expect(i).toBe(42)
      }
    })
  })
})
