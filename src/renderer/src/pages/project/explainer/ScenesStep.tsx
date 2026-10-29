import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Image as ImageIcon, ImagePlus, Mic, MoreHorizontal, Plus, Sparkles, Trash2, Upload, Wand2, X } from 'lucide-react'
import {
  getTemplate,
  sceneHas,
  sceneTypeName,
  type CodeKind,
  type ExplainerScene,
  type SceneHighlight,
  type SceneImageMode,
  type SceneType,
  wantsAiImage
} from '@shared/explainer'
import { wordCount } from '@shared/script'
import type { Clip } from '@shared/types'
import { AutoTextarea } from '../../../components/AutoTextarea'
import { ExplainerStill, settledFrame, useExplainerInput } from '../../../components/ExplainerPreview'
import { Select } from '../../../components/Select'
import { Badge, Button, Field, IconButton, Menu, Progress, Segmented, confirmDialog, cx, inputCls } from '../../../components/ui'
import { errorText } from '../../../lib/format'
import { useNarration } from '../../../lib/useNarration'
import { useApp } from '../../../store/app'
import { isRunning, jobFor, useProject } from '../../../store/project'

const VALUE_LABEL: Partial<Record<SceneType, string>> = { step: 'Nomor langkah', tip: 'Nomor', fact: 'Angka besar' }
const AUTHOR_LABEL: Partial<Record<SceneType, string>> = { quote: 'Tokoh', fact: 'Sumber' }
const HEADING_LABEL: Partial<Record<SceneType, string>> = { quote: 'Kutipan', compare: 'Judul perbandingan' }

/** Whether a scene's voice matches its narration text. */
function voiceState(clip: Clip, assets: ReturnType<typeof useProject.getState>['assets']): 'none' | 'stale' | 'ok' {
  if (!clip.narration.trim()) return 'none'
  const a = clip.audioAssetId ? assets[clip.audioAssetId] : null
  if (!a) return 'none'
  return (a.prompt ?? '').trim() === clip.narration.trim() ? 'ok' : 'stale'
}

