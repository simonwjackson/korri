import type { ProviderId } from "./index"

export const isProviderId = (value: string): value is ProviderId =>
  value.startsWith("@") && value.includes(":")
