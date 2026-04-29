import { Array as EffectArray } from "effect"

/**
 * Checks if any value in an array is false
 * @param values Array of boolean values
 * @returns true if any value is false, false otherwise
 * @example
 * anyFalse([true, false, true]) // true
 * anyFalse([true, true, true]) // false
 */
export const anyFalse = (values: readonly boolean[]): boolean =>
  EffectArray.contains(values, false)

/**
 * Checks if all values in an array are false
 * @param values Array of boolean values
 * @returns true if all values are false, false otherwise
 * @example
 * allFalse([false, false, false]) // true
 * allFalse([false, true, false]) // false
 */
export const allFalse = (values: readonly boolean[]): boolean =>
  EffectArray.every(values, x => x === false)

/**
 * Checks if none of the values in an array are false
 * @param values Array of boolean values
 * @returns true if no values are false, false otherwise
 * @example
 * noneFalse([true, true, true]) // true
 * noneFalse([true, false, true]) // false
 */
export const noneFalse = (values: readonly boolean[]): boolean =>
  !EffectArray.contains(values, false)

/**
 * Checks if any value in an array is true
 * @param values Array of boolean values
 * @returns true if any value is true, false otherwise
 * @example
 * anyTrue([false, true, false]) // true
 * anyTrue([false, false, false]) // false
 */
export const anyTrue = (values: readonly boolean[]): boolean =>
  EffectArray.contains(values, true)

/**
 * Checks if all values in an array are true
 * @param values Array of boolean values
 * @returns true if all values are true, false otherwise
 * @example
 * allTrue([true, true, true]) // true
 * allTrue([true, false, true]) // false
 */
export const allTrue = (values: readonly boolean[]): boolean =>
  EffectArray.every(values, x => x === true)

/**
 * Checks if none of the values in an array are true
 * @param values Array of boolean values
 * @returns true if no values are true, false otherwise
 * @example
 * noneTrue([false, false, false]) // true
 * noneTrue([false, true, false]) // false
 */
export const noneTrue = (values: readonly boolean[]): boolean =>
  !EffectArray.contains(values, true)

/**
 * Checks if any value in an array is nullish (null or undefined)
 * @param values Array of values to check
 * @returns true if any value is null or undefined, false otherwise
 * @example
 * anyNullish([1, null, 3]) // true
 * anyNullish([1, undefined, 3]) // true
 * anyNullish([1, 2, 3]) // false
 */
export const anyNullish = <T>(values: readonly T[]): boolean =>
  EffectArray.some(values, x => x === null || x === undefined)

/**
 * Checks if any value in an array is falsy
 * @param values Array of values to check
 * @returns true if any value is falsy, false otherwise
 * @example
 * anyFalsy([1, 0, 3]) // true
 * anyFalsy(["hello", "", "world"]) // true
 * anyFalsy([true, false, true]) // true
 * anyFalsy([1, "hello", true]) // false
 */
export const anyFalsy = <T>(values: readonly T[]): boolean =>
  EffectArray.some(values, x => !x)

/**
 * Checks if all values in an array are nullish (null or undefined)
 * @param values Array of values to check
 * @returns true if all values are null or undefined, false otherwise
 * @example
 * allNullish([null, undefined, null]) // true
 * allNullish([null, 2, undefined]) // false
 */
export const allNullish = <T>(values: readonly T[]): boolean =>
  EffectArray.every(values, x => x === null || x === undefined)

/**
 * Checks if all values in an array are truthy
 * @param values Array of values to check
 * @returns true if all values are truthy, false otherwise
 * @example
 * allTruthy([1, "hello", true]) // true
 * allTruthy([1, "", true]) // false
 */
export const allTruthy = <T>(values: readonly T[]): boolean =>
  EffectArray.every(values, x => !!x)

/**
 * Type guard that checks if all values are defined (non-nullish)
 * @param values Array of possibly nullish values
 * @returns Type predicate indicating all values are defined
 * @example
 * const values: [string | null, number | undefined] = ["hello", 42]
 * if (allDefined(values)) {
 *   // values is now [string, number]
 * }
 */
export function allDefined<T>(
  values: readonly (T | null | undefined)[],
): values is readonly T[] {
  return EffectArray.every(values, x => x !== null && x !== undefined)
}

/**
 * Type guard that checks if none of the values are falsy
 * When this returns true, TypeScript knows all values are truthy
 * @param values Tuple of possibly falsy values
 * @returns Type predicate indicating all values are truthy
 * @example
 * const strategy: string | null = getStrategy()
 * const id: number | undefined = getId()
 * if (noneFalsy([strategy, id] as const)) {
 *   // strategy is string, id is number
 * }
 */
export function noneFalsy<T extends readonly unknown[]>(
  values: T,
): values is {
  [K in keyof T]: Exclude<T[K], null | undefined | false | 0 | "">
} {
  return !anyFalsy(values)
}
