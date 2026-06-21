export type VdfObject = { [key: string]: string | VdfObject }

export interface SteamGateSeedOptions {
  readonly appIds?: readonly string[]
  readonly suppressInterstitials?: boolean
  readonly acceptEulas?: boolean
}

type InterstitialMode = "once" | "once-per-game" | "every-time"

interface DeckConfiguratorInterstitial {
  readonly base: string
  readonly mode: InterstitialMode
}

export const DECK_CONFIGURATOR_INTERSTITIALS: readonly DeckConfiguratorInterstitial[] =
  [
    { base: "Intro", mode: "once" },
    { base: "NonVerifiedGame", mode: "once" },
    { base: "Gyro", mode: "once" },
    { base: "RemotePlayConfirm", mode: "once" },
    { base: "ExternalControllersAndSIAPI", mode: "once" },
    { base: "IntroToActionSets", mode: "once" },
    { base: "IntroToSteamInputGames", mode: "once" },
    { base: "AppHasSmallText", mode: "once-per-game" },
    {
      base: "AppTextInputDoesNotAutomaticallyInvokesKeyboard",
      mode: "once-per-game",
    },
    { base: "AppLauncherInteractionIssues", mode: "once-per-game" },
    { base: "GamepadRecommended", mode: "once-per-game" },
    { base: "CurrentGamepadUnsupported", mode: "once-per-game" },
    { base: "CurrentGamepadSteamInputOptIn", mode: "once-per-game" },
    { base: "IntroToVRTheater", mode: "once-per-game" },
    { base: "HDRRequiresUserAction", mode: "once-per-game" },
    { base: "GamepadRequired", mode: "every-time" },
    { base: "VRRequired", mode: "every-time" },
  ] as const

const STEAM_LOCALCONFIG_ROOT = [
  "UserLocalConfigStore",
  "Software",
  "Valve",
  "Steam",
] as const

export function applySteamGateSeeds(
  localconfig: VdfObject,
  options: SteamGateSeedOptions,
): VdfObject {
  if (options.suppressInterstitials) {
    for (const interstitial of DECK_CONFIGURATOR_INTERSTITIALS) {
      if (interstitial.mode === "every-time") continue
      setVdfPath(
        localconfig,
        [
          ...STEAM_LOCALCONFIG_ROOT,
          `Deck_ConfiguratorInterstitialsVersionSeen_${interstitial.base}`,
        ],
        "99",
      )
      if (interstitial.mode === "once-per-game") {
        setVdfPath(
          localconfig,
          [
            ...STEAM_LOCALCONFIG_ROOT,
            `Deck_ConfiguratorInterstitialsCheckbox_${interstitial.base}`,
          ],
          "1",
        )
      }
    }
  }

  if (options.acceptEulas) {
    for (const appId of options.appIds ?? []) {
      for (const index of [0, 1, 2]) {
        setVdfPath(
          localconfig,
          [...STEAM_LOCALCONFIG_ROOT, "apps", appId, `${appId}_eula_${index}`],
          "1",
        )
      }
    }
  }

  return localconfig
}

export function setVdfPath(
  root: VdfObject,
  path: readonly string[],
  value: string | VdfObject,
): void {
  let current = root
  for (const key of path.slice(0, -1)) {
    const existing = current[key]
    if (typeof existing !== "object" || existing === null) {
      current[key] = {}
    }
    current = current[key] as VdfObject
  }
  current[path[path.length - 1] as string] = value
}
