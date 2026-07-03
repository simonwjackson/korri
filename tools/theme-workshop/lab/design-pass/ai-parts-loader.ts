import type { ReactNode } from "react"
import type { Story, StoryLayer } from "../../types"

interface AiPartRef {
  readonly slug: string
  readonly url: string
}

/**
 * Loads AI-authored parts for a surface at runtime, on demand. The dev server
 * lists the files under the surface's `ai-takes/` dir and Vite transforms each
 * one when we dynamically import it — so newly written parts appear without a
 * page reload, and the file watcher can stay off these files entirely.
 *
 * Returns an empty list outside the dev server (static preview / tests) so the
 * lab stays renderable without the endpoint.
 */
export async function loadAiPartStories(
  surfaceId: string,
  layer: StoryLayer = "molecule",
): Promise<readonly Story[]> {
  if (!shouldUseAiPartsApi()) return []
  const refs = await fetchAiPartRefs(surfaceId)
  const stories: Story[] = []
  for (const ref of refs) {
    try {
      const mod = (await import(/* @vite-ignore */ ref.url)) as {
        default?: {
          name?: string
          note?: string
          render?: () => ReactNode
        }
      }
      const def = mod.default
      if (!def || typeof def.render !== "function") continue
      stories.push({
        id: `${surfaceId}-${layer}-${ref.slug}-ai`,
        layer,
        name: def.name ?? ref.slug,
        note: def.note,
        aiTakeSlug: ref.slug,
        render: def.render,
      })
    } catch {
      // A malformed AI file is skipped, not fatal: the rest still load.
    }
  }
  return stories
}

async function fetchAiPartRefs(
  surfaceId: string,
): Promise<readonly AiPartRef[]> {
  try {
    const response = await fetch(
      `/__lab/ai-parts/${encodeURIComponent(surfaceId)}`,
      { headers: { Accept: "application/json" } },
    )
    if (!response.ok) return []
    const data = (await response.json()) as { parts?: unknown }
    if (!Array.isArray(data.parts)) return []
    return data.parts.filter(
      (part): part is AiPartRef =>
        typeof part === "object" &&
        part !== null &&
        typeof (part as AiPartRef).slug === "string" &&
        typeof (part as AiPartRef).url === "string",
    )
  } catch {
    return []
  }
}

function shouldUseAiPartsApi(): boolean {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.NODE_ENV !== "test"
  )
}
