# Magic Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tombol "Magic" di setiap kolom prompt yang memakai LLM aktif (Gemini, Claude, 9Router, OpenRouter, Groq,
endpoint custom) untuk **memperkaya** teks yang sudah ditulis atau **membuat ide baru** yang lebih kaya.

**Architecture:** Satu IPC `magic:run` di main (`src/main/magic.ts`) yang membangun prompt per jenis kolom lalu
memanggil `generateJson` yang sudah ada (pemilih penyedia sudah ditangani di `services/llm.ts`). Di renderer ada satu
hook `useMagic` + satu komponen `MagicButton` yang dipasang di tiap kolom. Hasil langsung mengganti isi kolom, dengan
aksi "Urungkan" di toast.

**Tech Stack:** Electron + React + TypeScript strict, Zustand, Tailwind v4, lucide-react (`Wand2`).

**Spec:** Permintaan pengguna di percakapan 2026-11-14 (tidak ada dokumen spec terpisah). Keputusan desain di
bagian "Keputusan desain" di bawah menggantikan spec.

## Keputusan desain

1. **Model:** memakai LLM aktif (`activeLlm()`), sama dengan penyusun naskah. Tidak ada pengaturan model Magic
   terpisah (bisa jadi ide lanjutan).
2. **Dua aksi** (`MagicMode`):
   - `improve` — "Perkaya": pertahankan semua fakta pengguna (tokoh, tempat, akhir cerita, poin, nama), perbaiki
     struktur dan tambah detail. Hanya aktif kalau kolom berisi teks.
   - `generate` — "Buat ide baru": kolom kosong → ide segar sesuai jenis proyek/template; kolom berisi → teksnya
     dipakai sebagai tema longgar untuk ide baru yang lengkap.
3. **Penerapan:** hasil mengganti isi kolom. Toast sukses membawa aksi `Urungkan` yang mengembalikan teks lama.
   Selama Magic berjalan kolom `readOnly` supaya ketikan tidak tertimpa.
4. **Konteks diambil di main** dari `projectId`/`clipId`/`seriesId`/`characterId`; renderer hanya mengirim teks kolom
   saat ini (boleh belum tersimpan) dan konteks yang belum ada di database (Home).
5. **Bahasa keluaran:** kolom cerita/topik/sinopsis memakai bahasa proyek (`languageOf`); kolom prompt gambar,
   video, dan penampilan karakter memakai bahasa Inggris (sesuai format yang sudah dihasilkan `story.ts` dan
   `explainer.ts`). Prompt sistem ke LLM selalu bahasa Inggris (`docs/konvensi.md`).

## Kolom yang mendapat Magic

| # | Kolom | File | `MagicField` | Konteks |
|---|---|---|---|---|
| 1 | Ide cerita / Topik video / Premis seri / Topik seri (Beranda) | `pages/Home.tsx:413` | `storyIdea` / `explainerTopic` / `seriesPremise` / `explainerSeriesTopic` | `kind`, `mode`, `templateId`, `language`, `durationSec`, `styleId`, `episodeCount` dari state Home |
| 2 | Ide cerita atau sinopsis | `pages/project/IdeaStep.tsx:232` | `storyIdea` | `projectId` |
| 3 | Topik atau ide video | `pages/project/explainer/ExplainerIdeaStep.tsx:95` | `explainerTopic` | `projectId` (template dari proyek) |
| 4 | Premis/Topik seri (Bible) | `pages/series/SeriesBible.tsx:60` | `seriesPremise` / `explainerSeriesTopic` | `seriesId` |
| 5 | Sinopsis episode | `pages/series/SeriesPage.tsx:400` | `episodeSynopsis` | `projectId` episode (+ seri, episode sebelumnya lewat ringkasan) |
| 6 | Penampilan pemeran (baru & edit) | `pages/project/CharacterModal.tsx:65,148` | `characterLook` | `projectId`, nama pemeran |
| 7 | Prompt visual adegan | `pages/project/StoryboardStep.tsx:247` | `visualPrompt` | `clipId` |
| 8 | Arahan gerak video | `pages/project/StoryboardStep.tsx:418` | `videoPrompt` | `clipId` |
| 9 | Gambar yang diinginkan (adegan penjelasan) | `pages/project/explainer/ScenesStep.tsx:198` | `sceneImagePrompt` | `clipId` |

