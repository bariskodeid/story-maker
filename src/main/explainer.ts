import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { timelineChunks } from '@shared/captions'
import {
  buildExplainerInput,
  explainerSceneCount,
  getTemplate,
  normalizeScene,
  SCENE_LEAD_MS,
  SCENE_TAIL_MS,
  SCENE_TYPES,
  sceneShowsImage,
  type ExplainerScene
} from '@shared/explainer'
import { LANGUAGES } from '@shared/models'
import { estimateNarrationMs } from '@shared/script'
import type { Asset, ExportOptions, Job, ProjectBundle } from '@shared/types'
import { emit } from './events'
import { buildSrt, runFfmpeg, startExport } from './exporter'
import { runJob, type TaskCtx } from './jobs'
import { assetAbsPath, dataDir } from './paths'
import { renderVideo, startAssetServer } from './remotion'
import { getBundle, getClip, getProject, insertAsset, insertJob, patchClip, replaceScenes, touchProject } from './repo'
import { probeSize } from './services/audio'
import { generateJson } from './services/llm'

// ---------- writing the scenes ----------

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Strict-mode JSON Schema (OpenAI and Gemini): one flat scene object, every field required, "" when unused. */
function scenesSchema(types: string[]): object {
  const s = (description: string): object => ({ type: 'string', description })
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: s('Short catchy video title in the target language, max 60 characters.'),
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: types, description: 'Scene layout.' },
            label: s('Small line above the heading (topic, rank like "#3"), or "".'),
            heading: s('Main on-screen text, short. For a quote scene: the quote.'),
            body: s('Second on-screen line, short, or "".'),
            value: s('Step/tip number or the big figure of a fact, or "".'),
            icon: s('One emoji for tip scenes, or "".'),
            codeKind: { type: 'string', enum: ['none', 'code', 'terminal'], description: 'Whether the scene shows code or a terminal command.' },
            codeLanguage: s('Language of the code, e.g. "bash", "python", or "".'),
            code: s('Exact code or commands, newline separated, or "".'),
            author: s('Quote author or fact source, or "".'),
            leftTitle: s('Compare scenes: title of the left column. A-vs-B videos: the name of option A. Else "".'),
            left: { type: 'array', items: { type: 'string' }, description: 'Left column / option A items / pros / key points, else [].' },
            rightTitle: s('Compare scenes: title of the right column. A-vs-B videos: the name of option B. Else "".'),
            right: { type: 'array', items: { type: 'string' }, description: 'Right column / option B items / cons, else [].' },
            leftValue: s('Versus scenes: short figure or rating of option A, else "".'),
            rightValue: s('Versus scenes: short figure or rating of option B, else "".'),
            side: { type: 'string', enum: ['none', 'left', 'right', 'both'], description: 'Versus/verdict: the winner. Pros/cons: the option it is about. Else "none".' },
            imageMode: { type: 'string', enum: ['none', 'upload', 'ai'], description: 'Picture for this scene.' },
            imagePrompt: s('English description of the AI picture when imageMode is "ai", else "".'),
            narration: s('Voice-over for this scene in the target language, 12 to 24 spoken words.')
          },
          required: [
            'type',
            'label',
            'heading',
            'body',
            'value',
            'icon',
            'codeKind',
            'codeLanguage',
            'code',
            'author',
            'leftTitle',
            'left',
            'rightTitle',
            'right',
            'leftValue',
            'rightValue',
            'side',
            'imageMode',
            'imagePrompt',
            'narration'
          ]
        }
      }
    },
    required: ['title', 'scenes']
  }
}

interface ScenesPlan {
  title?: string
  scenes?: (Record<string, unknown> & { narration?: string })[]
}

