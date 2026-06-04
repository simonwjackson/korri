#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs"
import { generator, getConfig } from "@tanstack/router-generator"
import appRouterConfig from "../../product/apps/portal/tsr.config"

const repoRoot = process.cwd()
const appRoot = `${repoRoot}/product/apps/portal`

async function main() {
  const config = getConfig(appRouterConfig, appRoot)

  await generator(config, repoRoot)

  if (!existsSync(config.generatedRouteTree)) {
    throw new Error(
      `Generated route tree missing after router validation: ${config.generatedRouteTree}`,
    )
  }

  const routeTree = readFileSync(config.generatedRouteTree, "utf8")
  if (config.routesDirectory !== `${appRoot}/routes`) {
    throw new Error("Router config no longer points at portal routes.")
  }
  if (!routeTree.includes('from "./routes/+index"')) {
    throw new Error(
      "Generated route tree no longer imports portal index route.",
    )
  }

  console.log("Router config validation passed.")
  console.log(`routesDirectory: ${config.routesDirectory}`)
  console.log(`generatedRouteTree: ${config.generatedRouteTree}`)
}

await main()
