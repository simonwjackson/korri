const RETROARCH_CONFIG_KEY_PATTERN = /^[A-Za-z0-9_]+$/

const RETROARCH_PLAINTEXT_CREDENTIAL_SETTING_KEYS = new Set([
  "cheevos_password",
  "cheevos_token",
  "network_cmd_password",
  "netplay_password",
  "netplay_spectate_password",
])

export function isRetroArchConfigKey(value: string): boolean {
  return RETROARCH_CONFIG_KEY_PATTERN.test(value)
}

export function isRetroArchPlaintextCredentialSettingKey(
  value: string,
): boolean {
  return RETROARCH_PLAINTEXT_CREDENTIAL_SETTING_KEYS.has(value)
}

export function validateNullableRetroArchHttpsUrl(
  value: string | null | undefined,
  label: string,
): string | undefined {
  if (value === undefined || value === null) return undefined

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return `${label} must be an https URL`
  }

  if (parsed.protocol !== "https:") {
    return `${label} must be an https URL`
  }

  return undefined
}
