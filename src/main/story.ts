import { CAMERA_PRESETS, MOTION_STRENGTHS, TRANSITIONS } from '@shared/motion'
import { LANGUAGES, clipCountFor } from '@shared/models'
import { estimateNarrationMs, needsVisual } from '@shared/script'
import { MAX_EPISODES, MIN_EPISODES, stripEpisodeTag } from '@shared/series'
import { getStyle } from '@shared/styles'
import type { CameraPresetId, Clip, MotionStrength, MusicPrompt, Project, ProjectBundle, SeriesBundle, TransitionId } from '@shared/types'
import { applyVisuals, charactersOf, clipsOf, getBundle, getProject, removeProject, replaceScript, type SceneVisual } from './repo'
import {
  addSeriesCast,
  createEpisode,
  dropUnsheetedCast,
  episodesOf,
  getSeries,
  getSeriesBundle,
  seriesCast,
  setEpisodeSummary,
  setSeriesBible
} from './series'
import { generateJson } from './services/llm'

const CAMERA_IDS = CAMERA_PRESETS.map((c) => c.id)
const STRENGTH_IDS = MOTION_STRENGTHS.map((m) => m.id)
const TRANSITION_IDS = TRANSITIONS.map((t) => t.id)

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function languageOf(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.english ?? 'Indonesian'
}

// ---------- step 1 → 2: the script ----------

/** JSON Schema written to satisfy OpenAI strict mode (every property required, no extra keys) and Gemini. */
const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Short catchy video title in the target language, max 60 characters.' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Short scene title in the target language.' },
          story: {
            type: 'string',
            description: 'What happens in this scene, one or two sentences in the target language, so the writer can check the plot.'
          },
          narration: {
            type: 'string',
            description:
              'Voice-over for this scene in the target language, 10 to 18 spoken words, natural spoken rhythm. May contain one or two English vocal tags in angle brackets.'
          }
        },
        required: ['title', 'story', 'narration']
      }
    }
  },
  required: ['title', 'scenes']
}

/**
 * The script schema for an episode of a series: the same scenes plus a summary that later episodes are written
 * from. A separate schema keeps the request for ordinary projects exactly as it was.
 */
const EPISODE_SCRIPT_SCHEMA = {
  ...SCRIPT_SCHEMA,
  properties: {
    ...SCRIPT_SCHEMA.properties,
    summary: {
      type: 'string',
      description:
        'Two or three sentences in the target language summarizing what happens in this episode and how it ends, for the writers of the next episodes.'
    }
  },
  required: ['title', 'summary', 'scenes']
}

interface ScriptPlan {
  title?: string
  summary?: string
  scenes?: { title?: string; story?: string; narration?: string }[]
}

/**
 * What an episode's script must agree with: the series bible, the fixed cast, and for a serial what happened
 * before and where the next episode picks up. Null for a project that is not an episode.
 */
