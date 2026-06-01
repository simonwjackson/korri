{
  lib,
  rustPlatform,
  fetchFromGitHub,
  pkg-config,
  udev,
  libiio,
  libevdev,
}:

rustPlatform.buildRustPackage (finalAttrs: {
  pname = "inputplumber-korri";
  version = "0.75.2";

  src = fetchFromGitHub {
    owner = "ShadowBlip";
    repo = "InputPlumber";
    tag = "v${finalAttrs.version}";
    hash = "sha256-KiSroDcaWvzr5sP0jzr1GFyk0lHbtCFJrP3g5/b3hLQ=";
  };

  cargoHash = "sha256-VwQ38Jv5OvyBqo9BBTnpUjgNwAbWyIdUKFKXsGC6+Mo=";

  nativeBuildInputs = [
    pkg-config
    rustPlatform.bindgenHook
  ];

  buildInputs = [
    udev
    libevdev
    libiio
  ];

  postInstall = ''
    cp -r rootfs/usr/* "$out/"

    # SM8550 physical controller maps are substrate-owned hardware data,
    # composed from nix-on-rocks' inputplumber-sm8550-maps output. Keep this
    # runtime package product-map-free even if a future upstream release grows
    # files with the same names.
    rm -f \
      "$out/share/inputplumber/capability_maps/ayaneo_mcu_japanese.yaml" \
      "$out/share/inputplumber/capability_maps/ayaneo_mcu_xbox.yaml" \
      "$out/share/inputplumber/capability_maps/ayn_mcu.yaml" \
      "$out/share/inputplumber/devices/01-ayaneo-controller-japanese.yaml" \
      "$out/share/inputplumber/devices/01-ayaneo-controller.yaml" \
      "$out/share/inputplumber/devices/02-ayn-controller.yaml"
  '';

  meta = {
    description = "Korri-owned InputPlumber runtime package without SM8550 hardware maps";
    homepage = "https://github.com/ShadowBlip/InputPlumber";
    license = lib.licenses.gpl3Plus;
    changelog = "https://github.com/ShadowBlip/InputPlumber/releases/tag/v${finalAttrs.version}";
    maintainers = with lib.maintainers; [ shadowapex ];
    mainProgram = "inputplumber";
    platforms = lib.platforms.linux;
  };
})