/** Idea + template → designed scenes with narration, replacing the project's scenes. */
export async function generateExplainerScenes(projectId: string): Promise<ProjectBundle> {
  const project = getProject(projectId)
  if (project.kind !== 'explainer') throw new Error('Proyek ini bukan video penjelasan.')
  if (!project.synopsis.trim()) throw new Error('Tulis topik atau ide videonya dulu.')
  const template = getTemplate(project.templateId)
  const lang = LANGUAGES.find((l) => l.code === project.language)?.english ?? 'Indonesian'
  const count = explainerSceneCount(project.durationSec)
  const typeNames = SCENE_TYPES.filter((t) => template.sceneTypes.includes(t.id))
    .map((t) => t.id)
    .join(', ')

  const system = [
    'You write short faceless explainer videos for YouTube and Shorts. Each scene is one designed screen: a few words on screen and one line of voice-over.',
    'On-screen text is short and scannable; the narration explains it in natural spoken language and never just reads the screen word for word. Never read code symbol by symbol; describe what it does.',
    'Be accurate. For tutorials, commands and code must be correct and runnable.',
    `Write all on-screen text and narration in ${lang}. imagePrompt is always in English. Do not use markdown, hashtags or vocal tags.`,
    `Template "${template.name}". Allowed scene types: ${typeNames}.`,
    template.guidance,
    // News needs today's date to tell recent from old; the model must not guess it.
    ...(template.id === 'news' ? [`Today is ${new Date().toISOString().slice(0, 10)}. Write dates the way ${lang} speakers write them.`] : [])
  ].join('\n\n')
  const prompt = [
    `Topic / idea:\n${project.synopsis}`,
    `Target video length: about ${project.durationSec} seconds.`,
    `Write ${count} scenes (one more or fewer is fine if the content needs it).`
  ].join('\n\n')

  const reply = await generateJson<ScenesPlan | ScenesPlan['scenes']>({ system, prompt, schema: scenesSchema(template.sceneTypes), name: 'explainer_scenes' })
  // Some models behind 9Router answer with the bare scene list instead of {title, scenes}.
  const plan: ScenesPlan = Array.isArray(reply) ? { scenes: reply } : (reply ?? {})
  const raw = (Array.isArray(plan.scenes) ? plan.scenes : []).filter((s) => s && (str(s.heading) || str(s.narration)))
  if (!raw.length) throw new Error('Model tidak menghasilkan adegan. Coba lagi atau pilih model lain di Pengaturan.')

  let stepNo = 0
  let tipNo = 0
  const rows = raw.map((r) => {
    const scene: ExplainerScene = normalizeScene(r, template.sceneTypes, template.mainType)
    // Numbers on screen must count up even when the model skips or repeats one.
    if (scene.type === 'step') scene.value = String(++stepNo)
    if (scene.type === 'tip' && template.id === 'tips') scene.value = String(++tipNo)
    // Layouts without a picture (compare, outro, the A-vs-B title) would make an AI image nobody sees.
    if (!sceneShowsImage(template.id, scene.type)) scene.imageMode = 'none'
    if (scene.imageMode === 'ai' && !scene.imagePrompt) scene.imagePrompt = [scene.heading, scene.body].filter(Boolean).join('. ')
    if (scene.imageMode !== 'ai') scene.imagePrompt = ''
    const narration = str(r.narration) || [scene.heading, scene.body].filter(Boolean).join('. ')
    return { scene, narration, durationMs: estimateNarrationMs(narration) + SCENE_LEAD_MS + SCENE_TAIL_MS }
  })
  const title = str(plan.title) || rows.find((r) => r.scene.type === 'title')?.scene.heading || project.title
  replaceScenes(projectId, title.slice(0, 80), rows)
  return getBundle(projectId)
}

// ---------- pictures added by the user ----------

