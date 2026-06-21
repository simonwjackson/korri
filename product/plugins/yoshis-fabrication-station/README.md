# Yoshi's Fabrication Station plugin package

Packages the public Construct 3 web export of Yoshi's Fabrication Station as a
static Chromium-launched app.

The plugin exposes two command surfaces:

- `yfs` — legacy/general wrapper for title screen, samples, stdin, local files,
  and Level Share Square IDs.
- `yfs-launch <level-file>` — productized Korri launcher surface for a supplied
  raw YFS level JSON artifact. This is the launcher catalog authors should use
  for level releases.

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

## `yfs-launch <level-file>`

`yfs-launch` is the first-class Korri launcher for raw YFS level artifacts:

```bash
yfs-launch another-yoshis-island-2-6.json
yfs-launch --metrics --bgm-volume=7 --sfx-volume=7 level.json
```

Contract:

- `KORRI_YFS_WEBROOT` must point at an already-compatible/patched YFS webroot.
  The package/extraction layer owns upstream compatibility patches.
- The level argument is a raw YFS level JSON file. The launcher validates only
  file readability, non-empty size bounds, and JSON syntax; YFS validates game
  semantics.
- The launcher prepares a cache/store-like root containing a copied webroot and
  `level.json`, then launches `index.html?code_url=level.json`.
- Prepared roots are keyed by webroot identity, level digest, launcher version,
  and settings. Corrupt/incomplete roots are rebuilt once.
- Prepared roots strip the legacy `direct-launch-pre.js`/`direct-launch.js`
  tags so the new web-canvas pre-navigation shims are the only launch
  automation path.
- `--allow-file-access-from-files` is private to this local-file launcher; it is
  not a generic web-canvas default.

YFS launcher settings:

```bash
--audio / --no-audio
--gba-sounds / --no-gba-sounds
--quick-death / --no-quick-death
--play-timer / --no-play-timer
--bgm-volume 0..10
--sfx-volume 0..10
--metrics
--debug
```

The settings helper intentionally does **not** patch WebGL with
`preserveDrawingBuffer`. That patch was useful for old boot-frame capture, but it
risks the 120fps-class Chromium/WebGL path.

## Legacy `yfs` CLI

```bash
yfs                          # normal title screen
yfs level.json               # load a local level
yfs - < level.json           # explicit stdin
cat level.json | yfs          # implicit piped stdin
yfs --sample basicMovement    # built-in sample
yfs --lss 6a09c74c233001051b75784a
```

The legacy settings flags are launch-session overrides. They do not write YFS's
persisted settings.

## Gamescope

`gamescope-korri` is deliberately not part of this package or `yfs-launch`. Wrap
externally if desired.

## Patch strategy

The Construct export's `scripts/c3main.js` is minified. The derivation:

1. copies the upstream web export,
2. beautifies `scripts/c3main.js` with pinned nixpkgs `prettier`,
3. applies `tools/patch-c3main.mjs` to wrap selected setting reads,
4. injects the legacy direct-launch scripts for the `yfs` wrapper,
5. packages separate `yfs-launch-*` shims for the productized launcher,
6. ships the readable patched `c3main.js`.

This avoids fragile one-line patches against the minified blob while keeping the
actual changes small and auditable.
