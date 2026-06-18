/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * "Pixl" — the console's companion sprite, the OS's little face. A crisp pixel
 * creature (inline SVG, shape-rendering: crispEdges) sized in em so it rides the
 * intrinsic token scale. Idles with a bob + blink; states swap its mood. Lives
 * small + peripheral in the shared status bar so it never crowds the content.
 */
export type PicoMascotState = "idle" | "happy" | "sleep" | "peek"

export function PicoMascot({
  state = "idle",
  className,
}: {
  readonly state?: PicoMascotState
  readonly className?: string
}) {
  return (
    <span className={`pcMascot pcMascot-${state} ${className ?? ""}`} aria-hidden>
      <svg className="pcMascot-svg" viewBox="0 0 10 10">
        <title>Pixl</title>
        <g className="pcMascot-body">
          <rect x="3" y="1" width="4" height="1" />
          <rect x="2" y="2" width="6" height="1" />
          <rect x="2" y="3" width="6" height="4" />
          <rect x="2" y="7" width="1" height="1" />
          <rect x="4" y="7" width="1" height="1" />
          <rect x="6" y="7" width="1" height="1" />
        </g>
        <g className="pcMascot-eyes">
          <rect x="3" y="4" width="1" height="2" />
          <rect x="6" y="4" width="1" height="2" />
        </g>
        <g className="pcMascot-cheeks">
          <rect x="2" y="5" width="1" height="1" />
          <rect x="7" y="5" width="1" height="1" />
        </g>
      </svg>
      <span className="pcMascot-zzz">z</span>
    </span>
  )
}
