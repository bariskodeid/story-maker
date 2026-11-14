# Gaya Gambar AI, Palet, dan Thumbnail Video Penjelasan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 8 gaya gambar AI baru dan 12 palet baru untuk video penjelasan bertema sejarah dan sains, plus thumbnail
asli untuk 20 gaya gambar AI di pemilihnya.

**Architecture:** Data gaya dan palet tetap di `src/shared/explainer.ts` (dipakai Player dan render Remotion yang
sama). Pemilih `ImageStylePicker` memuat thumbnail WebP dari folder aset dengan `import.meta.glob`, dengan ikon +
kotak warna sebagai cadangan. Thumbnail dibuat sekali lewat dev harness memakai pipeline gambar aplikasi dan 9Router
pengguna, dari salinan data aplikasi.

**Tech Stack:** TypeScript strict, React + Tailwind v4, Vite `import.meta.glob`, Electron dev harness, ffmpeg-static
(libwebp tersedia), 9Router `POST /v1/images/generations`.

**Spec:** `docs/superpowers/specs/2026-11-14-explainer-styles-design.md`

## Global Constraints

- Gambar AI tanpa teks/huruf: pembuat prompt adegan sudah selalu menambahkan "No text, letters, numbers, captions,
  watermarks or logos" (`src/shared/explainer.ts:646`), jadi `prompt` gaya baru tidak perlu mengulangnya, tapi tidak
  boleh meminta apa pun yang berupa tulisan (label peta, catatan tangan, judul).
- Kontras palet baru: `ink` di atas `bg` ≥ 4,5:1, `ink` di atas `surface` ≥ 4,5:1, `accent` di atas `bg` ≥ 3:1;
  `dark: true` hanya bila `bg` gelap (luminans relatif < 0,2).
- ID gaya dan ID palet unik (palet: unik di dalam templatenya).
- Teks UI bahasa Indonesia; prompt gambar bahasa Inggris; komentar kode bahasa Inggris, menjelaskan *kenapa*.
- `npm run typecheck` dan `npm run build` bersih di akhir tiap task.
- Kunci API pengguna tidak pernah dibaca, dicetak, atau disalin ke luar file datanya yang terenkripsi; data asli di
  `%APPDATA%\Story Maker` tidak pernah ditulis.
- Thumbnail: WebP 640×358, `src/renderer/src/assets/explainer-styles/<id>.webp`.

## Review Focus

1. **Gaya lama yang tersimpan di proyek** (`theme.imageStyleId` = salah satu dari 13 ID lama) tetap terpilih dan
   gambarnya tetap memakai prompt yang sama — ID lama tidak boleh berubah (Task 1 cek daftar ID lama utuh).
2. **Palet tersimpan di proyek** (`theme.paletteId` lama) tetap terpakai; palet baru hanya ditambahkan di akhir array
   palet tiap template, palet pertama (bawaan) tidak berubah (Task 2 cek indeks 0 tiap template sama).
3. **Thumbnail hilang/rusak** → tile tetap tampil dengan ikon + warna, tidak ada gambar pecah (Task 3 harness dengan
   satu file thumbnail sengaja tidak ada).
4. **Gambar 9Router gagal di tengah pembuatan thumbnail** (kuota, filter konten) → proses berhenti rapi, gambar yang
   sudah jadi tersimpan, sisa bisa diulang tanpa membuat ulang yang sudah ada (Task 4).
5. **Pemilih di jendela 1180×720** (ScenesStep panel samping, ExplainerEditor) tetap rapi dengan 21 tile (Task 3
   screenshot dengan langkah harness `size`).

---

### Task 1: 8 gaya gambar AI baru + ikon cadangan

**Files:**
- Modify: `src/shared/explainer.ts` (array `EXPLAINER_IMAGE_STYLES`, ±baris 526-626; tambah 8 entri setelah `cinematic`)
- Modify: `src/renderer/src/components/ImageStylePicker.tsx` (peta `ICON`)

**Interfaces:**
- Produces: 8 entri `ExplainerImageStyle` dengan ID tepat: `oldmap`, `engraving`, `historypaint`, `relief`,
  `textbook`, `micro`, `space`, `inventor`. Nama dan kegunaan sesuai tabel di spec. `blurb` ≤ 32 karakter,
  bahasa Indonesia.
