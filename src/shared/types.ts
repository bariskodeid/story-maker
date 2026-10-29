import type { ExplainerScene, ExplainerTemplateId, ExplainerTheme } from './explainer'

export type ProjectStatus = 'draft' | 'script' | 'storyboard' | 'editing' | 'exported'
/** A story video (AI pictures per scene) or an explainer video (designed scenes rendered by Remotion). */
export type ProjectKind = 'story' | 'explainer'
export type AspectRatio = '16:9' | '9:16'
export type TtsProvider = 'gemini' | 'elevenlabs' | 'ninerouter'
export type LlmProvider = 'gemini' | 'openrouter' | 'groq' | 'ninerouter' | 'custom'
export type ApiProvider = 'higgsfield' | 'gemini' | 'elevenlabs' | 'openrouter' | 'groq' | 'ninerouter' | 'custom'
/** LLM providers reached at a user-chosen base URL, with an optional key. */
export type EndpointProvider = 'ninerouter' | 'custom'
/** Where a live model list comes from: an LLM provider, or a TTS catalog. */
export type ModelSource = LlmProvider | 'gemini-tts' | 'elevenlabs'
export type MotionType = 'camera' | 'video'
export type CameraPresetId = 'zoomin' | 'zoomout' | 'panleft' | 'panright' | 'kenburns' | 'shake' | 'static'
export type MotionStrength = 'halus' | 'sedang' | 'kuat'
export type TransitionId = 'cut' | 'fade' | 'slideleft' | 'zoomin'
export type CaptionStyleId = 'karaoke' | 'tebal' | 'minimal' | 'subtitle' | 'none'
export type CaptionPosition = 'atas' | 'tengah' | 'bawah'
export type CaptionSize = 'kecil' | 'sedang' | 'besar'
/** 1 idea, 2 script, 3 storyboard, 4 editor */
export type Step = 1 | 2 | 3 | 4

export interface EditorSettings {
  captionStyle: CaptionStyleId
  captionPosition: CaptionPosition
  captionSize: CaptionSize
  /** Caption size as a multiple of the style's size (0.5–1.8); overrides captionSize when set. */
  captionScale?: number
  /** Custom look on top of the chosen caption style; unset fields keep the style's own. */
  captionFont?: string
  captionColor?: string
  captionHighlight?: string
  /** Box behind the caption: a color and opacity, or null for no box. */
  captionBg?: { color: string; opacity: number } | null
  musicAssetId: string | null
  musicVolumeDb: number
  duckMusic: boolean
  /** Logos, watermarks and text placed over the video. */
  overlays: Overlay[]
  /** Volume change for all narration, in dB. */
  voiceVolumeDb?: number
  /** Background music on the timeline: from `musicStartMs` to `musicEndMs` (null: the end), `musicInMs` into the song. */
  musicStartMs?: number
  musicEndMs?: number | null
  musicInMs?: number
  /** Last prompt written for making background music in an outside AI (Suno, Udio, …). */
  musicPrompt?: MusicPrompt | null
}

export interface MusicPrompt {
  /** Suno "Style of Music": comma-separated English tags. */
  style: string
  /** Suno "Exclude styles". */
  exclude: string
  title: string
  /** One paragraph for other music AIs (Udio, ElevenLabs Music, Stable Audio, …). */
  description: string
  /** Why this music fits, in Indonesian, for the user. */
  reason: string
  /** Video length when it was written, in seconds. */
  durationSec: number
}

/**
 * Where an overlay sits: `anchor` is a numpad position on the overlay itself (7 top-left, 5 center,
 * 3 bottom-right, the same numbering as ASS n), and `x`/`y` place that point as a fraction of the frame.
 */
interface OverlayBase {
  id: string
  anchor: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  x: number
  y: number
  /** Seconds on the final timeline; `end` null means until the video ends. */
  start: number
  end: number | null
}

export interface ImageOverlay extends OverlayBase {
  kind: 'image'
  assetId: string
  /** Width as a fraction of the frame width. */
  width: number
  opacity: number
}

export type TextOverlayStyle = 'plain' | 'outline' | 'box'

