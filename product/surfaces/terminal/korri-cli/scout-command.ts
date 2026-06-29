import { dirname } from "node:path"
import { korriDataPath, type XdgPathEnv } from "@platform/config/xdg-paths"
import {
  mergeReleaseCandidateConfig,
  scanConfiguredReleaseCandidates,
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
      try {
        const merge = await mergeReleaseCandidateConfig({
          path: configPath,
          candidateYaml: result.yaml,
        })
        console.log(
          JSON.stringify(
            {
              status: "ok",
              report: result.report,
              config: configPath,
              merge,
              yaml: result.yaml,
            },
            null,
            2,
          ),
        )
        process.exitCode = 0
      } catch (error) {
        console.log(
          JSON.stringify(
            {
              status: "diagnostic",
              reason: "MergeFailed",
              message: errorMessage(error),
            },
            null,
            2,
          ),
        )
        process.exitCode = 1
      }
    }),
).pipe(
  Command.withDescription(
    "Scan files under a root and merge release candidates into config.",
  ),
)

const scoutScanConfiguredCommand = Command.make(
  "configured",
  {
    config: Flag.string("config").pipe(Flag.optional),
  },
  ({ config }) =>
    Effect.promise(async () => {
      const configPath =
        config._tag === "Some" ? config.value : defaultScoutConfigPath()
      const result = await scanConfiguredReleaseCandidates({
        configPath,
        roots: configuredScanRoots(configPath),
        findBinary: optionalEnv("KORRI_FIND_BIN"),
      })
      console.log(JSON.stringify(result, null, 2))
      process.exitCode = result.status === "ok" ? 0 : 1
    }),
).pipe(
  Command.withDescription(
    "Scan configured storage roots and merge release candidates into config.",
  ),
)

const scoutScanCommand = Command.make("scan").pipe(
  Command.withDescription("Scan local sources for authorable candidates."),
  Command.withSubcommands([
    scoutScanReleasesCommand,
    scoutScanConfiguredCommand,
  ]),
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

function configuredScanRoots(
  configPath: string,
): readonly [{ readonly root: string; readonly optional: false }] | undefined {
  if (
    optionalEnv("KORRI_CONFIG_ROOTS") ||
    optionalEnv("KORRI_CONFIG_ROOTS_DIR")
  ) {
    return undefined
  }
  return [{ root: dirname(configPath), optional: false }]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function defaultScoutConfigPath(env: XdgPathEnv = process.env): string {
  const explicitRoot = env.KORRI_CONFIG_ROOTS?.split(":")
    .map(item => item.trim())
    .find(item => item.length > 0)
  return `${explicitRoot ?? korriDataPath(env, "config")}/korri.yaml`
}
