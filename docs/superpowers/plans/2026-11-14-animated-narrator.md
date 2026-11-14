# Narator Animasi (PNGTuber) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narator berupa karakter (6 ekspresi × mulut buka/tutup) di sudut video cerita dan video penjelasan, mulut
mengikuti waktu kata, ekspresi per kalimat (LLM + bisa diubah), dari koleksi narator (5 preset + buatan prompt).

**Architecture:** Inti waktu di `src/shared/narrator.ts` (pemecah kalimat, rentang kalimat, `narratorSpriteAt`,
kotak posisi) dipakai pratinjau cerita, ekspor FFmpeg cerita, dan lapisan Remotion penjelasan. Data: tabel
`narrators`, kolom proyek `narrator` (JSON), kolom klip `narrator_cues`, bawaan seri. Sprite dibuat dari satu lembar
grid 4×3 lewat pipeline gambar yang ada, dipotong + green screen di-key dengan FFmpeg, diratakan dengan `nativeImage`.

**Tech Stack:** Electron (main: better-sqlite3, ffmpeg-static, nativeImage), React + Zustand + Tailwind v4, Remotion,
FFmpeg `ffconcat` + `overlay`.

**Spec:** `docs/superpowers/specs/2026-11-14-animated-narrator-design.md` (bagian "Keputusan dari pemeriksaan
pembangun" mengikat).

**Worktree:** `C:\Users\Admin\projects\bariskode\story-maker-narrator`, branch `feat/narrator`. Bagian 2
(`feat/history-science`, folder `story-maker`) berjalan paralel dan mengubah `src/shared/explainer.ts` serta
`src/remotion/explainer/*` — di sini ubah file itu seminimal mungkin (hanya menambah field/lapisan).

## Global Constraints

- Ekspresi: `neutral`, `happy`, `sad`, `surprised`, `serious`, `thinking`; mulut `closed`, `open`; 12 sprite PNG alfa
  berukuran kanvas sama. Urutan grid: baris 1 neutral-c, neutral-o, happy-c, happy-o; baris 2 sad-c, sad-o,
  surprised-c, surprised-o; baris 3 serious-c, serious-o, thinking-c, thinking-o.
- Pengaturan proyek `narrator`: `{ id: string | null, anchor: 'bottomLeft' | 'bottomRight', size: 'small' | 'medium' |
  'large', enabled: boolean }`, bawaan `{ id: null, anchor: 'bottomRight', size: 'medium', enabled: false }`.
- Tinggi narator: 16:9 = 26/34/42% tinggi video; 9:16 = 18/23/28% tinggi video. Margin sudut `OVERLAY_MARGIN`.
- Animasi: kata > 180 ms → mulut bergantian tiap ~110 ms; kata pendek → terbuka; jeda → tertutup; pantulan bicara ±2%
  tinggi; napas skala ±1% periode 3,5 s. Semua dihitung dari waktu, tanpa keadaan (stateless), sama di semua jalur.
- Urutan lapisan: video → overlay `overlays.ts` → narator → caption. Narator nonaktif / tidak ada → keluaran identik
  dengan sebelum fitur ini.
- Migrasi hanya ditambah di akhir `MIGRATIONS`; kolom klip baru di semua tempat aturan 4 AGENTS.md; IPC baru di 3 tempat
  (aturan 5).
- Tanpa dependensi native baru; FFmpeg dari `ffmpeg-static`, kotak alfa dari `nativeImage`.
- Teks UI bahasa Indonesia; prompt bahasa Inggris; komentar kode bahasa Inggris (*kenapa*); tanpa `<select>` bawaan;
  pilihan narator = grid thumbnail 1:1.
- Kunci API tidak pernah dicetak. Uji memakai `STUDIO_USER_DATA` sementara, lembar sprite sintetis (tanpa kredit);
  data asli tidak ditulis. Pemanggilan gambar sungguhan hanya di Task 8 setelah persetujuan pengguna.
- `npm run typecheck` dan `npm run build` bersih di akhir tiap task (di folder worktree).

## Review Focus

1. **Proyek lama tanpa narator** → ekspor byte-berbeda boleh, tapi frame identik secara visual dan tidak ada filter
   tambahan di perintah FFmpeg (Task 6 bandingkan perintah/frame dengan narator nonaktif).
2. **Narasi diedit setelah ekspresi dipilih** (jumlah kalimat berubah) → cue tidak cocok jatuh ke `neutral`, tidak
   crash (Task 1 + Task 4).
3. **Model gambar menghasilkan grid berantakan** (sel kosong, karakter keluar sel, latar bukan warna kunci) → error ramah
   + "Buat ulang", tidak menyimpan sprite rusak (Task 3 dengan lembar sintetis rusak).
4. **Narator dihapus padahal dipakai proyek/seri** → proyek tampil tanpa narator + catatan "Narator sudah dihapus" (Task 5).
5. **9:16 dengan caption bawah** → caption naik di atas narator, tidak bertumpuk (Task 6 dan 7 frame 9:16).

---

### Task 1: Inti bersama `src/shared/narrator.ts`

**Files:** Create `src/shared/narrator.ts`; Modify `src/shared/types.ts` (tipe narator, `Project.narrator`, `Clip.narratorCues`, `Series.narrator`)

**Interfaces (Produces):**
```ts
export type NarratorExpression = 'neutral' | 'happy' | 'sad' | 'surprised' | 'serious' | 'thinking'
export type NarratorMouth = 'closed' | 'open'
export const NARRATOR_EXPRESSIONS: NarratorExpression[]           // order above
export const NARRATOR_GRID: { expression: NarratorExpression; mouth: NarratorMouth }[] // 12 cells, row-major
export interface NarratorSettings { id: string | null; anchor: 'bottomLeft' | 'bottomRight'; size: 'small' | 'medium' | 'large'; enabled: boolean }
export const DEFAULT_NARRATOR: NarratorSettings
export function normalizeNarratorSettings(raw: unknown): NarratorSettings
export function normalizeCues(raw: unknown): NarratorExpression[]   // unknown → 'neutral'
export function splitSentences(text: string): string[]              // on . ! ? … and line breaks; keeps abbreviations like "dr." "dll." together; strips voice tags (<...>, [...])
export function sentenceSpans(text: string, words: WordTiming[]): { start: number; end: number }[] // map sentences to word index ranges by order (same tokenization as captions)
export interface NarratorTrackClip { startSec: number; words: WordTiming[]; text: string; cues: NarratorExpression[] }
export interface NarratorFrame { expression: NarratorExpression; mouth: NarratorMouth; scale: number; offsetY: number }
export function narratorSpriteAt(track: NarratorTrackClip[], t: number): NarratorFrame
export function narratorBox(frameW: number, frameH: number, s: NarratorSettings, spriteAspect: number): { x: number; y: number; w: number; h: number }
export function narratorSegments(track: NarratorTrackClip[], totalSec: number, fps: number): { sprite: string; startSec: number; endSec: number }[] // merged runs of identical expression-mouth (sprite id "happy-open"), for FFmpeg concat
```
- [ ] **Step 1: Skrip cek** `C:\temp\narr\check-core.mjs` (bundel esbuild): `splitSentences` (titik, tanya, seru, elipsis, singkatan, tag suara dibuang, teks kosong → []); `sentenceSpans` dengan `estimateWordTimings`; `narratorSpriteAt`: jeda → closed, kata pendek → open, kata 600 ms bergantian open/closed per ~110 ms, ekspresi berganti di batas kalimat, cue kurang → neutral, t di luar track → neutral/closed; `narratorBox` 16:9 medium kanan bawah = tinggi 34% dan menempel margin; 9:16 large ≤ 30% tinggi; `narratorSegments` menutup seluruh durasi tanpa celah/tumpang tindih dan menggabung run sama.
- [ ] **Step 2: RED** — jalankan, gagal.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: GREEN**, `npm run typecheck`, `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "Inti waktu dan posisi narator animasi"`.

### Task 2: Database, repo, IPC, preset terdaftar

**Files:** Modify `src/main/db/index.ts` (migrasi baru di akhir), `src/main/repo.ts` (proyek `narrator`, klip `narrator_cues` di `toClip`, `saveSnapshot`, `duplicateProject`, `insertClipAfter`, `CLIP_COLS` bila ada), `src/main/series.ts` (narator seri ikut pola `updateSeriesSettings` + salin ke episode baru), `src/renderer/src/store/project.ts` (`addClip` bawaan), `src/main/editing.ts` (potong klip: bagi cue); Create `src/main/narrators.ts` (CRUD + preset), `src/shared/narratorPresets.ts` (definisi 5 preset: id, nama, deskripsi bahasa Inggris, styleId/imageStyleId, keyColor); IPC: `narrators:list|get|create|update|remove|duplicate` (+ tipe di `src/shared/api.ts`, `call` di preload)

**Interfaces (Produces):**
```ts
export interface Narrator { id: string; name: string; description: string; style: { kind: 'story' | 'explainer'; id: string }; keyColor: '#00FF00' | '#FF00FF'; preset: boolean; status: 'empty' | 'ready'; spriteUrls: Record<string, string> | null /* "happy-open" → url */; thumbUrl: string | null; createdAt: number }
window.api.narrators.list(): Promise<Narrator[]>   // presets with assets first, then user narrators newest first
window.api.narrators.create(input: { name: string; description: string; style: Narrator['style'] }): Promise<Narrator>
window.api.narrators.update(id, patch: { name?: string; description?: string; style?: Narrator['style'] }): Promise<Narrator>
window.api.narrators.remove(id): Promise<void>      // presets cannot be removed
window.api.narrators.duplicate(id): Promise<Narrator>
```
Sprite disimpan di `<userData>/narrators/<id>/<expression>-<mouth>.png` dan `sheet.png`; preset dibaca dari `resources/narrators/<presetId>/` (folder boleh belum ada → preset disembunyikan). URL file mengikuti cara aset lain disajikan ke renderer.
- [ ] **Step 1: Harness RED** (`C:\temp\narr\t2.json`): `window.api.narrators.list()` → error (belum ada).
- [ ] **Step 2: Implementasi** migrasi (tabel `narrators`; kolom `projects.narrator_json` TEXT default `''`; `clips.narrator_cues` TEXT default `''`; `series.narrator_json` TEXT default `''`), repo, IPC, preset registry.
- [ ] **Step 3: Harness GREEN**: create/list/update/duplicate/remove; proyek simpan + muat `narrator` dan `narratorCues`; duplikasi proyek dan sisip klip membawa nilainya; potong klip membagi cue; seri: ubah narator → episode tanpa adegan ikut (`applied`), episode baru mewarisi; DB lama (buat dengan HEAD dulu, lalu jalankan versi baru) termigrasi tanpa error.
- [ ] **Step 4: `npm run typecheck`, `npm run build`. Commit** — `git commit -m "Data narator: tabel, kolom proyek/klip/seri, dan IPC"`.

### Task 3: Membuat sprite dari lembar grid

**Files:** Create `src/main/narratorSprites.ts`; Modify `src/main/narrators.ts` (`generate(id)` → Job), `src/main/ipc.ts`/`api.ts`/preload (`narrators:generate`), `src/main/devharness.ts` (langkah `main: "narratorSheet"` yang memasang lembar sintetis/berkas ke narator, hanya mode harness)

**Interfaces:**
- `buildSheetPrompt(n: Narrator): string` — bahasa Inggris: grid 4×3 sama besar, urutan sel `NARRATOR_GRID`, setengah badan menghadap kamera, kepala dan bahu di posisi sama di tiap sel, latar `keyColor` polos menutupi seluruh gambar termasuk celah, tanpa teks/nomor/garis grid, gaya dari `style` (prompt gaya visual cerita atau gaya gambar penjelasan).
- `processSheet(sheetPath, outDir, keyColor): Promise<{ ok: true } | { ok: false; reason: string }>` — FFmpeg: crop tiap sel (margin dalam 3%), `chromakey=<key>:0.12:0.06,despill=<green|magenta>` → PNG alfa; `nativeImage`: kotak alfa tiap sprite; tolak bila alfa < 5% atau > 95% atau kotak menyentuh 3 sisi sel; ratakan (tengah horizontal + tepi bawah ke rata-rata) ke kanvas sama; tulis 12 PNG + `thumb.png` (neutral-closed, persegi).
- `generate(id)`: memakai pipeline gambar yang ada (model gambar pengaturan, frame 16:9, tanpa referensi), job dengan progres, simpan `sheet.png`, `processSheet`, status `ready`; gagal → pesan Indonesia ramah ("Lembar ekspresi tidak rapi. Coba buat ulang.").
- [ ] **Step 1: Lembar sintetis** dengan FFmpeg di `C:\temp\narr\sheet-ok.png` (16:9, latar #00FF00, 12 lingkaran/bentuk berbeda warna per sel dengan "mulut" persegi berbeda tinggi untuk open) dan `sheet-bad.png` (2 sel kosong, satu bentuk menembus batas sel).
- [ ] **Step 2: Harness RED**: langkah `narratorSheet` belum ada.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4: Harness GREEN**: `sheet-ok` → 12 PNG alfa ukuran sama, tidak ada sisa hijau di tepi (cek piksel tepi lewat `nativeImage`), lihat montase 12 sprite di atas latar kotak-kotak; `sheet-bad` → `ok:false` dengan alasan, tidak ada sprite tersimpan. Satu pemanggilan `generate` dengan LLM/gambar tiruan tidak diwajibkan (pipeline gambar sudah teruji); cukup uji prompt dengan snapshot teks.
- [ ] **Step 5: `npm run typecheck`, `npm run build`. Commit** — `git commit -m "Sprite narator dari lembar grid dengan green screen"`.

### Task 4: Ekspresi per kalimat (LLM) + Magic deskripsi narator

**Files:** Create `src/main/narratorCues.ts`; Modify `src/main/narration.ts` (setelah narasi selesai & narator aktif → jalankan pemilihan, gagal tidak menggagalkan narasi), IPC `narrators:assignCues(projectId)`, `src/shared/magic.ts` + `src/main/magic.ts` (`narratorLook`, keluaran bahasa Inggris, format penampilan seperti `characterLook`, batas 600)

**Interfaces:**
- `assignCues(projectId): Promise<ProjectBundle>` — satu permintaan `generateJson` untuk semua klip: daftar kalimat bernomor per klip (`splitSentences`), skema strict `{ clips: [{ index, cues: enum[] }] }`, instruksi memilih ekspresi sesuai isi dan nada kalimat (bahasa Inggris), hasil dinormalisasi (`normalizeCues`), panjang dipaskan ke jumlah kalimat (kurang → `neutral`), disimpan ke `narrator_cues`.
- [ ] **Step 1: Harness RED** dengan `scripts/fake-llm.mjs` (perluas balasannya bila perlu agar bisa mengembalikan JSON cues untuk skema `narrator_cues`, mis. berdasarkan nama skema) — IPC belum ada.
- [ ] **Step 2: Implementasi.**
- [ ] **Step 3: Harness GREEN**: seed proyek demo (`{"main":"seed"}`), aktifkan narator, `assignCues` → cue tersimpan per klip dengan panjang = jumlah kalimat; balasan LLM rusak → semua `neutral` + error ramah; Magic `narratorLook` mengembalikan teks.
- [ ] **Step 4: `npm run typecheck`, `npm run build`. Commit** — `git commit -m "Ekspresi narator per kalimat dan Magic deskripsi narator"`.

### Task 5: UI — koleksi narator, pemilih di proyek dan seri, editor ekspresi

**Files:** Create `src/renderer/src/components/NarratorPicker.tsx` (grid thumbnail + "Buat narator"), `src/renderer/src/components/NarratorDialog.tsx` (buat/ubah: nama, deskripsi + Magic, gaya — grid gaya yang ada, tombol Buat/Buat ulang dengan progres job, hapus/duplikat); Modify `IdeaStep.tsx`, `ExplainerIdeaStep.tsx` (bagian "Narator": pemilih, sakelar, posisi kiri/kanan, ukuran Kecil/Sedang/Besar via `Segmented`), `SeriesSettings.tsx`, editor ekspresi per kalimat (cerita: `Inspector.tsx` panel klip; penjelasan: `ScenesStep.tsx`) — daftar kalimat dengan chip ekspresi (ikon/emoji + nama Indonesia: Netral, Senang, Sedih, Kaget, Serius, Berpikir) dan tombol "Pilih ekspresi otomatis".
- Narator dirujuk tapi tidak ada → catatan "Narator sudah dihapus" + diperlakukan nonaktif.
- [ ] **Step 1: Harness RED** — elemen `[data-narrator-picker]` belum ada.
- [ ] **Step 2: Implementasi** (gaya bawaan saat membuat = gaya proyek; preset tidak bisa dihapus).
- [ ] **Step 3: Harness GREEN** (lembar sintetis Task 3 untuk narator uji): pilih narator di proyek cerita dan penjelasan, ubah posisi/ukuran tersimpan, ubah cue satu kalimat tersimpan, hapus narator → catatan muncul; screenshot 1180×720 dilihat.
- [ ] **Step 4: `npm run typecheck`, `npm run build`. Commit** — `git commit -m "Pemilih dan editor narator di proyek, seri, dan adegan"`.

### Task 6: Render narator di video cerita (pratinjau + ekspor FFmpeg)

**Files:** Modify `src/renderer/src/pages/project/editor/Player.tsx`/`engine.ts` (gambar narator di atas overlay, di bawah caption, dari `narratorSpriteAt` + `narratorBox`), `src/main/exporter.ts` (`narratorSegments` → file `ffconcat` PNG berdurasi → input + `scale` + `overlay` di posisi `narratorBox`, sebelum caption dibakar; caption digeser naik bila bertabrakan — logika geser di `src/shared/` dan dipakai keduanya)
- [ ] **Step 1: Harness RED**: proyek demo + narator sintetis aktif → frame pratinjau & ekspor tanpa narator.
- [ ] **Step 2: Implementasi.**
- [ ] **Step 3: Harness GREEN**: ekspor 16:9 dan 9:16; cuplik frame MP4 di 3 waktu (jeda, tengah kata, kalimat dengan cue berbeda) dan screenshot pratinjau di waktu yang sama → narator sama posisi/sprite; caption di atas narator di 9:16; narator nonaktif → perintah FFmpeg tanpa input/filter narator.
- [ ] **Step 4: `npm run typecheck`, `npm run build`. Commit** — `git commit -m "Narator animasi di pratinjau dan ekspor video cerita"`.

### Task 7: Render narator di video penjelasan (Remotion)

**Files:** Modify `src/shared/explainer.ts` (hanya: `ExplainerInput.narrator?: { sprites: Record<string,string>; track: NarratorTrackClip[]; settings: NarratorSettings; aspect: number } | null` diisi `buildExplainerInput`), `src/remotion/explainer/ExplainerVideo.tsx` (lapisan `NarratorLayer` di akar; kurangi area konten `Frame` di sisi narator; caption naik bila bertabrakan), Create `src/remotion/explainer/narrator.tsx`
- [ ] **Step 1: Harness RED**: `seedExplainer` + narator sintetis → tanpa narator.
- [ ] **Step 2: Implementasi** (Player dan render memakai komponen yang sama; sprite dimuat lewat URL aset seperti gambar adegan).
- [ ] **Step 3: Harness GREEN**: pratinjau dan ekspor Remotion 16:9 dan 9:16, frame di waktu sama identik secara visual; teks adegan tidak tertutup; narator nonaktif → identik dengan sebelum fitur.
- [ ] **Step 4: `npm run typecheck`, `npm run build`. Commit** — `git commit -m "Narator animasi di video penjelasan"`.

### Task 8: Buat aset 5 preset + dokumentasi

> **Berhenti dan minta persetujuan pengguna** sebelum Step 2 (memakai kuota 9Router pengguna, maks 5 generate + 5 ulangan).

**Files:** Create `resources/narrators/<presetId>/*.png` (12 sprite + thumb + sheet untuk tiap preset), Modify `electron-builder.yml` bila `resources/narrators` belum ikut terpaket, `docs/` (narator: arsitektur, data, cara membuat preset), `AGENTS.md` (peta kode: `narrator.ts`, `narrators.ts`, `narratorSprites.ts`), `CHANGELOG.md`.
- [ ] **Step 1:** Siapkan langkah harness memakai salinan data pengguna (studio.db + wal/shm + Local State ke `C:\temp\narr-presets`, tanpa membaca tabel secrets) dan model `9router:ag/gemini-3.1-flash-image`.
- [ ] **Step 2 (setelah disetujui):** generate lembar 5 preset, proses, periksa montase tiap preset (konsisten, tanpa sisa hijau, tanpa teks); ulangi seperlunya (≤5).
- [ ] **Step 3:** Salin hasil ke `resources/narrators/`, hapus salinan data, pastikan terhapus.
- [ ] **Step 4:** Dokumentasi + CHANGELOG, `npm run typecheck`, `npm run build` (cek preset ikut di `dist`/resources). Commit — `git commit -m "Preset narator dan dokumentasi"`.
