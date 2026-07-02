/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Storefront: a featured-collection banner over a grid of store tiles.
 */
import type { PicoStoreItem } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
        <div
          className="pcFut-store-banner"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.storeView)}
        >
          <div
            className="pcFut-store-banner-text"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutStoreBannerText)}
          >
            <div
              className="pc-sub"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.sub)}
            >
              FEATURED COLLECTION
            </div>
            <Title size={1}>{featured.title}</Title>
            <p
              className="pcFut-store-blurb"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutStoreBlurb)}
            >
              Ports we hand-dusted to feel right in your palms. Fresh crates
              land every week.
            </p>
            <div
              className="pcFut-store-banner-meta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutStoreBannerMeta)}
            >
              <Badge tone="good">{featured.price}</Badge>
              <Chip>{featured.source}</Chip>
            </div>
          </div>
          <span
            className="pcFut-store-banner-tag"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutStoreBannerTag)}
          >
            {featured.tag}
          </span>
        </div>
      ) : null}
      <div
        className="pcFut-store-grid"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutStoreGrid)}
      >
        {items.map((item, index) => (
          <Card
            key={item.id}
            className={`pcFut-store-tile ${index === 1 ? "sel" : ""}`}
          >
            <span
              className="pcFut-store-tile-art"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutStoreTileArt)}
            >
              {item.title.slice(0, 1)}
            </span>
            <div
              className="pcFut-store-tile-body"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutStoreTileBody)}
            >
              <div
                className="pcFut-store-tile-title"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutStoreTileTitle)}
              >
                {item.title}
              </div>
              <div
                className="pcFut-store-tile-meta"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutStoreTileMeta)}
              >
                <Chip>{item.tag}</Chip>
                <Badge tone="good">{item.price}</Badge>
              </div>
              <span
                className="pc-dim"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
              >
                via {item.source}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
