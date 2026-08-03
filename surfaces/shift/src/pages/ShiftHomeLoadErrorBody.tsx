import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftHomeLoadErrorBody({
  message,
  onRetry,
}: {
  /** Host-supplied, already user-facing. Shift never interprets it. */
  readonly message?: string
  readonly onRetry: () => void
}) {
  return (
    <main
      data-shift-home
      className="intrinsic relative flex h-full w-full flex-col items-center justify-center gap-[var(--shift-space-1)] text-[color:var(--shift-ink)]"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.homeLoadError)}
    >
      <p className="opacity-90">Could not load library.</p>
      {message ? (
        <p className="max-w-[var(--shift-measure-prose)] text-[length:var(--shift-text-fine)] opacity-60">
          {message}
        </p>
      ) : null}
      <button type="button" onClick={onRetry} className="underline opacity-90">
        Retry
      </button>
    </main>
  )
}
