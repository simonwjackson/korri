import { index, rootRoute, route } from "@tanstack/virtual-file-routes"

export const routes = rootRoute("+__root.tsx", [
  index("+index.tsx"),
  route("/screen", "+screen.tsx"),
  route("/evier", "+evier.tsx"),
  route("/vigie", "+vigie.tsx"),
  route("/demo-theme", "+demo-theme.tsx"),
  // PROTOTYPE — throwaway pico theme exploration; remove with prototypes/pico/.
  route("/pico-prototype", "+pico-prototype.tsx"),
])
