# Arsitektur

## Teknologi

| Bagian | Teknologi |
|---|---|
| Aplikasi desktop | Electron 44 (Chromium + Node.js) |
| Build | electron-vite 5, Vite 7 |
| Tampilan | React 19, Tailwind CSS v4 (token di `@theme`), Zustand untuk state |
| Bahasa | TypeScript strict |
| Database | SQLite lewat better-sqlite3 |
| Video/audio | FFmpeg (`ffmpeg-static`), libass untuk caption |
| Video penjelasan | Remotion 4.0.539: `@remotion/player` di renderer, `@remotion/renderer` + Chrome Headless Shell di main ([remotion.md](remotion.md)) |
| Pengenal suara | whisper.cpp (`resources/whisper/whisper-cli.exe`) + model Whisper Small |
| AI | Gemini (`@google/genai`), API OpenAI-compatible (OpenRouter, Groq, custom), ElevenLabs, Higgsfield |

## Tiga proses

```
┌──────────────── proses utama (Node, src/main) ────────────────┐
│ database, file proyek, kunci API, panggilan AI, FFmpeg, Whisper │
│ ipc.ts ◄── invoke ── preload ── window.api ── renderer          │
│ events.ts ──► webContents.send ──► window.api.on.* ──► store    │
└────────────────────────────────────────────────────────────────┘
┌─ preload (src/preload) ─┐   ┌─ renderer (src/renderer, React) ─┐
│ contextBridge: window.api│   │ halaman, editor, pratinjau        │
└──────────────────────────┘   └───────────────────────────────────┘
```

- **Renderer** tidak punya akses Node. Semua yang menyentuh disk, jaringan berkunci, atau FFmpeg lewat
  `window.api` (tipe lengkapnya di `src/shared/api.ts`).
- **Preload** hanya meneruskan panggilan: `call('kanal')` → `ipcRenderer.invoke`. Event dari main diterima lewat
  `listen('event:...')`.
- **Main** mendaftarkan handler di `src/main/ipc.ts`. Handler melempar `Error` dengan pesan berbahasa Indonesia
  yang langsung ditampilkan sebagai toast di renderer.

Jendela dibuat dengan `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.

## IPC (ringkasan)

| Kelompok | Kanal | Fungsi |
|---|---|---|
| `projects:*` | list, create, get, save, remove, duplicate | proyek dan snapshot (`list` tanpa episode seri) |
| `series:*` | list, create, get, update, remove, plan, addEpisode, updateEpisode, removeEpisode, updateCharacter, removeCharacter, syncCastIn, syncCastOut | seri, bible, pemeran bersama, episode |
| `story:*` | script, visuals, musicPrompt | LLM: naskah, rencana visual, prompt musik |
| `explainer:*` | scenes | LLM: adegan video penjelasan + narasi |
| `generate:*` | clipImage, clipVideo, clipTts, characterSheet, missingImages, missingVideos, missingTts, narration, syncCaptions, cancel, estimate | job AI dan estimasi kredit |
| `clips:*` | split, detachVoice, clearImage | edit timeline yang menyentuh file; lepas gambar adegan |
| `assets:*` | setActive, setWords, pickMusic, pickImage, pickSceneImage | aset klip, caption, musik, logo, screenshot adegan |
| `settings:*` | get, set, keys, setKey, setCustom, clearKey, revealKey, testKey, voices | pengaturan dan kunci API |
| `models:list` | | daftar model live dari penyedia (dicache) |
| `export:*` | start, defaultFolder, pickFolder, reveal | ekspor MP4 (FFmpeg untuk cerita, Remotion untuk video penjelasan) |
| `whisper:*` | status, download, cancel, remove, openFolder | model Whisper lokal |
| `renderEngine:*` | status, install, remove, test | Chrome Headless Shell untuk Remotion, uji render |
| `app:*` | openExternal (hanya https), copyText, version | utilitas |

Event dari main ke renderer (`src/main/events.ts`): `event:job`, `event:clip` (patch kolom klip),
`event:character`, `event:asset`, `event:whisper`, `event:renderEngine`. `App.tsx` meneruskannya ke store.
Status unduhan Whisper dan mesin render didengarkan langsung oleh bagian Pengaturan-nya.

## Antrean job

`src/main/jobs.ts` menjalankan pekerjaan panjang sebagai **job** yang tersimpan di tabel `jobs` dan dikirim ke
renderer lewat `event:job` (progres, pesan, error).

| Antrean | Batas paralel | Dipakai untuk |
|---|---|---|
| `higgsfield` | 3 | gambar, lembar karakter, video |
| `ninerouter` | 2 | gambar dan lembar karakter lewat 9Router (memakai akun langganan pengguna, batasnya lebih ketat) |
| `tts` | 2 | narasi, TTS per klip |
| `whisper` | 1 | sinkron caption (Whisper memakai banyak core CPU) |
| `export` | 1 | ekspor MP4 (FFmpeg atau Remotion) |

Setiap job punya `AbortController` sehingga bisa dibatalkan (`generate:cancel`). Saat aplikasi dibuka lagi,
`resumeJobs()` melanjutkan permintaan Higgsfield yang sudah terkirim; job lain yang terputus ditandai gagal.

## Penyimpanan

Semua data pengguna ada di folder data aplikasi (`app.getPath('userData')`). Di Windows:
`%APPDATA%\Story Maker`.

```
%APPDATA%\Story Maker\
  studio.db                 SQLite: proyek, klip, pemeran, aset, job, pengaturan, kunci terenkripsi, cache
  projects\<id-proyek>\
    images\  videos\  audio\  music\  overlays\     file hasil generate dan unggahan
  series\<id-seri>\sheets\                         lembar karakter pemeran bersama seri
  models\whisper\ggml-small.bin                     model Whisper (diunduh dari Pengaturan)
  render-browser\                                    Chrome Headless Shell untuk Remotion (± 250 MB, diunduh sekali)
  tmp\                                              file sementara render/Whisper (dihapus setelah selesai)
