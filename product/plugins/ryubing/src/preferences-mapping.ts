import type { LaunchPreferences } from "@platform/library/config/inheritable-fields"

/**
 * Translate launcher-neutral launch preferences (`preferences.launch`) into a
 * partial Ryubing authoring object, in Ryubing's own `settings.plugin` shape.
 * The result is deep-merged UNDER the launcher-specific plugin policy (plugin
 * wins) and decoded once, so the existing `renderRyubingConfig` path is reused
 * unchanged.
 *
 * Phase 1 maps only the two preferences whose native Ryubing form is verified
 * from `renderRyubingConfig`: `video.fullscreen` → `display.fullscreen`
 * (`start_fullscreen`) and `audio.volume` → `audio.volume` (`audio_volume`).
 *
 * A preference Ryubing cannot cleanly honor is simply not mapped:
 * - `video.resolution` — Switch has no absolute-pixel knob (base resolution is
 *   docked/handheld mode × a scale multiplier), so it is dropped.
 * - `video.aspect-ratio` — Ryubing's native aspect vocabulary differs from the
 *   shared strings; a verified value map is deferred to a later phase, so it is
 *   dropped for now rather than emitting an unverified value.
 */

type RyubingPreferenceInput = {
  display?: Record<string, unknown>
  audio?: Record<string, unknown>
}

export const translatePreferencesToRyubing = (
  launch: LaunchPreferences | undefined,
): RyubingPreferenceInput => {
  const result: RyubingPreferenceInput = {}
  const display: Record<string, unknown> = {}
  const audio: Record<string, unknown> = {}

  if (launch?.video?.fullscreen !== undefined) {
    display.fullscreen = launch.video.fullscreen
  }
  if (launch?.audio?.volume !== undefined) {
    audio.volume = launch.audio.volume
  }

  if (Object.keys(display).length > 0) result.display = display
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
 * Build the raw Ryubing policy input for decoding: shared preferences as the
 * base, the launcher-specific plugin policy overlaid on top (plugin wins).
 */
export const resolveRyubingPolicyInput = (input: {
  readonly preferences: { readonly launch?: LaunchPreferences } | undefined
  readonly plugin: Record<string, unknown> | undefined
}): Record<string, unknown> =>
  deepMerge(
    translatePreferencesToRyubing(input.preferences?.launch) as Record<
      string,
      unknown
    >,
    input.plugin ?? {},
  )
