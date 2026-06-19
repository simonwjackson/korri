/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * The search query line: the typed text + a blinking caret. Shared by the
 * search results screen and its no-results state.
 */
export function SearchQuery({ text }: { readonly text: string }) {
  return (
    <div className="pcLib-query">
      <span className="pcLib-query-text">{text}</span>
      <span className="pcLib-caret">▌</span>
    </div>
  )
}
