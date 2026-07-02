/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * A list of named collections with a count badge, first row selected. Leaf
 * atoms (List/Row/Badge) still come from the kit barrel until they migrate.
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Badge } from "../atoms/Badge"
import { List } from "../molecules/List"
import { Row } from "../molecules/Row"

export type Collection = { readonly name: string; readonly count: number }

export function CollectionList({
  collections,
}: {
  readonly collections: readonly Collection[]
}) {
  return (
    <List partAttrs={picoDesignPartAttrs(PICO_DESIGN_PARTS.collectionList)}>
      {collections.map((collection, index) => (
        <Row
          key={collection.name}
          icon="▣"
          label={collection.name}
          trailing={<Badge tone="accent">{collection.count}</Badge>}
          state={index === 0 ? "selected" : "default"}
        />
      ))}
    </List>
  )
}
