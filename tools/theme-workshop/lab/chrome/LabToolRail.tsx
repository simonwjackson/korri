export function LabToolRail({
  open,
  onOpen,
}: {
  readonly open: string
  readonly onOpen: (panel: string) => void
}) {
  const tools = ["parts", "sources", "states", "inspector", "devices", "controls"]
  return (
    <nav className="lab-toolrail" aria-label="Lab panels">
      {tools.map(tool => (
        <button key={tool} type="button" aria-label={`Open ${tool}`} className={open === tool ? "is-on" : ""} onClick={() => onOpen(tool)}>
          {tool.slice(0, 1).toUpperCase()}
        </button>
      ))}
    </nav>
  )
}