/** A screenshot or picture for one scene, copied into the project; it becomes the scene's image. */
export async function pickSceneImage(clipId: string): Promise<Asset | null> {
  const clip = getClip(clipId)
  const win = BrowserWindow.getFocusedWindow()
  const res = await dialog.showOpenDialog(win!, {
    title: 'Pilih screenshot atau gambar untuk adegan ini',
    filters: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths[0]) return null
  return addSceneImage(clip.id, res.filePaths[0])
}

/** Copies an image file into the project as the scene's picture (also used by the development harness). */
export async function addSceneImage(clipId: string, src: string): Promise<Asset> {
  const clip = getClip(clipId)
  const rel = `images/${randomUUID()}${extname(src).toLowerCase()}`
  const abs = assetAbsPath(clip.projectId, rel)
  mkdirSync(dirname(abs), { recursive: true })
  copyFileSync(src, abs)
  const size = await probeSize(abs).catch(() => null)
  if (!size) {
    rmSync(abs, { force: true })
    throw new Error('Gambar tidak bisa dibaca. Pakai file PNG, JPG, atau WebP.')
  }
  const asset = insertAsset({
    projectId: clip.projectId,
    clipId,
    kind: 'image',
    provider: 'local',
    prompt: basename(src),
    localPath: rel,
    width: size.width,
    height: size.height
  })
  emit.asset(asset)
  patchClip(clipId, { imageAssetId: asset.id })
  emit.clip({ clipId, patch: { imageAssetId: asset.id } })
  touchProject(clip.projectId)
  return asset
}

/** Takes the picture off a scene; the file stays as an earlier version. */
export function clearClipImage(clipId: string): void {
  getClip(clipId)
  patchClip(clipId, { imageAssetId: null })
  emit.clip({ clipId, patch: { imageAssetId: null } })
}

// ---------- export ----------

const SCALE: Record<ExportOptions['resolution'], number> = { 720: 2 / 3, 1080: 1, 2160: 2 }

async function renderExplainer(ctx: TaskCtx, projectId: string, opts: ExportOptions): Promise<string> {
  const bundle = getBundle(projectId)
  if (!bundle.clips.length) throw new Error('Proyek belum punya adegan')
  const assets = Object.fromEntries(bundle.assets.map((a) => [a.id, a]))
  const tmp = join(dataDir(), 'tmp', `explainer-${ctx.jobId}`)
  mkdirSync(tmp, { recursive: true })
  const server = await startAssetServer(projectId)
  try {
    const input = buildExplainerInput({
      project: bundle.project,
      clips: bundle.clips,
      assets,
      assetBase: server.assetBase,
      fontBase: server.fontBase,
      fps: opts.fps,
      captions: opts.burnCaptions && bundle.project.theme.captions !== false,
      duckMusic: opts.duckMusic
    })
    const raw = join(tmp, 'render.mp4')
    await renderVideo({
      compositionId: 'Explainer',
      inputProps: input,
      outputPath: raw,
      scale: SCALE[opts.resolution] ?? 1,
      signal: ctx.signal,
      onProgress: (p, message) => ctx.progress(p, message)
    })

    const folder = opts.folder
    mkdirSync(folder, { recursive: true })
    const base = (opts.fileName.trim() || 'video').replace(/[<>:"/\\|?*]+/g, '-').replace(/\.mp4$/i, '')
    let outPath = join(folder, `${base}.mp4`)
    for (let n = 2; existsSync(outPath); n++) outPath = join(folder, `${base}-${n}.mp4`)

    // Same loudness rule as story exports: the picture is copied, only the sound is normalized.
    const total = input.totalFrames / input.fps
    ctx.progress(0.92, opts.normalizeAudio ? 'Menyamakan volume suara' : 'Menyimpan video')
    await runFfmpeg(
      [
        '-i',
        raw,
        '-map',
        '0:v',
        '-map',
        '0:a',
        '-c:v',
        'copy',
        '-af',
        `${opts.normalizeAudio ? 'loudnorm=I=-14:LRA=11:TP=-1.5,' : ''}aresample=48000`,
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-movflags',
        '+faststart',
        '-t',
        total.toFixed(3),
        outPath
      ],
      tmp,
      ctx.signal,
      total,
      (f) => ctx.progress(0.92 + 0.07 * f, opts.normalizeAudio ? 'Menyamakan volume suara' : 'Menyimpan video')
    )
    if (opts.writeSrt) {
      const chunks = timelineChunks(input.scenes.map((s) => ({ start: s.from / input.fps, words: s.words })))
      if (chunks.length) writeFileSync(outPath.replace(/\.mp4$/i, '.srt'), buildSrt(chunks), 'utf8')
    }
    return outPath
  } finally {
    await server.close()
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** Starts the export that fits the project: FFmpeg for stories, Remotion for explainers. */
export function exportProject(projectId: string, opts: ExportOptions): Job {
  return getProject(projectId).kind === 'explainer' ? startExplainerExport(projectId, opts) : startExport(projectId, opts)
}

/** Renders an explainer project to MP4 with Remotion, as an export job (same queue and events as story exports). */
export function startExplainerExport(projectId: string, opts: ExportOptions): Job {
  const job = insertJob({ projectId, kind: 'export', provider: 'remotion', payload: { ...opts } })
  emit.job(job)
  return runJob(job, 'export', async (ctx) => {
    const out = await renderExplainer(ctx, projectId, opts)
    touchProject(projectId, { status: 'exported' })
    return { message: out }
  })
}