/** Draws a highlight box on a screenshot by dragging; the video outlines that part and dims the rest. */
function HighlightEditor({ src, value, onChange }: { src: string; value: SceneHighlight | null; onChange: (h: SceneHighlight | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<SceneHighlight | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const at = (e: ReactPointerEvent): { x: number; y: number } => {
    const r = box.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const shown = draft ?? value
  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={box}
        className="relative cursor-crosshair select-none overflow-hidden rounded-lg border border-line-2"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = at(e)
          setDraft({ ...start.current, w: 0, h: 0 })
        }}
        onPointerMove={(e) => {
          if (!start.current) return
          const p = at(e)
          const s = start.current
          setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
        }}
        onPointerUp={() => {
          start.current = null
          if (draft && draft.w > 0.02 && draft.h > 0.02) onChange(draft)
          setDraft(null)
        }}
      >
        <img src={src} alt="" draggable={false} className="block w-full" />
        {shown && (
          <span
            className="pointer-events-none absolute rounded-md border-[3px] border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-[12.5px] text-muted">
        <span>Seret di gambar untuk menandai bagian yang penting.</span>
        {value && (
          <button type="button" className="font-semibold text-accent-dark hover:underline" onClick={() => onChange(null)}>
            Hapus sorotan
          </button>
        )}
      </div>
    </div>
  )
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

/** The picture of a scene: none, a screenshot the user adds, or an AI image from its prompt. */
function ImagePanel({ clip, scene, onScene }: { clip: Clip; scene: ExplainerScene; onScene: (p: Partial<ExplainerScene>) => void }) {
  const { assets, jobs, flush } = useProject()
  const { toast } = useApp()
  const image = clip.imageAssetId ? assets[clip.imageAssetId] : null
  const job = jobFor(jobs, 'image', { clipId: clip.id })
  const running = isRunning(job)

  const upload = async (): Promise<void> => {
    try {
      await window.api.assets.pickSceneImage(clip.id)
    } catch (e) {
      toast('error', errorText(e))
    }
  }
  const makeAi = async (): Promise<void> => {
    if (!scene.imagePrompt.trim() && !scene.heading.trim()) return toast('error', 'Tulis dulu gambar apa yang kamu mau.')
    try {
      await flush()
      useProject.getState().upsertJob(await window.api.generate.clipImage(clip.id))
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <Section
      title="Gambar"
      right={
        <Segmented<SceneImageMode>
          size="sm"
          value={scene.imageMode}
          onChange={(m) => onScene({ imageMode: m })}
          options={[
            { id: 'none', label: 'Tanpa' },
            { id: 'upload', label: 'Screenshot' },
            { id: 'ai', label: 'Gambar AI' }
          ]}
        />
      }
    >
      {scene.imageMode === 'none' && (
        <p className="text-[13px] text-muted">Adegan ini tampil dengan teks dan desain template saja{image ? '. Gambar lama tidak ditampilkan.' : '.'}</p>
      )}
      {scene.imageMode === 'upload' && (
        <>
          {scene.codeKind !== 'none' && scene.code.trim() && (
            <p className="text-[13px] text-sun-ink">Screenshot tampil menggantikan kode adegan ini di video.</p>
          )}
          {image ? (
            <HighlightEditor src={image.url} value={scene.highlight} onChange={(h) => onScene({ highlight: h })} />
          ) : (
            <p className="text-[13px] text-ink-2">Tambahkan screenshot layarmu (PNG, JPG, atau WebP). Gambar ditampilkan utuh di jendela browser.</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" icon={<Upload className="size-4" />} onClick={() => void upload()}>
              {image ? 'Ganti gambar' : 'Pilih gambar'}
            </Button>
            {image && (
              <Button size="sm" icon={<X className="size-4" />} onClick={() => void window.api.clips.clearImage(clip.id)}>
                Lepas
              </Button>
            )}
          </div>
        </>
      )}
      {scene.imageMode === 'ai' && (
        <>
          {image && <img src={image.url} alt="" className="w-full rounded-lg border border-line-2" />}
          <Field label="Gambar yang diinginkan" hint="Ditulis dalam bahasa Inggris lebih akurat. Gambar AI tidak memuat teks.">
            <AutoTextarea
              minRows={2}
              value={scene.imagePrompt}
              onChange={(e) => onScene({ imagePrompt: e.target.value })}
              placeholder="A cozy desk by a sunny window with a small plant…"
              className={cx(inputCls, 'py-2.5 text-sm')}
            />
          </Field>
          {running ? (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-ink-2">{job?.message ?? 'Membuat gambar…'}</span>
              <Progress value={job?.progress ?? 0} />
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="accent" icon={<Wand2 className="size-4" />} onClick={() => void makeAi()}>
                {image ? 'Buat ulang' : 'Buat gambar AI'}
              </Button>
              {image && (
                <Button size="sm" icon={<X className="size-4" />} onClick={() => void window.api.clips.clearImage(clip.id)}>
                  Lepas
                </Button>
              )}
            </div>
          )}
          {job?.status === 'failed' && job.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad-ink">{job.error}</p>}
        </>
      )}
    </Section>
  )
}

function SceneForm({ clip, scene, allowed }: { clip: Clip; scene: ExplainerScene; allowed: SceneType[] }) {
  const { updateClip, assets } = useProject()
  const set = (p: Partial<ExplainerScene>): void => {
    const next = { ...scene, ...p }
    updateClip(clip.id, { scene: next, ...(p.heading !== undefined ? { title: p.heading.slice(0, 80) } : {}) })
  }
  const t = scene.type
  const voice = voiceState(clip, assets)
  const text = (key: 'label' | 'value' | 'icon' | 'author' | 'codeLanguage' | 'leftTitle' | 'rightTitle', label: string, placeholder = '', mono = false) => (
    <Field label={label}>
      <input value={scene[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder={placeholder} className={cx(inputCls, 'h-10 text-sm', mono && 'font-mono')} />
    </Field>
  )
  const list = (key: 'left' | 'right', label: string) => (
    <Field label={label} hint="Satu poin per baris">
      <AutoTextarea minRows={2} value={scene[key].join('\n')} onChange={(e) => set({ [key]: e.target.value.split('\n') })} className={cx(inputCls, 'py-2 text-sm')} />
    </Field>
  )
  return (
    <div className="flex flex-col gap-3.5">
      <Field label="Jenis adegan">
        <Select<SceneType> label="Jenis adegan" value={t} onChange={(v) => set({ type: v })} options={allowed.map((x) => ({ value: x, label: sceneTypeName(x) }))} />
      </Field>
      {(sceneHas(t, 'value') || sceneHas(t, 'icon')) && (
        <div className="grid grid-cols-2 gap-3">
          {sceneHas(t, 'value') && text('value', VALUE_LABEL[t] ?? 'Angka', t === 'fact' ? '73%' : '1')}
          {sceneHas(t, 'icon') && text('icon', 'Emoji', '💡')}
        </div>
      )}
      {sceneHas(t, 'label') && text('label', t === 'fact' ? 'Label (peringkat)' : 'Label kecil', t === 'fact' ? '#3' : 'Topik')}
      <Field label={HEADING_LABEL[t] ?? 'Judul'}>
        <AutoTextarea minRows={2} value={scene.heading} onChange={(e) => set({ heading: e.target.value })} className={cx(inputCls, 'py-2 text-[15px] font-semibold')} />
      </Field>
      {sceneHas(t, 'body') && (
        <Field label={t === 'quote' ? 'Renungan singkat' : 'Keterangan'}>
          <AutoTextarea minRows={2} value={scene.body} onChange={(e) => set({ body: e.target.value })} className={cx(inputCls, 'py-2 text-sm')} />
        </Field>
      )}
      {sceneHas(t, 'author') && text('author', AUTHOR_LABEL[t] ?? 'Sumber')}
      {sceneHas(t, 'code') && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Kode</span>
            <Segmented<CodeKind>
              size="sm"
              value={scene.codeKind}
              onChange={(k) => set({ codeKind: k })}
              options={[
                { id: 'none', label: 'Tanpa' },
                { id: 'terminal', label: 'Terminal' },
                { id: 'code', label: 'Kode' }
              ]}
            />
          </div>
          {scene.codeKind !== 'none' && (
            <>
              {scene.codeKind === 'code' && text('codeLanguage', 'Bahasa pemrograman', 'python', true)}
              <AutoTextarea
                minRows={4}
                spellCheck={false}
                value={scene.code}
                onChange={(e) => set({ code: e.target.value })}
                placeholder={scene.codeKind === 'terminal' ? 'npm install' : 'print("halo")'}
                className={cx(inputCls, 'py-2 font-mono text-[13px] leading-relaxed')}
              />
            </>
          )}
        </div>
      )}
      {sceneHas(t, 'compare') && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            {text('leftTitle', 'Kolom kiri', 'Hindari')}
            {list('left', 'Poin kiri')}
          </div>
          <div className="flex flex-col gap-2">
            {text('rightTitle', 'Kolom kanan', 'Lakukan')}
            {list('right', 'Poin kanan')}
          </div>
        </div>
      )}
      <Field
        label={
          <span className="flex items-center justify-between">
            Narasi (suara)
            {voice === 'ok' ? <Badge tone="ok">Suara siap</Badge> : voice === 'stale' ? <Badge tone="warn">Teks berubah</Badge> : <Badge>Belum ada suara</Badge>}
          </span>
        }
        hint={`${wordCount(clip.narration)} kata. Narasi menjelaskan isi layar dengan bahasa lisan, tidak perlu membacakan semuanya.`}
      >
        <AutoTextarea minRows={3} value={clip.narration} onChange={(e) => updateClip(clip.id, { narration: e.target.value })} className={cx(inputCls, 'py-2.5 text-[15px] leading-relaxed')} />
      </Field>
    </div>
  )
}

/** Explainer step 2: every scene with its on-screen text, picture and narration, next to a live designed preview. */
export function ScenesStep() {
  const { project, clips, assets, jobs, selectedClipId, select, updateClip, addClip, removeClip, moveClip, updateProject, flush } = useProject()
  const { toast } = useApp()
  const input = useExplainerInput()
  const narration = useNarration()
  if (!project || !input) return null
  const template = getTemplate(project.templateId)
  const index = Math.max(0, clips.findIndex((c) => c.id === selectedClipId))
  const clip = clips[index]
  const scene = clip?.scene
  const portrait = project.aspectRatio === '9:16'
  const aiMissing = clips.filter((c) => wantsAiImage(c.scene) && !c.imageAssetId).length
  const imagesRunning = clips.some((c) => isRunning(jobFor(jobs, 'image', { clipId: c.id })))
  const voiced = clips.filter((c) => voiceState(c, assets) === 'ok').length

  const remove = async (c: Clip, i: number): Promise<void> => {
    const ok = await confirmDialog({ title: `Hapus adegan ${i + 1}?`, body: `“${c.scene?.heading || c.title}” dihapus dari video.`, confirm: 'Hapus', danger: true })
    if (ok) removeClip(c.id)
  }
  const makeImages = async (): Promise<void> => {
    try {
      await flush()
      for (const j of await window.api.generate.missingImages(project.id)) useProject.getState().upsertJob(j)
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[290px_minmax(0,1fr)_400px]">
        <aside className="scroll-thin flex flex-col gap-1.5 overflow-y-auto border-r border-line bg-surface px-3 py-4">
          <div className="flex items-center justify-between px-1.5 pb-1">
            <span className="text-sm font-semibold">{clips.length} adegan</span>
            <span className="text-xs text-muted">{template.name}</span>
          </div>
          {clips.map((c, i) => {
            const v = voiceState(c, assets)
            const on = c.id === clip?.id
            return (
              <div
                key={c.id}
                className={cx('group flex items-start gap-2 rounded-xl border px-2.5 py-2', on ? 'border-line-3 bg-sun-soft' : 'border-transparent hover:bg-sand')}
              >
                <button type="button" onClick={() => select(c.id)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                  <span className="mt-0.5 font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">{c.scene ? sceneTypeName(c.scene.type) : 'Adegan'}</span>
                    <span className="line-clamp-2 text-[13.5px] font-medium leading-snug">{c.scene?.heading || c.title || 'Tanpa judul'}</span>
                    <span className="flex items-center gap-2 text-muted">
                      <Mic className={cx('size-3.5', v === 'ok' ? 'text-ok-ink' : v === 'stale' ? 'text-sun-ink' : 'opacity-50')} />
                      {c.scene && c.scene.imageMode !== 'none' && <ImageIcon className={cx('size-3.5', c.imageAssetId ? 'text-ok-ink' : 'opacity-50')} />}
                    </span>
                  </span>
                </button>
                <Menu
                  trigger={(open) => (
                    <IconButton label="Opsi adegan" onClick={open} size={30} className="border-transparent opacity-60 group-hover:opacity-100">
                      <MoreHorizontal className="size-4" />
                    </IconButton>
                  )}
                  items={[
                    { label: 'Naikkan', icon: <ArrowUp className="size-4" />, run: () => moveClip(c.id, -1) },
                    { label: 'Turunkan', icon: <ArrowDown className="size-4" />, run: () => moveClip(c.id, 1) },
                    { label: 'Hapus', icon: <Trash2 className="size-4" />, danger: true, run: () => void remove(c, i) }
                  ]}
                />
              </div>
            )
          })}
          <Button size="sm" className="mt-1" icon={<Plus className="size-4" />} onClick={() => addClip(clip?.id ?? null)}>
            Tambah adegan
          </Button>
        </aside>

        <main className="scroll-thin flex min-w-0 flex-col gap-4 overflow-y-auto px-7 py-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold text-accent">Langkah 2 dari 3</p>
              <h1 className="mt-1 font-display text-[30px] font-bold leading-tight tracking-[-0.02em]">Adegan</h1>
            </div>
            <span className="text-[13px] text-muted">Pratinjau adegan {index + 1} · berubah langsung saat kamu mengetik</span>
          </div>
          {clip ? (
            <>
              <div className={cx('shrink-0 overflow-hidden rounded-2xl border border-line-2 bg-ink shadow-ink', portrait && 'mx-auto w-[300px]')}>
                <ExplainerStill input={input} frame={settledFrame(input, index)} />
              </div>
              {scene && sceneHas(scene.type, 'image') && (
                <ImagePanel clip={clip} scene={scene} onScene={(p) => updateClip(clip.id, { scene: { ...scene, ...p } })} />
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Belum ada adegan. Kembali ke langkah 1 untuk menulisnya, atau tambah adegan sendiri.</p>
          )}
        </main>

        <aside className="scroll-thin overflow-y-auto border-l border-line bg-surface px-5 py-5">{clip && scene && <SceneForm clip={clip} scene={scene} allowed={template.sceneTypes} />}</aside>
      </div>

      <footer className="flex h-[76px] shrink-0 items-center gap-4 border-t border-line bg-surface px-7">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-semibold">
            {narration.running ? (narration.message ?? 'Membuat narasi…') : `${voiced} dari ${clips.length} adegan bersuara`}
          </span>
          {narration.running ? (
            <Progress value={narration.progress} className="w-[260px]" />
          ) : (
            <span className="text-[13px] text-muted">Narasi direkam dalam satu kali jalan supaya suaranya konsisten.</span>
          )}
        </div>
        <div className="flex-1" />
        {aiMissing > 0 && (
          <Button icon={<ImagePlus className="size-[17px]" />} loading={imagesRunning} onClick={() => void makeImages()}>
            Buat {aiMissing} gambar AI
          </Button>
        )}
        <Button icon={<Sparkles className="size-[17px]" />} loading={narration.running} disabled={!clips.length} onClick={() => void narration.start()}>
          {voiced ? 'Rekam ulang narasi' : 'Buat narasi'}
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={!clips.length}
          onClick={() => updateProject({ step: 4, status: project.status === 'exported' ? 'exported' : 'editing' })}
        >
          Lanjut ke editor
          <ArrowRight className="size-[18px]" />
        </Button>
      </footer>
    </div>
  )
}
