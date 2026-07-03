import type { IniEntry } from "./mapping"

/**
 * RPCS3 GUI popup toggles live in GuiConfigs/CurrentSettings.ini, a QSettings
 * INI file NOT covered by --config. This module merges the routed ini entries
 * (popup suppression) into that file without clobbering unrelated GUI state.
 *
 * The parser is deliberately minimal: RPCS3 manages this file machine-side, so
 * we only need `[section]` headers and `key=value` lines. Merging is
 * section-keyed and preserves every key/section we don't touch.
 */

type IniModel = Map<string, Map<string, string>>

export const parseIni = (text: string): IniModel => {
  const model: IniModel = new Map()
  let section = ""
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === "" || line.startsWith(";") || line.startsWith("#")) continue
    const header = /^\[(.*)\]$/.exec(line)
    if (header !== null) {
      section = header[1] ?? ""
      if (!model.has(section)) model.set(section, new Map())
      continue
    }
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    let bucket = model.get(section)
    if (bucket === undefined) {
      bucket = new Map()
      model.set(section, bucket)
    }
    bucket.set(key, value)
  }
  return model
}

const serializeIni = (model: IniModel): string => {
  const lines: string[] = []
  const top = model.get("")
  if (top !== undefined) {
    for (const [key, value] of top) lines.push(`${key}=${value}`)
    if (top.size > 0) lines.push("")
  }
  for (const [section, keys] of model) {
    if (section === "") continue
    lines.push(`[${section}]`)
    for (const [key, value] of keys) lines.push(`${key}=${value}`)
    lines.push("")
  }
  return lines.join("\n")
}

/**
 * Merge routed ini entries into an existing CurrentSettings.ini (or a fresh
 * file when `existing` is undefined). Returns the serialized INI text.
 */
export const mergeGuiIni = (
  existing: string | undefined,
  entries: readonly IniEntry[],
): string => {
  const model = existing !== undefined ? parseIni(existing) : new Map()
  for (const [section, key, value] of entries) {
    let bucket = model.get(section)
    if (bucket === undefined) {
      bucket = new Map<string, string>()
      model.set(section, bucket)
    }
    bucket.set(key, String(value))
  }
  return serializeIni(model)
}
