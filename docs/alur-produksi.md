# Alur produksi

Satu proyek melewati empat langkah (`Project.step`): **1 Ide → 2 Naskah → 3 Storyboard → 4 Editor**, lalu ekspor.

```
Ide cerita ──LLM──► Naskah (adegan + narasi) ──LLM──► Rencana visual per adegan
                                                     │
            ┌────────────────────────────────────────┼─────────────────────────┐
            ▼                                         ▼                         ▼
   Lembar karakter                       Gambar klip                    Narasi satu rekaman (TTS)
   (Higgsfield atau 9Router)             (Higgsfield atau 9Router)               │
            └────────── referensi ──────────────────►│                         │
                                                     ▼                         ▼
                                          Video AI (opsional,        Potong per adegan + Whisper
                                          selalu Higgsfield)
                                                     └──────────► Editor ◄─────┘
                                                                     │
                                                                  FFmpeg → MP4
```

## Sekali klik (`src/renderer/src/lib/autopilot.ts`)

Tombol **Sekali klik** di Beranda membuat proyek lalu menjalankan langkah 1–4 tanpa klik tambahan:

1. `story.script` kalau proyek belum punya adegan;
2. `story.visuals(…, 'missing')` kalau ada adegan yang belum punya rencana visual (`needsVisual`);
3. `generate.missingImages` (lembar karakter dulu, lalu gambar klip) **bersamaan dengan** `generate.narration(…,
   'missing')`, karena antreannya berbeda. Whisper berjalan di dalam job narasi (`whisperAuto`). Gambar atau narasi
   yang gagal diulang satu putaran lagi (`MEDIA_ROUNDS`);
4. proyek dipindah ke langkah 4 (Editor), status `editing`.

Di dalam proyek, tombol **Lanjutkan otomatis** di header (`AutopilotButton`) menjalankan urutan yang sama dari
posisi proyek saat itu, misalnya setelah naskah kamu sunting. Tombol ini hanya muncul kalau masih ada yang perlu
dibuat (`remainingWork`), dan sebelum mulai memeriksa layanan yang akan dipanggil (`missingServices` di
`lib/keys.ts`, juga dipakai tombol Sekali klik di Beranda).

Video AI tidak dibuat. **Ekspor otomatis** bersifat opsional: sakelar "Ekspor MP4 otomatis setelah editor siap" ada
di dialog konfirmasi kedua tombol dan di panel progres (bisa diubah selama berjalan), dan pilihan terakhir disimpan di
`settings.autoExport`. Kalau menyala, setelah langkah 4 aplikasi memanggil `exporter.start` dengan
`defaultExportOptions` (`lib/exportOptions.ts`, sama dengan isian awal dialog Ekspor) ke folder ekspor bawaan, lalu
menunggu job ekspornya. Notifikasi "Video selesai diekspor" datang dari pemantau job di `App.tsx`. Setiap langkah dilewati kalau hasilnya sudah ada, jadi **Coba lagi**
atau **Lanjutkan otomatis** cukup menjalankan ulang seluruh urutan. Selama berjalan, halaman proyek menampilkan
`AutopilotPanel` sebagai ganti isi langkah dan tab langkah dikunci. Proses tetap jalan kalau pengguna kembali ke
Beranda (kartunya berlabel "Dibuat otomatis…"), tetapi berhenti kalau aplikasi ditutup; job yang terputus ditandai
gagal oleh `resumeJobs`, dan proyeknya bisa dilanjutkan manual dari langkah terakhir.

## Seri dan episode (`src/main/series.ts`, `generateSeriesPlan` di `story.ts`)

Di Beranda, sakelar **Satu video / Seri** di kolom ide mengubahnya jadi formulir seri: premis, jumlah episode
(2–20), durasi per episode, alur **Bersambung** (satu cerita berlanjut) atau **Antologi** (cerita lepas dengan dunia
dan pemeran yang sama), bahasa, format, gaya, dan suara narator. **Susun seri** membuat baris `series` lalu menyusun
rencananya; **Sekali klik semua** langsung menyusun rencana dan membuat semua episode.

