import { join } from "node:path"

export type XdgPathEnv = Readonly<Record<string, string | undefined>>

export function xdgDataHome(env: XdgPathEnv = process.env): string | undefined {
  return optionalPath(env.XDG_DATA_HOME) ?? homePath(env, ".local", "share")
}

export function xdgStateHome(
  env: XdgPathEnv = process.env,
): string | undefined {
  return optionalPath(env.XDG_STATE_HOME) ?? homePath(env, ".local", "state")
}

export function xdgConfigHome(
  env: XdgPathEnv = process.env,
): string | undefined {
  return optionalPath(env.XDG_CONFIG_HOME) ?? homePath(env, ".config")
}

export function xdgCacheHome(
  env: XdgPathEnv = process.env,
): string | undefined {
  return optionalPath(env.XDG_CACHE_HOME) ?? homePath(env, ".cache")
}

export function xdgRuntimeDir(
  env: XdgPathEnv = process.env,
): string | undefined {
  return optionalPath(env.XDG_RUNTIME_DIR)
}

export function requireXdgDataHome(env: XdgPathEnv = process.env): string {
  return requirePath(xdgDataHome(env), "XDG_DATA_HOME or HOME is required")
}

export function requireXdgStateHome(env: XdgPathEnv = process.env): string {
  return requirePath(xdgStateHome(env), "XDG_STATE_HOME or HOME is required")
}

export function requireXdgConfigHome(env: XdgPathEnv = process.env): string {
  return requirePath(xdgConfigHome(env), "XDG_CONFIG_HOME or HOME is required")
}

export function requireXdgCacheHome(env: XdgPathEnv = process.env): string {
  return requirePath(xdgCacheHome(env), "XDG_CACHE_HOME or HOME is required")
}

export function korriDataPath(
  env: XdgPathEnv,
  ...segments: readonly string[]
): string {
  return join(requireXdgDataHome(env), "korri", ...segments)
}

export function korriStatePath(
  env: XdgPathEnv,
  ...segments: readonly string[]
): string {
  return join(requireXdgStateHome(env), "korri", ...segments)
}

export function korriCachePath(
  env: XdgPathEnv,
  ...segments: readonly string[]
): string {
  return join(requireXdgCacheHome(env), "korri", ...segments)
}

export function korriConfigPath(
  env: XdgPathEnv,
  ...segments: readonly string[]
): string {
  return join(requireXdgConfigHome(env), "korri", ...segments)
}

function optionalPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function homePath(
  env: XdgPathEnv,
  ...segments: readonly string[]
): string | undefined {
  const home = optionalPath(env.HOME)
  return home ? join(home, ...segments) : undefined
}

function requirePath(value: string | undefined, message: string): string {
  if (value) return value
  throw new Error(message)
}
