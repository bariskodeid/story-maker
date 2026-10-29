import { useEffect, useState } from 'react'

/** Settings › Tentang aplikasi: version, credits and licences. */
export function AboutSection() {
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.app.version().then(setVersion)
  }, [])

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 text-[15px] leading-relaxed text-ink-2">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-[34px] font-bold tracking-[-0.015em] text-ink">Story Maker</h1>
        {version && <span className="rounded-full border border-line-2 px-3 py-1 font-mono text-xs text-ink">Versi {version}</span>}
      </div>

      <p>Semua proyek, gambar, video, dan suara disimpan di komputer ini.</p>
      <p>
        Kode Story Maker dirilis dengan lisensi MIT. Aplikasi ini juga menyertakan FFmpeg (lisensi GPL) untuk merender video, whisper.cpp (lisensi MIT) untuk
        menyamakan caption dengan suara, dan font caption dari Google Fonts (SIL Open Font License dan Apache 2.0). Model Whisper Small (lisensi MIT) diunduh
        terpisah. File lisensinya ikut terpasang di folder aplikasi.
      </p>
      <p>
        Logo Gemini, OpenRouter, Groq, ElevenLabs, dan Higgsfield adalah merek milik pemiliknya masing-masing, dipakai hanya untuk menandai layanan yang
        terhubung. Ikon penyedia berasal dari LobeHub Icons (lisensi MIT).
      </p>
    </section>
  )
}
