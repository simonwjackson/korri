# GameMaker/GMLoader compatibility matrix — RG353M spike

Date: 2026-06-23
Device: RG353M / RK3566 / 640x480
Runner path: PortMaster `gmloadernext.aarch64` from the Spelunky port, wrapped from Nix spike package.
Visual-test constraints: Korri GUI kept closed; Remap bridge used where possible; `SDL_AUDIODRIVER=dummy` used because Pulse endpoint was unavailable; controller input was not a pass/fail gate unless noted.

## Summary

- HTML5/Chromium Stargrove Scramble is not enjoyable on RG353M: best observed path was gamescope/Xwayland with pixel filtering, but it remained too slow.
- PortMaster/GMLoader is clearly the better Stargrove path on this hardware.
- Curated PortMaster GMLoader ports validated quickly: Stargrove Scramble and Spelunky both boot/render natively.
- Generic itch APK loading is feasible for a subset of GameMaker Android exports, especially arm64 exports with `assets/game.droid` + `lib/arm64-v8a/libyoyo.so`.
- The Reality Blind games form a useful compatible export cluster, but do not by themselves prove broad compatibility.
- Cross-developer evidence now includes multiple non-Reality-Blind itch arm64 GameMaker visual successes: Mini Splatoon plus seven clear passes from a 10-game randomized arm64 pass.
- Randomized arm64 pass result: 10 public itch Android+GameMaker candidates were selected from 472 scraped listing URLs; 7 were clear visual passes, 2 hit the known asset-manager/runtime-version failure class, and 1 reached main loop but produced only a flat color frame in the capture window.
- Major generic blockers: 32-bit-only APKs, Android asset-manager expectations, EGL/GBM discovery after reboot, real audio, and input mapping/touch behavior.

## Compatibility matrix

