/** Minimal pico-styled placeholder for loading / not-found route states. */
export function PicoFallback({
  label = "LOADING",
}: {
  readonly label?: string
}) {
  return (
    <div
      className="pcA"
      style={{
        display: "grid",
        placeItems: "center",
        color: "var(--pico-ink, #fff1e8)",
        font: "0.75em/1 'Press Start 2P', ui-monospace, monospace",
      }}
    >
      {label}
    </div>
  )
}
