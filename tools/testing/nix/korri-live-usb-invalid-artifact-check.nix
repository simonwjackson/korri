{
  pkgs,
  imageLib,
  x86Platform,
}:

let
  lib = pkgs.lib;

  mkInvalidSystem =
    module:
    imageLib.mkLiveUsbKioskSystem {
      platformModules = [ x86Platform ];
      modules = [ module ];
    };

  failedAssertionMessages =
    system: map (a: a.message) (builtins.filter (a: !a.assertion) system.config.assertions);

  hasFailure = name: expected: system: {
    message = name;
    assertion = builtins.any (message: lib.hasInfix expected message) (failedAssertionMessages system);
  };

  invalidArtifactResult = builtins.tryEval (
    (mkInvalidSystem {
      services.korri.liveUsbPersistence.artifact = "diagnostic";
    }).config.system.build.toplevel.drvPath
  );

  invalidRoot = mkInvalidSystem {
    services.korri.liveUsbPersistence.root = "persist/korri-live-usb";
  };

  invalidBootMount = mkInvalidSystem {
    services.korri.liveUsbPersistence.bootMountPoint = "iso";
  };

  invalidMarker = mkInvalidSystem {
    services.korri.liveUsbPersistence.markerPersistent = "../persistent";
  };

  invalidScope = mkInvalidSystem {
    services.korri.liveUsbPersistence.scope = lib.mkForce "developer-broad";
  };

  invalidAllowlistSource = mkInvalidSystem {
    services.korri.liveUsbPersistence.productAllowlist = [
      {
        kind = "directory";
        target = "/home/korri/.config/bad";
        source = "../escape";
      }
    ];
  };

  invalidAllowlistTarget = mkInvalidSystem {
    services.korri.liveUsbPersistence.productAllowlist = [
      {
        kind = "directory";
        target = "home/korri/.config/bad";
        source = "product/home/.config/bad";
      }
    ];
  };

  invalidAllowlistMode = mkInvalidSystem {
    services.korri.liveUsbPersistence.productAllowlist = [
      {
        kind = "directory";
        target = "/home/korri/.config/bad";
        source = "product/home/.config/bad";
        mode = "bad";
      }
    ];
  };

  checks = [
    {
      message = "services.korri.liveUsbPersistence.artifact rejects unsupported values";
      assertion = !invalidArtifactResult.success;
    }
    (hasFailure "live USB persistence root must be absolute"
      "liveUsbPersistence.root must be an absolute path"
      invalidRoot
    )
    (hasFailure "live USB boot mount must be absolute"
      "liveUsbPersistence.bootMountPoint must be an absolute path"
      invalidBootMount
    )
    (hasFailure "live USB markers must be safe filenames"
      "persistence markers must be relative filenames"
      invalidMarker
    )
    (hasFailure "live USB scope must match artifact" "liveUsbPersistence.scope must match artifact"
      invalidScope
    )
    (hasFailure "live USB allowlist sources must stay under persistence root"
      "productAllowlist source must be a safe relative path"
      invalidAllowlistSource
    )
    (hasFailure "live USB allowlist targets must be absolute"
      "productAllowlist target must be an absolute path"
      invalidAllowlistTarget
    )
    (hasFailure "live USB allowlist modes must be octal" "productAllowlist mode must be an octal mode"
      invalidAllowlistMode
    )
  ];

  failures = builtins.filter (check: !check.assertion) checks;
in
if failures != [ ] then
  throw "Korri live USB invalid artifact/config check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-live-usb-invalid-artifact-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri live USB invalid artifact/config invariants passed.
    EOF
  ''
