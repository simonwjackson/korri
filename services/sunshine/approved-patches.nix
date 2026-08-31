{
  baseSunshineVersion = "2025.924.154138";
  approvedBaseSourceHash = "sha256-QrPfZqd9pgufohUjxlTpO6V0v7B41UrXHZaESsFjZ48=";
  reviewedLibavcodecVersion = "62.11.100";
  patchSetSha256 = "30121b5d935b435482814b2c2801c6c3c456bc42c6019123f77018cb0294a62a";
  patches = [
    {
      name = "0001-add-runtime-settings-protocol-surface.patch";
      path = ./patches/0001-add-runtime-settings-protocol-surface.patch;
      sha256 = "8a9522e39de85cb4ea7c0558a806780ae39d588555c7a84c600a56b9fdbe3bd4";
    }
    {
      name = "0002-wire-runtime-settings-control-plane.patch";
      path = ./patches/0002-wire-runtime-settings-control-plane.patch;
      sha256 = "12c34b55082514039b25e09062ff4735bf4bae6dd4de20f2ec53aad6f0536557";
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
      sha256 = "387a1ef4aef168e3af1f49acd301cd616a86db2bf4728028089d7875d7c25e42";
    }
    {
      name = "0010-extend-runtime-resolution-fresh-idr-window.patch";
      path = ./patches/0010-extend-runtime-resolution-fresh-idr-window.patch;
      sha256 = "9b484831fd38123e8d840f24aeba2995a6818aab34e0ce0a47a23fff4eaad937";
    }
    {
      name = "0012-persist-runtime-config-and-reinit-capture-after-resolution.patch";
      path = ./patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch;
      sha256 = "aeaa80bd7362e2fc71be70d2504fb61eabb04ed3491b8d308c931098d02b14b1";
    }
    {
      name = "0013-request-async-capture-reinit-after-runtime-resolution.patch";
      path = ./patches/0013-request-async-capture-reinit-after-runtime-resolution.patch;
      sha256 = "aeb667ade5c747220bb3a18cdc26c9b718a0a0d77eecf64634047db7c86f74d9";
    }
    {
      name = "0014-skip-runtime-vaapi-destructor-flush.patch";
      path = ./patches/0014-skip-runtime-vaapi-destructor-flush.patch;
      sha256 = "083ffb66bbad903396ffd4a233abf5d203b0276e3ba223799feb8ca28c7300af";
    }
    {
      name = "0015-add-korri-input-seat-event-mirror.patch";
      path = ./patches/0015-add-korri-input-seat-event-mirror.patch;
      sha256 = "fd0b433165f77920df24c2141a3d91f2c088fead3507fdc11fdb6737cff31fa1";
    }
  ];
}
