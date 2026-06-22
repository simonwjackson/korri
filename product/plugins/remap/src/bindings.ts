import {
  isControllerRef,
  parseControlRef,
  type RemapControlRef,
  type RemapControllerRef,
} from "./control-ref"

export interface RemapBinding {
  readonly source: RemapControllerRef
  readonly targets: readonly RemapControlRef[]
}

export function decodeRemapBindings(input: unknown): readonly RemapBinding[] {
  if (!isRecord(input)) {
    throw new Error("Remap bindings must be an object map")
  }
  const entries = Object.entries(input)
  if (entries.length === 0) {
    throw new Error("Remap policy requires at least one binding")
  }
  return entries.map(([sourceRef, targetValue]) => {
    const source = parseControlRef(sourceRef)
    if (!isControllerRef(source)) {
      throw new Error(`Remap binding source must be a controller ref: ${sourceRef}`)
    }
    const targets = decodeTargets(targetValue, sourceRef)
    return { source, targets }
  })
}

function decodeTargets(value: unknown, sourceRef: string): readonly RemapControlRef[] {
  const refs = Array.isArray(value) ? value : [value]
  if (refs.length === 0) {
    throw new Error(`Remap binding ${sourceRef} requires at least one target`)
  }
  return refs.map(target => {
    if (typeof target !== "string") {
      throw new Error(`Remap binding ${sourceRef} target must be a string ref`)
    }
    return parseControlRef(target)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
