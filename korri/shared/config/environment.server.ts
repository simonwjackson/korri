export type Environment = "local" | "development" | "production"

let cachedEnvironment: Environment | null = null

export function getEnvironment(): Environment {
  if (cachedEnvironment) return cachedEnvironment

  if (typeof window !== "undefined" && window.location?.hostname) {
    const hostname = window.location.hostname
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      cachedEnvironment = "local"
      return cachedEnvironment
    }
  }

  const nodeEnv =
    typeof process !== "undefined" && process.env
      ? process.env.NODE_ENV
      : undefined

  if (nodeEnv === "development" || nodeEnv === "test") {
    cachedEnvironment = "local"
    return cachedEnvironment
  }

  cachedEnvironment = "production"
  return cachedEnvironment
}

export function isLocal(): boolean {
  return getEnvironment() === "local"
}

export function isDevelopment(): boolean {
  return getEnvironment() === "development"
}

export function isProduction(): boolean {
  return getEnvironment() === "production"
}

export function clearEnvironmentCache(): void {
  cachedEnvironment = null
}
