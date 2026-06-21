import type { LaunchSpec } from "@platform/library/launcher"
import type { TurnipPolicy } from "./policy"
import { normalizeTurnipPolicy } from "./policy"

export function composeTurnipLaunchSpec(
  spec: LaunchSpec,
  policy: TurnipPolicy,
): LaunchSpec {
  if (policy.enable === false) return spec

  const normalized = normalizeTurnipPolicy(policy)
  const env: Record<string, string> = { ...(spec.env ?? {}) }

  setIfPresent(env, "VK_ICD_FILENAMES", normalized.icdPath)
  setIfPresent(env, "VK_DRIVER_FILES", normalized.driverFiles)
  setIfPresent(env, "LIBGL_DRIVERS_PATH", normalized.glDriversPath)
  setIfPresent(
    env,
    "__EGL_VENDOR_LIBRARY_DIRS",
    normalized.eglVendorLibraryDirs,
  )
  setIfPresent(
    env,
    "LD_LIBRARY_PATH",
    mergePath(normalized.ldLibraryPath, spec.env?.LD_LIBRARY_PATH),
  )

  return {
    ...spec,
    ...(Object.keys(env).length > 0 ? { env } : {}),
  }
}

function setIfPresent(
  env: Record<string, string>,
  key: string,
  value: string | undefined,
) {
  if (value !== undefined) env[key] = value
}

function mergePath(prefix: string | undefined, existing: string | undefined) {
  if (prefix === undefined) return existing
  if (existing === undefined || existing.length === 0) return prefix
  return `${prefix}:${existing}`
}
