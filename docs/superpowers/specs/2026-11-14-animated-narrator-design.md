# Narator animasi (gaya PNGTuber) — desain

Tanggal: 2026-11-14. Bagian 3 dari 3 (1: gaya gambar AI dan palet penjelasan — di `main`; 2: template Sejarah dan
Sains — sedang dikerjakan di branch `feat/history-science`).

## Maksud

Pengguna ingin video (cerita **dan** penjelasan) punya **narator berupa karakter** yang tampil di layar dan
**mimik wajahnya mengikuti narasi**. Narator bisa jadi **wajah tetap channel** (satu tokoh di semua video) atau
**berganti mengikuti tema** tiap video. Karakter bisa dipilih dari **preset** atau **dibuat lewat prompt**, dengan
pemilih bergaya grid thumbnail seperti pemilih gaya visual video cerita.

## Tujuan

1. **Koleksi narator** tingkat aplikasi ("Narator saya"), tidak terikat satu proyek. Satu narator =
   nama, deskripsi penampilan (bahasa Inggris untuk prompt, boleh ditulis pengguna dalam bahasa apa pun lalu
   dirapikan Magic), gaya gambar, warna latar green screen, dan **set sprite 12 gambar**: 6 ekspresi
   (`neutral`, `happy`, `sad`, `surprised`, `serious`, `thinking`) × mulut (`closed`, `open`), PNG transparan.
2. **5 preset bawaan** (dipaketkan di aplikasi, tidak bisa dihapus, bisa diduplikasi):
   1. Pemandu sejarah — pendongeng/guru berpakaian adat Nusantara, gaya lukisan.
   2. Ilmuwan muda — jas lab, kacamata pelindung di kepala, gaya kartun flat.
   3. Maskot kancil — kancil ramah, gaya kartun 3D.
   4. Host modern — presenter santai, gaya anime.
   5. Tiramisu — kucing gendut tabby cokelat muda (tiramisu), gaya anime Ghibli.
3. **Membuat narator lewat prompt**: pengguna menulis deskripsi (bisa dengan tombol Magic), memilih gaya (bawaan =
   gaya proyek: gaya visual untuk cerita, gaya gambar AI untuk penjelasan; bisa diganti), lalu "Buat narator".
   Hasil masuk koleksi. Bisa dibuat ulang bila gagal.
4. **Memasang narator di proyek** (langkah Ide untuk kedua tipe, dan di pengaturan seri sebagai bawaan semua
   episode): pilih narator (grid thumbnail = sprite `neutral/closed`), posisi (sudut kiri bawah / kanan bawah,
   bawaan kanan bawah), ukuran (Kecil / Sedang / Besar), dan sakelar aktif. Tanpa narator = perilaku lama persis.
5. **Animasi** (sama di pratinjau dan ekspor):
   - Mulut terbuka saat sebuah kata sedang diucapkan dan bergantian buka/tutup sekitar 8–10 kali per detik selama
     kata yang panjang; tertutup di jeda (dari waktu kata yang sudah ada: Whisper/ElevenLabs/perkiraan).
   - Ekspresi berganti **per kalimat** narasi.
   - Gerak kecil: napas pelan saat diam, sedikit memantul saat bicara.
6. **Ekspresi per kalimat dipilih LLM** (aktif) setelah narasi ada, dan **bisa diubah pengguna** per kalimat di
   editor (cerita: panel klip; penjelasan: langkah Adegan). Bila belum dipilih, semua kalimat `neutral`.
7. **Magic** untuk kolom deskripsi narator (field Magic baru, keluaran bahasa Inggris, format penampilan seperti
   `characterLook`).

## Bukan tujuan

- Video lip-sync AI (pendekatan B) — bisa jadi mode premium nanti.
- Kedip mata, gerak tangan, badan penuh, lebih dari 6 ekspresi, narator lebih dari satu per video.
- Narator ikut berbicara dengan suara berbeda (suara tetap dari TTS yang ada).
- Mengubah alur narasi/TTS/Whisper yang ada.

## Anti-tujuan

- Karakter "melompat" atau bergeser posisi saat berganti sprite.
- Tepi hijau/fringe terlihat di sekitar karakter.
- Pratinjau dan ekspor berbeda.
- Narator menutupi teks penting adegan penjelasan atau caption.
- Proyek tanpa narator berubah sedikit pun.

## Batasan

- Aturan 1 AGENTS.md: satu fungsi bersama di `src/shared/` menentukan sprite yang tampil pada waktu t
  (`narratorSpriteAt` atau sejenisnya) dari waktu kata + ekspresi per kalimat + pengaturan; dipakai komponen Remotion
  (penjelasan), pratinjau cerita, dan ekspor FFmpeg cerita.
- Migrasi database hanya ditambah di akhir `MIGRATIONS`. Kolom klip baru (ekspresi per kalimat) mengikuti aturan 4
  AGENTS.md di semua tempat.
- Kunci API pengguna tidak pernah dicetak; pembuatan gambar lewat pipeline yang ada (Higgsfield/9Router/Gemini sesuai
  pilihan pengguna, model yang mendukung gambar referensi tidak diperlukan).