Sengaja **tidak** diberi Magic: narasi VO, alur adegan, ringkasan episode, kode, judul, caption, overlay, world/tone/
aturan bible (sudah ditulis LLM saat rencana seri; bisa jadi tahap berikutnya).

## Global Constraints

- Teks UI bahasa Indonesia santai dengan "kamu"; nama dan komentar kode bahasa Inggris, komentar menjelaskan *kenapa*.
- IPC baru di tiga tempat: `handle(...)` di `src/main/ipc.ts`, tipe di `src/shared/api.ts`, `call(...)` di `src/preload/index.ts`.
- Jangan pakai `<select>` bawaan; menu aksi Magic memakai `Popover` (`components/Popover.tsx`).
- Kunci API tidak pernah dicetak ke log/error (semua lewat `generateJson`, jangan panggil layanan langsung).
- `npm run typecheck` dan `npm run build` harus bersih di akhir setiap task (`noUnusedLocals`/`noUnusedParameters`).
- Tidak ada migrasi database dan tidak ada kolom klip baru.
- Panjang hasil dipotong ke `maxLength` kolom: sinopsis/topik 4000 karakter (`MAGIC_LIMITS` di `shared/magic.ts`).
- Verifikasi UI lewat dev harness dengan `STUDIO_USER_DATA` sementara dan LLM palsu (`scripts/fake-llm.mjs`, Task 1).

## Review Focus

1. **Pengguna mengetik saat Magic berjalan** → teks yang diketik tidak boleh hilang diam-diam; kolom `readOnly`
   selama `busy` (Task 2 harness: cek atribut `readonly` saat permintaan berjalan).
2. **Model belum dipilih / kunci salah / 9Router mati** → toast error dengan pesan `LlmError` yang sudah ramah, isi
   kolom tidak berubah (Task 1 harness: matikan `fake-llm` lalu jalankan Magic).
3. **Model mengembalikan teks kosong atau berbungkus markdown/kutipan** → error "Magic tidak menghasilkan teks. Coba
   lagi." dan isi kolom tetap; tanda kutip/``` di ujung dibuang (`cleanMagicText`, Task 1).
4. **Kolom `AutosaveText` (seri) sedang fokus/dirty saat hasil datang** → hasil tetap tersimpan dan tampil, tidak
   ditimpa nilai lama (Task 4 harness).
5. **Undo setelah proyek berubah** → `Urungkan` mengembalikan teks persis sebelum Magic, termasuk pada kolom yang
   disimpan otomatis (Task 3 & 4 harness).

---

### Task 1: Layanan Magic di main + IPC + LLM palsu untuk uji

**Files:**
- Create: `src/shared/magic.ts`
- Create: `src/main/magic.ts`
- Create: `scripts/fake-llm.mjs`
- Modify: `src/main/ipc.ts` (impor + `handle('magic:run', ...)` di dekat `story:*`, ±baris 132)
- Modify: `src/shared/api.ts` (blok `magic` setelah `explainer`, ±baris 85)
- Modify: `src/preload/index.ts` (blok `magic` setelah `explainer`, ±baris 47)

