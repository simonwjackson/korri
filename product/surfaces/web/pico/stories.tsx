/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * The workshop's "parts" (component catalog) story list — assembled
 * automatically. Each component co-locates a `<Component>.story.tsx` that
 * default-exports a {@link StorySpec}; this module globs them, infers the atomic
 * `layer` from the folder and the `name` from the filename, and hands the
 * workshop a flat `Story[]`. There is no registry to edit: add a component and
 * its `*.story.tsx` and it shows up in the right layer. See `story-spec.ts`
 * for the StorySpec contract.
 */
import type { Story, StoryLayer } from "@tools/theme-workshop"
import type { StorySpec } from "./story-spec"

const LAYER_OF: Record<string, StoryLayer> = {
  atoms: "atom",
  molecules: "molecule",
  organisms: "organism",
  templates: "template",
}
const LAYER_ORDER: Record<StoryLayer, number> = {
  page: 0,
  template: 1,
  organism: 2,
  molecule: 3,
  atom: 4,
}

const modules = import.meta.glob<{ default: StorySpec }>(
  "./ui/**/*.story.tsx",
  {
    eager: true,
  },
)

export const PICO_STORIES: readonly Story[] = Object.entries(modules)
  .flatMap(([path, mod]) => {
    const match = path.match(
      /\/ui\/(atoms|molecules|organisms|templates)\/(.+)\.story\.tsx$/,
    )
    if (!match) return []
    const layer = LAYER_OF[match[1]]
    if (!layer) return []
    const spec = mod.default
    const name = spec.name ?? match[2]
    return [
      {
        id: `${layer}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        layer,
        name,
        note: spec.note,
        surface: spec.presentation === "surface" ? true : undefined,
        render: spec.render,
      } satisfies Story,
    ]
  })
  .sort(
    (a, b) =>
      LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] ||
      a.name.localeCompare(b.name),
  )
