import { redactCredentialText } from "./security"

const SENSITIVE_LOG_FIELD_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "credential",
  "password",
  "secret",
  "token",
])

export interface AcquisitionLogger {
  readonly debug: (message: string, fields?: Record<string, unknown>) => void
  readonly info: (message: string, fields?: Record<string, unknown>) => void
  readonly warn: (message: string, fields?: Record<string, unknown>) => void
  readonly error: (message: string, fields?: Record<string, unknown>) => void
}

export const silentAcquisitionLogger: AcquisitionLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

export function safeAcquisitionLogFields(
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return sanitizeLogValue(fields) as Record<string, unknown>
}

function sanitizeLogValue(value: unknown): unknown {
  if (typeof value === "string") return redactCredentialText(value)
  if (value instanceof Error) return redactCredentialText(value.message)
  if (Array.isArray(value)) return value.map(sanitizeLogValue)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [
        key,
        sanitizeField(key, field),
      ]),
    )
  }
  return value
}

function sanitizeField(key: string, value: unknown): unknown {
  if (SENSITIVE_LOG_FIELD_NAMES.has(key.toLowerCase())) return "[REDACTED]"
  return sanitizeLogValue(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