function episodeBrief(project: Project): { system: string[]; prompt: string[] } | null {
  if (!project.seriesId || project.episodeNo == null) return null
  const s = getSeries(project.seriesId)
  const cast = seriesCast(s.id)
  const episodes = episodesOf(s.id)
  const no = project.episodeNo
  const serial = s.continuity === 'serial'
  const previous = serial ? episodes.filter((e) => e.episodeNo != null && e.episodeNo < no) : []
  const nextHook = serial ? str(s.bible.hooks.find((h) => h.no === no + 1)?.hook) : ''
  const isLast = !episodes.some((e) => (e.episodeNo ?? 0) > no)
  const system = [
    'This video is one episode of a series. Stay true to the series bible, keep every cast member\'s personality and relationships, and call each of them by exactly the name given in the cast list.',
    serial
      ? 'The series is serial: this episode continues the story of the previous episodes. Do not retell them; at most one short recap line at the start. Never contradict what already happened.'
      : 'The series is an anthology: this episode is a complete standalone story in the same world with the same cast. Do not refer to events of other episodes.',
    serial && nextHook ? 'End this episode on a cliffhanger that leads into the next episode\'s hook, instead of a subscribe line.' : '',
    serial && isLast ? 'This is the final episode of the series: resolve the story arc.' : ''
  ].filter(Boolean)
  const prompt = [
    `Series: ${s.title}`,
    s.bible.world.trim() ? `World of the series:\n${s.bible.world.trim()}` : '',
    s.bible.tone.trim() ? `Tone:\n${s.bible.tone.trim()}` : '',
    s.bible.rules.trim() ? `Rules every episode follows:\n${s.bible.rules.trim()}` : '',
    cast.length
      ? `Fixed cast (use these names exactly; anyone else is a minor role or an unnamed extra):\n${cast.map((c) => `- ${c.name}: ${c.description}`).join('\n')}`
      : '',
    `This is episode ${no} of ${episodes.length}.`,
    previous.length
      ? `Previous episodes, in order:\n${previous
          .map((e) => `Episode ${e.episodeNo} "${stripEpisodeTag(e.title)}": ${e.episodeSummary.trim() || `(planned) ${e.synopsis.trim()}`}`)
          .join('\n')}`
      : '',
    nextHook ? `Next episode's hook (lead into it at the end): ${nextHook}` : ''
  ].filter(Boolean)
  return { system, prompt }
}

/** Writes the scene-by-scene script (story and voice-over) that the user reviews before any visuals exist. */
export async function generateScript(projectId: string): Promise<ProjectBundle> {
  const project = getProject(projectId)
  if (!project.synopsis.trim()) throw new Error('Tulis ide cerita atau sinopsis dulu.')
  const lang = languageOf(project.language)
  const count = clipCountFor(project.durationSec)
  const episode = episodeBrief(project)

  const system = [
    'You are a scriptwriter for faceless YouTube storytelling and explainer videos.',
    'You turn an idea into a sequence of short scenes. Each scene has one line of voice-over.',
    'The first scene is a strong hook. The story has a clear beginning, rising tension and a satisfying ending. The last scene can invite viewers to subscribe.',
    'Keep facts accurate for history and science topics, and always call each character by the same name.',
    'The narration is voiced by an expressive text-to-speech model. Where it helps the delivery, add a few English vocal tags in angle brackets inside the narration, such as <short pause>, <long pause>, <chuckles>, <sigh>, <gasp> or <whispers>. Use them sparingly, at most one or two per scene, and never other markup.',
    ...(episode?.system ?? []),
    `Write everything in ${lang}, except the vocal tags, which stay in English.`
  ].join(' ')
  const prompt = [
    ...(episode?.prompt ?? []),
    `${episode ? 'Synopsis of this episode' : 'Idea / synopsis'}:\n${project.synopsis}`,
    `Target video length: about ${project.durationSec} seconds.`,
    `Write exactly ${count} scenes.`
  ].join('\n\n')

  const plan = await generateJson<ScriptPlan>({
    system,
    prompt,
    schema: episode ? EPISODE_SCRIPT_SCHEMA : SCRIPT_SCHEMA,
    name: episode ? 'episode_script' : 'script'
  })
  const scenes = (plan.scenes ?? []).filter((c) => str(c.narration) || str(c.story))
  if (!scenes.length) throw new Error('Model tidak menghasilkan adegan. Coba lagi atau pilih model lain di Pengaturan.')

  replaceScript(
    projectId,
    // An episode keeps its "E01 · " title from the series plan, so the series page and export names stay in order.
    episode ? project.title : str(plan.title) || project.title,
    scenes.map((c, i) => ({
      title: str(c.title) || `Adegan ${i + 1}`,
      story: str(c.story),
      narration: str(c.narration),
      durationMs: estimateNarrationMs(str(c.narration))
    }))
  )
  if (episode) setEpisodeSummary(projectId, str(plan.summary))
  return getBundle(projectId)
}

// ---------- step 2 → 3: visuals for the reviewed script ----------

const VISUAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    world: {
      type: 'string',
      description:
        'One English sentence that fixes the world of the whole video: the place (planet, country, city), the era or year, the technology level and who the people are (for example "humans living in a pressurized colony on Mars around 2150"). Every setting below must agree with it.'
    },
    characters: {
      type: 'array',
      description: 'Every recurring character in the requested scenes, including the existing ones unchanged. Empty if there are none.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          identity: {
            type: 'string',
            description:
              'English, what the character is and looks like WITHOUT clothing: species (write "human" for people), gender, age, height and build, skin tone, face, hair, permanent body traits. No clothing, no art-style words.'
          },
          outfit: {
            type: 'string',
            description:
              'English, the default outfit the character wears in MOST of their scenes, with colors and one signature accessory. Choose what fits most scenes: everyday indoor clothes if most scenes are indoors, a spacesuit or armor only if most scenes need it.'
          }
        },
        required: ['name', 'identity', 'outfit']
      }
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scene: { type: 'integer', description: 'The scene number from the script.' },
          setting: {
            type: 'string',
            description:
              'English, self-contained: where and when, always naming the world explicitly (planet or country, era) even if the story makes it obvious, indoor or outdoor, 3 to 5 concrete props or architecture details that prove the world (for example a window showing the red Martian desert), lighting, time of day, color mood.'
          },
          action: {
            type: 'string',
            description:
              'English: the ONE moment shown. Every visible person with role, age, pose and expression, what they are doing, and the concrete visual evidence of what the narration says. Recurring characters by name plus a short role ("Leo, the colony doctor").'
          },
          wardrobe: {
            type: 'array',
            description: 'Clothing of every person visible in the image, including extras.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', description: 'Character name, or a short label for an extra ("the teenager").' },
                source: {
                  type: 'string',
                  enum: ['reference', 'custom'],
                  description:
                    'reference = the recurring character wears their default outfit as on the reference sheet; custom = a different outfit for this scene (always custom for extras).'
                },
                outfit: { type: 'string', description: 'English. For custom: the full outfit with colors. For reference: a few words naming it.' }
              },
              required: ['name', 'source', 'outfit']
            }
          },
          framing: { type: 'string', description: 'English: shot size, camera angle and composition, e.g. "medium full shot, eye level, the height chart fully visible".' },
          avoid: {
            type: 'string',
            description:
              'English, comma-separated: 3 to 6 things an image model is likely to get wrong for THIS scene, e.g. "Earth landscape, aliens, green skin, spacesuits indoors, helmets".'
          },
          characters: { type: 'array', items: { type: 'string' }, description: 'Names of recurring characters visible in the image.' },
          camera: { type: 'string', enum: CAMERA_IDS, description: 'Camera move over the still image that fits the scene mood.' },
          strength: {
            type: 'string',
            enum: STRENGTH_IDS,
            description: 'How strong the camera move is: halus (subtle, calm or emotional), sedang (medium), kuat (strong, action or big reveals).'
          },
          motion: {
            type: 'string',
            description:
              'English direction for animating this still image into a short AI video: what each character does (gesture, expression, small action), what moves in the environment (wind, fire, water, crowd, dust) and one simple camera move. One or two sentences, no dialogue, no on-screen text, never mention music or sound.'
          },
          transition: {
            type: 'string',
            enum: TRANSITION_IDS,
            description: 'Transition into the next scene: fade for calm or time passing, cut for fast action, slideleft for a change of place, zoomin for a dramatic reveal.'
          }
        },
        required: ['scene', 'setting', 'action', 'wardrobe', 'framing', 'avoid', 'characters', 'camera', 'strength', 'motion', 'transition']
      }
    }
  },
  required: ['world', 'characters', 'scenes']
}

type VisualScene = {
  scene?: number
  setting?: string
  action?: string
  wardrobe?: { name?: string; source?: string; outfit?: string }[]
  framing?: string
  avoid?: string
  characters?: string[]
  camera?: string
  strength?: string
  motion?: string
  transition?: string
}

