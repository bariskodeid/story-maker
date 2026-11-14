# Template Sejarah dan Sains dengan timeline dan grafik — desain

Tanggal: 2026-11-14. Bagian 2 dari 3 (1: gaya gambar AI, palet, dan thumbnail — selesai di `main`;
3: narator animasi dengan mimik wajah untuk kedua tipe video).

## Maksud

Pengguna membuat **video penjelasan edukasi sejarah dan sains**. Enam template yang ada (Tutorial, Tips & trik,
Fakta/countdown, Kutipan, Perbandingan, Berita) tidak punya cara menampilkan **urutan peristiwa** atau **data
angka** secara visual. Bagian ini menambah dua template dan dua jenis adegan baru supaya video sejarah punya
linimasa dan video sains punya grafik yang beranimasi.

## Tujuan

1. **Jenis adegan `timeline`** (nama UI "Linimasa"): judul + 3–6 titik `{ date, title }`.
   - 16:9: garis mendatar, titik berjajar kiri ke kanan. 9:16: garis menurun, titik berderet ke bawah.
   - Garis tergambar, lalu titik muncul satu per satu di paruh pertama adegan (pola waktu sama dengan
     `PointsScene` di `src/remotion/explainer/news.tsx`: jarak antar titik dari panjang adegan, kira-kira mengikuti
     narasi). Titik terakhir yang muncul ditonjolkan (warna aksen); titik sebelumnya tetap terlihat.
   - `date` teks bebas pendek ("1945", "abad ke-14", "65 jt SM"); `title` ≤ ~40 karakter.
   - Field lain yang dipakai: `label` (kicker kecil), `heading`, `body` (opsional, satu kalimat), `author` (sumber).
2. **Jenis adegan `chart`** (nama UI "Grafik"): judul + data angka + satu kalimat kesimpulan + sumber.
   Empat jenis grafik (`chart.kind`):
   - `bar` — batang, membandingkan 2–8 kategori. Batang tumbuh dari nol bergantian; angka menghitung naik.
   - `line` — garis, tren 3–12 titik berurutan (label sumbu x = tahun/waktu). Garis tergambar kiri ke kanan,
     titik nilai muncul mengikuti; angka titik terakhir ditonjolkan.
   - `donut` — komposisi 2–6 bagian yang jumlahnya bermakna sebagai 100% (atau sebagai total). Irisan terbuka
     berurutan; persentase tiap irisan ditampilkan dengan legenda.
   - `bubble` — lingkaran proporsional (luas sebanding nilai) untuk 2–6 besaran yang sangat berbeda (ukuran planet,
     jarak, populasi). Lingkaran membesar dari kecil ke besar; label + nilai di bawah/di dalam.
   - Data: `chart.unit` (satuan pendek, mis. "°C", "juta km", "%"), `chart.items: { label, value }[]` dengan
     `value` **angka** (bukan teks). Tampilan angka diformat sesuai bahasa proyek (pemisah ribuan dan desimal).
   - Field lain: `label`, `heading`, `body` (kesimpulan), `author` (sumber data).
   - Warna seri dari palet (`accent`, `accent2`, lalu turunan keduanya); teks di atas isian memakai `onColor`.
3. **Template `history`** (nama UI "Sejarah / linimasa").
   - Jenis adegan: `title`, `timeline`, `fact`, `quote`, `points`, `outro`. `mainType`: `timeline`.
   - Adegan `fact` dipakai sebagai "peristiwa": `value` = tahun/tanggal besar, `heading` = peristiwanya.
   - Palet (≥5, palet pertama = bawaan): bawaan **Perkamen** hangat; sisanya bernuansa sejarah (mis. tinta gelap,
     marmer museum, batik/sogan, malam). Font judul serif/klasik dari font yang sudah dibundel. Caption bawaan tenang.
   - Latar/hiasan sendiri di Remotion: tekstur kertas tua halus + vinyet tipis (bukan gambar, digambar CSS/SVG).
   - Gaya gambar "Otomatis" untuk template ini = gaya lukisan sejarah (entri baru di peta `look` pada
     `explainerImagePrompt`).
   - `guidance` LLM: menyusun cerita kronologis, memakai `timeline` untuk ringkasan era dan `fact` untuk peristiwa
     kunci, memakai `quote` untuk tokoh (kutipan yang benar-benar terdokumentasi), aturan akurasi (di bawah).
