import { EditorContent, useEditor } from "@tiptap/react"
import { CircleAlert } from "lucide-react"
import { useEffect, useRef } from "react"
import { createTiptapEditorExtensions } from "./markdown/markdownSerializer"
import { analyzeMarkdownSupport } from "./markdown/markdownSupport"
import { RichEditorToolbar } from "./RichEditorToolbar"

export function RichEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const support = analyzeMarkdownSupport(value)

  if (support.level === "raw-only") {
    return <RichUnsupported reasons={support.reasons} />
  }

  return <RichEditorActive value={value} onChange={onChange} />
}

function RichEditorActive({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)
  const suppressUpdateRef = useRef(false)
  onChangeRef.current = onChange
  valueRef.current = value

  const editor = useEditor({
    extensions: createTiptapEditorExtensions(),
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "feature-map-rich-editor ProseMirror",
        "data-testid": "rich-editor-content",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      if (suppressUpdateRef.current) return
      const next = activeEditor.getMarkdown()
      if (next !== valueRef.current) onChangeRef.current(next)
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getMarkdown()
    if (current === value) return
    suppressUpdateRef.current = true
    try {
      editor.commands.setContent(value, {
        contentType: "markdown",
        emitUpdate: false,
      })
    } finally {
      suppressUpdateRef.current = false
    }
  }, [editor, value])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <RichEditorToolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-bg">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function RichUnsupported({ reasons }: { reasons: string[] }) {
  return (
    <div className="flex flex-1 flex-col items-start gap-2 rounded-md border border-status-warning bg-bg p-3 text-status-warning text-xs">
      <p className="flex items-center gap-1.5 font-medium text-text">
        <CircleAlert size={12} aria-hidden="true" />
        Rich editor unavailable
      </p>
      <p>
        This Markdown uses syntax outside the tested Rich editor contract. Use
        the Raw tab to edit it safely.
      </p>
      <ul className="list-disc space-y-1 pl-4">
        {reasons.map(reason => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  )
}
