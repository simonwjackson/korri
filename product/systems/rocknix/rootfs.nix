{
  pkgs,
  configuration,
}:

let
  toplevel = configuration.config.system.build.toplevel;
  closure = pkgs.closureInfo {
    rootPaths = [ toplevel ];
  };
in
pkgs.runCommand "korri-guest-rootfs"
  {
    nativeBuildInputs = [
      pkgs.coreutils
      pkgs.gnutar
      pkgs.zstd
    ];
  }
  ''
    set -euo pipefail

    mkdir -p root/nix/store root/sbin root/usr/bin root/tmp root/proc root/sys root/dev root/run root/etc root/var root/var/lib "$out/tarball"
    chmod 1777 root/tmp
    ln -s ${toplevel}/init root/init
    ln -s ${toplevel}/init root/sbin/init
    ln -s /run/current-system/sw/bin/nix root/usr/bin/nix

    cp -a ${toplevel}/etc/. root/etc/
    chmod -R u+w root/etc
    if [ -e root/etc/static/ssh/sshd_config ]; then
      mkdir -p root/etc/ssh
      rm -f root/etc/ssh/sshd_config
      cp -L root/etc/static/ssh/sshd_config root/etc/ssh/sshd_config
      chmod u+w root/etc/ssh/sshd_config
    fi
    mkdir -p root/etc/ssh/authorized_keys.d
    rm -f root/etc/ssh/authorized_keys.d/root
    : > root/etc/ssh/authorized_keys.d/root
    chmod 600 root/etc/ssh/authorized_keys.d/root

    # Tar the immutable Nix store paths directly instead of first copying the
    # full closure into root/nix/store. Fuji's slow path is the copy/compress
    # packaging phase after the closure is already present; this keeps only the
    # small mutable root skeleton staged locally and lets tar stream store paths
    # from their canonical location. The transform drops the leading slash on
    # member names only so store paths land as nix/store/... while absolute
    # symlink targets such as /init and /run/current-system stay intact.
    tar --sort=name --numeric-owner --owner=0 --group=0 \
      --use-compress-program='zstd -T0 -3' \
      --transform='flags=r;s#^/##' \
      -cf "$out/tarball/rocknix-layer10b-guest-rootfs-aarch64-linux.tar.zst" \
      -C root . \
      -T ${closure}/store-paths
  ''
