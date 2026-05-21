import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { korriConfigPath, type XdgPathEnv } from "@shared/config/xdg-paths"
import { logger } from "@shared/logger"
import { parse, stringify } from "yaml"

/**
 * Subset of process.env required to resolve `~/.config/korri/desktop.yaml`.
 */
export type DesktopConfigEnv = XdgPathEnv

export interface LastConnectedServer {
  readonly hostId: string
  readonly controlUrl: string
}

/**
 * Schema of `desktop.yaml`. Unknown keys are preserved on read and saved
 * back verbatim so federation-related fields added later remain compatible
 * with older desktop builds.
 */
export interface DesktopConfig {
  readonly lastConnectedServer?: LastConnectedServer
  readonly [extension: string]: unknown
}

const CONFIG_FILENAME = "desktop.yaml"

export function desktopConfigPath(env: DesktopConfigEnv = process.env): string {
  return korriConfigPath(env, CONFIG_FILENAME)
}

export async function loadDesktopConfig(
  env: DesktopConfigEnv = process.env,
): Promise<DesktopConfig> {
  const path = desktopConfigPath(env)
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    logger.warn({ err: error, path }, "desktop-config: failed to read")
    return {}
  }
  if (raw.trim().length === 0) return {}
  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (error) {
    logger.warn({ err: error, path }, "desktop-config: corrupt YAML, ignoring")
    return {}
  }
  if (!isPlainObject(parsed)) return {}
  return normalizeConfig(parsed)
}

export async function saveDesktopConfig(
  env: DesktopConfigEnv,
  partial: Partial<DesktopConfig>,
): Promise<void> {
  const path = desktopConfigPath(env)
  const existing = await loadDesktopConfigRaw(path)
  const merged: Record<string, unknown> = { ...existing }
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  const serialized = stringify(merged)
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`
  await writeFile(tmp, serialized, "utf8")
  await rename(tmp, path)
}

async function loadDesktopConfigRaw(
  path: string,
): Promise<Record<string, unknown>> {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    return {}
  }
  if (raw.trim().length === 0) return {}
  try {
    const parsed = parse(raw)
    if (isPlainObject(parsed)) return { ...parsed }
  } catch {
    /* fall through to {} */
  }
  return {}
}

function normalizeConfig(input: Record<string, unknown>): DesktopConfig {
  const out: Record<string, unknown> = { ...input }
  const last = input.lastConnectedServer
  if (isPlainObject(last)) {
    const hostId = last.hostId
    const controlUrl = last.controlUrl
    if (typeof hostId === "string" && typeof controlUrl === "string") {
      out.lastConnectedServer = { hostId, controlUrl }
    } else {
      delete out.lastConnectedServer
    }
  } else if (last !== undefined) {
    delete out.lastConnectedServer
  }
  return out as DesktopConfig
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

export { CONFIG_FILENAME as DESKTOP_CONFIG_FILENAME }
