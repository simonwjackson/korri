/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: MULTIPLAYER — the player-facing side of multi-device/multiplayer
 * (the device/host/seat plumbing lives in MultiDeviceScreens). This is a UI
 * MOCKUP pass to compare directions, so it deliberately shows:
 *   - both feels: art-forward/minimal (Lobby · Art) and playful retro ritual
 *     (Lobby · Crew);
 *   - all four player representations (Pixl / seat tag / avatar / pad) side by
 *     side (Player Styles) and applied in context;
 *   - both placements: a Players hub AND an inline seat strip.
 * Composed from screens/kit.tsx; layout in screens/multiplayer.css (pcMp-).
 *
 * Data comes from PicoParty (+ PicoLibrary game / PicoSocial friends) via atoms
 * (never a fixture import). Each screen reads ONE atom (`AsyncResult.all`).
 */

import {
  picoInlineStripAtom,
  picoPartyGameAtom,
  picoPartyHubAtom,
  picoPartySessionAtom,
  picoPlayersAtom,
} from "../data/pico-party-atoms"
import { picoFriendsAtom } from "../data/pico-social-atoms"
import type { PicoGame, PicoPlayer } from "../fixtures-extra"
import { PicoData } from "./PicoData"
import {
  Badge,
  Btn,
  Card,
  Dim,
  Glyph,
  PicoArtImage,
  PicoCart,
  PicoIcon,
  Player,
  type PlayerRep,
  Progress,
  Screen,
  Spinner,
  Stat,
  Sub,
  Title,
} from "./kit"

const activeOf = (players: readonly PicoPlayer[]): readonly PicoPlayer[] =>
  players.filter(player => player.status !== "open")

/** Wide pixelized key-art backdrop, dimmed for legibility. */
function HeroBackdrop({ game }: { readonly game: PicoGame | undefined }) {
  return game?.heroUrl ? (
    <PicoArtImage
      src={game.heroUrl}
      ratio={16 / 9}
      scale={2.6}
      className="pcMp-backdrop"
    />
  ) : null
}

