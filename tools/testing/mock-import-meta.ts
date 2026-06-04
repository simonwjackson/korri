/**
 * Mock import.meta.glob for Bun test environment.
 * This must be loaded before any modules that use import.meta.glob.
 * Compile-time typing is provided separately by tools/types/vite-import-meta.d.ts.
 */

// Mock import.meta.glob to return empty object
// This prevents errors when react-query client tries to use Vite's glob feature
const globMock = () => ({})

import { logger } from "@platform/logger"

try {
  if (typeof import.meta.glob === "undefined") {
    Object.defineProperty(import.meta, "glob", {
      value: globMock,
      writable: true,
    })
    logger.info("[Test Setup] import.meta.glob mocked successfully")
  } else {
    logger.info("[Test Setup] import.meta.glob already exists")
  }
} catch (error) {
  logger.error({ err: error }, "[Test Setup] Failed to mock import.meta.glob")
  // Try alternative approach - define on globalThis
  // @ts-expect-error
  if (!globalThis.importMetaGlob) {
    // @ts-expect-error
    globalThis.importMetaGlob = globMock
  }
}

// Also verify
logger.info(
  { type: typeof import.meta.glob },
  "[Test Setup] import.meta.glob type",
)
