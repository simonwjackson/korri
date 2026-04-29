/**
 * Browser-safe UUID generation utility
 *
 * Provides a consistent way to generate unique identifiers that works
 * in all browser environments without relying on crypto.randomUUID()
 * which may have compatibility or bundling issues.
 */

/**
 * Generate a browser-safe unique identifier
 *
 * Format: timestamp-random
 * Example: "17234567890-a1b2c3d4e"
 *
 * This approach ensures:
 * - Uniqueness through timestamp + random components
 * - Browser compatibility (no crypto API required)
 * - Works in production builds after minification
 *
 * @returns A unique identifier string
 */
export function generateUUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Generate a prefixed unique identifier
 *
 * @param prefix - Optional prefix for the ID
 * @returns A prefixed unique identifier string
 *
 * @example
 * generatePrefixedId('user') // "user-17234567890-a1b2c3d4e"
 */
export function generatePrefixedId(prefix?: string): string {
  const id = generateUUID()
  return prefix ? `${prefix}-${id}` : id
}