```

- Nama folder proyek dan file berupa ID acak; judul hanya ada di database.
- Path aset disimpan **relatif** terhadap folder proyek (`assets.local_path`), sehingga proyek bisa disalin utuh.
- Menghapus proyek menghapus foldernya. Menghapus seri menghapus semua proyek episodenya dan folder seri.
- Folder data dari nama lama aplikasi (`Bang Story`, atau `Studio Cerita` sebelum itu) dipindahkan otomatis ke
  `Story Maker` saat pertama dibuka (`useDataFolder`).

### Protokol `studio://`

Renderer tidak memuat file lewat `file://`. Aset dan font disajikan oleh protokol khusus (`src/main/protocol.ts`)
dengan dukungan HTTP Range (supaya audio dan video bisa di-seek):

- `studio://asset/<id-proyek>/<path-relatif>`, dibuat oleh `assetUrl()` di `paths.ts`
- `studio://fonts/<file>.ttf`, font caption untuk `@font-face` di `styles.css` (juga font video penjelasan)
- `studio://series/<id-seri>/<path-relatif>`, lembar karakter seri, dibuat oleh `seriesFileUrl()` di `paths.ts`

Setiap host punya folder akarnya sendiri (`ROOTS` di `protocol.ts`), dan path yang keluar dari folder itu ditolak.

Saat render video penjelasan, browser Remotion tidak bisa membuka `studio://`; proses utama membuka server HTTP
sementara di `127.0.0.1` (port dan prefix acak) yang hanya menyajikan folder proyek dan font, lalu menutupnya
setelah render. Lihat [remotion.md](remotion.md#server-aset-sementara).

## Halaman (route renderer)

`store/app.ts` menyimpan halaman aktif: `home`, `settings` (dengan `back`), `project` (`ProjectPage`), dan `series`
(`SeriesPage` di `pages/series/`: bible, pemeran bersama, daftar episode, dan progres Sekali klik seri). Header
proyek episode menampilkan nama seri sebagai breadcrumb, dan tombol kembalinya membuka halaman seri.

## Simpan otomatis

Renderer menyimpan perubahan proyek sebagai **snapshot** (`projects:save` → `saveSnapshot` di `repo.ts`):
proyek, pemeran, dan klip. Penyimpanan berjalan 1,2 detik setelah perubahan terakhir, atau langsung dengan Ctrl+S
atau `flush()`.

Kolom aset klip (`image_asset_id`, `video_asset_id`, `audio_asset_id`) **tidak** ikut snapshot. Kolom itu milik
proses utama (hasil job, `setActive`, `split`) dan diubah dengan `patchClip` + `emit.clip`. Panggil `flush()`
sebelum IPC yang membaca klip dari database (generate, split, ekspor), supaya main melihat versi terbaru.

## Keamanan

- **CSP** di `src/renderer/index.html`: skrip hanya dari aplikasi sendiri; gambar/media dari `studio:`, `blob:`,
  `https:`; tidak ada iframe dari luar.
- **Navigasi** jendela utama ke luar aplikasi diblok (`will-navigate`); `window.open` dibuka di browser bawaan
  hanya untuk URL https (`setWindowOpenHandler` → `shell.openExternal`).
- **Kunci API** dienkripsi dengan Electron `safeStorage` (DPAPI di Windows, terikat akun pengguna) di tabel
  `secrets`. Lihat [layanan-ai.md](layanan-ai.md#kunci-api-byok).

## Switch Chromium

Di `src/main/index.ts`:

- `disable-direct-composition-video-overlays`: video tidak diserahkan ke overlay hardware Windows, yang
  membulatkan posisi ke piksel bulat dan membuat gerak kamera di atas video bergetar di pratinjau.
- Dev harness (`prepareHarness`) menambah switch supaya jendela uji tetap menggambar walau tertutup jendela lain.
