#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import fg from "fast-glob"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../../..")
const OUTPUT = resolve(ROOT, "korri/shared/gates/registry.ts")
const GATE_GLOB = "korri/products/*/**/gate.ts"

interface GateEntry {
  name: string
  source: string
}

function extractGateName(filePath: string): string | null {
  const content = readFileSync(filePath, "utf-8")
  const match = content.match(
    /export\s+const\s+gate\s*=\s*["']([^"']+)["']\s+as\s+const/,
  )

  return match?.[1] ?? null
}

function main() {
  const files = fg.sync(GATE_GLOB, { cwd: ROOT, absolute: true }).sort()
  const entries: GateEntry[] = []

  for (const file of files) {
    const name = extractGateName(file)

    if (!name) {
      console.warn(`Skipping ${relative(ROOT, file)} — no gate export found`)
      continue
    }

    const existing = entries.find(entry => entry.name === name)
    if (existing) {
      throw new Error(
        `Duplicate gate name "${name}" in ${relative(ROOT, file)} and ${existing.source}`,
      )
    }

    entries.push({ name, source: relative(ROOT, file) })
  }

  const gateLines = entries
    .map(entry => `  "${entry.name}": true, // ${entry.source}`)
    .join("\n")

  const output = `/**
 * Gate Registry — auto-generated from co-located gate.ts files.
 *
 * DO NOT EDIT MANUALLY.
 * Regenerate: just generate-gates
 */

export const GATE_REGISTRY = {
${gateLines}
} as const satisfies Record<string, true>

export type GateName = keyof typeof GATE_REGISTRY

export const GATE_NAMES: readonly GateName[] = Object.keys(
  GATE_REGISTRY,
) as GateName[]

export function isKnownGate(name: string): name is GateName {
  return name in GATE_REGISTRY
}
`

  writeFileSync(OUTPUT, output, "utf-8")
  console.log(
    `Generated ${relative(ROOT, OUTPUT)} with ${entries.length} gate(s).`,
  )
}

main()