export interface TextOverlay extends OverlayBase {
  kind: 'text'
  text: string
  /** Font size as a fraction of the frame height. */
  size: number
  color: string
  style: TextOverlayStyle
  bold: boolean
}

export type Overlay = ImageOverlay | TextOverlay

export interface Project {
  id: string
  title: string
  synopsis: string
  durationSec: number
  language: string
  aspectRatio: AspectRatio
  styleId: string
  ttsProvider: TtsProvider
  ttsVoice: string
  /** Higgsfield endpoint ids; null falls back to the app default. */
  imageModel: string | null
  videoModel: string | null
  /** One of the video model's resolutions, e.g. "720p"; null or unsupported uses the default (1080p when offered). */
  videoResolution: string | null
  status: ProjectStatus
  step: Step
  coverAssetId: string | null
  editor: EditorSettings
  /** Set when the project is an episode of a series; owned by the main process, never written by a save. */
  seriesId: string | null
  episodeNo: number | null
  /** What happened in this episode (written with its script), for the scripts of later episodes. */
  episodeSummary: string
  kind: ProjectKind
  /** Explainer template; null for story projects. */
  templateId: ExplainerTemplateId | null
  /** Explainer look chosen on top of the template (palette, accent, font, logo, captions). */
  theme: ExplainerTheme
  createdAt: number
  updatedAt: number
}

export interface Character {
  id: string
  projectId: string
  name: string
  description: string
  sheetAssetId: string | null
  sort: number
}

export interface Clip {
  id: string
  projectId: string
  sort: number
  title: string
  /** What happens in the scene, in the script's language (the Naskah step). */
  story: string
  visualPrompt: string
  /** The story text the current visual plan was written from; null before any plan. */
  visualSource: string | null
  narration: string
  durationMs: number
  characterIds: string[]
  motionType: MotionType
  cameraPreset: CameraPresetId
  motionStrength: MotionStrength
  videoPrompt: string
  transition: TransitionId
  /** Camera move drawn over the AI video ('static' keeps the video as it is). */
  videoCamera: CameraPresetId
  videoStrength: MotionStrength
  /** Length of the transition into the next clip; null uses the default (0.4 s). */
  transitionMs: number | null
  /** Volume change for this clip's narration, in dB. */
  voiceGainDb: number
  /** Where the clip's video starts, in ms into the video file (trimmed from the left on the timeline). */
  mediaInMs: number
  /** The clip's voice trimmed to `voiceInMs`–`voiceOutMs` of its audio (null: to the end), placed `voiceStartMs` into the clip. */
  voiceInMs: number
  voiceOutMs: number | null
  voiceStartMs: number
  imageAssetId: string | null
  videoAssetId: string | null
  audioAssetId: string | null
  /** The designed scene of an explainer clip; null for story clips. */
  scene: ExplainerScene | null
}

export type AssetKind = 'image' | 'video' | 'audio' | 'music' | 'overlay' | 'export'

export interface WordTiming {
  text: string
  start: number
  end: number
}

export interface AssetMeta {
  words?: WordTiming[]
  estimatedTimings?: boolean
  voice?: string
  [key: string]: unknown
}

export interface Asset {
  id: string
  projectId: string
  clipId: string | null
  characterId: string | null
  kind: AssetKind
  provider: string | null
  model: string | null
  prompt: string | null
  remoteId: string | null
  remoteUrl: string | null
  localPath: string
  url: string
  durationMs: number | null
  width: number | null
  height: number | null
  meta: AssetMeta
  createdAt: number
}

/** "narration" voices several scenes in one take and cuts it per scene. */
export type JobKind = 'story' | 'image' | 'sheet' | 'video' | 'tts' | 'narration' | 'align' | 'export'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled'

export interface Job {
  id: string
  projectId: string
  clipId: string | null
  characterId: string | null
  kind: JobKind
  provider: string
  status: JobStatus
  progress: number
  message: string | null
  error: string | null
  resultAssetId: string | null
  createdAt: number
  updatedAt: number
}

export interface ProjectBundle {
  project: Project
  characters: Character[]
  clips: Clip[]
  assets: Asset[]
  jobs: Job[]
}

