import { korriDataPath, type XdgPathEnv } from "@platform/config/xdg-paths"
import {
  mergeReleaseCandidateConfig,
  scanReleaseCandidates,
} from "@platform/library/discovery/release-candidate-scan"
import { Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"

const scoutScanReleasesCommand = Command.make(
  "releases",
  {
    root: Flag.string("root"),
    storage: Flag.string("storage"),
    config: Flag.string("config").pipe(Flag.optional),
  },
  ({ root, storage, config }) =>
    Effect.promise(async () => {
      const result = await scanReleaseCandidates({
        root,
        storage,
        findBinary: optionalEnv("KORRI_FIND_BIN"),
      })
      if (result.status === "diagnostic") {
        console.log(JSON.stringify(result, null, 2))
        process.exitCode = 1
        return
      }

      const configPath =
        config._tag === "Some" ? config.value : defaultScoutConfigPath()
      const merge = await mergeReleaseCandidateConfig({
        path: configPath,
        candidateYaml: result.yaml,
      })
      console.log(
        JSON.stringify(
          { status: "ok", report: result.report, config: configPath, merge },
          null,
          2,
        ),
      )
      console.log("--- scout release candidates ---")
      console.log(result.yaml.trimEnd())
      process.exitCode = 0
    }),
).pipe(
  Command.withDescription(
    "Scan files under a root and merge release candidates into config.",
  ),
)

const scoutScanCommand = Command.make("scan").pipe(
  Command.withDescription("Scan local sources for authorable candidates."),
  Command.withSubcommands([scoutScanReleasesCommand]),
)

export const scoutCommand = Command.make("scout").pipe(
  Command.withDescription(
    "Scout local sources and generate authorable candidates.",
  ),
  Command.withSubcommands([scoutScanCommand]),
)

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

export function defaultScoutConfigPath(env: XdgPathEnv = process.env): string {
  const explicitRoot = env.KORRI_CONFIG_ROOTS?.split(":")
    .map(item => item.trim())
    .find(item => item.length > 0)
  return `${explicitRoot ?? korriDataPath(env, "config")}/korri.yaml`
}
