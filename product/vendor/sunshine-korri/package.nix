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
    ./patches/0010-extend-runtime-resolution-fresh-idr-window.patch
    ./patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch
    ./patches/0013-request-async-capture-reinit-after-runtime-resolution.patch
    ./patches/0014-skip-runtime-vaapi-destructor-flush.patch
    ./patches/0015-add-korri-input-seat-event-mirror.patch
  ];

  meta = old.meta // {
    description = "Korri downstream Sunshine build with carried experimental patches";
  };
})