Setiap episode adalah **proyek biasa** (`projects.series_id`, `episode_no`), jadi langkah Ide sampai Editor, Sekali
klik, dan ekspor berjalan tanpa perubahan. Episode tidak tampil di grid Beranda (`listProjects` menyaringnya); grid
menampilkan kartu seri bertumpuk dengan progres "3/5 episode siap", dan chip filter **Seri**.

1. **Rencana seri** (`generateSeriesPlan`): dari premis, alur, jumlah episode, bahasa, dan gaya, LLM menulis
   `{ title, world, tone, rules, cast[{name, identity, outfit}], episodes[{no, title, synopsis, hook}] }`. Bible
   (`world`, `tone`, `rules`) dan judul ditulis dalam bahasa seri, deskripsi pemeran dalam bahasa Inggris seperti
   pemeran proyek. `hook` adalah satu kalimat penggoda tiap episode; episode bersambung diakhiri dengan mengarah ke
   hook episode berikutnya. Bible disimpan di `series.bible_json` (`hooks` per nomor episode), pemeran di
   `series_characters` (belum ada lembar karakter), lalu satu proyek dibuat per episode: judul `E01 · <judul>`,
   sinopsis = sinopsis episode, pengaturan dari seri, pemeran disalin masuk. Menyusun ulang hanya bisa selama belum
   ada episode yang punya naskah (draf lama diganti, pemeran yang sudah punya lembar tetap).
2. **Naskah episode** (`generateScript` + `episodeBrief`): prompt biasa ditambah bible, daftar pemeran tetap (nama
   wajib sama persis), "episode N dari M", dan untuk seri bersambung ringkasan episode-episode sebelumnya serta hook
   episode berikutnya. Episode terakhir diminta menutup alur. Antologi tidak mendapat ringkasan episode lain. Skemanya
   varian `EPISODE_SCRIPT_SCHEMA` dengan kolom `summary` (2–3 kalimat) yang disimpan di `projects.episode_summary`
   untuk episode berikutnya; proyek biasa tetap memakai `SCRIPT_SCHEMA` yang lama. Judul episode tidak diganti judul
   dari LLM, supaya urutan `E01 · …` tetap.
3. **Rencana visual** episode mendapat satu baris tambahan berisi dunia seri, supaya semua episode tergambar di
   tempat dan zaman yang sama. Pemeran seri sudah ada di proyek, jadi masuk ke "Existing characters (keep them
   exactly)".
4. **Tambah episode** (`generateNextEpisode`): LLM menulis satu rencana episode lagi dari bible, pemeran, dan
   ringkasan episode yang sudah ada.

Ringkasan episode tampil di kartu episode di halaman seri dan **bisa disunting** (tersimpan otomatis lewat
`series:updateEpisode`), karena naskah episode berikutnya dan **Tambah episode** membaca teks itu, bukan naskahnya.

### Seri video penjelasan (`series.kind = 'explainer'`)

Di Beranda, **Video penjelasan** juga bisa dipakai dengan sakelar **Seri** (pemilih template tetap tampil). Seri
menyimpan `template_id` dan `theme_json` (palet, aksen, font, caption; tanpa logo karena logo adalah file satu
proyek), dan setiap episode dibuat sebagai proyek `kind = 'explainer'` dengan template dan tema itu. Alurnya:

- **Berurutan** (`serial`) = kursus: tiap episode disebut *pelajaran* di UI, membangun dari pelajaran sebelumnya,
  dan ditutup dengan bocoran pelajaran berikutnya.
- **Lepas** (`anthology`) = episode berdiri sendiri dengan tema yang sama (misalnya "Tips Excel" dengan tips berbeda
  tiap episode) dan isi yang tidak boleh tumpang tindih.

1. **Rencana** (`seriesPlanRequest` di `story.ts`, skema `EXPLAINER_SERIES_SCHEMA`): dari topik, alur, jumlah
   episode, durasi, dan template, LLM menulis `{ title, world, tone, rules, episodes[{no, title, synopsis, hook}] }`
   tanpa pemeran. Bentuk bible sama dengan seri cerita, tapi `world` berisi **penonton & cakupan** (label di halaman
   seri), `tone` = gaya bicara. Semua teks dalam bahasa seri.
