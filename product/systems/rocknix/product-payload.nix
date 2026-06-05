{
  pkgs,
  rootfsPackage,
  device,
  compatible,
  authorityRepo,
  sourceSubdir,
  buildTarget,
  productRevision,
  productShortRevision,
  productRevisionIsClean,
  substrateRevision,
}:

let
  archiveName = "rocknix-guest-rootfs-${device}-${productShortRevision}.tar.zst";
  candidateLockPath = "nix-support/product-payload/candidate-product-payload.lock";
  manifestPath = "nix-support/product-payload/manifest.txt";
  metadata = {
    inherit
      archiveName
      authorityRepo
      buildTarget
      candidateLockPath
      compatible
      device
      manifestPath
      productRevision
      productRevisionIsClean
      productShortRevision
      sourceSubdir
      substrateRevision
      ;
  };
in
pkgs.runCommand "korri-product-payload-${device}"
  {
    nativeBuildInputs = [
      pkgs.coreutils
      pkgs.findutils
      pkgs.gawk
    ];
    passthru.productPayload = metadata;
  }
  ''
    set -euo pipefail

    rootfs_dir=${rootfsPackage}/tarball
    if [ ! -d "$rootfs_dir" ]; then
      echo "Korri product payload: expected wrapped rootfs package to expose $rootfs_dir" >&2
      echo "Build korri-${device}-rootfs or update product/systems/rocknix/product-payload.nix for the new rootfs layout." >&2
      exit 1
    fi

    rootfs_tar=$(find "$rootfs_dir" -maxdepth 1 -type f -name '*.tar.zst' | sort | head -n 1)
    if [ -z "$rootfs_tar" ]; then
      echo "Korri product payload: no *.tar.zst rootfs archive found under $rootfs_dir" >&2
      echo "The wrapper expects nix-on-rocks lib.mkGuestRootfs to emit a tarball/ directory containing one rootfs archive." >&2
      exit 1
    fi

    mkdir -p "$out/rootfs" "$out/nix-support/product-payload"

    archive_path="$out/rootfs/${archiveName}"
    ln -s "$rootfs_tar" "$archive_path"

    seed_sha=$(sha256sum "$rootfs_tar" | awk '{ print $1 }')
    printf '%s  %s\n' "$seed_sha" "${archiveName}" > "$out/rootfs/${archiveName}.sha256"

    cat > "$out/${candidateLockPath}" <<EOF
    # Candidate Korri product payload lock for nix-on-rocks Phase 1 vocabulary.
    # Final promotion must fill PRODUCT_SOURCE_SHA256 and PRODUCT_ROOTFS_SEED_URLS.
    PRODUCT_AUTHORITY_REPO="${authorityRepo}"
    PRODUCT_REV="${productRevision}"
    PRODUCT_SOURCE_SHA256=""
    PRODUCT_SOURCE_SUBDIR="${sourceSubdir}"
    PRODUCT_BUILD_TARGET="${buildTarget}"
    PRODUCT_ROOTFS_SEED_REV="${productRevision}"
    PRODUCT_ROOTFS_SEED_DEVICE="${device}"
    PRODUCT_ROOTFS_SEED_COMPATIBLE="${compatible}"
    PRODUCT_ROOTFS_SEED_ARCHIVE="${archiveName}"
    PRODUCT_ROOTFS_SEED_SHA256="$seed_sha"
    PRODUCT_ROOTFS_SEED_URL=""
    PRODUCT_ROOTFS_SEED_URLS=""
    PRODUCT_REV_CLEAN="${if productRevisionIsClean then "1" else "0"}"
    PRODUCT_SUBSTRATE_REV="${substrateRevision}"
    EOF

    cat > "$out/${manifestPath}" <<EOF
    authority_repo=${authorityRepo}
    product_rev=${productRevision}
    product_rev_clean=${if productRevisionIsClean then "1" else "0"}
    source_subdir=${sourceSubdir}
    build_target=${buildTarget}
    rootfs_seed_device=${device}
    rootfs_seed_compatible=${compatible}
    rootfs_seed_archive=${archiveName}
    rootfs_seed_sha256=$seed_sha
    substrate_rev=${substrateRevision}
    candidate_lock=${candidateLockPath}
    EOF
  ''
