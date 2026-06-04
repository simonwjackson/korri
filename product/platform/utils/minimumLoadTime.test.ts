/**
 * Tests for minimumLoadTime utility
 * @module MinimumLoadTimeTests
 */

import { describe, expect, it } from "bun:test"
import { minimumLoadTime } from "./minimumLoadTime"

describe("minimumLoadTime", () => {
  describe("when operation completes quickly", () => {
    it("should wait for the minimum time", async () => {
      const minTime = 100 // Use short time for tests
      const startTime = Date.now()

      // Operation that completes instantly
      const result = await minimumLoadTime(Promise.resolve("quick"), minTime)

      const elapsed = Date.now() - startTime

      expect(result).toBe("quick")
      expect(elapsed).toBeGreaterThanOrEqual(minTime - 10) // Allow 10ms tolerance
    })

    it("should return the promise result", async () => {
      const data = { id: 1, name: "test" }
      const result = await minimumLoadTime(Promise.resolve(data), 50)

      expect(result).toEqual(data)
    })
  })

  describe("when operation takes longer than minimum", () => {
    it("should not add extra delay", async () => {
      const minTime = 50
      const operationTime = 100
      const startTime = Date.now()

      const slowOperation = new Promise<string>(resolve =>
        setTimeout(() => resolve("slow"), operationTime),
      )

      const result = await minimumLoadTime(slowOperation, minTime)

      const elapsed = Date.now() - startTime

      expect(result).toBe("slow")
      // Should not wait longer than the operation itself (with tolerance)
      expect(elapsed).toBeLessThan(operationTime + 50)
    })
  })

  describe("when operation rejects", () => {
    it("should propagate the error", async () => {
      const error = new Error("Test error")

      await expect(minimumLoadTime(Promise.reject(error), 50)).rejects.toThrow(
        "Test error",
      )
    })

    it("should propagate error even with minimum time not reached", async () => {
      const error = new Error("Quick error")

      await expect(
        minimumLoadTime(Promise.reject(error), 1000),
      ).rejects.toThrow("Quick error")
    })
  })

  describe("default parameters", () => {
    it("should use default minimum time of 5000ms when not specified", async () => {
      // We can't easily test this without waiting 5 seconds,
      // so we just verify the function signature works
      const quickPromise = Promise.resolve("test")

      // Start but don't await - just verify it doesn't throw
      const promise = minimumLoadTime(quickPromise)
      expect(promise).toBeInstanceOf(Promise)

      // Cancel by racing with a resolved promise
      const result = await Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve("cancelled"), 10)),
      ])

      // The race condition means we get "cancelled" since minimum time is 5000ms
      expect(result).toBe("cancelled")
    })
  })

  describe("edge cases", () => {
    it("should handle minimum time of 0", async () => {
      const startTime = Date.now()
      const result = await minimumLoadTime(Promise.resolve("instant"), 0)
      const elapsed = Date.now() - startTime

      expect(result).toBe("instant")
      expect(elapsed).toBeLessThan(50) // Should be nearly instant
    })

    it("should handle null values", async () => {
      const result = await minimumLoadTime(Promise.resolve(null), 50)
      expect(result).toBeNull()
    })

    it("should handle undefined values", async () => {
      const result = await minimumLoadTime(Promise.resolve(undefined), 50)
      expect(result).toBeUndefined()
    })

    it("should handle arrays", async () => {
      const data = [1, 2, 3]
      const result = await minimumLoadTime(Promise.resolve(data), 50)
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe("type safety", () => {
    it("should preserve number type", async () => {
      const result = await minimumLoadTime(Promise.resolve(42), 50)
      expect(typeof result).toBe("number")
      expect(result).toBe(42)
    })

    it("should preserve object type", async () => {
      type User = { id: number; name: string }
      const user: User = { id: 1, name: "Alice" }
      const result = await minimumLoadTime(Promise.resolve(user), 50)
      expect(result.id).toBe(1)
      expect(result.name).toBe("Alice")
    })
  })
})
