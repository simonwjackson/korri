import {
  CircleAlert,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Undo2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useFile } from "../../hooks/useFile"
import type { NodeKind } from "../../types"
import { useAppShell } from "../AppShell/AppShell.context"
import { FrontmatterForm } from "./FrontmatterForm"
import { RawEditor } from "./RawEditor"

/*
 * Editor pane. Loads a markdown file by path, renders the structured
 * frontmatter form on top of CodeMirror for the body, and persists
 * through PUT /api/file. The dev API enforces the writable allowlist
 * server-side (Unit 3); this component never tries to bypass it.
 *
 * Reports its dirty state up to AppShell so the root-level discard
 * dialog can intercept selection changes that would lose unsaved edits.
 */
export function Editor({ path, kind }: { path: string; kind: NodeKind }) {
  const file = useFile(path)
  const { setIsDirty } = useAppShell()

  const isDirty =
    (file.status === "ready" || file.status === "saving") && file.isDirty

  useEffect(() => {
    setIsDirty(isDirty)
    return () => setIsDirty(false)
  }, [isDirty, setIsDirty])

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])

  if (file.status === "idle") return null

  if (file.status === "loading") {
    return (
      <EditorMessage>
        <Loader2 size={14} className="animate-spin" /> Loading file…
      </EditorMessage>
    )
  }

  if (file.status === "error") {
    return (
      <EditorMessage variant="error">
        <CircleAlert size={14} /> Couldn't load file: {file.error}
      </EditorMessage>
    )
  }

  const saving = file.status === "saving"

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-text-muted text-xs">
          {file.isDirty ? (
            <span className="flex items-center gap-1.5 text-status-warning">
              <span className="block h-1.5 w-1.5 rounded-full bg-status-warning" />
              Unsaved changes
            </span>
          ) : (
            <span>Saved</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={file.reload}
            disabled={saving}
            className={ICON_BUTTON}
            aria-label="Reload from disk"
          >
            <RefreshCw size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={file.revert}
            disabled={saving || !file.isDirty}
            className={ICON_BUTTON}
            aria-label="Discard local changes"
          >
            <Undo2 size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={file.save}
            disabled={saving}
            className="flex h-7 items-center gap-1.5 rounded-md border border-accent bg-accent px-2.5 font-medium text-bg text-xs disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Save size={12} aria-hidden="true" />
            )}
            <span>Save</span>
          </button>
        </div>
      </div>

      {file.saveError && (
        <div className="flex items-start gap-2 rounded-md border border-status-error bg-bg px-2 py-1.5 text-status-error text-xs">
          <CircleAlert size={12} aria-hidden="true" />
          <span>{file.saveError}</span>
        </div>
      )}

      <FrontmatterForm
        frontmatter={file.draft.frontmatter}
        kind={kind}
        onChange={file.setFrontmatter}
      />

      <BodyEditor body={file.draft.body} onChange={file.setBody} />
    </div>
  )
}

/*
 * Tab seam for Raw vs. Rich body editing. The Rich tab is wired up
 * for future Tiptap (or similar) integration but currently shows a
 * deferral note: the existing brief.md content includes GFM tables,
 * which are the canonical case where ProseMirror -> Markdown round-
 * trip drifts (alignment + cell whitespace). Until a serializer is
 * proven to round-trip our real content losslessly, Raw is the only
 * way to edit the body. The seam stays so that a follow-up can drop
 * the Rich implementation in without touching this file's API.
 */
function BodyEditor({
  body,
  onChange,
}: {
  body: string
  onChange: (next: string) => void
}) {
  const [mode, setMode] = useState<"raw" | "rich">("raw")

  return (
    <div className="flex min-h-[240px] flex-1 flex-col gap-2">
      <div
        role="tablist"
        aria-label="Body editor mode"
        className="flex items-center gap-1"
      >
        <BodyTab
          active={mode === "raw"}
          onClick={() => setMode("raw")}
          label="Raw"
        />
        <BodyTab
          active={mode === "rich"}
          onClick={() => setMode("rich")}
          label="Rich"
          icon={<Sparkles size={11} aria-hidden="true" />}
        />
      </div>
      {mode === "raw" ? (
        <RawEditor value={body} onChange={onChange} />
      ) : (
        <RichDeferred />
      )}
    </div>
  )
}

function BodyTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs ${
        active
          ? "border-border-strong bg-surface-elevated text-text"
          : "border-border bg-surface text-text-muted hover:bg-surface-elevated hover:text-text"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function RichDeferred() {
  return (
    <div className="flex flex-1 flex-col items-start gap-2 rounded-md border border-border bg-surface p-3 text-text-muted text-xs">
      <p className="text-text">
        <Sparkles
          size={12}
          aria-hidden="true"
          className="mr-1 inline align-[-1px] text-accent"
        />
        Rich editor deferred
      </p>
      <p>
        The repo's current brief content includes GFM tables, where Markdown{" "}
        <span className="font-mono">↔</span> ProseMirror round- trips drift on
        cell whitespace and alignment. Until a serializer is proven to
        round-trip the real content losslessly, edits go through the Raw tab.
      </p>
      <p>
        Switching back to Raw is non-destructive — you have not made any edits
        in this view.
      </p>
    </div>
  )
}

const ICON_BUTTON =
  "flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg text-text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-50"

function EditorMessage({
  children,
  variant,
}: {
  children: React.ReactNode
  variant?: "error"
}) {
  return (
    <div className="grid h-full place-items-center px-4 py-4">
      <div
        className={`flex items-center gap-2 text-xs ${
          variant === "error" ? "text-status-error" : "text-text-muted"
        }`}
      >
        {children}
      </div>
    </div>
  )
}
