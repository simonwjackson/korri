import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Pick-coverage scanner: in pico pages + organisms, every design-bearing raw
 * HTML leaf must be a pickable part (either a kit component, or a tag that
 * spreads a design-part attr). A "violation" is an inline lowercase-HTML tag
 * carrying a bespoke className that is NOT tagged and NOT a pure structural
 * wrapper — exactly the regions the lab picker cannot select.
 */

const LEAF_TAGS =
  "div|span|b|i|em|strong|h1|h2|h3|h4|h5|p|ul|ol|li|section|header|footer|nav|button|img|a|small|code|pre|label|input|table|thead|tbody|tr|td|th"

// Pure layout/structural classes with no design identity — allowed untagged.
const STRUCTURAL = new Set([
  "pc-wrap",
  "pc-main",
  "pc-fill",
  "pc-row",
  "pc-col",
  "pc-grid",
  "pc-stack",
  "pc-center",
  "center",
  "pad-0",
  "col",
  "row",
])

export interface PickViolation {
  readonly file: string
  readonly tag: string
  readonly className: string
}

export interface SourceLeaf {
  readonly tag: string
  readonly start: number
  readonly end: number
  readonly design: readonly string[]
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path))
      continue
    }
    if (!/\.tsx$/.test(path)) continue
    if (/\.(part|story|test|spec)\.tsx$/.test(path)) continue
    out.push(path)
  }
  return out
}

/** Extract the full opening-tag text starting at `<`, brace/quote aware. */
function openingTag(src: string, lt: number): { text: string; end: number } {
  let depth = 0
  let quote: string | null = null
  for (let i = lt + 1; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c
      continue
    }
    if (c === "{") depth++
    else if (c === "}") depth--
    else if (c === ">" && depth === 0)
      return { text: src.slice(lt, i + 1), end: i }
  }
  return { text: src.slice(lt), end: src.length }
}

function classTokens(tag: string): string[] {
  const m = tag.match(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/)
  if (!m) return []
  const raw = m[1] ?? m[2] ?? m[3] ?? ""
  return raw
    .replace(/\$\{[^}]*\}/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

/** Untagged design leaves in one source string, with opening-tag offsets. */
export function scanSource(src: string): SourceLeaf[] {
  const tagRe = new RegExp(`<(${LEAF_TAGS})[\\s/>]`, "g")
  const out: SourceLeaf[] = []
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: scanner loop
  while ((m = tagRe.exec(src))) {
    const { text, end } = openingTag(src, m.index)
    tagRe.lastIndex = end + 1
    if (!/className=/.test(text)) continue
    if (/picoDesignPartAttrs\(|\.\.\.partAttrs|partAttrs=/.test(text)) continue
    const design = classTokens(text).filter(t => !STRUCTURAL.has(t))
    if (design.length === 0) continue
    out.push({ tag: m[1] ?? "", start: m.index, end, design })
  }
  return out
}

export function picoRoots(base: string): readonly string[] {
  // atoms are the floor (their own minimal internal markup is allowed inline);
  // pages, organisms, and molecules must compose pickable parts.
  return [`${base}/pages`, `${base}/ui/organisms`, `${base}/ui/molecules`]
}

export function pickViolations(roots: readonly string[]): PickViolation[] {
  const out: PickViolation[] = []
  for (const root of roots) {
    for (const file of walk(root)) {
      for (const leaf of scanSource(readFileSync(file, "utf8"))) {
        out.push({
          file: file.replace(/^.*surfaces\/web\/pico\//, ""),
          tag: leaf.tag,
          className: leaf.design.join(" "),
        })
      }
    }
  }
  return out
}

export function distinctClasses(roots: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const v of pickViolations(roots)) {
    const first = v.className.split(" ")[0] ?? v.className
    counts.set(first, (counts.get(first) ?? 0) + 1)
  }
  return counts
}

if (import.meta.main) {
  const roots = picoRoots("product/surfaces/web/pico")
  const violations = pickViolations(roots)
  const byFile = new Map<string, number>()
  for (const v of violations) byFile.set(v.file, (byFile.get(v.file) ?? 0) + 1)
  const sorted = [...byFile.entries()].sort((a, b) => b[1] - a[1])
  for (const [file, n] of sorted)
    console.log(`${String(n).padStart(3)}  ${file}`)
  console.log(
    `\n${violations.length} untagged design leaves across ${byFile.size} files`,
  )
}
