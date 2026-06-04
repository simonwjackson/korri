import { decodeGameRecordArray, type GameRecord } from "./game"

const minutesAgo = (n: number): Date => new Date(Date.now() - n * 60_000)

const rawGames: ReadonlyArray<GameRecord> = [
  {
    id: "crystalline-drift",
    system: "fixture",
    contentPath: "/storage/fixtures/crystalline-drift.rom",
    metadata: {
      name: "Crystalline Drift",
      developer: "Studio Nimbus",
      publisher: "Cumulus Games",
      releaseDate: "2024-09-12",
      genre: ["Puzzle"],
      tags: ["chill", "single-player"],
    },
    userData: {
      lastPlayed: minutesAgo(12),
      playtime: 480,
      favorite: true,
    },
  },
  {
    id: "ember-circuit",
    system: "fixture",
    contentPath: "/storage/fixtures/ember-circuit.rom",
    metadata: {
      name: "Ember Circuit",
      developer: "Forge Foundry",
      publisher: "Anvil Press",
      releaseDate: "2023-04-02",
      genre: ["Action", "Roguelike"],
      tags: ["fast-paced", "co-op"],
    },
    userData: { lastPlayed: minutesAgo(60 * 3), playtime: 1280 },
  },
  {
    id: "halcyon-orbit",
    system: "fixture",
    contentPath: "/storage/fixtures/halcyon-orbit.rom",
    metadata: {
      name: "Halcyon Orbit",
      developer: "Lunar Hand",
      genre: ["Sci-Fi", "Strategy"],
      tags: ["space", "turn-based"],
    },
    userData: { lastPlayed: minutesAgo(60 * 24), playtime: 90 },
  },
  {
    id: "midnight-courier",
    system: "fixture",
    contentPath: "/storage/fixtures/midnight-courier.rom",
    metadata: {
      name: "Midnight Courier",
      developer: "Rainshade",
      genre: ["Driving"],
    },
  },
  {
    id: "petal-and-paper",
    system: "fixture",
    contentPath: "/storage/fixtures/petal-and-paper.rom",
    metadata: {
      name: "Petal & Paper",
      developer: "Origami Atelier",
      genre: ["Puzzle", "Cozy"],
      tags: ["cozy", "single-player"],
    },
    userData: { lastPlayed: minutesAgo(60 * 24 * 3), favorite: true },
  },
  {
    id: "tundra-call",
    system: "fixture",
    contentPath: "/storage/fixtures/tundra-call.rom",
    metadata: {
      name: "Tundra Call",
      developer: "North Reach",
      genre: ["Survival"],
    },
  },
  {
    id: "verdant-bloom",
    system: "fixture",
    contentPath: "/storage/fixtures/verdant-bloom.rom",
    metadata: {
      name: "Verdant Bloom",
      developer: "Mossroot",
      genre: ["Simulation"],
      tags: ["cozy"],
    },
    userData: { lastPlayed: minutesAgo(60 * 24 * 14), playtime: 4400 },
  },
  {
    id: "stargazer-academy",
    system: "fixture",
    contentPath: "/storage/fixtures/stargazer-academy.rom",
    metadata: {
      name: "Stargazer Academy",
      developer: "Cassiopeia Works",
      genre: ["RPG"],
      tags: ["story-rich"],
    },
  },
  {
    id: "harbor-letters",
    system: "fixture",
    contentPath: "/storage/fixtures/harbor-letters.rom",
    metadata: {
      name: "Harbor Letters",
      developer: "Lighthouse Lab",
      genre: ["Narrative"],
    },
  },
  {
    id: "neon-cartographer",
    system: "fixture",
    contentPath: "/storage/fixtures/neon-cartographer.rom",
    metadata: {
      name: "Neon Cartographer",
      developer: "Vector Walk",
      genre: ["Exploration"],
    },
    userData: { lastPlayed: minutesAgo(45), playtime: 220 },
  },
  {
    id: "iron-meadow",
    system: "fixture",
    contentPath: "/storage/fixtures/iron-meadow.rom",
    metadata: {
      name: "Iron Meadow",
      developer: "Bramble & Steel",
      genre: ["Tactics"],
    },
  },
  {
    id: "ardent-skies",
    system: "fixture",
    contentPath: "/storage/fixtures/ardent-skies.rom",
    metadata: {
      name: "Ardent Skies",
      developer: "Skybound",
      genre: ["Flight", "Sim"],
    },
  },
  {
    id: "pebble-pilgrim",
    system: "fixture",
    contentPath: "/storage/fixtures/pebble-pilgrim.rom",
    metadata: {
      name: "Pebble Pilgrim",
      developer: "Tideline",
      genre: ["Adventure"],
      tags: ["cozy"],
    },
  },
  {
    id: "saltwood-logs",
    system: "fixture",
    contentPath: "/storage/fixtures/saltwood-logs.rom",
    metadata: {
      name: "Saltwood Logs",
      developer: "Brackish",
      genre: ["Mystery"],
    },
  },
  {
    id: "atlas-tinker",
    system: "fixture",
    contentPath: "/storage/fixtures/atlas-tinker.rom",
    metadata: {
      name: "Atlas Tinker",
      developer: "Workshop Forty",
      genre: ["Puzzle"],
    },
  },
  {
    id: "boreal-rally",
    system: "fixture",
    contentPath: "/storage/fixtures/boreal-rally.rom",
    metadata: {
      name: "Boreal Rally",
      developer: "Northwind",
      genre: ["Driving"],
    },
  },
  {
    id: "calliope-cycle",
    system: "fixture",
    contentPath: "/storage/fixtures/calliope-cycle.rom",
    metadata: {
      name: "Calliope Cycle",
      developer: "Halftone",
      genre: ["Rhythm"],
    },
  },
  {
    id: "delta-roost",
    system: "fixture",
    contentPath: "/storage/fixtures/delta-roost.rom",
    metadata: {
      name: "Delta Roost",
      developer: "Wing & Vane",
      genre: ["Exploration"],
    },
  },
  {
    id: "ember-and-ash",
    system: "fixture",
    contentPath: "/storage/fixtures/ember-and-ash.rom",
    metadata: {
      name: "Ember & Ash",
      developer: "Cinder",
      genre: ["Action"],
    },
  },
  {
    id: "fjord-watch",
    system: "fixture",
    contentPath: "/storage/fixtures/fjord-watch.rom",
    metadata: {
      name: "Fjord Watch",
      developer: "Seabreak",
      genre: ["Strategy"],
    },
  },
  {
    id: "grasswind-knights",
    system: "fixture",
    contentPath: "/storage/fixtures/grasswind-knights.rom",
    metadata: {
      name: "Grasswind Knights",
      developer: "Hedgerow",
      genre: ["RPG"],
    },
  },
  {
    id: "hollow-lighthouse",
    system: "fixture",
    contentPath: "/storage/fixtures/hollow-lighthouse.rom",
    metadata: {
      name: "Hollow Lighthouse",
      developer: "Brine Studio",
      genre: ["Horror"],
    },
  },
  {
    id: "iris-protocol",
    system: "fixture",
    contentPath: "/storage/fixtures/iris-protocol.rom",
    metadata: {
      name: "Iris Protocol",
      developer: "Spectrum Lab",
      genre: ["Puzzle"],
    },
  },
  {
    id: "jetstream-jubilee",
    system: "fixture",
    contentPath: "/storage/fixtures/jetstream-jubilee.rom",
    metadata: {
      name: "Jetstream Jubilee",
      developer: "Topwind",
      genre: ["Sports"],
    },
  },
]

// Decode at module load so fixtures stay in sync with the schema.
export const games: ReadonlyArray<GameRecord> = decodeGameRecordArray(rawGames)

const firstGame = games[0]
if (!firstGame) {
  throw new Error("game fixtures: games is empty")
}
export const featuredGame: GameRecord = firstGame
