import { fileURLToPath } from "node:url"
import { routes } from "../../products/app/routes/__virtual.ts"

const appRouterConfig = {
  routesDirectory: fileURLToPath(
    new URL("../../products/app/routes", import.meta.url),
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

export { appRouterConfig }
export default appRouterConfig
