import { describe, expect, it } from "bun:test"

import {
  composeRyubingLaunchSpec,
  RYUBING_CONFIG_VERSION,
  renderRyubingConfig,
} from "./ryubing-launch-spec"

describe("typed Ryubing launch spec rendering", () => {
  it("renders minimal headless argv with content path last", () => {
    const spec = composeRyubingLaunchSpec({
      command: "/bin/Ryujinx",
      policy: { state: { root: "/state/Ryujinx" } },
      gamePath: "/games/Mario Kart 8 Deluxe.nsp",
    })

    expect(spec).toEqual({
      command: "/bin/Ryujinx",
      args: [
        "--no-gui",
        "--root-data-dir",
        "/state/Ryujinx",
        "--use-main-config",
        "/games/Mario Kart 8 Deluxe.nsp",
      ],
    })
  })

  it("renders typed display graphics and console options consistently", () => {
    const policy = {
      state: { root: "/state/Ryujinx" },
      display: { fullscreen: true, "hide-cursor": "on-idle" },
      graphics: {
        backend: "vulkan",
        "backend-threading": "auto",
        pptc: "disabled",
      },
      console: { mode: "handheld" },
    } as const

    const spec = composeRyubingLaunchSpec({
      command: "Ryujinx",
      policy,
      gamePath: "/games/metroid.xci",
    })
    const config = renderRyubingConfig(policy)

    expect(spec.args).toContain("--fullscreen")
    expect(spec.args).toContain("--hide-cursor")
    expect(spec.args).toContain("OnIdle")
    expect(spec.args).toContain("--graphics-backend")
    expect(spec.args).toContain("Vulkan")
    expect(spec.args).toContain("--backend-threading")
    expect(spec.args).toContain("Auto")
    expect(spec.args).toContain("--disable-ptc")
    expect(spec.args).toContain("--disable-docked-mode")
    expect(config).toMatchObject({
      version: RYUBING_CONFIG_VERSION,
      start_fullscreen: true,
      hide_cursor: "OnIdle",
      graphics_backend: "Vulkan",
      backend_threading: "Auto",
      enable_ptc: false,
      docked_mode: false,
    })
  })

  it("docked mode writes config without disabling docked CLI mode", () => {
    const policy = {
      state: { root: "/state/Ryujinx" },
      console: { mode: "docked" },
    } as const

    const spec = composeRyubingLaunchSpec({
      command: "Ryujinx",
      policy,
      gamePath: "/games/zelda.nsp",
    })
    const config = renderRyubingConfig(policy)

    expect(spec.args).not.toContain("--disable-docked-mode")
    expect(config.docked_mode).toBe(true)
  })

  it("merges cascade env with Ryubing policy env taking precedence", () => {
    const spec = composeRyubingLaunchSpec({
      command: "Ryujinx",
      env: { PULSE_SERVER: "unix:/run/pulse/native", SDL_AUDIODRIVER: "alsa" },
      policy: {
        state: { root: "/state/Ryujinx" },
        env: { SDL_AUDIODRIVER: "pulse" },
      },
      gamePath: "/games/zelda.nsp",
    })

    expect(spec.env).toEqual({
      PULSE_SERVER: "unix:/run/pulse/native",
      SDL_AUDIODRIVER: "pulse",
    })
  })

  it("keeps extra args unrestricted before final content path", () => {
    const spec = composeRyubingLaunchSpec({
      command: "Ryujinx",
      policy: {
        state: { root: "/state/Ryujinx" },
        extra: { args: ["--root-data-dir", "/operator/override"] },
      },
      gamePath: "/games/zelda.nsp",
    })

    expect(spec.args.slice(-3)).toEqual([
      "--root-data-dir",
      "/operator/override",
      "/games/zelda.nsp",
    ])
  })

  it("applies extra config last and renders typed controller input_config", () => {
    const config = renderRyubingConfig({
      input: {
        "require-config": true,
        controllers: [
          {
            id: "0",
            name: "Korri Primary Controller",
            backend: "gamepad-sdl2",
            player: "player-1",
            type: "pro-controller",
            deadzone: { left: 0.1, right: 0.2 },
            mapping: { a: "button-east", "left-stick-x": "left-x" },
          },
        ],
      },
      extra: { config: { start_fullscreen: false } },
    })

    expect(config.start_fullscreen).toBe(false)
    expect(config.input_config).toEqual([
      expect.objectContaining({
        id: "0",
        name: "Korri Primary Controller",
        controller_type: "ProController",
        player_index: "Player1",
        input_backend: "GamepadSDL2",
        left_deadzone: 0.1,
        right_deadzone: 0.2,
        button_a: "ButtonEast",
        left_stick_x: "LeftX",
      }),
    ])
  })

  it("defaults audio_backend to OpenAl when policy does not choose one", () => {
    // Ryujinx's SDL2 backend queues samples without dropping them: any
    // sub-realtime stretch (boot, shader compile, slow GPU) accumulates
    // seconds of audio latency that never drains for the rest of the
    // session (validated on bandai/SM8550 2026-06-11, see
    // docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md).
    // OpenAL pulls on demand, so korri-launched Ryubing defaults to it.
    expect(renderRyubingConfig({})).toMatchObject({
      audio_backend: "OpenAl",
    })
  })

  it("lets an explicit audio backend policy override the OpenAl default", () => {
    expect(
      renderRyubingConfig({ audio: { backend: "sound-io" } }),
    ).toMatchObject({ audio_backend: "SoundIo" })
  })

  it("rejects missing required launch facts", () => {
    expect(() =>
      composeRyubingLaunchSpec({
        command: "Ryujinx",
        policy: {},
        gamePath: "/games/game.nsp",
      }),
    ).toThrow(/state.root/)
    expect(() =>
      composeRyubingLaunchSpec({
        command: "Ryujinx",
        policy: { state: { root: "/state" } },
        gamePath: "",
      }),
    ).toThrow(/game path/)
  })
})
