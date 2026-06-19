/**
 * theme-workshop — the "parts" view: the theme's component catalog.
 *
 * Renders the theme's `stories` grouped by atomic layer (atoms → templates),
 * each in a sized canvas that carries the theme's own `screen` scope (so its
 * tokens + skin resolve, exactly like a device-lab cell) inside neutral catalog
 * chrome. Homegrown — no Storybook, no CSF, no extra deps.
 */
import { cx, type ResolvedClassNames } from "./classnames"
import type { Story, StoryLayer } from "./types"

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
  if (import.meta.env.PROD) return null
  return (
    <div className="wk-parts">
      {LAYER_ORDER.map(layer => {
        const inLayer = stories.filter(story => story.layer === layer)
        if (inLayer.length === 0) return null
        return (
          <section className="wk-parts-group" key={layer}>
            <h2 className="wk-parts-gtitle">
              {LAYER_LABEL[layer]}
              <span className="wk-parts-gcount">{inLayer.length}</span>
            </h2>
            <div className="wk-parts-grid">
              {inLayer.map(story => (
                <figure className="wk-parts-cell" key={story.id}>
                  <div className="wk-part-stage">
                    <div className={cx("wk-part-canvas", cn.part)}>
                      {story.render()}
                    </div>
                  </div>
                  <figcaption className="wk-parts-label">
                    {story.name}
                    {story.note ? (
                      <span className="wk-parts-note"> · {story.note}</span>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
