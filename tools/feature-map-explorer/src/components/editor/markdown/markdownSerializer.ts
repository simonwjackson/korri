import type { AnyExtension, JSONContent } from "@tiptap/core"
import { Link } from "@tiptap/extension-link"
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table"
import { Markdown, MarkdownManager } from "@tiptap/markdown"
import { StarterKit } from "@tiptap/starter-kit"

/*
 * Single Markdown adapter for the Feature Map Explorer rich editor.
 *
 * Tiptap works on ProseMirror JSON, while the repo stores Jobs/Briefs
 * as Markdown bodies plus frontmatter. Keeping parse/serialize in one
 * pure module gives us a small boundary to test with real corpus
 * fixtures before the React editor consumes it.
 */

export type MarkdownDocument = JSONContent

export function createMarkdownExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      link: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    Table.configure({
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
  ]
}

export function createTiptapEditorExtensions(): AnyExtension[] {
  return [
    ...createMarkdownExtensions(),
    Markdown.configure({
      indentation: { style: "space", size: 2 },
    }),
  ]
}

export function createMarkdownManager(): MarkdownManager {
  return new MarkdownManager({
    extensions: createMarkdownExtensions(),
    indentation: { style: "space", size: 2 },
  })
}

export function parseMarkdown(markdown: string): MarkdownDocument {
  if (markdown.trim() === "") {
    return { type: "doc", content: [] }
  }
  return createMarkdownManager().parse(markdown)
}

export function serializeMarkdown(document: MarkdownDocument): string {
  const serialized = createMarkdownManager().serialize(document)
  return normalizeTrailingNewline(serialized)
}

export function canonicalizeMarkdown(markdown: string): string {
  if (markdown.trim() === "") return ""
  return serializeMarkdown(parseMarkdown(markdown))
}

function normalizeTrailingNewline(value: string): string {
  const trimmedRight = value.replace(/[ \t]+$/gm, "").trimEnd()
  return trimmedRight === "" ? "" : `${trimmedRight}\n`
}
