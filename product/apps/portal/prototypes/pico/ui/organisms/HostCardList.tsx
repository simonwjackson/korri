/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The discovered stream hosts as cards (name/status/addr/latency), first
 * selected, with a connect CTA.
 */
import type { PicoHost } from "../../fixtures-extra"
import { Btn, Card, Stat } from "../../screens/kit"
import { Icon } from "../atoms/Icon"
import { HostBadge } from "../molecules/HostBadge"

export function HostCardList({ hosts }: { readonly hosts: readonly PicoHost[] }) {
  return (
    <>
      <div className="pcMd-hosts">
        {hosts.map((host, index) => (
          <Card
            key={host.id}
            className={`pcMd-host ${index === 0 ? "sel" : ""} ${host.status === "offline" ? "off" : ""}`}
          >
            <div className="pcMd-host-head">
              <span className="pcMd-host-name">{host.name}</span>
              <HostBadge status={host.status} />
            </div>
            <div className="pcMd-host-meta">
              <span className="pcMd-host-addr">{host.addr}</span>
              <Stat
                label="ms"
                value={host.latencyMs === null ? "—" : host.latencyMs}
              />
            </div>
          </Card>
        ))}
      </div>
      <div className="pcMd-host-cta">
        <Btn kind="primary">
          <Icon name="play" /> CONNECT
        </Btn>
      </div>
    </>
  )
}
