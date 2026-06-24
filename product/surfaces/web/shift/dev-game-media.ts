/**
 * Shift — device-lab prototype media (real games).
 *
 * Lab/prototype data only. Real, handheld-friendly games with cover (grid) and
 * background (hero) art hotlinked from the SteamGridDB community CDN, so the
 * identity/home prototypes are judged against real game media instead of
 * placeholder boxes. Not shipped to the device; the production home resolves
 * media from the live library. URLs were resolved once via the SteamGridDB API
 * (no API key is embedded — only the resulting public CDN URLs).
 */
export interface DevGameMedia {
  readonly id: string
  readonly title: string
  readonly genre: string
  readonly developer: string
  /** Portrait cover (capsule) art. */
  readonly gridUrl: string
  /** Wide hero/background art. */
  readonly heroUrl: string
}

export const DEV_GAME_MEDIA: readonly DevGameMedia[] = [
  {
    id: "hollow-knight",
    title: "Hollow Knight",
    genre: "Metroidvania",
    developer: "Team Cherry",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/d18c832e8c956b4ef8b92862e6bf470d.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/222c44c26a02c54e3a9fd0d895b12df4.png",
  },
  {
    id: "celeste",
    title: "Celeste",
    genre: "Platformer",
    developer: "Maddy Makes Games",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/074aed57c243ae7020971ca7c9fe0f29.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/c66e591693fd6e7b26fc5a60efb68817.png",
  },
  {
    id: "hades",
    title: "Hades",
    genre: "Roguelike",
    developer: "Supergiant Games",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/ce8a253393a1bbbb3d72cd2093b81ede.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/56bbc93a8425b95e4ab7c789751475bf.png",
  },
  {
    id: "stardew-valley",
    title: "Stardew Valley",
    genre: "Farming Sim",
    developer: "ConcernedApe",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/cf30b40a1573a32248fcd0ba94e67652.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/d44c78dcad9de0aed2f37902ea02cef2.png",
  },
  {
    id: "dead-cells",
    title: "Dead Cells",
    genre: "Roguelike",
    developer: "Motion Twin",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/f6fa975361cfccc02b55c49305ff2bed.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/d0dde222e608c66b65d44776bd8b4092.jpg",
  },
  {
    id: "hyper-light-drifter",
    title: "Hyper Light Drifter",
    genre: "Action RPG",
    developer: "Heart Machine",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/9011e2602f1475135ddedb72daf6049d.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/ca9c267dad0305d1a6308d2a0cf1c39c.png",
  },
  {
    id: "ori-will-of-the-wisps",
    title: "Ori and the Will of the Wisps",
    genre: "Platformer",
    developer: "Moon Studios",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/7cd613b5798d0c540ba064c5f7ecc386.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/7f9b98141b2a0a95dcb5fc8a3dd4deae.jpg",
  },
  {
    id: "cuphead",
    title: "Cuphead",
    genre: "Run & Gun",
    developer: "Studio MDHR",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/25dcf1554f13c36b512dfe907acc77d3.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/0f27c12b5d79ce8419764f71ac4ba499.png",
  },
  {
    id: "disco-elysium",
    title: "Disco Elysium",
    genre: "RPG",
    developer: "ZA/UM",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/e17233dc1c4e3457d5a259c06c7eb502.jpg",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/7b16a52cf3727c22984590c4f4c36039.png",
  },
  {
    id: "sea-of-stars",
    title: "Sea of Stars",
    genre: "Turn-based RPG",
    developer: "Sabotage Studio",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/5f1cf142579e3c1fb7cf94cb7290dcff.jpg",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/0dc76f2b5c3bada7c8bf8a8cbf02a968.png",
  },
  {
    id: "deaths-door",
    title: "Death's Door",
    genre: "Action Adventure",
    developer: "Acid Nerve",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/f2b3e6a656c805bf1ceb1fc5734e7622.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/eb44dd0c785010921f2d176313cdd55c.png",
  },
  {
    id: "tunic",
    title: "Tunic",
    genre: "Action Adventure",
    developer: "Andrew Shouldice",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/2daf9584863b39e00f7362dc69aeb4e1.jpg",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/6e57a30d42233829bb65aab0262e463b.jpg",
  },
  {
    id: "slay-the-spire",
    title: "Slay the Spire",
    genre: "Deckbuilder",
    developer: "Mega Crit",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/9ad067558ea2bd2a1239bfa2da998146.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/5cfa02f9154d8220d0a911d6ca82ddb5.png",
  },
  {
    id: "blasphemous",
    title: "Blasphemous",
    genre: "Metroidvania",
    developer: "The Game Kitchen",
    gridUrl:
      "https://cdn2.steamgriddb.com/grid/efb0f96fc2ee386ece83fdacdf9e9c81.png",
    heroUrl:
      "https://cdn2.steamgriddb.com/hero/159222817f81958c839f0ce1903b247b.jpg",
  },
]
