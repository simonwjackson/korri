;(() => {
  const queryParams = new URLSearchParams(location.search)
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""))
  const getParam = name => queryParams.get(name) ?? hashParams.get(name)

  const parseBool = name => {
    const raw = getParam(name)
    if (raw === null) return null
    const value = String(raw).toLowerCase()
    if (["1", "on", "true", "yes"].includes(value)) return 1
    if (["0", "off", "false", "no"].includes(value)) return 0
    return null
  }

  const parseVolume = name => {
    const raw = getParam(name)
    if (raw === null) return null
    if (!/^(?:[0-9]|10)$/.test(String(raw))) return null
    return Number(raw)
  }

  window.__YFS_LAUNCH_SETTINGS = Object.create(null)
  const launchSettings = window.__YFS_LAUNCH_SETTINGS
  const setIfPresent = (key, value) => {
    if (value !== null && value !== undefined) launchSettings[key] = value
  }

  setIfPresent("enableAudio", parseBool("audio"))
  setIfPresent("enableGBASounds", parseBool("gba_sounds"))
  setIfPresent("enableQuickDeath", parseBool("quick_death"))
  setIfPresent("enablePlayTimer", parseBool("play_timer"))
  setIfPresent("VolumeBGM", parseVolume("bgm_volume"))
  setIfPresent("VolumeSFX", parseVolume("sfx_volume"))

  window.__YFSGetSetting = function yfsGetSetting(
    dictionary,
    key,
    defaultValue,
  ) {
    if (Object.hasOwn(launchSettings, key)) return launchSettings[key]
    if (defaultValue === undefined) return dictionary.ExpObject(key)
    return dictionary.ExpObject(key, defaultValue)
  }
})()
