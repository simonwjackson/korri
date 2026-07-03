# RPCS3 plugin

First-party Korri plugin for Sony PlayStation 3 content discovered from JB disc
folders and launched with RPCS3 on source-machine hosts.

The initial slice supports direct child game folders shaped:

```text
sony-playstation-3/
  Skate 3 [BLUS30464]/
    PS3_DISC.SFB
    PS3_GAME/
```

RPCS3 firmware and game assets are operator-supplied. The plugin must not
download, bundle, or redistribute them.

## Settings surface

RPCS3 is configured through **one unified semantic settings tree** under
`settings.plugin` for `@korri:rpcs3`. You declare *what* you want; the plugin
decides *how* to deliver it — as an argv flag, a `config.yml` key, or a GUI
`CurrentSettings.ini` entry. **The delivery mechanism never appears in the
authoring vocabulary.**

```yaml
settings:
  plugin:
    "@korri:rpcs3":
      # Phase 1 — "everyone has an opinion"
      video:
        resolution: "1280x720"     # RPCS3 video_resolution string, verbatim
        aspectRatio: "16:9"        # 16:9 | 4:3 (RPCS3 only defines these two)
        fullscreen: true           # flag + config, both materialized
        frameLimit: 60             # 30 | 50 | 60 | 120 | off | auto | native | infinite | display
        vsync: true                # true -> "Full", false -> "Disabled"
        # Phase 2 — power-user video
        renderer: vulkan           # vulkan | opengl | null
        resolutionScale: 100       # 25–800 (percent)
        anisotropicFilter: 0       # 0–16 (0 = auto)
        shaderMode: async          # legacy | async | async-interpreter | interpreter
        # Phase 3 — per-game GPU accuracy
        writeColorBuffers: false
        writeDepthBuffer: false
        readColorBuffers: false
        strictRendering: false
        disableZcull: false
        msaa: auto                 # disabled | auto
      audio:
        volume: 80                 # Master Volume, 0-200
        device: "@@@default@@@"    # RPCS3 Audio Device string
        # Phase 2 — power-user audio
        backend: cubeb             # cubeb | faudio | xaudio2 | null (Audio Renderer)
        format: stereo             # stereo | surround-5.1 | surround-7.1 | automatic | manual
      system:                      # Phase 2 — locale / region
        language: en-US            # one of 20 PS3 locales
        licenseArea: america       # japan|america|europe|asia|korea|china|other
      core:                        # Phase 3 — per-game CPU/SPU accuracy
        ppuDecoder: llvm-recompiler     # interpreter-static | llvm-recompiler
        spuDecoder: asmjit-recompiler   # interpreter-static | asmjit-recompiler | llvm-recompiler
        spuBlockSize: safe              # safe | mega | giga
        spuXFloatAccuracy: approximate  # accurate | approximate | relaxed | inaccurate
        preferredSpuThreads: 0          # 0 (auto) – 6
        clocksScale: 100                # 10 – 3000 (percent)
        librariesControl:               # LLE selection (renders as a YAML list)
          - liblv2.sprx:lle
      # Phase 0 — headless-boot essentials
      boot:
        headless: false            # --headless (no render window)
        exitOnFinish: true         # Exit RPCS3 when process finishes
        suppressPopups: true       # silence GUI confirmation/info boxes
        autoStart: true            # Automatically start games after boot
      # Genuinely plugin-specific
      state:
        root: "{storage:@korri:rpcs3/state}"   # the RPCS3 config dir (…/rpcs3)
      firmware:
        sentinel: "dev_flash/sys/external/liblv2.sprx"
```

`--no-gui` is always applied; it is a property of the headless launch, not an
authored setting. `command` is the standard app-record field and `env` is the
standard `context.env` — neither belongs under `settings.plugin`.

### How settings are delivered

