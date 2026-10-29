import { useEffect, useState, type ReactNode } from 'react'
import { Clapperboard, Download, MonitorPlay, PlayCircle, Trash2 } from 'lucide-react'
import type { RenderEngineStatus, RenderTestResult } from '@shared/render'
import { Badge, Button, Progress, confirmDialog } from '../components/ui'
import { errorText } from '../lib/format'

const mb = (n: number): string => `${Math.round(n / 1_000_000).toLocaleString('id-ID')} MB`
const sec = (ms: number): string => `${(ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} dtk`

/**
 * Settings › Umum: Chrome Headless Shell, which renders explainer videos. It downloads by itself on the first
 * export too; this section lets the user fetch it ahead of time and check the engine with a short test render.
 * `license` is the optional Remotion Company License key field (Settings passes its KeyForm).
 */
export function RenderEngineSection({ license }: { license?: ReactNode }) {
  const [status, setStatus] = useState<RenderEngineStatus | null>(null)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: RenderTestResult } | { error: string } | null>(null)

  useEffect(() => {
    void window.api.renderEngine.status().then(setStatus)
    return window.api.on.renderEngine(setStatus)
  }, [])

  if (!status) return null
  const busy = status.state === 'downloading'

  const remove = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Hapus mesin render?',
      body: `Chrome Headless Shell (${status.sizeBytes ? mb(status.sizeBytes) : 'sekitar 250 MB'}) dihapus dari komputer ini. Video penjelasan yang sudah diekspor tetap aman, dan mesinnya diunduh lagi saat kamu mengekspor berikutnya.`,
      confirm: 'Hapus',
      danger: true
    })
    if (ok) await window.api.renderEngine.remove()
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTest(null)
    try {
      setTest({ ok: await window.api.renderEngine.test() })
    } catch (e) {
      setTest({ error: errorText(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-[18px]">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-ink bg-ink text-paper">
          <Clapperboard className="size-5" />
        </span>
        <div className="flex flex-1 flex-col">
          <span className="text-base font-bold">Mesin render video penjelasan</span>
          <span className="text-[13px] text-ink-2">
            Remotion dengan Chrome Headless Shell · {status.sizeBytes ? mb(status.sizeBytes) : 'unduhan sekitar 100 MB'}
          </span>
        </div>
        {status.state === 'ready' ? <Badge tone="ok">Siap dipakai</Badge> : busy ? <Badge tone="warn">Mengunduh</Badge> : <Badge tone="draft">Belum diunduh</Badge>}
      </div>

      <p className="text-[13px] leading-relaxed text-ink-2">
        Video penjelasan (tutorial, tips, fakta, kutipan, perbandingan, berita) digambar oleh browser tanpa jendela, lalu disatukan dengan suaranya jadi MP4. Mesinnya diunduh
        sekali ke folder data aplikasi, otomatis saat ekspor pertama atau dari sini. Proyek cerita tidak membutuhkannya.
      </p>

      {busy && (
        <div className="flex flex-col gap-1.5">
          <Progress value={status.total ? status.received / status.total : 0} />
          <span className="font-mono text-xs text-ink-2">{status.total ? `${mb(status.received)} dari ${mb(status.total)}` : 'Menghubungi server…'}</span>
        </div>
      )}
      {status.error && !busy && <p className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad-ink">{status.error}</p>}
      {test && 'ok' in test && (
        <p className="flex items-center gap-2 rounded-lg bg-ok-soft px-3 py-2 text-[13px] text-ok-ink">
          <MonitorPlay className="size-4 shrink-0" />
          Render uji berhasil dalam {sec(test.ok.ms)}. Mesin render siap dipakai.
        </p>
      )}
      {test && 'error' in test && <p className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad-ink">Render uji gagal: {test.error}</p>}

      <div className="flex flex-wrap gap-2">
        {status.state === 'ready' ? (
          <>
            <Button icon={<PlayCircle className="size-4" />} loading={testing} onClick={() => void runTest()}>
              Uji render
            </Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} disabled={testing} onClick={() => void remove()}>
              Hapus mesin render
            </Button>
          </>
        ) : (
          <Button variant="accent" icon={<Download className="size-4" />} disabled={busy} loading={busy} onClick={() => void window.api.renderEngine.install()}>
            {busy ? 'Mengunduh…' : 'Unduh mesin render'}
          </Button>
        )}
      </div>
      {license && <div className="border-t border-line pt-4">{license}</div>}
    </section>
  )
}
