import type { LabGeneratedTakeDescriptor } from "./generated-takes"

const storageKey = (surfaceId: string) =>
  `lab:${surfaceId}:promoted-generated-takes`

export function readPromotedGeneratedTakes(
  surfaceId: string,
): readonly LabGeneratedTakeDescriptor[] {
  if (typeof window === "undefined") return []
  try {
    return parsePromotedGeneratedTakes(
      window.localStorage.getItem(storageKey(surfaceId)),
    )
  } catch {
    return []
  }
}

export function persistPromotedGeneratedTakes(
  surfaceId: string,
  descriptors: readonly LabGeneratedTakeDescriptor[],
): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    storageKey(surfaceId),
    JSON.stringify(descriptors),
  )
}

export function parsePromotedGeneratedTakes(
  raw: string | null,
): readonly LabGeneratedTakeDescriptor[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeDescriptor)
      .filter(
        (descriptor): descriptor is LabGeneratedTakeDescriptor =>
          descriptor !== null,
      )
  } catch {
    return []
  }
}

function normalizeDescriptor(
  value: unknown,
): LabGeneratedTakeDescriptor | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.designPartId !== "string" ||
    !isStoryLayer(candidate.layer) ||
    typeof candidate.name !== "string" ||
    typeof candidate.baseStoryId !== "string" ||
    typeof candidate.prompt !== "string" ||
    typeof candidate.variant !== "string"
  ) {
    return null
  }

  return {
    id: candidate.id,
    designPartId: candidate.designPartId,
    layer: candidate.layer,
    name: candidate.name,
    ...(typeof candidate.note === "string" ? { note: candidate.note } : {}),
    ...(candidate.surface === true ? { surface: true } : {}),
    baseStoryId: candidate.baseStoryId,
    ...(typeof candidate.basedOnDesignPartId === "string"
      ? { basedOnDesignPartId: candidate.basedOnDesignPartId }
      : {}),
    prompt: candidate.prompt,
    variant: candidate.variant,
  }
}

function isStoryLayer(
  value: unknown,
): value is LabGeneratedTakeDescriptor["layer"] {
  return (
    value === "page" ||
    value === "template" ||
    value === "organism" ||
    value === "molecule" ||
    value === "atom"
  )
}
