# Yoshi's Fabrication Station vendor package

Packages the public Construct 3 web export of Yoshi's Fabrication Station as a
static app launched by Chromium through a Unix-style `yfs` CLI.

## Source acquisition

The derivation pulls the public itch.io release artifact during a fixed-output
source fetch:

1. POST `upload_id=14671701` to
   `https://levelsharesquare.itch.io/yoshis-fabrication-station/download_url`.
2. Download the expiring URL returned by itch.io.
3. Verify the zip against the pinned fixed-output hash.

Pinned upstream zip SHA256:

```text
4e69ae9f18e8d326a9603234713f5603affdb89b6ca5a4c8d1d01770cd2540ca
```

## CLI

```bash
yfs                          # normal title screen
yfs level.json               # load a local level
yfs - < level.json           # explicit stdin
cat level.json | yfs          # implicit piped stdin
yfs --sample basicMovement    # built-in sample
yfs --lss 6a09c74c233001051b75784a
```

Setting overrides:

```bash
--audio / --no-audio
--gba-sounds / --no-gba-sounds
--quick-death / --no-quick-death
--play-timer / --no-play-timer
--bgm-volume 0..10
--sfx-volume 0..10
```

These are launch-session overrides. They do not write YFS's persisted settings.

## Gamescope

`gamescope-korri` is deliberately not part of this package. Wrap externally:

```bash
gamescope-korri -W 1920 -H 1080 -w 832 -h 448 -r 120 -S fit -F pixel \
  --force-windows-fullscreen -- yfs level.json
```

## Patch strategy

The Construct export's `scripts/c3main.js` is minified. The derivation:

1. copies the upstream web export,
2. beautifies `scripts/c3main.js` with pinned nixpkgs `prettier`,
3. applies `tools/patch-c3main.mjs` to wrap selected setting reads,
4. injects `direct-launch-pre.js` and `direct-launch.js`,
5. ships the readable patched `c3main.js`.

This avoids fragile one-line patches against the minified blob while keeping the
actual changes small and auditable.
