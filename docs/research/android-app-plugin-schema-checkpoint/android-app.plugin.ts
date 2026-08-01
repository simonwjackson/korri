// Declaration-only Android application launcher plugin for Checkpoint 0.
//
// `android-app` is the integration token already consumed by Korri's signed
// Android LaunchSpec. It is not a process command: the future Android launch
// integration must consume it before generic process execution.
const declaration = {
  namespace: "@korri",
  name: "android-app",
  title: "Android",
  contributes: {
    config: {
      providers: {
        "@korri:android-app": {
          id: "@korri:android-app",
          title: "Android",
        },
      },
      systems: {
        android: {
          id: "android",
          title: "Android",
        },
      },
      launchers: {
        "android-app": {
          id: "@korri:android-app/android-app",
          plugin: "@korri:android-app",
          command: "android-app",
          systems: ["android"],
        },
      },
    },
  },
} as const

declaration