| Title | Source | Source type | ABI / payload shape | Transforms applied | Launch result on RG353M | Apparent performance | Input status | Audio status | Notes / failure reason |
|---|---|---|---|---|---|---|---|---|---|
| Stargrove Scramble | https://portmaster.games/detail.html?name=stargrovescramble / https://github.com/PortsMaster/PortMaster-New/releases/download/2026-04-08_0939/stargrovescramble.zip | PortMaster curated GMLoader port | Bundled `gmloadernext.aarch64`, `assets/game.droid`, `lib/arm64-v8a/libyoyo.so` | Nixified wrapper/package; preserve/chmod executable; runtime library path | PASS: boots/renders via native GMLoader | Good enough visually; far better than Chromium | Remap bridge later confirmed synthetic controller visible to GMLoader class of apps | Dummy audio for visual pass; real Pulse path unresolved | Recommended path for RG353M; HTML5 path rejected for performance |
| Spelunky | https://github.com/PortsMaster/PortMaster-New/releases/download/2025-01-14_1009/spelunky.zip | PortMaster curated GMLoader port | Bundled `gmloadernext.aarch64`, `gmloader.json`, game assets/libs | Nixified wrapper/package; added `bzip2` to runtime path after `libbz2.so.1.0` failure | PASS: boots/renders via native GMLoader | Good enough visually | Remap/GMLoader sees synthetic controller in same runner path | Dummy audio for visual pass | Became reusable runner/library baseline for APK experiments |
| Sacrificio Inc. | https://realityblind.itch.io/sacrificio-inc | itch Android APK, Reality Blind | arm64 GameMaker: `assets/game.droid`, `lib/arm64-v8a/libyoyo.so` | Extract APK; repack `.port` with stored/uncompressed payload; seed Android shim libs from PortMaster baseline; force `os_android` | PASS: visible title/menu | Good apparent fps | Failed in tested keyboard/gamepad/touch mappings | Dummy audio | Compatible export cluster; controls need separate work |
| Last Girl On Earth | Reality Blind itch APK | itch Android APK, Reality Blind | arm64 GameMaker shape | Same APK-to-GMLoader transform | PASS: visible/game screen; user said “looks good” | Good apparent fps | Not validated | Dummy audio | Compatible export cluster |
| Kick or Treat | Reality Blind itch APK | itch Android APK, Reality Blind | arm64 GameMaker shape | Same APK-to-GMLoader transform | PASS: visible/non-blank screenshot; main loop reached | Good apparent fps | Not validated | Dummy audio | Compatible export cluster |
| Piggy Butchery | Reality Blind itch APK | itch Android APK, Reality Blind | arm64 GameMaker: `assets/game.droid`, `lib/arm64-v8a/libyoyo.so`, `libc++_shared.so` | Same APK-to-GMLoader transform; had to restore EGL/GBM env after hard reboot | PASS: title screen visible; main loop alive; synthetic controller assigned | Good apparent fps from live screen/process | Synthetic gamepad assigned; gameplay input not validated | Dummy audio | Initially blocked by post-reboot compositor/EGL discovery; passed after `__EGL_VENDOR_LIBRARY_FILENAMES`, `GBM_BACKENDS_PATH`, `LIBGL_DRIVERS_PATH` were supplied |
| Mini Splatoon | https://sir-winsalot.itch.io/mini-splatoon | itch Android APK, non-Reality-Blind | arm64 GameMaker: `assets/game.droid`, `lib/arm64-v8a/libyoyo.so` | Extract APK; repack `.port` with stored/uncompressed payload; seed Android shim libs; force `os_android`; pass EGL/GBM env | PASS: visible title screen; main loop alive; synthetic controller detected | Visible; CPU high (~110%), so comfort/fps not fully validated | Synthetic gamepad detected by game input library; gameplay not validated | Dummy audio | Important cross-developer success beyond Reality Blind cluster |
| Animalcules | https://butterboygames.itch.io/animalcules | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64 GameMaker: `assets/game.droid`, `lib/arm64-v8a/libyoyo.so` | Same APK-to-GMLoader transform; EGL/GBM env; dummy audio | PASS: title screen visible (`Tap to Play!`); main loop alive; synthetic controller assigned | Good apparent visual result; CPU ~69% during sample | Synthetic gamepad assigned; gameplay input not validated | Dummy audio | Random pass #1; screenshot `/tmp/random-gmloader-results/1-animalcules/screen.png` |
| Fur Food Contest | https://ziul-walls.itch.io/fur-food-contest | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64+armv7 GameMaker | Same APK-to-GMLoader transform | PASS: menu visible (`Solo mode`, `VS CPU`, `PVP LAN`); main loop alive | Visible; CPU high (~99%), comfort not fully validated | Synthetic gamepad assigned; gameplay input not validated | Dummy audio | Random pass #2 |
| The Lotls: Sky Ranger | https://thelotls.itch.io/the-lotls-sky-ranger | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64+armv7 GameMaker | Same APK-to-GMLoader transform | INCONCLUSIVE: main loop alive but screenshot was flat purple frame | Unknown | Synthetic gamepad assigned; gameplay input not validated | Dummy audio | Random pass #3; not counted as visual title/menu/game success |
| Shitty Hero | https://elvgames.itch.io/shitty-hero | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64 GameMaker | Same APK-to-GMLoader transform | PASS: title/menu visible; main loop alive | Good apparent visual result; CPU ~69% | Synthetic gamepad assigned; gameplay input not validated | Dummy audio | Random pass #4 |
| Words With Freds | https://thatsmytrunks.itch.io/words-with-freds | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64+armv7 GameMaker | Same APK-to-GMLoader transform | PASS: instructions/menu visible; main loop alive | Good apparent visual result; CPU ~55% | Synthetic gamepad assigned; gameplay input not validated | Dummy audio | Random pass #5 |
| Digivice Emulator D-Power | https://k0as7.itch.io/digivice-emulator-dpower | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64+armv7 GameMaker-like APK | Same APK-to-GMLoader transform attempted | FAIL | N/A | N/A | N/A | Random pass #6; same failure class as Spelunky Classic HD: `Unable to get asset manager` then `Unable to find game!!: assets/game.droid` |
| OFU | https://fe26.itch.io/ofu | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64+armv7 GameMaker | Same APK-to-GMLoader transform | PASS: menu visible; main loop alive | Good apparent visual result; CPU ~53% | Synthetic gamepad assigned; gameplay input not validated | Dummy audio | Random pass #7 |
| Pig in Tower 2 | https://greenretroman.itch.io/pig-in-tower-2 | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64+armv7 GameMaker | Same APK-to-GMLoader transform | PASS: title/menu visible; main loop alive | Good apparent visual result; CPU ~48% | Synthetic gamepad assigned; gameplay input not validated | Dummy audio | Random pass #8 |
| OBG / One Button Game | https://kingamescreator.itch.io/obg | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64+armv7 GameMaker | Same APK-to-GMLoader transform | PASS: title/menu visible; main loop alive | Good apparent visual result; CPU ~51% | Synthetic gamepad assigned; gameplay input not validated | Dummy audio | Random pass #9 |
| Nothingness | https://he-kt-or.itch.io/nothingness | itch Android APK, randomized non-Reality-Blind arm64 pass | arm64 GameMaker-like APK | Same APK-to-GMLoader transform attempted | FAIL | N/A | N/A | N/A | Random pass #10; same asset-manager failure class: `Unable to get asset manager` then `Unable to find game!!: assets/game.droid` |
| Spelunky Classic HD itch APK | https://yancharkin.itch.io/spelunky-classic-hd | itch Android APK, non-Reality-Blind | arm64 GameMaker-like APK | Same APK-to-GMLoader transform attempted | FAIL | N/A | N/A | N/A | Runner/API-version class issue: `Unable to get asset manager` / could not find `assets/game.droid` despite APK shape |
| Roulette Knight LD41 | https://fourquarters.itch.io/roulette-knight-ludum-dare-41 | itch Android APK, non-Reality-Blind | GameMaker, but 32-bit-only: `armeabi-v7a`/`armeabi` `libyoyo.so`, no arm64 | Inspected only | BLOCKED | N/A | N/A | N/A | Needs armhf/32-bit runtime path |
| Sokoban Land DX | https://julianoferreiradelima.itch.io/sokoban-land-dx | itch Android APK, non-Reality-Blind | GameMaker but 32-bit-only | Inspected only | BLOCKED | N/A | N/A | N/A | Needs armhf/32-bit runtime path |
| WILOO | itch APK | itch Android APK | GameMaker but 32-bit-only | Inspected only | BLOCKED | N/A | N/A | N/A | Needs armhf/32-bit runtime path |
| QLRZ | https://qlrz.itch.io/qlrz | itch Android APK, non-Reality-Blind | GameMaker but 32-bit-only | Inspected only | BLOCKED | N/A | N/A | N/A | Needs armhf/32-bit runtime path |
| Basketball Takeover | https://rafaelbranco.itch.io/basketball-takeover | itch upload marked Android | Windows GameMaker ZIP: `.exe` + `data.win`, not APK | Inspected only | REJECTED | N/A | N/A | N/A | Not an Android APK despite Android platform tag |
| Digital Heroes / Digimon Digital Heroes | itch Android APK | APK | Cordova/web layout, not GameMaker | Inspected only | REJECTED | N/A | N/A | N/A | Not compatible with GMLoader |
| Digital Partner Digimon | itch Android APK | APK | Large Android APK | Deferred | DEFERRED | N/A | N/A | N/A | Large download/inspection deferred |
| Bubbles the Cat | https://teamcatsandbears.itch.io/bubbles-the-cat | itch page | N/A | Public download helper path failed | NOT TESTED | N/A | N/A | N/A | Not directly public-downloadable through current helper path |
| Harpy Gaiden | https://xysspon.itch.io/gaiden | itch page | Windows zip only exposed | Inspected only | NOT TESTED | N/A | N/A | N/A | No public Android APK exposed |
| Nuclear Throne Mobile | https://toncho.itch.io/nuclear-throne-mobile | itch page | N/A | Public helper path failed | NOT TESTED | N/A | N/A | N/A | Normal public download flow inaccessible in this environment |