- Consumes: pola prompt gaya yang ada (satu kalimat-dua kalimat bahasa Inggris, menyebut medium, warna, komposisi).

- [ ] **Step 1: Tulis skrip cek** `C:\temp\check-styles.mjs` (di luar repo): bundel `src/shared/explainer.ts` dengan
  `node_modules/.bin/esbuild --format=esm --bundle` ke `C:\temp\explainer.mjs`, lalu assert:
  - 21 gaya; 13 ID lama (`auto, flat, isometric, icon3d, lineart, doodle, papercut, watercolor, clay, neon, blueprint, photo, cinematic`) masih ada dengan `prompt` identik dengan versi `git show HEAD:src/shared/explainer.ts` (bundel versi HEAD juga untuk dibandingkan).
  - 8 ID baru ada, ID unik, `prompt` tidak kosong, `blurb.length <= 32`.
- [ ] **Step 2: Jalankan; Expected:** gagal pada "8 ID baru ada".
- [ ] **Step 3: Tambah 8 gaya.** Prompt per gaya (inti yang wajib ada, kalimat bebas):
  - `oldmap`: antique hand-drawn map on aged parchment, sepia ink, coastlines, compass rose, sea monsters/ships as small illustrations, no readable labels.
  - `engraving`: black-and-white copperplate engraving / woodcut from an old encyclopedia, fine cross-hatching, cream paper.
  - `historypaint`: classical academic history painting, museum oil-on-canvas look, dramatic light, period-accurate costume and setting.
  - `relief`: carved stone bas-relief panel like Javanese temple reliefs (Borobudur/Prambanan), weathered andesite, side lighting.
  - `textbook`: clean scientific textbook illustration, cutaway/cross-section, flat colors with subtle shading, white background, no labels.
  - `micro`: microscopy look, cells/molecules/microorganisms, fluorescent or stained-slide colors, dark or light field, shallow depth.
  - `space`: photoreal space telescope imagery, planets, nebulae, spacecraft, deep black space, NASA-style render.
  - `inventor`: inventor's notebook sketch, brown ink and wash on aged paper, mechanical studies, Da Vinci-like, no handwriting.
  `swatch`/`ink` dipilih supaya tile cadangan terbaca (ink kontras di atas swatch).
- [ ] **Step 4: Ikon cadangan** di peta `ICON` dari `lucide-react` (cek ikon ada di versi terpasang): `oldmap`→`Map`,
  `engraving`→`BookOpen`, `historypaint`→`Landmark`, `relief`→`Castle` (atau ikon batu/candi yang ada),
  `textbook`→`FlaskConical`, `micro`→`Microscope`, `space`→`Rocket`, `inventor`→`Cog`.
- [ ] **Step 5: Jalankan skrip cek; Expected:** semua assert lulus. Lalu `npm run typecheck` dan `npm run build` bersih.
- [ ] **Step 6: Commit** — `git commit -m "Tambah 8 gaya gambar AI sejarah dan sains untuk video penjelasan"` (+ trailer Co-Authored-By).

### Task 2: 12 palet baru (dua per template)

**Files:**
- Modify: `src/shared/explainer.ts` (array `palettes` tiap template di `EXPLAINER_TEMPLATES`)

**Interfaces:**
- Produces: per template, dua palet ditambahkan **di akhir** array `palettes`:
  - sejarah: `id` `perkamen`, `name` `Perkamen` — hangat (perkamen/sepia/merah bata); boleh gelap atau terang sesuai karakter template.
  - sains: `id` `lab`, `name` `Laboratorium` — sejuk (putih bersih + teal/biru) untuk template terang; untuk template yang kebanyakan gelap (`facts`, `compare`, `news`) boleh `id` `kosmos`, `name` `Kosmos` (navy/hitam + cyan/ungu).
  - `tips` tetap cerah dan berani (latar berwarna, bukan putih polos), `quote` tetap tenang.
- Consumes: tipe `ExplainerPalette` (`bg, surface, ink, muted, accent, accent2, dark`).

