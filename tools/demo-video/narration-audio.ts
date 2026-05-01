import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"

type SceneManifestEntry = {
  scene: string
  text?: string
  voice?: string
  speed?: number
  lang?: string
}

type TtsClip = {
  scene: string
  path: string
  durationMs: number
}

type AudioPlacement = {
  scene: string
  clipPath: string
  startMs: number
  endMs: number
}

export type NarrationAudioOptions = {
  demoName: string
  manifestPath: string
  workDir: string
  defaultVoice?: string
  defaultSpeed?: number
}

const overlapGapMs = 100
const sampleRate = 24_000
const defaultVoice = "af_heart"
const defaultSpeed = 1

export function buildTtsClipPath(
  demoName: string,
  entry: SceneManifestEntry,
  projectRoot = ".",
): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        scene: entry.scene,
        text: entry.text,
        voice: entry.voice,
        speed: entry.speed,
        lang: entry.lang,
      }),
    )
    .digest("hex")

  return path.join(projectRoot, ".argo", demoName, "clips", `${hash}.wav`)
}

export function buildAudioPlacements(
  timing: Record<string, number>,
  clips: ReadonlyArray<TtsClip>,
): AudioPlacement[] {
  const matchedClips = clips
    .filter(clip => timing[clip.scene] !== undefined)
    .sort((left, right) => timing[left.scene] - timing[right.scene])

  const placements: AudioPlacement[] = []
  let previousEndMs = 0

  for (const clip of matchedClips) {
    let startMs = timing[clip.scene]
    if (placements.length > 0 && startMs < previousEndMs) {
      startMs = previousEndMs + overlapGapMs
    }

    const endMs = startMs + clip.durationMs
    placements.push({
      scene: clip.scene,
      clipPath: clip.path,
      startMs,
      endMs,
    })
    previousEndMs = endMs
  }

  return placements
}

export function createNarrationAudio(options: NarrationAudioOptions): void {
  const absoluteManifestPath = path.resolve(options.manifestPath)
  const absoluteWorkDir = path.resolve(options.workDir)
  const timingPath = path.join(absoluteWorkDir, ".timing.json")
  const videoPath = resolveRecordedVideoPath(absoluteWorkDir)
  const outputPath = path.join(absoluteWorkDir, "narration-aligned.wav")

  if (!existsSync(timingPath)) {
    throw new Error(`Missing Argo timing file: ${timingPath}`)
  }

  const manifest = readScenesManifest(absoluteManifestPath).filter(
    entry => typeof entry.text === "string" && entry.text.trim().length > 0,
  )
  const timing = readTiming(timingPath)
  const clips = manifest.map(entry => {
    const clipEntry = {
      scene: entry.scene,
      text: entry.text,
      voice: entry.voice ?? options.defaultVoice ?? defaultVoice,
      speed: entry.speed ?? options.defaultSpeed ?? defaultSpeed,
      lang: entry.lang,
    }
    const clipPath = buildTtsClipPath(options.demoName, clipEntry)
    if (!existsSync(clipPath)) {
      throw new Error(
        `Missing generated Argo TTS clip for ${entry.scene}: ${clipPath}`,
      )
    }

    return {
      scene: entry.scene,
      path: clipPath,
      durationMs: readWavDurationMs(clipPath),
    }
  })

  if (clips.length === 0) {
    rmSync(outputPath, { force: true })
    return
  }

  const placements = buildAudioPlacements(timing, clips)
  if (placements.length === 0) {
    throw new Error(
      `None of the generated TTS clips matched timing marks in ${timingPath}`,
    )
  }

  const videoDurationMs = readMediaDurationMs(videoPath)
  const requiredDurationMs = Math.max(
    videoDurationMs,
    ...placements.map(placement => placement.endMs),
  )

  mkdirSync(absoluteWorkDir, { recursive: true })
  mixAudioWithFfmpeg({
    outputPath,
    placements,
    durationMs: requiredDurationMs,
  })
}

