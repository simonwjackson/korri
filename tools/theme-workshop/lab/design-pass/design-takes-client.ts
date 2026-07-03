import type {
  LabDesignTakeRecipeCandidate,
  ShiftStatusBarRecipe,
} from "./generated-takes"

export interface LabDesignTakesRequest {
  readonly partId?: string
  readonly prompt: string
  readonly count: number
}

export interface LabGeneratedPart {
  readonly name: string
  readonly slug: string
}

/**
 * Ask the dev-lab server to author real new part files for a surface. The
 * server runs a Flue workflow whose agent writes complete `.part.tsx` files
 * into the surface's `ai-takes/` scratch dir; Vite then discovers them as new
 * pickable parts. Returns the written parts, or `null` when unavailable
 * (static preview, tests, or a workflow failure).
 */
export async function requestGeneratedParts(
  surfaceId: string,
  request: LabDesignTakesRequest,
): Promise<readonly LabGeneratedPart[] | null> {
  if (!shouldUseDesignTakesApi()) return null
  try {
    const response = await fetch(generatePartsUrl(surfaceId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    })
    if (!response.ok) return null
    const parsed = JSON.parse(await response.text()) as {
      written?: readonly LabGeneratedPart[]
    }
    return Array.isArray(parsed.written) ? parsed.written : null
  } catch {
    return null
  }
}

/**
 * Delete an AI-authored part file from a surface's `ai-takes/` dir. Returns true
 * when the server removed it (or it was already gone). Returns false when the
 * endpoint is unavailable so callers can no-op gracefully.
 */
export async function deleteGeneratedPart(
  surfaceId: string,
  slug: string,
): Promise<boolean> {
  if (!shouldUseDesignTakesApi()) return false
  try {
    const response = await fetch(
      `${generatePartsUrl(surfaceId)}/${encodeURIComponent(slug)}`,
      { method: "DELETE" },
    )
    return response.ok
  } catch {
    return false
  }
}

function generatePartsUrl(surfaceId: string): string {
  return `/__lab/generate-parts/${encodeURIComponent(surfaceId)}`
}

/**
 * Ask the dev-lab server to generate design Takes for a part. The server runs a
 * Flue workflow (`tools/lab-ai`) that returns recipe candidates as strict JSON.
 * Returns `null` when the endpoint is unavailable (static preview, tests, or a
 * workflow/credential failure) so callers can fall back to canned Takes and the
 * lab stays usable offline.
 */
export async function requestDesignTakes(
  surfaceId: string,
  request: LabDesignTakesRequest,
): Promise<readonly LabDesignTakeRecipeCandidate[] | null> {
  if (!shouldUseDesignTakesApi()) return null
  try {
    const response = await fetch(designTakesUrl(surfaceId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    })
    if (!response.ok) return null
    return parseCandidates(await response.text())
  } catch {
    return null
  }
}

export function parseCandidates(
  raw: string | null,
): readonly LabDesignTakeRecipeCandidate[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null) return null
    const takes = (parsed as { takes?: unknown }).takes
    if (!Array.isArray(takes)) return null
    const candidates = takes
      .map(normalizeCandidate)
      .filter((c): c is LabDesignTakeRecipeCandidate => c !== null)
    return candidates.length > 0 ? candidates : null
  } catch {
    return null
  }
}

function designTakesUrl(surfaceId: string): string {
  return `/__lab/design-takes/${encodeURIComponent(surfaceId)}`
}

function shouldUseDesignTakesApi(): boolean {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.NODE_ENV !== "test"
  )
}

const DENSITY = new Set(["airy", "cozy", "compact"])
const TONE = new Set(["quiet", "neutral", "bold"])
const EMPHASIS = new Set(["low", "medium", "high"])

function normalizeCandidate(
  value: unknown,
): LabDesignTakeRecipeCandidate | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>
  const recipe = normalizeRecipe(candidate.recipe)
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.summary !== "string" ||
    recipe === null
  ) {
    return null
  }
  return { name: candidate.name, summary: candidate.summary, recipe }
}

function normalizeRecipe(value: unknown): ShiftStatusBarRecipe | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>
  if (
    candidate.kind !== "shift-status-bar-take-v1" ||
    !DENSITY.has(candidate.density as string) ||
    !TONE.has(candidate.tone as string) ||
    !EMPHASIS.has(candidate.batteryEmphasis as string) ||
    !EMPHASIS.has(candidate.networkEmphasis as string)
  ) {
    return null
  }
  return {
    kind: "shift-status-bar-take-v1",
    density: candidate.density as ShiftStatusBarRecipe["density"],
    tone: candidate.tone as ShiftStatusBarRecipe["tone"],
    batteryEmphasis:
      candidate.batteryEmphasis as ShiftStatusBarRecipe["batteryEmphasis"],
    networkEmphasis:
      candidate.networkEmphasis as ShiftStatusBarRecipe["networkEmphasis"],
  }
}
