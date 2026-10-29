import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Film, Image as ImageIcon, Move, Users } from 'lucide-react'
import {
  DEFAULT_IMAGE_MODEL,
  effectiveResolution,
  fitDuration,
  getImageModel,
  getVideoModel,
  hfModelOptions,
  maxRefs,
  resolutionOptions
} from '@shared/higgsfield'
import { isNineRouterImage, nineRouterImageId, nineRouterModel } from '@shared/imageModels'
import type { CreditEstimate, KeyStatus, ModelList, ModelOption, Project } from '@shared/types'
import { ModelLogo } from '../../components/ModelLogo'
import { ModelPicker } from '../../components/ModelPicker'
import { ProviderLogo } from '../../components/ProviderLogo'
import { Segmented, Spinner } from '../../components/ui'
import { creditLabel, errorText } from '../../lib/format'
import { useEstimate, useEstimates } from '../../lib/useEstimate'

const IMAGE_OPTIONS = hfModelOptions('image')
const VIDEO_OPTIONS = hfModelOptions('video')
const IMAGE_IDS = IMAGE_OPTIONS.map((o) => o.id)
const VIDEO_IDS = VIDEO_OPTIONS.map((o) => o.id)

/** Adds each model's estimated credits to its picker row once a Higgsfield key is known to exist. */
function withCosts(options: ModelOption[], costs: Record<string, CreditEstimate | null>, unit: (id: string) => string, on: boolean): ModelOption[] {
  if (!on) return options
  return options.map((o) => ({
    ...o,
    credits: o.id in costs ? (costs[o.id]?.credits ?? null) : undefined,
    usd: costs[o.id]?.usd ?? null,
    creditUnit: unit(o.id)
  }))
}

function Cost({
  value,
  hasKey,
  children
}: {
  value: CreditEstimate | null | undefined
  hasKey: boolean | null
  children: (credits: number) => ReactNode
}) {
  if (hasKey === false) return <span className="text-muted">Perkiraan kredit muncul setelah kunci Higgsfield diisi di Pengaturan.</span>
  if (value === undefined)
    return (
      <span className="flex items-center gap-1.5 text-muted">
        <Spinner className="size-3" />
        Menghitung kredit…
      </span>
    )
  if (value === null) return <span className="text-muted">Perkiraan kredit belum tersedia.</span>
  return <span>{children(value.credits)}</span>
}

function Card({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line-2 bg-surface p-3">
      {/* At the minimum window width the source switch wraps under the title instead of overflowing the card. */}
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          {icon}
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

type ImageSource = 'higgsfield' | 'ninerouter'

/** Image models of the providers connected in 9Router; asked for only once 9Router is the image source. */
function useNineRouterModels(enabled: boolean) {
  const [list, setList] = useState<ModelList | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (refresh: boolean): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setList(await window.api.generate.nineRouterModels(refresh))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (enabled) void load(false)
  }, [enabled, load])
  return { models: list?.models ?? [], fetchedAt: list?.fetchedAt ?? null, loading, error, refresh: () => void load(true) }
}

