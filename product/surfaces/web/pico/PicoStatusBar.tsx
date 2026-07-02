/** pico surface. */
import { PicoIcon } from "./PicoIcon"
import { PicoMascot } from "./PicoMascot"

export function PicoStatusBar({ label }: { readonly label: string }) {
  return (
    <div className="pico-statusbar">
      <span className="pico-statusbar-lead">
        <PicoMascot className="pcMascot-bar" />
        <span className="pico-statusbar-title">{label}</span>
      </span>
      <span className="pico-statusbar-status">
        <PicoIcon name="wifi" className="pico-statusbar-ico" />
        <span className="pico-clock">10:24</span>
        <span className="pico-battery">
          <span className="pico-battery-pct">82%</span>
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
