import type { LabSurfaceAdapter } from "../surface-registry"

/**
 * Object inputs store product-shaped values: machine tags, ISO strings,
 * percentages, booleans, or small surface-owned objects. The lab validates only
 * the shape of the input control; the product owns what the value means
 * visually.
 */
export type LabInputValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: LabInputValue }

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

export type LabInputField = {
  readonly id: string
  readonly label: string
  readonly defaultValue: LabInputValue
  readonly control: LabInputControl
}

export type LabInputCase = {
  readonly tag: string
  readonly label: string
  readonly fields: readonly LabInputField[]
}

export type LabInputControl =
  | { readonly kind: "select"; readonly options: readonly LabInputOption[] }
  | {
      readonly kind: "iso-datetime"
      readonly options?: readonly LabInputOption[]
    }
  | {
      readonly kind: "range"
      readonly min: number
      readonly max: number
      readonly step: number
      readonly unit?: string
    }
  | { readonly kind: "boolean" }
  | { readonly kind: "object"; readonly fields: readonly LabInputField[] }
  | {
      readonly kind: "tagged"
      readonly tagField?: string
      readonly cases: readonly LabInputCase[]
    }

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

/** A valid input value is any primitive/object value; surfaces define semantics. */
export function isLabInputValue(value: unknown): value is LabInputValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    isLabInputRecord(value)
  )
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

export function defaultInputValueForControl(
  control: LabInputControl,
  fallback?: LabInputValue,
): LabInputValue {
  if (fallback !== undefined) return fallback
  switch (control.kind) {
    case "select":
      return control.options[0]?.id ?? ""
    case "iso-datetime":
      return control.options?.[0]?.id ?? ""
    case "range":
      return control.min
    case "boolean":
      return false
    case "object":
      return Object.fromEntries(
        control.fields.map(field => [
          field.id,
          canonicalInputValue(field.defaultValue, field.control),
        ]),
      )
    case "tagged": {
      const first = control.cases[0]
      if (!first) return { [control.tagField ?? "_tag"]: "" }
      return valueForTaggedCase(control, first, undefined)
    }
  }
}

export function canonicalInputValue(
  value: LabInputValue | undefined,
  control: LabInputControl,
  fallback?: LabInputValue,
): LabInputValue {
  const defaultValue = defaultInputValueForControl(control, fallback)
  switch (control.kind) {
    case "select": {
      const raw = typeof value === "string" ? value : String(defaultValue)
      const match = control.options.find(
        option => option.id.toLowerCase() === raw.toLowerCase(),
      )
      return match?.id ?? defaultValue
    }
    case "iso-datetime": {
      const raw = typeof value === "string" ? value : String(defaultValue)
      if (isIsoDateString(raw)) return raw
      return typeof defaultValue === "string" && isIsoDateString(defaultValue)
        ? defaultValue
        : ""
    }
    case "range": {
      const raw = Number(value ?? defaultValue)
      const finite = Number.isFinite(raw) ? raw : Number(defaultValue)
      return Math.max(control.min, Math.min(control.max, finite))
    }
    case "boolean":
      return typeof value === "boolean" ? value : Boolean(defaultValue)
    case "object": {
      const record = isLabInputRecord(value) ? value : {}
      return Object.fromEntries(
        control.fields.map(field => [
          field.id,
          canonicalInputValue(
            record[field.id],
            field.control,
            field.defaultValue,
          ),
        ]),
      )
    }
    case "tagged": {
      const tagField = control.tagField ?? "_tag"
      const record = isLabInputRecord(value) ? value : {}
      const fallbackRecord = isLabInputRecord(defaultValue) ? defaultValue : {}
      const tag =
        typeof record[tagField] === "string"
          ? record[tagField]
          : typeof fallbackRecord[tagField] === "string"
            ? fallbackRecord[tagField]
            : control.cases[0]?.tag
      const selected = control.cases.find(inputCase => inputCase.tag === tag)
      const inputCase = selected ?? control.cases[0]
      if (!inputCase) return { [tagField]: "" }
      return valueForTaggedCase(control, inputCase, record)
    }
  }
}

function valueForTaggedCase(
  control: Extract<LabInputControl, { readonly kind: "tagged" }>,
  inputCase: LabInputCase,
  previous: Readonly<Record<string, LabInputValue>> | undefined,
): LabInputValue {
  const tagField = control.tagField ?? "_tag"
  return {
    [tagField]: inputCase.tag,
    ...Object.fromEntries(
      inputCase.fields.map(field => [
        field.id,
        canonicalInputValue(
          previous?.[field.id],
          field.control,
          field.defaultValue,
        ),
      ]),
    ),
  }
}

export function isLabInputRecord(
  value: unknown,
): value is Readonly<Record<string, LabInputValue>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every(isLabInputValue)
}

function isIsoDateString(value: string): boolean {
  return Number.isFinite(new Date(value).getTime())
}
