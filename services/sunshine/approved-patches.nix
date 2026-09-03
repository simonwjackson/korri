{
  baseSunshineVersion = "2025.924.154138";
  approvedBaseSourceHash = "sha256-QrPfZqd9pgufohUjxlTpO6V0v7B41UrXHZaESsFjZ48=";
  approvedDeviceBaseDerivation = "/nix/store/5hmg1ff3wjkzcmspssckdlydk0d5bbjz-sunshine-2025.924.154138.drv";
  approvedBaseDerivations = [
    # Korri nixpkgs revision a6531044f6d0bef691ea18d4d4ce44d0daa6e816.
    "/nix/store/63c39c0mjs72ixh20hs18r8l8zh3wix7-sunshine-2025.924.154138.drv"
    # Mountainous nixpkgs revision c06b4ae3d6599a672a6210b7021d699c351eebda.
    "/nix/store/5hmg1ff3wjkzcmspssckdlydk0d5bbjz-sunshine-2025.924.154138.drv"
  ];
  reviewedLibavcodecVersion = "62.11.100";
  reviewedFfmpegCommit = "61c50407fd429a5e2ec616e2e846c3fe3743879a";
  reviewedFfmpegSourceHash = "sha256-LKQUfHb9/Z4uvPx4vrtAOPL95Un9/C26lvCbQZ51avk=";
  reviewedNvencApiMajor = 12;
  reviewedNvencApiMinor = 0;
  patchSetSha256 = "2399d226ef71590dadb48c913d4dffed49313cee673bb63c2277af77227e8d52";
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
      sha256 = "c0eab65a69c17b2f3f5b6c9c69fabaaf51519da26a81f9e57dbd714ab5ca92db";
    }
    {
      name = "0016-add-seamless-nvenc-runtime-path.patch";
      path = ./patches/0016-add-seamless-nvenc-runtime-path.patch;
      sha256 = "686decb81379741e01e0b9b0e9105bbe23765a1bf728565767604383983a7074";
    }
    {
      name = "0017-use-wayland-ram-capture-for-cuda.patch";
      path = ./patches/0017-use-wayland-ram-capture-for-cuda.patch;
      sha256 = "a87aefc6eb5f71a4d413d751eefb87743745a2fab126dded5b66b23b949f66b2";
    }
    {
      name = "0018-vectorize-wayland-bgr888-with-swscale.patch";
      path = ./patches/0018-vectorize-wayland-bgr888-with-swscale.patch;
      sha256 = "753971f16e33598215caa455074f3bbca23e43b0cf2a2b8a97779f356486203f";
    }
    {
      name = "0019-use-pinned-memory-for-cuda-capture.patch";
      path = ./patches/0019-use-pinned-memory-for-cuda-capture.patch;
      sha256 = "83fd586d210668b06753fdd8bb6312967ba8805ce7a2fdc992c5cbdc49c79c88";
    }
    {
      name = "0020-add-korrid-certificate-control.patch";
      path = ./patches/0020-add-korrid-certificate-control.patch;
      sha256 = "43cd0dbc6f1911f21f4fa9e9815fe9f90912a4dfe30504677f372815b294a9d1";
    }
  ];
}