2. **Adegan episode** (`generateExplainerScenes` + `explainerEpisodeBrief`): prompt biasa ditambah judul dan topik
   seri, penonton & cakupan, gaya bicara, aturan, "lesson/episode N of M", dan untuk kursus ringkasan pelajaran
   sebelumnya serta hook pelajaran berikutnya (outro menggoda pelajaran itu; pelajaran terakhir menutup kursus). Seri
   lepas hanya mendapat judul episode lain supaya isinya tidak diulang. Skemanya varian `withEpisodeSummary` dengan
   `summary` yang disimpan ke `episode_summary` (kalau model tidak mengirimnya, judul-judul adegan dipakai);
   video penjelasan biasa tetap memakai skema lama. Judul `E01 · …` tidak diganti.
3. Tidak ada pemeran: `syncCastIn`/`syncCastOut` langsung kembali untuk seri penjelasan, dan panel Pemeran tidak
   ditampilkan. Sekali klik seri memakai `explainerMedia` di `autopilot.ts` untuk tiap episode dan mengekspor lewat
   Remotion.

### Pengaturan seri (`updateSeriesSettings`, `SeriesSettings.tsx`)

Tombol **Pengaturan seri** di header halaman seri membuka panel untuk gaya visual (cerita) atau template dan palet
(penjelasan), suara narator, format, bahasa, durasi per episode, model gambar, serta model dan resolusi **video AI**
(hanya seri cerita; pemilihnya sama dengan langkah Ide, `ModelSection`, dan pilihan resolusinya mengikuti katalog
model di `shared/higgsfield.ts`). Resolusi yang tidak ditawarkan model video baru kembali ke bawaan model. Episode
baru (`createEpisode`) mendapat model dan resolusi video seri. Setiap perubahan langsung disimpan
(`series:updateSettings`) ke baris seri dan **hanya ke episode yang belum punya klip**; episode yang sudah punya
naskah/adegan tetap memakai pengaturannya sendiri karena gambar dan suaranya dibuat dengan pengaturan itu. Panel
menyebut berapa episode yang terkena dan berapa yang tidak. Hanya kolom yang diubah yang ditulis ke episode, jadi
pengaturan yang disetel sendiri di satu episode tidak tertimpa kolom lain. Tombolnya dinonaktifkan selama rencana
atau Sekali klik berjalan di seri itu (episode yang sedang dibuat sudah membaca pengaturannya).

### Pemeran bersama (`syncCastIn` / `syncCastOut`)

Aset tidak bisa dipakai lintas proyek (ekspor dan pratinjau mencari setiap file di folder proyek pemiliknya), jadi
lembar karakter **disalin**:

- **Masuk ke episode** (`series:syncCastIn`). Pemeran dicocokkan dari nama (huruf kecil, tanpa spasi tepi,
  `castKey`). Lembar karakter seri disalin ke `images/` proyek sebagai aset `image` (`provider = 'series'`,
  `character_id` terisi) lalu dijadikan `sheet_asset_id` pemeran episode dengan nama itu. Karena pemerannya sudah
  punya lembar, `generateMissingImages` tidak membuat lembar baru. Pemeran yang sudah punya lembar sendiri di episode
  itu tidak diubah. Kapan pemeran **ditambahkan** diatur sendiri:

  | Saat | Lembar disalin | Pemeran seri yang belum ada ditambahkan |
  |---|---|---|
  | Episode dibuat (`createEpisode`) | ya | ya, semuanya |
  | Halaman episode dibuka | ya, untuk pemeran yang sudah ada | **tidak** |
  | Sebelum Sekali klik (`runEpisode`) | ya | hanya kalau naskah atau rencana visual masih perlu ditulis (`addMissing`) |
  | Tombol **Ambil pemeran seri** di Storyboard (`restore`) | ya | ya, termasuk yang pernah dihapus |

  **Pemeran yang dihapus tetap terhapus.** `saveSnapshot` mencatat nama pemeran yang hilang dari episode (dihapus,
  atau diganti nama) di `projects.cast_removed_json` (`noteRemovedCast`), dan `addMissing` tidak pernah menambahkan
  nama di daftar itu. Nama yang muncul lagi di episode (ditambah sendiri dengan nama yang sama) dihapus dari daftar.
  Hanya **Ambil pemeran seri** yang mengosongkan daftar itu.
