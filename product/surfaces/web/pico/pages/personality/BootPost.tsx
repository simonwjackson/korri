/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Voiced boot power-on self-test. Static (no data).
 */
import { PicoMascot } from "../../PicoMascot"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const BOOT_LINES: readonly string[] = [
  "PICO-8 OS  v2.4.1",
  "CPU ........ OK",
  "MEM 64K .... OK",
  "DISPLAY .... OK",
  "INPUT ...... OK",
  "CARTS ...... 247 FOUND",
  "DUSTING OFF CARTS…",
  "WAKING UP…",
  "READY.",
]

export function BootPost() {
  return (
    <ScreenShell hints={[{ key: "a", label: "SKIP" }]} className="pad-0">
      <div
        className="pcPer-post"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPost)}
      >
        <PicoMascot state="idle" className="pcMascot-lg pcPer-post-pixl" />
        <pre
          className="pcPer-post-lines"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPostLines)}
        >
          {BOOT_LINES.map((line, index) => (
            <span
              className="pcPer-post-line"
              style={{ animationDelay: `${index * 0.28}s` }}
              key={line}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPostLine)}
            >
              {line}
            </span>
          ))}
        </pre>
        <span
          className="pcPer-post-caret"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerPostCaret)}
        >
          █
        </span>
      </div>
    </ScreenShell>
  )
}
