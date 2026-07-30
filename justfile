# Korri monorepo glue. Recipes that cross area boundaries live here;
# per-area commands stay inside their area.

# Run the portal Vite dev server (reachable from devices on the LAN).
portal-dev:
    nix develop .#portal --command bash -c 'cd clients/portal && bun run dev'

# Portal unit tests + typecheck.
portal-check:
    nix develop .#portal --command bash -c 'cd clients/portal && bun test && bun run typecheck'

# Build the portal and bundle it into the Android app's assets.
# This recipe is the only place that knows both paths.
portal-bundle:
    nix develop .#portal --command bash -c 'cd clients/portal && bun run build'
    rm -rf clients/android/app/src/main/assets/portal
    cp -r clients/portal/dist clients/android/app/src/main/assets/portal

# Build the debug APK (run portal-bundle first for an asset-backed shell).
android-apk:
    nix develop .#android --command bash -c 'cd clients/android && ./gradlew assembleDebug'

# Debug APK pointed at a live portal dev server, e.g.
# just android-apk-dev http://192.168.1.50:5173
android-apk-dev url:
    nix develop .#android --command bash -c 'cd clients/android && ./gradlew assembleDebug -PkorriPortalUrl={{url}}'

# Korrid full check: host + TS contracts + Android build.
korrid-check:
    ./services/korrid/check.sh

# Same checks, then install and verify on the configured Android target.
korrid-check-device:
    ./services/korrid/check.sh --device

# Recreate the managed RetroArch source tree at the verified pin and apply the
# ordered Korri patch series exactly.
ra-fetch:
    ./runtimes/retroarch/fetch-upstream.sh

# Build the pinned arm64 mGBA libretro core and stage it into the generated
# RetroArch source tree.
ra-core-mgba: ra-fetch
    nix develop .#retroarch --command ./runtimes/retroarch/cores/mgba/build.sh

# Build and validate a fresh patched arm64 Android runtime with its pinned core.
ra-build:
    nix develop .#retroarch --command ./runtimes/retroarch/build.sh

# Build, validate, and install the fork without replacing stock RetroArch.
ra-deploy serial: ra-build
    nix develop .#retroarch --command ./runtimes/retroarch/install-device.sh {{serial}}

# Build, deploy beside stock RetroArch, and run the repeatable Wario lifecycle
# acceptance (authenticated control, pause state, relaunch, graceful return).
ra-accept serial: (ra-deploy serial)
    ./runtimes/retroarch/device-acceptance.sh {{serial}}

# Validate failure modes, rebuild the exact patch series, and accept only the
# APK produced by this invocation.
ra-check:
    ./runtimes/retroarch/test-fetch-upstream.sh
    ./runtimes/retroarch/test-build.sh
    ./runtimes/retroarch/test-install-device.sh
    nix develop .#retroarch --command ./runtimes/retroarch/build.sh
