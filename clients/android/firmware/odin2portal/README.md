# Odin 2 Portal stock reconstruction

This pipeline reconstructs the AYN Odin 2 Portal stock `super.img` without changing its logical partitions or contacting a device. It accepts only the captured Android 13 build `Odin2Portal_V1.0.0.130_20250312_205701_user`.

The source contract comes from the verified stock producer files and observed device layout:

- `contract/SHA256SUMS` pins all 15 captured Android and boot images.
- `contract/logical-SHA256SUMS` pins the seven populated logical partitions extracted from `super.img`.
- `contract/super-layout.txt` is the device and host `lpdump` output, which matched exactly during capture.
- The build ID and fingerprint files pin the source identity.

Proprietary images remain outside Git.

## Run

```console
nix run .#odin2portal-stock-repack -- \
  /path/to/odin2portal-stock-130 \
  /path/to/output
```

The output path must not exist. The command publishes it only after all checks pass.

The output contains:

- `super.img`: the reconstructed physical dynamic-partition image
- `RESULT.txt`: the final read-only verification result
- `evidence/`: source hashes, source and rebuilt layouts, filesystem checks, AVB inspection, and the rebuilt image hash

The pipeline deletes intermediate logical images after verification because the source `super.img` remains the immutable rollback input.

## Guarantees

Before publishing output, the command proves:

1. Every captured source image matches the exact-build SHA-256 contract.
2. Build identity and source `lpdump` match the captured device.
3. All seven populated ext4 filesystems pass read-only `e2fsck`.
4. Logical AVB footers and both vbmeta images parse successfully.
5. Reconstructed slot-A logical partitions are byte-identical to source.
6. All slot-B logical placeholders remain zero-length.
7. Reconstructed `lpdump` output and physical image size match source.

The script contains no ADB, fastboot, mount, or device-write path.

## Limits

This is not an installer and does not prove that a flashed image boots. It does not modify filesystems, regenerate AVB metadata, or sign an OTA. Those are separate later slices with higher risk.

The reconstructed physical `super.img` does not need to match the source file byte-for-byte. `lpmake` can regenerate metadata and unused bytes. The acceptance gate is exact `lpdump` geometry plus byte-identical logical partitions. The evidence records the rebuilt physical hash without claiming that it is the source hash.

The cost is a temporary second 5.68 GB `super.img` plus unpacked working data. A successful run retains only the reconstructed image and evidence.

## Test

```console
nix run .#odin2portal-stock-repack-check
```

The test uses small fake images and tools. It checks successful publication, source immutability, checksum rejection before unpacking, layout rejection, and refusal to overwrite output.
