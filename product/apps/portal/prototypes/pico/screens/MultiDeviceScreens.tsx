/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: MULTI-DEVICE — the surfaces Korri shows when more than one
 * screen, host, seat, or controller is in play: dual-screen primary/companion,
 * LAN stream-host discovery, host list, connection negotiation, seat metadata,
 * and controller pairing. Composed from screens/kit.tsx; screen-specific layout
 * in screens/multidevice.css (namespace pcMd-).
 *
 * Data comes from PicoLibrary (hero) + PicoHosts/PicoSeats via atoms (never a
 * fixture import).
 */
import { picoHeroAtom } from "../data/pico-library-atoms"
import { picoHostsAtom, picoSeatsAtom } from "../data/pico-devices-atoms"
import { PicoData } from "./PicoData"
import {
  Badge,
  Btn,
  Card,
  Glyph,
  List,
  PicoCart,
  PicoIcon,
  Progress,
  Row,
  Screen,
  Spinner,
  Stat,
  Title,
} from "./kit"

/** Maps a host status to the kit Badge tone the palette rules dictate. */
function hostBadge(status: "online" | "busy" | "paired" | "offline") {
  if (status === "busy") return <Badge tone="accent">BUSY</Badge>
  if (status === "offline")
    return <span className="pcMd-badge-off">OFFLINE</span>
  if (status === "paired") return <Badge tone="good">PAIRED</Badge>
  return <Badge tone="good">ONLINE</Badge>
}

/** The negotiation stepper stages, in order. */
const CONNECT_STEPS: readonly string[] = [
  "HANDSHAKE",
  "CODEC",
  "VIDEO",
  "INPUT",
]

export function DualPrimaryScreen() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ DUAL · PRIMARY">
      {hero => (
        <Screen
          title="PICO ▸ DUAL · PRIMARY"
          hints={[
            { key: "a", label: "LAUNCH" },
            { key: "y", label: "SWAP" },
          ]}
        >
          <div className="pcMd-companion-tag">
            <span className="pcMd-dot" />
            COMPANION CONNECTED · 65" 4K TV
          </div>
          <div className="pcMd-primary">
            <div className="pcMd-rail">
              <div className="pc-art sm">
                <PicoCart game={hero} showFav={false} />
              </div>
              <div className="pc-art sm pcMd-rail-side">
                <PicoCart game={hero} showFav={false} />
              </div>
              <div className="pc-art sm pcMd-rail-side">
                <PicoCart game={hero} showFav={false} />
              </div>
            </div>
            <div className="pcMd-primary-info">
              <Title size={1}>{hero.title}</Title>
              <div className="pc-sub">{hero.developer}</div>
              <div className="pcMd-launch-row">
                <Btn kind="primary">
                  <PicoIcon name="play" /> LAUNCH ON TV
                </Btn>
                <Btn>HERE</Btn>
              </div>
            </div>
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

export function DualCompanionScreen() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ DUAL · COMPANION">
      {hero => (
        <Screen className="pad-0">
          <div className="pcMd-companion">
            <div className="pcMd-companion-art">
              <div className="pc-art">
                <PicoCart game={hero} showFav={false} />
              </div>
            </div>
            <div className="pcMd-companion-overlay">
              <Title size={3}>{hero.title}</Title>
              <div className="pcMd-companion-dev">{hero.developer}</div>
            </div>
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

export function HostDiscoveryScreen() {
  return (
    <PicoData atom={picoHostsAtom} title="PICO ▸ HOSTS · SCAN">
      {hosts => (
        <Screen
          title="PICO ▸ HOSTS · SCAN"
          hints={[{ key: "b", label: "CANCEL" }]}
        >
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
                    trailing={hostBadge(host.status)}
                  />
                </div>
              ))}
            </List>
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

export function HostListScreen() {
  return (
    <PicoData atom={picoHostsAtom} title="PICO ▸ HOSTS">
      {hosts => (
        <Screen
          title="PICO ▸ HOSTS"
          hints={[
            { key: "a", label: "CONNECT" },
            { key: "b", label: "BACK" },
          ]}
        >
          <div className="pcMd-hosts">
            {hosts.map((host, index) => (
              <Card
                key={host.id}
                className={`pcMd-host ${index === 0 ? "sel" : ""} ${host.status === "offline" ? "off" : ""}`}
              >
                <div className="pcMd-host-head">
                  <span className="pcMd-host-name">{host.name}</span>
                  {hostBadge(host.status)}
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
              <PicoIcon name="play" /> CONNECT
            </Btn>
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

export function ConnectingScreen() {
  return (
    <Screen
      title="PICO ▸ CONNECT"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <div className="pcMd-connect">
        <Title size={1}>CONNECTING…</Title>
        <div className="pc-sub">DEN-RIG · 192.168.1.10</div>
        <div className="pcMd-steps">
          {CONNECT_STEPS.map((step, index) => (
            <span
              key={step}
              className={`pcMd-step ${index < 2 ? "done" : ""} ${index === 2 ? "active" : ""}`}
            >
              {step}
            </span>
          ))}
        </div>
        <Progress pct={58} />
        <div className="pc-dim">haggling over 1080p60 H.265…</div>
      </div>
    </Screen>
  )
}

export function SeatManagerScreen() {
  return (
    <PicoData atom={picoSeatsAtom} title="PICO ▸ SEATS">
      {seats => (
        <Screen
          title="PICO ▸ SEATS"
          hints={[
            { key: "a", label: "TOGGLE" },
            { key: "b", label: "BACK" },
          ]}
        >
          <List>
            {seats.map(seat => (
              <Row
                key={seat.id}
                icon="◉"
                label={seat.name}
                meta={
                  <span className="pcMd-seat-meta">
                    <span className="pcMd-seat-kind">{seat.kind}</span>
                    {seat.battery !== null ? (
                      <span className="pcMd-seat-batt">▮ {seat.battery}%</span>
                    ) : (
                      <span className="pcMd-seat-batt off">— AC</span>
                    )}
                  </span>
                }
                trailing={
                  <span className={`pcMd-active ${seat.active ? "on" : ""}`}>
                    {seat.active ? "ACTIVE" : "IDLE"}
                  </span>
                }
              />
            ))}
          </List>
        </Screen>
      )}
    </PicoData>
  )
}

export function PairingScreen() {
  return (
    <Screen
      title="PICO ▸ PAIR"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <div className="pcMd-pair">
        <Glyph tone="accent">
          <PicoIcon name="plus" />
        </Glyph>
        <Title size={1}>PAIR A CONTROLLER</Title>
        <div className="pcMd-code">8-4-2-7</div>
        <div className="pcMd-pair-wait">
          <Spinner />
          <span className="pc-sub">listening for a new pad…</span>
        </div>
        <p className="pc-hero-msg">hold SELECT + START to say hello</p>
      </div>
    </Screen>
  )
}
