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
  `Wardrobe`), lalu gaya visual, lalu baris `Avoid` sebagai "Must not appear", lalu format frame. Lembar karakter
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
