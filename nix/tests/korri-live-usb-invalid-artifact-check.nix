{
  pkgs,
  imageLib,
  x86Platform,
}:

let
  lib = pkgs.lib;
  invalidArtifactResult = builtins.tryEval (
    (imageLib.mkLiveUsbKioskSystem {
      platformModules = [ x86Platform ];
      modules = [
        {
          services.korri.liveUsbPersistence.artifact = "diagnostic";
        }
      ];
    }).config.system.build.toplevel.drvPath
  );
in
if invalidArtifactResult.success then
  throw "Korri live USB invalid artifact check failed:\n- services.korri.liveUsbPersistence.artifact accepted an unsupported value"
else
  pkgs.runCommand "korri-live-usb-invalid-artifact-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri live USB invalid artifact invariant passed.
    EOF
  ''