**Interfaces:**
- Produces (`src/shared/magic.ts`, tanpa impor Electron/DOM):
  ```ts
  export type MagicField =
    | 'storyIdea' | 'explainerTopic' | 'seriesPremise' | 'explainerSeriesTopic' | 'episodeSynopsis'
    | 'characterLook' | 'visualPrompt' | 'videoPrompt' | 'sceneImagePrompt'
  export type MagicMode = 'improve' | 'generate'
  export interface MagicRequest {
    field: MagicField
    mode: MagicMode
    text: string
    // Ids let main read context from the database; the loose fields cover Home, where nothing is saved yet.
    projectId?: string
    clipId?: string
    seriesId?: string
    characterName?: string
    language?: string
    durationSec?: number
    templateId?: ExplainerTemplateId
    styleId?: string
    episodeCount?: number
  }
  export interface MagicResult { text: string }
  export const MAGIC_LIMITS: Record<MagicField, number>  // storyIdea/explainerTopic/seriesPremise/explainerSeriesTopic 4000, episodeSynopsis 1200, characterLook 600, visualPrompt 1500, videoPrompt 400, sceneImagePrompt 600
  export function magicModes(text: string): MagicMode[]   // '' or whitespace → ['generate']; else ['improve', 'generate']
  export function cleanMagicText(raw: string, field: MagicField): string // trims, strips wrapping quotes and ``` fences, clamps to MAGIC_LIMITS[field]
  ```
- Produces (`src/main/magic.ts`): `export async function runMagic(req: MagicRequest): Promise<MagicResult>`
- Produces (`window.api`): `magic: { run(req: MagicRequest): Promise<MagicResult> }`
- Consumes: `generateJson` dari `src/main/services/llm.ts`; `getBundle`, `getProject`, `charactersOf`, `clipsOf` dari
  `src/main/repo.ts`; `getSeries`, `episodesOf`, `seriesCast` dari `src/main/series.ts`; `getTemplate` dari
  `@shared/explainer`; `getStyle` dari `@shared/styles`; `LANGUAGES` dari `@shared/models`.

- [ ] **Step 1: Tulis `scripts/fake-llm.mjs`** — server Node `http` di port `process.env.PORT ?? 8787`, tanpa dependensi.
  `GET /v1/models` → `{ data: [{ id: 'fake' }] }`. `POST /v1/chat/completions` → baca body, ambil pesan `user`
  terakhir, balas `{ choices: [{ message: { content: JSON.stringify({ text: 'MAGIC: ' + <300 karakter pertama pesan user> }) }, finish_reason: 'stop' }] }`
  setelah jeda `process.env.DELAY_MS ?? 1500` ms (supaya kondisi `busy` bisa diamati). Komentar di atas file:
  hanya untuk dev harness.

- [ ] **Step 2: Tulis rencana harness `C:/temp/magic-ipc.json`** (di luar repo) yang gagal sekarang:
  ```json
  [
    { "js": "window.api.settings.set({ llmProvider: 'custom', customBaseUrl: 'http://127.0.0.1:8787/v1', llmModels: { custom: 'fake' } })", "wait": 500 },
    { "js": "window.api.magic.run({ field: 'storyIdea', mode: 'generate', text: '', language: 'id', durationSec: 60 }).then(r => console.log('CEK1 ' + JSON.stringify(r))).catch(e => console.log('CEK1 ERR ' + e.message))", "wait": 3000 },
    { "js": "window.api.magic.run({ field: 'storyIdea', mode: 'improve', text: '' }).then(r => console.log('CEK2 ' + JSON.stringify(r))).catch(e => console.log('CEK2 ERR ' + e.message))", "wait": 1000 },
    { "wait": 100, "quit": true }
  ]
  ```
  Catatan: kalau `settings.set` tidak menerima `llmModels` parsial, kirim objek `llmModels` lengkap hasil `settings.get()`.

- [ ] **Step 3: Jalankan dan pastikan gagal**
  Run (PowerShell, terminal lain: `node scripts/fake-llm.mjs`):
  `$env:STUDIO_USER_DATA="C:\temp\sm-magic"; $env:STUDIO_CAPTURE_PLAN="C:\temp\magic-ipc.json"; npm run dev`
  Expected: log berisi `CEK1 ERR` (window.api.magic undefined / No handler registered for 'magic:run').

- [ ] **Step 4: Implementasi `src/shared/magic.ts`** sesuai Interfaces.

- [ ] **Step 5: Implementasi `runMagic` di `src/main/magic.ts`**
  - Validasi: `mode === 'improve'` dengan teks kosong → `throw new Error('Tulis dulu teksnya, baru bisa diperkaya.')`.
  - `context(req): string[]` membangun baris konteks dalam bahasa Inggris dari id (proyek: judul, sinopsis, bahasa,
    durasi, gaya `getStyle(styleId).name`, template `getTemplate(id).name` + `.guidance`; klip: `title`, `story`,
    `narration`, `visualPrompt`; pemeran proyek: nama + deskripsi; seri: `premise`, `bible.world/tone/rules`, judul
    dan ringkasan episode sebelumnya). Untuk Home dipakai field longgar `language`/`durationSec`/`templateId`/
    `styleId`/`episodeCount`.
  - `FIELD_BRIEFS: Record<MagicField, { role: string; output: 'target' | 'english'; improve: string; generate: string }>` —
    instruksi bahasa Inggris. Isi yang wajib dikunci:
    - `storyIdea`: ide video storytelling faceless YouTube; hasil 1 paragraf 4–8 kalimat (lebih panjang untuk durasi
      ≥ 180 dtk) memuat tokoh utama bernama, tempat & era, konflik, titik balik, akhir cerita, dan suasana. Cocok
      untuk durasi yang diminta.
    - `explainerTopic`: topik video penjelasan sesuai template (`guidance` template): sebut untuk siapa, hasil akhir
      penonton, 3–7 poin/langkah yang akan dibahas; template `news` → pertahankan tanggal & sumber yang ditempel, jangan
      mengarang fakta.
    - `seriesPremise` / `explainerSeriesTopic`: premis seri untuk `episodeCount` episode: dunia, tokoh tetap (cerita)
      atau kurikulum berurutan (penjelasan), konflik besar/arc, pola tiap episode.
    - `episodeSynopsis`: 3–5 kalimat seperti `OUTLINE_PROPS.synopsis` di `story.ts`: situasi, kejadian utama, akhir
      episode; konsisten dengan bible dan ringkasan episode sebelumnya.
    - `characterLook`: bahasa Inggris, format `LOOK_HINT` (`CharacterModal.tsx:26`): ciri tubuh dulu (spesies,
      gender, usia, tinggi/postur, kulit, wajah, rambut), lalu `Default outfit: ...` dengan warna dan satu aksesori; tanpa
      kata gaya seni.
    - `visualPrompt`: bahasa Inggris, tepat format baris `Setting:` / `Action:` / `Wardrobe:` / `Framing:` / `Avoid:`
      seperti `visualText` (`story.ts:318`); nama pemeran ditulis persis seperti di daftar pemeran; tanpa teks di gambar.
    - `videoPrompt`: bahasa Inggris, 1–2 kalimat, aturan sama dengan deskripsi `motion` (`story.ts:269-273`).
    - `sceneImagePrompt`: bahasa Inggris, satu deskripsi gambar tanpa teks/huruf, cocok dengan heading/body adegan.
    - Semua: `improve` → "Keep every fact, name and decision the user wrote; fix and enrich, do not change the story."
      `generate` → "Write a fresh, specific idea; if the user text is not empty, treat it as a loose theme." Tanpa
      markdown, tanpa judul, tanpa komentar.
  - Panggil `generateJson<{ text?: unknown }>({ system, prompt, schema: MAGIC_SCHEMA, name: 'magic' })` dengan
    `MAGIC_SCHEMA = { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] }`.
  - Hasil: `cleanMagicText(str(r.text), req.field)`; kosong → `throw new Error('Magic tidak menghasilkan teks. Coba lagi.')`.

- [ ] **Step 6: Daftarkan IPC** — `handle('magic:run', (req: MagicRequest) => runMagic(req))`, tipe `magic` di
  `Api` (`src/shared/api.ts`) dengan JSDoc "Rewrites or invents the text of one prompt field with the active LLM.",
  `magic: { run: call('magic:run') }` di preload.

- [ ] **Step 7: Jalankan harness lagi**
  Expected: `CEK1 {"text":"MAGIC: ..."}` dan `CEK2 ERR Tulis dulu teksnya, baru bisa diperkaya.`
  Lalu matikan `fake-llm` dan jalankan ulang: `CEK1 ERR Tidak bisa terhubung ke http://127.0.0.1:8787/v1: ...` (Review Focus #2).

