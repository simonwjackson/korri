// Fetches real cover art from SteamGridDB through the dev-server proxy
// (see vite.config.ts). The proxy adds the API key and makes the CDN
// same-origin so the art can be drawn to a canvas without tainting it.
import { boxbusterOfflineArt } from "./art-mode"

const API = "/sgdb/api"
const CDN_RE = /^https?:\/\/cdn[0-9]*\.steamgriddb\.com/

const proxied = (url: string) => url.replace(CDN_RE, "/sgdb/cdn")

async function searchGameId(title: string): Promise<number | null> {
  const r = await fetch(
    `${API}/search/autocomplete/${encodeURIComponent(title)}`,
  )
  if (!r.ok) return null
  const j = await r.json()
  return j?.data?.[0]?.id ?? null
}

async function gridUrl(id: number): Promise<string | null> {
  // prefer portrait box art (600x900); fall back to whatever's available
  const queries = [
    "?dimensions=600x900&types=static&nsfw=false&limit=1",
    "?types=static&nsfw=false&limit=1",
  ]
  for (const q of queries) {
    const r = await fetch(`${API}/grids/game/${id}${q}`)
    if (!r.ok) continue
    const j = await r.json()
    const item = j?.data?.[0]
    if (item) return proxied(item.thumb ?? item.url)
  }
  return null
}