/* ── Hub (art-forward "Players & Devices" home) ───────────────────────────── */
export function HubScreen() {
  return (
    <PicoData atom={picoPartyHubAtom} title="PICO ▸ PLAYERS">
      {({ game, players, friends }) => {
        const active = activeOf(players)
        return (
          <Screen
            title="PICO ▸ PLAYERS"
            hints={[
              { key: "a", label: "OPEN" },
              { key: "y", label: "START SESSION" },
              { key: "b", label: "BACK" },
            ]}
          >
            <div className="pcMp-hub">
              <Card className="pcMp-hub-session">
                {game?.art ? (
                  <PicoArtImage src={game.art} className="pcMp-hub-art" />
                ) : null}
                <div className="pcMp-hub-session-info">
                  <Dim>ACTIVE SESSION</Dim>
                  <Title size={1}>{game?.title ?? "—"}</Title>
                  <div className="pcMp-row">
                    {active.map(player => (
                      <Player key={player.id} player={player} rep="avatar" />
                    ))}
                  </div>
                  <Btn kind="primary">
                    <PicoIcon name="play" /> RESUME · {active.length}P
                  </Btn>
                </div>
              </Card>

              <div className="pcMp-hub-cols">
                <Card title="THIS DEVICE & SEATS" className="pcMp-hub-card">
                  {players.map(player => (
                    <div key={player.id} className="pcMp-hub-seat">
                      <Player player={player} rep="pad" />
                      <Dim>{player.controller}</Dim>
                    </div>
                  ))}
                </Card>
                <Card title="FRIENDS ONLINE" className="pcMp-hub-card">
                  {friends.slice(0, 4).map(friend => (
                    <div key={friend.id} className="pcMp-friend">
                      <span className={`pcMp-pres ${friend.status}`} />
                      <span className="pcMp-friend-name">{friend.name}</span>
                      <Dim>{friend.playing ?? friend.status}</Dim>
                    </div>
                  ))}
                </Card>
              </div>

              <Btn kind="primary">
                <PicoIcon name="plus" /> START A NEW SESSION
              </Btn>
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}

/* ── Player Styles (compare all four representations) ──────────────────────── */
export function PlayerStylesScreen() {
  const rows: readonly { readonly label: string; readonly rep: PlayerRep }[] = [
    { label: "PIXL MASCOT", rep: "mascot" },
    { label: "SEAT TAG", rep: "tag" },
    { label: "AVATAR", rep: "avatar" },
    { label: "CONTROLLER", rep: "pad" },
  ]
  return (
    <PicoData atom={picoPlayersAtom} title="PICO ▸ PLAYER STYLES">
      {players => (
        <Screen
          title="PICO ▸ PLAYER STYLES"
          hints={[{ key: "a", label: "PICK STYLE" }]}
        >
          <div className="pcMp-styles">
            {rows.map(row => (
              <div className="pcMp-styles-row" key={row.rep}>
                <div className="pcMp-styles-label">{row.label}</div>
                <div className="pcMp-row">
                  {players.map(player => (
                    <Player key={player.id} player={player} rep={row.rep} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

/* ── Lobby · Art-forward (feel 1: big art, players quiet along the bottom) ─── */
export function LobbyArtScreen() {
  return (
    <PicoData atom={picoPartySessionAtom} title="PICO ▸ LOBBY">
      {({ game, players }) => {
        const active = activeOf(players)
        return (
          <Screen
            title="PICO ▸ LOBBY"
            hints={[
              { key: "a", label: "READY" },
              { key: "y", label: "INVITE" },
              { key: "b", label: "LEAVE" },
            ]}
            className="pad-0"
          >
            <div className="pcMp-lobbyA">
              <HeroBackdrop game={game} />
              <div className="pcMp-lobbyA-head">
                {game?.logoUrl ? (
                  <PicoArtImage
                    src={game.logoUrl}
                    fit="contain"
                    scale={2.4}
                    className="pcMp-logo"
                  />
                ) : (
                  <Title size={2}>{game?.title ?? "LOBBY"}</Title>
                )}
                <Dim>WAITING FOR PLAYERS · {active.length}/4</Dim>
              </div>
              <div className="pcMp-lobbyA-seats">
                {players.map(player => (
                  <Player key={player.id} player={player} rep="avatar" />
                ))}
              </div>
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}

/* ── Lobby · Crew (feel 2: playful retro "gather your crew" ritual) ───────── */
export function LobbyCrewScreen() {
  return (
    <PicoData atom={picoPlayersAtom} title="PICO ▸ CREW">
      {players => (
        <Screen
          title="PICO ▸ CREW"
          hints={[
            { key: "a", label: "READY UP" },
            { key: "b", label: "BAIL" },
          ]}
          className="pad-0"
        >
          <div className="pcMp-crew">
            <div className="pcMp-crew-marquee">
              <span>★ GATHER YOUR CREW ★ GATHER YOUR CREW ★</span>
            </div>
            <div className="pcMp-crew-slots">
              {players.map(player => (
                <div
                  key={player.id}
                  className={`pcMp-crew-slot p${player.seat} ${player.status}`}
                >
                  <Player player={player} rep="mascot" />
                </div>
              ))}
            </div>
            <div className="pcMp-crew-foot">
              <Spinner /> 8BITBEN is squeezing in…
            </div>
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

/* ── Lobby · Ready & Countdown ────────────────────────────────────────────── */
export function CountdownScreen() {
  return (
    <PicoData atom={picoPartySessionAtom} title="PICO ▸ COUNTDOWN">
      {({ game, players }) => {
        const active = activeOf(players)
        return (
          <Screen className="pad-0">
            <div className="pcMp-count">
              <HeroBackdrop game={game} />
              <div className="pcMp-count-num">3</div>
              <Title size={1}>ALL PLAYERS READY</Title>
              <div className="pcMp-row pcMp-count-row">
                {active.map(player => (
                  <Player
                    key={player.id}
                    player={{ ...player, status: "ready" }}
                    rep="mascot"
                  />
                ))}
              </div>
              <Dim>LAUNCHING {game?.title?.toUpperCase()}…</Dim>
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}

/* ── Nearby devices (found, art-forward tiles) ────────────────────────────── */
export function NearbyScreen() {
  const devices: readonly {
    readonly id: string
    readonly name: string
    readonly icon: "pad" | "power" | "menu"
    readonly meta: string
    readonly near: boolean
  }[] = [
    {
      id: "d1",
      name: "THOR-DECK",
      icon: "pad",
      meta: "this room · 7ms",
      near: true,
    },
    { id: "d2", name: "DEN-RIG", icon: "power", meta: "LAN · 4ms", near: true },
    {
      id: "d3",
      name: '65" 4K TV',
      icon: "menu",
      meta: "cast target",
      near: true,
    },
    {
      id: "d4",
      name: "OFFICE-NUC",
      icon: "power",
      meta: "LAN · 11ms",
      near: false,
    },
  ]
  return (
    <Screen
      title="PICO ▸ NEARBY"
      hints={[
        { key: "a", label: "JOIN" },
        { key: "y", label: "RESCAN" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcMp-nearby-head">
        <Spinner /> <Dim>found {devices.length} nearby</Dim>
      </div>
      <div className="pcMp-nearby">
        {devices.map((device, index) => (
          <Card
            key={device.id}
            className={`pcMp-dev ${index === 0 ? "sel" : ""} ${device.near ? "" : "far"}`}
          >
            <Glyph tone="info">
              <PicoIcon name={device.icon} />
            </Glyph>
            <div className="pcMp-dev-name">{device.name}</div>
            <Dim>{device.meta}</Dim>
            {device.near ? <Badge tone="good">NEAR</Badge> : null}
          </Card>
        ))}
      </div>
    </Screen>
  )
}

/* ── Join by code / QR ────────────────────────────────────────────────────── */
const QR_BITS = [
  "#######.#.#######",
  "#.....#.##.#.....#",
  "#.###.#.##.#.###.#",
  "#.###.#....#.###.#",
  "#.###.#.##.#.###.#",
  "#.....#.#..#.....#",
  "#######.#.#######",
  "........##.......",
  "##.#.##..#.#.##.#.",
  "..####.##..###..#",
  "#.#..#.####.#..##",
  "....##..#.#.##.#..",
  "#######.#.#.#..##",
  "#.....#..####.#.#",
  "#.###.#.#..##.##.",
  "#.###.#.####..#.#",
  "#.....#.#.#.####.",
]
export function JoinCodeScreen() {
  return (
    <Screen
      title="PICO ▸ JOIN"
      hints={[{ key: "b", label: "BACK" }]}
      className="center"
    >
      <div className="pcMp-join">
        <div className="pcMp-qr" aria-hidden>
          {QR_BITS.map((rowBits, y) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static QR grid
            <div className="pcMp-qr-row" key={y}>
              {[...rowBits].map((bit, x) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: static QR grid
                  key={x}
                  className={bit === "#" ? "on" : ""}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="pcMp-join-side">
          <Title size={1}>SCAN TO JOIN</Title>
          <Sub>or enter the room code</Sub>
          <div className="pcMp-code">PICO-4F2A</div>
          <Dim>code refreshes every 60s</Dim>
        </div>
      </div>
    </Screen>
  )
}

/* ── Invite a friend (remote) ─────────────────────────────────────────────── */
export function InviteScreen() {
  return (
    <PicoData atom={picoFriendsAtom} title="PICO ▸ INVITE">
      {friends => (
        <Screen
          title="PICO ▸ INVITE"
          hints={[
            { key: "a", label: "INVITE" },
            { key: "b", label: "BACK" },
          ]}
        >
          <div className="pcMp-invite">
            {friends.map((friend, index) => (
              <div
                key={friend.id}
                className={`pcMp-invite-row ${index === 0 ? "sel" : ""} ${friend.status === "offline" ? "off" : ""}`}
              >
                <span className={`pcMp-pres ${friend.status}`} />
                <span className="pcMp-invite-name">{friend.name}</span>
                <Dim>
                  {friend.playing ? `playing ${friend.playing}` : friend.status}
                </Dim>
                {friend.status === "offline" ? (
                  <span className="pcMp-invite-cta off">—</span>
                ) : (
                  <span className="pcMp-invite-cta">INVITE</span>
                )}
              </div>
            ))}
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

/* ── Joining a session (connecting) ───────────────────────────────────────── */
const JOIN_STEPS = ["FOUND", "HANDSHAKE", "SYNC", "READY"] as const
export function JoiningScreen() {
  return (
    <PicoData atom={picoPartyGameAtom} title="PICO ▸ JOINING">
      {game => (
        <Screen
          title="PICO ▸ JOINING"
          hints={[{ key: "b", label: "CANCEL" }]}
          className="center"
        >
          <div className="pcMp-joining">
            {game?.art ? (
              <div className="pcMp-joining-art">
                <PicoCart game={game} showFav={false} />
              </div>
            ) : null}
            <Title size={1}>JOINING PIXELPETE’S GAME</Title>
            <div className="pcMp-steps">
              {JOIN_STEPS.map((step, index) => (
                <span
                  key={step}
                  className={`pcMp-step ${index < 2 ? "done" : ""} ${index === 2 ? "active" : ""}`}
                >
                  {step}
                </span>
              ))}
            </div>
            <Progress pct={66} />
            <Dim>syncing save + handing you seat P2…</Dim>
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

/* ── Couldn't connect (error / retry) ─────────────────────────────────────── */
export function JoinFailedScreen() {
  return (
    <Screen
      title="PICO ▸ JOIN"
      hints={[
        { key: "a", label: "RETRY" },
        { key: "b", label: "BACK" },
      ]}
      tone="alert"
      className="center"
    >
      <div className="pcMp-failed">
        <Glyph tone="bad">
          <PicoIcon name="close" />
        </Glyph>
        <Title size={1}>COULDN’T CONNECT</Title>
        <p className="pc-hero-msg">
          PIXELPETE’s session didn’t answer. They may have started, or the
          network dropped.
        </p>
        <div className="pcMp-failed-actions">
          <Btn kind="primary">
            <PicoIcon name="restart" /> RETRY
          </Btn>
          <Btn>PLAY SOLO</Btn>
        </div>
      </div>
    </Screen>
  )
}

/* ── Seat & controller assignment (reps in context) ───────────────────────── */
export function SeatAssignScreen() {
  return (
    <PicoData atom={picoPlayersAtom} title="PICO ▸ SEATS">
      {players => (
        <Screen
          title="PICO ▸ SEATS"
          hints={[
            { key: "a", label: "SWAP" },
            { key: "y", label: "ADD PAD" },
            { key: "b", label: "DONE" },
          ]}
        >
          <div className="pcMp-assign">
            {players.map(player => (
              <Card key={player.id} className={`pcMp-assign-row p${player.seat}`}>
                <span className="pcMp-assign-seat">P{player.seat}</span>
                <Player player={player} rep="mascot" />
                <div className="pcMp-assign-ctrl">
                  <PicoIcon name="pad" />
                  <Dim>{player.controller}</Dim>
                </div>
                <span className="pcMp-assign-act">
                  {player.status === "open" ? "PRESS START" : "SWAP"}
                </span>
              </Card>
            ))}
          </div>
        </Screen>
      )}
    </PicoData>
  )
}

/* ── In-session players HUD ───────────────────────────────────────────────── */
export function SessionHudScreen() {
  return (
    <PicoData atom={picoPartySessionAtom} title="PICO ▸ SESSION HUD">
      {({ game, players }) => {
        const active = activeOf(players)
        return (
          <Screen className="pad-0">
            <div className="pcMp-session">
              <HeroBackdrop game={game} />
              <div className="pcMp-session-grid">
                {active.map(player => (
                  <div key={player.id} className={`pcMp-hud p${player.seat}`}>
                    <Player player={{ ...player, status: "ready" }} rep="tag" />
                    <span className="pcMp-hud-lives">♥♥♥</span>
                    <Stat
                      label="pts"
                      value={(player.seat * 12480).toLocaleString()}
                    />
                    <span className="pcMp-hud-sig">
                      <PicoIcon name="wifi" />
                    </span>
                  </div>
                ))}
              </div>
              <div className="pcMp-session-foot">
                <Badge tone="good">CO-OP · {active.length}P</Badge>
                <Dim>{game?.title}</Dim>
              </div>
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}

/* ── Player joined / left toast ───────────────────────────────────────────── */
export function PlayerToastScreen() {
  return (
    <PicoData atom={picoPartySessionAtom} title="PICO ▸ TOAST">
      {({ game, players }) => {
        const joiner = players[2] ?? players[0]
        return (
          <Screen className="pad-0">
            <div className="pcMp-toastwrap">
              <HeroBackdrop game={game} />
              {joiner ? (
                <div className={`pcMp-toast p${joiner.seat}`}>
                  <Player
                    player={{ ...joiner, status: "ready" }}
                    rep="mascot"
                  />
                  <div className="pcMp-toast-text">
                    <b>
                      P{joiner.seat} · {joiner.name}
                    </b>
                    <span>joined the game</span>
                  </div>
                </div>
              ) : null}
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}

/* ── Inline seat strip (the no-hub placement) ─────────────────────────────── */
export function InlineStripScreen() {
  return (
    <PicoData atom={picoInlineStripAtom} title="PICO ▸ HOME">
      {({ games, players }) => (
        <Screen
          title="PICO ▸ HOME"
          hints={[
            { key: "a", label: "PLAY" },
            { key: "y", label: "INVITE" },
          ]}
          className="pad-0"
        >
          <div className="pcMp-inline">
            <div className="pcMp-inline-rail">
              {games.slice(0, 5).map((game, index) => (
                <div
                  key={game.id}
                  className={`pcMp-inline-cart ${index === 1 ? "on" : ""}`}
                >
                  <PicoCart game={game} showFav={false} />
                </div>
              ))}
            </div>
            <div className="pcMp-strip">
              <Dim>IN THIS SESSION</Dim>
              <div className="pcMp-strip-players">
                {players.map(player => (
                  <Player key={player.id} player={player} rep="mascot" />
                ))}
              </div>
            </div>
          </div>
        </Screen>
      )}
    </PicoData>
  )
}
