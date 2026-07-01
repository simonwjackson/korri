import type { LabGeneratedTakeDescriptor } from "./generated-takes"

export interface LabSurfaceState {
  readonly version: 1
  readonly promotedGeneratedTakes: readonly LabGeneratedTakeDescriptor[]
}

export const emptyLabSurfaceState = (): LabSurfaceState => ({
  version: 1,
  promotedGeneratedTakes: [],
})

export async function readLabSurfaceState(
  surfaceId: string,
): Promise<LabSurfaceState> {
  if (!shouldUseSurfaceStateApi()) return emptyLabSurfaceState()
  try {
    const response = await fetch(surfaceStateUrl(surfaceId), {
      headers: { Accept: "application/json" },
    })
    if (!response.ok) return emptyLabSurfaceState()
    return parseLabSurfaceState(await response.text())
  } catch {
    return emptyLabSurfaceState()
  }
}

export async function persistLabSurfaceState(
  surfaceId: string,
  state: LabSurfaceState,
): Promise<void> {
  if (!shouldUseSurfaceStateApi()) return
  try {
    await fetch(surfaceStateUrl(surfaceId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state, null, 2),
    })
  } catch {
    // The lab remains usable when opened from a static preview or test harness;
    // disk persistence is a dev-server capability, not a render prerequisite.
  }
}

export function parseLabSurfaceState(raw: string | null): LabSurfaceState {
  if (!raw) return emptyLabSurfaceState()
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) {
      return emptyLabSurfaceState()
    }
    const candidate = parsed as Record<string, unknown>
    return {
      version: 1,
      promotedGeneratedTakes: Array.isArray(candidate.promotedGeneratedTakes)
        ? candidate.promotedGeneratedTakes
            .map(normalizeDescriptor)
            .filter(
              (descriptor): descriptor is LabGeneratedTakeDescriptor =>
                descriptor !== null,
            )
        : [],
    }
  } catch {
    return emptyLabSurfaceState()
  }
}

function surfaceStateUrl(surfaceId: string): string {
  return `/__lab/surface-state/${encodeURIComponent(surfaceId)}`
}

function shouldUseSurfaceStateApi(): boolean {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.NODE_ENV !== "test"
  )
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
