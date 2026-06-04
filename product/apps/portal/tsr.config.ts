import { fileURLToPath } from "node:url"
import { routes } from "./routes/__virtual.ts"

const appRouterConfig = {
  routesDirectory: fileURLToPath(new URL("./routes", import.meta.url)),
  generatedRouteTree: fileURLToPath(
    new URL("./routeTree.gen.ts", import.meta.url),
  ),
  virtualRouteConfig: routes,
  routeFilePrefix: "+",
  quoteStyle: "double",
  target: "react",
  autoCodeSplitting: true,
  fileExtensions: ["tsx"],
  exclude: [],
  disableLogging: true,
} as const

export default appRouterConfig
