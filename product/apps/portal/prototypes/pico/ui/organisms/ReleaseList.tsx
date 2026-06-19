/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The list of release "flavors" a cart ships in (app · system · runtime · size),
 * with the recommended one selected and an INSTALLED/GET badge per row. Leaf
 * atoms (List/Row/Badge) still come from the kit barrel until they migrate.
 */
import type { PicoRelease } from "../../fixtures-extra"
import { Badge, List, Row } from "../../screens/kit"

export function ReleaseList({
  releases,
}: {
  readonly releases: readonly PicoRelease[]
}) {
  return (
    <List>
      {releases.map(release => (
        <Row
          key={release.id}
          sel={release.recommended}
          icon={release.recommended ? "▸" : " "}
          label={release.app}
          meta={`${release.system}${release.runtime ? ` · ${release.runtime}` : ""} · ${release.size}`}
          trailing={
            release.installed ? (
              <Badge tone="good">INSTALLED</Badge>
            ) : (
              <Badge>GET</Badge>
            )
          }
        />
      ))}
    </List>
  )
}
