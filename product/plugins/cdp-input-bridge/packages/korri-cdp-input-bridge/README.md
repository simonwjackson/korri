# korri-cdp-input-bridge

Launch-owned bridge for keyboard-only Chromium games. It reads one selected InputPlumber virtual controller via `evtest --grab` and dispatches keyboard events to one Chromium CDP page.

Do not use this binary as a global mapper. It is intended to be spawned by Korri session lifecycle hooks and stopped before session cleanup restores Korri UI.