- Teks UI bahasa Indonesia; prompt bahasa Inggris; tanpa `<select>` bawaan; pilihan visual berupa grid thumbnail 1:1.

## Pendekatan

**Animasi**
- **A — PNGTuber: set sprite + tukar gambar sesuai waktu kata (dipilih).** Biaya sekali per karakter,
  deterministik, cepat dirender.
- **B — video lip-sync AI per adegan.** Ditolak untuk sekarang: biaya per detik dan per revisi, lambat, mimik sulit
  dikendalikan, tidak bisa dipratinjau sebelum dibuat.

**Pembuatan sprite**
- **A — satu lembar sprite grid 4×3 dalam satu kali generate, lalu dipotong (dipilih).** Konsisten (satu gambar
  sumber), 1 generate per karakter, resolusi ±400–500 px per ekspresi (cukup untuk sudut layar).
- **B — 12 gambar terpisah dengan referensi.** Ditolak: posisi/detail bergeser antar gambar, biaya 12×.

**Latar transparan**
- **Green screen (dipilih):** karakter di atas latar satu warna polos (hijau `#00FF00` atau magenta `#FF00FF`, dipilih
  yang kontras dengan karakter), lalu warna itu di-key keluar + despill.

## Yang diputuskan bersama pengguna

- Gaya PNGTuber (A); sprite sheet (A); green screen.
- Narator untuk kedua tipe video; bisa tokoh tetap maupun bertema per video.
- 5 preset di atas, termasuk kucing gendut tabby cokelat muda bergaya anime Ghibli.
- Bagian 3 dikerjakan paralel dengan bagian 2 (implementasi di worktree git terpisah).

## Diserahkan ke pembangun (keputusan Claude, bisa dikoreksi)

- **Tata letak sprite sheet:** prompt meminta grid 4 kolom × 3 baris berukuran sama, sel berurutan
  (baris 1: neutral-closed, neutral-open, happy-closed, happy-open; baris 2: sad-…, surprised-…; baris 3:
  serious-…, thinking-…), karakter setengah badan menghadap kamera, **posisi kepala dan bahu sama persis di tiap
  sel**, latar warna green screen polos di seluruh gambar termasuk celah antar sel, tanpa teks/nomor/garis grid.
- **Pemotongan dan perataan:** potong per sel (dengan margin dalam kecil untuk membuang tepi sel), key warna latar
  (FFmpeg `chromakey` + `despill`, atau setara), lalu ratakan semua sprite ke satu bingkai bersama: hitung kotak
  alfa tiap sprite, sejajarkan tepi bawah dan tengah horizontal ke rata-rata, simpan semua dengan ukuran kanvas sama.
  Bila hasil potongan jelas rusak (sel kosong, alfa < 5% atau > 95%), tampilkan error ramah dan tawarkan buat ulang.
- **Penyimpanan:** tabel baru `narrators` (id, name, description, styleId/imageStyleId, keyColor, preset flag,
  createdAt) + file sprite di folder data aplikasi `narrators/<id>/<expression>-<mouth>.png` dan lembar asli.
  Preset dibaca dari `resources/narrators/<presetId>/` (dipaketkan), bukan dari database (atau didaftarkan
  saat startup — pembangun memilih yang lebih sederhana).
- **Pengaturan proyek:** kolom proyek baru (JSON) `narrator`: `{ id: string | null, anchor: 'bottomLeft' | 'bottomRight',
  size: 'small' | 'medium' | 'large', enabled: boolean }`; seri punya bawaan yang disalin ke episode baru seperti
  pengaturan seri lain.
- **Ekspresi per kalimat:** kolom klip baru `narrator_cues` (JSON array ekspresi per kalimat, urutan sama dengan
  pemecahan kalimat bersama di `src/shared/`). Kalimat dipetakan ke waktu kata dengan pemetaan kata yang sudah dipakai
  caption. Bila jumlah kalimat berubah setelah narasi diedit, cue yang tidak cocok jatuh ke `neutral`.
- **Pemilihan ekspresi oleh LLM:** satu permintaan per proyek (semua kalimat sekaligus, skema JSON strict, enum
  6 ekspresi), dijalankan otomatis setelah narasi selesai dibuat bila narator aktif, dan lewat tombol "Pilih ekspresi
  otomatis". Gagal → semua `neutral` + toast.
- **Ukuran:** tinggi sprite Kecil 26% / Sedang 34% / Besar 42% dari tinggi video (9:16: dari lebar × 0,8), margin
  sudut `OVERLAY_MARGIN` yang ada.
- **Penjelasan:** saat narator aktif, area sudut narator dicadangkan memakai mekanisme `zones` yang sudah dipakai
  `ExplainerVideo` untuk caption, supaya teks adegan tidak tertutup; caption bergeser bila bertabrakan.
- **Cerita – ekspor FFmpeg:** urutan sprite dari fungsi bersama diubah menjadi daftar concat PNG berdurasi
  (`ffconcat`) → satu input bergambar alfa → `overlay` di posisi/ukuran yang sama dengan pratinjau.
