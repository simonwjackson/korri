import type { LabSurfaceAdapter } from "../surface-registry"

/**
 * Object inputs store product-shaped values: machine tags, ISO strings,
 * percentages, or other surface-owned values. The lab validates only the shape
 * of the input control; the product owns what the value means visually.
 */
export type LabInputValue = string

export type LabSourceOption = {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export type LabInputOption = {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export type LabInputControl =
  | { readonly kind: "select" }
  | { readonly kind: "iso-datetime" }

export const DEFAULT_SOURCE_ID = "default"
export const DEFAULT_INPUT_VALUE = "ready"

export function sourcesForAdapter(
  adapter: LabSurfaceAdapter,
): readonly LabSourceOption[] {
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

/** A valid input value is any non-empty string; surfaces define semantics. */
export function isLabInputValue(value: string): value is LabInputValue {
  return typeof value === "string" && value.length > 0
}

export async function initialValuesForBinding(
  adapter: LabSurfaceAdapter,
  binding: { readonly sourceId: string; readonly stateId: LabInputValue },
): Promise<unknown> {
  if (adapter.makeSeedInitialValuesForBinding) {
    return adapter.makeSeedInitialValuesForBinding(binding)
  }
  return adapter.makeSeedInitialValues()
}
