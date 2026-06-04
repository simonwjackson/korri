/**
 * Ensures a loader takes at least a minimum amount of time to complete.
 * This provides a consistent loading experience and prevents jarring quick flashes.
 *
 * @param promise - The async operation to await
 * @param minimumMs - Minimum time in milliseconds (default: 5000ms)
 * @returns Promise that resolves after both the operation and minimum time complete
 *
 * @example
 * export const Route = createFileRoute('/path')({
 *   loader: async () => {
 *     return minimumLoadTime(fetchData(), 5000)
 *   }
 * })
 */
export async function minimumLoadTime<T>(
  promise: Promise<T>,
  minimumMs = 5000,
): Promise<T> {
  const startTime = Date.now()

  // Wait for the actual operation to complete
  const result = await promise

  // Calculate remaining time
  const elapsed = Date.now() - startTime
  const remaining = minimumMs - elapsed

  // If we haven't reached minimum time, wait the remaining duration
  if (remaining > 0) {
    await new Promise(resolve => setTimeout(resolve, remaining))
  }

  return result
}
