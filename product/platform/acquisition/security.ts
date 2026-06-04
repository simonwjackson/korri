const CREDENTIAL_PATTERNS = [
  /(authorization:\s*\S+\s+)[^\s,]+/gi,
  /(api[_-]?key=)[^&\s]+/gi,
  /(token=)[^&\s]+/gi,
  /(password=)[^&\s]+/gi,
]

export function redactCredentialText(input: string): string {
  return CREDENTIAL_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "$1[REDACTED]"),
    input,
  )
}
