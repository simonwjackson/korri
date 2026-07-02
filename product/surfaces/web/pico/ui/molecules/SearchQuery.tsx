/**
 * pico surface. ATOMIC LAYER: molecule.
 *
 * The search query line: the typed text + a blinking caret. Shared by the
 * search results screen and its no-results state.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function SearchQuery({ text }: { readonly text: string }) {
  return (
    <div
      className="pcLib-query"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.searchQuery)}
    >
      <span
        className="pcLib-query-text"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcLibQueryText)}
      >
        {text}
      </span>
      <span
        className="pcLib-caret"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcLibCaret)}
      >
        ▌
      </span>
    </div>
  )
}
