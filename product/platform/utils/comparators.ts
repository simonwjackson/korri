/**
 * Compare nullable strings with null-first ordering.
 *
 * Nulls are considered "less than" any string value, ensuring consistent
 * sort behavior when dealing with optional string fields.
 *
 * @param a - First string to compare, or null
 * @param b - Second string to compare, or null
 * @returns Negative if a < b, positive if a > b, 0 if equal
 *
 * @example
 * ```typescript
 * const names = ['Bob', null, 'Alice', null]
 * names.sort(compareNullable) // [null, null, 'Alice', 'Bob']
 * ```
 */
export const compareNullable = (a: string | null, b: string | null): number => {
  if (a === null && b === null) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a.localeCompare(b)
}

/**
 * Generic null-safe comparator factory for any comparable type.
 *
 * Creates a comparator that handles null values with null-first ordering,
 * delegating to the provided comparator for non-null values.
 *
 * @param comparator - Comparison function for non-null values
 * @returns A comparator function that handles null values
 *
 * @example
 * ```typescript
 * const compareNumbers = compareNullableWith<number>((a, b) => a - b)
 * const values = [3, null, 1, null, 2]
 * values.sort(compareNumbers) // [null, null, 1, 2, 3]
 * ```
 */
export const compareNullableWith =
  <T>(comparator: (a: T, b: T) => number) =>
  (a: T | null, b: T | null): number => {
    if (a === null && b === null) return 0
    if (a === null) return -1
    if (b === null) return 1
    return comparator(a, b)
  }

/**
 * Compose multiple comparators into a single comparator with fallback ordering.
 *
 * Compares using each comparator in sequence, short-circuiting on the first
 * non-zero result. Useful for multi-field sorting (e.g., sort by name, then by date).
 *
 * @param comparators - Comparator functions to apply in priority order
 * @returns A composed comparator that applies all comparators in sequence
 *
 * @example
 * ```typescript
 * type Person = { name: string; age: number }
 * const byNameThenAge = composeComparators<Person>(
 *   (a, b) => a.name.localeCompare(b.name),
 *   (a, b) => a.age - b.age
 * )
 * people.sort(byNameThenAge)
 * ```
 */
export const composeComparators =
  <T>(...comparators: ((a: T, b: T) => number)[]) =>
  (a: T, b: T): number => {
    for (const comparator of comparators) {
      const result = comparator(a, b)
      if (result !== 0) return result
    }
    return 0
  }