- **Animasi mulut:** saat waktu t di dalam kata yang durasinya > 180 ms, mulut bergantian buka/tutup tiap ~110 ms;
  kata pendek = terbuka penuh; jeda = tertutup. Pantulan bicara ±2% tinggi, napas skala ±1% periode 3,5 detik.
- **Preset dibuat sekali** lewat 9Router pengguna (cara yang sama dengan thumbnail bagian 1: salinan data di folder
  sementara, dihapus setelahnya), maksimal 5 generate + 5 ulangan, **dengan persetujuan pengguna sebelum dijalankan**.

## Keputusan dari pemeriksaan pembangun (keputusan Claude, bisa dikoreksi)

1. **Urutan lapisan:** video/gambar → overlay gambar & teks (`overlays.ts`) → **narator** → caption (paling atas).
   Narator tampil sepanjang video bila aktif; di bagian tanpa suara mulut tertutup dan ekspresi kalimat terakhir
   (atau `neutral`) tetap. Paritas pratinjau/ekspor diuji dengan cuplikan frame (golden frame) di waktu yang sama.
2. **Pemecah kalimat dan pemetaan waktu dibuat baru** di file bersama baru `src/shared/narrator.ts`
   (`splitSentences(text)`, `sentenceSpans(text, words)`, `narratorSpriteAt(...)`), bukan di `explainer.ts`
   (yang sedang diubah branch bagian 2). Waktu kata cerita memakai `clipCaptionWords` di `src/shared/timeline.ts`
   (sudah menangani trim/potong suara klip); penjelasan memakai `words` di `ExplainerSceneInput`.
3. **Adegan penjelasan adalah klip** (data adegan di `scene_json` klip), jadi `narrator_cues` per klip berlaku untuk
   kedua tipe. Di Remotion narator adalah **lapisan terpisah** di akar `ExplainerVideo` (bukan di dalam komponen
   adegan), dengan data di field baru `ExplainerInput.narrator` (sprite URL + track waktu dari `narratorSpriteAt`).
   Konflik dengan bagian 2 diselesaikan saat penggabungan (keduanya hanya menambah field).
4. **Waktu kata:** selalu dari sumber caption yang ada; bila klip tanpa waktu kata asli, perkiraan `estimateWordTimings`
   (sama seperti caption). Klip tanpa suara → mulut tertutup. Potong klip (`editing.ts`): cue dibagi mengikuti
   pembagian kalimat narasi; yang tidak cocok jatuh ke `neutral`. `duplicateProject`, `insertClipAfter`, upsert,
   `toClip`, `CLIP_COLS`, `addClip` mengikuti aturan 4.
5. **Penyedia dan ukuran lembar:** lewat pipeline gambar yang ada dengan model gambar proyek/pengaturan, frame 16:9
   (aspek yang didukung semua penyedia); grid 4×3 → sel ±4:3. Tanpa UI potong manual; hanya "Buat ulang". Pemotongan
   memakai grid rata; bila pemeriksaan alfa gagal, error ramah + buat ulang.
6. **Pengolahan gambar:** FFmpeg bawaan (`ffmpeg-static`) untuk potong + `chromakey` + `despill` ke PNG alfa; kotak alfa
   dan perataan dihitung dengan `nativeImage` Electron (`toBitmap`) di main. Tanpa dependensi native baru.
7. **Preset:** definisi 5 preset ada di kode; aset `resources/narrators/<presetId>/` dibuat sekali lewat langkah dev
   harness (pipeline aplikasi + 9Router pengguna, salinan data sementara, **setelah pengguna menyetujui**) dan
   di-commit. Preset tanpa aset tidak ditampilkan. Fitur diuji ujung-ke-ujung dengan lembar sprite uji sintetis
   (dibuat FFmpeg: bentuk berwarna di atas hijau) tanpa memakai kredit.
8. **Magic:** `MagicField` adalah himpunan tertutup (`src/shared/magic.ts` + `FIELD_BRIEFS` di `src/main/magic.ts`);
   tambah `narratorLook` di keduanya, IPC `magic:run` yang sama.
9. **Seri dan penghapusan:** narator seri disalin ke episode baru; episode lama tetap memakai miliknya (seperti gaya
   visual). Narator bisa dihapus walau dipakai; proyek yang merujuk narator hilang diperlakukan "tanpa narator"
   dengan catatan di langkah Ide ("Narator sudah dihapus"). Tanpa foreign key.
10. **Area aman penjelasan:** saat narator aktif, lebar area konten (`Frame`) dikurangi di sisi narator di bagian bawah
    (atau seluruh tinggi di 16:9, dipilih pembangun setelah melihat frame), sehingga semua adegan — termasuk timeline
    dan grafik bagian 2 — otomatis menghindarinya. Caption digeser ke atas bila bertabrakan dengan kotak narator.
11. **9:16:** didukung untuk kedua tipe; narator di sudut bawah, caption naik di atas kotak narator. Tinggi narator
    di 9:16 = Kecil 18% / Sedang 23% / Besar 28% dari tinggi video (tidak lebih dari 30%), di 16:9 tetap 26/34/42%.
