const ENABLED_VALUES = new Set(["1", "true", "yes"])

export function isStreamControlEnabled(env: NodeJS.ProcessEnv): boolean {
  return isEnabledValue(env.KORRI_STREAM_CONTROL_ENABLED)
}

// `isHeadlessSourceOnlyEnabled` was retired in federation v1 (R14 /
// zero-backwards-compat). The library/source split is now structural,
// not env-gated.

function isEnabledValue(value: string | undefined): boolean {
  return ENABLED_VALUES.has((value ?? "").trim().toLowerCase())
}
