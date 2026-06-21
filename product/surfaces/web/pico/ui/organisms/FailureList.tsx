/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The launch-failure kinds, the active one highlighted.
 */
export type SessionFailure = {
  readonly kind: string
  readonly title: string
  readonly detail: string
}

export function FailureList({
  failures,
}: {
  readonly failures: readonly SessionFailure[]
}) {
  return (
    <div className="pcSes-fail-list pc-fill">
      {failures.map(failure => (
        <span
          key={failure.kind}
          className={`pcSes-fail ${failure.kind === "moonlight-failed" ? "active" : ""}`}
        >
          <b className="pcSes-fail-title">{failure.title}</b>
          <span className="pcSes-fail-detail">{failure.detail}</span>
        </span>
      ))}
    </div>
  )
}
