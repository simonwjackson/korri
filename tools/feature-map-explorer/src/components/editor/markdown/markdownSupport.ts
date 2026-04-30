/*
 * Conservative support detector for Rich-mode Markdown editing.
 *
 * Tiptap can parse many Markdown constructs, but this explorer only
 * promises loss-safe rich editing for the constructs covered by the
 * serializer tests. Unsupported constructs should route the user to
 * Raw mode instead of being silently normalized or dropped.
 */

export type MarkdownSupportLevel = "supported" | "warning" | "raw-only"

export type MarkdownSupportResult = {
  level: MarkdownSupportLevel
  reasons: string[]
}

const UNSUPPORTED_CHECKS: Array<{
  reason: string
  pattern: RegExp
}> = [
  {
    reason: "MDX/JSX tags are not supported in Rich mode.",
    pattern: /^\s*<[A-Z][\w.:-]*(?:\s|>|\/)/m,
  },
  {
    reason: "Raw HTML blocks are not supported in Rich mode.",
    pattern: /^\s*<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\s*$/m,
  },
  {
    reason: "Footnotes are not supported in Rich mode.",
    pattern: /\[\^[^\]]+\]|^\[\^[^\]]+\]:/m,
  },
  {
    reason: "Definition lists are not supported in Rich mode.",
    pattern: /^\s*:\s+\S/m,
  },
  {
    reason: "Mermaid diagrams are not supported in Rich mode.",
    pattern: /^```\s*mermaid\b/im,
  },
  {
    reason: "Images are not supported in Rich mode.",
    pattern: /!\[[^\]]*\]\([^)]*\)/,
  },
]

export function analyzeMarkdownSupport(
  markdown: string,
): MarkdownSupportResult {
  const reasons = UNSUPPORTED_CHECKS.filter(check =>
    check.pattern.test(markdown),
  ).map(check => check.reason)

  return {
    level: reasons.length > 0 ? "raw-only" : "supported",
    reasons,
  }
}
