# `@korri:retroarch`

This plugin owns the Android RetroArch launcher:

- `plugin.ts` declares `@korri:retroarch/retroarch` and its Android component.
- `android/` obtains, patches, builds, verifies, and installs the signed
  `com.korri.retroarch` APK.

Libretro cores are independent plugins. A library route selects this launcher
and a compatible runtime such as `@korri:mgba/mgba`; korrid composes them using
the runtime's explicit launcher and system compatibility declarations.

The APK temporarily carries the independently built mGBA `.so` so Android can
install it into RetroArch's private executable core directory. This packaging
bridge does not make mGBA part of the RetroArch plugin.

## Distribution builds

`.github/workflows/retroarch-distribution.yml` builds and stages the custom
arm64 APK with `nix run .#ra-dist`. Relevant pull requests build an unsigned
candidate without secrets. Relevant `main` changes and manual `main` runs then
sign in a protected, checkout-free job and update a rolling prerelease named
from the APK's upstream version, such as `retroarch-v1.22.2-korri`. The rolling
tag moves forward as Korri patches change. Immutable release tags use the same
upstream-aware prefix plus a revision, such as
`retroarch-v1.22.2-korri.1`.

Configure these repository secrets before running the workflow:

- `RETROARCH_RELEASE_KEYSTORE_BASE64`
- `RETROARCH_RELEASE_STORE_PASSWORD`
- `RETROARCH_RELEASE_KEY_ALIAS`
- `RETROARCH_RELEASE_KEY_PASSWORD`
- `RETROARCH_RELEASE_CERT_SHA256`

The certificate fingerprint and single-signer count are checked after the
isolated signing task, preventing a generated debug key, unexpected release
key, or additional signer from producing a distribution. Signing remains
outside the Nix store; Nix owns compilation, validation, and candidate staging.
Release secrets are materialized only in the checkout-free signing job after
compilation and an independent package, Activity, ABI, and bundled-core check.

Restrict the `retroarch-release` GitHub Environment to `main` and
`retroarch-v*` tags, protect `main`, and restrict creation of release tags.
Automatic rolling publication intentionally has no required-review pause. The
workflow removes the keystore before invoking artifact-upload code.
