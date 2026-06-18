#!/usr/bin/env node
import fs from "node:fs"

const [, , inputPath, outputPath = inputPath] = process.argv
if (!inputPath) {
  console.error("usage: patch-c3main.mjs <input> [output]")
  process.exit(2)
}

let source = fs.readFileSync(inputPath, "utf8")
const keys = [
  "enableAudio",
  "enableGBASounds",
  "enableQuickDeath",
  "enablePlayTimer",
  "VolumeBGM",
  "VolumeSFX",
]

const replacements = new Map()
for (const key of keys) {
  const before = source
  const pattern = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\.ExpObject\\("${key}"(,\\s*([^\\)]+))?\\)`,
    "g",
  )
  source = source.replace(
    pattern,
    (_match, receiver, _defaultGroup, defaultExpr) => {
      if (defaultExpr !== undefined)
        return `globalThis.__YFSGetSetting(${receiver}, "${key}", ${defaultExpr})`
      return `globalThis.__YFSGetSetting(${receiver}, "${key}")`
    },
  )
  replacements.set(key, (before.match(pattern) || []).length)
}

for (const [key, count] of replacements) {
  if (count === 0) {
    console.error(`patch-c3main: no occurrences patched for ${key}`)
    process.exit(1)
  }
}

for (const key of keys) {
  if (source.includes(`ExpObject("${key}"`)) {
    console.error(`patch-c3main: static ExpObject read remains for ${key}`)
    process.exit(1)
  }
}

fs.writeFileSync(outputPath, source)
for (const [key, count] of replacements)
  console.error(`patch-c3main: ${key} -> ${count}`)
