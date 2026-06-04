/**
 * Pure parser for ROCKNIX `es_systems.cfg`.
 *
 * Returns one record per `<system>` block, including the raw `<command>`
 * template (with `%ROM%` / `%SYSTEM%` / `%CORE%` / `%EMULATOR%` /
 * `%CONTROLLERSCONFIG%` placeholders intact) and the resolved default
 * emulator + core extracted from the nested `<emulators>` structure.
 *
 * Default-resolution rules — derived from real ROCKNIX layouts on the
 * live ROCKNIX device (probed live):
 *   - The default core is the `<core>` carrying `default="true"`.
 *   - The default emulator is the `<emulator>` that contains that default
 *     core. Falls back to the first emulator and its first core when no
 *     `default="true"` is marked.
 *   - When no `<emulators>` block exists at all, both fields are
 *     `undefined`. Callers either supply their own resolution or skip the
 *     system.
 *
 * See docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md (Unit 2).
 */

import { logger } from "@platform/logger/logger"

export type EsSystem = {
  readonly name: string
  readonly fullname?: string
  readonly path: string
  readonly extensions: readonly string[]
  readonly commandTemplate: string
  readonly defaultEmulator?: string
  readonly defaultCore?: string
}

export function parseEsSystems(xml: string): readonly EsSystem[] {
  if (!xml || typeof xml !== "string") return []

  const blocks = extractBlocks(xml, "system")
  if (blocks.length === 0) return []

  const out: EsSystem[] = []
  for (const block of blocks) {
    const sys = parseSystemBlock(block)
    if (sys) out.push(sys)
  }
  return out
}

function parseSystemBlock(block: string): EsSystem | undefined {
  const name = extractText(block, "name")
  const path = extractText(block, "path")
  const commandTemplate = extractText(block, "command")
  if (!name || !path || !commandTemplate) {
    logger.warn(
      {
        hasName: Boolean(name),
        hasPath: Boolean(path),
        hasCommand: Boolean(commandTemplate),
      },
      "rocknix.es-systems: skipping system missing required fields",
    )
    return undefined
  }

  const extensions = parseExtensions(extractText(block, "extension"))
  const defaults = resolveDefaults(extractEmulatorsBlock(block))

  return stripUndefined({
    name,
    fullname: extractText(block, "fullname"),
    path,
    extensions,
    commandTemplate,
    defaultEmulator: defaults.emulator,
    defaultCore: defaults.core,
  })
}

function parseExtensions(raw: string | undefined): readonly string[] {
  if (!raw) return []
  return raw
    .split(/\s+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0)
}

/**
 * Pull the inner content of `<emulators>...</emulators>`, or `undefined`
 * when the system has no emulators block (e.g., a direct shell script).
 */
function extractEmulatorsBlock(systemBlock: string): string | undefined {
  const m = systemBlock.match(/<emulators\b[^>]*>([\s\S]*?)<\/emulators>/i)
  return m?.[1]
}

function resolveDefaults(emulatorsBlock: string | undefined): {
  emulator?: string
  core?: string
} {
  if (!emulatorsBlock) return {}

  const emulators = extractEmulators(emulatorsBlock)
  if (emulators.length === 0) return {}

  // Look for an explicit `default="true"` core anywhere in the list.
  for (const emu of emulators) {
    const explicit = emu.cores.find(c => c.isDefault)
    if (explicit) {
      return { emulator: emu.name, core: explicit.name }
    }
  }

  // Fallback: first emulator's first core.
  const first = emulators[0]
  if (!first) return {}
  return { emulator: first.name, core: first.cores[0]?.name }
}

type EmulatorBlock = {
  name: string
  cores: ReadonlyArray<{ name: string; isDefault: boolean }>
}

function extractEmulators(emulatorsBlock: string): readonly EmulatorBlock[] {
  const re = /<emulator\b([^>]*)>([\s\S]*?)<\/emulator>/gi
  const out: EmulatorBlock[] = []
  for (const m of emulatorsBlock.matchAll(re)) {
    const attrs = m[1] ?? ""
    const inner = m[2] ?? ""
    const nameMatch = attrs.match(/\bname=("([^"]*)"|'([^']*)')/)
    const name = nameMatch?.[2] ?? nameMatch?.[3]
    if (!name) continue
    out.push({ name, cores: extractCores(inner) })
  }
  return out
}

function extractCores(
  emulatorInner: string,
): ReadonlyArray<{ name: string; isDefault: boolean }> {
  const re = /<core\b([^>]*)>([\s\S]*?)<\/core>/gi
  const out: Array<{ name: string; isDefault: boolean }> = []
  for (const m of emulatorInner.matchAll(re)) {
    const attrs = m[1] ?? ""
    const inner = (m[2] ?? "").trim()
    if (!inner) continue
    const isDefault = /\bdefault=("true"|'true')/i.test(attrs)
    out.push({ name: decodeEntities(inner), isDefault })
  }
  return out
}

function extractBlocks(xml: string, tag: string): readonly string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g")
  const out: string[] = []
  for (const m of xml.matchAll(re)) {
    out.push(m[1] ?? "")
  }
  return out
}

function extractText(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i")
  const m = block.match(re)
  if (!m) return undefined
  const raw = (m[1] ?? "").trim()
  if (raw === "") return undefined
  return decodeEntities(raw)
}

function decodeEntities(s: string): string {
  return s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}