interface VisualPlan {
  world?: string
  characters?: { name?: string; identity?: string; outfit?: string }[]
  scenes?: VisualScene[]
}

/** A character description for image prompts: body and face first, then the outfit shown on the reference sheet. */
function characterLook(c: { identity?: string; outfit?: string }): string {
  const who = str(c.identity).replace(/\.$/, '')
  const outfit = str(c.outfit).replace(/\.$/, '')
  return [who && `${who}.`, outfit && `Default outfit: ${outfit}.`].filter(Boolean).join(' ')
}

/**
 * The scene's image prompt as labelled lines the user can read and edit in the storyboard. The image
 * generator reads the Wardrobe and Avoid lines (see clipPrompt in generation.ts).
 */
function visualText(a: VisualScene): string {
  const wardrobe = (a.wardrobe ?? [])
    .filter((w) => str(w.name))
    .map((w) =>
      w.source === 'reference'
        ? `${str(w.name)} - default outfit as on the reference sheet${str(w.outfit) ? ` (${str(w.outfit)})` : ''}`
        : `${str(w.name)} - custom for this scene: ${str(w.outfit)}`
    )
  return [
    str(a.setting) && `Setting: ${str(a.setting)}`,
    str(a.action) && `Action: ${str(a.action)}`,
    wardrobe.length > 0 && `Wardrobe: ${wardrobe.join('; ')}`,
    str(a.framing) && `Framing: ${str(a.framing)}`,
    str(a.avoid) && `Avoid: ${str(a.avoid)}`
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Designs one image per scene (plus camera move, transition and AI-video direction) from the reviewed
 * script. "missing" only covers scenes without a plan or whose story changed since; "all" redoes every scene.
 */
export async function generateVisuals(projectId: string, mode: 'missing' | 'all'): Promise<ProjectBundle> {
  const project = getProject(projectId)
  const clips = clipsOf(projectId)
  if (!clips.length) throw new Error('Naskah masih kosong. Tambahkan adegan dulu.')
  const empty = clips.findIndex((c) => !c.story.trim() && !c.narration.trim())
  if (empty >= 0) throw new Error(`Adegan ${empty + 1} masih kosong. Isi alur atau narasinya dulu.`)
  const targets = clips.map((c, i) => ({ clip: c, n: i + 1 })).filter((t) => mode === 'all' || needsVisual(t.clip))
  if (!targets.length) return getBundle(projectId)

  const known = charactersOf(projectId)
  const system = [
    'You are the storyboard artist for a faceless YouTube video. The script is final; you design the pictures.',
    'For each requested scene you describe ONE still image, choose the camera move and its strength over that image, the transition into the next scene, and write how the image would move if it is animated as an AI video.',
    'Rules for the image descriptions, which go to a text-to-image model that never sees the script:',
    '1. Every scene is self-contained. Always name the world (planet or country, era, technology) in the setting, even when the story makes it obvious, and add background details that prove it. Without this the model falls back to present-day Earth.',
    '2. Turn narration into a literal, showable moment. When the narration is a general statement ("after generations, children grow taller"), invent one concrete situation that shows it with visible evidence (a height chart, a comparison with an adult, an old photo), never a symbol or a vague mood.',
    '3. Describe people plainly as humans. Do not use words an image model may read literally or as fantasy, such as Martian, alien, native, creature, mutant, hybrid or "-born", unless they really are not human; describe the difference concretely instead ("a human teenager, about 2.1 m tall, very slender, long limbs, normal human face").',
    '4. Clothing must suit the place and action: no spacesuits or helmets inside a pressurized room, a spacesuit outside on an airless surface, period clothing for history. A recurring character keeps their default outfit (source "reference") unless the scene needs something else; then use "custom" and describe the new outfit in full. Describe the clothing of every extra too.',
    '5. Keep every recurring character visually consistent: reuse the existing characters exactly as given (same name, identity and outfit) and only add characters that are missing. Characters are only people who appear in several scenes; one-off people are extras described inside the scene.',
    '6. No readable text, signs, captions or labels in the image. Vary shot sizes, angles and camera moves across scenes so the video never feels repetitive.',
    'Write "world", "identity", "outfit", "setting", "action", "wardrobe", "framing", "avoid" and "motion" in English.'
  ].join('\n')
  const script = clips
    .map((c, i) => `Scene ${i + 1}: ${c.title}\nStory: ${c.story || '(none)'}\nNarration (${languageOf(project.language)}): ${c.narration || '(none)'}`)
    .join('\n\n')
  const prompt = [
    `Visual style of the video (for your framing choices only, do not repeat it in the descriptions): ${getStyle(project.styleId).name}.`,
    `Frame format: ${project.aspectRatio === '9:16' ? 'vertical 9:16' : 'horizontal 16:9'}.`,
    `Idea of the video: ${project.synopsis}`,
    ...(project.seriesId ? seriesWorldLine(project.seriesId) : []),
    known.length ? `Existing characters (keep them exactly):\n${known.map((c) => `- ${c.name}: ${c.description}`).join('\n')}` : 'There are no existing characters yet.',
    `Full script:\n${script}`,
    `Write visuals for these scenes only: ${targets.map((t) => t.n).join(', ')}.`,
    `Allowed camera values: ${CAMERA_IDS.join(', ')}. Allowed strength values: ${STRENGTH_IDS.join(', ')}. Allowed transition values: ${TRANSITION_IDS.join(', ')}.`
  ].join('\n\n')

  const plan = await generateJson<VisualPlan>({ system, prompt, schema: VISUAL_SCHEMA, name: 'visuals' })
  const answers = (plan.scenes ?? []).filter((s) => str(s.setting) || str(s.action))
  if (!answers.length) throw new Error('Model tidak menghasilkan visual. Coba lagi atau pilih model lain di Pengaturan.')

  // Match answers to scenes by number; anything unnumbered fills the remaining targets in order.
  const byNumber = new Map<number, (typeof answers)[number]>()
  const loose: typeof answers = []
  for (const a of answers) {
    const n = Number(a.scene)
    if (Number.isInteger(n) && targets.some((t) => t.n === n) && !byNumber.has(n)) byNumber.set(n, a)
    else loose.push(a)
  }
  const updates: SceneVisual[] = []
  for (const t of targets) {
    const a = byNumber.get(t.n) ?? loose.shift()
    if (!a) continue
    updates.push(toSceneVisual(t.clip, a))
  }

  applyVisuals(
    projectId,
    (plan.characters ?? []).filter((c) => str(c.name)).map((c) => ({ name: str(c.name), description: characterLook(c) })),
    updates
  )
  return getBundle(projectId)
}

function toSceneVisual(clip: Clip, a: NonNullable<VisualPlan['scenes']>[number]): SceneVisual {
  const camera = str(a.camera) as CameraPresetId
  const strength = str(a.strength) as MotionStrength
  const transition = str(a.transition) as TransitionId
  return {
    clipId: clip.id,
    visualPrompt: visualText(a),
    characterNames: Array.isArray(a.characters) ? a.characters.filter((n): n is string => typeof n === 'string') : [],
    cameraPreset: CAMERA_IDS.includes(camera) ? camera : clip.cameraPreset,
    motionStrength: STRENGTH_IDS.includes(strength) ? strength : clip.motionStrength,
    videoPrompt: str(a.motion),
    transition: TRANSITION_IDS.includes(transition) ? transition : clip.transition
  }
}

// ---------- background music ----------

const MUSIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Short English track title, max 40 characters.' },
    style: {
      type: 'string',
      description:
        'Suno "Style of Music" field: 6 to 12 comma-separated English tags covering genre, mood, main instruments, tempo in BPM and "instrumental". Max 180 characters.'
    },
    exclude: { type: 'string', description: 'Suno "Exclude styles" field: comma-separated English tags to avoid, such as vocals or anything that would fight the voice-over. Max 80 characters.' },
    description: {
      type: 'string',
      description:
        'One English paragraph (50 to 90 words) for any text-to-music AI: genre, mood, instruments, tempo, how the energy moves from the opening to the ending, instrumental with no vocals, sits under a narrator, and the target length.'
    },
    reason: { type: 'string', description: 'One sentence in Indonesian telling the creator why this music suits the video.' }
  },
  required: ['title', 'style', 'exclude', 'description', 'reason']
}