function readScenesManifest(manifestPath: string): SceneManifestEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"))
  if (!Array.isArray(parsed)) {
    throw new Error(`Scene manifest must be a JSON array: ${manifestPath}`)
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Scene manifest entry ${index} must be an object`)
    }

    const raw = entry as Record<string, unknown>
    if (typeof raw.scene !== "string") {
      throw new Error(`Scene manifest entry ${index} is missing a scene name`)
    }

    return {
      scene: raw.scene,
      text: typeof raw.text === "string" ? raw.text : undefined,
      voice: typeof raw.voice === "string" ? raw.voice : undefined,
      speed: typeof raw.speed === "number" ? raw.speed : undefined,
      lang: typeof raw.lang === "string" ? raw.lang : undefined,
    }
  })
}

function readTiming(timingPath: string): Record<string, number> {
  const parsed: unknown = JSON.parse(readFileSync(timingPath, "utf8"))
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Timing file must be a JSON object: ${timingPath}`)
  }

  const timing: Record<string, number> = {}
  for (const [scene, value] of Object.entries(parsed)) {
    if (typeof value !== "number") {
      throw new Error(`Timing value for ${scene} must be a number`)
    }
    timing[scene] = value
  }

  return timing
}

function resolveRecordedVideoPath(workDir: string): string {
  for (const fileName of [
    "video.webm",
    "video.mp4",
    "video.mov",
    "video.mkv",
  ]) {
    const candidate = path.join(workDir, fileName)
    if (existsSync(candidate)) return candidate
  }

  throw new Error(`Missing Argo recording in ${workDir}`)
}

function readWavDurationMs(wavPath: string): number {
  const wav = readFileSync(wavPath)
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error(`Invalid WAV clip: ${wavPath}`)
  }

  let offset = 12
  let sampleRate = 0
  let channelCount = 0
  let bitsPerSample = 0
  let dataSize = 0

  while (offset < wav.length - 8) {
    const chunkId = wav.toString("ascii", offset, offset + 4)
    let chunkSize = wav.readUInt32LE(offset + 4)
    const chunkStart = offset + 8

    if (chunkId === "fmt ") {
      channelCount = wav.readUInt16LE(chunkStart + 2)
      sampleRate = wav.readUInt32LE(chunkStart + 4)
      bitsPerSample = wav.readUInt16LE(chunkStart + 14)
    }

    if (chunkId === "data") {
      if (chunkSize === 0xffffffff || chunkSize > wav.length - chunkStart) {
        chunkSize = wav.length - chunkStart
      }
      dataSize = chunkSize
      break
    }

    offset = chunkStart + chunkSize
  }

  if (
    sampleRate <= 0 ||
    channelCount <= 0 ||
    bitsPerSample <= 0 ||
    dataSize <= 0
  ) {
    throw new Error(`Unable to read WAV duration: ${wavPath}`)
  }

  const bytesPerSample = bitsPerSample / 8
  const sampleCount = dataSize / (bytesPerSample * channelCount)
  return (sampleCount / sampleRate) * 1000
}

function readMediaDurationMs(mediaPath: string): number {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      mediaPath,
    ],
    { encoding: "utf8" },
  )

  if (result.status !== 0) {
    throw new Error(
      `ffprobe failed for ${mediaPath}: ${result.stderr || result.error?.message}`,
    )
  }

  const durationSeconds = Number(result.stdout.trim())
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Unable to read media duration for ${mediaPath}`)
  }

  return durationSeconds * 1000
}

function mixAudioWithFfmpeg(options: {
  outputPath: string
  placements: ReadonlyArray<AudioPlacement>
  durationMs: number
}): void {
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-t",
    formatSeconds(options.durationMs),
    "-i",
    `anullsrc=r=${sampleRate}:cl=mono`,
  ]

  for (const placement of options.placements) {
    args.push("-i", placement.clipPath)
  }

  const delayedLabels = options.placements.map(
    (placement, index) =>
      `[${index + 1}:a]adelay=${Math.round(placement.startMs)}:all=1[a${index}]`,
  )
  const mixInputs = [
    "[0:a]",
    ...options.placements.map((_, index) => `[a${index}]`),
  ]
  const filterComplex = `${delayedLabels.join(";")};${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:normalize=0[aout]`

  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[aout]",
    "-ac",
    "1",
    "-ar",
    String(sampleRate),
    "-acodec",
    "pcm_f32le",
    options.outputPath,
  )

  const result = spawnSync("ffmpeg", args, { encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg failed while creating narration audio: ${result.stderr || result.error?.message}`,
    )
  }
}

function formatSeconds(durationMs: number): string {
  return (durationMs / 1000).toFixed(3)
}