- [ ] **Step 1: Perluas `C:\temp\check-styles.mjs`** dengan cek palet: tiap template punya 2 palet lebih banyak dari HEAD; palet indeks 0..n-1 lama identik dengan HEAD; ID unik per template; untuk tiap palet baru hitung kontras WCAG (luminans relatif sRGB) dan assert `ink/bg ≥ 4.5`, `ink/surface ≥ 4.5`, `accent/bg ≥ 3`, `muted/bg ≥ 3`, dan `dark === (L(bg) < 0.2)`. Cetak tabel nilai kontras.
- [ ] **Step 2: Jalankan; Expected:** gagal pada "2 palet lebih banyak".
- [ ] **Step 3: Tambah 12 palet.**
- [ ] **Step 4: Jalankan skrip; Expected:** semua lulus, tabel kontras tercetak. Lalu render visual cepat: dev harness `{"main":"seedExplainer","template":"<t>"}` untuk `facts` dan `tips`, set palet baru lewat `window.api.projects.get` + ubah `project.theme.paletteId` + `window.api.projects.save`, screenshot editor/pratinjau, lihat hasilnya (teks terbaca, aksen terlihat). `STUDIO_USER_DATA` folder sementara.
- [ ] **Step 5: `npm run typecheck` dan `npm run build`** bersih.
- [ ] **Step 6: Commit** — `git commit -m "Tambah palet Perkamen dan Laboratorium/Kosmos di tiap template penjelasan"`.

### Task 3: Thumbnail di pemilih gaya gambar AI (dengan cadangan)

**Files:**
- Modify: `src/renderer/src/components/ImageStylePicker.tsx`
- Create: `src/renderer/src/assets/explainer-styles/.gitkeep` (folder ada sebelum thumbnail dibuat; hapus .gitkeep di Task 4 bila tak perlu)
- Modify: `docs/remotion.md` (bagian gaya gambar AI penjelasan — cari tempat yang membahas `EXPLAINER_IMAGE_STYLES`; kalau tidak ada, tambahkan subbagian singkat)

**Interfaces:**
- Produces: `explainerStyleThumb(id: string): string | null` (di `ImageStylePicker.tsx`, diekspor) memakai
  `import.meta.glob('../assets/explainer-styles/*.webp', { eager: true, import: 'default' })`, pola sama dengan
  `styleThumb` di `components/StyleArt.tsx`.
- Tile: bila ada thumbnail → `<img>` `object-cover` mengisi kotak persegi, `alt=""` (nama gaya sudah tertulis di
  bawah), tanpa ikon; bila tidak ada → tampilan sekarang (swatch + ikon). Tile terpilih tetap ditandai `bg-sun-soft`
  seperti sekarang.

- [ ] **Step 1: Rencana harness** `C:\temp\thumbs-picker.json`: `{"main":"seedExplainer"}`, buka proyek, buka langkah Adegan dengan adegan ber-`imageMode: 'ai'` (atau ExplainerEditor yang memuat `ImageStylePicker`), log `CEKTHUMB ' + document.querySelectorAll('[data-style-thumb]').length` dan jumlah tile, screenshot pada `size: [1180, 720]`. Untuk uji, salin dua WebP gaya cerita yang ada (`assets/styles/flat.webp` → `explainer-styles/flat.webp`, `assets/styles/watercolor.webp` → `explainer-styles/watercolor.webp`) sebagai thumbnail sementara — **dihapus sebelum commit**.
- [ ] **Step 2: Jalankan (setelah `npm run build`); Expected:** `CEKTHUMB 0` (belum ada atribut).
- [ ] **Step 3: Implementasi** — `<img data-style-thumb={id} …>` saat thumbnail ada.
- [ ] **Step 4: Jalankan; Expected:** `CEKTHUMB 2`, 21 tile, screenshot: dua tile bergambar, sisanya ikon, tidak ada gambar pecah, layout rapi di 1180×720.
- [ ] **Step 5: Hapus dua thumbnail sementara**, `npm run typecheck` dan `npm run build` bersih, update `docs/remotion.md` (lokasi thumbnail, cara cadangan, bahwa thumbnail dibuat dengan prompt gaya itu sendiri lewat 9Router).
- [ ] **Step 6: Commit** — `git commit -m "Thumbnail gaya gambar AI di pemilih video penjelasan"`.

### Task 4: Buat 20 thumbnail lewat 9Router pengguna

