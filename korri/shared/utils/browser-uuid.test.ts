import { describe, expect, it } from "bun:test"
import { generatePrefixedId, generateUUID } from "./browser-uuid"

describe("browser-uuid", () => {
  describe("generateUUID", () => {
    it("should generate a string in timestamp-random format", () => {
      const uuid = generateUUID()

      // Should contain a hyphen
      expect(uuid).toContain("-")

      // Split into parts
      const [timestamp, random] = uuid.split("-")

      // Timestamp should be a valid number
      expect(Number.isNaN(Number(timestamp))).toBe(false)

      // Random part should exist and be alphanumeric
      expect(random).toBeDefined()
      expect(random.length).toBeGreaterThan(0)
      expect(/^[a-z0-9]+$/.test(random)).toBe(true)
    })

    it("should generate unique IDs on consecutive calls", () => {
      const uuid1 = generateUUID()
      const uuid2 = generateUUID()
      const uuid3 = generateUUID()

      expect(uuid1).not.toBe(uuid2)
      expect(uuid2).not.toBe(uuid3)
      expect(uuid1).not.toBe(uuid3)
    })

    it("should generate IDs with timestamp close to current time", () => {
      const before = Date.now()
      const uuid = generateUUID()
      const after = Date.now()

      const timestamp = Number(uuid.split("-")[0])

      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe("generatePrefixedId", () => {
    it("should generate a prefixed ID when prefix is provided", () => {
      const id = generatePrefixedId("user")

      expect(id).toMatch(/^user-\d+-[a-z0-9]+$/)
    })

    it("should generate ID without prefix when prefix is undefined", () => {
      const id = generatePrefixedId()

      // Should be same format as generateUUID (no prefix)
      expect(id).toMatch(/^\d+-[a-z0-9]+$/)
      expect(id.split("-").length).toBe(2)
    })

    it("should generate ID without prefix when prefix is empty string", () => {
      const id = generatePrefixedId("")

      // Empty string is falsy, so no prefix
      expect(id).toMatch(/^\d+-[a-z0-9]+$/)
    })

    it("should handle different prefixes", () => {
      const userId = generatePrefixedId("user")
      const sessionId = generatePrefixedId("session")
      const tempId = generatePrefixedId("temp")

      expect(userId).toMatch(/^user-/)
      expect(sessionId).toMatch(/^session-/)
      expect(tempId).toMatch(/^temp-/)
    })

    it("should generate unique IDs even with same prefix", () => {
      const id1 = generatePrefixedId("user")
      const id2 = generatePrefixedId("user")
      const id3 = generatePrefixedId("user")

      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })
  })
})