4. **Template `science`** (nama UI "Sains / data").
   - Jenis adegan: `title`, `chart`, `fact`, `step`, `compare`, `points`, `outro`. `mainType`: `fact`.
   - Palet (≥5, bawaan **Laboratorium** sejuk): sisanya bernuansa sains (kosmos gelap, papan tulis hijau, cetak biru,
     biologi/hijau). Font judul sans modern dari font yang sudah dibundel.
   - Latar/hiasan sendiri: grid halus ala kertas milimeter (CSS/SVG).
   - Gaya gambar "Otomatis" = gaya diagram buku pelajaran.
   - `guidance` LLM: menjelaskan konsep bertahap (`step` untuk proses), memakai `chart` hanya bila ada data
     yang mapan, memilih `chart.kind` yang cocok (bar = bandingkan kategori, line = tren waktu, donut = komposisi,
     bubble = besaran yang jauh berbeda), aturan akurasi (di bawah).
5. **Editor adegan** (`ScenesStep`) bisa mengubah semua data baru tanpa menyentuh JSON:
   - Timeline: daftar baris `[tanggal] [peristiwa]` dengan tambah, hapus, geser naik/turun (maks 6).
   - Grafik: pilihan jenis (4 tombol bergambar ikon, bukan `<select>`), satuan, daftar baris `[label] [angka]`
     dengan tambah, hapus, geser (batas jumlah sesuai jenis). Angka diterima dengan koma atau titik desimal.
   - Pengingat di kedua editor: "Cek ulang tahun dan angka sebelum ekspor." dan kolom Sumber.
6. **Integrasi template** di semua tempat yang mendaftar template: pemilih template + pratinjau
   (`ExplainerPreview`, `sampleExplainerInput`), contoh topik di Beranda (`EXPLAINER_SUGGESTIONS`, juga untuk seri),
   placeholder topik (`ExplainerIdeaStep`), contoh adegan dev harness (`SAMPLE_SCENES`), pengaturan seri,
   dan transisi adegan per template di `SceneShell` (sejarah: lambat dan lembut; sains: rapi dan cepat).

## Bukan tujuan

- Peta interaktif/peta wilayah beranimasi, diagram alir bebas, tabel data, grafik bertumpuk/multi-seri, pie biasa
  (donut sudah menutup kebutuhan komposisi).
- Mengambil data dari internet atau verifikasi fakta otomatis.
- Narator animasi (bagian 3).
- Mengubah template yang ada selain menambah jenis adegan baru ke daftar global.

## Anti-tujuan (gagal walau secara teknis jalan)

- Grafik yang angkanya tampak presisi tapi dikarang LLM tanpa sumber.
- Proyek lama (scene_json tanpa field baru) rusak, berubah tampilan, atau gagal dibuka.
- Pratinjau dan hasil ekspor berbeda (aturan 1 AGENTS.md).

## Batasan

- **Tanpa migrasi database.** Data adegan ada di `scene_json` (JSON). Field baru ditambahkan ke tipe
  `ExplainerScene` dan diberi nilai kosong oleh `normalizeScene` untuk adegan lama.
- Skema LLM strict (`scenesSchema` di `src/main/explainer.ts`): semua field wajib, kosong bila tidak dipakai.
  Field baru masuk skema dengan bentuk yang lolos mode strict OpenAI, Gemini, dan Anthropic (array objek dengan
  properti wajib; `value` bertipe number).
- Pratinjau (Player) dan render memakai komponen Remotion yang sama dengan props dari `buildExplainerInput`.
- Teks UI bahasa Indonesia; prompt LLM bahasa Inggris; tidak memakai `<select>` bawaan.
- Tata letak rapi di 16:9 dan 9:16, dan editor rapi di jendela 1180×720.
- Batas angka: nilai negatif diizinkan untuk `line` dan `bar` (suhu), tidak untuk `donut` dan `bubble`
  (dibersihkan/diabaikan saat normalisasi). Nilai 0 semua → grafik tetap tampil tanpa error (tanpa pembagian nol).

## Akurasi data (aturan untuk LLM dan UI)

- LLM: hanya fakta dan angka yang mapan dan luas dikenal; bulatkan angka; selalu isi `author` dengan sumber umum
  (mis. "NASA", "BPS", "Britannica"); bila ragu, pakai lebih sedikit titik atau ganti dengan adegan `fact` tanpa
  angka presisi; jangan mengarang kutipan.
- Normalisasi membuang item tanpa label atau tanpa angka valid, dan memotong ke batas jumlah per jenis.
- UI: pengingat "Cek ulang tahun dan angka sebelum ekspor." + kolom Sumber terlihat di editor timeline dan grafik.

## Pendekatan

