import { useEffect, useRef, useState } from 'react'
import { Copy, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { EXPLAINER_IMAGE_STYLES } from '@shared/explainer'
import { NARRATOR_EXPRESSIONS } from '@shared/narrator'
import { VISUAL_STYLES } from '@shared/styles'
import type { Job, Narrator } from '@shared/types'
import { errorText } from '../lib/format'
import { EXPRESSION_LABEL, narratorDialogOpened } from '../lib/narrators'
import { useApp } from '../store/app'
import { ImageStylePicker } from './ImageStylePicker'
import { MagicButton, useMagic } from './Magic'
import { StyleMenu } from './StyleMenu'
import { Button, Field, Modal, Progress, Segmented, confirmDialog, cx, inputCls } from './ui'

type Style = Narrator['style']
type Patch = { name?: string; description?: string; style?: Style }

/** The project's own style id may be one narrators do not know (e.g. the explainer's 'auto'); fall back to the first of its kind. */
function validStyle(s: Style): Style {
  const known = s.kind === 'explainer' ? EXPLAINER_IMAGE_STYLES.some((x) => x.id === s.id) : VISUAL_STYLES.some((x) => x.id === s.id)
  if (known) return s
  return { kind: s.kind, id: s.kind === 'explainer' ? EXPLAINER_IMAGE_STYLES[0].id : VISUAL_STYLES[0].id }
}

/** Six cells on a checkerboard so a clean cut-out is visible against the transparency. */
function SpriteStrip({ narrator }: { narrator: Narrator }) {
  if (!narrator.spriteUrls) return null
  return (
    <div className="grid grid-cols-6 gap-2" data-narrator-sprites>
      {NARRATOR_EXPRESSIONS.map((e) => (
        <div key={e} className="flex flex-col items-center gap-1">
          <span
            className="block aspect-square w-full overflow-hidden rounded-lg border border-line"
            style={{ background: 'repeating-conic-gradient(#e9e4d9 0% 25%, #f6f2e8 0% 50%) 0 0 / 14px 14px' }}
          >
            <img src={narrator.spriteUrls?.[`${e}-closed`]} alt={EXPRESSION_LABEL[e]} draggable={false} className="size-full object-contain" />
          </span>
          <span className="text-[11.5px] text-ink-2">{EXPRESSION_LABEL[e]}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Makes or edits one narrator. A new one is created on "Buat narator" (that also starts drawing the sheet); an
 * existing one saves name, description and style on its own. Presets are read-only: duplicate them to change them.
 */
export function NarratorDialog({
  narrator,
  defaultStyle,
  onClose,
  onChanged
}: {
  /** null = a new narrator. */
  narrator: Narrator | null
  defaultStyle: Style
  onClose: () => void
  /** Called after any create, change, duplicate or removal; `selectId` is the narrator to pick, if any. */
  onChanged: (selectId?: string) => void
}) {
  const toast = useApp((s) => s.toast)
  const [current, setCurrent] = useState<Narrator | null>(narrator)
  const [name, setName] = useState(narrator?.name ?? '')
  const [description, setDescription] = useState(narrator?.description ?? '')
  const [style, setStyle] = useState<Style>(narrator?.style ?? validStyle(defaultStyle))
  const [job, setJob] = useState<Job | null>(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  const currentId = useRef<string | null>(narrator?.id ?? null)
  // A narrator made in this dialog is only picked once its sprites exist; picking an empty one would show nothing.
  const selectWhenReady = useRef(false)
  const changed = useRef(onChanged)
  changed.current = onChanged
  const preset = !!current?.preset

  useEffect(() => {
    mounted.current = true
    const closed = narratorDialogOpened()
    // Reopened while its sheet is still being drawn: pick the progress up instead of offering a second run.
    if (narrator && !narrator.preset) {
      void window.api.narrators.activeJob(narrator.id).then((j) => {
        if (j && mounted.current) setJob((prev) => prev ?? j)
      })
    }
    return () => {
      mounted.current = false
      closed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The sheet job belongs to no project, so it arrives as a bare job event matched by narrator id.
  useEffect(() => {
    return window.api.on.job((j) => {
      if (j.kind !== 'sheet' || !j.characterId || j.characterId !== currentId.current) return
      setJob(j)
      if (j.status === 'done') {
        void window.api.narrators.get(j.characterId).then((n) => {
          if (!mounted.current) return
          setCurrent(n)
          changed.current(selectWhenReady.current && n.status === 'ready' ? n.id : undefined)
          selectWhenReady.current = false
        })
      }
    })
  }, [])

  const generating = !!job && (job.status === 'queued' || job.status === 'running')

  // Existing narrators autosave after a short pause; a patch that lands while another is pending merges into it.
  const pending = useRef<Patch>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushNow = async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const id = currentId.current
    const patch = pending.current
    pending.current = {}
    if (!id || !Object.keys(patch).length) return
    try {
      const n = await window.api.narrators.update(id, patch)
      if (mounted.current) setCurrent((c) => (c ? { ...c, name: n.name, description: n.description, style: n.style } : n))
      changed.current()
    } catch (e) {
      toast('error', errorText(e))
    }
  }
  const schedule = (patch: Patch): void => {
    if (!currentId.current || preset) return
    pending.current = { ...pending.current, ...patch }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flushNow(), 600)
  }
  useEffect(
    () => () => {
      if (timer.current) void flushNow()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const magic = useMagic({
    field: 'narratorLook',
    value: description,
    onApply: (text) => {
      setDescription(text)
      schedule({ description: text })
    },
    request: () => ({ styleId: style.id })
  })

  const generate = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await flushNow()
      setJob(await window.api.narrators.generate(id))
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const create = async (): Promise<void> => {
    if (!description.trim()) return toast('error', 'Tulis dulu seperti apa tampilan narator.')
    setBusy(true)
    try {
      const n = await window.api.narrators.create({ name: name.trim() || 'Narator baru', description: description.trim(), style })
      setCurrent(n)
      currentId.current = n.id
      selectWhenReady.current = true
      changed.current()
      setJob(await window.api.narrators.generate(n.id))
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const duplicate = async (): Promise<void> => {
    if (!current) return
    try {
      // The copy is made from what is saved, so an edit still waiting for its autosave must land first.
      await flushNow()
      const copy = await window.api.narrators.duplicate(current.id)
      changed.current(copy.id)
      toast('success', `Salinan "${copy.name}" dibuat dan dipilih. Kamu bisa mengubahnya.`)
      onClose()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const remove = async (): Promise<void> => {
    if (!current) return
    const ok = await confirmDialog({
      title: `Hapus narator "${current.name}"?`,
      body: 'Proyek atau seri yang memakainya tidak menampilkan narator lagi sampai kamu memilih yang lain.',
      confirm: 'Hapus',
      danger: true
    })
    if (!ok) return
    try {
      pending.current = {}
      await window.api.narrators.remove(current.id)
      changed.current()
      onClose()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const switchKind = (kind: Style['kind']): void => {
    if (kind === style.kind) return
    const next: Style = kind === defaultStyle.kind ? validStyle(defaultStyle) : { kind, id: kind === 'story' ? VISUAL_STYLES[0].id : EXPLAINER_IMAGE_STYLES[0].id }
    setStyle(next)
    schedule({ style: next })
  }

  const failed = job?.status === 'failed' ? job.error : null
  const hasSprites = current?.status === 'ready'

  return (
    <Modal
      open
      onClose={onClose}
      title={current ? (preset ? current.name : 'Ubah narator') : 'Narator baru'}
      subtitle={preset ? 'Narator bawaan tidak bisa diubah. Duplikat dulu kalau mau mengubahnya.' : 'Tokoh yang muncul di pojok video dan bergerak mengikuti ucapan.'}
      width={760}
    >
      <div data-narrator-dialog className="flex flex-col gap-5">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5">
          <div className="flex flex-col gap-4">
            <Field label="Nama">
              <input
                className={cx(inputCls, 'h-11')}
                value={name}
                maxLength={60}
                readOnly={preset}
                placeholder="Mis. Pak Guru Robot"
                onChange={(e) => {
                  setName(e.target.value)
                  schedule({ name: e.target.value })
                }}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Gaya gambar</span>
              {preset ? (
                <span className="text-[13px] text-ink-2">{style.kind === 'story' ? 'Gaya cerita' : 'Gaya video penjelasan'}</span>
              ) : (
                <>
                  <Segmented
                    size="sm"
                    className="self-start"
                    value={style.kind}
                    onChange={switchKind}
                    options={[
                      { id: 'story', label: 'Cerita' },
                      { id: 'explainer', label: 'Penjelasan' }
                    ]}
                  />
                  {style.kind === 'story' ? (
                    <div>
                      <StyleMenu
                        value={style.id}
                        onChange={(id) => {
                          setStyle({ kind: 'story', id })
                          schedule({ style: { kind: 'story', id } })
                        }}
                      />
                    </div>
                  ) : (
                    <ImageStylePicker
                      columns={3}
                      value={style.id}
                      onChange={(id) => {
                        setStyle({ kind: 'explainer', id })
                        schedule({ style: { kind: 'explainer', id } })
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="narator-deskripsi" className="text-sm font-semibold">
                Seperti apa tampilannya
              </label>
              {!preset && <MagicButton magic={magic} value={description} size="sm" />}
            </div>
            <textarea
              id="narator-deskripsi"
              rows={6}
              value={description}
              maxLength={600}
              readOnly={preset || magic.busy}
              placeholder="Robot kecil berkacamata dengan jaket kuning, ramah dan ekspresif…"
              onChange={(e) => {
                setDescription(e.target.value)
                schedule({ description: e.target.value })
              }}
              className={cx(inputCls, 'resize-none py-2.5 leading-relaxed')}
            />
            <span className="text-xs text-muted">Satu tokoh, tampak depan. Keenam ekspresi dibuat sekaligus dari satu lembar gambar.</span>
          </div>
        </div>

        {current && <SpriteStrip narrator={current} />}
        {current && !hasSprites && !generating && !preset && <p className="text-[13px] text-ink-2">Belum ada sprite. Buat dulu supaya narator bisa tampil di video.</p>}

        {generating && (
          <div className="flex flex-col gap-1.5" data-narrator-progress>
            <Progress value={job?.progress ?? 0} />
            <span className="text-[13px] text-ink-2">{job?.message ?? 'Menunggu antrean…'}</span>
          </div>
        )}
        {failed && (
          <p className="rounded-xl border border-bad-ink/30 bg-bad-soft px-4 py-3 text-[13px] text-bad-ink" data-narrator-error>
            {failed}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-line pt-4">
          {current && (
            <Button size="sm" icon={<Copy className="size-4" />} onClick={() => void duplicate()}>
              Duplikat
            </Button>
          )}
          {current && !preset && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
              Hapus
            </Button>
          )}
          <div className="flex-1" />
          {!preset && !current && (
            <Button variant="primary" loading={busy} icon={<Sparkles className="size-4" />} onClick={() => void create()}>
              Buat narator
            </Button>
          )}
          {!preset && current && (
            <Button variant={hasSprites ? 'secondary' : 'primary'} loading={busy || generating} icon={<RefreshCw className="size-4" />} onClick={() => void generate(current.id)}>
              {hasSprites ? 'Buat ulang' : 'Buat narator'}
            </Button>
          )}
          <Button onClick={onClose}>Selesai</Button>
        </div>
      </div>
    </Modal>
  )
}
