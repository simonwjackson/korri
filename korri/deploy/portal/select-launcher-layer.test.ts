import { describe, expect, test } from "bun:test"
import { LauncherLayerBridge } from "@app/features/home/launcher-layer-bridge"
import { LauncherLayerRpc } from "@app/features/home/launcher-layer-rpc"
import { selectLauncherLayer } from "./select-launcher-layer"

/**
 * `selectLauncherLayer` is the pure two-case rule that decides which
 * Launcher layer the React tree should be seeded with. Identity
 * equality is the right assertion: layer behavior is already covered
 * by `launcher-layer-bridge.test.ts` and `library-rpc-layers.test.ts`.
 */
describe("selectLauncherLayer", () => {
  test("desktopInput: true selects the bridge layer", () => {
    expect(selectLauncherLayer({ desktopInput: true })).toBe(
      LauncherLayerBridge,
    )
  })

  test("desktopInput: false selects the RPC layer", () => {
    expect(selectLauncherLayer({ desktopInput: false })).toBe(LauncherLayerRpc)
  })
})