- **Kembali ke seri** (`series:syncCastOut`): setelah tiap episode selesai di Sekali klik seri, dan saat halaman
  episode ditutup. Pemeran baru (dengan lembarnya kalau ada) ditambahkan ke `series_characters`, dan pemeran seri yang
  belum punya lembar mendapat salinan lembar dari episode. Lembar seri yang sudah ada tidak pernah ditimpa. Pemeran
  yang dihapus dari seri di halaman seri, atau nama lama pemeran yang diganti namanya di sana, dicatat di
  `series.cast_removed_json` dan tidak ditambahkan kembali dari episode; rencana seri yang menyebut nama itu lagi
  menghapusnya dari daftar.

File lembar seri ada di `<userData>/series/<id>/sheets/` dan ditampilkan lewat `studio://series/<id>/…`.

### Sekali klik seri (`src/renderer/src/lib/seriesAutopilot.ts`)

`startSeriesAutopilot` menyusun rencana kalau seri belum punya episode, lalu menjalankan episode **satu per satu**
sesuai nomor. Episode yang sudah selesai (ada adegan, `remainingWork` untuk jenis proyeknya kosong, sudah di Editor,
dan sudah diekspor kalau ekspor diminta) dilewati. Untuk setiap episode lain: `syncCastIn` → `runAutopilot` (versi
`startAutopilot` yang mengembalikan `'done' | 'failed' | 'stopped'`) → `syncCastOut`; seri penjelasan hanya
`runAutopilot`. Kalau satu episode gagal, run berhenti dan kartu
progres di halaman seri menyebut episode mana yang gagal beserta tombol **Coba lagi**; **Hentikan** menghentikan
episode yang sedang berjalan, dan **Lanjutkan** meneruskan dari episode itu.

Ekspor otomatis (opsional, sakelar yang sama dengan Sekali klik biasa) menulis
`<folder ekspor>/<slug judul seri>/E01-<slug judul episode>.mp4`: `runAutopilot` menerima `exportTarget`
(folder + nama file) yang menggantikan bagian itu dari `defaultExportOptions`. Halaman seri menampilkan progres
keseluruhan (episode N dari M, langkah yang sedang berjalan) dan tombol untuk membuka panel progres episode itu.
Tombol **Sekali klik** per episode menjalankan satu episode dengan cara yang sama (`runEpisode`).

Menghapus seri menghapus semua proyek episodenya (baris dan folder) dan folder seri.

## 1. Ide → naskah (`generateScript`, `src/main/story.ts`)

- Masukan: sinopsis, target durasi, bahasa.
- Jumlah adegan: `clipCountFor(durasi)` = sekitar satu adegan per 5,5 detik (minimal 3).
- Skema JSON keluaran: `{ title, scenes: [{ title, story, narration }] }`.
- Narasi 10–18 kata per adegan dan boleh memakai satu dua tag ekspresi berbahasa Inggris (`<short pause>`,
  `<long pause>`, `<chuckles>`, `<sigh>`, `<gasp>`, `<whispers>`). Daftar tag: `VOICE_TAGS` di `shared/speech.ts`.
- Hasil disimpan dengan `replaceScript`. Durasi awal tiap klip diperkirakan dari jumlah kata
  (`estimateNarrationMs`: sekitar 2,6 kata per detik).

Di langkah **Naskah** pengguna boleh mengubah, menambah, menghapus, dan mengurutkan adegan.

## 2. Naskah → rencana visual (`generateVisuals`)

Skema JSON keluaran:

```
world                         satu kalimat dunia cerita (tempat, era, teknologi, siapa orangnya)
characters[]                  { name, identity (tubuh/wajah, tanpa baju), outfit (baju bawaan) }
scenes[]                      { scene, setting, action, wardrobe[{name, source: reference|custom, outfit}],
                                framing, avoid, characters[], camera, strength, motion, transition }
```

Aturan penting di system prompt (dibuat setelah gambar keluar tidak sesuai cerita):