/** A prompt for background music that suits the story, to paste into Suno or another music AI. */
export async function generateMusicPrompt(projectId: string): Promise<MusicPrompt> {
  const b = getBundle(projectId)
  const p = b.project
  const clips = b.clips
  if (!clips.some((c) => c.narration.trim() || c.story.trim()) && !p.synopsis.trim()) throw new Error('Naskah masih kosong.')
  const durationSec = Math.max(10, Math.round(clips.reduce((n, c) => n + c.durationMs, 0) / 1000) || p.durationSec)
  const style = getStyle(p.styleId)
  const system = [
    'You are a music supervisor for faceless YouTube storytelling videos.',
    'You pick background music that supports a voice-over without competing with it: instrumental, no vocals or choirs with words, clear space in the mid range where the voice sits.',
    'Match the setting and era of the story (for example gamelan or kendang colours for an old Javanese kingdom, orchestral for epic history, lo-fi for a calm explainer) and follow its emotional arc from the hook to the ending.',
    'Write the music fields in English, because music AIs understand English best. Never name real artists or copyrighted songs.'
  ].join(' ')
  const scenes = clips
    .map((c, i) => `${i + 1}. ${c.title}: ${c.story || c.narration}`.slice(0, 260))
    .join('\n')
  const prompt = [
    `Video title: ${p.title || '(untitled)'}`,
    `Idea: ${p.synopsis}`,
    `Visual style: ${style.name}.`,
    `Video length: about ${durationSec} seconds.`,
    `Scenes:\n${scenes}`
  ].join('\n\n')
  const r = await generateJson<Partial<MusicPrompt>>({ system, prompt, schema: MUSIC_SCHEMA, name: 'music' })
  const out: MusicPrompt = {
    title: str(r.title),
    style: str(r.style),
    exclude: str(r.exclude),
    description: str(r.description),
    reason: str(r.reason),
    durationSec
  }
  if (!out.style && !out.description) throw new Error('Model tidak menghasilkan prompt musik. Coba lagi.')
  return out
}

