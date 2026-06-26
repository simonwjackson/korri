import type { LabSurfaceAdapter } from "../surface-registry"

/**
 * A state tag is free-form. The lab does not own a fixed state vocabulary;
 * states are derived from the actual tags a discovered part's variant family
 * carries (e.g. a state machine's "Loading" / "Ready" / "LoadError" / "Defect").
 * See statesForStory in lab-part-model.
 */
export type SourceStatus = string

export type LabSourceOption = {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export type LabStateOption = {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export const DEFAULT_SOURCE_ID = "default"
export const DEFAULT_STATE_ID = "ready"

export function sourcesForAdapter(adapter: LabSurfaceAdapter): readonly LabSourceOption[] {
  const configured = adapter.sources ?? []
  if (configured.length > 0) return configured
  return [
    {
      id: DEFAULT_SOURCE_ID,
      label: `${adapter.id} fixture`,
      description: "Default local fixture data.",
    },
  ]
}

/** A valid state tag is any non-empty string (states are dynamic). */
export function isSourceStatus(value: string): value is SourceStatus {
  return typeof value === "string" && value.length > 0
}

export async function initialValuesForBinding(
  adapter: LabSurfaceAdapter,
  binding: { readonly sourceId: string; readonly stateId: SourceStatus },
): Promise<unknown> {
  if (adapter.makeSeedInitialValuesForBinding) {
    return adapter.makeSeedInitialValuesForBinding(binding)
  }
  return adapter.makeSeedInitialValues()
}
