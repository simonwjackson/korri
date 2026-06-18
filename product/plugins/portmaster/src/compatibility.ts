export interface PortMasterRuntimeCompatibilityProfile {
  readonly mode: "none" | "retroarch-libretro"
  readonly retroarchPath?: string
  readonly retroarchLogPath?: string
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
  readonly mode: "none" | "sway-fullscreen"
  readonly swaymsgPath?: string
  readonly windowMatcher?: string
  readonly logPath?: string
  readonly windowProbe?: string
  readonly startupPollAttempts?: number
  readonly startupPollDelayMs?: number
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
