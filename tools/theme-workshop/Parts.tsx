/**
 * theme-workshop — the "parts" view: the theme's component catalog.
 *
 * Renders the theme's `stories` grouped by atomic layer (atoms → templates),
 * each in a sized canvas that carries the theme's own `screen` scope (so its
 * tokens + skin resolve, exactly like a device-lab cell) inside neutral catalog
 * chrome. Homegrown — no Storybook, no CSF, no extra deps.
 */
import { type CSSProperties, useState } from "react"
import { cx, type ResolvedClassNames } from "./classnames"
import type { Story, StoryLayer } from "./types"

/** Catalog inspection-size bounds (px of the pinned --intrinsic-base). */
const MIN_BASE = 8
const MAX_BASE = 48
const STEP = 2
const DEFAULT_BASE = 14

const LAYER_ORDER: readonly StoryLayer[] = [
  "atom",
  "molecule",
  "organism",
  "template",
]
const LAYER_LABEL: Record<StoryLayer, string> = {
  atom: "ATOMS",
  molecule: "MOLECULES",
  organism: "ORGANISMS",
  template: "TEMPLATES",
}

export function Parts({
  stories,
  cn,
}: {
  readonly stories: readonly Story[]
  readonly cn: ResolvedClassNames
}) {
  const [base, setBase] = useState(DEFAULT_BASE)
  if (import.meta.env.PROD) return null
  return (
    <div
      className="wk-parts"
      style={{ "--wk-parts-base": `${base}px` } as CSSProperties}
    >
      <div className="wk-parts-tools">
        <span className="wk-parts-tools-label">SCALE</span>
        <button
          type="button"
          className="wk-control"
          aria-label="smaller"
          onClick={() => setBase(b => Math.max(MIN_BASE, b - STEP))}
        >
          −
        </button>
        <span className="wk-parts-tools-val">{base}px</span>
        <button
          type="button"
          className="wk-control"
          aria-label="larger"
          onClick={() => setBase(b => Math.min(MAX_BASE, b + STEP))}
        >
          +
        </button>
      </div>
      {LAYER_ORDER.map(layer => {
        const inLayer = stories.filter(story => story.layer === layer)
        if (inLayer.length === 0) return null
        return (
          <section
            className={cx("wk-parts-group", `wk-parts-group--${layer}`)}
            key={layer}
          >
            <h2 className="wk-parts-gtitle">
              {LAYER_LABEL[layer]}
              <span className="wk-parts-gcount">{inLayer.length}</span>
            </h2>
            <div className="wk-parts-grid">
              {inLayer.map(story => {
                // Bare + content-sized by default (tokens/skin, no frame); a
                // full-surface story (overlay/screen) or a template gets a sized
                // framed canvas so it doesn't collapse.
                const framed = story.surface === true || layer === "template"
                return (
                <figure className="wk-parts-cell" key={story.id}>
                  {framed ? (
                    <div className="wk-parts-frame">
                      <div className={cx("wk-parts-canvas", cn.screen)}>
                        {story.render()}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cx("wk-parts-canvas", "wk-parts-bare", cn.screen)}
                    >
                      {story.render()}
                    </div>
                  )}
                  <figcaption className="wk-parts-label">
                    {story.name}
                    {story.note ? (
                      <span className="wk-parts-note"> · {story.note}</span>
                    ) : null}
                  </figcaption>
                </figure>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
