/** Tool rail. The icons echo a real editor's tools; each is wired to a panel
 * id so assistive tech and tests can open a specific panel. In Dock/Float all
 * panels are already visible, so clicking simply marks the active tool. */
const TOOLS: readonly { readonly id: string; readonly glyph: string; readonly label: string }[] = [
  { id: "parts", glyph: "✛", label: "Open parts" },
  { id: "sources", glyph: "⤡", label: "Open sources" },
  { id: "states", glyph: "◆", label: "Open states" },
  { id: "inspector", glyph: "🎛", label: "Open inspector" },
  { id: "devices", glyph: "▦", label: "Open devices" },
  { id: "controls", glyph: "✎", label: "Open controls" },
]

export function LabToolRail({
  docked,
  open,
  onOpen,
}: {
  readonly docked: boolean
  readonly open: string
  readonly onOpen: (panel: string) => void
}) {
  return (
    <div className={`pt-toolrail${docked ? " is-docked" : ""}`} aria-label="Lab tools">
      {TOOLS.map(tool => (
        <button
          key={tool.id}
          type="button"
          aria-label={tool.label}
          className={`pt-tool${open === tool.id ? " is-on" : ""}`}
          onClick={() => onOpen(tool.id)}
        >
          {tool.glyph}
        </button>
      ))}
    </div>
  )
}