- [ ] **Step 8: `npm run typecheck` lalu `npm run build`** — Expected: keduanya tanpa error.

- [ ] **Step 9: Commit**
  ```bash
  git add src/shared/magic.ts src/main/magic.ts scripts/fake-llm.mjs src/main/ipc.ts src/shared/api.ts src/preload/index.ts
  git commit -m "Tambah layanan Magic untuk memperkaya dan membuat ide prompt"
  ```

### Task 2: Komponen `MagicButton` + hook `useMagic`, dipasang di langkah Ide (cerita & penjelasan)

**Files:**
- Create: `src/renderer/src/components/Magic.tsx`
- Modify: `src/renderer/src/pages/project/IdeaStep.tsx:228-245`
- Modify: `src/renderer/src/pages/project/explainer/ExplainerIdeaStep.tsx:91-108`

**Interfaces:**
- Consumes: `window.api.magic.run`, `MagicRequest`, `MagicField`, `magicModes` (Task 1); `useApp().toast(kind, text, action)`;
  `Popover` (`components/Popover.tsx`); `errorText` (`lib/format`).
- Produces:
  ```ts
  export function useMagic(opts: {
    value: string
    onApply: (text: string) => void
    request: () => Omit<MagicRequest, 'mode' | 'text'>
  }): { busy: boolean; run: (mode: MagicMode) => Promise<void> }
  export function MagicButton(props: {
    magic: ReturnType<typeof useMagic>
    value: string
    size?: 'sm' | 'md'          // sm for compact fields (storyboard, series), md for the big idea boxes
    label?: string              // aria/title, default "Magic"
  }): JSX.Element
  ```
  - `run`: simpan `before = value`, `busy = true`, panggil API dengan `{ ...request(), mode, text: value }`, lalu
    `onApply(result.text)` dan `toast('success', mode === 'improve' ? 'Teks diperkaya dengan Magic.' : 'Ide baru dari Magic sudah dipasang.', { label: 'Urungkan', run: () => onApply(before) })`.
    Error → `toast('error', errorText(e))`, isi kolom tidak diubah. Panggilan ganda saat `busy` diabaikan.
  - `MagicButton`: tombol pil kecil berikon `Wand2` + teks "Magic" (spinner saat `busy`). Kalau `magicModes(value)`
    hanya `['generate']` klik langsung menjalankan `generate`; kalau dua mode, klik membuka `Popover` berisi dua baris:
    "Perkaya teks ini" (sub: "Detail ditambah, isi ceritamu tetap") dan "Buat ide baru" (sub: "Teks sekarang dipakai
    sebagai tema"). `data-magic` attribute di tombol untuk harness.

- [ ] **Step 1: Tulis rencana harness `C:/temp/magic-idea.json`** (gagal sekarang): set LLM palsu (seperti Task 1),
  `{"main":"seed"}`, buka proyek, isi sinopsis lewat `window.api`/store, klik `[data-magic]`, klik baris "Perkaya",
  lalu pada `wait` 500 log `CEK-RO ' + document.querySelector('#sinopsis').readOnly`, `wait` 2500 log
  `CEK-VAL ' + document.querySelector('#sinopsis').value.slice(0,6)`, klik tombol `Urungkan` di toast, log `CEK-UNDO`
  dengan nilai kolom; screenshot `C:/temp/magic-idea.png`. Ulangi untuk `seedExplainer` dengan `#topik`.
- [ ] **Step 2: Jalankan; Expected:** `element tidak ada: [data-magic]`.
- [ ] **Step 3: Implementasi `components/Magic.tsx`** sesuai Interfaces.
- [ ] **Step 4: Pasang di `IdeaStep`** — tombol di baris label "Ide cerita atau sinopsis" (rata kanan); textarea
  dapat `readOnly={magic.busy}`; `request: () => ({ field: 'storyIdea', projectId: project.id })`;
  `onApply: (synopsis) => updateProject({ synopsis })`. Panggil `flush()` sebelum `run` tidak diperlukan karena teks
  dikirim langsung.
- [ ] **Step 5: Pasang di `ExplainerIdeaStep`** — sama, `field: 'explainerTopic'`, kolom `#topik`.
- [ ] **Step 6: Jalankan harness; Expected:** `CEK-RO true`, `CEK-VAL MAGIC:`, `CEK-UNDO` sama dengan sinopsis awal,
  untuk kedua jenis proyek. Periksa screenshot: tombol tidak menggeser layout pada jendela 1180×720.
- [ ] **Step 7: `npm run typecheck` dan `npm run build`** — bersih.
- [ ] **Step 8: Commit** — `git commit -m "Tombol Magic di kolom ide cerita dan topik video penjelasan"`

### Task 3: Magic di Beranda (satu video dan seri, cerita dan penjelasan)

**Files:**
- Modify: `src/renderer/src/pages/Home.tsx:375-430`

**Interfaces:**
- Consumes: `useMagic`, `MagicButton` (Task 2).

- [ ] **Step 1: Rencana harness `C:/temp/magic-home.json`** — set LLM palsu; untuk empat kombinasi `kind` ×
  `mode` (klik Segmented), klik `[data-magic]` saat `#ide` kosong lalu log `CEK-HOME <kind>/<mode> ' + #ide.value.slice(0,6)`;
  satu kali cek request terkirim benar dengan `fake-llm` mencetak `field` dari pesan system ke stdout.
- [ ] **Step 2: Jalankan; Expected:** `element tidak ada: [data-magic]`.
- [ ] **Step 3: Implementasi** — `field` dipilih dari `kind`/`mode`: story+single → `storyIdea`, explainer+single →
  `explainerTopic`, story+series → `seriesPremise`, explainer+series → `explainerSeriesTopic`. `request` mengirim
  `language`, `durationSec`, `templateId` (hanya explainer), `styleId` (hanya cerita), `episodeCount` (hanya seri).
  `onApply: setSynopsis`. Textarea `readOnly={magic.busy}`; tombol "Buat"/"Sekali klik" dinonaktifkan selama `busy`.
  Tombol Magic diletakkan di baris label bersama Segmented (rata kanan, `size="sm"`).
- [ ] **Step 4: Jalankan harness; Expected:** empat baris `CEK-HOME ... MAGIC:` dan `fake-llm` mencetak empat `field` berbeda.
- [ ] **Step 5: `npm run typecheck` dan `npm run build`** — bersih.
- [ ] **Step 6: Commit** — `git commit -m "Tombol Magic di kolom ide Beranda"`

### Task 4: Magic di halaman seri (premis bible dan sinopsis episode)

**Files:**
- Modify: `src/renderer/src/pages/series/AutosaveText.tsx`
- Modify: `src/renderer/src/pages/series/SeriesBible.tsx:59-61`
- Modify: `src/renderer/src/pages/series/SeriesPage.tsx:400-408`

**Interfaces:**
- Consumes: `useMagic`, `MagicButton` (Task 2).
- Produces: `AutosaveText` mendapat prop `readOnly?: boolean` dan `applyRef?: RefObject<((text: string) => void) | null>`
  yang diisi fungsi "set teks + simpan sekarang" (melewati penjaga `dirty`/`focused`, karena teks dari Magic memang
  harus menggantikan isi kolom).

- [ ] **Step 1: Rencana harness `C:/temp/magic-series.json`** — buat seri lewat `window.api.series.create` (premis
  pendek) dan satu episode (`{"main":"seedEpisode"}`), buka halaman seri, fokuskan textarea premis lalu klik
  `[data-magic="seriesPremise"]` → "Perkaya"; setelah 2500 ms log `CEK-PREMIS` dari `window.api.series.get(id)`
  (nilai tersimpan, bukan hanya tampilan); hal yang sama untuk `[data-magic="episodeSynopsis"]`; lalu `Urungkan` dan log lagi.
- [ ] **Step 2: Jalankan; Expected:** `element tidak ada`.
- [ ] **Step 3: Tambah `readOnly` dan `applyRef` di `AutosaveText`.** `apply(text)`: batalkan timer, set
  `latest`/`text`, `dirty = true`, langsung `commit()`.
- [ ] **Step 4: Pasang di `BiblePanel`** — `field: series.kind === 'explainer' ? 'explainerSeriesTopic' : 'seriesPremise'`,
  `seriesId: series.id`; tombol di samping label `Part` premis. `onApply` memanggil `applyRef.current?.(text)`.
- [ ] **Step 5: Pasang di kartu episode** — `field: 'episodeSynopsis'`, `projectId: ep.id`, `seriesId: series.id`;
  tombol `size="sm"` di bawah kanan kolom sinopsis. Tidak tampil kalau episode `locked`.
- [ ] **Step 6: Jalankan harness; Expected:** `CEK-PREMIS MAGIC:` tersimpan di database meski kolom sedang fokus
  (Review Focus #4), dan setelah `Urungkan` nilai tersimpan kembali ke teks awal (Review Focus #5).
- [ ] **Step 7: `npm run typecheck` dan `npm run build`** — bersih.
- [ ] **Step 8: Commit** — `git commit -m "Tombol Magic di premis seri dan sinopsis episode"`

### Task 5: Magic di prompt per adegan dan penampilan pemeran

**Files:**
- Modify: `src/renderer/src/pages/project/CharacterModal.tsx:55-70,140-155`
- Modify: `src/renderer/src/pages/project/StoryboardStep.tsx:240-262,410-428`
- Modify: `src/renderer/src/pages/project/explainer/ScenesStep.tsx:194-205`

**Interfaces:**
- Consumes: `useMagic`, `MagicButton` (Task 2); `runMagic` membaca konteks klip dari `clipId` (Task 1). Renderer
  memanggil `flush()` dari `useProject` sebelum `run` supaya alur adegan/narasi yang baru diketik ikut terbaca di main.
  Karena itu `useMagic` mendapat opsi tambahan `before?: () => Promise<void>` yang dijalankan sebelum panggilan API.

- [ ] **Step 1: Rencana harness `C:/temp/magic-scene.json`** — `{"main":"seed"}`, buka Storyboard, buka "Edit prompt
  visual" pada klip 1, klik `[data-magic="visualPrompt"]`, log nilai prompt; `[data-magic="videoPrompt"]` sama;
  buka modal pemeran, kosongkan "Penampilan", klik `[data-magic="characterLook"]` (langsung generate), log nilai;
  `{"main":"seedExplainer"}`, set adegan 1 `imageMode: 'ai'`, klik `[data-magic="sceneImagePrompt"]`, log nilai.
  `fake-llm` mencetak potongan pesan user supaya terlihat konteks klip (judul adegan, nama pemeran) ikut terkirim.
- [ ] **Step 2: Jalankan; Expected:** `element tidak ada`.
- [ ] **Step 3: Tambah opsi `before` di `useMagic`.**
- [ ] **Step 4: Pasang empat tombol** (`size="sm"`, di baris label/tombol yang sudah ada di atas tiap kolom):
  `characterLook` (`projectId`, `characterName: name`), `visualPrompt` (`clipId`), `videoPrompt` (`clipId`),
  `sceneImagePrompt` (`clipId`). `onApply` memakai setter yang sudah ada (`setDescription`/`updateCharacter`,
  `updateClip`, `onScene`). Kolom `readOnly` selama `busy`.
- [ ] **Step 5: Jalankan harness; Expected:** keempat kolom berisi `MAGIC:` dan stdout `fake-llm` memuat judul adegan
  dan nama pemeran demo.
- [ ] **Step 6: `npm run typecheck` dan `npm run build`** — bersih.
- [ ] **Step 7: Commit** — `git commit -m "Tombol Magic di prompt visual, gerak video, gambar adegan, dan penampilan pemeran"`

### Task 6: Uji dengan LLM sungguhan + dokumentasi

**Files:**
- Modify: `docs/layanan-ai.md` (bagian baru "Magic")
- Modify: `docs/pengembangan.md` (cara memakai `scripts/fake-llm.mjs` di dev harness)
- Modify: `CHANGELOG.md` (entri "Belum dirilis")

- [ ] **Step 1: Uji manual dengan model asli** (kunci milik pengguna di folder data sementara, bukan data asli):
  9Router dan Claude, masing-masing satu kali `storyIdea` improve, `explainerTopic` generate untuk template `news`
  dan `tutorial`, `visualPrompt` improve. Expected: bahasa keluaran sesuai Keputusan desain #5, format baris
  `Setting:/Action:/...` utuh, tidak ada markdown, nama pemeran tidak berubah, berita tidak mengarang tanggal/sumber.
  Catat prompt yang perlu disetel dan perbaiki `FIELD_BRIEFS` bila perlu.
- [ ] **Step 2: Tulis dokumentasi** — `layanan-ai.md`: daftar kolom, dua aksi, LLM aktif yang dipakai, konteks yang
  dikirim, dan bahwa teks dikirim ke penyedia LLM pengguna. `pengembangan.md`: contoh rencana harness dengan `fake-llm`.
- [ ] **Step 3: `npm run typecheck` dan `npm run build`** — bersih.
- [ ] **Step 4: Commit** — `git commit -m "Dokumentasi fitur Magic"`

## Ide lanjutan (di luar rencana ini)

- Pilihan model khusus Magic (model cepat/murah) di Pengaturan.
- Magic untuk world/tone/aturan bible, narasi per adegan (dengan menjaga durasi), dan judul video.
- Beberapa varian sekaligus (pilih 1 dari 3 ide) untuk aksi "Buat ide baru".
