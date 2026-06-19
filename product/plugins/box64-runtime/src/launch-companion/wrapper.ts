import type { LaunchSpec } from "@platform/library/launcher"
import type { Box64Policy } from "./policy"
import { normalizeBox64Policy } from "./policy"

export function composeBox64LaunchSpec(
  spec: LaunchSpec,
  policy: Box64Policy,
): LaunchSpec {
  if (policy.enable === false) return spec

  const normalized = normalizeBox64Policy(policy)
  const env: Record<string, string> = { ...(spec.env ?? {}) }
  const gameLibraryPath = normalized.gameLibraryPath ?? gameLibraryPathFromCwd(spec.cwd)

  setBoolean(env, "BOX64_UNITY", normalized.unityMode)
  setDynarecValue(env, "BOX64_DYNAREC_STRONGMEM", normalized.strongMem)
  setDynarecValue(env, "BOX64_DYNAREC_BIGBLOCK", normalized.bigBlock)
  setNumber(env, "BOX64_DYNAREC_SAFEFLAGS", normalized.safeFlags)
  setBoolean(env, "BOX64_DYNAREC_FASTNAN", normalized.fastNan)
  setBoolean(env, "BOX64_DYNAREC_FASTROUND", normalized.fastRound)
  setBoolean(env, "BOX64_DYNAREC_NATIVEFLAGS", normalized.nativeFlags)
  setBoolean(env, "BOX64_DYNAREC_X87DOUBLE", normalized.x87Double)
  setBoolean(env, "BOX64_SYNC_ROUNDING", normalized.syncRounding)
  setNumber(env, "BOX64_MAXCPU", normalized.maxCpu)
  setBoolean(env, "BOX64_PREFER_EMULATED", normalized.preferEmulated)
  setIfPresent(env, "SDL_VIDEODRIVER", normalized.sdlVideoDriver)
  setIfPresent(env, "BOX64_LD_LIBRARY_PATH", gameLibraryPath)
  setIfPresent(env, "LD_LIBRARY_PATH", mergePath(normalized.nativeLibraryPath, spec.env?.LD_LIBRARY_PATH))

  return {
    command: normalized.command ?? "box64",
    args: [spec.command, ...spec.args],
    ...(Object.keys(env).length > 0 ? { env } : {}),
    ...(spec.envUnset ? { envUnset: spec.envUnset } : {}),
    ...(spec.cwd ? { cwd: spec.cwd } : {}),
  }
}

function gameLibraryPathFromCwd(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined
  return [cwd, `${cwd}/lib`, `${cwd}/lib64`, `${cwd}/MonoBleedingEdge/x86_64`].join(":")
}

function setIfPresent(env: Record<string, string>, key: string, value: string | undefined) {
  if (value !== undefined) env[key] = value
}

function setBoolean(env: Record<string, string>, key: string, value: boolean | undefined) {
  if (value !== undefined) env[key] = value ? "1" : "0"
}

function setNumber(env: Record<string, string>, key: string, value: number | undefined) {
  if (value !== undefined) env[key] = String(value)
}

function setDynarecValue(
  env: Record<string, string>,
  key: string,
  value: boolean | number | undefined,
) {
  if (value === undefined) return
  env[key] = typeof value === "boolean" ? (value ? "1" : "0") : String(value)
}

function mergePath(prefix: string | undefined, existing: string | undefined) {
  if (prefix === undefined) return existing
  if (existing === undefined || existing.length === 0) return prefix
  return `${prefix}:${existing}`
}
