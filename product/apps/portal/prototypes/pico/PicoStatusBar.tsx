/** PROTOTYPE — pico theme exploration. Throwaway. */
export function PicoStatusBar({ label }: { readonly label: string }) {
  return (
    <div className="pico-statusbar">
      <span>{label}</span>
      <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
        <span>WIFI</span>
        <span className="pico-clock">10:24</span>
        <span className="pico-battery">
          82%
          <i />
        </span>
      </span>
    </div>
  )
}

export function PicoButtonBar({
  hints,
}: {
  readonly hints: readonly {
    readonly key: "a" | "b" | "y"
    readonly label: string
  }[]
}) {
  return (
    <div className="pico-buttonbar">
      {hints.map(hint => (
        <span className="pico-hint" key={hint.key}>
          <span className={`pico-key ${hint.key}`}>
            {hint.key.toUpperCase()}
          </span>
          {hint.label}
        </span>
      ))}
    </div>
  )
}
