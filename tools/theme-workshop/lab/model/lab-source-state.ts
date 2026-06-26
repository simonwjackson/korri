import type { LabSurfaceAdapter } from "../surface-registry"

export type SourceStatus = "ready" | "loading" | "empty" | "error"

export type LabSourceOption = {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export type LabStateOption = {
  readonly id: SourceStatus
  readonly label: string
  readonly description?: string
}

export const DEFAULT_SOURCE_ID = "default"
export const DEFAULT_STATE_ID: SourceStatus = "ready"

export const DEFAULT_STATES: readonly LabStateOption[] = [
  { id: "ready", label: "Ready", description: "Fixture data is available." },
  { id: "loading", label: "Loading", description: "The loader is still working." },
  { id: "empty", label: "Empty", description: "The loader finished with no items." },
  { id: "error", label: "Error", description: "The loader failed." },
]

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

export function statesForAdapter(adapter: LabSurfaceAdapter): readonly LabStateOption[] {
  const configured = adapter.states ?? []
  if (configured.length > 0) return configured
  return DEFAULT_STATES
}

export function isSourceStatus(value: string): value is SourceStatus {
  return value === "ready" || value === "loading" || value === "empty" || value === "error"
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
