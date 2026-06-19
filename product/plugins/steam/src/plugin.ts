import { plugin } from "@platform/plugin"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "../../gamescope"
import { collectSteamDiagnostics } from "./observability/diagnostics"
import {
  collectSteamLifecycle,
  openSteamLifecycleCorrelation,
} from "./observability/lifecycle-api"

export const KORRI_STEAM_PLUGIN_ID = "@korri:steam" as const
export const KORRI_STEAM_APP_LOCAL_ID = "steam" as const
export const KORRI_STEAM_APP_ID =
  `${KORRI_STEAM_PLUGIN_ID}/${KORRI_STEAM_APP_LOCAL_ID}` as const
export const KORRI_STEAM_STORAGE_LOCAL_ID = "steam" as const
export const KORRI_STEAM_STORAGE_ID =
  `${KORRI_STEAM_PLUGIN_ID}/${KORRI_STEAM_STORAGE_LOCAL_ID}` as const

export const steamRuntimePaths = {
  stateRoot: "/var/lib/korri/steam",
  fexRootfs: "/var/lib/korri/steam/fex-rootfs",
  proton10Root: "/var/lib/korri/steam/steamapps/common/Proton 10.0",
} as const

export interface SteamPluginPolicy {
  readonly state: {
    readonly root: string
  }
  readonly extra?: {
    readonly args?: readonly string[]
  }
  readonly "launch-options"?: string
}

export const defaultSteamPluginPolicy = {
  state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}/Steam` },
  extra: { args: ["-silent", "-gamepadui"] },
} satisfies SteamPluginPolicy

export const steamPlugin = plugin({
  namespace: "@korri",
  name: "steam",
  title: "Steam",
  description:
    "Owns Korri's first-party Steam app provider, authored Steam policy, and Steam launch boundary.",
  requires: [
    {
      capability: "launch.compose",
      ref: { provider: KORRI_GAMESCOPE_PLUGIN_ID, id: "launch-wrapper" },
      autoEnable: false,
      reason: "Steam AppID launches run inside Korri's Gamescope companion.",
    },
  ],
  contributes: {
    config: {
      storage: {
        [KORRI_STEAM_STORAGE_LOCAL_ID]: {
          id: KORRI_STEAM_STORAGE_LOCAL_ID,
          root: steamRuntimePaths.stateRoot,
        },
      },
      systems: {
        steam: {
          id: "steam",
          name: "Steam",
          apps: [{ id: KORRI_STEAM_APP_ID }],
        },
      },
      modules: {
        "session-cleanup": {
          id: "session-cleanup",
          kind: "session-hook",
          capabilities: ["session.cleanup"],
        },
        "steam-korri-package": {
          id: "steam-korri-package",
          kind: "nix-package",
          package: "steam-korri",
          path: "product/plugins/steam/packages/steam-korri",
          capabilities: ["package.expose", "steam.runtime"],
        },
        "steam-nixos-module": {
          id: "steam-nixos-module",
          kind: "nixos-module",
          path: "product/plugins/steam/nix/nixos-module.nix",
          capabilities: ["system.service", "steam.runtime"],
        },
      },
      apps: {
        [KORRI_STEAM_APP_LOCAL_ID]: {
          id: KORRI_STEAM_APP_ID,
          kind: KORRI_STEAM_PLUGIN_ID,
          command: "steam",
          systems: ["steam"],
          launch: {
            with: {
              [KORRI_GAMESCOPE_PLUGIN_ID]: { enable: true },
            },
          },
          plugin: {
            [KORRI_STEAM_PLUGIN_ID]: defaultSteamPluginPolicy,
          },
          policy: { allowedCommands: ["steam"] },
        },
      },
    },
    handlers: [
      {
        id: "steam.session-cleanup",
        operation: "session.cleanup",
        capabilities: ["session.cleanup"],
        run: context => ({ provider: context.provider, input: context.input }),
      },
      {
        id: "steam.diagnostics.collect",
        operation: "diagnostics.collect",
        capabilities: ["diagnostics.collect"],
        run: context => collectSteamDiagnostics(context.input),
      },
      {
        id: "steam.lifecycle.collect",
        operation: "lifecycle.collect",
        capabilities: ["lifecycle.collect"],
        run: context =>
          collectSteamLifecycle(
            context.input as Parameters<typeof collectSteamLifecycle>[0],
          ),
      },
      {
        id: "steam.lifecycle.correlate",
        operation: "lifecycle.correlate",
        capabilities: ["lifecycle.correlate"],
        run: context => {
          openSteamLifecycleCorrelation(context.input)
          return { status: "accepted" as const }
        },
      },
    ],
  },
})
