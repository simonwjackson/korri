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

# THROWAWAY: prove one Rust core across Linux, TypeScript, and Android.
korrid-rust-spike:
    ./services/korrid-spike/run-spike.sh

# Same proof, installed and queried on the configured Android target.
korrid-rust-spike-device:
    ./services/korrid-spike/run-spike.sh --device