> Memakai kuota akun 9Router pengguna (sudah disetujui pengguna). Maksimum 20 generate + 5 ulangan total.

**Files:**
- Create: `src/renderer/src/assets/explainer-styles/<id>.webp` × 20 (semua ID kecuali `auto`)
- Modify (bila perlu): `src/main/devharness.ts` — langkah harness kecil yang hanya aktif di mode harness, mis. menunggu job selesai atau menyalin file aset ke path tujuan. Dokumentasikan di `docs/pengembangan.md` bila ditambahkan.
- Modify: `CHANGELOG.md` (entri "[Belum dirilis] › Ditambahkan": gaya, palet, thumbnail)

**Interfaces:**
- Consumes: `generate.clipImage(clipId)` (job), `projects.get/save`, `theme.imageStyleId`, model gambar proyek
  `9router:ag/gemini-3.1-flash-image`, `explainerStyleThumb` (Task 3).

- [ ] **Step 1: Salin data** (aplikasi harus tertutup — cek tidak ada `electron.exe` dari folder proyek): salin
  `studio.db`, `studio.db-wal`, `studio.db-shm` (kalau ada), dan `Local State` dari `%APPDATA%\Story Maker` ke
  `C:\temp\sm-thumbs\`. Jangan membaca isi tabel `secrets`.
- [ ] **Step 2: Rencana harness** (`STUDIO_USER_DATA=C:\temp\sm-thumbs`): buat proyek penjelasan 16:9 (`seedExplainer` atau `projects.create`), set `imageModel` proyek ke `9router:ag/gemini-3.1-flash-image`, pastikan ada ≥1 adegan dengan `imageMode: 'ai'`. Untuk tiap gaya **berurutan**: set `theme.imageStyleId`, isi `imagePrompt` adegan dengan subjek di bawah, `projects.save`, panggil `generate.clipImage`, tunggu job selesai (polling `projects.get` sampai aset gambar baru terpasang, batas 6 menit), lalu salin file aset gambar ke `C:\temp\thumbs-raw\<id>.<ext>`. Lewati gaya yang file raw-nya sudah ada (supaya bisa diulang tanpa membuat ulang).
  Subjek (bahasa Inggris, tanpa teks): `flat` a home office desk with a laptop and plant · `isometric` a small data center with servers · `icon3d` a rocket, lightbulb and gear trio · `lineart` a coffee cup and notebook · `doodle` a brainstorm of ideas with arrows and icons · `papercut` a mountain valley at sunrise · `watercolor` a lighthouse on a calm coast · `clay` a friendly robot at a workbench · `neon` a futuristic city skyline · `blueprint` a jet engine cutaway · `photo` a farmer's market stall · `cinematic` a train platform at dusk · `oldmap` the Indonesian archipelago with ships · `engraving` a 19th-century steam locomotive · `historypaint` a royal court scene in an ancient Javanese kingdom · `relief` a procession of people and elephants · `textbook` a cutaway of the human heart · `micro` plant cells under a microscope · `space` Saturn and its rings · `inventor` a flying machine design.
- [ ] **Step 3: Jalankan; Expected:** 20 file di `C:\temp\thumbs-raw`. Periksa tiap gambar (Read PNG/JPG): ulangi (maks 5 total) bila ada teks/huruf yang jelas, gaya salah, atau kosong. Bila 9Router gagal (kuota/filter), berhenti, laporkan gaya yang tersisa.
- [ ] **Step 4: Konversi** dengan ffmpeg-static: `-vf "scale=640:358:force_original_aspect_ratio=increase,crop=640:358" -c:v libwebp -quality 80` ke `src/renderer/src/assets/explainer-styles/<id>.webp`; ukuran per file < 120 KB.
- [ ] **Step 5: Hapus** `C:\temp\sm-thumbs` dan `C:\temp\thumbs-raw` (salinan berisi kunci terenkripsi). Pastikan terhapus.
- [ ] **Step 6: Verifikasi** — harness Task 3 (data sementara biasa): `CEKTHUMB 20`, screenshot 1180×720 dilihat. `npm run typecheck`, `npm run build` bersih. CHANGELOG diperbarui.
- [ ] **Step 7: Commit** — `git commit -m "Thumbnail 20 gaya gambar AI video penjelasan"`.
