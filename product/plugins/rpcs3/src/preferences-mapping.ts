import type { LaunchPreferences } from "@platform/library/config/inheritable-fields"

/**
 * Translate launcher-neutral launch preferences (`preferences.launch`) into a
 * partial RPCS3 authoring object, in RPCS3's own `settings.plugin` shape. The
 * result is deep-merged UNDER the launcher-specific plugin policy (plugin
 * wins) and decoded once, so the existing `routeSettings` path is reused
 * unchanged.
 *
 * A preference RPCS3 cannot honor is simply not mapped — no error, no key.
 * That is why capability gaps (an aspect ratio RPCS3 does not support) drop
 * cleanly instead of failing decode.
 */

/** Aspect ratios RPCS3's native `video_aspect` enum can express. */
const RPCS3_ASPECT_RATIOS: ReadonlySet<string> = new Set(["16:9", "4:3"])

type Rpcs3PreferenceInput = {
  video?: Record<string, unknown>
  audio?: Record<string, unknown>
}

export const translatePreferencesToRpcs3 = (
  launch: LaunchPreferences | undefined,
): Rpcs3PreferenceInput => {
  const result: Rpcs3PreferenceInput = {}
  const video: Record<string, unknown> = {}
  const audio: Record<string, unknown> = {}

  const v = launch?.video
  if (v?.fullscreen !== undefined) video.fullscreen = v.fullscreen
  if (v?.resolution !== undefined) {
    video.resolution = `${v.resolution.width}x${v.resolution.height}`
  }
  const aspectRatio = v?.["aspect-ratio"]
  if (aspectRatio !== undefined && RPCS3_ASPECT_RATIOS.has(aspectRatio)) {
    video.aspectRatio = aspectRatio
  }

  const a = launch?.audio
  if (a?.volume !== undefined) audio.volume = a.volume

  if (Object.keys(video).length > 0) result.video = video
  if (Object.keys(audio).length > 0) result.audio = audio
  return result
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Deep-merge `overlay` onto `base`; overlay (plugin-specific) wins scalars. */
const deepMerge = (
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    const prior = merged[key]
    merged[key] =
      isPlainObject(prior) && isPlainObject(value)
        ? deepMerge(prior, value)
        : value
  }
  return merged
}

/**
 * Build the raw RPCS3 policy input for decoding: shared preferences as the
 * base, the launcher-specific plugin policy overlaid on top (plugin wins).
 */
export const resolveRpcs3PolicyInput = (input: {
  readonly preferences: { readonly launch?: LaunchPreferences } | undefined
  readonly plugin: Record<string, unknown> | undefined
}): Record<string, unknown> =>
  deepMerge(
    translatePreferencesToRpcs3(input.preferences?.launch) as Record<
      string,
      unknown
    >,
    input.plugin ?? {},
  )
