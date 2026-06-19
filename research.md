# Research: 3dSen/3DSen frontend integrations

## Summary
3dSen's launch contract is profile-ID based, not ROM-path based: frontends ultimately run `3dSen -id=[profile id]` or Steam `steam -applaunch 1147940 -id=[profile id]`, while 3dSen resolves the NES ROM from its own saved library (`rom.json`). RetroBat/EmulationStation-style integrations use `.3dsen` files as tiny launcher descriptors containing the fixed 3dSen game/profile ID; LaunchBox users commonly store the same ID as a per-game custom parameter. I found solid evidence for RetroBat and LaunchBox, plus generic EmulationStation/AttractMode command patterns; I did not find an upstream Batocera generator/integration that directly ships 3dSen.

## Findings
1. **The core 3dSen command is `-id`, not `%ROM%`.** The official Steam FAQ/search snippet gives both direct and Steam launch forms: `3dSen -id=[profile id]` and `steam -applaunch 1147940 -id=[profile id]`. A LaunchBox forum snippet shows the same Steam command in an AutoHotkey wrapper: `Run,"C:\Program Files (x86)\steam\steam.exe" -applaunch 1147940 -id=%1%`. [Steam FAQ](https://steamcommunity.com/app/1147940/discussions/0/2290590708545884688/) [LaunchBox forum snippet](https://forums.launchbox-app.com/profile/124792-stevet79/content/?type=forums_topic_post)

2. **Profile IDs are fixed 3dSen IDs.** The Steam FAQ publishes a profile-ID list (examples from snippets: Arkanoid `1`, Balloon Fight `2`, Castlevania `7`, Contra `9`, Donkey Kong `11`, Dr. Mario `14`, Mega Man 3 `64`). A LaunchBox guide repeats that IDs can be read from 3dSen's `rom.json`. [Steam FAQ](https://steamcommunity.com/app/1147940/discussions/0/2290590708545884688/) [LaunchBox guide](https://www.reddit.com/r/launchbox/comments/166ge0x/3dsen_and_launchbox_the_guide_guide_by_joku/)

3. **3dSen maps profile ID to NES ROM path internally via `rom.json`.** The LaunchBox guide says games must be added to 3dSen and that every game's Profile ID is visible in `rom.json`, located at `%appdata%\..\LocalLow\Geod Studio\3dSen`. LaunchBox forum snippets likewise say 3dSen saves game info into `rom.json` under that path after games have been added. [LaunchBox guide](https://www.reddit.com/r/launchbox/comments/166ge0x/3dsen_and_launchbox_the_guide_guide_by_joku/) [LaunchBox forum snippet](https://forums.launchbox-app.com/profile/102158-joeviking245/solutions/)

4. **RetroBat exposes 3dSen as “NES 3D” and uses `.3dsen` descriptor files.** The RetroBat wiki states that 3dSen has a fixed ID for each compatible game and that, for RetroBat to launch 3dSen with a game, the game ID must be specified in a `.3dsen` file. Search results also show an official RetroBat release note adding compatibility for 3dSen emulator `0.9.5+`. [RetroBat NES 3D wiki](https://wiki.retrobat.org/systems-and-emulators/supported-game-systems/game-consoles/nintendo-game-consoles/nes-3d) [RetroBat obsolete release notes](https://github.com/kaylh/old-RetroBat-obsolete/releases)

5. **LaunchBox's practical setup is per-game custom command parameters.** The LaunchBox guide instructs users to enable “Use Custom Command-line Parameters” on each 3dSen playlist game and enter the profile ID parameter, e.g. Mega Man 3 uses `-id=64`. This means LaunchBox does not need to pass a ROM path to 3dSen; it passes only the profile ID and relies on 3dSen's saved ROM library. [LaunchBox guide](https://www.reddit.com/r/launchbox/comments/166ge0x/3dsen_and_launchbox_the_guide_guide_by_joku/)

6. **Batocera evidence is weak/upstream support appears absent.** Searches for `3dsen` in Batocera upstream terms did not surface a Batocera wiki page or generator; the visible Batocera-adjacent result is Pixel Nostalgia's “3dSen” game-list/theme page for Batocera and RetroBat, not an emulator launcher implementation. Treat Batocera as requiring a custom EmulationStation system/wrapper unless project-local evidence says otherwise. [Pixel Nostalgia 3dSen page](https://pixelnostalgia.github.io/3dsen-3dsen/) [Batocera emulatorlauncher source search result](https://github.com/batocera-linux/batocera.linux/blob/master/package/batocera/core/batocera-configgen/configgen/configgen/emulatorlauncher.py)

7. **AttractMode has no discovered first-party 3dSen integration, but the command model is straightforward.** Because AttractMode can pass romlist fields into an executable, the reliable pattern is either name the launcher entries by profile ID or call a small wrapper that reads a `.3dsen` file and invokes Steam with `-id=<content>`. No direct AttractMode-specific 3dSen source was found in the search pass.

## Concrete command templates and file examples

### Core 3dSen / Steam

```bat
REM Direct 3dSen executable, when installed outside Steam or callable on PATH
3dSen.exe -id=64

REM Steam app launch, Windows
"C:\Program Files (x86)\Steam\steam.exe" -applaunch 1147940 -id=64

REM Steam app launch, Linux/Proton-style environment if Steam owns the app
steam -applaunch 1147940 -id=64
```

### RetroBat / EmulationStation `.3dsen` descriptor

Use a frontend-visible “ROM” file whose content is the 3dSen profile ID:

```text
roms/nes3d/Mega Man 3.3dsen
```

```text
64
```

Wrapper command template:

```bat
@echo off
set /p PROFILE_ID=<"%~1"
"C:\Program Files (x86)\Steam\steam.exe" -applaunch 1147940 -id=%PROFILE_ID%
```

EmulationStation-style command using the wrapper:

```xml
<system>
  <name>nes3d</name>
  <fullname>Nintendo Entertainment System 3D</fullname>
  <path>~/.emulationstation/roms/nes3d</path>
  <extension>.3dsen</extension>
  <command>3dsen-launch "%ROM_RAW%"</command>
  <platform>nes</platform>
  <theme>nes3d</theme>
</system>
```

If the frontend cannot read descriptor contents, name files by ID and use basename:

```text
roms/nes3d/64.3dsen
```

```xml
<command>steam -applaunch 1147940 -id=%BASENAME%</command>
```

### LaunchBox

Emulator application path options:

```text
C:\Program Files (x86)\Steam\steam.exe
```

Default parameters:

```text
-applaunch 1147940
```

Per-game custom command-line parameter example:

```text
-id=64
```

Alternative wrapper pattern from LaunchBox forum snippets:

```ahk
Run,"C:\Program Files (x86)\steam\steam.exe" -applaunch 1147940 -id=%1%
Esc::
  Process, Close, 3dSen.exe
  ExitApp
Return
```

LaunchBox game entry then passes only the ID, e.g. `64` or `-id=64` depending on wrapper convention.

### AttractMode

ID-as-romname pattern:

```ini
# emulators/3dsen.cfg
executable           C:\Program Files (x86)\Steam\steam.exe
args                 -applaunch 1147940 -id=[name]
rompath              C:\Launchers\3dsen-ids
romext               .3dsen
system               Nintendo Entertainment System 3D
```

Example entry file:

```text
C:\Launchers\3dsen-ids\64.3dsen
```

Wrapper-reads-file pattern:

```ini
executable           C:\Launchers\3dsen-launch.bat
args                 "[romfilename]"
rompath              C:\Launchers\3dsen
romext               .3dsen
```

```bat
@echo off
set /p PROFILE_ID=<"%~1"
"C:\Program Files (x86)\Steam\steam.exe" -applaunch 1147940 -id=%PROFILE_ID%
```

### Companion files

Required/expected files:

```text
%APPDATA%\..\LocalLow\Geod Studio\3dSen\rom.json
```

Purpose: 3dSen's own saved library, created/updated after adding games in 3dSen. This is where the emulator records profile IDs and the NES ROM information/path it will load. The frontend does not need to own that mapping if it launches by `-id`.

Illustrative, not verified exact schema:

```json
[
  {
    "id": 64,
    "name": "Mega Man 3",
    "path": "D:\\Roms\\NES\\Mega Man 3.nes"
  }
]
```

## Sources
- Kept: Steam 3dSen FAQ (https://steamcommunity.com/app/1147940/discussions/0/2290590708545884688/) — primary/official command-line contract and profile-ID list.
- Kept: RetroBat NES 3D wiki (https://wiki.retrobat.org/systems-and-emulators/supported-game-systems/game-consoles/nintendo-game-consoles/nes-3d) — RetroBat-specific `.3dsen` descriptor statement.
- Kept: RetroBat wiki source on GitHub (https://github.com/RetroBat-Official/retrobat-wiki/blob/master/lang/en/systems-and-emulators/supported-game-systems/game-consoles/nintendo-game-consoles/nes-3d.md) — versioned source for the RetroBat wiki page.
- Kept: LaunchBox Reddit guide (https://www.reddit.com/r/launchbox/comments/166ge0x/3dsen_and_launchbox_the_guide_guide_by_joku/) — practical LaunchBox setup, per-game `-id=64`, and `rom.json` path.
- Kept: LaunchBox forum snippets (https://forums.launchbox-app.com/profile/102158-joeviking245/solutions/ and https://forums.launchbox-app.com/profile/124792-stevet79/content/?type=forums_topic_post) — corroborates `rom.json` and wrapper command.
- Kept: Pixel Nostalgia 3dSen page (https://pixelnostalgia.github.io/3dsen-3dsen/) — Batocera/RetroBat-adjacent game-list/theme evidence, not a launcher implementation.
- Dropped: generic Emulation General Wiki page — useful emulator background, but not frontend command/mapping evidence.
- Dropped: Batocera 3DS wiki result — unrelated Nintendo 3DS system page.
- Dropped: Facebook group results — inaccessible/low-verifiability snippets.

## Gaps
- I could not verify the exact `rom.json` schema from a primary file sample; only its location and purpose are corroborated by LaunchBox sources. Next step: install/run 3dSen once, add a test ROM, and inspect `LocalLow/Geod Studio/3dSen/rom.json`.
- I did not find an upstream Batocera launcher/generator for 3dSen. Next step: inspect the current Batocera tree directly with source search if Batocera support is required.
- I did not find a first-party AttractMode 3dSen config. The AttractMode examples above are derived from its generic command model and should be validated in a local AttractMode install.