1. Setiap adegan berdiri sendiri: dunia/planet/era selalu disebut, karena model gambar tidak membaca naskah.
2. Narasi yang umum diubah jadi momen konkret yang bisa digambar.
3. Orang disebut "human"; kata yang bisa dibaca sebagai makhluk fantasi ("Martian", "alien", "-born") dilarang.
4. Baju harus cocok dengan tempatnya; "custom" untuk baju khusus adegan, "reference" untuk baju bawaan pemeran.

`visualText()` menyusun prompt berlabel yang disimpan di `clip.visualPrompt` dan bisa diedit pengguna:

```
Setting: ...
Action: ...
Wardrobe: Leo - custom for this scene: light-blue scrubs; the teenager - custom for this scene: grey tunic
Framing: ...
Avoid: Earth landscape, aliens, spacesuits indoors
```

Mode `missing` hanya menyusun adegan yang naskahnya berubah sejak rencana terakhir (`needsVisual`); mode `all`
menyusun ulang semuanya. Pemeran lama tidak ditimpa; pemeran baru ditambahkan berdasarkan nama.

## 3. Gambar, lembar karakter, video (`src/main/generation.ts`)

- **Lembar karakter** (`sheetPrompt`): gaya + deskripsi pemeran, tampak depan/tiga perempat/samping, latar polos.
  Dibuat lebih dulu kalau model gambar menerima referensi (`imageRefLimit(project.imageModel) > 0`; selalu untuk
  model 9Router).
- **Gambar klip** (`clipPrompt`): adegan dulu, lalu pemeran (tubuh dari lembar karakter, baju mengikuti baris
  `Wardrobe`), lalu gaya visual, lalu baris `Avoid` sebagai "Must not appear", lalu format frame. Gaya yang mengubah
  wujud pemeran (fabel: semua pemeran hewan antropomorfik) punya `planHint` yang dikirim ke perencana visual dan ke
  rencana seri sebagai "Style rule", supaya identitas pemeran ditulis sebagai spesies hewan, bukan "human". Lembar karakter
  dikirim sebagai gambar referensi: ke Higgsfield sebagai URL hasil unggah, ke 9Router sebagai data URI JPEG.
- **Penyedia gambar**: `project.imageModel` berawalan `9router:` membuat gambar klip dan lembar karakter lewat
  9Router (`startNineRouter`, satu permintaan sinkron, antrean `ninerouter`); selain itu lewat Higgsfield
  (`startHiggsfield`, kirim lalu polling). Keduanya menyimpan hasil lewat `saveResult`, jadi storyboard, editor,
  ekspor, dan unggahan ke Higgsfield untuk Video AI tidak membedakan asal gambarnya (`asset.provider` =
  `higgsfield` atau `ninerouter`).
- **Video AI** (`generateClipVideo`): gambar klip + `videoPrompt` (atau prompt cadangan). Setiap prompt video
  diakhiri `NO_MUSIC` ("Silent clip: no background music...") dan audio dimatikan lewat parameter kalau
  modelnya punya (`sound: off`, `generate_audio: false`). Durasi video = durasi terpendek model yang menutup
  panjang klip (`fitDuration`), resolusi dari `project.videoResolution`.
- Hasil diunduh ke folder proyek, dicatat di `assets`, lalu klip diperbarui lewat `patchClip` + `emit.clip`.

Detail API dan katalog model: [layanan-ai.md](layanan-ai.md).

## 4. Narasi (`src/main/narration.ts`)

Suara dibuat **dalam satu rekaman utuh** untuk banyak adegan sekaligus, lalu dipotong per adegan, supaya suara
dan intonasinya konsisten. (Rekaman per klip menghasilkan suara yang sedikit berbeda tiap klip.)

- **Gemini TTS**: adegan digabung dengan `<long pause>` di antaranya, per bagian maksimal sekitar 240 detik
  (`GEMINI_PART_SEC`).
- **ElevenLabs**: per bagian maksimal 2.400 karakter (`ELEVEN_PART_CHARS`), dengan `previous_text`/`next_text`
  agar intonasi bersambung. Waktu per kata datang dari API (alignment).
