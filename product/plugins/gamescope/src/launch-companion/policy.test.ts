import { describe, expect, it } from "bun:test"

import {
  decodeGamescopePolicy,
  foldGamescopePolicy,
  gamescopePolicyFromLaunch,
  normalizeGamescopePolicy,
} from "./policy"

describe("Gamescope launch companion policy", () => {
  it("decodes the authored provider payload shape", () => {
    expect(
      decodeGamescopePolicy({
        enable: true,
        backend: { type: "wayland" },
        display: { nested: { width: 1280, height: 720 } },
        scaling: { filter: "fsr" },
        extraArgs: ["--stats-path", "/tmp/stats"],
      }),
    ).toEqual({
      enable: true,
      backend: { type: "wayland" },
      display: { nested: { width: 1280, height: 720 } },
      scaling: { filter: "fsr" },
      extraArgs: ["--stats-path", "/tmp/stats"],
    })
  })

  it("preserves authored launch.with provider entries", () => {
    expect(
      gamescopePolicyFromLaunch({
        launch: { with: { "@korri:gamescope": { enable: false } } },
      }),
    ).toEqual({ enable: false })
  })

  it("keeps plugin-owned strict validation for invalid payload keys", () => {
    expect(() => decodeGamescopePolicy({ enable: true, typo: true })).toThrow()
  })

  it("normalizes enabled policies with plugin-owned defaults", () => {
    expect(
      normalizeGamescopePolicy({ extraArgs: ["--fps-limit", "60"] }),
    ).toEqual({
      enable: true,
      backend: { type: "wayland" },
      window: {
        fullscreen: true,
        borderless: true,
        exposeWayland: true,
      },
      extraArgs: ["--fps-limit", "60"],
    })
  })

  it("does not apply defaults when explicitly disabled", () => {
    expect(normalizeGamescopePolicy({ enable: false })).toEqual({
      enable: false,
    })
  })

  it("folds scalar, nested, and list contributions in plugin-owned code", () => {
    expect(
      foldGamescopePolicy(
        {
          enable: true,
          command: "/run/current-system/sw/bin/gamescope",
          display: { nested: { width: 1280, height: 720 } },
          extraArgs: ["base"],
        },
        {
          display: { nested: { width: 1920 } },
          scaling: { filter: "fsr" },
          extraArgs: ["override"],
        },
      ),
    ).toEqual({
      enable: true,
      command: "/run/current-system/sw/bin/gamescope",
      display: { nested: { width: 1920, height: 720 } },
      scaling: { filter: "fsr" },
      extraArgs: ["base", "override"],
    })
  })
})
