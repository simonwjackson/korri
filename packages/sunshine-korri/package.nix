{ sunshine }:

sunshine.overrideAttrs (old: {
  pname = "sunshine-korri";
  version = "${old.version}-korri";
  __intentionallyOverridingVersion = true;

  patches = (old.patches or [ ]) ++ [
    ./patches/0001-add-runtime-settings-protocol-surface.patch
    ./patches/0002-wire-runtime-settings-control-plane.patch
    ./patches/0003-apply-runtime-bitrate-and-fps-changes.patch
    ./patches/0004-add-proof-gated-runtime-resolution-apply-path.patch
    ./patches/0005-add-seamless-vaapi-runtime-bitrate-path.patch
  ];

  meta = old.meta // {
    description = "Korri downstream Sunshine build with carried experimental patches";
  };
})
