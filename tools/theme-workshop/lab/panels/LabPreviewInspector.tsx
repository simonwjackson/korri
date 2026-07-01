import type { Story } from "../../types"
import { LabInputControlField } from "../components/LabInputControlField"
import type {
  LabPreviewPartTarget,
  LabPreviewSelection,
} from "../model/lab-preview-selection"
import type { LabInputValue } from "../model/lab-source-state"
import type { LabSurfacePartInput } from "../surface-registry"

function targetLabel(target: LabPreviewPartTarget): string {
  return target.instanceId
    ? `${target.name} · ${target.instanceId}`
    : target.name
}

export function LabPreviewInspector({
  selection,
  story,
  inputs,
  inputValues,
  onInputChange,
  onSelectTargetIndex,
  onClearSelection,
}: {
  readonly selection: LabPreviewSelection
  readonly story: Story | null
  readonly inputs: readonly LabSurfacePartInput[]
  readonly inputValues: Readonly<Record<string, LabInputValue>>
  readonly onInputChange: (inputId: string, value: LabInputValue) => void
  readonly onSelectTargetIndex: (index: number) => void
  readonly onClearSelection: () => void
}) {
  const active =
    selection.targets[selection.activeIndex] ?? selection.targets[0]
  const breadcrumb = [...selection.targets].reverse()

  return (
    <div className="pt-inspector">
      <div className="pt-inspector-scope">
        <span className={`pt-layer-tag layer-${active.layer}`}>
          {active.layer}
        </span>
        {targetLabel(active)}
      </div>
      <nav
        className="pt-preview-crumbs"
        aria-label="Selected preview part path"
      >
        {breadcrumb.map(target => {
          const index = selection.targets.indexOf(target)
          const selected = index === selection.activeIndex
          return (
            <button
              key={`${target.partId}:${target.instanceId ?? ""}:${index}`}
              type="button"
              className={`pt-preview-crumb${selected ? " is-on" : ""}`}
              onClick={() => onSelectTargetIndex(index)}
            >
              {target.name}
            </button>
          )
        })}
      </nav>
      {story ? (
        <div className="pt-sources-hint">
          Editing the real Preview instance.
        </div>
      ) : (
        <div className="pt-sources-hint">
          This part is named by the product, but has no matching catalog
          controls yet.
        </div>
      )}
      <div className="pt-bind">
        {inputs.map(input => (
          <LabInputControlField
            key={input.id}
            label={input.label}
            value={inputValues[input.id]}
            defaultValue={input.defaultValue}
            control={input.control}
            ariaLabel={`${input.label} for ${active.name}`}
            onChange={value => onInputChange(input.id, value)}
          />
        ))}
        {inputs.length === 0 ? (
          <div className="pt-sources-hint">
            No real inputs are exposed for this part yet.
          </div>
        ) : null}
        <button
          type="button"
          className="pt-axis-pincurrent"
          onClick={onClearSelection}
        >
          Back to live clicks
        </button>
      </div>
    </div>
  )
}
