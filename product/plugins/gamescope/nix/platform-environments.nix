{ pkgs }:

{
  controlEnvironment = {
    GAMESCOPE_XWAYLAND_MODE_CONTROL = "1";
    GAMESCOPE_SCALING_FILTER = "3";
    GAMESCOPE_SHARPNESS = "20";
    GAMESCOPE_FSR_FEEDBACK = "1";
  };

  rk3566RuntimeEnvironment = {
    PAN_I_WANT_A_BROKEN_VULKAN_DRIVER = "1";
    MESA_VK_VERSION_OVERRIDE = "1.2";
    VK_DRIVER_FILES = "${pkgs.mesa}/share/vulkan/icd.d/panfrost_icd.aarch64.json";
    GAMESCOPE_DISABLE_PIPELINE_PRECOMPILE = "1";
    GAMESCOPE_DISABLE_EXPLICIT_SYNC = "1";
  };
}
