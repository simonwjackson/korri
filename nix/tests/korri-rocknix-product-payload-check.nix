{
  pkgs,
  productPayloadPackage,
  hostPackages,
  targetPackages,
  configurations,
  contract,
  fixturePayloadPackage,
  fixtureArchiveName,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };
  metadata = productPayloadPackage.passthru.productPayload or { };
  expectedProductLockFields = [
    "PRODUCT_AUTHORITY_REPO"
    "PRODUCT_REV"
    "PRODUCT_SOURCE_SHA256"
    "PRODUCT_SOURCE_SUBDIR"
    "PRODUCT_BUILD_TARGET"
    "PRODUCT_ROOTFS_SEED_REV"
    "PRODUCT_ROOTFS_SEED_DEVICE"
    "PRODUCT_ROOTFS_SEED_COMPATIBLE"
    "PRODUCT_ROOTFS_SEED_ARCHIVE"
    "PRODUCT_ROOTFS_SEED_SHA256"
    "PRODUCT_ROOTFS_SEED_URL"
    "PRODUCT_ROOTFS_SEED_URLS"
  ];
  expectedRenderedPackageFields = [
    "PKG_NIX_GUEST_AUTHORITY_REPO"
    "PKG_NIX_GUEST_AUTHORITY_NAME"
    "PKG_NIX_GUEST_REV"
    "PKG_NIX_GUEST_SHA256"
    "PKG_NIX_GUEST_URL"
    "PKG_NIX_GUEST_SOURCE_SUBDIR"
    "PKG_NIX_GUEST_BUILD_TARGET"
    "PKG_NIX_GUEST_ROOTFS_SEED_REV"
    "PKG_NIX_GUEST_ROOTFS_SEED_DEVICE"
    "PKG_NIX_GUEST_ROOTFS_SEED_COMPATIBLE"
    "PKG_NIX_GUEST_ROOTFS_SEED_ARCHIVE"
    "PKG_NIX_GUEST_ROOTFS_SEED_SHA256"
    "PKG_NIX_GUEST_ROOTFS_SEED_URL"
    "PKG_NIX_GUEST_ROOTFS_SEED_URLS"
  ];

  checks = [
    (check "nix-on-rocks Phase 1 product lock field fixture must be present" (
      contract.productLockFields == expectedProductLockFields
    ))
    (check "nix-on-rocks Phase 1 rendered package field fixture must be present" (
      contract.renderedPackageFields == expectedRenderedPackageFields
    ))
    (check "Odin2Portal product payload package must be exposed" (
      productPayloadPackage.drvPath or null != null
    ))
    (check "Sobo host rootfs package alias must remain exposed" (
      hostPackages ? korri-rocknix-rootfs-odin2portal
      && (hostPackages.korri-rocknix-rootfs-odin2portal or null).drvPath or null != null
    ))
    (check "Sobo target system package alias must remain exposed" (
      targetPackages ? korri-rocknix-kiosk-system-odin2portal
      && (targetPackages.korri-rocknix-kiosk-system-odin2portal or null).drvPath or null != null
    ))
    (check "Sobo RockNix kiosk configuration must remain exposed" (
      configurations ? korri-rocknix-kiosk-odin2portal
    ))
    (check "product payload must target Odin2Portal explicitly" (
      metadata.device or null == "odin2portal"
    ))
    (check "product payload compatible string must target Odin2Portal" (
      metadata.compatible or null == "ayn,odin2portal"
    ))
    (check "product payload seed archive must be Odin2Portal-named" (
      lib.hasPrefix "rocknix-guest-rootfs-odin2portal-" (metadata.archiveName or "")
      && lib.hasSuffix ".tar.zst" (metadata.archiveName or "")
    ))
    (check "product payload build target must be the explicit Odin2Portal system" (
      metadata.buildTarget or null
      == ".#nixosConfigurations.korri-rocknix-kiosk-odin2portal.config.system.build.toplevel"
    ))
    (check "product payload must expose candidate metadata under nix-support" (
      metadata.candidateLockPath or null == "nix-support/product-payload/candidate-product-payload.lock"
      && metadata.manifestPath or null == "nix-support/product-payload/manifest.txt"
    ))
    (check "product payload must not publish by-compatible as a seed identity" (
      !(lib.hasInfix "by-compatible" (metadata.archiveName or ""))
      && metadata.device or null != "by-compatible"
      && metadata.compatible or null != "by-compatible"
    ))
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri RockNix product payload check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-rocknix-product-payload-check"
    {
      nativeBuildInputs = [
        pkgs.coreutils
        pkgs.gawk
      ];
    }
    ''
      payload=${fixturePayloadPackage}
      seed="$payload/rootfs/${fixtureArchiveName}"
      lock="$payload/nix-support/product-payload/candidate-product-payload.lock"
      manifest="$payload/nix-support/product-payload/manifest.txt"

      test -L "$seed"
      test -f "$seed.sha256"
      test -f "$lock"
      test -f "$manifest"

      expected_sha=$(sha256sum "$seed" | awk '{ print $1 }')
      grep -Fx "$expected_sha  ${fixtureArchiveName}" "$seed.sha256"

      set -a
      . "$lock"
      set +a
      test "$PRODUCT_ROOTFS_SEED_DEVICE" = "odin2portal"
      test "$PRODUCT_ROOTFS_SEED_COMPATIBLE" = "ayn,odin2portal"
      test "$PRODUCT_ROOTFS_SEED_ARCHIVE" = "${fixtureArchiveName}"
      test "$PRODUCT_ROOTFS_SEED_SHA256" = "$expected_sha"
      test -z "$PRODUCT_SOURCE_SHA256"
      test -z "$PRODUCT_ROOTFS_SEED_URLS"

      grep -Fx "rootfs_seed_archive=${fixtureArchiveName}" "$manifest"
      grep -Fx "rootfs_seed_sha256=$expected_sha" "$manifest"

      mkdir -p "$out"
      cat > "$out/summary.txt" <<'EOF'
      Korri RockNix product payload invariants passed.
      EOF
    ''
