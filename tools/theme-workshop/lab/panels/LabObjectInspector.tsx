import type { Story } from "../../types"
import { LabInputControlField } from "../components/LabInputControlField"
import {
  designPassStoryMetaLabel,
  type LabDesignPassStoryMeta,
} from "../design-pass/design-pass-model"
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
  storyMeta,
  byId,
  sources,
  onBind,
  onBindInput,
}: {
  readonly instance: LabObjectInstance
  readonly story: Story
  readonly storyMeta?: LabDesignPassStoryMeta
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
  const basedOn = storyMeta?.basedOnDesignPartId
    ? storyByDesignPartId(byId, storyMeta.basedOnDesignPartId)
    : null
  const storyMetaLabel = designPassStoryMetaLabel(storyMeta)

  return (
    <div className="pt-inspector">
      <div className="pt-inspector-scope">
        <span className={`pt-layer-tag layer-${story.layer}`}>
          {story.layer}
        </span>
        {story.name}
      </div>
      {storyMeta ? (
        <div className="pt-work-context">
          {storyMetaLabel ? (
            <span className="pt-work-badge">{storyMetaLabel}</span>
          ) : null}
          {basedOn ? (
            <span className="pt-work-copy">Based on {basedOn.name}</span>
          ) : null}
          {storyMeta.prompt ? (
            <span className="pt-work-copy">“{storyMeta.prompt}”</span>
          ) : null}
        </div>
      ) : null}
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
        {inputs.map(input => (
          <LabInputControlField
            key={input.id}
            label={input.label}
            value={values[input.id]}
            defaultValue={input.defaultValue}
            control={input.control}
            ariaLabel={`${input.label} for ${story.name}`}
            onChange={next => onBindInput(instance.id, input.id, next)}
          />
        ))}
      </div>
    </div>
  )
}

function storyByDesignPartId(
  byId: ReadonlyMap<string, Story>,
  designPartId: string,
): Story | null {
  for (const story of byId.values()) {
    if (story.designPartId === designPartId) return story
  }
  return null
}
