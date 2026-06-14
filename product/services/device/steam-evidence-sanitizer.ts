export interface SteamEvidenceSanitizerOptions {
  readonly maxLength?: number
}

const DEFAULT_MAX_LENGTH = 240
const SECRET_ASSIGNMENT =
  /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|AUTH)[A-Z0-9_]*)=([^\s"']+)/gi
const SECRET_FLAG =
  /(--(?:token|secret|password|pass|key|auth)\b)(?:=|\s+)([^\s"']+)/gi

export function sanitizeSteamEvidenceExcerpt(
  value: unknown,
  options: SteamEvidenceSanitizerOptions = {},
): string {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH
  let text = value instanceof Error ? value.message : String(value ?? "")
  text = text.replace(/\0/g, "\\0")
  text = text.replace(/file:\/\/[^\s"']+/gi, "file://<redacted>")
  text = text.replace(/\/home\/[^\s"']+/g, "/home/<redacted>")
  text = text.replace(/userdata\/\d+/g, "userdata/<steam-user-id>")
  text = text.replace(
    /([?&](?:token|key|secret|password|auth|session)=)[^\s"']+/gi,
    "$1<redacted>",
  )
  text = text.replace(SECRET_ASSIGNMENT, "$1=<redacted>")
  text = text.replace(SECRET_FLAG, "$1 <redacted>")
  return clamp(text, maxLength)
}

export function clampSteamEvidenceArray<T>(
  values: readonly T[],
  limit: number,
): readonly T[] {
  if (values.length <= limit) return values
  return values.slice(values.length - limit)
}

function clamp(value: string, maxLength: number): string {
  if (maxLength <= 0) return ""
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}