// ---------- series: bible, cast and episode outlines ----------

/** The world line for an episode's visual plan, so every episode is drawn in the same place and era. */
function seriesWorldLine(seriesId: string): string[] {
  const world = getSeries(seriesId).bible.world.trim()
  return world ? [`This video is an episode of a series. World of the series (keep every scene in it): ${world}`] : []
}

const CAST_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Character name, the same in every episode.' },
    identity: {
      type: 'string',
      description:
        'English, what the character is and looks like WITHOUT clothing: species (write "human" for people), gender, age, height and build, skin tone, face, hair, permanent body traits. No clothing, no art-style words.'
    },
    outfit: {
      type: 'string',
      description: 'English, the default outfit the character wears in most episodes, with colors and one signature accessory.'
    }
  },
  required: ['name', 'identity', 'outfit']
}

const OUTLINE_PROPS = {
  title: { type: 'string', description: 'Short episode title in the target language, max 50 characters.' },
  synopsis: {
    type: 'string',
    description:
      'What happens in the episode, 3 to 5 sentences in the target language, written as the brief for its script: the situation, the main event and how the episode ends.'
  },
  hook: {
    type: 'string',
    description: 'One sentence in the target language that teases this episode; the episode before it ends by leading into this hook.'
  }
}

const SERIES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Short catchy series title in the target language, max 50 characters.' },
    world: {
      type: 'string',
      description: 'The world of the series in the target language, 2 to 4 sentences: place, era, technology level, who the people are and what makes it special.'
    },
    tone: { type: 'string', description: 'How the series feels and is told, one or two sentences in the target language.' },
    rules: {
      type: 'string',
      description:
        'Rules every episode follows, in the target language: 3 to 6 short lines separated by newlines (facts of the world, what the characters can and cannot do, recurring elements).'
    },
    cast: {
      type: 'array',
      description: 'The recurring main characters who appear across episodes, 1 to 5 of them.',
      items: CAST_ITEM
    },
    episodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { no: { type: 'integer', description: 'Episode number, starting at 1.' }, ...OUTLINE_PROPS },
        required: ['no', 'title', 'synopsis', 'hook']
      }
    }
  },
  required: ['title', 'world', 'tone', 'rules', 'cast', 'episodes']
}

