import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENTS, type StudioApi } from '../shared/api'

const call =
  <T>(channel: string) =>
  (...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args)

const listen =
  <T>(channel: string) =>
  (cb: (payload: T) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }

const api: StudioApi = {
  projects: {
    list: call('projects:list'),
    create: call('projects:create'),
    get: call('projects:get'),
    save: call('projects:save'),
    remove: call('projects:remove'),
    duplicate: call('projects:duplicate')
  },
  series: {
    list: call('series:list'),
    create: call('series:create'),
    get: call('series:get'),
    update: call('series:update'),
    updateSettings: call('series:updateSettings'),
    remove: call('series:remove'),
    plan: call('series:plan'),
    addEpisode: call('series:addEpisode'),
    updateEpisode: call('series:updateEpisode'),
    removeEpisode: call('series:removeEpisode'),
    updateCharacter: call('series:updateCharacter'),
    removeCharacter: call('series:removeCharacter'),
    syncCastIn: call('series:syncCastIn'),
    syncCastOut: call('series:syncCastOut')
  },
  story: {
    script: call('story:script'),
    visuals: call('story:visuals'),
    musicPrompt: call('story:musicPrompt')
  },
  explainer: {
    scenes: call('explainer:scenes')
  },
  generate: {
    clipImage: call('generate:clipImage'),
    clipVideo: call('generate:clipVideo'),
    clipTts: call('generate:clipTts'),
    characterSheet: call('generate:characterSheet'),
    missingImages: call('generate:missingImages'),
    missingVideos: call('generate:missingVideos'),
    missingTts: call('generate:missingTts'),
    narration: call('generate:narration'),
    syncCaptions: call('generate:syncCaptions'),
    cancel: call('generate:cancel'),
    estimate: call('generate:estimate'),
    nineRouterModels: call('generate:nineRouterModels'),
    geminiImageModels: call('generate:geminiImageModels')
  },
  clips: {
    split: call('clips:split'),
    detachVoice: call('clips:detachVoice'),
    clearImage: call('clips:clearImage')
  },
  assets: {
    setActive: call('assets:setActive'),
    setWords: call('assets:setWords'),
    pickMusic: call('assets:pickMusic'),
    pickImage: call('assets:pickImage'),
    pickSceneImage: call('assets:pickSceneImage')
  },
  settings: {
    get: call('settings:get'),
    set: call('settings:set'),
    keys: call('settings:keys'),
    setKey: call('settings:setKey'),
    setCustom: call('settings:setCustom'),
    clearKey: call('settings:clearKey'),
    revealKey: call('settings:revealKey'),
    testKey: call('settings:testKey'),
    voices: call('settings:voices')
  },
  models: {
    list: call('models:list')
  },
  exporter: {
    start: call('export:start'),
    defaultFolder: call('export:defaultFolder'),
    pickFolder: call('export:pickFolder'),
    reveal: call('export:reveal')
  },
  app: {
    openExternal: call('app:openExternal'),
    copyText: call('app:copyText'),
    version: call('app:version')
  },
  whisper: {
    status: call('whisper:status'),
    download: call('whisper:download'),
    cancel: call('whisper:cancel'),
    remove: call('whisper:remove'),
    openFolder: call('whisper:openFolder')
  },
  renderEngine: {
    status: call('renderEngine:status'),
    install: call('renderEngine:install'),
    cancel: call('renderEngine:cancel'),
    remove: call('renderEngine:remove'),
    test: call('renderEngine:test')
  },
  on: {
    whisper: listen(EVENTS.whisper),
    job: listen(EVENTS.job),
    clip: listen(EVENTS.clip),
    character: listen(EVENTS.character),
    asset: listen(EVENTS.asset),
    renderEngine: listen(EVENTS.renderEngine)
  }
}

contextBridge.exposeInMainWorld('api', api)
