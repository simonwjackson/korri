/**
 * The single source of truth for korri-cli exit codes and command reporting.
 *
 * Every command produces a `CliOutcome`; only `renderOutcome` turns an outcome
 * into text plus a number. No command invents its own exit codes.
 *
 * Codes live in the shell-safe zone: 0/1/2/130 reuse universal conventions,
 * 3-10 are free application codes, and nothing touches the reserved 126-165 or
 * 255 range.
 */
export const ExitCode = {
  ok: 0,
  internal: 1,
  usage: 2,
  notFound: 3,
  ambiguous: 4,
  hostUnreachable: 5,
  hostServiceOff: 6,
  notConfigured: 7,
  launchInvalid: 8,
  hostRefused: 9,
  launchFailed: 10,
  cancelled: 130,
} as const

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode]

/** The kinds of failure the CLI can report, one per exit code. */
export type CliFailureKind =
  | "internal"
  | "usage"
  | "not-found"
  | "ambiguous"
  | "host-unreachable"
  | "host-service-off"
  | "not-configured"
  | "launch-invalid"
  | "host-refused"
  | "launch-failed"
  | "cancelled"

const FAILURE_CODES: Record<CliFailureKind, ExitCode> = {
  internal: ExitCode.internal,
  usage: ExitCode.usage,
  "not-found": ExitCode.notFound,
  ambiguous: ExitCode.ambiguous,
  "host-unreachable": ExitCode.hostUnreachable,
  "host-service-off": ExitCode.hostServiceOff,
  "not-configured": ExitCode.notConfigured,
  "launch-invalid": ExitCode.launchInvalid,
  "host-refused": ExitCode.hostRefused,
  "launch-failed": ExitCode.launchFailed,
  cancelled: ExitCode.cancelled,
}

export function codeForFailure(kind: CliFailureKind): ExitCode {
  return FAILURE_CODES[kind]
}

export interface CliFailure {
  readonly kind: CliFailureKind
  readonly message: string
  /** Extra lines: diagnostics, candidate lists, stderr tails. */
  readonly details?: readonly string[]
}

export type CliOutcome =
  | { readonly _tag: "Ok"; readonly lines?: readonly string[] }
  | { readonly _tag: "Failure"; readonly failure: CliFailure }

export interface RenderedOutcome {
  readonly text: readonly string[]
  readonly code: ExitCode
}

/** The only place that maps an outcome to its text lines and exit code. */
export function renderOutcome(outcome: CliOutcome): RenderedOutcome {
  if (outcome._tag === "Ok") {
    return { text: outcome.lines ?? [], code: ExitCode.ok }
  }
  const { message, details } = outcome.failure
  return {
    text: [message, ...(details ?? [])],
    code: codeForFailure(outcome.failure.kind),
  }
}

export function ok(lines?: readonly string[]): CliOutcome {
  return { _tag: "Ok", lines }
}

export function fail(
  kind: CliFailureKind,
  message: string,
  details?: readonly string[],
): CliOutcome {
  return { _tag: "Failure", failure: { kind, message, details } }
}
