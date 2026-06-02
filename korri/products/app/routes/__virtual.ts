import { index, rootRoute, route } from "@tanstack/virtual-file-routes"

export const routes = rootRoute("+__root.tsx", [
  index("+index.tsx"),
  route("/screen", "+screen.tsx"),
  route("/evier", "+evier.tsx"),
])
