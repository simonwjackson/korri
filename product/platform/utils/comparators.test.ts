import { describe, expect, it } from "bun:test"
import {
  compareNullable,
  compareNullableWith,
  composeComparators,
} from "./comparators"

describe("comparators", () => {
  describe("compareNullable", () => {
    it("returns 0 when both are null", () => {
      expect(compareNullable(null, null)).toBe(0)
    })

    it("returns -1 when first is null", () => {
      expect(compareNullable(null, "a")).toBe(-1)
    })

    it("returns 1 when second is null", () => {
      expect(compareNullable("a", null)).toBe(1)
    })

    it("uses localeCompare for non-null strings", () => {
      expect(compareNullable("a", "b")).toBeLessThan(0)
      expect(compareNullable("b", "a")).toBeGreaterThan(0)
      expect(compareNullable("a", "a")).toBe(0)
    })

    it("handles case-sensitive comparison", () => {
      expect(compareNullable("A", "a")).not.toBe(0)
    })

    it("handles special characters", () => {
      expect(compareNullable("a1", "a2")).toBeLessThan(0)
      expect(compareNullable("a-1", "a-2")).toBeLessThan(0)
    })

    it("handles empty strings", () => {
      expect(compareNullable("", "a")).toBeLessThan(0)
      expect(compareNullable("a", "")).toBeGreaterThan(0)
      expect(compareNullable("", "")).toBe(0)
    })

    it("sorts arrays correctly with null-first ordering", () => {
      const names = ["Bob", null, "Alice", null, "Charlie"]
      const sorted = [...names].sort(compareNullable)
      expect(sorted).toEqual([null, null, "Alice", "Bob", "Charlie"])
    })

    it("handles unicode characters", () => {
      expect(compareNullable("cafe", "café")).toBeLessThan(0)
    })

    it("handles numbers as strings", () => {
      expect(compareNullable("10", "2")).toBeLessThan(0) // "10" < "2" lexicographically
      expect(compareNullable("2", "10")).toBeGreaterThan(0)
    })
  })

  describe("compareNullableWith", () => {
    const numberComparator = (a: number, b: number) => a - b

    it("returns 0 when both are null", () => {
      const compare = compareNullableWith(numberComparator)
      expect(compare(null, null)).toBe(0)
    })

    it("returns -1 when first is null", () => {
      const compare = compareNullableWith(numberComparator)
      expect(compare(null, 5)).toBe(-1)
    })

    it("returns 1 when second is null", () => {
      const compare = compareNullableWith(numberComparator)
      expect(compare(5, null)).toBe(1)
    })

    it("uses provided comparator for non-null values", () => {
      const compare = compareNullableWith(numberComparator)
      expect(compare(1, 2)).toBe(-1)
      expect(compare(2, 1)).toBe(1)
      expect(compare(1, 1)).toBe(0)
    })

    it("works with custom object comparator", () => {
      type Item = {
        priority: number
        name: string
      }

      const itemComparator = (a: Item, b: Item) => a.priority - b.priority
      const compare = compareNullableWith(itemComparator)

      const item1 = { priority: 1, name: "first" }
      const item2 = { priority: 2, name: "second" }

      expect(compare(item1, item2)).toBe(-1)
      expect(compare(item2, item1)).toBe(1)
      expect(compare(item1, item1)).toBe(0)
      expect(compare(null, item1)).toBe(-1)
      expect(compare(item1, null)).toBe(1)
    })

    it("sorts arrays with null values correctly", () => {
      const compare = compareNullableWith(numberComparator)
      const values: (number | null)[] = [3, null, 1, null, 2]
      const sorted = [...values].sort(compare)
      expect(sorted).toEqual([null, null, 1, 2, 3])
    })

    it("works with date comparator", () => {
      const dateComparator = (a: Date, b: Date) => a.getTime() - b.getTime()
      const compare = compareNullableWith(dateComparator)

      const date1 = new Date("2023-01-01")
      const date2 = new Date("2023-12-31")

      expect(compare(date1, date2)).toBeLessThan(0)
      expect(compare(date2, date1)).toBeGreaterThan(0)
      expect(compare(null, date1)).toBe(-1)
    })

    it("works with string length comparator", () => {
      const lengthComparator = (a: string, b: string) => a.length - b.length
      const compare = compareNullableWith(lengthComparator)

      expect(compare("a", "abc")).toBeLessThan(0)
      expect(compare("abc", "a")).toBeGreaterThan(0)
      expect(compare("ab", "cd")).toBe(0) // Same length
    })
  })

  describe("composeComparators", () => {
    type Person = {
      name: string
      age: number
      city: string
    }

    const byName = (a: Person, b: Person) => a.name.localeCompare(b.name)
    const byAge = (a: Person, b: Person) => a.age - b.age
    const byCity = (a: Person, b: Person) => a.city.localeCompare(b.city)

    it("returns 0 when all comparators return 0", () => {
      const compare = composeComparators(byName, byAge, byCity)
      const person1 = { name: "Alice", age: 30, city: "NYC" }
      const person2 = { name: "Alice", age: 30, city: "NYC" }

      expect(compare(person1, person2)).toBe(0)
    })

    it("uses first comparator when it returns non-zero", () => {
      const compare = composeComparators(byName, byAge, byCity)
      const person1 = { name: "Alice", age: 30, city: "NYC" }
      const person2 = { name: "Bob", age: 25, city: "LA" }

      expect(compare(person1, person2)).toBeLessThan(0)
    })

    it("falls through to second comparator when first returns 0", () => {
      const compare = composeComparators(byName, byAge, byCity)
      const person1 = { name: "Alice", age: 30, city: "NYC" }
      const person2 = { name: "Alice", age: 25, city: "LA" }

      expect(compare(person1, person2)).toBe(5) // 30 - 25
    })

    it("falls through to third comparator when first two return 0", () => {
      const compare = composeComparators(byName, byAge, byCity)
      const person1 = { name: "Alice", age: 30, city: "NYC" }
      const person2 = { name: "Alice", age: 30, city: "LA" }

      expect(compare(person1, person2)).toBeGreaterThan(0) // NYC > LA
    })

    it("works with single comparator", () => {
      const compare = composeComparators(byAge)
      const person1 = { name: "Alice", age: 30, city: "NYC" }
      const person2 = { name: "Bob", age: 25, city: "LA" }

      expect(compare(person1, person2)).toBe(5)
    })

    it("returns 0 with no comparators", () => {
      const compare = composeComparators<Person>()
      const person1 = { name: "Alice", age: 30, city: "NYC" }
      const person2 = { name: "Bob", age: 25, city: "LA" }

      expect(compare(person1, person2)).toBe(0)
    })

    it("correctly sorts an array of objects", () => {
      const compare = composeComparators(byName, byAge)
      const people: Person[] = [
        { name: "Bob", age: 30, city: "NYC" },
        { name: "Alice", age: 25, city: "LA" },
        { name: "Alice", age: 20, city: "SF" },
        { name: "Charlie", age: 35, city: "Chicago" },
      ]

      const sorted = [...people].sort(compare)

      expect(sorted[0].name).toBe("Alice")
      expect(sorted[0].age).toBe(20)
      expect(sorted[1].name).toBe("Alice")
      expect(sorted[1].age).toBe(25)
      expect(sorted[2].name).toBe("Bob")
      expect(sorted[3].name).toBe("Charlie")
    })

    it("works with negative comparison results", () => {
      const reverseByAge = (a: Person, b: Person) => b.age - a.age
      const compare = composeComparators(byName, reverseByAge)

      const person1 = { name: "Alice", age: 20, city: "NYC" }
      const person2 = { name: "Alice", age: 30, city: "LA" }

      expect(compare(person1, person2)).toBeGreaterThan(0) // 30 - 20 = 10
    })

    it("short-circuits on first non-zero result", () => {
      let secondCalled = false
      const first = () => 1
      const second = () => {
        secondCalled = true
        return 0
      }

      const compare = composeComparators<Person>(first, second)
      const person = { name: "Test", age: 0, city: "Test" }

      compare(person, person)

      expect(secondCalled).toBe(false)
    })
  })
})
