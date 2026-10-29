import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PlayerRef } from '@remotion/player'
import { Image as ImageIcon, Music, RotateCcw, Trash2, Upload } from 'lucide-react'
import {
  CAPTION_POSITIONS,
  EXPLAINER_FONTS,
  EXPLAINER_TEMPLATES,
  getTemplate,
  resolveCaption,
  resolveLook,
  sceneTypeName,
  type CaptionPosition,
  type ExplainerTemplateId,
  type ExplainerTheme
} from '@shared/explainer'
import { CaptionPicker, ExplainerPlayer, captionFrame, settledFrame, useExplainerInput } from '../../../components/ExplainerPreview'
import { ImageStylePicker } from '../../../components/ImageStylePicker'
import { Select } from '../../../components/Select'
import { Button, Segmented, Switch, cx } from '../../../components/ui'
import { errorText, mmss } from '../../../lib/format'
import { useApp } from '../../../store/app'
import { useProject } from '../../../store/project'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-line pb-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">{title}</h3>
      {children}
    </section>
  )
}

/** Explainer step 3: the whole video in the Remotion Player, the scene list, and the look of the video. */
export function ExplainerEditor() {
  const { project, clips, assets, updateProject, updateEditor, addAsset, select } = useProject()
  const { toast } = useApp()
  const input = useExplainerInput()
  const player = useRef<PlayerRef>(null)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const p = player.current
    if (!p) return
    const on = (e: { detail: { frame: number } }): void => setFrame(e.detail.frame)
    p.addEventListener('frameupdate', on)
    return () => p.removeEventListener('frameupdate', on)
  }, [input !== null])

  if (!project || !input) return null
  const template = getTemplate(project.templateId)
  const theme = project.theme ?? {}
  const look = resolveLook(project.templateId, theme)
  const setTheme = (p: Partial<ExplainerTheme>): void => updateProject({ theme: { ...theme, ...p } })
  const current = input.scenes.findIndex((s) => frame >= s.from && frame < s.from + s.frames)
  const portrait = project.aspectRatio === '9:16'
  const music = project.editor.musicAssetId ? assets[project.editor.musicAssetId] : null
  const logo = theme.logoAssetId ? assets[theme.logoAssetId] : null

  const caption = resolveCaption(project.templateId, theme)
  // A new caption look is shown right away: a paused Player jumps to a spoken line of the current scene.
  const showCaption = (): void => {
    const p = player.current
    if (!p || p.isPlaying()) return
    p.seekTo(captionFrame(input, Math.max(0, current)))
  }
  const seekTo = (i: number): void => {
    select(clips[i]?.id ?? null)
    player.current?.pause()
    player.current?.seekTo(settledFrame(input, i))
  }
  const pickLogo = async (): Promise<void> => {
    try {
      const a = await window.api.assets.pickImage(project.id)
      if (!a) return
      addAsset(a)
      setTheme({ logoAssetId: a.id })
    } catch (e) {
      toast('error', errorText(e))
    }
  }
  const pickMusic = async (): Promise<void> => {
    try {
      const a = await window.api.assets.pickMusic(project.id)
      if (!a) return
      addAsset(a)
      updateEditor({ musicAssetId: a.id, musicInMs: 0 })
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <div className="grid h-full grid-cols-[250px_minmax(0,1fr)_340px]">
      <aside className="scroll-thin flex flex-col gap-1 overflow-y-auto border-r border-line bg-surface px-3 py-4">
        <span className="px-1.5 pb-1 text-sm font-semibold">
          {clips.length} adegan · {mmss((input.totalFrames / input.fps) * 1000)}
        </span>
        {input.scenes.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => seekTo(i)}
            className={cx('flex flex-col gap-0.5 rounded-xl border px-2.5 py-2 text-left', i === current ? 'border-line-3 bg-sun-soft' : 'border-transparent hover:bg-sand')}
          >
            <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-2">
              <span>
                {String(i + 1).padStart(2, '0')} · {sceneTypeName(s.scene.type)}
              </span>
              <span className="font-mono normal-case tracking-normal text-muted">{(s.frames / input.fps).toLocaleString('id-ID', { maximumFractionDigits: 1 })} dtk</span>
            </span>
            <span className="line-clamp-2 text-[13px] font-medium leading-snug">{s.scene.heading || 'Tanpa judul'}</span>
            {!s.audio && clips[i]?.narration.trim() && <span className="text-[11.5px] text-sun-ink">Belum ada suara</span>}
          </button>
        ))}
      </aside>

      <main className="flex min-w-0 items-center justify-center bg-[#1f1d1a] p-6">
        <div style={{ width: portrait ? 'min(100%, calc((100vh - 230px) * 9 / 16))' : 'min(100%, calc((100vh - 230px) * 16 / 9))' }}>
          <ExplainerPlayer ref={player} input={input} className="overflow-hidden rounded-lg" />
        </div>
      </main>

      <aside className="scroll-thin flex flex-col gap-4 overflow-y-auto border-l border-line bg-surface px-5 py-5">
        <h2 className="font-display text-xl font-bold">Tampilan video</h2>
        <Group title="Template">
          <Select<ExplainerTemplateId>
            label="Template"
            value={template.id}
            onChange={(id) => updateProject({ templateId: id, theme: { ...theme, paletteId: undefined, fontId: undefined } })}
            options={EXPLAINER_TEMPLATES.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Group>
        <Group title="Warna">
          <div className="grid grid-cols-3 gap-2">
            {template.palettes.map((p) => {
              const on = look.palette.id === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTheme({ paletteId: p.id, accent: undefined })}
                  className={cx('flex flex-col items-start gap-1.5 rounded-xl border p-2', on ? 'border-line-3 bg-sun-soft' : 'border-line hover:border-line-3')}
                >
                  <span className="flex h-9 w-full overflow-hidden rounded-lg border border-line" style={{ background: p.bg }}>
                    <span className="mt-auto h-3 w-1/2" style={{ background: p.accent }} />
                    <span className="mt-auto h-3 w-1/2" style={{ background: p.accent2 }} />
                  </span>
                  <span className="text-xs font-semibold">{p.name}</span>
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="color"
              value={look.palette.accent}
              onChange={(e) => setTheme({ accent: e.target.value.toUpperCase() })}
              className="h-9 w-12 cursor-pointer rounded-lg border border-line-2 bg-surface p-1"
              aria-label="Warna aksen"
            />
            <span className="flex-1">Warna aksen</span>
            {theme.accent && (
              <button type="button" className="flex items-center gap-1 text-[13px] font-semibold text-accent-dark hover:underline" onClick={() => setTheme({ accent: undefined })}>
                <RotateCcw className="size-3.5" />
                Bawaan
              </button>
            )}
          </label>
        </Group>
        <Group title="Gaya gambar AI">
          <ImageStylePicker value={theme.imageStyleId} onChange={(id) => setTheme({ imageStyleId: id })} />
          <p className="text-[12.5px] text-muted">Berlaku untuk gambar AI yang dibuat setelah ini. Buat ulang gambar di langkah Adegan untuk menerapkannya.</p>
        </Group>
        <Group title="Font judul">
          <Select
            label="Font judul"
            value={look.heading.id}
            onChange={(id) => setTheme({ fontId: id })}
            options={template.fonts.map((id) => {
              const f = EXPLAINER_FONTS.find((x) => x.id === id)!
              return { value: id, label: f.name, labelStyle: { fontFamily: `'${f.family}'`, textTransform: f.upper ? 'uppercase' : undefined } }
            })}
          />
        </Group>
        <Group title="Caption">
          <CaptionPicker
            look={look}
            templateId={template.id}
            value={theme.captions === false ? 'off' : caption.style}
            onChange={(v) => {
              setTheme(v === 'off' ? { captions: false } : { captions: true, captionStyle: v })
              if (v !== 'off') showCaption()
            }}
          />
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm">Posisi</span>
            <Segmented<CaptionPosition>
              size="sm"
              value={caption.position}
              onChange={(v) => {
                setTheme({ captionPosition: v })
                showCaption()
              }}
              options={CAPTION_POSITIONS.map((c) => ({ id: c.id, label: c.name, disabled: theme.captions === false }))}
            />
          </div>
          <p className="text-[12.5px] text-muted">Isi adegan otomatis bergeser supaya tidak tertutup caption.</p>
        </Group>
        <Group title="Logo">
          {logo ? (
            <div className="flex items-center gap-3">
              <img src={logo.url} alt="" className="h-10 max-w-[120px] rounded border border-line object-contain" />
              <div className="flex-1" />
              <Button size="sm" icon={<Trash2 className="size-4" />} onClick={() => setTheme({ logoAssetId: null })}>
                Lepas
              </Button>
            </div>
          ) : (
            <Button size="sm" icon={<ImageIcon className="size-4" />} onClick={() => void pickLogo()} className="self-start">
              Pilih logo
            </Button>
          )}
          <p className="text-[12.5px] text-muted">Tampil kecil di pojok, dan besar di adegan penutup.</p>
        </Group>
        <Group title="Musik latar">
          {music ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Music className="size-4 shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1 truncate">{music.prompt ?? 'Musik'}</span>
                <Button size="sm" icon={<Trash2 className="size-4" />} onClick={() => updateEditor({ musicAssetId: null })}>
                  Lepas
                </Button>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <span className="w-16">Volume</span>
                <input
                  type="range"
                  min={-36}
                  max={0}
                  step={1}
                  value={project.editor.musicVolumeDb}
                  onChange={(e) => updateEditor({ musicVolumeDb: Number(e.target.value) })}
                  className="flex-1 accent-[var(--color-accent)]"
                />
                <span className="w-14 text-right font-mono text-xs">{project.editor.musicVolumeDb} dB</span>
              </label>
              <div className="flex items-center gap-3">
                <span className="flex-1 text-sm">Kecilkan saat narasi</span>
                <Switch on={project.editor.duckMusic} onChange={(v) => updateEditor({ duckMusic: v })} label="Kecilkan musik saat narasi" />
              </div>
            </>
          ) : (
            <Button size="sm" icon={<Upload className="size-4" />} onClick={() => void pickMusic()} className="self-start">
              Pilih musik
            </Button>
          )}
        </Group>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Teks, gambar, dan narasi tiap adegan diubah di langkah Adegan. Pratinjau ini memakai komponen yang sama dengan hasil ekspor.
        </p>
      </aside>
    </div>
  )
}
