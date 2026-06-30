import type { Story } from "../../types"
import { LabIsoDateTimeInput } from "../components/LabIsoDateTimeInput"
import { useLab } from "../Lab.context"
import type { LabObjectInstance } from "../model/lab-canvas-state"
import {
  objectInputsForStory,
  resolveObjectInputValues,
} from "../model/lab-object-inputs"
import type { LabInputValue, LabSourceOption } from "../model/lab-source-state"

/**
 * Inspector scoped to the selected Compose object. Its bindings — data source
 * plus zero/one/many product inputs — stack vertically and scroll instead of
 * crowding the object's title bar horizontally. No input is special to the
 * Inspector; an input's render role is consumed by the canvas, not by this UI.
 */
export function LabObjectInspector({
  instance,
  story,
  byId,
  sources,
  onBind,
  onBindInput,
}: {
  readonly instance: LabObjectInstance
  readonly story: Story
  readonly byId: ReadonlyMap<string, Story>
  readonly sources: readonly LabSourceOption[]
  readonly onBind: (
    id: string,
    patch: Partial<Pick<LabObjectInstance, "sourceId">>,
  ) => void
  readonly onBindInput: (
    id: string,
    inputId: string,
    value: LabInputValue,
  ) => void
}) {
  const { adapter } = useLab()
  const inputs = objectInputsForStory(story, byId, adapter)
  const values = resolveObjectInputValues(inputs, instance.inputValues)

  return (
    <div className="pt-inspector">
      <div className="pt-inspector-scope">
        <span className={`pt-layer-tag layer-${story.layer}`}>
          {story.layer}
        </span>
        {story.name}
      </div>
      <div className="pt-bind">
        <label className="pt-bind-row">
          <span className="pt-bind-label">Data source</span>
          <select
            value={instance.sourceId}
            aria-label={`Data source for ${story.name}`}
            onChange={event =>
              onBind(instance.id, { sourceId: event.target.value })
            }
          >
            {sources.map(source => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        {inputs.map(input => {
          const label = `${input.label} for ${story.name}`
          const value = values[input.id] ?? input.defaultValue
          if (input.control?.kind === "iso-datetime") {
            return (
              <div key={input.id} className="pt-bind-row">
                <span className="pt-bind-label">{input.label}</span>
                <LabIsoDateTimeInput
                  value={value}
                  options={input.options}
                  ariaLabel={label}
                  onChange={next => onBindInput(instance.id, input.id, next)}
                />
              </div>
            )
          }
          return (
            <label key={input.id} className="pt-bind-row">
              <span className="pt-bind-label">{input.label}</span>
              <select
                value={value}
                aria-label={label}
                onChange={event =>
                  onBindInput(instance.id, input.id, event.target.value)
                }
              >
                {input.options.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>
    </div>
  )
}
