import {
  DEFAULT_SHIFT_CLOCK_ISO,
  shiftClockLabelForIso,
} from "@product/surfaces/web/shift/shift-clock-state"
import { SHIFT_DESIGN_PARTS } from "@product/surfaces/web/shift/shift-design-parts"
import { shiftBatteryPropsForPowerReading } from "@product/surfaces/web/shift/shift-power-state"
import { ShiftStatusBar } from "@product/surfaces/web/shift/ui/molecules/ShiftStatusBar"
import { ShiftPartFrame } from "@product/surfaces/web/shift/ui/ShiftPartFrame"
import type { Story, StoryLayer } from "../../types"
import type { LabDesignPassStoryMeta } from "./design-pass-model"

export interface LabGeneratedTakeRequest {
  readonly surfaceId: string
  readonly baseStory: Story
  readonly baseMeta?: LabDesignPassStoryMeta
  readonly prompt: string
  readonly count: number
  readonly seed: number
}

/**
 * Semantic design knobs for the Shift status bar. This is the wire contract the
 * `generate-design-takes` Flue workflow returns; keep it in sync with the
 * valibot schema in `tools/lab-ai/src/workflows/generate-design-takes.ts`. The
 * lab — not the model — owns the mapping from recipe to concrete component
 * props (see `shiftStatusBarPropsFromRecipe`).
 */
export interface ShiftStatusBarRecipe {
  readonly kind: "shift-status-bar-take-v1"
  readonly density: "airy" | "cozy" | "compact"
  readonly tone: "quiet" | "neutral" | "bold"
  readonly batteryEmphasis: "low" | "medium" | "high"
  readonly networkEmphasis: "low" | "medium" | "high"
}

export interface LabDesignTakeRecipeCandidate {
  readonly name: string
  readonly summary: string
  readonly recipe: ShiftStatusBarRecipe
}

export interface LabGeneratedTakeDescriptor {
  readonly id: string
  readonly designPartId: string
  readonly layer: StoryLayer
  readonly name: string
  readonly note?: string
  readonly summary?: string
  readonly surface?: boolean
  readonly baseStoryId: string
  readonly basedOnDesignPartId?: string
  readonly prompt: string
  readonly variant: string
  readonly recipe?: ShiftStatusBarRecipe
}

export interface LabGeneratedTakeBatch {
  readonly stories: readonly Story[]
  readonly metaByStoryId: Readonly<Record<string, LabDesignPassStoryMeta>>
  readonly descriptors: readonly LabGeneratedTakeDescriptor[]
}

const STATUS_BAR_TAKES = [
  {
    slug: "airier",
    name: "Airier status bar",
    avatar: "https://i.pravatar.cc/96?u=korri-shift-airier",
    power: { percent: 92, charging: true },
    network: { _tag: "Connected", name: "Wi-Fi", strengthPercent: 86 } as const,
  },
  {
    slug: "quiet",
    name: "Quiet status bar",
    avatar: "https://i.pravatar.cc/96?u=korri-shift-quiet",
    power: { percent: 68, charging: false },
    network: { _tag: "Connected", name: "Wi-Fi", strengthPercent: 64 } as const,
  },
  {
    slug: "focused",
    name: "Focused status bar",
    avatar: "https://i.pravatar.cc/96?u=korri-shift-focused",
    power: { percent: 41, charging: false },
    network: { _tag: "Disconnected" } as const,
  },
  {
    slug: "warm",
    name: "Warmer status bar",
    avatar: "https://i.pravatar.cc/96?u=korri-shift-warm",
    power: { percent: 100, charging: true },
    network: {
      _tag: "Connected",
      name: "KorriNet",
      strengthPercent: 100,
    } as const,
  },
  {
    slug: "minimal",
    name: "Minimal status bar",
    avatar: "https://i.pravatar.cc/96?u=korri-shift-minimal",
    power: { percent: 24, charging: false },
    network: { _tag: "Connected", name: "Wi-Fi", strengthPercent: 38 } as const,
  },
] as const

const BATTERY_EMPHASIS = {
  low: { percent: 24, charging: false },
  medium: { percent: 62, charging: false },
  high: { percent: 97, charging: true },
} as const

const NETWORK_EMPHASIS = {
  low: { _tag: "Disconnected" },
  medium: { _tag: "Connected", name: "Wi-Fi", strengthPercent: 55 },
  high: { _tag: "Connected", name: "KorriNet", strengthPercent: 96 },
} as const

/**
 * Pure mapping from a semantic recipe to the concrete props the real
 * `ShiftStatusBar` consumes. The status bar only exposes battery, network, and
 * avatar, so density/tone steer the avatar seed while the emphasis knobs drive
 * the battery and network readings.
 */
export function shiftStatusBarPropsFromRecipe(recipe: ShiftStatusBarRecipe): {
  readonly avatarSrc: string
  readonly battery: { readonly percent: number; readonly charging: boolean }
  readonly network:
    | {
        readonly _tag: "Connected"
        readonly name: string | null
        readonly strengthPercent: number
      }
    | { readonly _tag: "Disconnected" }
} {
  return {
    avatarSrc: `https://i.pravatar.cc/96?u=korri-shift-${recipe.tone}-${recipe.density}`,
    battery: BATTERY_EMPHASIS[recipe.batteryEmphasis],
    network: NETWORK_EMPHASIS[recipe.networkEmphasis],
  }
}

/**
 * Turn model-authored recipe candidates into the same generated-Take batch the
 * canned path produces, so promotion, deletion, and persistence treat AI takes
 * exactly like any other generated Take.
 */
