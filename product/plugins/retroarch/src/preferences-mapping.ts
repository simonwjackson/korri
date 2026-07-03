import type { LaunchPreferences } from "@platform/library/config/inheritable-fields"

/**
 * Translate launcher-neutral launch preferences (`preferences.launch`) into a
 * partial RetroArch authoring object, in RetroArch's own `settings.plugin`
 * shape. The result is deep-merged UNDER the launcher-specific plugin policy
 * (plugin wins) and decoded once, so the existing config rendering path is
 * reused unchanged.
 *
 * Phase 1 maps only the two preferences whose native RetroArch form is verified
 * and value-domain-clean:
 * - `video.fullscreen` → `video.fullscreen` (`video_fullscreen`)
 * - `video.resolution` → `video.fullscreenWidth`/`fullscreenHeight`
 *   (`video_fullscreen_x`/`_y`)
 *
 * A preference RetroArch cannot cleanly honor is simply not mapped:
 * - `video.aspect-ratio` — RetroArch's native `aspectRatio` is an index-mode
 *   enum (`config`/`core-provided`/`custom`/…), not a `"16:9"` ratio string; a
 *   specific ratio needs a parsed custom float. Deferred.
 * - `audio.volume` — RetroArch's `audio.volumeDb` is in decibels, not a 0–100
 *   percent; a documented unit conversion is deferred.
 */

type RetroarchPreferenceInput = {
  video?: Record<string, unknown>
}

export const translatePreferencesToRetroarch = (
  launch: LaunchPreferences | undefined,
): RetroarchPreferenceInput => {
  const result: RetroarchPreferenceInput = {}
  const video: Record<string, unknown> = {}

  const v = launch?.video
  if (v?.fullscreen !== undefined) video.fullscreen = v.fullscreen
  if (v?.resolution !== undefined) {
    video.fullscreenWidth = v.resolution.width
    video.fullscreenHeight = v.resolution.height
  }

  if (Object.keys(video).length > 0) result.video = video
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
 * Build the raw RetroArch policy input for decoding: shared preferences as the
 * base, the launcher-specific plugin policy overlaid on top (plugin wins).
 */
export const resolveRetroarchPolicyInput = (input: {
  readonly preferences: { readonly launch?: LaunchPreferences } | undefined
  readonly plugin: Record<string, unknown> | undefined
}): Record<string, unknown> =>
  deepMerge(
    translatePreferencesToRetroarch(input.preferences?.launch) as Record<
      string,
      unknown
    >,
    input.plugin ?? {},
  )