/** Which models draw (Higgsfield or 9Router) and animate (Higgsfield) this project's clips. */
export function ModelSection({
  project,
  clipCount,
  perClip,
  onChange,
  onOpenSettings,
  imageOnly = false,
  note
}: {
  /** A project, or anything with its model fields (a series' settings for new episodes). */
  project: Pick<Project, 'imageModel' | 'videoModel' | 'videoResolution' | 'aspectRatio'>
  clipCount: number
  perClip: number
  onChange: (patch: { imageModel?: string; videoModel?: string; videoResolution?: string | null }) => void
  onOpenSettings?: () => void
  /** Explainer projects: only the image model, for the scenes that ask for an AI picture. */
  imageOnly?: boolean
  /** Replaces the line next to the "Model AI" heading. */
  note?: string
}) {
  const image = getImageModel(project.imageModel)
  const viaNineRouter = isNineRouterImage(project.imageModel)
  const video = getVideoModel(project.videoModel)
  const seconds = fitDuration(video, perClip) ?? perClip
  const imageCost = useEstimate('image', image.id, project.aspectRatio)
  const resolutions = resolutionOptions(video)
  const resolution = effectiveResolution(video, project.videoResolution)
  const videoCost = useEstimate('video', video.id, project.aspectRatio, perClip, resolution)
  const [keys, setKeys] = useState<KeyStatus[] | null>(null)
  const hasKey = keys ? !!keys.find((k) => k.provider === 'higgsfield')?.configured : null
  const nineRouterReady = !!keys?.find((k) => k.provider === 'ninerouter')?.configured

  useEffect(() => {
    void window.api.settings.keys().then(setKeys)
  }, [])

  // Choosing 9Router only opens its list; the project switches once a model is picked from it.
  const [source, setSource] = useState<ImageSource>(viaNineRouter ? 'ninerouter' : 'higgsfield')
  // The last pick per source, so flipping back and forth restores it.
  const lastPick = useRef<Record<ImageSource, string | null>>({ higgsfield: null, ninerouter: null })
  useEffect(() => {
    if (!project.imageModel) return
    lastPick.current[viaNineRouter ? 'ninerouter' : 'higgsfield'] = project.imageModel
    if (viaNineRouter) setSource('ninerouter')
  }, [project.imageModel])
  const switchSource = (next: ImageSource): void => {
    setSource(next)
    if (next === 'higgsfield' && viaNineRouter) onChange({ imageModel: lastPick.current.higgsfield ?? DEFAULT_IMAGE_MODEL })
    else if (next === 'ninerouter' && !viaNineRouter && lastPick.current.ninerouter) onChange({ imageModel: lastPick.current.ninerouter })
  }
  const nineRouter = useNineRouterModels(source === 'ninerouter' && nineRouterReady)

  const imageCosts = useEstimates('image', IMAGE_IDS, project.aspectRatio, undefined, hasKey === true && source === 'higgsfield')
  const videoCosts = useEstimates('video', VIDEO_IDS, project.aspectRatio, perClip, hasKey === true)
  const imageModels = useMemo(() => withCosts(IMAGE_OPTIONS, imageCosts, () => '', hasKey === true), [imageCosts, hasKey])
  const videoModels = useMemo(
    () => withCosts(VIDEO_OPTIONS, videoCosts, (id) => `${fitDuration(getVideoModel(id), perClip)} dtk`, hasKey === true),
    [videoCosts, perClip, hasKey]
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">Model AI</span>
        <span className="text-[13px] text-muted">
          {note
            ? note
            : imageOnly
            ? 'Untuk adegan yang memakai gambar AI'
            : source === 'ninerouter'
            ? `Gambar lewat 9Router, ${VIDEO_OPTIONS.length} model video dari Higgsfield`
            : `${IMAGE_OPTIONS.length} model gambar dan ${VIDEO_OPTIONS.length} model video dari Higgsfield`}
        </span>
      </div>
      <div className={imageOnly ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
        <Card
          icon={<ImageIcon className="size-4" />}
          title={imageOnly ? 'Gambar AI' : 'Gambar klip'}
          action={
            <Segmented
              size="sm"
              value={source}
              onChange={switchSource}
              options={[
                { id: 'higgsfield', label: 'Higgsfield' },
                { id: 'ninerouter', label: '9Router', title: 'Model gambar dari akun yang kamu hubungkan di 9Router' }
              ]}
            />
          }
        >
          {source === 'higgsfield' ? (
            <>
              <ModelPicker
                value={image.id}
                models={imageModels}
                footerNote={hasKey ? 'kredit per gambar, perkiraan Higgsfield untuk akunmu' : undefined}
                renderIcon={(m) => <ModelLogo family={m.family} />}
                detail="description"
                tagFilters={['Rekomendasi', 'Referensi', 'GPT Image', 'Soul', 'Recraft', '4K']}
                menuClassName="w-[430px]"
                onChange={(id) => onChange({ imageModel: id })}
              />
              <p className="text-[12.5px] leading-snug text-ink-2">
                <Cost value={imageCost} hasKey={hasKey}>
                  {(c) => (
                    <>
                      ≈ {creditLabel(c)} kredit per gambar · {clipCount} gambar ≈ <b className="font-semibold text-ink">{creditLabel(c * clipCount)} kredit</b>
                    </>
                  )}
                </Cost>
              </p>
              {!imageOnly && (
                <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
                  <Users className="mt-px size-3.5 shrink-0" />
                  {maxRefs(image)
                    ? 'Pakai lembar karakter, jadi wajah dan kostum tokoh tetap sama di tiap klip.'
                    : 'Tanpa lembar karakter, jadi tampilan tokoh bisa sedikit berubah antar klip.'}
                </p>
              )}
            </>
          ) : (
            <>
              <ModelPicker
                value={viaNineRouter ? nineRouterModel(project.imageModel!) : ''}
                models={nineRouter.models}
                loading={nineRouter.loading}
                error={keys && !nineRouterReady ? '9Router belum terhubung. Simpan alamat 9Router di Pengaturan › Gambar dan video dulu.' : nineRouter.error}
                fetchedAt={nineRouter.fetchedAt}
                onRefresh={nineRouterReady ? nineRouter.refresh : undefined}
                allowCustom
                placeholder="Pilih model gambar 9Router"
                footerNote="ketik ID lain kalau modelnya tidak ada di daftar"
                renderIcon={() => <ProviderLogo id="ninerouter" size={30} />}
                detail="description"
                menuClassName="w-[430px]"
                onChange={(id) => onChange({ imageModel: nineRouterImageId(id) })}
              />
              <p className="text-[12.5px] leading-snug text-ink-2">
                {keys && !nineRouterReady ? (
                  <>
                    9Router belum terhubung.{' '}
                    {onOpenSettings && (
                      <button type="button" onClick={onOpenSettings} className="font-semibold text-accent-dark hover:underline">
                        Atur di Pengaturan
                      </button>
                    )}
                  </>
                ) : (
                  'Tanpa kredit Higgsfield. Biayanya mengikuti akun yang kamu hubungkan di 9Router.'
                )}
              </p>
              {!imageOnly && (
                <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
                  <Users className="mt-px size-3.5 shrink-0" />
                  Lembar karakter ikut dikirim sebagai referensi, tapi tidak semua model di 9Router memakainya, jadi wajah pemeran bisa kurang konsisten antar klip.
                </p>
              )}
            </>
          )}
        </Card>
        {!imageOnly && (
        <Card icon={<Film className="size-4" />} title="Video AI">
          <ModelPicker
            value={video.id}
            models={videoModels}
            footerNote={hasKey ? `kredit per video untuk klip ±${perClip} detik` : undefined}
            renderIcon={(m) => <ModelLogo family={m.family} />}
            detail="description"
            tagFilters={['Rekomendasi', 'Kling', 'Seedance', 'Wan', 'Referensi', '4K']}
            align="right"
            menuClassName="w-[430px]"
            onChange={(id) => onChange({ videoModel: id })}
          />
          {resolutions.length > 1 ? (
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 text-[12.5px] font-medium text-ink-2">Resolusi</span>
              <Segmented
                size="sm"
                value={resolution ?? resolutions[0]}
                onChange={(v) => onChange({ videoResolution: v })}
                options={resolutions.map((r) => ({ id: r, label: r.toUpperCase() === '4K' || r.toUpperCase() === '2K' ? r.toUpperCase() : r }))}
                className="min-w-0 flex-1"
              />
            </div>
          ) : (
            resolution && <p className="text-[12.5px] text-ink-2">Resolusi {resolution} (satu-satunya pilihan model ini)</p>
          )}
          <p className="text-[12.5px] leading-snug text-ink-2">
            <Cost value={videoCost} hasKey={hasKey}>
              {(c) => (
                <>
                  ≈ {creditLabel(c)} kredit per video {seconds} detik{resolution ? `, ${resolution}` : ''}
                </>
              )}
            </Cost>
          </p>
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
            <Move className="mt-px size-3.5 shrink-0" />
            Hanya untuk klip yang kamu jadikan Video AI. Gerak kamera tetap gratis.
          </p>
        </Card>
        )}
      </div>
    </div>
  )
}
