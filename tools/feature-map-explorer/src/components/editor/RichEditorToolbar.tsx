import type { Editor } from "@tiptap/core"
import type { LucideIcon } from "lucide-react"
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Table2,
  Trash2,
} from "lucide-react"

export function RichEditorToolbar({ editor }: { editor: Editor | null }) {
  const disabled = !editor

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-bg p-1">
      <ToolbarButton
        icon={Heading1}
        label="Heading 1"
        disabled={disabled}
        active={editor?.isActive("heading", { level: 1 }) ?? false}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 1 }).run()
        }
      />
      <ToolbarButton
        icon={Heading2}
        label="Heading 2"
        disabled={disabled}
        active={editor?.isActive("heading", { level: 2 }) ?? false}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 2 }).run()
        }
      />
      <ToolbarButton
        icon={Bold}
        label="Bold"
        disabled={disabled}
        active={editor?.isActive("bold") ?? false}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={Italic}
        label="Italic"
        disabled={disabled}
        active={editor?.isActive("italic") ?? false}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={Code}
        label="Inline code"
        disabled={disabled}
        active={editor?.isActive("code") ?? false}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      />
      <ToolbarButton
        icon={List}
        label="Bullet list"
        disabled={disabled}
        active={editor?.isActive("bulletList") ?? false}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="Ordered list"
        disabled={disabled}
        active={editor?.isActive("orderedList") ?? false}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={Quote}
        label="Blockquote"
        disabled={disabled}
        active={editor?.isActive("blockquote") ?? false}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={Minus}
        label="Horizontal rule"
        disabled={disabled}
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
      />
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        icon={Table2}
        label="Insert table"
        disabled={disabled}
        active={editor?.isActive("table") ?? false}
        onClick={() =>
          editor
            ?.chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      />
      <ToolbarButton
        icon={Plus}
        label="Add row after"
        disabled={disabled || !(editor?.can().addRowAfter() ?? false)}
        onClick={() => editor?.chain().focus().addRowAfter().run()}
      />
      <ToolbarButton
        icon={Plus}
        label="Add column after"
        disabled={disabled || !(editor?.can().addColumnAfter() ?? false)}
        onClick={() => editor?.chain().focus().addColumnAfter().run()}
      />
      <ToolbarButton
        icon={Trash2}
        label="Delete table"
        disabled={disabled || !(editor?.can().deleteTable() ?? false)}
        onClick={() => editor?.chain().focus().deleteTable().run()}
      />
    </div>
  )
}

function ToolbarButton({
  icon: Icon,
  label,
  active = false,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded border text-text-muted hover:bg-surface-elevated hover:text-text disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-accent bg-surface-elevated text-accent"
          : "border-border"
      }`}
    >
      <Icon size={13} aria-hidden="true" />
    </button>
  )
}