const NEXT_EPISODE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: OUTLINE_PROPS,
  required: ['title', 'synopsis', 'hook']
}

interface SeriesPlan {
  title?: string
  world?: string
  tone?: string
  rules?: string
  cast?: { name?: string; identity?: string; outfit?: string }[]
  episodes?: { no?: number; title?: string; synopsis?: string; hook?: string }[]
}

function continuityRule(serial: boolean): string {
  return serial
    ? 'The series is serial: the episodes tell ONE continuing story arc in order. Every episode moves the arc forward and raises the stakes, and ends on a cliffhanger that leads into the next episode. The last episode resolves the arc.'
    : 'The series is an anthology: every episode is a complete standalone story with its own beginning and ending, set in the same world and starring the same cast. Episodes can be watched in any order and never depend on each other.'
}

/** Series being planned right now; a second request would create a second set of episodes. */
const planning = new Set<string>()

/**
 * Plans a whole series from its premise: bible (world, tone, rules), the recurring cast (no sheets yet) and one
 * outline per episode, then creates an episode project for each outline with the series settings and the cast
 * copied in. Planning again is only allowed while no episode has a script, and replaces those drafts.
 */
export async function generateSeriesPlan(seriesId: string): Promise<SeriesBundle> {
  if (planning.has(seriesId)) throw new Error('Rencana seri ini sedang disusun. Tunggu sebentar.')
  planning.add(seriesId)
  try {
    const s = getSeries(seriesId)
    if (!s.premise.trim()) throw new Error('Tulis premis seri dulu.')
    const existing = episodesOf(seriesId)
    if (existing.some((e) => clipsOf(e.id).length))
      throw new Error('Episode seri ini sudah mulai dibuat, jadi rencananya tidak bisa disusun ulang. Tambahkan episode baru saja.')
    const count = Math.max(MIN_EPISODES, Math.min(MAX_EPISODES, s.episodeCount || MIN_EPISODES))
    const lang = languageOf(s.language)
    const serial = s.continuity === 'serial'

    const system = [
      'You are the showrunner of a faceless YouTube storytelling series. You plan the whole series before any script is written.',
      'You write a series bible (world, tone, rules), a fixed cast of recurring characters, and a short outline for every episode.',
      continuityRule(serial),
      `Each episode is a short video of about ${s.durationSec} seconds (about ${clipCountFor(s.durationSec)} scenes of one voice-over line each), so give every episode one clear plot that fits that length.`,
      'Keep facts accurate for history and science topics, and use the same character names everywhere.',
      `Write the title, world, tone, rules and the episode titles, synopses and hooks in ${lang}. Write the cast "identity" and "outfit" in English.`
    ].join(' ')
    const prompt = [
      `Series premise:\n${s.premise}`,
      `Visual style of the videos (for your choices only; the image model adds it, so never repeat it in the cast descriptions): ${getStyle(s.styleId).name}.`,
      `Write exactly ${count} episodes, numbered 1 to ${count}.`
    ].join('\n\n')

    const plan = await generateJson<SeriesPlan>({ system, prompt, schema: SERIES_SCHEMA, name: 'series_plan' })
    const episodes = (plan.episodes ?? [])
      .filter((e) => str(e.title) || str(e.synopsis))
      .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0))
      .slice(0, count)
      .map((e, i) => ({ no: i + 1, title: str(e.title) || `Episode ${i + 1}`, synopsis: str(e.synopsis) || str(e.title), hook: str(e.hook) }))
    if (!episodes.length) throw new Error('Model tidak menghasilkan episode. Coba lagi atau pilih model lain di Pengaturan.')

    for (const e of existing) removeProject(e.id)
    dropUnsheetedCast(seriesId)
    addSeriesCast(
      seriesId,
      (plan.cast ?? []).filter((c) => str(c.name)).map((c) => ({ name: str(c.name), description: characterLook(c) }))
    )
    setSeriesBible(
      seriesId,
      str(plan.title) || s.title,
      { world: str(plan.world), tone: str(plan.tone), rules: str(plan.rules), hooks: episodes.map((e) => ({ no: e.no, hook: e.hook })) },
      episodes.length
    )
    for (const e of episodes) await createEpisode(seriesId, e)
    return getSeriesBundle(seriesId)
  } finally {
    planning.delete(seriesId)
  }
}

