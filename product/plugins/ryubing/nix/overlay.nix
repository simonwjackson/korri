{ nixpkgs-mesa }:

final: prev:
let
  ryubingKorri = final.callPackage ../packages/ryubing-korri/default.nix {
    ryubing = prev.ryubing;
    inherit nixpkgs-mesa;
  };
in
{
  ryubing = if prev.stdenv.hostPlatform.isAarch64 then ryubingKorri else prev.ryubing;
  ryubing-korri = ryubingKorri;
}
