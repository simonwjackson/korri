#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs"
import { generator, getConfig } from "@tanstack/router-generator"
import appRouterConfig from "../../korri/deploy/portal/tsr.config"

const repoRoot = process.cwd()
const appRoot = `${repoRoot}/korri/deploy/portal`

async function main() {
  const config = getConfig(appRouterConfig, appRoot)

  await generator(config, repoRoot)

  if (!existsSync(config.generatedRouteTree)) {
    throw new Error(
      `Generated route tree missing after router validation: ${config.generatedRouteTree}`,
    )
  }

  const routeTree = readFileSync(config.generatedRouteTree, "utf8")
  if (!routeTree.includes("products/app/routes/+index")) {
    throw new Error("Generated route tree no longer points at app routes.")
  }

  console.log("Router config validation passed.")
  console.log(`routesDirectory: ${config.routesDirectory}`)
  console.log(`generatedRouteTree: ${config.generatedRouteTree}`)
}

await main()
