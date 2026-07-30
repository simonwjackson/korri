// An example korrid plugin.
//
// A plugin is source text that evaluates to a declaration. It says what exists
// and how it could be fulfilled; it never acts. korrid reads the declaration
// and decides which device in the federation downloads, stores, runs, or
// presents the thing — which is why the same file is meaningful on every
// device, and why a plugin is not allowed to reach for a filesystem or a
// network even if it wanted to.
//
// This file is executed by korrid's test suite, so it cannot silently rot.

interface Game {
  id: string
  title: string
  system: System
  routes: Route[]
}

enum System {
  Gba = "gba",
}

// The same content, reachable more than one way. Which route is taken depends
// on the capabilities of the devices present — not on anything declared here.
type Route =
  | { kind: "local"; launcher: string; core: string }
  | { kind: "stream"; from: string }

function declare(): { kind: "catalog"; games: Game[] } {
  const games: Game[] = [
    {
      id: "wl4",
      title: "Wario Land 4",
      system: System.Gba,
      routes: [
        { kind: "local", launcher: "retroarch", core: "mgba" },
        { kind: "stream", from: "zao" },
      ],
    },
  ]

  return { kind: "catalog", games }
}

declare()
