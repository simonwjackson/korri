{ inputplumber }:

let
  version = "0.75.2";
  sourceHash = "sha256-KiSroDcaWvzr5sP0jzr1GFyk0lHbtCFJrP3g5/b3hLQ=";
  cargoHash = "sha256-VwQ38Jv5OvyBqo9BBTnpUjgNwAbWyIdUKFKXsGC6+Mo=";
in
assert inputplumber.pname == "inputplumber";
assert inputplumber.version == version;
assert inputplumber.src.outputHash == sourceHash;
assert inputplumber.cargoHash == cargoHash;
assert (inputplumber.patches or [ ]) == [ ];
inputplumber.overrideAttrs (previous: {
  # The flake lock fixes nixpkgs, and these assertions stop evaluation if its
  # InputPlumber recipe leaves the reviewed upstream release. Only passthru
  # provenance changes here. The runtime derivation and Rust source do not.
  passthru = (previous.passthru or { }) // {
    upstream = {
      owner = "ShadowBlip";
      repo = "InputPlumber";
      tag = "v${version}";
      src = inputplumber.src;
      inherit sourceHash cargoHash;
      patches = [ ];
    };
  };
})
