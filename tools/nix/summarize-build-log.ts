import { readFileSync } from "node:fs"

const logPath = process.argv[2]
if (!logPath) {
  console.error("usage: bun tools/nix/summarize-build-log.ts <nix-build.log>")
  process.exit(64)
}

const log = readFileSync(logPath, "utf8")
const builtBunPackages = [
  ...log.matchAll(/building '\/nix\/store\/[^']+?-(bun-pkg-[^']+)\.drv'/g),
].map(match => match[1])
const uniqueBuiltBunPackages = [...new Set(builtBunPackages)].sort()
const outputPath = log
  .trim()
  .split(/\n/)
  .reverse()
  .find(line =>
    /^\/nix\/store\/.+-korri-rocknix-product-payload-[^/]+$/.test(line),
  )

const suspiciousPatterns = [
  "playwright",
  "storybook",
  "cucumber",
  "vitest",
  "testing-library",
  "fallow",
  "tiptap",
  "@argo",
  "xyflow",
]
const suspicious = uniqueBuiltBunPackages.filter(name =>
  suspiciousPatterns.some(pattern => name.includes(pattern)),
)

console.log(`log: ${logPath}`)
console.log(`bun-pkg builds: ${builtBunPackages.length}`)
console.log(`unique bun-pkg builds: ${uniqueBuiltBunPackages.length}`)
if (outputPath) console.log(`output: ${outputPath}`)
console.log(`suspicious bun-pkg builds: ${suspicious.length}`)
for (const name of suspicious.slice(0, 80)) {
  console.log(`  ${name}`)
}
if (suspicious.length > 80) {
  console.log(`  ... ${suspicious.length - 80} more`)
}
