import { index, rootRoute } from "@tanstack/virtual-file-routes"

// The portal is the Shift app. The /evier, /vigie and /screen routes were
// quick SurfaceHost hacks to eyeball the other surfaces; they are pulled out
// here so Shift can own its own (file-based) route tree. The evier/vigie
// surface implementations (product/surfaces/web/{evier,vigie}) are intentionally
// preserved -- only the throwaway route wrappers are removed.
export const routes = rootRoute("+__root.tsx", [index("+index.tsx")])
