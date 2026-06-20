// Parses korri-web-runtime CLI argv into a RunConfig.
//
// The plugin launchers pass per-game configuration here: pinned engine + declared
// native resolution for combo/engine launchers, or the defaults (engine auto,
// native detect) for the generic launcher.

import type { EngineId } from "../core/engine-detect"
import type { GamescopeFilter } from "../core/gamescope-request"
import type { Dimensions } from "../core/native-res"

export interface RunConfig {
  readonly locator: string
  readonly engine: "auto" | EngineId
  readonly native: "detect" | Dimensions
  readonly output: Dimensions
  readonly gap: Dimensions
  readonly filter: GamescopeFilter
  readonly extraFlags: string[]
  readonly shims: string[]
  readonly gamescope: boolean
  readonly autoplay: "no-gesture" | "default"
}

function parseDimensions(value: string, label: string): Dimensions {
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) throw new Error(`${label} must be WxH, got: ${value}`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

export function parseRunConfig(argv: readonly string[]): RunConfig {
  let locator: string | undefined
  let engine: "auto" | EngineId = "auto"
  let native: "detect" | Dimensions = "detect"
  let output: Dimensions = { width: 1920, height: 1080 }
  let gap: Dimensions = { width: 20, height: 20 }
  let filter: GamescopeFilter = "pixel"
  let gamescope = true
  let autoplay: "no-gesture" | "default" = "no-gesture"
  const extraFlags: string[] = []
  const shims: string[] = []

  const next = (i: number, flag: string): string => {
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case "--engine":
        engine = next(i, arg) as "auto" | EngineId
        i++
        break
      case "--native": {
        const value = next(i, arg)
        native =
          value === "detect" ? "detect" : parseDimensions(value, "--native")
        i++
        break
      }
      case "--output":
        output = parseDimensions(next(i, arg), "--output")
        i++
        break
      case "--gap":
        gap = parseDimensions(next(i, arg), "--gap")
        i++
        break
      case "--filter":
        filter = next(i, arg) as GamescopeFilter
        i++
        break
      case "--flag":
        extraFlags.push(next(i, arg))
        i++
        break
      case "--shim":
        shims.push(next(i, arg))
        i++
        break
      case "--no-gamescope":
        gamescope = false
        break
      case "--autoplay":
        autoplay = next(i, arg) === "default" ? "default" : "no-gesture"
        i++
        break
      default:
        if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`)
        if (locator !== undefined)
          throw new Error(`unexpected argument: ${arg}`)
        locator = arg
    }
  }

  if (locator === undefined)
    throw new Error("a locator (url or file://) is required")
  return {
    locator,
    engine,
    native,
    output,
    gap,
    filter,
    extraFlags,
    shims,
    gamescope,
    autoplay,
  }
}
