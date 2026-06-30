import type { Story } from "../../types"
import type { LabSurfaceAdapter } from "../surface-registry"
import { statesForStory } from "./lab-part-model"
import type {
  LabInputControl,
  LabInputOption,
  LabInputValue,
} from "./lab-source-state"

export const LAB_VARIANT_INPUT_ID = "variant"
export const LAB_VARIANT_INPUT_ROLE = "variant"

export type LabObjectInputRole = typeof LAB_VARIANT_INPUT_ROLE

export type LabObjectInput = {
  readonly id: string
  readonly label: string
  readonly options: readonly LabInputOption[]
  readonly defaultValue: LabInputValue
  readonly control?: LabInputControl
  /** Render role only: this input selects the concrete story variant. The
   * Inspector still renders it exactly like every other input. */
  readonly role?: LabObjectInputRole
}

const RESTING_STATES = ["ready", "idle", "live", "default", "loaded", "success"]

export function objectInputsForStory(
  story: Story,
  byId: ReadonlyMap<string, Story>,
  adapter: Pick<LabSurfaceAdapter, "surfacePartInputs">,
): readonly LabObjectInput[] {
  const inputs: LabObjectInput[] = []
  const variantStates = statesForStory(story, byId)
  if (variantStates.length > 0) {
    const label = variantInputLabelForStory(story)
    inputs.push({
      id: LAB_VARIANT_INPUT_ID,
      label,
      role: LAB_VARIANT_INPUT_ROLE,
      defaultValue: defaultInputValueFor(variantStates),
      options: variantStates,
    })
  }

  for (const input of adapter.surfacePartInputs?.(story) ?? []) {
    if (input.options.length === 0) continue
    inputs.push({
      id: input.id,
      label: input.label,
      defaultValue: canonicalInputValue(
        input.options,
        input.defaultValue ?? input.options[0]?.id,
        input.control,
      ),
      options: input.options,
      control: input.control,
    })
  }

  assertUniqueInputIds(inputs)
  return inputs
}

export function variantInput(
  inputs: readonly LabObjectInput[],
): LabObjectInput | null {
  return inputs.find(input => input.role === LAB_VARIANT_INPUT_ROLE) ?? null
}

export function resolveObjectInputValues(
  inputs: readonly LabObjectInput[],
  storedValues: Readonly<Record<string, LabInputValue>> | undefined,
): Readonly<Record<string, LabInputValue>> {
  const out: Record<string, LabInputValue> = {}
  for (const input of inputs) {
    out[input.id] = canonicalInputValue(
      input.options,
      storedValues?.[input.id] ?? input.defaultValue,
      input.control,
    )
  }
  return out
}

function variantInputLabelForStory(story: Story): string {
  const raw = story.note?.trim() || "State"
  return raw.replace(/\s+states?$/i, "") || "State"
}

function defaultInputValueFor(
  options: readonly LabInputOption[],
): LabInputValue {
  for (const resting of RESTING_STATES) {
    const match = options.find(option => option.id.toLowerCase() === resting)
    if (match) return match.id
  }
  const first = options[0]
  if (!first) throw new Error("Cannot choose a default for an empty input")
  return first.id
}

function canonicalInputValue(
  options: readonly LabInputOption[],
  value: LabInputValue | undefined,
  control?: LabInputControl,
): LabInputValue {
  const fallback = defaultInputValueFor(options)
  if (control?.kind === "iso-datetime") {
    if (value && isIsoDateString(value)) return value
    return isIsoDateString(fallback) ? fallback : ""
  }
  if (!value) return fallback
  const match = options.find(
    option => option.id.toLowerCase() === value.toLowerCase(),
  )
  return match?.id ?? fallback
}

function isIsoDateString(value: string): boolean {
  return Number.isFinite(new Date(value).getTime())
}

function assertUniqueInputIds(inputs: readonly LabObjectInput[]): void {
  const seen = new Set<string>()
  for (const input of inputs) {
    if (seen.has(input.id))
      throw new Error(`Duplicate object input id ${input.id}`)
    seen.add(input.id)
  }
}
