// Declaration-only Moonlight streaming plugin.
//
// Artemis owns certificates, host discovery, pairing, the Moonlight protocol,
// Activity startup, and live Game effects at the Android edge. This declaration
// owns the stable transport identity, Android implementation selection,
// Sunshine app identity, and the controls that implementation may fulfill.
const transport = "@korri:moonlight/moonlight"

const declaration = {
  namespace: "@korri",
  name: "moonlight",
  title: "Moonlight",
  description: "Owns Moonlight streaming through the Android Artemis edge.",
  contributes: {
    config: {
      transports: {
        moonlight: {
          id: transport,
          android: {
            implementation: "artemis",
            sunshineApp: "Korri Stream",
          },
        },
      },
    },
    sessionControls: {
      fill: {
        id: "@korri:moonlight/fill",
        owner: { kind: "transport", id: transport },
        label: "Screen fit",
        description: "Switch between fit and crop to fill",
        interaction: { kind: "toggle" },
        effect: "@korri:moonlight/set-fill-mode",
      },
      keyboard: {
        id: "@korri:moonlight/keyboard",
        owner: { kind: "transport", id: transport },
        label: "Toggle keyboard",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/toggle-keyboard",
        dismissOnSuccess: true,
      },
      fullKeyboard: {
        id: "@korri:moonlight/full-keyboard",
        owner: { kind: "transport", id: transport },
        label: "Full keyboard",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/toggle-full-keyboard",
        dismissOnSuccess: true,
      },
      panZoom: {
        id: "@korri:moonlight/pan-zoom",
        owner: { kind: "transport", id: transport },
        label: "Pan & zoom",
        interaction: { kind: "toggle" },
        effect: "@korri:moonlight/set-zoom-mode",
        dismissOnSuccess: true,
      },
      mouseMode: {
        id: "@korri:moonlight/mouse-mode",
        owner: { kind: "transport", id: transport },
        label: "Mouse mode",
        interaction: {
          kind: "choice",
          options: [
            { value: "0", label: "Multi touch" },
            { value: "1", label: "Absolute touch" },
            { value: "2", label: "Track pad(Natural/Double tap to drag)" },
            { value: "3", label: "Track pad(Gaming/Long press to drag)" },
            { value: "4", label: "Disabled" },
            {
              value: "5",
              label: "Absolute touch (left/right click swapped)",
            },
          ],
        },
        effect: "@korri:moonlight/set-mouse-mode",
        dismissOnSuccess: true,
      },
      localCursor: {
        id: "@korri:moonlight/local-cursor",
        owner: { kind: "transport", id: transport },
        label: "Toggle local mouse cursor",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/set-local-cursor",
        dismissOnSuccess: true,
      },
      rotateScreen: {
        id: "@korri:moonlight/rotate-screen",
        owner: { kind: "transport", id: transport },
        label: "Rotate screen",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/rotate-screen",
        dismissOnSuccess: true,
      },
      hud: {
        id: "@korri:moonlight/hud",
        owner: { kind: "transport", id: transport },
        label: "Toggle HUD",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/toggle-hud",
        dismissOnSuccess: true,
      },
      floatingMenu: {
        id: "@korri:moonlight/floating-menu",
        owner: { kind: "transport", id: transport },
        label: "Floating menu button",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/toggle-floating-menu",
        dismissOnSuccess: true,
      },
      keyboardController: {
        id: "@korri:moonlight/keyboard-controller",
        owner: { kind: "transport", id: transport },
        label: "Keyboard as controller",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/toggle-keyboard-controller",
        dismissOnSuccess: true,
      },
      touchSensitivity: {
        id: "@korri:moonlight/touch-sensitivity",
        owner: { kind: "transport", id: transport },
        label: "Touch sensitivity",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/switch-touch-sensitivity",
        dismissOnSuccess: true,
      },
      sgsrSharpness: {
        id: "@korri:moonlight/sgsr-sharpness",
        owner: { kind: "transport", id: transport },
        label: "SGSR sharpness",
        interaction: { kind: "range", min: 0, max: 50, step: 1 },
        effect: "@korri:moonlight/set-sgsr-sharpness",
      },
      sgsrEdgeThreshold: {
        id: "@korri:moonlight/sgsr-edge-threshold",
        owner: { kind: "transport", id: transport },
        label: "SGSR edge threshold",
        interaction: { kind: "range", min: 1, max: 32, step: 1 },
        effect: "@korri:moonlight/set-sgsr-quality",
      },
      faceButtonFlip: {
        id: "@korri:moonlight/face-button-flip",
        owner: { kind: "transport", id: transport },
        label: "Flip A/B and X/Y",
        interaction: { kind: "toggle" },
        effect: "@korri:moonlight/set-face-button-flip",
      },
      rumble: {
        id: "@korri:moonlight/rumble",
        owner: { kind: "transport", id: transport },
        label: "Rumble",
        interaction: { kind: "toggle" },
        effect: "@korri:moonlight/set-rumble",
      },
      pictureInPicture: {
        id: "@korri:moonlight/picture-in-picture",
        owner: { kind: "transport", id: transport },
        label: "Picture-in-picture",
        interaction: { kind: "toggle" },
        effect: "@korri:moonlight/set-picture-in-picture",
      },
      disconnect: {
        id: "@korri:moonlight/disconnect",
        owner: { kind: "transport", id: transport },
        label: "Disconnect",
        description: "Leave the host game running",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/disconnect",
        dismissOnSuccess: true,
      },
      quitHost: {
        id: "@korri:moonlight/quit-host",
        owner: { kind: "transport", id: transport },
        label: "Quit game on host",
        interaction: { kind: "command" },
        effect: "@korri:moonlight/quit-host",
        destructive: true,
        dismissOnSuccess: true,
      },
    },
  },
} as const

declaration
