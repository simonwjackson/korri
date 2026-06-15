import { useVigieCockpit } from "../VigieCockpit.context"

// Last-resort observability. Collapsed by default — you reach for the raw log
// only when the structured signals above aren't enough. Live tail / virtualized
// rendering (react-logviewer) lands when this is wired to a real stream.

export function VigieLogDrawer() {
  const { log, logOpen, toggleLog } = useVigieCockpit()

  return (
    <section className="vigie-log" data-open={logOpen}>
      <button
        type="button"
        className="vigie-log-toggle"
        aria-expanded={logOpen}
        onClick={toggleLog}
      >
        <span>Raw log</span>
        <span className="vigie-log-hint">last resort · {log.length} lines</span>
        <span aria-hidden="true">{logOpen ? "▾" : "▸"}</span>
      </button>

      {logOpen ? (
        <ol className="vigie-log-lines">
          {log.map((line, index) => (
            <li
              key={`${line.ts}-${index}`}
              className="vigie-log-line"
              data-level={line.level}
            >
              <span className="vigie-log-ts">{line.ts}</span>
              <span className="vigie-log-source">{line.source}</span>
              <span className="vigie-log-message">{line.message}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
