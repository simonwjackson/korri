{
  baseSunshineVersion = "2025.924.154138";
  approvedBaseSourceHash = "sha256-QrPfZqd9pgufohUjxlTpO6V0v7B41UrXHZaESsFjZ48=";
  approvedBaseDerivations = [
    "/nix/store/a1dm23k8b0v3qhs9mpj0yiz4jd8jmwpc-sunshine-2025.924.154138.drv"
    "/nix/store/w8dd7pbl8f0qg2cyb7ay8hmli854giwv-sunshine-2025.924.154138.drv"
  ];
  reviewedLibavcodecVersion = "62.11.100";
  reviewedFfmpegCommit = "61c50407fd429a5e2ec616e2e846c3fe3743879a";
  reviewedFfmpegSourceHash = "sha256-LKQUfHb9/Z4uvPx4vrtAOPL95Un9/C26lvCbQZ51avk=";
  reviewedNvencApiMajor = 12;
  reviewedNvencApiMinor = 0;
  patchSetSha256 = "46e32d78438aed4f8b2a4572f26bee158182afcaa6257b01cd0345b9de396901";
  patches = [
    {
      name = "0001-add-runtime-settings-protocol-surface.patch";
      path = ./patches/0001-add-runtime-settings-protocol-surface.patch;
      sha256 = "8a9522e39de85cb4ea7c0558a806780ae39d588555c7a84c600a56b9fdbe3bd4";
    }
    {
      name = "0002-wire-runtime-settings-control-plane.patch";
      path = ./patches/0002-wire-runtime-settings-control-plane.patch;
      sha256 = "dd9b7283dd2cbcb2476571bfcf61702b00dba428422d309e31e7b4c839db41be";
    }
    {
      name = "0003-apply-runtime-bitrate-and-fps-changes.patch";
      path = ./patches/0003-apply-runtime-bitrate-and-fps-changes.patch;
      sha256 = "d7d89d4a8b4b06d2c473f4c2156a17ecfe369f805132e90a2d05197e69e7e01d";
    }
    {
      name = "0004-add-proof-gated-runtime-resolution-apply-path.patch";
      path = ./patches/0004-add-proof-gated-runtime-resolution-apply-path.patch;
      sha256 = "599d3db14ea57e9712148e83fd7f0404dba96c5c40506c3209c5dbaa7778646e";
    }
    {
      name = "0005-add-seamless-vaapi-runtime-bitrate-path.patch";
      path = ./patches/0005-add-seamless-vaapi-runtime-bitrate-path.patch;
      sha256 = "a14ca9d556728ca1a4fcb14ae338a6275c9b28c52598a82a4e4f424956154d53";
    }
    {
      name = "0010-extend-runtime-resolution-fresh-idr-window.patch";
      path = ./patches/0010-extend-runtime-resolution-fresh-idr-window.patch;
      sha256 = "86252208da87bff0b61623f7da86e50d9f35c19963910e5e30703b72b86a42eb";
    }
    {
      name = "0012-persist-runtime-config-and-reinit-capture-after-resolution.patch";
      path = ./patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch;
      sha256 = "2ac28eb76da2d02aa97812e9708094480cc1b7c4b897cf123772c24f16c493c6";
    }
    {
      name = "0013-request-async-capture-reinit-after-runtime-resolution.patch";
      path = ./patches/0013-request-async-capture-reinit-after-runtime-resolution.patch;
      sha256 = "0831530081f9551173ff1a74a5ca2771942e9c519ec476c27548a1d3cbea3fa2";
    }
    {
      name = "0014-skip-runtime-vaapi-destructor-flush.patch";
      path = ./patches/0014-skip-runtime-vaapi-destructor-flush.patch;
      sha256 = "59eedaf576f99223bd807205c45b12b1ac5f9850225614530b4ab925e3204e50";
    }
    {
      name = "0015-add-korri-input-seat-event-mirror.patch";
      path = ./patches/0015-add-korri-input-seat-event-mirror.patch;
      sha256 = "69888a0ef824af105f0919ad354876b52ca0d003b0c46be619e732bc1cdbe726";
    }
    {
      name = "0016-add-seamless-nvenc-runtime-path.patch";
      path = ./patches/0016-add-seamless-nvenc-runtime-path.patch;
      sha256 = "ba767c4b8d853001ead6af7af44dbc9503d24cf22aa257d29635be3b62a7feb2";
    }
  ];
}