export interface ProjectSummary {
  id: string
  title: string
  styleId: string
  status: ProjectStatus
  step: Step
  clipCount: number
  totalMs: number
  coverUrl: string | null
  updatedAt: number
  kind: ProjectKind
  templateId: ExplainerTemplateId | null
}

/** What the renderer sends on save. Asset links are owned by the main process and never overwritten by a save. */
export interface ProjectSnapshot {
  project: Omit<Project, 'createdAt' | 'updatedAt' | 'coverAssetId' | 'seriesId' | 'episodeNo' | 'episodeSummary'>
  characters: Omit<Character, 'sheetAssetId'>[]
  clips: Omit<Clip, 'imageAssetId' | 'videoAssetId' | 'audioAssetId'>[]
}

export interface NewProjectInput {
  synopsis?: string
  durationSec?: number
  language?: string
  aspectRatio?: AspectRatio
  styleId?: string
  ttsProvider?: TtsProvider
  kind?: ProjectKind
  templateId?: ExplainerTemplateId
}

export interface KeyStatus {
  provider: ApiProvider
  configured: boolean
  lastOk: boolean | null
  lastMessage: string | null
  checkedAt: number | null
  /** Masked key for display, e.g. "sk-or-v1…9f3c". Null when there is no readable key. */
  preview: string | null
  /** A key is stored but can no longer be decrypted and must be entered again. */
  unreadable: boolean
}

export interface KeyTestResult {
  ok: boolean
  message: string
}

export interface VoiceOption {
  id: string
  name: string
  description: string
  previewUrl?: string | null
  /** ISO 639-1 code of the language the voice speaks, when known, so the project's language can come first. */
  language?: string
  /** Short labels the picker can filter on, e.g. "Indonesia", "Pria". */
  tags?: string[]
}

export interface AppSettings {
  defaultTtsProvider: TtsProvider
  defaultLanguage: string
  exportFolder: string | null
  /** Which LLM writes stories and narration. */
  llmProvider: LlmProvider
  /** Chosen model per LLM provider, so switching providers keeps each choice. */
  llmModels: Record<LlmProvider, string>
  /** Base URL of an OpenAI-compatible endpoint, e.g. http://localhost:11434/v1 */
  customBaseUrl: string
  /** Base URL of the user's 9Router gateway (local by default, or a self-hosted one). */
  nineRouterBaseUrl: string
  geminiTtsModel: string
  elevenModel: string
  /** Higgsfield models for new projects: the last ones picked in the Idea step. */
  imageModel: string
  videoModel: string
  /** Time captions against the real voice with Whisper after narration is made (when the model is present). */
  whisperAuto: boolean
  /** One-click generate also exports an MP4 once the editor is ready; the last choice made when starting a run. */
  autoExport: boolean
}

/** What one Higgsfield request would cost, from the API's estimate endpoint. */
export interface CreditEstimate {
  credits: number
  usd: number | null
}

/** The local Whisper model used to time caption words. */
export interface WhisperStatus {
  state: 'missing' | 'downloading' | 'verifying' | 'ready'
  received: number
  total: number
  error: string | null
}

export interface ModelOption {
  id: string
  name: string
  description?: string
  contextLength?: number | null
  /** USD per 1M input / output tokens, when the provider publishes it. */
  priceIn?: number | null
  priceOut?: number | null
  /** Short labels the picker can filter on, e.g. "JSON", "Gratis", "Gambar". */
  tags: string[]
  /** Model family, e.g. "Kling", for a brand mark next to the name. */
  family?: string
  /** Higgsfield credits (and dollars) for one request; undefined while unknown, null when it cannot be estimated. */
  credits?: number | null
  usd?: number | null
  /** What the credits pay for, e.g. "10 dtk". */
  creditUnit?: string
}

export interface ModelList {
  models: ModelOption[]
  fetchedAt: number
}

export interface ExportOptions {
  fileName: string
  resolution: 720 | 1080 | 2160
  fps: 30 | 60
  burnCaptions: boolean
  writeSrt: boolean
  normalizeAudio: boolean
  duckMusic: boolean
  folder: string
}

