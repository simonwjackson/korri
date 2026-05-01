import { defineConfig } from "@argo-video/cli"

export default defineConfig({
  baseURL: process.env.ARGO_BASE_URL ?? "http://localhost:3000",
  demosDir: "out/generated/bdd/argo",
  outputDir: "out/demo-videos",
  tts: {
    defaultVoice: "af_heart",
    defaultSpeed: 1,
  },
  video: {
    width: 1920,
    height: 1080,
    fps: 30,
    browser: "chromium",
    deviceScaleFactor: 1,
    sceneThumbnails: true,
  },
  export: {
    preset: "veryfast",
    crf: 20,
    sharpen: true,
    audio: {
      loudnorm: true,
    },
    frame: {
      padding: 32,
      borderRadius: 16,
      shadow: 0.45,
      background: { type: "solid", value: "#0f172a" },
    },
  },
  overlays: {
    autoBackground: true,
    defaultPlacement: "bottom-center",
  },
})
