import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"

export function ShiftHomeLoadingBody() {
  return (
    <main
      data-shift-home
      className="intrinsic relative flex h-full w-full flex-col items-center justify-center text-[color:var(--shift-ink)]"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.homeLoading)}
    >
      <p className="opacity-70">Loading library…</p>
    </main>
  )
}
