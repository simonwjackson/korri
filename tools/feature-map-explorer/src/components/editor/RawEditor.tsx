import { markdown } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { useEffect, useRef } from "react"

/*
 * Minimal CodeMirror 6 wrapper for editing the body of a markdown file.
 *
 * The hosting Editor decides what the controlled value is — this
 * component reflects external value changes by reconciling the doc when
 * `value` prop differs from the current document. That keeps round-trip
 * behavior consistent with `gray-matter` (which the dev API uses on
 * save) without having to lift CM6 state out of the component.
 */
export function RawEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        markdown(),
        keymap.of([]),
        EditorView.lineWrapping,
        EditorView.theme(
          {
            "&": {
              height: "100%",
              fontSize: "13px",
              color: "var(--color-text)",
              backgroundColor: "var(--color-bg)",
            },
            ".cm-content": {
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              caretColor: "var(--color-accent)",
            },
            ".cm-gutters": {
              backgroundColor: "var(--color-bg)",
              color: "var(--color-text-muted)",
              borderRight: "1px solid var(--color-border)",
            },
            ".cm-activeLine": { backgroundColor: "transparent" },
            ".cm-activeLineGutter": {
              backgroundColor: "transparent",
            },
            "&.cm-focused": { outline: "none" },
          },
          { dark: true },
        ),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [value])

  // Reconcile external value updates (e.g., revert / reload) without
  // re-creating the entire view.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  return (
    <div
      ref={hostRef}
      className="h-full min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-bg"
    />
  )
}
