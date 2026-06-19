# ZQuest Classic plugin

Adds the first-party `@korri:zquest-classic` plugin for launching Zelda Classic `.qst` quests with the standalone `zplayer` binary.

## Config contributions

- System: `zelda-classic`
- Launcher: `@korri:zquest-classic/zplayer`
- Package module: `zquest-classic-package`

The launcher runs:

```text
zplayer -standalone {content.path} {playable.id}.sav
```

Saves are rooted at `/storage/saves/zquest-classic` via both `cwd` and `ZQUEST_CLASSIC_SAVE_FOLDER` so quests can create stable per-playable save files.

## Runtime validation

The SM8550 kiosk composition enables this plugin. Validation uses a readable library release with a file target such as:

```yaml
systems:
  zelda-classic:
    name: Zelda Classic Quest

library:
  to-the-top:
    title: ToTheTop
    releases:
      - id: zelda-classic
        system: zelda-classic
        target:
          kind: file
          storage: roms
          path: zelda-classic/ToTheTop.qst
        launch:
          use: "@korri:zquest-classic/zplayer"
```

Expected proof is an on-device launch of `zplayer` plus a screenshot after dismissing the first-run prompt.
