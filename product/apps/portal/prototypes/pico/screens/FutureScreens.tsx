/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: FUTURE — aspirational surfaces Korri does NOT have yet:
 * friends/presence, activity feed, achievements, leaderboards, profile, cloud
 * save-conflict, storefront, game-of-the-day. Pure 8-bit fan-fiction so the
 * device-lab has something to dream against. Composed from screens/kit.tsx;
 * screen-specific layout in screens/future.css (namespace pcFut-).
 */
import {
  Badge,
  Btn,
  Card,
  Chip,
  List,
  PicoCart,
  Progress,
  Row,
  Screen,
  Stat,
  Tabs,
  Title,
} from "./kit"
import { picoGames } from "../fixtures"
import {
  picoAchievements,
  picoFriends,
  picoHero,
  picoScores,
  picoStoreItems,
} from "../fixtures-extra"

function statusClass(status: string): string {
  if (status === "playing" || status === "online") return "on"
  if (status === "away") return "away"
  return "off"
}

export function FriendsScreen() {
  const playing = picoFriends.filter(friend => friend.status === "playing")
  const online = picoFriends.filter(
    friend => friend.status === "online" || friend.status === "away",
  )
  const offline = picoFriends.filter(friend => friend.status === "offline")
  return (
    <Screen
      title="PICO ▸ FRIENDS"
      hints={[
        { key: "a", label: "JOIN" },
        { key: "y", label: "INVITE" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcFut-friends">
        {[
          { label: "PLAYING NOW", list: playing },
          { label: "ONLINE", list: online },
          { label: "OFFLINE", list: offline },
        ].map(group =>
          group.list.length === 0 ? null : (
            <div key={group.label} className="pcFut-group">
              <div className="pcFut-group-h">
                {group.label}
                <span className="pc-dim"> · {group.list.length}</span>
              </div>
              <List>
                {group.list.map((friend, index) => (
                  <Row
                    key={friend.id}
                    sel={group.label === "PLAYING NOW" && index === 0}
                    icon={
                      <span
                        className={`pcFut-ava ${statusClass(friend.status)}`}
                      >
                        {friend.name.slice(0, 2)}
                      </span>
                    }
                    label={friend.name}
                    meta={
                      friend.playing
                        ? `playing ${friend.playing}`
                        : friend.status.toUpperCase()
                    }
                    trailing={
                      <span
                        className={`pcFut-dot ${statusClass(friend.status)}`}
                      />
                    }
                  />
                ))}
              </List>
            </div>
          ),
        )}
      </div>
    </Screen>
  )
}

const FEED: readonly {
  readonly actor: string
  readonly verb: string
  readonly target: string
  readonly when: string
  readonly you: boolean
}[] = [
  {
    actor: "PIXELPETE",
    verb: "unlocked",
    target: "SPEEDRUNNER",
    when: "2m ago",
    you: false,
  },
  {
    actor: "RETRORHEA",
    verb: "started",
    target: "Hollow Knight",
    when: "14m ago",
    you: false,
  },
  {
    actor: "YOU",
    verb: "beat",
    target: "World 3",
    when: "1h ago",
    you: true,
  },
  {
    actor: "8BITBEN",
    verb: "topped the board on",
    target: "Celeste",
    when: "3h ago",
    you: false,
  },
  {
    actor: "MEGAMARA",
    verb: "favorited",
    target: "Sonic Robo Blast 2",
    when: "yesterday",
    you: false,
  },
]

export function ActivityFeedScreen() {
  return (
    <Screen
      title="PICO ▸ ACTIVITY"
      hints={[
        { key: "a", label: "OPEN" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcFut-feed">
        {FEED.map((item, index) => (
          <div
            key={`${item.actor}-${item.target}`}
            className={`pcFut-feed-row ${index === 0 ? "fresh" : ""}`}
          >
            <span className={`pcFut-ava ${item.you ? "you" : "on"}`}>
              {item.actor.slice(0, 2)}
            </span>
            <span className="pcFut-feed-text">
              <span className="pcFut-feed-line">
                <b className={item.you ? "pcFut-you" : ""}>{item.actor}</b>{" "}
                {item.verb} <span className="pcFut-target">{item.target}</span>
              </span>
              <span className="pc-dim pcFut-when">{item.when}</span>
            </span>
          </div>
        ))}
      </div>
    </Screen>
  )
}

export function AchievementsScreen() {
  const unlocked = picoAchievements.filter(a => a.unlocked).length
  const total = picoAchievements.length
  return (
    <Screen
      title="PICO ▸ TROPHIES"
      hints={[
        { key: "a", label: "DETAILS" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcFut-ach-summary">
        <Title size={0}>ACHIEVEMENTS</Title>
        <Badge tone="accent">
          {unlocked} / {total}
        </Badge>
      </div>
      <div className="pcFut-ach-toast">
        <span className="pcFut-ach-toast-ico">★</span>
        <span className="pcFut-ach-toast-text">
          <b>UNLOCKED · NIGHT OWL</b>
          Play after midnight · just now
        </span>
        <Badge tone="good">+10</Badge>
      </div>
      <List>
        {picoAchievements.map((ach, index) => (
          <Row
            key={ach.id}
            sel={index === 1}
            icon={
              <span
                className={`pcFut-ach-ico ${ach.unlocked ? "got" : "locked"}`}
              >
                {ach.unlocked ? "★" : "✦"}
              </span>
            }
            label={
              <span className={ach.unlocked ? "" : "pc-dim"}>{ach.name}</span>
            }
            meta={ach.unlocked ? ach.desc : `LOCKED · ${ach.desc}`}
            trailing={
              <span className={`pcFut-rarity r-${ach.rarity.toLowerCase()}`}>
                {ach.rarity}
              </span>
            }
          />
        ))}
      </List>
    </Screen>
  )
}

export function LeaderboardScreen() {
  return (
    <Screen
      title="PICO ▸ RANKS"
      hints={[
        { key: "a", label: "VIEW" },
        { key: "y", label: "SCOPE" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcFut-lb-head">
        <Title size={0}>CELESTE · TIME ATTACK</Title>
        <Tabs items={["FRIENDS", "GLOBAL"]} sel={0} />
      </div>
      <div className="pcFut-lb">
        <div className="pcFut-lb-row head">
          <span className="pcFut-lb-rank">#</span>
          <span className="pcFut-lb-name">PLAYER</span>
          <span className="pcFut-lb-score">SCORE</span>
        </div>
        {picoScores.map(row => (
          <div
            key={`${row.rank}-${row.name}`}
            className={`pcFut-lb-row ${row.you ? "you" : ""}`}
          >
            <span className="pcFut-lb-rank">
              {row.rank <= 3 ? ["①", "②", "③"][row.rank - 1] : row.rank}
            </span>
            <span className="pcFut-lb-name">{row.name}</span>
            <span className="pcFut-lb-score">{row.score}</span>
          </div>
        ))}
      </div>
    </Screen>
  )
}

export function ProfileScreen() {
  return (
    <Screen
      title="PICO ▸ PROFILE"
      hints={[
        { key: "a", label: "EDIT" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcFut-prof-head">
        <span className="pcFut-prof-ava">PJ</span>
        <div className="pcFut-prof-id">
          <Title size={1}>PIXELJ</Title>
          <div className="pc-sub">LEVEL 24 · ROVING ROMHACKER</div>
          <div className="pcFut-prof-xp">
            <Progress pct={68} />
            <span className="pc-dim">6,820 / 10,000 XP</span>
          </div>
        </div>
      </div>
      <div className="pcFut-prof-stats">
        <Stat label="GAMES" value={picoGames.length} />
        <Stat label="PLAYTIME" value="312h" />
        <Stat label="TROPHIES" value="3 / 5" />
        <Stat label="FRIENDS" value={picoFriends.length} />
      </div>
      <Card title="FAVORITE GENRES">
        <div className="pcFut-prof-chips">
          <Chip>PLATFORMER</Chip>
          <Chip>METROIDVANIA</Chip>
          <Chip>SHMUP</Chip>
          <Chip>ROGUELITE</Chip>
        </div>
      </Card>
    </Screen>
  )
}

export function CloudSaveConflictScreen() {
  return (
    <Screen
      tone="alert"
      title="PICO ▸ SYNC"
      hints={[
        { key: "a", label: "KEEP LOCAL" },
        { key: "y", label: "KEEP CLOUD" },
        { key: "b", label: "CANCEL" },
      ]}
    >
      <div className="pcFut-conf-head">
        <Title size={0}>SAVE CONFLICT</Title>
        <p className="pcFut-conf-note">
          Two saves disagree. Keep which? The other is overwritten.
        </p>
      </div>
      <div className="pcFut-conf-grid">
        <Card title="THIS DEVICE" className="pcFut-conf-card">
          <Badge tone="info">LOCAL</Badge>
          <div className="pcFut-conf-line">
            <span className="pc-dim">SAVED</span>
            <b>2m ago</b>
          </div>
          <div className="pcFut-conf-line">
            <span className="pc-dim">PLAYTIME</span>
            <b>12h 40m</b>
          </div>
          <div className="pcFut-conf-line">
            <span className="pc-dim">SPOT</span>
            <b>WORLD 3-2</b>
          </div>
          <Btn kind="primary" sel>
            KEEP LOCAL
          </Btn>
        </Card>
        <Card title="CLOUD" className="pcFut-conf-card">
          <Badge tone="accent">CLOUD</Badge>
          <div className="pcFut-conf-line">
            <span className="pc-dim">SAVED</span>
            <b>3h ago</b>
          </div>
          <div className="pcFut-conf-line">
            <span className="pc-dim">PLAYTIME</span>
            <b>13h 05m</b>
          </div>
          <div className="pcFut-conf-line">
            <span className="pc-dim">SPOT</span>
            <b>BOSS RUSH</b>
          </div>
          <Btn>KEEP CLOUD</Btn>
        </Card>
      </div>
    </Screen>
  )
}

export function StoreScreen() {
  const featured = picoStoreItems[0]
  return (
    <Screen
      title="PICO ▸ STORE"
      hints={[
        { key: "a", label: "BROWSE" },
        { key: "b", label: "BACK" },
      ]}
    >
      {featured ? (
        <div className="pcFut-store-banner">
          <div className="pcFut-store-banner-text">
            <div className="pc-sub">FEATURED COLLECTION</div>
            <Title size={1}>{featured.title}</Title>
            <p className="pcFut-store-blurb">
              Hand-picked ports that play great on a handheld. New drops weekly.
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
        {picoStoreItems.map((item, index) => (
          <Card
            key={item.id}
            className={`pcFut-store-tile ${index === 1 ? "sel" : ""}`}
          >
            <span className="pcFut-store-tile-art">{item.title.slice(0, 1)}</span>
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
    </Screen>
  )
}

export function FeaturedScreen() {
  if (!picoHero) return null
  const more = picoGames.slice(0, 4)
  return (
    <Screen
      title="PICO ▸ TODAY"
      hints={[
        { key: "a", label: "PLAY" },
        { key: "y", label: "DETAILS" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcFut-feat">
        <div className="pcFut-feat-top">
          <div className="pc-art pcFut-feat-art">
            <PicoCart game={picoHero} showFav={false} />
          </div>
          <div className="pcFut-feat-info">
            <div className="pc-sub">GAME OF THE DAY</div>
            <Title size={2}>{picoHero.title}</Title>
            <div className="pcFut-feat-tags">
              {picoHero.genre.toUpperCase()} · {picoHero.developer.toUpperCase()}
            </div>
            <p className="pcFut-feat-blurb">
              A pixel-perfect classic that still holds up. Tight controls, hidden
              routes, and a soundtrack that lives rent-free.
            </p>
            <div className="pcFut-feat-why">
              <Badge tone="accent">WHY?</Badge>
              <span className="pc-dim">
                3 friends played it this week · trending in PORTMASTER
              </span>
            </div>
            <div className="pcFut-feat-actions">
              <Btn kind="primary" sel>
                ▶ PLAY
              </Btn>
              <Btn>＋ WISHLIST</Btn>
            </div>
          </div>
        </div>
        <div className="pcFut-feat-more">
          <div className="pcFut-group-h">MORE LIKE THIS</div>
          <div className="pcFut-feat-rail">
            {more.map(g => (
              <div key={g.id} className="pc-art sm pcFut-feat-thumb">
                <PicoCart game={g} showFav={false} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Screen>
  )
}
