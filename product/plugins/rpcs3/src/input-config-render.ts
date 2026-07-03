import { stringify } from "yaml"
import type { RoutedInputConfig, RoutedInputPlayer } from "./input-mapping"

type YamlObject = Record<string, unknown>

/** RPCS3 `cfg_input` exposes exactly Player 1..7 Input. */
const RPCS3_PLAYER_SLOTS = 7

const renderPlayer = (player: RoutedInputPlayer): YamlObject => {
  const out: YamlObject = { Handler: player.handler }
  if (player.device !== undefined) out.Device = player.device
  if (player.buddyDevice !== undefined) out["Buddy Device"] = player.buddyDevice
  // Partial profiles are valid: omit the Config node entirely when nothing was
  // authored so unset cfg_pad keys fall back to RPCS3 defaults.
  if (player.config.length > 0) {
    out.Config = Object.fromEntries(player.config)
  }
  return out
}

/**
 * Render routed players into RPCS3 `input_configs/<name>.yml` text. Builds the
 * `Player 1..7 Input` object and serializes ONCE via the `yaml` package
 * (mirroring `renderConfigYaml`), so the file cannot carry yaml-cpp duplicate
 * keys. Authored players are positional (index 0 → Player 1 Input); remaining
 * slots are padded with `Handler: "Null"` to match RPCS3's written shape.
 *
 * Returns `undefined` when there is nothing to author, so the materializer
 * writes no profile and passes no `--input-config`.
 */
export const renderInputConfigYaml = (
  routed: RoutedInputConfig | undefined,
): string | undefined => {
  if (routed === undefined || routed.players.length === 0) return undefined

  const root: YamlObject = {}
  routed.players.forEach((player, index) => {
    root[`Player ${index + 1} Input`] = renderPlayer(player)
  })
  for (let slot = routed.players.length; slot < RPCS3_PLAYER_SLOTS; slot++) {
    root[`Player ${slot + 1} Input`] = { Handler: "Null" }
  }

  return stringify(root)
}
