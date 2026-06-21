/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * LAN host discovery: a spinner + the hosts fading in as they're found.
 */
import type { PicoHost } from "../../fixtures-extra"
import { Spinner } from "../atoms/Spinner"
import { Title } from "../atoms/Title"
import { HostBadge } from "../molecules/HostBadge"
import { List } from "../molecules/List"
import { Row } from "../molecules/Row"

export function HostScanList({
  hosts,
}: {
  readonly hosts: readonly PicoHost[]
}) {
  return (
    <div className="pcMd-scan">
      <Spinner />
      <Title size={1}>SNIFFING OUT HOSTS…</Title>
      <div className="pc-sub">poking around 192.168.1.0/24 for friends</div>
      <List>
        {hosts.slice(0, 2).map((host, index) => (
          <div
            key={host.id}
            className={`pcMd-fade ${index === 0 ? "in" : "in-late"}`}
          >
            <Row
              icon="▤"
              label={host.name}
              meta={host.addr}
              trailing={<HostBadge status={host.status} />}
            />
          </div>
        ))}
      </List>
    </div>
  )
}
