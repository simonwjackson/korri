import { releaseDiscoveryProvider } from "@platform/plugin/discovery"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_GBA_SYSTEM_ID,
  KORRI_RETROARCH_MGBA_RUNTIME_ID,
  KORRI_RETROARCH_PLUGIN_ID,
} from "./ids"

export const KORRI_RETROARCH_GBA_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/gba-files` as const
export const KORRI_RETROARCH_ZXSPECTRUM_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/zxspectrum-files` as const
export const KORRI_RETROARCH_GENESIS_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/genesis-files` as const
export const KORRI_RETROARCH_N64_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/n64-files` as const
export const KORRI_RETROARCH_NES_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/nes-files` as const
export const KORRI_RETROARCH_PC98_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/pc98-files` as const
export const KORRI_RETROARCH_PSP_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/psp-files` as const
export const KORRI_RETROARCH_PSX_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/psx-files` as const
export const KORRI_RETROARCH_SNES_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/snes-files` as const
export const KORRI_RETROARCH_TG16_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/tg16-files` as const

export const KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID = "zxspectrum" as const
export const KORRI_RETROARCH_GENESIS_SYSTEM_ID = "genesis" as const
export const KORRI_RETROARCH_N64_SYSTEM_ID = "n64" as const
export const KORRI_RETROARCH_NES_SYSTEM_ID = "nes" as const
export const KORRI_RETROARCH_PC98_SYSTEM_ID = "pc98" as const
export const KORRI_RETROARCH_PSP_SYSTEM_ID = "psp" as const
export const KORRI_RETROARCH_PSX_SYSTEM_ID = "psx" as const
export const KORRI_RETROARCH_SMS_SYSTEM_ID = "sms" as const
export const KORRI_RETROARCH_SNES_SYSTEM_ID = "snes" as const
export const KORRI_RETROARCH_TG16_SYSTEM_ID = "tg16" as const

export const KORRI_RETROARCH_FUSE_RUNTIME_LOCAL_ID = "fuse" as const
export const KORRI_RETROARCH_FUSE_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_FUSE_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_LOCAL_ID =
  "mupen64plus-next" as const
export const KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_LOCAL_ID =
  "mednafen-pce-fast" as const
export const KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_MESEN_RUNTIME_LOCAL_ID = "mesen" as const
export const KORRI_RETROARCH_MESEN_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_MESEN_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_LOCAL_ID =
  "genesis-plus-gx" as const
export const KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_NP2KAI_RUNTIME_LOCAL_ID = "np2kai" as const
export const KORRI_RETROARCH_NP2KAI_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_NP2KAI_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_PCSX_REARMED_RUNTIME_LOCAL_ID =
  "pcsx-rearmed" as const
export const KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_PCSX_REARMED_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_PPSSPP_RUNTIME_LOCAL_ID = "ppsspp" as const
export const KORRI_RETROARCH_PPSSPP_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_PPSSPP_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_BSNES_RUNTIME_LOCAL_ID = "bsnes" as const
export const KORRI_RETROARCH_BSNES_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_BSNES_RUNTIME_LOCAL_ID}` as const

interface RetroarchReleaseRule {
  readonly system: string
  readonly runtime: string
  readonly extensions: ReadonlySet<string>
  readonly folderHints?: ReadonlySet<string>
}

const retroarchRules: readonly RetroarchReleaseRule[] = [
  {
    system: KORRI_RETROARCH_GBA_SYSTEM_ID,
    runtime: KORRI_RETROARCH_MGBA_RUNTIME_ID,
    extensions: new Set(["gba"]),
  },
  {
    system: KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID,
    runtime: KORRI_RETROARCH_FUSE_RUNTIME_ID,
    extensions: new Set(["z80", "sna", "tap", "tzx", "szx"]),
  },
  {
    system: KORRI_RETROARCH_GENESIS_SYSTEM_ID,
    runtime: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
    extensions: new Set(["md", "gen", "smd", "bin", "zip"]),
    folderHints: new Set(["genesis", "megadrive", "md"]),
  },
  {
    system: KORRI_RETROARCH_SMS_SYSTEM_ID,
    runtime: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
    extensions: new Set(["sms", "gg", "sg", "zip"]),
    folderHints: new Set(["sms", "mastersystem", "gamegear", "sg1000"]),
  },
  {
    system: KORRI_RETROARCH_N64_SYSTEM_ID,
    runtime: KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID,
    extensions: new Set(["z64", "n64", "v64"]),
  },
  {
    system: KORRI_RETROARCH_NES_SYSTEM_ID,
    runtime: KORRI_RETROARCH_MESEN_RUNTIME_ID,
    extensions: new Set(["nes", "fds"]),
  },
  {
    system: KORRI_RETROARCH_PC98_SYSTEM_ID,
    runtime: KORRI_RETROARCH_NP2KAI_RUNTIME_ID,
    extensions: new Set(["d88", "fdi", "hdi", "hdm", "nhd", "xdf"]),
  },
  {
    system: KORRI_RETROARCH_PSP_SYSTEM_ID,
    runtime: KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
    extensions: new Set(["iso", "cso", "pbp"]),
    folderHints: new Set(["psp"]),
  },
  {
    system: KORRI_RETROARCH_PSX_SYSTEM_ID,
    runtime: KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
    extensions: new Set(["cue", "chd", "m3u", "pbp", "ccd", "toc"]),
    folderHints: new Set(["psx", "ps1", "playstation"]),
  },
  {
    system: KORRI_RETROARCH_SNES_SYSTEM_ID,
    runtime: KORRI_RETROARCH_BSNES_RUNTIME_ID,
    extensions: new Set(["sfc", "smc"]),
  },
  {
    system: KORRI_RETROARCH_TG16_SYSTEM_ID,
    runtime: KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_ID,
    extensions: new Set(["pce", "sgx", "cue", "chd"]),
    folderHints: new Set(["tg16", "turbografx16", "pcengine", "pce"]),
  },
]

export const retroarchDiscoveryProviders = retroarchRules.map(rule =>
  releaseDiscoveryProvider({
    id: `${KORRI_RETROARCH_PLUGIN_ID}/${rule.system}-files`,
    title: `RetroArch ${rule.system} files`,
    discover: ({ files }) =>
      files.flatMap(file => {
        if (!ruleMatchesFile(rule, file.extension, file.relativePath)) return []
        const extension = normalizedExtension(file.extension)
        return [
          {
            kind: "file-release" as const,
            confidence: "high" as const,
            source: file,
            release: {
              id: rule.system,
              system: rule.system,
              app: KORRI_RETROARCH_APP_ID,
              runtime: rule.runtime,
            },
            evidence: [{ kind: "extension", value: `.${extension}` }],
          },
        ]
      }),
  }),
)

export const retroarchGbaDiscoveryProvider = retroarchDiscoveryProviders[0]

function ruleMatchesFile(
  rule: RetroarchReleaseRule,
  extension: string,
  relativePath: string,
): boolean {
  const normalized = normalizedExtension(extension)
  if (!rule.extensions.has(normalized)) return false
  if (rule.folderHints === undefined) return true
  return pathSegments(relativePath).some(segment =>
    rule.folderHints?.has(segment),
  )
}

function normalizedExtension(extension: string): string {
  return extension.toLowerCase().replace(/^\./, "")
}

function pathSegments(path: string): readonly string[] {
  return path
    .toLowerCase()
    .split(/[\\/]+/)
    .map(segment => segment.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
}
