import type { ElectrobunConfig } from "electrobun"

export default {
  app: {
    name: "Korri",
    identifier: "dev.korri.desktop",
    version: "1.0.0",
    description: "Korri desktop app",
  },
  build: {
    buildFolder: "out/build/electrobun",
    artifactFolder: "out/artifacts/electrobun",
    bun: {
      entrypoint: "korri/deploy/desktop/index.ts",
    },
    copy: {
      "out/build/portal/index.html": "views/mainview/index.html",
      "out/build/portal/assets": "views/mainview/assets",
      "out/build/desktop-preload/preload.js": "views/mainview/preload.js",
    },
    watchIgnore: ["out/**", "node_modules/**"],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig
