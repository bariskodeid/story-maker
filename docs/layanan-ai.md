# Layanan AI dan kunci API

Semua panggilan ke layanan luar dilakukan di **proses utama** (`src/main/services/`). Renderer tidak pernah
memegang kunci API.

## Kunci API (BYOK)

Pengguna memasukkan kuncinya sendiri di **Pengaturan › Layanan AI dan kunci**.

- Disimpan di tabel `secrets` setelah dienkripsi dengan Electron `safeStorage`. Di Windows ini memakai DPAPI,
  terikat ke akun Windows pengguna, jadi salinan `studio.db` di komputer lain tidak bisa membuka kuncinya.
- Kunci kriptonya dibuat saat startup (`warmUpEncryption`) supaya tidak hilang kalau aplikasi ditutup paksa tepat
  setelah menyimpan kunci pertama.
- `requireSecret(provider)` melempar error berbahasa Indonesia kalau kunci belum ada.
- `revealSecret` hanya dipanggil tombol "tampilkan kunci" di Pengaturan.
- **Jangan pernah** menulis kunci ke log, pesan error, file, URL, atau mengirimnya ke layanan lain.
- Mengganti kunci Higgsfield menghapus cache estimasi kredit (`forgetEstimates`).

| Penyedia (`ApiProvider`) | Dipakai untuk |
|---|---|
| `higgsfield` | gambar, lembar karakter, video |
| `gemini` | LLM (naskah/visual), Gemini TTS, serta gambar klip dan lembar karakter lewat Gemini API |
| `anthropic` | LLM (naskah/visual) lewat Messages API resmi Anthropic |
| `elevenlabs` | TTS |
| `openrouter`, `groq`, `custom` | LLM lewat API kompatibel OpenAI |
| `ninerouter` | LLM, TTS, serta gambar klip dan lembar karakter lewat gateway 9Router (satu base URL + kunci opsional untuk semuanya) |
| `remotion` | bukan layanan AI: kunci Remotion Company License opsional untuk render video penjelasan, diisi di Pengaturan › Umum dan tidak dites (lihat [remotion.md](remotion.md#kunci-lisensi-remotion)) |

## LLM (`services/llm.ts`, `services/gemini.ts`, `services/anthropic.ts`)

- `generateJson({ system, prompt, schema, name })` memanggil penyedia aktif (`settings.llmProvider` +
  `llmModels[provider]`).
  - Gemini: `@google/genai` dengan `responseJsonSchema` (dan cadangan: skema ditulis di system instruction).
  - Anthropic: SDK resmi `@anthropic-ai/sdk`, lihat [Anthropic Claude](#anthropic-claude-servicesanthropicts).
  - Lainnya: `/chat/completions`, dicoba berurutan `json_schema` (strict) → `json_object` → teks biasa, lalu JSON
    diambil dari teks (`extractJson`) untuk model yang tidak mendukung structured output.
- `listModels(source)`: daftar model live dari penyedia, dicache di tabel `cache` dan disegarkan saat basi.
- **9Router** (`ninerouter`): gateway AI lokal (`npx 9router`) yang meneruskan ke banyak penyedia. Sama seperti
  `custom`, ia punya base URL sendiri (`settings.nineRouterBaseUrl`, form mengisi `http://localhost:20128/v1`
  sebagai bawaan) dan kunci opsional (hanya kalau "require API key" aktif di dashboard 9Router). Keduanya disebut
  *endpoint provider* (`isEndpointProvider` di `shared/models.ts`) dan disimpan lewat IPC `settings:setCustom`.
  ID model mengikuti 9Router, misalnya `cc/claude-sonnet-4-5` atau nama combo.
- **Menambah penyedia LLM baru** yang kompatibel OpenAI: tambahkan ke `LlmProvider` dan `ApiProvider`
  (`types.ts`), `LLM_PROVIDERS` (`shared/models.ts`), `PROVIDERS` dan `PROVIDER_NAMES` (`secrets.ts`, tanpa ini
  status kuncinya tidak pernah tampil), konfigurasi base URL di `llm.ts`, `DEFAULT_SETTINGS.llmModels`, dan logo di
  `components/ProviderLogo.tsx`.

### Anthropic Claude (`services/anthropic.ts`)

- **Klien**: `new Anthropic({ apiKey, baseURL, maxRetries: 2 })`. Kunci dan alamat selalu diisi sendiri, supaya
  `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, atau login CLI di komputer pengguna tidak pernah dipakai diam-diam.
  Untuk pengembangan, `STUDIO_ANTHROPIC_BASE` bisa diarahkan ke server tiruan.
- **Naskah dan rencana visual**: `beta.messages.stream(...).finalMessage()` (streaming, jadi naskah panjang tidak
  kena batas waktu HTTP) dengan `output_config.format = { type: 'json_schema', schema }`. `max_tokens` = 64.000 atau
  batas model itu kalau lebih kecil (dibaca sekali lewat `models.retrieve` dan diingat per proses). Kalau API menolak
  skema (400 yang menyebut schema/format), permintaan diulang tanpa structured output: skema ditulis di system
  prompt dan JSON diambil dari teks (`extractJson`).
- **Fallback saat ditolak**: setiap permintaan mengirim `fallbacks: 'default'` dengan beta
  `server-side-fallback-2026-07-01`. Kalau filter keamanan model menolak, API mengulang di model lain yang cocok
  untuk kategori itu; model yang tidak mendukung fallback mengabaikannya. `stop_reason: 'refusal'` tetap menjadi
  pesan error berbahasa Indonesia, begitu juga `max_tokens` (jawaban terpotong).
- **Daftar model dan tes kunci**: `models.list()`. Model `retired` disembunyikan, model `deprecated` diberi label
  "Usang". Model bawaan `claude-opus-5-5`.
- **Error** (`friendly`, memakai kelas error SDK): 401 kunci, 403 izin model, 404 model, 429 rate limit, 400 saldo
  kredit habis, 529 server penuh (setelah SDK mencoba ulang 2 kali), koneksi dan timeout. Pembatalan
  (`APIUserAbortError`) diteruskan apa adanya.

## TTS

| Penyedia | File | Catatan |
|---|---|---|
| Gemini TTS | `services/gemini.ts` | PCM 24 kHz → WAV; daftar suara dari Voice Library (`listVoices`, cache 24 jam) dengan cadangan statis di `shared/models.ts`; contoh suara bawaan di `renderer/src/assets/voices` |
| ElevenLabs | `services/elevenlabs.ts` | memakai endpoint with-timestamps untuk waktu per kata; tag `<...>` diubah ke `[tag]` untuk model v3, atau ke `<break>` untuk model lama (`toElevenLabsText`) |
| 9Router | `services/ninerouterTts.ts` | `POST /v1/audio/speech`, ID suara = `model`; audio tanpa waktu kata (MP3, atau WAV untuk suara Gemini); daftar suara Edge live dengan cadangan statis di `shared/voices.ts` |

### 9Router TTS

Sumber: [`src/app/api/v1/audio/speech/route.js`](https://github.com/decolua/9router/blob/master/src/app/api/v1/audio/speech/route.js)
→ `src/sse/handlers/tts.js` → `open-sse/handlers/ttsCore.js` di repo 9Router.

- **Permintaan**: `POST {nineRouterBaseUrl}/audio/speech`, header `Authorization: Bearer <kunci>` (kalau ada) dan
  `User-Agent: Story Maker/<versi>`, body `{ "model": "<suara>", "input": "<teks>", "language": "Indonesian" }`.
  `model` adalah suara sekaligus model: `edge-tts/id-ID-ArdiNeural`, `openai/tts-1` atau `openai/tts-1/nova`,
  `el/<voice_id>`, `gemini/<model>/<suara>`, atau nama combo. `language` hanya dipakai suara Gemini
  ("Say in Indonesian: ..."), jadi dikirim sebagai nama bahasa Inggris.
- **Balasan**: byte audio mentah, `Content-Type: audio/<format>`. Edge TTS dan OpenAI mengirim MP3 (Edge: 16 kHz
  mono 32 kbps), suara Gemini WAV. `?response_format=json` (tidak dipakai) memberi `{ audio: base64, format }`.
  Tidak ada waktu per kata.
- **Error**: JSON gaya OpenAI `{ error: { message, type, code } }`, misalnya 400 `Missing model`, 400
  `No credentials for provider: x` (penyedia belum dihubungkan di dashboard 9Router), 401 (kunci wajib/salah),
  502/503 (penyedia hulu gagal atau dibatasi). Server di balik Cloudflare bisa membalas 403 HTML "Just a moment";
  karena itu setiap permintaan memakai `User-Agent` sendiri (fetch bawaan mengirim `node`, yang ditantang).
- **Daftar suara**: `GET /v1/audio/voices?provider=edge-tts` (`{ data: [{ id, name, lang, gender, model }] }`)
  dan `GET /v1/models/tts` (model TTS dan combo yang terhubung). Daftar Edge di 9Router diambil lewat API
  dashboard-nya sendiri, jadi sering gagal (401/502) kalau dashboard butuh login. Kalau gagal, aplikasi memakai
  30 suara Edge bawaan (`NINEROUTER_VOICES`). Hasil dicache per base URL (24 jam, cadangan 1 jam). Di langkah
  Ide cerita pengguna juga bisa mengetik ID suara apa pun.
- **Teks**: tag suara `<...>` dibuang (`stripVoiceTags`). Untuk suara `edge-tts/`, `&`, `<`, `>` di-escape karena
  9Router menaruh teks langsung ke dalam SSML tanpa escape.

Narasi selalu dibuat satu rekaman utuh lalu dipotong. Lihat [alur-produksi.md](alur-produksi.md#4-narasi-srcmainnarrationts).

## Higgsfield (`services/higgsfield.ts`, `shared/higgsfield.ts`)

- Base URL `https://api.higgsfield.ai`, header `Authorization: Key <kunci>`.
- Alur: `submit(endpoint, body)` → polling `getStatus` → unduh hasil. `uploadFile` mengunggah gambar referensi
  (lembar karakter, gambar klip untuk video).
- `estimate(endpoint, body)` memanggil `/estimate/<endpoint>` → `{ credits, usd }`, dicache 24 jam di tabel `cache`.
  Endpoint ini gratis (tidak memakai kredit). API Higgsfield tidak punya daftar harga maupun endpoint saldo, jadi
  biaya per model selalu diambil dari sini.
- Pesan error dibuat ramah (`friendly`): kunci salah, kredit habis, terlalu banyak proses, model tidak tersedia.
- Untuk pengembangan, `STUDIO_HF_BASE` bisa diarahkan ke server tiruan (mock) supaya UI bisa diuji tanpa kredit.

### Katalog model (`src/shared/higgsfield-catalog.json`)

48 model: 14 model gambar (teks ke gambar) dan 34 model video yang bisa menganimasikan gambar klip. Model yang butuh
video masukan (edit video, motion control) atau hanya teks-ke-video sengaja tidak dimasukkan. Seedream belum tersedia
di API Higgsfield (hanya di aplikasi webnya). Satu entri:

```json
{
  "id": "kling-video/v3.0/std/image-to-video",
  "name": "Kling 3.0 · Standard · Image to video",
  "family": "Kling",
  "kind": "video",
  "input": { "field": "image_url", "mode": "first-frame", "max": 1 },
  "required": ["image_url"],
  "props": { "prompt": { "type": "string" }, "duration": { "type": "integer", "minimum": 3, "maximum": 15 }, "sound": { "enum": ["on", "off"] } },
  "durations": { "min": 3, "max": 15 },
  "tags": ["Kling"]
}
```

- `input.field`/`mode`/`max`: tempat gambar referensi atau frame pertama dikirim, dan berapa banyak.
- `props`: skema parameter dari dokumentasi Higgsfield. `imageBody`/`videoBody` di `shared/higgsfield.ts`
  mengisinya secara umum: rasio, resolusi, kualitas, durasi, mematikan `enhance_prompt`, `prompt_extend`, dan audio.
- `durations`: rentang (`min`/`max`) atau daftar (`values`) durasi video.
- **Menambah model**: tambahkan entri baru dengan format yang sama dari dokumentasi API Higgsfield
  (`https://docs.higgsfield.ai/docs/llms.txt`), lalu pastikan `imageBody`/`videoBody` tidak melempar error
  "butuh <field>" (`checkRequired`). Ikon keluarga model diatur di `components/ModelLogo.tsx`.
- Model bawaan: `DEFAULT_IMAGE_MODEL` dan `DEFAULT_VIDEO_MODEL` di `shared/higgsfield.ts`.

## Sumber gambar klip (`shared/imageModels.ts`)

`project.imageModel` menentukan sumber gambar klip dan lembar karakter lewat awalannya, jadi tidak butuh migrasi:
ID Higgsfield biasa, `9router:<model>`, atau `gemini:<model>`. `imageSource(id)` mengembalikan `higgsfield`,
`ninerouter`, atau `gemini`; pakai fungsi ini (bukan cek awalan sendiri) di main dan renderer. Helper lain di file yang
sama: `normalizeImageModel` (ID 9Router/Gemini dipertahankan, ID Higgsfield yang hilang dari katalog jatuh ke bawaan),
`imageModelLabel`, `imageRefLimit`, `imageSourceSentence`/`imageSourceAside` (teks dialog Sekali klik). Kartu
*Gambar klip* di langkah Ide punya tombol `Higgsfield | 9Router | Gemini` (`ModelSection.tsx`).

9Router dan Gemini sama-sama satu permintaan sinkron yang langsung mengembalikan gambar, jadi keduanya dijalankan
`startDirect` di `generation.ts` (tabel `DIRECT`): antrean bernama sama dengan sumbernya, progres berupa perkiraan
waktu, jawaban tanpa gambar dicoba ulang sampai 3 kali, dan job yang terputus saat aplikasi ditutup ditandai gagal.
Lembar karakter dikirim sebagai JPEG lebar ≤1536 px (`inlineReference` di `services/images.ts`).

## Gambar lewat 9Router (`services/ninerouterImages.ts`)

Gambar klip dan lembar karakter bisa dibuat lewat 9Router, memakai akun yang pengguna hubungkan di sana (misalnya
Codex/ChatGPT untuk GPT Image, Antigravity/Gemini untuk Nano Banana). Video tetap selalu dari Higgsfield.

- **Pilihan model**: kartu *Gambar klip* di langkah Ide punya tombol `Higgsfield | 9Router`. Model 9Router disimpan di
  kolom `imageModel` yang sama dengan awalan `9router:` (misalnya `9router:cx/gpt-image-2.5`), jadi tidak butuh migrasi.
  `isNineRouterImage`, `nineRouterModel`, `normalizeImageModel`, `imageRefLimit` ada di `shared/imageModels.ts`.
  `getSettings()` mempertahankan ID `9router:` (ID Higgsfield yang hilang dari katalog tetap jatuh ke bawaan).
- **Koneksi**: memakai koneksi 9Router yang sama dengan LLM (`settings.nineRouterBaseUrl` + kunci `ninerouter`,
  opsional). Kartu *9Router* di Pengaturan › Gambar dan video menyimpannya juga kalau LLM memakai penyedia lain.
  Semua permintaan mengirim `User-Agent: Story Maker/<versi>`, karena 9Router yang dipasang di server sering berada
  di belakang Cloudflare yang menantang agent bawaan Node (`node`).
- **Daftar model**: `GET /v1/models/image` → `{ data: [{ id, owned_by }] }` (model gambar dari penyedia yang
  terhubung, plus combo gambar). `GET /v1/models` hanya berisi model chat. Daftar dicache 24 jam dengan kunci
  `models:ninerouter-image:<url>` (ikut terhapus saat koneksi 9Router disimpan ulang). Pengguna juga bisa mengetik ID
  model sendiri. IPC: `generate.nineRouterModels(refresh)`.
- **Membuat gambar**: `POST /v1/images/generations` dengan
  `{ model, prompt, n: 1, size, aspect_ratio, images? }`. `size` = `1536x1024` / `1024x1536` (satu-satunya ukuran
  non-persegi yang diterima GPT Image; 9Router mengubahnya ke rasio 3:2 untuk penyedia lain) dan `aspect_ratio` =
  `16:9` / `9:16` (dibaca lebih dulu oleh Antigravity/Gemini, hasilnya 1376×768). Sisa potongan rasio diserap
  cover-fit di pratinjau dan ekspor. `response_format` sengaja tidak dikirim (GPT Image menolaknya).
- **Jawaban**: `{ created, data: [{ b64_json }] }` atau `data: [{ url }]`. Format file dibaca dari byte-nya (Gemini
  mengirim JPEG, GPT Image PNG). Permintaan ini sinkron (10–60 detik, batas waktu 6 menit) dan tidak punya ID
  untuk dilanjutkan, jadi job 9Router yang terputus saat aplikasi ditutup ditandai gagal.
- **Lembar karakter sebagai referensi**: 9Router menerima `images` (data URI atau base64) dan meneruskannya ke
  penyedia yang bisa memakai gambar referensi (Codex/GPT Image, Gemini, Antigravity, NanoBanana, Hugging Face);
  adapter gaya OpenAI biasa (OpenAI, OpenRouter, xAI, ...) membuangnya. Aplikasi tidak bisa tahu penyedianya, jadi
  maksimal 4 lembar (`NINEROUTER_MAX_REFS`) selalu dikirim, diperkecil jadi JPEG lebar ≤1536 px (penyedia Gemini
  menolak permintaan di atas ±20 MB), dan UI memberi tahu bahwa wajah pemeran bisa kurang konsisten.
- **Antrean**: `ninerouter` (2 paralel), terpisah dari antrean Higgsfield.
- **Biaya**: tidak ada estimasi; `estimateCredits` mengembalikan `null` untuk model `9router:` dan UI menyembunyikan
  kredit gambar.
- **Error** (`friendly`): 9Router tidak berjalan, halaman tantangan Cloudflare (403 HTML), 401 kunci, model tidak
  dikenal (`Invalid model format`), akun belum terhubung (`No credentials for provider`), filter konten, rate limit
  (429/503), jawaban tanpa gambar. Awalan `[status]:` dari pesan upstream dibuang.
- Sumber 9Router: route `src/app/api/v1/images/generations/route.js`, handler `src/sse/handlers/imageGeneration.js`,
  adapter per penyedia di `open-sse/handlers/imageProviders/`, daftar per jenis di `src/app/api/v1/models/[...model]/route.js`.

## Gambar lewat Gemini API (`services/geminiImages.ts`)

Model gambar Gemini ("Nano Banana") dipanggil langsung dengan kunci Google AI Studio milik pengguna (kunci `gemini`
yang sama dengan LLM dan TTS). Video tetap dari Higgsfield.

- **Membuat gambar**: `models.generateContent` dengan `responseModalities: ['IMAGE']` dan
  `imageConfig.aspectRatio` = `16:9` / `9:16`. Lembar karakter (maksimal 4, `GEMINI_MAX_REFS`) dikirim sebagai
  `inlineData` sebelum teks prompt yang menyebut nama mereka. Batas waktu 5 menit.
- **Jawaban**: gambar pertama di `candidates[0].content.parts[].inlineData`. Tanpa gambar dengan `finishReason` atau
  `promptFeedback.blockReason` berisi SAFETY/PROHIBITED/BLOCKLIST/SPII menjadi error filter konten (tidak dicoba
  ulang); tanpa gambar karena alasan lain menjadi `NoImageError` dan dicoba ulang.
- **Daftar model**: `models.list()` disaring ke ID `gemini…image` yang mendukung `generateContent` (Imagen memakai
  endpoint lain). Dicache 24 jam dengan kunci `models:gemini-image`, yang ikut terhapus saat kunci Gemini diganti.
  IPC: `generate.geminiImageModels(refresh)`. Model bawaan saat sumber Gemini dipilih: `gemini-3.1-flash-image`
  (`DEFAULT_GEMINI_IMAGE_MODEL`).
- **Antrean**: `gemini` (2 paralel). Batas per menit model gambar Gemini di tier awal cukup ketat.
- **Biaya**: model gambar Gemini tidak punya kuota gratis. `estimateCredits` mengembalikan `null` dan UI menulis
  bahwa biayanya ditagih ke akun Google AI Studio.
- **Error** (`friendly`): kunci ditolak, 429 dengan `limit: 0`/free tier (billing belum aktif), 429 lain (kuota atau
  rate limit, bisa dicoba lagi), 403 izin, 404 model, 413 terlalu besar, 5xx, dan filter konten.
- Untuk pengembangan, `STUDIO_GEMINI_BASE` mengarahkan semua panggilan Gemini (LLM, TTS, gambar) ke server tiruan.

## Whisper lokal (`src/main/whisper.ts`)

- Biner: `resources/whisper/whisper-cli.exe` + DLL (whisper.cpp, lisensi MIT). Saat ini hanya untuk Windows.
- Model: `ggml-small.bin` (sekitar 488 MB) dari Hugging Face (`ggerganov/whisper.cpp`), diunduh di Pengaturan ke
  `<folder data>\models\whisper`, bisa dijeda dan dilanjutkan (HTTP Range), lalu dicek SHA-256. Untuk pengembangan, `STUDIO_WHISPER_URL` bisa menunjuk salinan lokal.
- Dijalankan di antrean `whisper` (satu per satu). Detail argumennya di [alur-produksi.md](alur-produksi.md#5-caption-akurat-whisper-lokal).

## Membuka tautan

`app:openExternal` hanya menerima URL `https://` dan membukanya di browser bawaan. Pakai ini untuk semua tautan
ke luar (dokumentasi penyedia, Suno, dan lainnya).
