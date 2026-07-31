import type { InputAdapter } from "./types"

/**
 * Turns taps and clicks into semantic actions.
 *
 * Touch lives here rather than in Kotlin because the WebView already sees it:
 * the shell translates hardware the web surface *cannot* see (gamepad buttons,
 * remote key codes), and asking it to hit-test the DOM would invert that.
 * The contract being honoured is "the app never sees raw device events", not
 * "every event must cross the bridge".
 *
 * Elements opt in by tagging themselves with their entry index and stable key.
 * The adapter emits `activate`, never a bare `confirm`, because a tap carries
 * *which* thing was chosen — see the note on `activate` in `types.ts`.
 */

export const ENTRY_INDEX_ATTRIBUTE = "data-entry-index"
export const ENTRY_KEY_ATTRIBUTE = "data-entry-key"

export interface PointerAdapterOptions {
  /** Defaults to `document`. */
  readonly target?: Pick<
    EventTarget,
    "addEventListener" | "removeEventListener"
  >
}

export function createPointerAdapter(
  options: PointerAdapterOptions = {},
): InputAdapter {
  const target = options.target ?? document

  return {
    name: "pointer",
    start(emit) {
      const onClick = (event: Event) => {
        const origin = event.target
        if (!(origin instanceof Element)) return

        // closest() so a tap on a label or sub-caption still counts as a tap
        // on its row — otherwise only the padding would be activatable.
        const tapped = origin.closest(`[${ENTRY_INDEX_ATTRIBUTE}]`)
        if (tapped === null) return

        const raw = tapped.getAttribute(ENTRY_INDEX_ATTRIBUTE)
        const key = tapped.getAttribute(ENTRY_KEY_ATTRIBUTE)
        if (raw === null || key === null || key === "") return
        if (!/^(0|[1-9]\d*)$/.test(raw)) return
        const index = Number(raw)
        if (!Number.isSafeInteger(index)) return

        emit({ type: "activate", index, key, source: "pointer" })
      }

      // `click` rather than `touchstart`: Android's WebView fires both, and
      // listening to touch would double-activate. click also arrives after
      // the gesture is committed, so a scroll-drag does not launch a game.
      target.addEventListener("click", onClick)
      return () => {
        target.removeEventListener("click", onClick)
      }
    },
  }
}
