# Video penjelasan (Remotion)

Proyek jenis **Video penjelasan** (tutorial, tips, fakta, kutipan, perbandingan, berita) tidak dirangkai dari gambar
AI per adegan seperti proyek cerita. Setiap adegan adalah layar yang didesain (tipografi, kode, screenshot, angka besar) dan dirender oleh
[Remotion](https://www.remotion.dev): komponen React yang digambar frame demi frame oleh browser tanpa jendela, lalu
disatukan dengan suaranya jadi MP4.

## Arsitektur

```
src/shared/explainer.ts      tipe adegan, template (palet, font, panduan LLM), normalisasi, waktu, buildExplainerInput
src/remotion/                komposisi Remotion (dibundel terpisah)
  index.ts, Root.tsx         registerRoot + daftar komposisi: Explainer, RenderTest
  explainer/ExplainerVideo   latar (dan hiasannya), adegan, transisi, progres, logo, musik
  explainer/scenes.tsx       adegan umum (title, step, tip, fact, quote, compare, outro)
  explainer/versus.tsx       template Perbandingan: judul A vs B, ronde (versus), plus minus, putusan
  explainer/news.tsx         template Berita: pembuka, berita (lower third), poin penting, bug + ticker, transisi
  explainer/captions.tsx     caption narasi: CaptionLine (dipakai juga pemilih gaya di editor) + Captions
  explainer/parts.tsx        kata yang muncul bergantian, jendela kode yang mengetik, gambar + kotak sorotan, FitBox
  explainer/layout.ts        ukuran frame, area aman, pita caption, zona teks, ukuran huruf
  fonts.ts                   memuat font dari fontBase dengan delayRender
src/main/remotion.ts         mesin render: Chrome Headless Shell, server aset sementara, renderVideo, uji render
src/main/renderBrowserWorker.ts   ensureBrowser di utility process (unduhan browser yang bisa dibatalkan)
src/main/explainer.ts        LLM (adegan + narasi), gambar unggahan, job ekspor + loudnorm
src/renderer/src/components/ExplainerPreview.tsx   Player, Thumbnail, pemilih template
src/renderer/src/pages/project/explainer/          langkah Ide & template, Adegan, Editor
```

**Pratinjau = ekspor.** Player di aplikasi (`@remotion/player`) dan render MP4 memakai komponen yang sama
(`ExplainerVideo`) dengan props dari fungsi yang sama (`buildExplainerInput`). Bedanya hanya alamat file:

| | Gambar, suara, musik, logo | Font |
|---|---|---|
| Pratinjau | `studio://asset/<id-proyek>/...` | `studio://fonts/` |
| Render | `http://127.0.0.1:<port>/<token>/asset/...` | `http://127.0.0.1:<port>/<token>/fonts/` |

Komposisi membawa reset CSS sendiri (`.sm-x`), karena preflight Tailwind milik aplikasi ikut berlaku di Player
tapi tidak di browser render. Tanpa reset, `box-sizing` dan jarak baris berbeda antara pratinjau dan ekspor.

## Versi dan paket

Semua paket Remotion dikunci di versi yang sama (**4.0.539**, tanpa `^`). Remotion 4 mendukung React 19.

| Paket | Bagian di `package.json` | Kenapa |
|---|---|---|
| `@remotion/renderer` | `dependencies` | dipakai proses utama saat aplikasi berjalan (di-externalize oleh electron-vite) |
| `react` | `dependencies` | `@remotion/renderer` memanggil `require('react/jsx-runtime')` saat dimuat |
| `@remotion/compositor-win32-x64-msvc`, `@remotion/compositor-linux-x64-gnu` | `optionalDependencies` | biner compositor + FFmpeg milik Remotion; npm hanya memasang yang cocok dengan OS |
| `remotion`, `@remotion/player`, `@remotion/bundler` | `devDependencies` | dibundel Vite (Player) dan webpack (bundle render) saat build |

Saat menaikkan versi, naikkan semuanya bersamaan, lalu jalankan uji render (lihat di bawah).

## Bundle

`scripts/bundle-remotion.mjs` memanggil `bundle()` dari `@remotion/bundler` dengan entry `src/remotion/index.ts`
dan menulis hasilnya ke `out/remotion` (±16 MB).

- `npm run build` = `electron-vite build` lalu bundle. `npm run dev` membundel dengan `--if-stale` (dilewati kalau
  `src/remotion`, `src/shared`, skrip, dan `package-lock.json` tidak berubah). Manual: `npm run bundle:remotion`.
- Alias `@shared` ditambahkan lewat `webpackOverride`.
- **Tanpa source map** (`devtool: false`): kalau `bundle.js` menyebut source map, renderer membacanya dari disk sebelum
  render, dan aplikasi gagal kalau file `.map` tidak ikut terpasang.
- Bundle tidak dibuat saat aplikasi berjalan (saran dokumentasi Remotion untuk Electron).

## Paket installer

`electron-builder.yml`:

```yaml
files:
  - '!out/remotion/**'            # bundle tidak masuk app.asar
extraResources:
  - from: out/remotion
    to: remotion                  # → resources/remotion, dibaca lewat process.resourcesPath
  - from: node_modules/remotion/LICENSE.md
    to: licenses/Remotion-LICENSE.md
asarUnpack:
  - node_modules/@remotion/compositor-*/**   # executable tidak bisa jalan dari dalam app.asar
```

`paths.ts`: `remotionBundleDir()` (terpasang: `resources/remotion`, pengembangan: `out/remotion`) dan
`remotionBinariesDir()` (terpasang: `resources/app.asar.unpacked/node_modules/@remotion/compositor-<platform>`,
pengembangan: `null` supaya Remotion mencarinya sendiri). Compositor Windows (±30 MB) hanya terpasang kalau
`npm install` dijalankan di Windows, jadi installer Windows harus dibuat di Windows.

Tambahan ukuran installer: bundle ±16 MB + compositor ±30 MB (Windows) + `@remotion/renderer` dan dependensinya.
Chrome tidak ikut dipaketkan.

## Chrome Headless Shell

Remotion menggambar frame dengan Chrome Headless Shell versi yang diuji untuk Remotion (157.0.8080.0 di 4.0.539).
Browser ini **diunduh sekali** dengan `ensureBrowser()`: otomatis saat ekspor video penjelasan pertama, atau dari
**Pengaturan › Umum › Mesin render video penjelasan** (dengan progres dan tombol **Batalkan**, **Uji render**, dan
**Hapus**).

- Ukuran: unduhan ±100 MB, terpasang ±250 MB.
- Lokasi: `<folder data>\render-browser\node_modules\.remotion\chrome-headless-shell\<platform>\...`
  (Windows: `%APPDATA%\Story Maker\render-browser\...`). `installed.json` di folder itu mencatat path dan ukurannya.
- Kenapa begitu: Remotion menentukan folder unduhan dari `process.cwd()` (naik ke `package.json` terdekat, lalu
  `node_modules/.remotion`). Working directory aplikasi terpasang bisa `C:\Program Files\...` yang tidak bisa
  ditulis. Karena itu `ensureRenderBrowser()` (`src/main/remotion.ts`) membuat `render-browser/package.json`
  kecil, menjalankan `ensureBrowser` di proses terpisah yang working directory-nya folder itu (lihat di bawah), lalu
  setiap render memakai `browserExecutable` dengan path hasilnya, sehingga render tidak bergantung pada working
  directory.
- `ensureBrowser` memeriksa versi setiap kali dijalankan; setelah Remotion dinaikkan versinya, browser baru diunduh
  otomatis. Pemeriksaan itu cukup sekali per sesi aplikasi: path yang sudah dipastikan disimpan (`verified`), jadi
  ekspor berikutnya tidak membuka proses baru.
- Alternatif bila unduhan saat pertama pakai tidak bisa diandalkan (jaringan kantor yang memblokir unduhan): ikut
  paketkan browser (`REMOTION_ELECTRON_PACKAGE_BROWSER`, lihat dokumentasi Remotion untuk Electron). Installer
  bertambah ±250 MB, dan `browserExecutable` diarahkan ke salinan di `app.asar.unpacked`.

### Unduhan yang bisa dibatalkan (utility process)

`ensureBrowser` milik Remotion 4.0.539 tidak bisa dibatalkan: unduhannya diberi `new AbortController().signal` yang
tidak pernah dibatalkan, dan opsinya tidak menerima sinyal. Jadi `ensureBrowser` dijalankan di **Electron utility
process** (`src/main/renderBrowserWorker.ts`), dan membatalkan berarti mematikan proses itu.

- **Kenapa utility process.** `utilityProcess.fork` adalah cara resmi Electron menjalankan kode Node di proses
  sendiri: skripnya dimuat dari dalam `app.asar`, opsi `cwd` langsung memberi working directory `render-browser`
  (proses utama tidak perlu `process.chdir` lagi), tidak bergantung pada fuse `runAsNode` seperti
  `child_process.fork` dengan `ELECTRON_RUN_AS_NODE`, dan Electron ikut mengakhirinya saat aplikasi ditutup. Worker
  thread tidak cukup: `process.chdir` tidak tersedia di worker, dan `process.cwd()`-nya milik proses utama.
- **Alasan lain.** Remotion merangkai setiap panggilan `ensureBrowser` dengan `.then` pada panggilan sebelumnya. Satu
  panggilan yang gagal di proses utama (misalnya jaringan putus) membuat semua panggilan berikutnya ikut gagal,
  termasuk yang ada di dalam setiap `renderMedia`, sampai aplikasi dibuka ulang. Di proses sendiri, kegagalan itu
  hilang bersama prosesnya.
- **Build.** Skrip worker diimpor dengan akhiran `?modulePath` milik electron-vite
  (`import browserWorker from './renderBrowserWorker?modulePath'`). electron-vite membundelnya sebagai file
  sendiri di `out/main/renderBrowserWorker-<hash>.js` (dengan `@remotion/renderer` tetap eksternal) dan mengganti
  impornya dengan path absolut file itu, baik di mode pengembangan maupun di `app.asar` aplikasi terpasang.
  Tipe impor `?modulePath` datang dari `src/main/env.d.ts` (`electron-vite/node`).
- **Pesan.** Worker mengirim `download` (unduhan dimulai), `progress` (paling sering 10 kali per detik), lalu `done`
  dengan path browser atau `error`. Proses utama mematikan worker setelah pesan terakhir, dan hasilnya baru dipakai
  setelah prosesnya benar-benar keluar (event `exit`), jadi tidak ada lagi yang menulis ke folder.
- **Penanda unduhan belum selesai.** Sebelum Remotion mengambil satu byte pun, worker menulis
  `render-browser/download-incomplete`. File itu dihapus setelah browser terpasang. Selama penanda ada, browser
  dianggap belum terpasang (`readInstalled`), dan unduhan berikutnya mengosongkan folder dulu. Jadi unduhan yang
  terputus karena dibatalkan, gagal, aplikasi ditutup, atau crash selalu dikenali dan dibersihkan.
- **Batalkan** (Pengaturan › Umum › Mesin render, tombol di samping progres; IPC `renderEngine:cancel`): worker
  dimatikan, setelah keluar `render-browser/node_modules`, `installed.json`, dan penandanya dihapus, lalu statusnya
  `cancelled: true` (bukan error) dan panel menulis "Unduhan dibatalkan…". Ekspor yang sedang menunggu unduhan itu
  gagal dengan pesan "Unduhan mesin render dibatalkan."
- **Ekspor yang memulai unduhan.** Ekspor video penjelasan pertama mengunduh browser sendiri. Membatalkan job
  ekspor itu (`generate:cancel`) ikut membatalkan unduhannya, **kecuali** unduhan itu dimulai atau juga ditunggu
  dari Pengaturan (`manual`) atau oleh render lain; dalam hal itu hanya ekspornya yang berhenti menunggu.
- **Aplikasi ditutup saat mengunduh.** `will-quit` memanggil `stopRenderBrowserDownloadOnQuit()`: worker dimatikan
  dan folder dibersihkan tanpa menunggu. Kalau ada file yang masih terkunci (Windows, antivirus), penandanya
  tertinggal dan unduhan berikutnya membersihkannya.
- `kill()` milik utility process tidak berbuat apa-apa sebelum prosesnya berjalan, jadi pembatalan yang sangat
  cepat dieksekusi di event `spawn`.
- Satu proses unduhan pada satu waktu: run baru menunggu run sebelumnya selesai, termasuk pembersihannya.

## Server aset sementara

Browser render tidak bisa membuka `studio://`. Selama render, `startAssetServer(projectId)` membuka server HTTP di
`127.0.0.1` dengan port acak dan prefix path acak (16 byte heksadesimal). Server hanya menyajikan folder proyek
itu (`/asset/...`) dan font bawaan (`/fonts/...`), menolak path di luar folder, mendukung Range, dan memberi header
`Access-Control-Allow-Origin: *` (font dimuat lintas origin dari server bundle milik Remotion). Server ditutup
setelah render selesai, gagal, atau dibatalkan.

## Ekspor

`export:start` memilih ekspor sesuai jenis proyek (`exportProject` di `explainer.ts`). Untuk video penjelasan:

1. Job `export` (provider `remotion`) di antrean `export`, sama seperti ekspor cerita.
2. `renderVideo()`: unduh/cek browser (progres 0–5%), `selectComposition` + `renderMedia` (H.264, AAC 192k,
   JPEG kualitas 92, `scale` 2/3 untuk 720p, 1 untuk 1080p, 2 untuk 4K, `enforceAudioTrack`), progres 6–90%.
3. Satu pass FFmpeg: video disalin (`-c:v copy`), audio `loudnorm=I=-14:LRA=11:TP=-1.5` (kalau dipilih),
   `+faststart`.
4. `.srt` opsional dari kata narasi per adegan (`timelineChunks`).

Pembatalan: `generate:cancel` → `AbortController` job → `makeCancelSignal().cancel()` milik Remotion. Saat ekspor
masih mengunduh mesin render, sinyal yang sama menghentikan unduhannya (lihat
[Unduhan yang bisa dibatalkan](#unduhan-yang-bisa-dibatalkan-utility-process)).

## Template dan adegan

Satu klip = satu adegan. Isi adegan disimpan di `clips.scene_json` (`ExplainerScene`), narasinya tetap di
`clips.narration`, suara di `audio_asset_id`, gambar di `image_asset_id`. Panjang adegan =
`SCENE_LEAD_MS` (0,45 dtk, animasi masuk) + panjang suara + `SCENE_TAIL_MS` (0,7 dtk), minimal 2,5 dtk
(`sceneDurationMs`). Sebelum ada suara, panjangnya perkiraan dari teks narasi.

| Template | Jenis adegan | Tampilan |
|---|---|---|
| Tutorial langkah demi langkah | title, step, compare, outro | latar grid titik, nomor langkah mono, jendela terminal/kode yang mengetik, screenshot dalam jendela browser dengan kotak sorotan, progres bersegmen |
| Tips & trik | title, tip, compare, outro | kartu bergaya stiker (garis tinta, bayangan keras), angka raksasa, emoji, panel miring di setiap potongan |
| Fakta / countdown | title, fact, compare, outro | gelap sinematik, angka besar yang menghitung naik, gambar yang memudar ke latar, kilat putih di potongan |
| Kutipan / motivasi | title, quote, tip, outro | serif elegan, tanda kutip besar, kata muncul satu per satu, latar foto redup bergerak pelan |
| Perbandingan (A vs B) | title, versus, proscons, verdict, outro | poster adu: layar terbelah miring warna A (aksen) dan B (aksen kedua), cakram VS yang berubah jadi skor, ronde dengan angka besar per pilihan, setengah layar pemenang menyala dan yang kalah meredup, titik ronde di atas, putusan dengan cap dan skor akhir, transisi dua warna yang bertabrakan |
| Berita / rangkuman cepat | title, headline, points, fact, quote, outro | meja berita: tab kategori merah, judul dalam bar lower third yang tersapu masuk, daftar berita di pembuka, nomor berita bergaris, poin penting yang muncul satu per satu, bug desk + tanggal di pojok, ticker judul di bawah (16:9), pita merah bertuliskan kategori berikutnya di setiap potongan |

**Perbandingan.** Nama pilihan A dan B diambil dari adegan Judul (`leftTitle`/`rightTitle`), jadi cukup diubah di sana.
`versus` = satu ronde: `label` aspek, `heading` pertanyaan, `leftValue`/`rightValue` angka atau nilai per pilihan,
`left`/`right` 1–3 poin, `side` pemenang (`left`, `right`, `both` = seri). Pemenang terungkap di 55% adegan
(`verdictFrame`), saat cakram VS berganti jadi skor sementara (`tally`). `proscons`: `side` = pilihan yang dibahas,
`left` kelebihan, `right` kekurangan. `verdict`: `side` = pemenang akhir, `label` tulisan cap (mis. "Pemenang"),
`left`/`right` = kapan memilih A atau B; skor akhir dihitung dari semua ronde. Judul A vs B tidak memakai gambar
(`sceneShowsImage`).

**Berita.** `label` = kategori (di adegan Judul: nama desk, juga tampil di bug), `value` = tanggal, `author` = sumber.
`headline` memakai gambar AI atau screenshot sebagai latar penuh (16:9) atau bagian atas (9:16) dengan lower third di
atasnya; tanpa gambar, nomor berita tampil besar bergaris. `points` memakai `left` sebagai daftar. Panduan LLM
melarang mengarang peristiwa, angka, kutipan, tanggal, atau sumber; tanggal hari ini ikut dikirim di prompt.

Gambar adegan bersifat opsional (`imageMode`): `upload` (screenshot pengguna, ditampilkan utuh, bisa diberi kotak
sorotan), `ai` (prompt dari LLM lewat pipeline gambar yang sama dengan proyek cerita, selalu 16:9, tanpa pemeran),
atau `none`.

### Caption

Caption narasi punya empat gaya (`CAPTION_STYLES`) dan tiga posisi (`CAPTION_POSITIONS`), disimpan di
`theme.captionStyle` dan `theme.captionPosition`; `theme.captions === false` mematikannya. Tanpa pilihan, gaya
mengikuti template (`captionStyle`) dan posisinya di bawah. Dipilih di Editor › Tampilan video › Caption (kotak 1:1).

| Gaya | Tampilan | Potongan baris |
|---|---|---|
| Kotak (`box`) | kotak gelap, kata yang diucapkan menyala | 5 kata / 30 huruf |
| Karaoke (`karaoke`) | teks putih bergaris luar, warna mengisi kata demi kata mengikuti waktu kata | 6 / 32 |
| Minimal (`minimal`) | kecil dan tenang tanpa kotak, kata yang belum diucapkan redup | 8 / 44 |
| Besar (`bold`) | 2–3 kata besar dengan font judul template, huruf kapital, garis tebal, kata aktif melompat | 3 / 16 |

Warna kata aktif berasal dari template (`captionLit`), dengan cadangan kalau warnanya terlalu gelap atau sama dengan
latar (`captionLitColor`). `CaptionLine` tidak memakai hook Remotion, jadi pemilih gaya di editor menggambar komponen
yang sama dengan video. File `.srt` tetap dipotong dengan aturan bawaan (5 kata / 30 huruf).

**Area aman.** `frameOf` menyediakan *pita caption* (`f.caption`): setinggi dua baris gaya terpilih, di bawah (di atas
area tombol Shorts pada 9:16), tengah (sedikit di bawah tengah), atau atas (di bawah progres dan logo). Area isi
(`f.top`…`f.bottom`) selalu berhenti sebelum pita itu, jadi isi adegan tidak pernah tertutup caption. Semua adegan
menaruh isinya di `FitBox` (`Area` di `scenes.tsx`): kalau teks dari AI terlalu panjang, isinya diperkecil sebagai satu
kesatuan sampai muat, alih-alih tumpah ke caption. Ukurannya diukur sebelum frame dilukis, sama di Player dan render.
Gambar di bagian atas adegan Fakta dan Berita (9:16) ikut memendek kalau caption ada di tengah atau atas.

**Hiasan.** Hiasan latar tidak boleh berada di belakang teks: konfeti, cakram, dan cincin putus-putus template Tips
ditempatkan dan diukur dari zona teks (`textZones`: area isi + pita caption, ditambah logo dan progres); grid titik
Tutorial dan grid peta Berita disembunyikan di zona teks dengan `holeMask`. Penutup memakai cahaya lembut, bukan
cincin bergaris yang melintasi huruf.

### Palet dan gaya gambar AI

Setiap template punya lima sampai enam palet (`palettes`, yang pertama bawaan; Tutorial, Perbandingan, dan Berita juga
punya palet Korporat). Gaya gambar AI dipilih per proyek di
`theme.imageStyleId` dari `EXPLAINER_IMAGE_STYLES` (flat, isometrik 3D, ikon 3D, line art, doodle, papercut, cat air,
claymation, neon, blueprint teknik, foto realistis, foto sinematik); `auto` memakai gaya bawaan template di `explainerImagePrompt`.
Pemilihnya `components/ImageStylePicker.tsx`, dipasang di editor (Tampilan video) dan di panel gambar AI langkah
Adegan. Gaya baru: tambahkan entri dengan `prompt` bahasa Inggris tanpa teks, lalu ikon di `ImageStylePicker`.

### Menambah template

1. Tambahkan entri di `EXPLAINER_TEMPLATES` (`src/shared/explainer.ts`): `id`, nama dan deskripsi, `sceneTypes`,
   `mainType` (juga jenis cadangan untuk jenis adegan yang tidak dikenal dari LLM), tiga palet, font judul (`fonts`,
   dari `EXPLAINER_FONTS`), `numberFont`, `captionStyle` dan `captionLit` bawaan, dan `guidance` (bahasa Inggris,
   untuk LLM). Tambahkan id-nya ke tipe `ExplainerTemplateId`, contoh adegan di `SAMPLE_SCENES` (adegan ke-2 menjadi
   gambar kartu di pemilih template), dan gaya gambar AI di `explainerImagePrompt`. Jenis adegan yang tidak
   menampilkan gambar di template ini diatur di `sceneShowsImage`.
2. Beri tampilannya sendiri di `src/remotion/explainer/` (template besar sebaiknya di file sendiri, seperti
   `versus.tsx` dan `news.tsx`): latar (`Backdrop`), cara adegan masuk/keluar (`SceneShell`), efek potongan
   (`Cuts`), progres dan grafis tetap (`Progress`), dan layout per jenis adegan (`SCENES`, atau `sceneFor` untuk
   layout khusus template seperti judul). Taruh isi adegan di `FitBox` di dalam area `f` (bukan di pita caption),
   dan jangan menaruh hiasan di belakang `textZones(f)`.
3. Renderer: placeholder topik di `ExplainerIdeaStep.tsx` (`PLACEHOLDERS`) dan ikon kartu proyek di
   `ExplainerPreview.tsx` (`TEMPLATE_ICONS`); keduanya `Record` per template, jadi typecheck mengingatkan.
4. Font baru: taruh file di `resources/fonts` (+ lisensinya di `resources/licenses/fonts`), daftarkan di
   `EXPLAINER_FONTS`.
5. Uji: dev harness `{"main":"seedExplainer","template":"<id>"}` (proyek contoh dengan suara sintetis), lihat di
   Player, lalu ekspor dan bandingkan frame-nya. Periksa 16:9 dan 9:16, setiap gaya dan posisi caption, dan teks
   yang panjang.

### Menambah jenis adegan

Tambahkan id di `SceneType` dan `SCENE_TYPES` (field yang dipakai), komponen + entri di `SCENES`
(`ExplainerVideo.tsx`, sebuah `Record<SceneType, …>` sehingga typecheck mengingatkan), label form di
`ScenesStep.tsx` bila perlu, lalu izinkan di `sceneTypes` template yang memakainya. Field baru di `ExplainerScene`
harus ditambahkan juga di `emptyScene`, `normalizeScene`, dan skema JSON di `src/main/explainer.ts` (mode strict
OpenAI dan Gemini: objek adegan datar, semua field wajib, string kosong atau `[]` kalau tidak dipakai, enum untuk
pilihan tetap). Field adegan tinggal di `scene_json`, jadi tidak perlu migrasi database.

## Menguji

- Pengaturan › Umum › **Uji render**: render komposisi `RenderTest` 2 detik (bundle, browser, compositor, server
  font). Cara tercepat memeriksa mesin render di komputer pengguna.
- Dev harness: `{"main":"seedExplainer","template":"tips"}` membuat proyek contoh; `{"main":"sceneImage",
  "clipIndex":2,"file":"C:/gambar.png"}` memasang gambar ke adegan (dialog file tidak bisa diotomatisasi);
  ekspor lewat `window.api.exporter.start(...)` di langkah `js`.
- Build terpaket tanpa installer (menguji path `resources/remotion`, `app.asar.unpacked`, dan unduhan browser):
  `npx electron-builder --dir` (di Linux: `--linux --dir`). Dev harness tidak aktif di build terpaket; jalankan
  dengan `--remote-debugging-port=9333` dan panggil `window.api.renderEngine.test()` lewat DevTools Protocol.
- Membatalkan unduhan browser: dari langkah `js` harness, `window.api.renderEngine.install()`, tunggu
  `renderEngine.status()` sampai `received / total` mencapai 20–50%, lalu `renderEngine.cancel()` (atau klik
  **Batalkan**). Setelah itu tidak boleh ada proses `--type=utility --utility-sub-type=node.mojom.NodeService`
  (Linux: `ps`, Windows: Task Manager › Details, `Story Maker.exe`), dan `render-browser` hanya berisi
  `package.json`. Untuk ekspor: `exporter.start(...)` di proyek `seedExplainer` tanpa browser, lalu
  `generate.cancel(jobId)` saat pesan job "Mengunduh mesin render". Di jaringan cepat unduhannya selesai dalam 1–2
  detik; untuk menguji di mode pengembangan bisa diperlambat dengan skrip `--require` lewat `NODE_OPTIONS` yang
  menjeda `https.get` (build terpaket mengabaikan `NODE_OPTIONS`).
- Periksa hasil dengan ffprobe/ffmpeg seperti ekspor cerita (resolusi, durasi video vs audio, `ebur128` untuk
  loudness, cuplikan frame).

### Daftar periksa Windows

Semua di atas sudah diuji di Linux (mode pengembangan dan build terpaket `--dir`). Di Windows, periksa:

1. `npm install` memasang `node_modules/@remotion/compositor-win32-x64-msvc` (paket opsional, hanya di Windows).
2. `npm run dist` berhasil, dan di `dist/win-unpacked/resources/` ada `remotion/` (bundle) serta
   `app.asar.unpacked/node_modules/@remotion/compositor-win32-x64-msvc/` (berisi `remotion.exe` dan DLL FFmpeg).
3. Pasang installer, buka **Pengaturan › Umum › Mesin render video penjelasan**, klik **Unduh mesin render**:
   progres berjalan, lalu folder `%APPDATA%\Story Maker\render-browser\node_modules\.remotion\chrome-headless-shell\win64\`
   terisi, dan tidak ada folder `.remotion` atau `node_modules` baru di folder instalasi.
4. Klik **Uji render**: muncul "Render uji berhasil". Kalau Windows Defender/SmartScreen bertanya soal
   `chrome-headless-shell.exe` atau `remotion.exe`, izinkan, lalu catat di dokumentasi.
4a. Hapus mesin render, unduh lagi, lalu klik **Batalkan** di tengah unduhan: panel menulis "Unduhan dibatalkan…",
   folder `render-browser` hanya berisi `package.json` (tidak ada file `.zip`, `download.lock`, atau
   `download-incomplete`), dan di Task Manager tidak ada proses `Story Maker.exe` tambahan yang tertinggal. Ulangi,
   lalu tutup aplikasi di tengah unduhan: folder tetap bersih setelah ditutup, atau dibersihkan saat unduhan
   berikutnya kalau Windows masih mengunci filenya.
5. Buat Video penjelasan (mis. template Tutorial, 9:16), unggah screenshot dan tarik kotak sorotan, buat narasi,
   ekspor 1080p: MP4 terbuka di pemutar Windows, durasi video = audio, caption tidak menutupi isi, emoji tips
   tampil berwarna (Segoe UI Emoji).
6. Batalkan satu ekspor di tengah jalan: job berstatus dibatalkan, tidak ada file setengah jadi, dan tidak ada
   proses `chrome-headless-shell.exe`/`remotion.exe` yang tertinggal di Task Manager.
7. Pasang di folder dengan spasi atau karakter non-ASCII (mis. `C:\Program Files\Story Maker`) dan dengan nama
   pengguna Windows yang mengandung spasi: render tetap berjalan.
8. Antivirus atau firewall bisa menanyakan server lokal `127.0.0.1` (server aset dan server bundle Remotion);
   keduanya hanya mendengarkan di loopback.

## Lisensi Remotion

Remotion **bukan open source berlisensi OSI**, melainkan *source-available* dengan
[Remotion License](https://www.remotion.dev/docs/license): gratis untuk perorangan, organisasi nirlaba, dan
perusahaan dengan paling banyak 3 karyawan. Perusahaan yang lebih besar wajib membeli **Remotion Company License**
sendiri sebelum memakai fitur Video penjelasan. Teks lisensinya ikut terpasang di `licenses/Remotion-LICENSE.md`.

### Kunci lisensi Remotion

Pengaturan › Umum › Mesin render punya kolom opsional **Kunci lisensi Remotion** untuk perusahaan yang wajib punya
Company License. Kuncinya disimpan terenkripsi lewat `secrets.ts` dengan provider `remotion` (bukan penyedia AI: tidak
ada di daftar layanan AI dan tidak memblokir apa pun), tidak pernah dicetak, dan hanya dikirim ke remotion.pro.

- Tanpa kunci: `renderMedia` dipanggil tanpa `licenseKey`, persis seperti sebelumnya, dan tidak ada data yang dikirim
  ke remotion.pro. (Dengan `'free-license'`, Remotion mengirim event anonim dan bisa menahan selesainya render hingga
  puluhan detik saat offline, jadi nilai itu sengaja tidak dipakai.)
- Dengan kunci: `renderMedia({ licenseKey })` (opsi resmi sejak 4.0.409). Setelah render berhasil, Remotion mengirim
  satu *usage event* ke `https://www.remotion.pro/api/track/register-usage-point` berisi kunci, jenis event
  (`cloud-render`), status berhasil, dan `isProduction`; tidak ada isi video. `renderMedia` baru selesai setelah event
  terkirim (job menampilkan "Mencatat pemakaian lisensi Remotion"); kalau jaringan lambat, Remotion mencoba ulang
  sampai 4 kali dengan batas 10 detik per percobaan. Uji render di Pengaturan juga dilaporkan.
- Kunci yang salah tidak menggagalkan ekspor: remotion.pro menjawab `Invalid license key`, Remotion hanya mencatat
  "Failed to send usage event" di log proses utama (tanpa kuncinya), dan MP4 tetap jadi. Remotion tidak menyediakan
  cara memeriksa kunci tanpa mencatat render (endpoint `get-usage` menjawab 500 untuk kunci yang salah), jadi kunci
  hanya disimpan, tanpa tombol Tes.
- Kunci yang tersimpan tapi tidak bisa dibuka lagi (enkripsi berubah) menghentikan ekspor dengan pesan untuk
  memasukkannya ulang, supaya render perusahaan tidak diam-diam berjalan tanpa lisensi.

Player diberi `acknowledgeRemotionLicense` supaya tidak mencetak peringatan lisensi ke console.
