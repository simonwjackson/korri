import { readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Discover Sway's IPC socket from XDG_RUNTIME_DIR. Korri sessiond is a
 * sibling of the compositor unit, so it usually cannot rely on SWAYSOCK
 * being inherited directly from the Sway process tree.
 */
export function discoverSwaySocketEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  if (env.SWAYSOCK) return { SWAYSOCK: env.SWAYSOCK }
  const runtimeDir = env.XDG_RUNTIME_DIR
  if (!runtimeDir) return {}
  try {
    const entry = readdirSync(runtimeDir).find(
      name => name.startsWith("sway-ipc.") && name.endsWith(".sock"),
    )
    return entry ? { SWAYSOCK: join(runtimeDir, entry) } : {}
  } catch {
    return {}
  }
}

export function discoverSwaySocketPath(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return discoverSwaySocketEnv(env).SWAYSOCK
}
