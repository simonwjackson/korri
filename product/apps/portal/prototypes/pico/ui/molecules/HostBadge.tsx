/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * Maps a stream-host status to the palette-correct badge. Shared by the host
 * scan and host list.
 */
import type { PicoHost } from "../../fixtures-extra"
import { Badge } from "../../screens/kit"

export function HostBadge({ status }: { readonly status: PicoHost["status"] }) {
  if (status === "busy") return <Badge tone="accent">BUSY</Badge>
  if (status === "offline")
    return <span className="pcMd-badge-off">OFFLINE</span>
  if (status === "paired") return <Badge tone="good">PAIRED</Badge>
  return <Badge tone="good">ONLINE</Badge>
}
