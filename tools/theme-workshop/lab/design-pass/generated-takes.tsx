import {
  DEFAULT_SHIFT_CLOCK_ISO,
  shiftClockLabelForIso,
} from "@product/surfaces/web/shift/shift-clock-state"
import { SHIFT_DESIGN_PARTS } from "@product/surfaces/web/shift/shift-design-parts"
import { shiftBatteryPropsForPowerReading } from "@product/surfaces/web/shift/shift-power-state"
import { ShiftStatusBar } from "@product/surfaces/web/shift/ui/molecules/ShiftStatusBar"
import { ShiftPartFrame } from "@product/surfaces/web/shift/ui/ShiftPartFrame"
import type { Story } from "../../types"
import type { LabDesignPassStoryMeta } from "./design-pass-model"

export interface LabGeneratedTakeRequest {
  readonly surfaceId: string
  readonly baseStory: Story
  readonly baseMeta?: LabDesignPassStoryMeta
  readonly prompt: string
  readonly count: number
  readonly seed: number
}

export interface LabGeneratedTakeBatch {
  readonly stories: readonly Story[]
  readonly metaByStoryId: Readonly<Record<string, LabDesignPassStoryMeta>>
}

const STATUS_BAR_TAKES = [
  {
    slug: "airier",
    name: "Airier status bar",
    avatar: "https://i.pravatar.cc/96?u=korri-shift-airier",
    power: { percent: 92, charging: true },
    network: { _tag: "Connected", strengthPercent: 86 } as const,
  },
  {
    slug: "quiet",
    name: "Quiet status bar",
    avatar: "https://i.pravatar.cc/96?u=korri-shift-quiet",
    power: { percent: 68, charging: false },
    network: { _tag: "Connected", strengthPercent: 64 } as const,
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
    network: { _tag: "Connected", strengthPercent: 100 } as const,
  },
  {
    slug: "minimal",
    name: "Minimal status bar",
    avatar: "https://i.pravatar.cc/96?u=korri-shift-minimal",
    power: { percent: 24, charging: false },
    network: { _tag: "Connected", strengthPercent: 38 } as const,
  },
] as const

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
  const passId = "live-design-pass"
  const passName = "Live design pass"
  const stories: Story[] = []
  const metaByStoryId: Record<string, LabDesignPassStoryMeta> = {}

  for (let index = 0; index < limitedCount; index += 1) {
    const story = takeStoryFor(baseStory, basedOnDesignPartId, seed, index)
    stories.push(story)
    metaByStoryId[story.id] = {
      role: "take",
      passId,
      passName,
      basedOnDesignPartId,
      prompt,
    }
  }

  return { stories, metaByStoryId }
}

function takeStoryFor(
  baseStory: Story,
  basedOnDesignPartId: string | undefined,
  seed: number,
  index: number,
): Story {
  if (basedOnDesignPartId === SHIFT_DESIGN_PARTS.statusBar.id) {
    const take = STATUS_BAR_TAKES[index % STATUS_BAR_TAKES.length]
    return {
      id: `generated-take-${seed}-${take.slug}-${index + 1}`,
      designPartId: `design-pass.generated.${seed}.${take.slug}.${index + 1}`,
      layer: baseStory.layer,
      name: take.name,
      note: `Generated from ${baseStory.name}`,
      surface: baseStory.surface,
      render: () => (
        <ShiftPartFrame>
          <ShiftStatusBar
            time={shiftClockLabelForIso(DEFAULT_SHIFT_CLOCK_ISO)}
            avatarSrc={take.avatar}
            battery={shiftBatteryPropsForPowerReading(take.power)}
            network={take.network}
          />
        </ShiftPartFrame>
      ),
    }
  }

  return {
    id: `generated-take-${seed}-${index + 1}`,
    designPartId: `design-pass.generated.${seed}.${index + 1}`,
    layer: baseStory.layer,
    name: `${baseStory.name} take ${index + 1}`,
    note: `Generated from ${baseStory.name}`,
    surface: baseStory.surface,
    render: baseStory.render,
  }
}
