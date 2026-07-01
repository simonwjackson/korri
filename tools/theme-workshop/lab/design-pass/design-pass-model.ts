import type { ReactNode } from "react"
import type { Story, StoryLayer } from "../../types"

export type LabDesignPassEntryRole = "take"

export interface LabDesignPassRenderablePart {
  readonly name: string
  readonly note?: string
  readonly presentation?: "part" | "surface"
  readonly render: () => ReactNode
}

export interface LabDesignPassEntry {
  readonly id: string
  readonly role: LabDesignPassEntryRole
  readonly surfaceId: string
  readonly layer: StoryLayer
  readonly part: LabDesignPassRenderablePart
  readonly basedOnDesignPartId?: string
  readonly prompt?: string
}

export interface LabDesignPass {
  readonly id: string
  readonly name: string
  readonly entries: readonly LabDesignPassEntry[]
}

export interface LabDesignPassStoryMeta {
  readonly role: LabDesignPassEntryRole
  readonly passId: string
  readonly passName: string
  readonly basedOnDesignPartId?: string
  readonly prompt?: string
  readonly promoted?: boolean
}

export interface LabDesignPassStories {
  readonly stories: readonly Story[]
  readonly metaByStoryId: Readonly<Record<string, LabDesignPassStoryMeta>>
}

export function storiesFromDesignPass(
  pass: LabDesignPass,
  surfaceId: string,
): LabDesignPassStories {
  const stories: Story[] = []
  const metaByStoryId: Record<string, LabDesignPassStoryMeta> = {}

  for (const entry of pass.entries) {
    if (entry.surfaceId !== surfaceId) continue
    const storyId = designPassStoryId(pass.id, entry.id)
    stories.push({
      id: storyId,
      designPartId: `design-pass.${pass.id}.${entry.id}`,
      layer: entry.layer,
      name: entry.part.name,
      note: entry.part.note,
      surface: entry.part.presentation === "surface" ? true : undefined,
      render: entry.part.render,
    })
    metaByStoryId[storyId] = {
      role: entry.role,
      passId: pass.id,
      passName: pass.name,
      basedOnDesignPartId: entry.basedOnDesignPartId,
      prompt: entry.prompt,
    }
  }

  return { stories, metaByStoryId }
}

export function designPassStoryMetaLabel(
  meta: LabDesignPassStoryMeta | undefined,
): string | null {
  if (!meta) return null
  if (meta.role === "take" && !meta.promoted) return "Take"
  return null
}

function designPassStoryId(passId: string, entryId: string): string {
  return `design-pass-${passId}-${entryId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
