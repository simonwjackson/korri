import { fileURLToPath } from "node:url"
import { routes } from "../../../korri/products/app/routes/__virtual.ts"

const appRouterConfig = {
  routesDirectory: fileURLToPath(
    new URL("../../../korri/products/app/routes", import.meta.url),
  ),
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
