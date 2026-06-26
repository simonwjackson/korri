import { index, rootRoute, route } from "@tanstack/virtual-file-routes"

// The portal is the Shift app. /screen is the production dual-screen entry used
// by the desktop shell: the portal hosts Shift while the Shift surface owns its
// internal route tree (via hash/history) for primary vs companion screens.
//
// /boxbuster is a deliberate, kept route: the boxbuster 3D surface is hosted by
// the portal there (its own surface, served on the portal's port).
export const routes = rootRoute("+__root.tsx", [
  index("+index.tsx"),
  route("/screen", "+screen.tsx"),
  route("/boxbuster", "+boxbuster.tsx"),
])