export function createRecipeTakeBatch(
  base: Omit<LabGeneratedTakeRequest, "count">,
  candidates: readonly LabDesignTakeRecipeCandidate[],
): LabGeneratedTakeBatch {
  const { baseStory, baseMeta, prompt, seed } = base
  const basedOnDesignPartId =
    baseStory.designPartId ?? baseMeta?.basedOnDesignPartId
  const descriptors: LabGeneratedTakeDescriptor[] = candidates.map(
    (candidate, index) => ({
      id: `generated-take-${seed}-recipe-${index + 1}`,
      designPartId: `design-pass.generated.${seed}.recipe.${index + 1}`,
      layer: baseStory.layer,
      name: candidate.name,
      note: candidate.summary,
      summary: candidate.summary,
      surface: baseStory.surface,
      baseStoryId: baseStory.id,
      basedOnDesignPartId,
      prompt,
      variant: candidate.recipe.kind,
      recipe: candidate.recipe,
    }),
  )

  return storiesFromGeneratedTakeDescriptors(
    descriptors,
    new Map([[baseStory.id, baseStory]]),
  )
}

export function createCannedTakeBatch({
  baseStory,
  baseMeta,
  prompt,
  count,
  seed,
}: LabGeneratedTakeRequest): LabGeneratedTakeBatch {
  const limitedCount = Math.max(1, Math.min(5, Math.floor(count)))
  const basedOnDesignPartId =
    baseStory.designPartId ?? baseMeta?.basedOnDesignPartId
  const descriptors: LabGeneratedTakeDescriptor[] = []

  for (let index = 0; index < limitedCount; index += 1) {
    descriptors.push(
      takeDescriptorFor(baseStory, basedOnDesignPartId, prompt, seed, index),
    )
  }

  return storiesFromGeneratedTakeDescriptors(
    descriptors,
    new Map([[baseStory.id, baseStory]]),
  )
}

export function storiesFromGeneratedTakeDescriptors(
  descriptors: readonly LabGeneratedTakeDescriptor[],
  baseStoriesById: ReadonlyMap<string, Story>,
  options: { readonly promoted?: boolean } = {},
): LabGeneratedTakeBatch {
  const passId = "live-design-pass"
  const passName = "Live design pass"
  const stories: Story[] = []
  const metaByStoryId: Record<string, LabDesignPassStoryMeta> = {}

  for (const descriptor of descriptors) {
    stories.push(storyFromDescriptor(descriptor, baseStoriesById))
    metaByStoryId[descriptor.id] = {
      role: "take",
      passId,
      passName,
      basedOnDesignPartId: descriptor.basedOnDesignPartId,
      prompt: descriptor.prompt,
      ...(options.promoted ? { promoted: true } : {}),
    }
  }

  return { stories, metaByStoryId, descriptors }
}

function takeDescriptorFor(
  baseStory: Story,
  basedOnDesignPartId: string | undefined,
  prompt: string,
  seed: number,
  index: number,
): LabGeneratedTakeDescriptor {
  if (basedOnDesignPartId === SHIFT_DESIGN_PARTS.statusBar.id) {
    const take = STATUS_BAR_TAKES[index % STATUS_BAR_TAKES.length]
    return {
      id: `generated-take-${seed}-${take.slug}-${index + 1}`,
      designPartId: `design-pass.generated.${seed}.${take.slug}.${index + 1}`,
      layer: baseStory.layer,
      name: take.name,
      note: `Generated from ${baseStory.name}`,
      surface: baseStory.surface,
      baseStoryId: baseStory.id,
      basedOnDesignPartId,
      prompt,
      variant: take.slug,
    }
  }

  return {
    id: `generated-take-${seed}-${index + 1}`,
    designPartId: `design-pass.generated.${seed}.${index + 1}`,
    layer: baseStory.layer,
    name: `${baseStory.name} take ${index + 1}`,
    note: `Generated from ${baseStory.name}`,
    surface: baseStory.surface,
    baseStoryId: baseStory.id,
    basedOnDesignPartId,
    prompt,
    variant: "clone",
  }
}

function storyFromDescriptor(
  descriptor: LabGeneratedTakeDescriptor,
  baseStoriesById: ReadonlyMap<string, Story>,
): Story {
  const isStatusBar =
    descriptor.basedOnDesignPartId === SHIFT_DESIGN_PARTS.statusBar.id
  const recipe =
    descriptor.recipe?.kind === "shift-status-bar-take-v1"
      ? descriptor.recipe
      : undefined
  const statusBarTake = STATUS_BAR_TAKES.find(
    take => take.slug === descriptor.variant,
  )
  const render =
    isStatusBar && recipe
      ? () => {
          const props = shiftStatusBarPropsFromRecipe(recipe)
          return (
            <ShiftPartFrame>
              <ShiftStatusBar
                time={shiftClockLabelForIso(DEFAULT_SHIFT_CLOCK_ISO)}
                avatarSrc={props.avatarSrc}
                battery={shiftBatteryPropsForPowerReading(props.battery)}
                network={props.network}
              />
            </ShiftPartFrame>
          )
        }
      : isStatusBar && statusBarTake
        ? () => (
            <ShiftPartFrame>
              <ShiftStatusBar
                time={shiftClockLabelForIso(DEFAULT_SHIFT_CLOCK_ISO)}
                avatarSrc={statusBarTake.avatar}
                battery={shiftBatteryPropsForPowerReading(statusBarTake.power)}
                network={statusBarTake.network}
              />
            </ShiftPartFrame>
          )
        : (baseStoriesById.get(descriptor.baseStoryId)?.render ??
          (() => descriptor.name))

  return {
    id: descriptor.id,
    designPartId: descriptor.designPartId,
    layer: descriptor.layer,
    name: descriptor.name,
    note: descriptor.note,
    surface: descriptor.surface,
    render,
  }
}
