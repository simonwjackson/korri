---
id: task-028
title: Productize scoped game controller → keyboard wrapper for YFS-style browser games
status: To Do
priority: medium
labels:
  - packaging
  - input
  - yfs
  - korri-launcher
  - vendor
created: 2026-06-04
source: user
---

# Productize scoped game controller → keyboard wrapper for YFS-style browser games

## Why it matters

YFS (Yoshi's Fabrication Station) and similar browser-only games need controller input but ship as web apps that only listen for keyboard events. Our throwaway prototype proved that a scoped evsieve sidecar (virtual keyboard exists only while the launcher process is alive) gives us controller-to-keyboard input without leaking a global InputPlumber profile or touching system-wide input config. Without productizing this, every web-game launch will re-invent the mapping, and we'll keep relying on `/tmp/yfs-*-prototype.sh` scripts that hardcode device paths. The substrate is also relevant for any future browser-runtime game that needs scoped input mapping (not just YFS).

## Acceptance Criteria

- [ ] Wrapper is a real package under `product/vendor/` (or `product/platform/input/`) — not a /tmp script
- [ ] Wrapper lifecycle: virtual keyboard appears at launch, disappears at app exit; no orphaned `evsieve` after the wrapped command dies
- [ ] Wrapper takes the wrapped command + args as input; does not hardcode luakit/chromium/electrobun
- [ ] Per-game binding profile is declarative (JSON/TOML/Nix) — not hardcoded `--copy` flags in a shell script
- [ ] Controller source device is auto-detected (udev / `/dev/input/by-id/`), not pinned to `/dev/input/event9`
- [ ] Virtual keyboard device name is configurable but defaults to a Korri-scoped name so InputPlumber/portal can ignore it
- [ ] Stop semantics use PID files / process supervision, never `pkill -f` broad sweeps
- [ ] Co-located check that verifies: device appears, bindings translate as expected, device disappears on parent exit
- [ ] Documented YFS binding profile shipped as the first concrete consumer
- [ ] Works under gamescope-korri nested compositor (the proven YFS runtime path)

## Related

- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md`
- `product/vendor/gamescope-korri/package.nix`
- `product/apps/desktop/preload.ts`

## Notes

## Proven prototype mapping (evsieve)

The throwaway prototype script ships a virtual keyboard named `"Korri Scoped YFS Keyboard"` and uses these `--copy` rules:

```
--input /dev/input/event9 grab persist=exit

# D-pad
--copy abs:hat0y:-1            key:up:1@kb
--copy abs:hat0y:-1..0~        key:up:0@kb
--copy abs:hat0y:1             key:down:1@kb
--copy abs:hat0y:1..~0         key:down:0@kb
--copy abs:hat0x:-1            key:left:1@kb
--copy abs:hat0x:-1..0~        key:left:0@kb
--copy abs:hat0x:1             key:right:1@kb
--copy abs:hat0x:1..~0         key:right:0@kb

# Left stick (deadzone ~16000)
--copy abs:x:~16000..16001~    key:right:1@kb
--copy abs:x:16001~..~16000    key:right:0@kb
--copy abs:x:-16000~..~-16001  key:left:1@kb
--copy abs:x:~-16001..-16000~  key:left:0@kb
--copy abs:y:~16000..16001~    key:down:1@kb
--copy abs:y:16001~..~16000    key:down:0@kb
--copy abs:y:-16000~..~-16001  key:up:1@kb
--copy abs:y:~-16001..-16000~  key:up:0@kb

# Face buttons (YFS-correct mapping after user touch-up)
--copy btn:west                key:z@kb
--copy btn:south               key:z@kb   # user remap: south→z
--copy btn:north               key:a@kb   # user remap: north→a
--copy btn:east                key:x@kb
--copy btn:start               key:p@kb

--output @kb repeat name="Korri Scoped YFS Keyboard"
```

Note the user-driven remap during testing:
- original: south→a, west→z, east→x, start→p
- corrected during 480p run: south→z, north→a (so the "jump" face button feels right for an SNES-style platformer)

## Lifecycle pattern (proven)

The wrapper script:
1. Starts `evsieve` in the background under the user's session
2. Records the mapper PID
3. Starts the wrapped app (luakit, chromium, electrobun launcher) under the same shell
4. Records the app PID
5. `trap cleanup EXIT INT TERM` kills mapper + app by PID and `wait`s on both

Critical: cleanup uses recorded PIDs, never `pkill -f`. The evsieve cmdline is long enough that `pkill -f` regularly hits unrelated processes; the prototype enforces:
```
for pid in $(pgrep -x evsieve); do
  tr "\0" " " < /proc/$pid/cmdline | grep -q "Korri Scoped YFS Keyboard" && kill "$pid" || true
done
```

## Why scoped, not global

We explicitly avoided global InputPlumber profile switching because:
- It would leak across app launches (game B inherits game A's mapping)
- It conflicts with Korri's portal input pipeline (inputd → preload IPC)
- It violates the "session-scoped lifecycle" guarantee the rest of the desktop assumes

The scoped sidecar is the right boundary: virtual device exists ⇔ wrapper process exists.

## Reference paths (sobo, throwaway prototypes)

- `/tmp/yfs-scheme-evsieve-prototype.sh` — original Luakit + yfs:// scheme + evsieve
- `/tmp/yfs-gamescope-korri-luakit-prototype.sh` — current gamescope-korri + Luakit + evsieve
- `/tmp/yfs-gamescope-korri-chromium-prototype.sh` — gamescope-korri + Chromium + evsieve
- `/tmp/yfs-electrobun-cef-prototype.sh` — Electrobun CEF + evsieve

All four use the same evsieve invocation. That commonality is the strongest signal that the controller wrapper belongs in its own package, not duplicated per runtime.

## Runtime context (for reviewer)

The wrapper is one half of the YFS launch path. The other half is the chosen browser runtime:

| Runtime | FPS | PSS | Notes |
|---------|-----|-----|-------|
| Luakit (`yfs://` scheme) | 38–40 | low | baseline; ~60 under gamescope-korri fit |
| Luakit + gamescope-korri 832×448 | ~60 | 758 MiB | base-viewport pixel scaling |
| Chromium + gamescope-korri 832×448 | 119–122 | 824 MiB | proven 120fps path on this device |
| Electrobun CEF | 119–128 | 1131 MiB | reuses Korri enclosure |

All four were exercised against the same scoped evsieve wrapper, so productizing the wrapper unblocks every one of those runtime choices.

## Open design questions

1. Where does the wrapper live? `product/platform/input/scoped-keyboard-mapper/` feels right (reusable beyond YFS).
2. How are binding profiles named/discovered? Per-game ID? Per-runtime? Nix-derivation attr?
3. Source device discovery: prefer first connected gamepad via udev? Or take an explicit device path/ID from the binding profile?
4. Stop semantics: do we want the wrapper to also be reachable via a control socket so launcher-side code can request "drop the mapping now" without killing the child?
5. Should the wrapper expose a small status file (PID, device path, profile name) so checks/tests can verify the scoped device actually exists?
6. Does this belong inside `product/vendor/yoshis-fabrication-station/` as a YFS-specific helper, or one level up as shared infra? Current evidence (four runtimes using the same mapper) argues for shared infra.

## Recommended first cut

- New package `product/platform/input/scoped-keyboard-mapper/` (name TBD) with:
  - `package.nix` building evsieve + a tiny wrapper script
  - `bindings/` directory with per-game JSON profiles (start with `yfs.json`)
  - Co-located check that asserts virtual device lifecycle
- Update `product/vendor/yoshis-fabrication-station/` (when that package exists per the existing browser-runtime capture doc) to depend on the mapper and ship `yfs.json`
- Update the YFS launch script(s) to call the productized wrapper instead of hand-rolling `nix shell nixpkgs#evsieve -c evsieve ...`
