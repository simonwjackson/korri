/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Voiced boot power-on self-test. Static (no data).
 */
import { PicoMascot } from "../../screens/kit"
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
      <div className="pcPer-post">
        <PicoMascot state="idle" className="pcMascot-lg pcPer-post-pixl" />
        <pre className="pcPer-post-lines">
          {BOOT_LINES.map((line, index) => (
            <span
              className="pcPer-post-line"
              style={{ animationDelay: `${index * 0.28}s` }}
              key={line}
            >
              {line}
            </span>
          ))}
        </pre>
        <span className="pcPer-post-caret">█</span>
      </div>
    </ScreenShell>
  )
}