- **9Router**: tag suara dibuang, setiap adegan diakhiri tanda titik dan dipisah baris kosong, per bagian
  maksimal 1.000 karakter (`NINEROUTER_PART_CHARS`, karena Edge TTS dan OpenAI TTS menolak teks panjang). Seperti
  Gemini, tidak ada waktu per kata: jalurnya sama (`untimedTake`), yaitu Whisper kalau ada, atau `chooseCuts` +
  waktu kata perkiraan. Catatan: pada Edge TTS jeda antar-kalimat (sekitar 1 detik) hampir sama panjang dengan
  jeda antar-paragraf, jadi tanpa Whisper titik potong lebih bergantung pada perkiraan panjang teks.
- **Titik potong antar-adegan**:
  - dengan Whisper: `cutsFromWords` (`cuts.ts`) memotong di jeda yang tumpang-tindih dengan celah antara kata
    terakhir satu adegan dan kata pertama adegan berikutnya, tidak pernah di tengah kata;
  - tanpa Whisper: `chooseCuts`, pemrograman dinamis atas jeda dari `silencedetect` FFmpeg dan perkiraan posisi
    dari panjang teks.
- Setiap potongan disimpan sebagai WAV dengan `meta.words`, dan durasi klip diatur ke panjang potongannya.
  Potongan suara (`voiceInMs` dll.) direset.

## 5. Caption akurat (Whisper lokal)

- `src/main/whisper.ts` menjalankan `whisper-cli.exe` dengan model **Whisper Small** (487.601.967 byte, dicek
  SHA-256, diunduh ke `models/whisper`).
- Argumen: `-ml 1 -sow` (satu kata per segmen), `-ojf` (JSON lengkap), `-nfa -dtw small` (waktu kata dari
  DTW). **Tanpa `--prompt`**: prompt berisi naskah membuat Whisper berhalusinasi mengulang kata.
- `align.ts` mencocokkan kata **naskah** ke kata yang didengar Whisper (edit distance). Ejaan caption tetap dari
  naskah; hanya waktunya dari Whisper.
- Berjalan otomatis setelah narasi Gemini atau 9Router (`whisperAuto`), atau manual lewat tab Caption
  (`syncCaptions`, mode `stale`/`all`). Hasil ditandai `meta.timedBy = 'whisper-dtw'`.

## 6. Prompt musik (`generateMusicPrompt`)

LLM membuat `{ title, style, exclude, description, reason }` untuk dipakai di Suno, Udio, atau ElevenLabs Music.
Hasilnya disimpan di `editor.musicPrompt`. File musik hasil AI itu lalu dipilih lewat tab Musik.

## Video penjelasan (`src/main/explainer.ts`)

1. **Ide → adegan** (`generateExplainerScenes`): topik + template + durasi + bahasa → `{title, scenes[]}` lewat
   `generateJson`. Prompt dalam bahasa Inggris; teks layar dan narasi dalam bahasa proyek. Skema datar untuk mode
   strict OpenAI dan Gemini: satu objek adegan dengan `type` (enum jenis adegan template) dan semua field wajib,
   string kosong/array kosong kalau tidak dipakai. Hasilnya dinormalkan (`normalizeScene`), nomor langkah/tips
   diurutkan ulang, lalu `replaceScenes` mengganti semua klip (`scene_json` + `narration`).
2. **Gambar** (opsional per adegan): `upload` dari pengguna (`assets:pickSceneImage`) atau `ai` lewat
   `generateClipImage` dengan cabang prompt `explainerImagePrompt` (tanpa pemeran, gaya sesuai template, 16:9,
   tanpa teks). `generate:missingImages` hanya membuat gambar untuk adegan `imageMode: 'ai'`.
3. **Narasi**: `generate:narration` yang sama dengan proyek cerita (satu rekaman lalu dipotong per adegan).
4. **Sekali klik** (`explainerMedia` di `autopilot.ts`): adegan → gambar AI (dilewati kalau layanan gambar belum
   diatur) → narasi → editor → ekspor opsional lewat `export:start`.

## Menambah atau mengubah prompt

- Prompt LLM ada di `story.ts`; prompt gambar dan video di `generation.ts`.
- Skema JSON harus memenuhi mode strict OpenAI (semua properti `required`, `additionalProperties: false`) dan
  tetap bisa dipakai Gemini.
- Uji dengan beberapa ide nyata. Kalau model gambar salah tafsir, perbaiki aturan di system prompt (umum),
  jangan menambal satu kasus.
