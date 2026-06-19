/**
 * theme-workshop — neutral renderer for theme-declared bar controls.
 *
 * Calls the theme's `config.controls` hook (so control values track the theme's
 * reactive state) and renders each WorkshopControl with neutral `wk-control-*`
 * chrome. The theme owns the knob + behavior; the workshop owns the look —
 * controls look the same across every theme. `custom` renders its own node.
 */
import { cx } from "./classnames"
import type { WorkshopControl } from "./types"

export function WorkshopControls({
  useControls,
}: {
  readonly useControls: () => readonly WorkshopControl[]
}) {
  const controls = useControls()
  return (
    <>
      {controls.map(control => (
        <Control key={control.id} control={control} />
      ))}
    </>
  )
}

function Control({ control }: { readonly control: WorkshopControl }) {
  switch (control.kind) {
    case "cycle":
      return (
        <button
          type="button"
          className="wk-control wk-control-cycle"
          onClick={control.onClick}
          title={control.title}
          aria-label={control.label ?? control.id}
        >
          {control.label ? (
            <span className="wk-control-label">{control.label}</span>
          ) : null}
          <span className="wk-control-value">{control.value}</span>
        </button>
      )
    case "toggle":
      return (
        <button
          type="button"
          className={cx("wk-control wk-control-toggle", control.value && "on")}
          onClick={() => control.onChange(!control.value)}
          title={control.title}
          aria-pressed={control.value}
        >
          <span className="wk-control-label">{control.label}</span>
        </button>
      )
    case "select":
      return (
        <label className="wk-control wk-control-select" title={control.title}>
          {control.label ? (
            <span className="wk-control-label">{control.label}</span>
          ) : null}
          <select
            value={control.value}
            onChange={event => control.onChange(event.target.value)}
          >
            {control.options.map(option => (
              <option key={option.value} value={option.value}>
                {option.label ?? option.value}
              </option>
            ))}
          </select>
        </label>
      )
    case "custom":
      return <>{control.render()}</>
  }
}