## Runtime/packaging lessons

1. GMLoader APK path requires `assets/game.droid` stored/uncompressed in the `.port` archive.
2. arm64 exports need `lib/arm64-v8a/libyoyo.so`; many itch candidates are 32-bit-only and require a separate armhf path.
3. Some APKs also need shim/native libs (`libm.so`, `libcompiler_rt.so`, `libc++_shared.so`) seeded from a known-working PortMaster GMLoader baseline.
4. RG353M EGL/GBM discovery is currently fragile after hard reboot. Explicit working env used during the spike:
   - `__EGL_VENDOR_LIBRARY_FILENAMES=/nix/store/8nva43hi70ip8xs714ka7iz4bhiajila-mesa-26.1.2/share/glvnd/egl_vendor.d/50_mesa.json`
   - `GBM_BACKENDS_PATH=/nix/store/8nva43hi70ip8xs714ka7iz4bhiajila-mesa-26.1.2/lib/gbm`
   - `LIBGL_DRIVERS_PATH=/nix/store/8nva43hi70ip8xs714ka7iz4bhiajila-mesa-26.1.2/lib/dri`
5. Real audio remains unresolved because Pulse compatibility endpoint refused connections; dummy audio is fine for visual validation only.
6. Input is a separate compatibility axis: some games see the synthetic gamepad, but Sacrificio did not respond to tested remap/touch paths.

## Follow-up backlog

- `01KVVAD3QZ3H7YCKPBA2ANY4Y8` — Build a Nixified generic GameMaker APK compatibility layer.
- `01KVVCHDFY8HMKW1VZHVTB9J9P` — Fix RG353M EGL/GBM discovery for compositor and GMLoader launches.

---

## Korri Generic GMLoader Plugin Implementation Note

The compatibility evidence above now feeds the source-agnostic `@korri:gmloader` plugin path. Core detection is based on payload shape rather than provenance:

- supported MVP shape: `assets/game.droid` plus `lib/arm64-v8a/libyoyo.so`;
- normalized install shape: `games/<id>/assets/game.droid`, `games/<id>/lib/arm64-v8a/libyoyo.so`, generated `gmloader.json`, and manifest metadata;
- explicit rejection/limitation classes: non-GameMaker archives, missing `game.droid`, missing `libyoyo.so`, arm32-only payloads, corrupt archives, unsafe path/archive intake, and currently unsupported asset-manager-style runtime requirements;
- source adapters such as PortMaster and itch.io should hand local files to this generic path rather than adding source-specific branches to the loader core.
