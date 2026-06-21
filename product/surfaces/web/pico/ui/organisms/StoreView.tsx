/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Storefront: a featured-collection banner over a grid of store tiles.
 */
import type { PicoStoreItem } from "../../fixtures-extra"
import { Badge } from "../atoms/Badge"
import { Chip } from "../atoms/Chip"
import { Title } from "../atoms/Title"
import { Card } from "../molecules/Card"

export function StoreView({
  items,
}: {
  readonly items: readonly PicoStoreItem[]
}) {
  const featured = items[0]
  return (
    <>
      {featured ? (
        <div className="pcFut-store-banner">
          <div className="pcFut-store-banner-text">
            <div className="pc-sub">FEATURED COLLECTION</div>
            <Title size={1}>{featured.title}</Title>
            <p className="pcFut-store-blurb">
              Ports we hand-dusted to feel right in your palms. Fresh crates
              land every week.
            </p>
            <div className="pcFut-store-banner-meta">
              <Badge tone="good">{featured.price}</Badge>
              <Chip>{featured.source}</Chip>
            </div>
          </div>
          <span className="pcFut-store-banner-tag">{featured.tag}</span>
        </div>
      ) : null}
      <div className="pcFut-store-grid">
        {items.map((item, index) => (
          <Card
            key={item.id}
            className={`pcFut-store-tile ${index === 1 ? "sel" : ""}`}
          >
            <span className="pcFut-store-tile-art">
              {item.title.slice(0, 1)}
            </span>
            <div className="pcFut-store-tile-body">
              <div className="pcFut-store-tile-title">{item.title}</div>
              <div className="pcFut-store-tile-meta">
                <Chip>{item.tag}</Chip>
                <Badge tone="good">{item.price}</Badge>
              </div>
              <span className="pc-dim">via {item.source}</span>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