At launch the plugin materializes a **per-release** config file at
`<state.root>/korri/config-<releaseId>.yml` and passes it via `--config`. It is
built by reading the operator's canonical `<state.root>/config.yml`,
deep-merging the routed settings on top, and applying any raw `overrides.config`
— the operator's canonical file is read but **never modified**. GUI popup
toggles are merged into `<state.root>/GuiConfigs/CurrentSettings.ini`, preserving
unrelated GUI state.

`state.root` **is** the RPCS3 config directory (its basename must be `rpcs3`);
the plugin derives `XDG_CONFIG_HOME`/`HOME` from its parent so RPCS3 resolves
that directory as `$XDG_CONFIG_HOME/rpcs3`.

### Escape hatch

Anything not (yet) modeled is reachable through the settled `LaunchOverrides`
shape on a release's `launch.overrides` — never buried under `settings.plugin`:

```yaml
launch:
  overrides:
    args:
      append: ["--some-new-flag"]   # prepend/append accumulate; replace swaps
    config:
      append: |                      # plain-text YAML, deep-merged over routed
        Video:
          Anisotropic Filter Override: 16
```

`overrides.config` is the format-native escape hatch (YAML for RPCS3); `replace`
wins the whole file, `prepend`/`append` deep-merge. `overrides.args.replace`
swaps only the routed-flags segment and never removes `--no-gui`, `--config`, or
the game path. The escape hatch also insulates you from RPCS3 version drift: the
curated value maps target a pinned RPCS3 build, and any renamed/removed key
remains reachable as raw config.

## Input authoring (pad / keyboard mappings)

RPCS3 stores input profiles **separately** from `config.yml`, under
`<state.root>/input_configs/global/<name>.yml`, as a per-player YAML schema.
Declare mappings under `settings.plugin."@korri:rpcs3".input.players` in the
same delivery-agnostic spirit as the settings surface — clean Korri names only;
the plugin translates them to RPCS3's exact `Handler` / `Config` strings.

```yaml
settings:
  plugin:
    "@korri:rpcs3":
      input:
        players:                       # positional: index 0 -> Player 1 Input (max 7)
          - handler: evdev             # null|keyboard|ds3|ds4|dualsense|skateboard|move|sdl|evdev
            device: "Sunshine X-Box One (virtual) pad"
            buttons:                   # binding tokens are handler-specific strings
              cross: BTN_SOUTH
              circle: BTN_EAST
            sticks:
              left: { deadzone: 40, multiplier: 100 }   # 0–1000000 / 0–200
              right: { deadzone: 30 }
            triggers:
              l2: { threshold: 20 }    # 0–1000000
          - handler: keyboard          # keyboard-as-pad: bind keys to buttons/sticks
            device: "Keyboard"
            buttons:
              cross: Return
              leftStickUp: W
            mouse:
              movementMode: relative   # relative | absolute
              deadzoneX: 60            # 0–255
```

### How input is delivered

When `input` is authored, the plugin materializes a **Korri-owned** profile at
`<state.root>/input_configs/global/korri-<releaseId>.yml` and passes its bare
name via `--input-config`. RPCS3's `--input-config` override branch resolves
`<name>` under `input_configs/global/` and wins over per-title / active-profile
selection, so this one flag fully binds input. The per-player `Handler` lives in
the profile itself, so **no `config.yml` companion is required** for pad
selection.

Korri only ever writes `korri-*.yml` — operator-authored profiles (including
`global/Default.yml`) are never read or clobbered. Unlisted players default to
`Handler: "Null"`, and any `cfg_pad` key you don't author falls back to RPCS3's
built-in default, so partial profiles are valid.

Only the common subset is modeled (handler/device, buttons, stick
deadzone/multiplier, trigger thresholds, keyboard/mouse-as-pad basics). The deep
`cfg_pad` tail (motion sensors, LEDs, vibration, lerp, squircling, device
identity) and exotic handlers stay reachable via the escape hatch. Handler and
`Config` strings are verified against RPCS3 `pad_config.h` /
`pad_config_types.cpp` at the pinned build; `xinput`/`mm` are Windows-only and
intentionally omitted.
