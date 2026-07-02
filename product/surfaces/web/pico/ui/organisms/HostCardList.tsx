/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The discovered stream hosts as cards (name/status/addr/latency), first
 * selected, with a connect CTA.
 */
import type { PicoHost } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../atoms/Btn"
import { Icon } from "../atoms/Icon"
import { Stat } from "../atoms/Stat"
import { Card } from "../molecules/Card"
import { HostBadge } from "../molecules/HostBadge"

export function HostCardList({
  hosts,
}: {
  readonly hosts: readonly PicoHost[]
}) {
  return (
    <>
      <div
        className="pcMd-hosts"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.hostCardList)}
      >
        {hosts.map((host, index) => (
          <Card
            key={host.id}
            className={`pcMd-host ${index === 0 ? "sel" : ""} ${host.status === "offline" ? "off" : ""}`}
          >
            <div
              className="pcMd-host-head"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdHostHead)}
            >
              <span
                className="pcMd-host-name"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdHostName)}
              >
                {host.name}
              </span>
              <HostBadge status={host.status} />
            </div>
            <div
              className="pcMd-host-meta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdHostMeta)}
            >
              <span
                className="pcMd-host-addr"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdHostAddr)}
              >
                {host.addr}
              </span>
              <Stat
                label="ms"
                value={host.latencyMs === null ? "—" : host.latencyMs}
              />
            </div>
          </Card>
        ))}
      </div>
      <div
        className="pcMd-host-cta"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdHostCta)}
      >
        <Btn kind="primary">
          <Icon name="play" /> CONNECT
        </Btn>
      </div>
    </>
  )
}
