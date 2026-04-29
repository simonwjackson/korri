import { describe, expect, it } from "bun:test"
import {
  normalizeWhitespace,
  toCamelCase,
  transformCategoryName,
} from "./string-transformers"

describe("string-transformers", () => {
  describe("normalizeWhitespace", () => {
    it("removes extra spaces", () => {
      expect(normalizeWhitespace("hello  world")).toBe("helloworld")
    })

    it("removes periods and spaces", () => {
      expect(normalizeWhitespace("hello. world")).toBe("helloworld")
    })

    it("trims whitespace", () => {
      expect(normalizeWhitespace("  hello world  ")).toBe("helloworld")
    })

    it("handles multiple consecutive spaces and periods", () => {
      expect(normalizeWhitespace("hello...  world")).toBe("helloworld")
    })

    it("handles empty string", () => {
      expect(normalizeWhitespace("")).toBe("")
    })

    it("handles string with only spaces", () => {
      expect(normalizeWhitespace("   ")).toBe("")
    })
  })

  describe("toCamelCase", () => {
    it("converts first character to lowercase", () => {
      expect(toCamelCase("HelloWorld")).toBe("helloWorld")
    })

    it("handles all uppercase strings", () => {
      expect(toCamelCase("ADR")).toBe("adr")
      expect(toCamelCase("REVENUE")).toBe("revenue")
    })

    it("handles already camelCase strings", () => {
      expect(toCamelCase("helloWorld")).toBe("helloWorld")
    })

    it("handles single character", () => {
      expect(toCamelCase("A")).toBe("a")
      expect(toCamelCase("a")).toBe("a")
    })

    it("handles empty string", () => {
      expect(toCamelCase("")).toBe("")
    })
  })

  describe("transformCategoryName", () => {
    it("normalizes and converts to camelCase", () => {
      expect(transformCategoryName("Room Revenue")).toBe("roomRevenue")
    })

    it("handles periods in names", () => {
      expect(transformCategoryName("Room. Revenue")).toBe("roomRevenue")
    })

    it("handles all caps acronyms", () => {
      expect(transformCategoryName("ADR")).toBe("adr")
    })

    it("handles mixed spacing and periods", () => {
      expect(transformCategoryName("Room...  Revenue")).toBe("roomRevenue")
    })

    it("handles leading/trailing spaces", () => {
      expect(transformCategoryName("  Room Revenue  ")).toBe("roomRevenue")
    })

    it("handles empty string", () => {
      expect(transformCategoryName("")).toBe("")
    })

    it("handles PascalCase input", () => {
      expect(transformCategoryName("RoomRevenue")).toBe("roomRevenue")
    })

    it("handles complex real-world examples", () => {
      expect(transformCategoryName("F&B Revenue")).toBe("f&BRevenue")
      expect(transformCategoryName("Room Nights")).toBe("roomNights")
      expect(transformCategoryName("ADR Corporate")).toBe("aDRCorporate") // ADR stays as is after lowercase first char
    })
  })
})
