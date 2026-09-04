{
  config,
  modulesPath,
  pkgs,
  ...
}:

let
  firmwarePartitionOffsetMiB = 16;
  uboot = pkgs.callPackage ./uboot.nix { };
  ubootStartSector = 64;
in
{
  imports = [
    "${modulesPath}/installer/sd-card/sd-image.nix"
  ];

  nixpkgs.hostPlatform = "aarch64-linux";

  boot = {
    consoleLogLevel = 7;
    # The stock kernel builds the RG353 panel path as modules. Load the DSI
    # PHY, DSI bridge, panel, and backlight in the initrd so the framebuffer
    # console appears before the root filesystem mounts.
    #
    # The RG353P device tree declares the panel as "anbernic,rg353p-panel",
    # "newvision,nv3051d". The ST7703 driver also matches that node and, when
    # loaded first, claims it with the wrong init sequence, so the panel stays
    # black and the kernel later disables vcc3v3_lcd0_n.
    initrd.kernelModules = [
      "mmc_block"
      "phy-rockchip-inno-dsidphy"
      "dw-mipi-dsi"
      "rockchipdrm"
      "panel-newvision-nv3051d"
      "pwm_bl"
    ];
    blacklistedKernelModules = [ "panel-sitronix-st7703" ];
    # Start with the stock mainline kernel. It contains the RG353P device tree
    # and the RK3566 storage, display, RK817 audio, and RTL8821CS WiFi drivers.
    kernelPackages = pkgs.linuxPackages_latest;
    kernelParams = [
      "console=ttyS2,1500000n8"
      "console=tty0"
    ];
    loader = {
      grub.enable = false;
      timeout = 3;
      generic-extlinux-compatible = {
        enable = true;
        configurationLimit = 3;
      };
    };
  };

  hardware = {
    # Upstream RGXX3 U-Boot detects the RG353M and selects the RG353P DTB.
    deviceTree = {
      enable = true;
      filter = "rk3566-anbernic-rg353p.dtb";
      name = "rockchip/rk3566-anbernic-rg353p.dtb";
    };
    enableRedistributableFirmware = true;
  };

  image.baseName = "nixos-rg353m";

  sdImage = {
    compressImage = true;
    firmwarePartitionOffset = firmwarePartitionOffsetMiB;
    firmwarePartitionName = "NIXOS_BOOT";
    rootVolumeLabel = "NIXOS_RG353M";

    # U-Boot lives in the raw space before the first partition. The otherwise
    # unused FAT partition remains because the shared NixOS SD image builder
    # requires it.
    populateFirmwareCommands = ":";
    populateRootCommands = ''
      mkdir -p ./files/boot
      ${config.boot.loader.generic-extlinux-compatible.populateCmd} \
        -c ${config.system.build.toplevel} \
        -d ./files/boot
    '';
    postBuildCommands = ''
      uboot_size="$(${pkgs.coreutils}/bin/stat -c %s ${uboot}/u-boot-rockchip.bin)"
      boot_area_size="$((
        ${toString firmwarePartitionOffsetMiB} * 1024 * 1024
        - ${toString ubootStartSector} * 512
      ))"
      if [ "$uboot_size" -gt "$boot_area_size" ]; then
        echo "U-Boot exceeds the raw area before the first partition" >&2
        exit 1
      fi
      dd \
        if=${uboot}/u-boot-rockchip.bin \
        of="$img" \
        bs=512 \
        seek=${toString ubootStartSector} \
        conv=notrunc
    '';
  };

  networking = {
    hostName = "rg353m";
    networkmanager.enable = true;
  };

  services = {
    # The first native boot must remain recoverable before WiFi is configured.
    # SSH still rejects passwords and accepts only the pinned public key.
    getty.autologinUser = "root";
    openssh = {
      enable = true;
      openFirewall = true;
      settings = {
        KbdInteractiveAuthentication = false;
        PasswordAuthentication = false;
        PermitRootLogin = "prohibit-password";
      };
    };
  };

  users.users.root = {
    initialHashedPassword = "";
    openssh.authorizedKeys.keys = [
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC/PwyhdbVKd6jcG55m/1sUgEf0x3LUeS9H4EK5vk9PKhvDsjOQOISyR1LBmmXUFamkpFo2c84ZgPMj33qaPfOF0VfmF79vdAIDdDt5bmsTU6IbT7tGJ1ocpHDqhqbDO3693RdbTt1jTQN/eo3AKOfnrMouwBZPbPVqoWEhrLUvUTuTq7VQ+lUqWkvGs4D6D8UeIlG9VVgVhad3gCohYsjGdzgOUy0V4c8t3BuHrIE6//+6YVJ9VWK/ImSWmN8it5RIREDgdSYujs1Uod+ovr8AvaGFlFC9GuYMsj7xDYL1TgaWhy5ojk6JcuuF0cmoqffoW/apYdYM6Vxi5Xe6aJUhVyguZDovWcqRdPv2q0xtZn6xvNkoElEkrb6t0CAbGKf++H4h8/v5MsMt9wUPJAJBa24v0MlU8mXTUwhFLP5YQ/A8AAb5Y3ty/6DaOlvvTzt5Om2SMrZ1XaL1II35dFNZ/Os3zRpqdWq9SnpisRA+Bpf0bPUjdi8D8rRJn8g3zO5EsldBlZg82PiJcRHANbydTSK6Jzw7A8S5gMyPoH80Pq5MbQPvPpevTfOKy14NyTYPHGj0j5y7EQP7yb6w70LtqdRLRLQSTCdF0qTjVWw/qdt9MXkS7cdQe4yBADmjwozwPuxAs/jNpxELcVPEWBK6DcAIFD0vv3Xaw7reXpXFTQ=="
    ];
  };

  environment.systemPackages = with pkgs; [
    iw
    networkmanager
  ];

  documentation.enable = false;
  nix.settings.experimental-features = [
    "nix-command"
    "flakes"
  ];
  system.stateVersion = "25.11";
}