- **A — perluas model adegan dengan field terstruktur `timeline` dan `chart` (dipilih).** Satu sumber data yang
  bisa diedit dengan aman, angka bertipe number, tanpa migrasi.
- **B — simpan di daftar teks yang ada** (`left: ["1945 — Proklamasi"]`). Ditolak: rapuh diurai, angka tidak bisa
  diedit dengan aman, menyalahi arti field yang dipakai template lain.
- **C — satu jenis adegan "data" serbaguna.** Ditolak: tata letak dan animasi timeline vs grafik terlalu berbeda.

## Yang diputuskan bersama pengguna

- Fokus konten: edukasi sejarah dan sains; butuh timeline dan grafik.
- Grafik lebih beragam dari batang + garis: disepakati batang, garis, donut, dan lingkaran proporsional.
- Eksekusi dengan subagent setelah desain disetujui.

## Diserahkan ke pembangun (keputusan Claude, bisa dikoreksi)

- Bentuk data persis: `timeline: { date: string; title: string }[]` dan
  `chart: { kind: 'bar' | 'line' | 'donut' | 'bubble'; unit: string; items: { label: string; value: number }[] }`
  di `ExplainerScene`; di skema LLM ditulis sebagai `timeline` (array objek) dan `chart` (objek).
- Batas jumlah: timeline 3–6 (editor maks 6; LLM diminta 3–6); bar 2–8; line 3–12; donut 2–6; bubble 2–6.
  Di bawah batas minimum tetap ditampilkan apa adanya (bukan error).
- Format angka: `Intl.NumberFormat` dengan locale dari bahasa proyek (id → `id-ID`), maks 2 desimal, ringkas bila
  ≥ 1 juta dengan satuan dari `unit` apa adanya (tidak menebak "juta" sendiri).
- Bar horizontal di 9:16 dan bila label panjang; vertikal di 16:9 bila label pendek.
- Nama font dan warna palet persisnya dipilih pembangun dari font yang sudah ada dan aturan kontras bagian 1
  (`ink`/`bg` ≥ 4,5:1, `ink`/`surface` ≥ 4,5:1, `accent`/`bg` ≥ 3:1).
- Ikon jenis grafik di editor dari `lucide-react`.

## Keputusan dari pemeriksaan pembangun (keputusan Claude, bisa dikoreksi)

1. **Timeline dan grafik tanpa gambar.** `timeline` dan `chart` tidak punya field `image` di `SCENE_TYPES`, jadi
   tidak meminta gambar AI, tidak memakai kredit gambar, dan tata letaknya berdiri sendiri (keterbacaan data diutamakan).
   Gaya "Otomatis" template sejarah/sains hanya berlaku untuk adegan yang memang bergambar (judul, fakta, kutipan,
   langkah). Normalisasi memaksa `imageMode` `none` pada kedua jenis ini.
2. **Skema LLM untuk adegan yang tidak memakai grafik/timeline.** Di skema, `timeline` = `[]` dan `chart` selalu objek
   dengan `kind` ber-enum `['none', 'bar', 'line', 'donut', 'bubble']`, `unit` `""`, `items` `[]` bila tidak dipakai.
   Di tipe `ExplainerScene`, `chart.kind` bertipe `ChartKind = 'bar' | 'line' | 'donut' | 'bubble'`; `normalizeScene`
   mengubah `'none'`/nilai tak dikenal menjadi `'bar'`. "Tidak ada grafik" = `items` kosong, bukan `kind` khusus.
3. **Bahasa sampai ke Player dan render.** `ExplainerInput` mendapat field `language` (kode bahasa proyek) yang diisi
   `buildExplainerInput` dan `sampleExplainerInput`, sehingga Player dan ekspor memformat angka dengan cara yang sama
   (`id` → `id-ID`, kode lain dipakai apa adanya, gagal → `en-US`).
4. **Jenis adegan di luar template.** Pemilih jenis adegan di editor hanya menawarkan `sceneTypes` template proyek
   (pembangun memastikan perilaku ini; tambahkan bila belum). Bila template proyek diganti, perilaku `normalizeScene`
   dengan `allowed` yang sudah ada berlaku; data `timeline`/`chart` tetap tersimpan di JSON adegan, jadi kembali ke
   template sejarah/sains memulihkannya.
5. **Font.** Tidak menambah font baru. Sejarah memakai DM Serif Display untuk judul (dan font lain yang sudah ada
   sebagai pilihan); sains memakai font sans yang sudah ada.
6. **`fact` di template sejarah** memakai tata letak fakta yang sudah ada; bedanya hanya palet, hiasan latar, dan
   transisi template. Tidak ada tata letak "peristiwa" khusus.
