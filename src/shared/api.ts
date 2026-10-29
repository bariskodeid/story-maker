import type {
  ApiProvider,
  AspectRatio,
  AppSettings,
  Asset,
  CastSyncOptions,
  CharacterPatchEvent,
  ClipPatchEvent,
  CreditEstimate,
  EndpointProvider,
  WhisperStatus,
  WordTiming,
  ExportOptions,
  Job,
  KeyStatus,
  KeyTestResult,
  ModelList,
  ModelSource,
  MusicPrompt,
  NewProjectInput,
  ProjectBundle,
  ProjectSnapshot,
  ProjectSummary,
  NewSeriesInput,
  Series,
  SeriesBundle,
  SeriesCharacter,
  SeriesPatch,
  SeriesSettingsPatch,
  SeriesSettingsResult,
  SeriesSummary,
  TtsProvider,
  VoiceOption
} from './types'
import type { RenderEngineStatus, RenderTestResult } from './render'

/** The typed surface the preload script exposes as `window.api`. */
export interface StudioApi {
  projects: {
    list(): Promise<ProjectSummary[]>
    create(input: NewProjectInput): Promise<ProjectBundle>
    get(id: string): Promise<ProjectBundle>
    save(snapshot: ProjectSnapshot): Promise<{ updatedAt: number }>
    remove(id: string): Promise<void>
    duplicate(id: string): Promise<ProjectSummary>
  }
  series: {
    list(): Promise<SeriesSummary[]>
    create(input: NewSeriesInput): Promise<Series>
    get(id: string): Promise<SeriesBundle>
    /** Title, premise and the editable bible (world, tone, rules). */
    update(id: string, patch: SeriesPatch): Promise<Series>
    /** Settings new episodes start with; also given to episodes without scenes, never to the others. */
    updateSettings(id: string, patch: SeriesSettingsPatch): Promise<SeriesSettingsResult>
    /** Deletes the series with all its episode projects and files. */
    remove(id: string): Promise<void>
    /** LLM: bible, cast and one outline per episode, then an episode project for each (replaces unstarted drafts). */
    plan(id: string): Promise<SeriesBundle>
    /** LLM: plans one more episode after the last one. */
    addEpisode(id: string): Promise<SeriesBundle>
    updateEpisode(projectId: string, patch: { title?: string; synopsis?: string; summary?: string }): Promise<void>
    /** Deletes one episode; later episodes move up a number. */
    removeEpisode(projectId: string): Promise<void>
    updateCharacter(id: string, patch: { name?: string; description?: string }): Promise<SeriesCharacter>
    removeCharacter(id: string): Promise<void>
    /**
     * Copies series sheets into an episode's characters (and with `addMissing`/`restore` the series characters it
     * lacks, never ones removed from it by hand unless restoring) and returns its fresh bundle.
     */
    syncCastIn(projectId: string, opts?: CastSyncOptions): Promise<ProjectBundle>
    /** Copies an episode's new characters and sheets back to its series; null for a project outside a series. */
    syncCastOut(projectId: string): Promise<SeriesBundle | null>
  }
  story: {
    /** Idea → scene-by-scene script (story and voice-over). */
    script(projectId: string): Promise<ProjectBundle>
    /** Script → one image plan per scene; "missing" skips scenes whose plan still matches their story. */
    visuals(projectId: string, mode: 'missing' | 'all'): Promise<ProjectBundle>
    /** A background-music prompt that fits the finished script, for use in Suno or another music AI. */
    musicPrompt(projectId: string): Promise<MusicPrompt>
  }
  explainer: {
    /** Idea + template → designed scenes with narration (replaces the scenes). */
    scenes(projectId: string): Promise<ProjectBundle>
  }
  generate: {
    clipImage(clipId: string): Promise<Job>
    clipVideo(clipId: string): Promise<Job>
    clipTts(clipId: string): Promise<Job>
    characterSheet(characterId: string): Promise<Job>
    missingImages(projectId: string): Promise<Job[]>
    /** An AI video for every clip that has an image but no video yet. */
    missingVideos(projectId: string): Promise<Job[]>
    missingTts(projectId: string): Promise<Job[]>
    /** Voices scenes in one continuous take and cuts it per scene: those without a voice, or all of them. */
    narration(projectId: string, mode: 'missing' | 'all'): Promise<Job>
    /** Re-times caption words of voiced scenes against the audio with the local Whisper model. */
    syncCaptions(projectId: string, mode?: 'stale' | 'all'): Promise<Job>
    cancel(jobId: string): Promise<void>
    /** Credits for one image, or one video of about `seconds`, with this model. Null without a working key. */
    estimate(kind: 'image' | 'video', modelId: string, aspect: AspectRatio, seconds?: number, resolution?: string | null): Promise<CreditEstimate | null>
    /** Image models of the providers connected in 9Router, cached like other model lists. */
    nineRouterModels(refresh?: boolean): Promise<ModelList>
  }
  clips: {
    /** Splits a clip at `atMs` into two clips (picture, voice and narration divided at the nearest pause). */
    split(clipId: string, atMs: number): Promise<ProjectBundle>
    /** Takes the voice off a clip. */
    detachVoice(clipId: string): Promise<void>
    /** Takes the picture off a scene (the file stays as an earlier version). */
    clearImage(clipId: string): Promise<void>
  }
  assets: {
    setActive(clipId: string, assetId: string): Promise<void>
    /** Caption words of a voice clip, after the text was fixed by hand. */
    setWords(assetId: string, words: WordTiming[]): Promise<Asset>
    pickMusic(projectId: string): Promise<Asset | null>
    /** A logo or watermark image for an overlay. */
    pickImage(projectId: string): Promise<Asset | null>
    /** A screenshot or picture for an explainer scene; it becomes the scene's image. */
    pickSceneImage(clipId: string): Promise<Asset | null>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    keys(): Promise<KeyStatus[]>
    setKey(provider: ApiProvider, key: string): Promise<KeyTestResult>
    /** Saves an OpenAI-compatible endpoint; the key is optional for local servers. */
    /** Saves the base URL (and optional key) of an endpoint provider, then tests it. */
    setCustom(baseUrl: string, key: string, provider?: EndpointProvider): Promise<KeyTestResult>
    clearKey(provider: ApiProvider): Promise<void>
    /** The full stored key, only for the "show key" button. */
    revealKey(provider: ApiProvider): Promise<string | null>
    testKey(provider: ApiProvider): Promise<KeyTestResult>
    /** `refresh` skips the cached list (9Router). */
    voices(provider: TtsProvider, refresh?: boolean): Promise<VoiceOption[]>
  }
  models: {
    /** Live model list from the provider. Served from cache unless `refresh` is set or the cache is stale. */
    list(source: ModelSource, refresh?: boolean): Promise<ModelList>
  }
  exporter: {
    start(projectId: string, options: ExportOptions): Promise<Job>
    defaultFolder(): Promise<string>
    pickFolder(): Promise<string | null>
    reveal(path: string): Promise<void>
  }
  app: {
    openExternal(url: string): Promise<void>
    copyText(text: string): Promise<void>
    version(): Promise<string>
  }
  whisper: {
    status(): Promise<WhisperStatus>
    download(): Promise<void>
    cancel(): Promise<void>
    remove(): Promise<void>
    openFolder(): Promise<void>
  }
  /** Chrome Headless Shell, which Remotion renders explainer videos with. */
  renderEngine: {
    status(): Promise<RenderEngineStatus>
    /** Starts the download in the background; progress comes through `on.renderEngine`. */
    install(): Promise<void>
    /** Stops a running download (also one an export started); resolves once its partial files are removed. */
    cancel(): Promise<void>
    remove(): Promise<void>
    /** Renders a two-second test video with the whole engine. */
    test(): Promise<RenderTestResult>
  }
  on: {
    whisper(cb: (status: WhisperStatus) => void): () => void
    job(cb: (job: Job) => void): () => void
    clip(cb: (e: ClipPatchEvent) => void): () => void
    character(cb: (e: CharacterPatchEvent) => void): () => void
    asset(cb: (asset: Asset) => void): () => void
    renderEngine(cb: (status: RenderEngineStatus) => void): () => void
  }
}

export const EVENTS = {
  job: 'event:job',
  clip: 'event:clip',
  character: 'event:character',
  asset: 'event:asset',
  whisper: 'event:whisper',
  renderEngine: 'event:renderEngine'
} as const