/** Plans one more episode after the last one and creates its project. */
export async function generateNextEpisode(seriesId: string): Promise<SeriesBundle> {
  if (planning.has(seriesId)) throw new Error('Rencana seri ini sedang disusun. Tunggu sebentar.')
  planning.add(seriesId)
  try {
    const s = getSeries(seriesId)
    const episodes = episodesOf(seriesId)
    if (!episodes.length) throw new Error('Susun rencana seri dulu.')
    if (episodes.length >= MAX_EPISODES) throw new Error(`Satu seri paling banyak ${MAX_EPISODES} episode.`)
    const no = Math.max(...episodes.map((e) => e.episodeNo ?? 0)) + 1
    const serial = s.continuity === 'serial'
    const cast = seriesCast(seriesId)

    const system = [
      'You are the showrunner of a faceless YouTube storytelling series. Write the outline of the next episode.',
      continuityRule(serial),
      serial
        ? 'Continue the arc from where the last episode ends. If the arc is already resolved, open a new chapter with the same cast.'
        : 'Give the new episode a fresh standalone story that does not repeat the plots of the earlier episodes.',
      `The episode is a short video of about ${s.durationSec} seconds, so give it one clear plot that fits that length.`,
      `Write the title, synopsis and hook in ${languageOf(s.language)}.`
    ].join(' ')
    const prompt = [
      `Series: ${s.title}`,
      `Premise:\n${s.premise}`,
      s.bible.world.trim() ? `World:\n${s.bible.world.trim()}` : '',
      s.bible.tone.trim() ? `Tone:\n${s.bible.tone.trim()}` : '',
      s.bible.rules.trim() ? `Rules:\n${s.bible.rules.trim()}` : '',
      cast.length ? `Cast:\n${cast.map((c) => `- ${c.name}: ${c.description}`).join('\n')}` : '',
      `Episodes so far:\n${episodes
        .map((e) => `Episode ${e.episodeNo} "${stripEpisodeTag(e.title)}": ${e.episodeSummary.trim() || e.synopsis.trim()}`)
        .join('\n')}`,
      `Write episode ${no}.`
    ]
      .filter(Boolean)
      .join('\n\n')

    const r = await generateJson<{ title?: string; synopsis?: string; hook?: string }>({ system, prompt, schema: NEXT_EPISODE_SCHEMA, name: 'next_episode' })
    const title = str(r.title) || `Episode ${no}`
    const synopsis = str(r.synopsis)
    if (!synopsis) throw new Error('Model tidak menghasilkan episode. Coba lagi atau pilih model lain di Pengaturan.')
    setSeriesBible(
      seriesId,
      s.title,
      { ...s.bible, hooks: [...s.bible.hooks.filter((h) => h.no !== no), { no, hook: str(r.hook) }] },
      episodes.length + 1
    )
    await createEpisode(seriesId, { no, title, synopsis })
    return getSeriesBundle(seriesId)
  } finally {
    planning.delete(seriesId)
  }
}
