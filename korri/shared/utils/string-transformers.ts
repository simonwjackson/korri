import { flow } from "effect"

/**
 * Normalize whitespace by removing all spaces and periods from a string.
 *
 * Useful for preparing strings for identifier conversion where whitespace
 * and punctuation should be eliminated.
 *
 * @param str - The input string to normalize
 * @returns String with all whitespace and periods removed
 *
 * @example
 * ```typescript
 * normalizeWhitespace('Hello World')     // 'HelloWorld'
 * normalizeWhitespace('S.C. Management') // 'SCManagement'
 * normalizeWhitespace('  spaced  out  ') // 'spacedout'
 * ```
 */
export const normalizeWhitespace = (str: string): string =>
  str
    .replace(/[.\s]+/g, " ")
    .trim()
    .replace(/\s+/g, "")

/**
 * Convert a string to camelCase by lowercasing the first character.
 *
 * Handles all-caps strings specially by lowercasing the entire string,
 * preventing awkward results like "ADR" becoming "aDR".
 *
 * @param str - The input string (typically PascalCase or UPPERCASE)
 * @returns camelCase version of the string
 *
 * @example
 * ```typescript
 * toCamelCase('HelloWorld')  // 'helloWorld'
 * toCamelCase('ADR')         // 'adr'
 * toCamelCase('already')     // 'already'
 * toCamelCase('')            // ''
 * ```
 */
export const toCamelCase = (str: string): string => {
  if (!str) return ""
  if (str === str.toUpperCase()) return str.toLowerCase()
  return str.charAt(0).toLowerCase() + str.slice(1)
}

/**
 * Transform a category or subcategory name to camelCase identifier format.
 *
 * Combines whitespace normalization and camelCase conversion to produce
 * clean identifiers from human-readable category names. Handles spaces,
 * periods, PascalCase, and all-caps acronyms.
 *
 * @param str - The category name to transform
 * @returns camelCase identifier suitable for object keys or API parameters
 *
 * @example
 * ```typescript
 * transformCategoryName('Total Revenue')    // 'totalRevenue'
 * transformCategoryName('S.C. Contribution') // 'sCContribution'
 * transformCategoryName('ADR')               // 'adr'
 * ```
 */
export const transformCategoryName = flow(normalizeWhitespace, toCamelCase)
