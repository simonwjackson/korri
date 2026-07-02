/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The launch-failure kinds, the active one highlighted.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
    <div
      className="pcSes-fail-list pc-fill"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.failureList)}
    >
      {failures.map(failure => (
        <span
          key={failure.kind}
          className={`pcSes-fail ${failure.kind === "moonlight-failed" ? "active" : ""}`}
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSesFail)}
        >
          <b
            className="pcSes-fail-title"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSesFailTitle)}
          >
            {failure.title}
          </b>
          <span
            className="pcSes-fail-detail"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSesFailDetail)}
          >
            {failure.detail}
          </span>
        </span>
      ))}
    </div>
  )
}