export interface ClipPatchEvent {
  clipId: string
  patch: Partial<Clip>
}

export interface CharacterPatchEvent {
  characterId: string
  patch: Partial<Character>
}

// ---------- series ----------

/** serial: the episodes tell one continuing story; anthology: standalone stories with the same cast and world. */
export type SeriesContinuity = 'serial' | 'anthology'
/** Story series share a cast; explainer series (a course of lessons, a recurring tips or facts show) share a template. */
export type SeriesKind = ProjectKind

/** The series bible: what every episode script must agree with. */
export interface SeriesBible {
  world: string
  tone: string
  rules: string
  /** One-line teaser per episode number; a serial episode ends by leading into the next one's hook. */
  hooks: { no: number; hook: string }[]
}

export interface Series {
  id: string
  kind: SeriesKind
  title: string
  premise: string
  continuity: SeriesContinuity
  bible: SeriesBible
  /** Episodes planned so far. */
  episodeCount: number
  /** Settings every new episode project starts with. */
  durationSec: number
  language: string
  aspectRatio: AspectRatio
  styleId: string
  ttsProvider: TtsProvider
  ttsVoice: string
  imageModel: string | null
  videoModel: string | null
  /** Explainer series: the template every new episode starts with; null for story series. */
  templateId: ExplainerTemplateId | null
  /** Explainer series: palette, font, accent and captions for new episodes (never a logo, which is a project file). */
  theme: ExplainerTheme
  createdAt: number
  updatedAt: number
}

/** The shared cast. A sheet lives in the series folder and is copied into each episode project that uses it. */
export interface SeriesCharacter {
  id: string
  seriesId: string
  name: string
  description: string
  /** Relative to the series folder; null until an episode made a sheet for this character. */
  sheetPath: string | null
  sheetUrl: string | null
  sort: number
}

export interface SeriesEpisode {
  /** The episode's project id. */
  id: string
  no: number
  title: string
  synopsis: string
  summary: string
  status: ProjectStatus
  step: Step
  clipCount: number
  totalMs: number
  coverUrl: string | null
  /** The episode's own explainer template (it keeps it when the series template changes later); null for stories. */
  templateId: ExplainerTemplateId | null
  updatedAt: number
}

export interface SeriesBundle {
  series: Series
  characters: SeriesCharacter[]
  episodes: SeriesEpisode[]
}

export interface SeriesSummary {
  id: string
  title: string
  kind: SeriesKind
  continuity: SeriesContinuity
  styleId: string
  templateId: ExplainerTemplateId | null
  episodeCount: number
  /** Episodes that reached the editor (status editing or exported). */
  readyCount: number
  exportedCount: number
  coverUrl: string | null
  updatedAt: number
}

export interface NewSeriesInput {
  premise: string
  continuity: SeriesContinuity
  episodeCount: number
  durationSec: number
  language: string
  aspectRatio: AspectRatio
  styleId: string
  ttsProvider: TtsProvider
  kind?: SeriesKind
  templateId?: ExplainerTemplateId
}

export type SeriesPatch = Partial<Pick<Series, 'title' | 'premise'> & Pick<SeriesBible, 'world' | 'tone' | 'rules'>>

/** Settings episodes start with. A change also reaches the episodes that have no scenes yet, never the others. */
export type SeriesSettingsPatch = Partial<
  Pick<Series, 'durationSec' | 'language' | 'aspectRatio' | 'styleId' | 'ttsProvider' | 'ttsVoice' | 'imageModel' | 'templateId' | 'theme'>
>

export interface SeriesSettingsResult {
  bundle: SeriesBundle
  /** Episodes without scenes that took the new settings. */
  applied: number
  /** Episodes that already have scenes and keep their own settings. */
  kept: number
}

/** When the series cast is copied into an episode (see syncCastIn in src/main/series.ts). */
export interface CastSyncOptions {
  /** Also add series characters the episode does not have, except ones removed from it by hand. */
  addMissing?: boolean
  /** "Ambil pemeran seri": forget what was removed by hand and add the whole series cast. */
  restore?: boolean
}
