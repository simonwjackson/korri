const CREDENTIAL_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp
  readonly replacement: string
}> = [
  {
    pattern: /(authorization:\s*\S+\s+)[^\s,]+/gi,
    replacement: "$1[REDACTED]",
  },
  {
    pattern: /\b(bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: "$1[REDACTED]",
  },
  {
    pattern: /(https?:\/\/[^:@\s]+:)[^@\s/]+(@)/gi,
    replacement: "$1[REDACTED]$2",
  },
  { pattern: /(api[_-]?key=)[^&\s]+/gi, replacement: "$1[REDACTED]" },
  { pattern: /(token=)[^&\s]+/gi, replacement: "$1[REDACTED]" },
  { pattern: /(password=)[^&\s]+/gi, replacement: "$1[REDACTED]" },
]

export function redactCredentialText(input: string): string {
  return CREDENTIAL_PATTERNS.reduce(
    (text, { pattern, replacement }) => text.replace(pattern, replacement),
    input,
  )
}