export function loadCoverImage(src: string): Promise<HTMLImageElement | null> {
  if (boxbusterOfflineArt()) return Promise.resolve(null)
  return new Promise((res, rej) => {
    const im = new Image()
    im.crossOrigin = "anonymous"
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}

/** Resolve a title to a loaded cover image, or null if anything fails. */
export async function fetchCoverImage(
  title: string,
): Promise<HTMLImageElement | null> {
  if (boxbusterOfflineArt()) return null
  try {
    const id = await searchGameId(title)
    if (id == null) return null
    const url = await gridUrl(id)
    if (!url) return null
    return await loadCoverImage(url)
  } catch {
    return null
  }
}

export interface Game {
  readonly id: string
  readonly title: string
  readonly year: number
  readonly platform: string
  readonly genre: string
  readonly players: string
  readonly blurb: string
  readonly coverUrl?: string
}

export type StaticGame = Omit<Game, "id" | "coverUrl">

function staticGameId(game: StaticGame): string {
  return game.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// A spread across the whole history of games — NES through modern Steam — so
// the store's shelves show every era. SteamGridDB indexes all these platforms.
const RAW_GAMES: readonly StaticGame[] = [
  // NES
  {
    title: "Super Mario Bros.",
    year: 1985,
    platform: "NES",
    genre: "Platformer",
    players: "1-2 Players",
    blurb:
      "Bowser has captured Princess Toadstool. Run and jump across eight worlds of the Mushroom Kingdom to set her free.",
  },
  {
    title: "The Legend of Zelda",
    year: 1986,
    platform: "NES",
    genre: "Action-Adventure",
    players: "1 Player",
    blurb:
      "Explore the land of Hyrule, gather the scattered Triforce of Wisdom, and rescue Princess Zelda from Ganon.",
  },
  {
    title: "Metroid",
    year: 1986,
    platform: "NES",
    genre: "Action-Adventure",
    players: "1 Player",
    blurb:
      "Bounty hunter Samus Aran descends into planet Zebes to destroy the parasitic Metroids and Mother Brain.",
  },
  {
    title: "Mega Man 2",
    year: 1988,
    platform: "NES",
    genre: "Action-Platformer",
    players: "1 Player",
    blurb:
      "Defeat eight Robot Masters, steal their weapons, and storm Dr. Wily's fortress in the series' breakout hit.",
  },
  {
    title: "Castlevania",
    year: 1986,
    platform: "NES",
    genre: "Action-Platformer",
    players: "1 Player",
    blurb:
      "Vampire hunter Simon Belmont fights through Dracula's castle with the legendary whip Vampire Killer.",
  },
  {
    title: "Contra",
    year: 1987,
    platform: "NES",
    genre: "Run-and-Gun",
    players: "1-2 Players",
    blurb:
      "Two commandos blast through alien-infested jungles and fortresses to stop the Red Falcon organization.",
  },
  {
    title: "Punch-Out!!",
    year: 1987,
    platform: "NES",
    genre: "Sports / Boxing",
    players: "1 Player",
    blurb:
      "Underdog Little Mac punches his way up the rankings toward a final bout with the champ himself.",
  },
  {
    title: "Ninja Gaiden",
    year: 1988,
    platform: "NES",
    genre: "Action-Platformer",
    players: "1 Player",
    blurb:
      "Ninja Ryu Hayabusa avenges his father in a brutal, cinematic quest told between the action.",
  },
  // SNES
  {
    title: "Super Mario World",
    year: 1990,
    platform: "SNES",
    genre: "Platformer",
    players: "1-2 Players",
    blurb:
      "Mario and his new dinosaur pal Yoshi explore Dinosaur Land to rescue the Princess from Bowser once more.",
  },
  {
    title: "The Legend of Zelda: A Link to the Past",
    year: 1991,
    platform: "SNES",
    genre: "Action-Adventure",
    players: "1 Player",
    blurb:
      "Link travels between the Light and Dark Worlds to free the seven maidens and defeat the wizard Agahnim.",
  },
  {
    title: "Super Metroid",
    year: 1994,
    platform: "SNES",
    genre: "Action-Adventure",
    players: "1 Player",
    blurb:
      "Samus returns to Zebes to recover the last Metroid hatchling stolen by the Space Pirates.",
  },
  {
    title: "Chrono Trigger",
    year: 1995,
    platform: "SNES",
    genre: "RPG",
    players: "1 Player",
    blurb:
      "A band of unlikely heroes journeys across eras to prevent an apocalypse caused by the creature Lavos.",
  },
  {
    title: "Donkey Kong Country",
    year: 1994,
    platform: "SNES",
    genre: "Platformer",
    players: "1-2 Players",
    blurb:
      "Donkey and Diddy Kong reclaim their stolen banana hoard from King K. Rool and the Kremlings.",
  },
  {
    title: "Street Fighter II",
    year: 1991,
    platform: "SNES",
    genre: "Fighting",
    players: "1-2 Players",
    blurb:
      "World warriors battle across the globe in the head-to-head fighter that defined the genre.",
  },
  {
    title: "EarthBound",
    year: 1994,
    platform: "SNES",
    genre: "RPG",
    players: "1 Player",
    blurb:
      "Ness and his friends use baseball bats and psychic powers to stop the cosmic horror Giygas.",
  },
  {
    title: "Star Fox",
    year: 1993,
    platform: "SNES",
    genre: "Rail Shooter",
    players: "1 Player",
    blurb:
      "Lead the Star Fox team through polygonal dogfights to free the Lylat system from the tyrant Andross.",
  },
  // N64
  {
    title: "Super Mario 64",
    year: 1996,
    platform: "N64",
    genre: "Platformer",
    players: "1 Player",
    blurb:
      "Mario leaps into paintings to collect 120 Power Stars in the game that defined 3D platforming.",
  },
  {
    title: "GoldenEye 007",
    year: 1997,
    platform: "N64",
    genre: "First-Person Shooter",
    players: "1-4 Players",
    blurb:
      "Bond infiltrates Soviet facilities solo, then splits the screen for legendary four-player multiplayer.",
  },
  {
    title: "The Legend of Zelda: Ocarina of Time",
    year: 1998,
    platform: "N64",
    genre: "Action-Adventure",
    players: "1 Player",
    blurb:
      "Young Link travels through time and learns ocarina songs to stop Ganondorf and save Hyrule.",
  },
  {
    title: "Banjo-Kazooie",
    year: 1998,
    platform: "N64",
    genre: "Platformer",
    players: "1 Player",
    blurb:
      "A bear and a bird team up to rescue Banjo's sister from the spell-slinging witch Gruntilda.",
  },
  {
    title: "Mario Kart 64",
    year: 1996,
    platform: "N64",
    genre: "Racing",
    players: "1-4 Players",
    blurb:
      "Race and battle as Mushroom Kingdom favorites across wild 3D tracks loaded with shells and bananas.",
  },
  {
    title: "Star Fox 64",
    year: 1997,
    platform: "N64",
    genre: "Rail Shooter",
    players: "1 Player",
    blurb:
      "Do a barrel roll through the Lylat system on branching routes to bring down Andross once more.",
  },
  // PS1
  {
    title: "Final Fantasy VII",
    year: 1997,
    platform: "PlayStation",
    genre: "RPG",
    players: "1 Player",
    blurb:
      "Mercenary Cloud and the eco-warriors of AVALANCHE confront the Shinra corporation and the swordsman Sephiroth.",
  },
  {
    title: "Metal Gear Solid",
    year: 1998,
    platform: "PlayStation",
    genre: "Stealth-Action",
    players: "1 Player",
    blurb:
      "Solid Snake infiltrates the Shadow Moses facility to stop a renegade unit armed with a nuclear mech.",
  },
  {
    title: "Resident Evil 2",
    year: 1998,
    platform: "PlayStation",
    genre: "Survival Horror",
    players: "1 Player",
    blurb:
      "Rookie cop Leon and student Claire fight to survive a single night in zombie-overrun Raccoon City.",
  },
  {
    title: "Crash Bandicoot",
    year: 1996,
    platform: "PlayStation",
    genre: "Platformer",
    players: "1 Player",
    blurb:
      "A genetically mutated bandicoot spins and jumps across three islands to stop the evil Dr. Cortex.",
  },
  {
    title: "Spyro the Dragon",
    year: 1998,
    platform: "PlayStation",
    genre: "Platformer",
    players: "1 Player",
    blurb:
      "A young purple dragon glides through the realms to free his kin and collect stolen gems.",
  },
  {
    title: "Tekken 3",
    year: 1998,
    platform: "PlayStation",
    genre: "Fighting",
    players: "1-2 Players",
    blurb:
      "The King of Iron Fist Tournament returns with a deep roster and fast, fluid 3D fighting.",
  },
  {
    title: "Silent Hill",
    year: 1999,
    platform: "PlayStation",
    genre: "Survival Horror",
    players: "1 Player",
    blurb:
      "Harry Mason searches a fog-shrouded town for his missing daughter as reality decays around him.",
  },
  {
    title: "Castlevania: Symphony of the Night",
    year: 1997,
    platform: "PlayStation",
    genre: "Action-RPG",
    players: "1 Player",
    blurb:
      "Dhampir Alucard explores Dracula's ever-shifting castle in the Metroidvania that named the genre.",
  },
  // PS2 / GameCube / Xbox
  {
    title: "Grand Theft Auto: San Andreas",
    year: 2004,
    platform: "PlayStation 2",
    genre: "Action-Adventure",
    players: "1 Player",
    blurb:
      "CJ returns to a crumbling San Andreas to clear his name and rebuild his family's street empire.",
  },
  {
    title: "Halo: Combat Evolved",
    year: 2001,
    platform: "Xbox",
    genre: "First-Person Shooter",
    players: "1-4 Players",
    blurb:
      "The Master Chief and the AI Cortana battle the Covenant across a mysterious ancient ringworld.",
  },
  {
    title: "Shadow of the Colossus",
    year: 2005,
    platform: "PlayStation 2",
    genre: "Action-Adventure",
    players: "1 Player",
    blurb:
      "A lone wanderer hunts and topples sixteen towering colossi in exchange for a lost love's life.",
  },
  {
    title: "God of War",
    year: 2005,
    platform: "PlayStation 2",
    genre: "Action",
    players: "1 Player",
    blurb:
      "The Spartan Kratos wages a brutal war against the gods and monsters of Greek myth.",
  },
  {
    title: "Resident Evil 4",
    year: 2005,
    platform: "GameCube",
    genre: "Survival Horror",
    players: "1 Player",
    blurb:
      "Agent Leon Kennedy rescues the president's daughter from a sinister cult in rural Europe.",
  },
  {
    title: "Super Smash Bros. Melee",
    year: 2001,
    platform: "GameCube",
    genre: "Fighting",
    players: "1-4 Players",
    blurb:
      "Nintendo's all-stars brawl on platform stages in a fast, chaotic, endlessly competitive fighter.",
  },
  {
    title: "Ratchet & Clank",
    year: 2002,
    platform: "PlayStation 2",
    genre: "Action-Platformer",
    players: "1 Player",
    blurb:
      "A lombax mechanic and his robot pal save the galaxy with an arsenal of absurd weapons and gadgets.",
  },
  {
    title: "Metal Gear Solid 2: Sons of Liberty",
    year: 2001,
    platform: "PlayStation 2",
    genre: "Stealth-Action",
    players: "1 Player",
    blurb:
      "Raiden and Snake uncover a vast conspiracy aboard the offshore Big Shell cleanup facility.",
  },
  // Xbox 360 / PS3
  {
    title: "Portal 2",
    year: 2011,
    platform: "Xbox 360",
    genre: "Puzzle",
    players: "1-2 Players",
    blurb:
      "Solve mind-bending portal puzzles under the watch of GLaDOS, solo or in dedicated co-op.",
  },
  {
    title: "BioShock",
    year: 2007,
    platform: "Xbox 360",
    genre: "First-Person Shooter",
    players: "1 Player",
    blurb:
      "Descend into the fallen undersea city of Rapture and discover what it means to say 'Would you kindly.'",
  },
  {
    title: "Mass Effect 2",
    year: 2010,
    platform: "Xbox 360",
    genre: "Action-RPG",
    players: "1 Player",
    blurb:
      "Commander Shepard recruits a galaxy's worth of specialists for an all-but-certain suicide mission.",
  },
  {
    title: "The Elder Scrolls V: Skyrim",
    year: 2011,
    platform: "Xbox 360",
    genre: "Action-RPG",
    players: "1 Player",
    blurb:
      "The prophesied Dragonborn rises as dragons return to the frozen province of Skyrim.",
  },
  {
    title: "Red Dead Redemption",
    year: 2010,
    platform: "Xbox 360",
    genre: "Action-Adventure",
    players: "1 Player",
    blurb:
      "Former outlaw John Marston is forced to hunt down his old gang across the dying Wild West.",
  },
  {
    title: "Dark Souls",
    year: 2011,
    platform: "Xbox 360",
    genre: "Action-RPG",
    players: "1 Player",
    blurb:
      "Brave a punishing, intricately interconnected world of the cursed undead to link the First Flame.",
  },
  {
    title: "Minecraft",
    year: 2011,
    platform: "PC",
    genre: "Sandbox",
    players: "1+ Players",
    blurb:
      "Mine resources, craft tools, and build anything you can imagine in an infinite procedural blocky world.",
  },
  {
    title: "Fallout 3",
    year: 2008,
    platform: "Xbox 360",
    genre: "Action-RPG",
    players: "1 Player",
    blurb:
      "Leave Vault 101 to search the irradiated Capital Wasteland for your missing father.",
  },
  // Modern Steam
  {
    title: "The Witcher 3: Wild Hunt",
    year: 2015,
    platform: "PC",
    genre: "Action-RPG",
    players: "1 Player",
    blurb:
      "Monster hunter Geralt of Rivia searches a sprawling war-torn world for his adopted daughter Ciri.",
  },
  {
    title: "Hades",
    year: 2020,
    platform: "PC",
    genre: "Roguelike",
    players: "1 Player",
    blurb:
      "Fight your way out of the Underworld as Zagreus, rebellious son of Hades, with help from the gods.",
  },
  {
    title: "Elden Ring",
    year: 2022,
    platform: "PC",
    genre: "Action-RPG",
    players: "1 Player",
    blurb:
      "Rise as Tarnished and seek the Elden Ring across the vast, perilous open world of the Lands Between.",
  },
  {
    title: "Stardew Valley",
    year: 2016,
    platform: "PC",
    genre: "Simulation",
    players: "1-4 Players",
    blurb:
      "Inherit a run-down farm and build a new life in the cozy community of Pelican Town.",
  },
  {
    title: "Hollow Knight",
    year: 2017,
    platform: "PC",
    genre: "Metroidvania",
    players: "1 Player",
    blurb:
      "A tiny knight explores the beautiful, ruined insect kingdom of Hallownest and its deep secrets.",
  },
  {
    title: "Cyberpunk 2077",
    year: 2020,
    platform: "PC",
    genre: "Action-RPG",
    players: "1 Player",
    blurb:
      "Mercenary V chases a shot at immortality through the neon-soaked streets of Night City.",
  },
  {
    title: "Baldur's Gate 3",
    year: 2023,
    platform: "PC",
    genre: "RPG",
    players: "1-4 Players",
    blurb:
      "Resist a mind flayer parasite in a sprawling, choice-rich adventure built on Dungeons & Dragons.",
  },
  {
    title: "Disco Elysium",
    year: 2019,
    platform: "PC",
    genre: "RPG",
    players: "1 Player",
    blurb:
      "A broken detective solves a murder while confronting his own fractured mind and politics.",
  },
  {
    title: "Celeste",
    year: 2018,
    platform: "PC",
    genre: "Platformer",
    players: "1 Player",
    blurb:
      "Help Madeline climb Celeste Mountain and face her inner demons in a precise, heartfelt platformer.",
  },
  {
    title: "DOOM Eternal",
    year: 2020,
    platform: "PC",
    genre: "First-Person Shooter",
    players: "1 Player",
    blurb:
      "The Slayer rips and tears through Hell's invasion of Earth in a relentless, acrobatic shooter.",
  },
  {
    title: "Counter-Strike 2",
    year: 2023,
    platform: "PC",
    genre: "First-Person Shooter",
    players: "1+ Players",
    blurb:
      "The definitive competitive shooter, rebuilt on the Source 2 engine for a new generation.",
  },
  {
    title: "Sekiro: Shadows Die Twice",
    year: 2019,
    platform: "PC",
    genre: "Action",
    players: "1 Player",
    blurb:
      "A one-armed shinobi seeks revenge and resurrection in a deadly, vertical Sengoku-era Japan.",
  },
  {
    title: "Death Stranding",
    year: 2019,
    platform: "PC",
    genre: "Action",
    players: "1 Player",
    blurb:
      "Porter Sam Bridges reconnects a fractured America while haunted by invisible forces from beyond.",
  },
  {
    title: "Cuphead",
    year: 2017,
    platform: "PC",
    genre: "Run-and-Gun",
    players: "1-2 Players",
    blurb:
      "Battle a gauntlet of bosses in a brutally tough game drawn like a 1930s rubber-hose cartoon.",
  },
  {
    title: "Undertale",
    year: 2015,
    platform: "PC",
    genre: "RPG",
    players: "1 Player",
    blurb:
      "A child falls into an underground world of monsters — where nobody has to die if you don't want them to.",
  },
  {
    title: "Terraria",
    year: 2011,
    platform: "PC",
    genre: "Sandbox",
    players: "1-8 Players",
    blurb:
      "Dig, fight, explore, and build across a vast 2D world of bosses, biomes, and loot.",
  },
]

export const GAMES: readonly Game[] = RAW_GAMES.map(game => ({
  ...game,
  id: staticGameId(game),
}))
