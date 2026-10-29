# Video penjelasan (Remotion)

Proyek jenis **Video penjelasan** (tutorial, tips, fakta, kutipan) tidak dirangkai dari gambar AI per adegan seperti
proyek cerita. Setiap adegan adalah layar yang didesain (tipografi, kode, screenshot, angka besar) dan dirender oleh
[Remotion](https://www.remotion.dev): komponen React yang digambar frame demi frame oleh browser tanpa jendela, lalu
disatukan dengan suaranya jadi MP4.

## Arsitektur

```
src/shared/explainer.ts      tipe adegan, template (palet, font, panduan LLM), normalisasi, waktu, buildExplainerInput
src/remotion/                komposisi Remotion (dibundel terpisah)
  index.ts, Root.tsx         registerRoot + daftar komposisi: Explainer, RenderTest
  explainer/ExplainerVideo   latar, adegan, transisi, caption, progres, logo, musik
  explainer/scenes.tsx       satu komponen per jenis adegan (title, step, tip, fact, quote, compare, outro)
  explainer/parts.tsx        kata yang muncul bergantian, jendela kode yang mengetik, gambar + kotak sorotan
  explainer/layout.ts        ukuran frame, area aman, ukuran huruf
  fonts.ts                   memuat font dari fontBase dengan delayRender
src/main/remotion.ts         mesin render: Chrome Headless Shell, server aset sementara, renderVideo, uji render
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
**Pengaturan › Umum › Mesin render video penjelasan** (dengan progres, tombol **Uji render**, dan **Hapus**).

- Ukuran: unduhan ±100 MB, terpasang ±250 MB.
- Lokasi: `<folder data>\render-browser\node_modules\.remotion\chrome-headless-shell\<platform>\...`
  (Windows: `%APPDATA%\Story Maker\render-browser\...`). `installed.json` di folder itu mencatat path dan ukurannya.
- Kenapa begitu: Remotion menentukan folder unduhan dari `process.cwd()` (naik ke `package.json` terdekat, lalu
  `node_modules/.remotion`). Working directory aplikasi terpasang bisa `C:\Program Files\...` yang tidak bisa
  ditulis. Karena itu `ensureRenderBrowser()` (`src/main/remotion.ts`) membuat `render-browser/package.json`
  kecil, menjalankan `ensureBrowser` dari folder itu (`process.chdir` sementara), lalu setiap render memakai
  `browserExecutable` dengan path hasilnya, sehingga render tidak lagi bergantung pada working directory.
- `ensureBrowser` memeriksa versi setiap kali dipanggil; setelah Remotion dinaikkan versinya, browser baru diunduh
  otomatis.
- Unduhan tidak bisa dibatalkan (API Remotion tidak menyediakan sinyal batal).
- Alternatif bila unduhan saat pertama pakai tidak bisa diandalkan (jaringan kantor yang memblokir unduhan): ikut
  paketkan browser (`REMOTION_ELECTRON_PACKAGE_BROWSER`, lihat dokumentasi Remotion untuk Electron). Installer
  bertambah ±250 MB, dan `browserExecutable` diarahkan ke salinan di `app.asar.unpacked`.

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

Pembatalan: `generate:cancel` → `AbortController` job → `makeCancelSignal().cancel()` milik Remotion.

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

Gambar adegan bersifat opsional (`imageMode`): `upload` (screenshot pengguna, ditampilkan utuh, bisa diberi kotak
sorotan), `ai` (prompt dari LLM lewat pipeline gambar yang sama dengan proyek cerita, selalu 16:9, tanpa pemeran),
atau `none`.

### Menambah template

1. Tambahkan entri di `EXPLAINER_TEMPLATES` (`src/shared/explainer.ts`): `id`, nama dan deskripsi, `sceneTypes`,
   `mainType`, tiga palet, font judul (`fonts`, dari `EXPLAINER_FONTS`), `numberFont`, dan `guidance` (bahasa
   Inggris, untuk LLM). Tambahkan id-nya ke tipe `ExplainerTemplateId`, contoh adegan di `SAMPLE_SCENES` (dipakai
   kartu template dan nilai bawaan komposisi), dan gaya gambar AI di `explainerImagePrompt`.
2. Beri tampilannya sendiri di `src/remotion/explainer/`: latar (`Backdrop`), cara adegan masuk/keluar
   (`SceneShell`), efek potongan (`Cuts`), caption (`Captions`), progres (`Progress`), dan variasi per jenis adegan
   di `scenes.tsx` (cabang `input.templateId`).
3. Font baru: taruh file di `resources/fonts` (+ lisensinya di `resources/licenses/fonts`), daftarkan di
   `EXPLAINER_FONTS`.
4. Uji: dev harness `{"main":"seedExplainer","template":"<id>"}` (proyek contoh dengan suara sintetis), lihat di
   Player, lalu ekspor dan bandingkan frame-nya.

### Menambah jenis adegan

Tambahkan id di `SceneType` dan `SCENE_TYPES` (field yang dipakai), komponen di `scenes.tsx` + entri di `SCENES`
(`ExplainerVideo.tsx`), label form di `ScenesStep.tsx` bila perlu, lalu izinkan di `sceneTypes` template yang
memakainya. Field baru di `ExplainerScene` harus ditambahkan juga di `emptyScene`, `normalizeScene`, dan skema
JSON di `src/main/explainer.ts` (mode strict: semua field wajib, string kosong kalau tidak dipakai).

## Menguji

- Pengaturan › Umum › **Uji render**: render komposisi `RenderTest` 2 detik (bundle, browser, compositor, server
  font). Cara tercepat memeriksa mesin render di komputer pengguna.
- Dev harness: `{"main":"seedExplainer","template":"tips"}` membuat proyek contoh; `{"main":"sceneImage",
  "clipIndex":2,"file":"C:/gambar.png"}` memasang gambar ke adegan (dialog file tidak bisa diotomatisasi);
  ekspor lewat `window.api.exporter.start(...)` di langkah `js`.
- Build terpaket tanpa installer (menguji path `resources/remotion`, `app.asar.unpacked`, dan unduhan browser):
  `npx electron-builder --dir` (di Linux: `--linux --dir`). Dev harness tidak aktif di build terpaket; jalankan
  dengan `--remote-debugging-port=9333` dan panggil `window.api.renderEngine.test()` lewat DevTools Protocol.
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

`renderMedia` dipanggil tanpa `licenseKey`, jadi aplikasi tidak mengirim *usage event* ke remotion.pro (dengan
`'free-license'`, Remotion mengirim event anonim dan bisa menahan selesainya render hingga puluhan detik saat
offline). Player diberi `acknowledgeRemotionLicense` supaya tidak mencetak peringatan lisensi ke console.
