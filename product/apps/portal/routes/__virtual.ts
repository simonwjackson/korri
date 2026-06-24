import { index, rootRoute, route } from "@tanstack/virtual-file-routes"

// The portal is the Shift app. The /evier, /vigie and /screen routes were quick
// SurfaceHost hacks to eyeball the other surfaces; they were pulled out so Shift
// can own its own (file-based) route tree (the evier/vigie surface
// implementations are intentionally preserved — only those throwaway wrappers
// were removed).
//
// /boxbuster is a deliberate, kept route: the boxbuster 3D surface is hosted by
// the portal there (its own surface, served on the portal's port).
export const routes = rootRoute("+__root.tsx", [
  index("+index.tsx"),
  route("/boxbuster", "+boxbuster.tsx"),
])
