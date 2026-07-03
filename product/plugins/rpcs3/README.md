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
      audio:
        volume: 80                 # Master Volume, 0-200
        device: "@@@default@@@"    # RPCS3 Audio Device string
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
