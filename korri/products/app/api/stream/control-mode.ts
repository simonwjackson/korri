const ENABLED_VALUES = new Set(["1", "true", "yes"])

export function isStreamControlEnabled(env: NodeJS.ProcessEnv): boolean {
  return isEnabledValue(env.KORRI_STREAM_CONTROL_ENABLED)
}

export function isHeadlessSourceOnlyEnabled(env: NodeJS.ProcessEnv): boolean {
  return isEnabledValue(env.KORRI_HEADLESS_SOURCE_ONLY)
}

function isEnabledValue(value: string | undefined): boolean {
  return ENABLED_VALUES.has((value ?? "").trim().toLowerCase())
}
