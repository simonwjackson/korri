export interface PortMasterRuntimeMountProfile {
  readonly runtime: string
  readonly sourcePath: string
}

export interface PortMasterRuntimeCompatibilityProfile {
  readonly mode: "none" | "retroarch-libretro" | "runtime-mounts"
  readonly retroarchPath?: string
  readonly retroarchLogPath?: string
  readonly runtimeMounts?: readonly PortMasterRuntimeMountProfile[]
}

export interface PortMasterInputCompatibilityProfile {
  readonly mode: "none" | "sdl-gamecontroller" | "gptokeyb"
  readonly sdlGameControllerConfig?: string
  readonly gptokeybPath?: string
  readonly gptokeybLoaderPath?: string
  readonly gptokeybLogPath?: string
  readonly bindRealUinput?: boolean
}

export interface PortMasterPresentationProfile {
  readonly mode: "none" | "sway-fullscreen" | "gamescope"
  readonly swaymsgPath?: string
  readonly windowMatcher?: string
  readonly logPath?: string
  readonly windowProbe?: string
  readonly startupPollAttempts?: number
  readonly startupPollDelayMs?: number
  readonly gamescopePath?: string
  readonly gamescopeArgs?: readonly string[]
  readonly gamescopeWidth?: number
  readonly gamescopeHeight?: number
  readonly gamescopeNestedWidth?: number
  readonly gamescopeNestedHeight?: number
  readonly gamescopeFullscreen?: boolean
  readonly gamescopeChildWaylandDisplay?: string
  readonly gamescopeChildDisplay?: string
  readonly gamescopeChildSdlVideoDriver?: string
}

export interface PortMasterCompatibilityProfile {
  readonly launchScript?: string
  readonly deviceArch?: string
  readonly env?: Readonly<Record<string, string>>
  readonly runtimeCompatibility?: PortMasterRuntimeCompatibilityProfile
  readonly inputCompatibility?: PortMasterInputCompatibilityProfile
  readonly presentation?: PortMasterPresentationProfile
}

export type PortMasterCompatibilityProfileMap = Readonly<
  Record<string, PortMasterCompatibilityProfile>
>
