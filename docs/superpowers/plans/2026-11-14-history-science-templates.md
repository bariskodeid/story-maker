# Template Sejarah dan Sains (timeline + grafik) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dua template video penjelasan baru (`history`, `science`) dengan dua jenis adegan baru (`timeline`, `chart`
dengan 4 jenis grafik), bisa ditulis LLM, diedit pengguna, dan dirender sama di pratinjau dan ekspor.

**Architecture:** Model adegan datar (`ExplainerScene` di `src/shared/explainer.ts`, disimpan sebagai `scene_json`)
diperluas dengan field terstruktur `timeline` dan `chart`; `normalizeScene` mengisi nilai kosong untuk adegan lama.
Template baru didaftarkan di `EXPLAINER_TEMPLATES` dan semua tempat yang memakai `Record<ExplainerTemplateId, …>`.
Komponen Remotion baru (`timeline.tsx`, `chart.tsx`) dipakai Player dan render lewat `SCENES` di `ExplainerVideo.tsx`.

**Tech Stack:** TypeScript strict, Remotion (`useCurrentFrame`, `interpolate`, SVG), React + Tailwind v4, Electron dev
harness, esbuild untuk skrip cek.

**Spec:** `docs/superpowers/specs/2026-11-14-history-science-templates-design.md` (baca juga bagian "Keputusan dari
pemeriksaan pembangun" — itu mengikat).

## Global Constraints

- Tanpa migrasi database; adegan lama (tanpa `timeline`/`chart`) harus terbuka dan tampil persis seperti sebelumnya.
- Skema LLM strict: semua field wajib; `timeline` `[]` dan `chart` `{ kind: 'none', unit: '', items: [] }` bila tidak
  dipakai; enum `chart.kind` = `['none','bar','line','donut','bubble']`; `items[].value` bertipe `number`.
- `ChartKind = 'bar' | 'line' | 'donut' | 'bubble'`; "tidak ada grafik" = `items` kosong.
- Batas: timeline 3–6 titik (maks 6); bar 2–8; line 3–12; donut 2–6; bubble 2–6 (maksimum dipotong; di bawah minimum
  tetap tampil). Nilai negatif dibuang untuk donut dan bubble. Semua nilai 0 → tetap tampil tanpa error/NaN.
- `timeline` dan `chart` tidak bergambar: tanpa field `image`, `imageMode` dipaksa `'none'`.
- Angka diformat dengan `Intl.NumberFormat` dari `ExplainerInput.language` (`id` → `id-ID`, lainnya apa adanya,
  gagal → `en-US`), maks 2 desimal; Player dan render memakai helper yang sama.
- Pratinjau dan ekspor memakai komponen Remotion yang sama (aturan 1 AGENTS.md).
- Teks UI bahasa Indonesia; prompt LLM bahasa Inggris; komentar kode bahasa Inggris (menjelaskan *kenapa*); tanpa
  `<select>` bawaan; tanpa font baru.
- Kontras palet baru: `ink`/`bg` ≥ 4,5:1, `ink`/`surface` ≥ 4,5:1, `accent`/`bg` ≥ 3:1, `dark` sesuai luminans `bg`.
- Teks di atas isian berwarna memakai `onColor(...)`.
- `npm run typecheck` dan `npm run build` bersih di akhir tiap task. Uji harness memakai `STUDIO_USER_DATA` sementara
  (`C:\temp\...`), build sebelum harness, tidak ada proses Electron tertinggal, data asli tidak disentuh.

## Review Focus

1. **Proyek lama dibuka setelah update** → adegan tanpa field baru dinormalisasi tanpa error dan tampil sama (Task 1
   cek `normalizeScene` pada scene_json lama).
2. **LLM mengirim data grafik buruk** (nilai string "1.234,5", NaN, negatif di donut, 20 item, label kosong) → dibersihkan,
   tidak crash render (Task 1 cek normalisasi; Task 4/5 harness dengan data tepi).
3. **Pengguna mengetik angka dengan koma** ("3,5") di editor grafik → tersimpan 3.5, tampil "3,5" (Task 6).
4. **Video 9:16** → timeline menurun dan grafik tetap terbaca tanpa terpotong (Task 3–5 screenshot 9:16).
5. **Template diganti** dari sejarah ke template lain lalu kembali → data timeline/chart tidak hilang (Task 6 harness).

---

### Task 1: Model data, normalisasi, bahasa di input, skema LLM

**Files:**
- Modify: `src/shared/explainer.ts` (tipe, `SceneField`, `SCENE_TYPES`, `emptyScene`, `normalizeScene`, `ExplainerInput`, `buildExplainerInput`, `sampleExplainerInput`)
- Modify: `src/main/explainer.ts` (`scenesSchema`, pemetaan hasil LLM ke adegan)

**Interfaces (Produces):**
```ts
export type ChartKind = 'bar' | 'line' | 'donut' | 'bubble'
export interface TimelinePoint { date: string; title: string }
export interface ChartItem { label: string; value: number }
export interface ExplainerChart { kind: ChartKind; unit: string; items: ChartItem[] }
// ExplainerScene gains: timeline: TimelinePoint[]; chart: ExplainerChart
// SceneType gains 'timeline' | 'chart'; SceneField gains 'timeline' | 'chart'
// SCENE_TYPES: { id:'timeline', name:'Linimasa', fields:['label','heading','body','author','timeline'] },
//              { id:'chart', name:'Grafik', fields:['label','heading','body','author','chart'] }
export const CHART_LIMITS: Record<ChartKind, { min: number; max: number }> // bar 2–8, line 3–12, donut 2–6, bubble 2–6
export const TIMELINE_MAX = 6
export function chartNumber(raw: unknown): number | null   // number, or string with comma/dot decimals and thousands separators; else null
export function formatChartValue(value: number, language: string): string // Intl.NumberFormat, max 2 decimals
// ExplainerInput gains: language: string  (filled by buildExplainerInput from project.language; sampleExplainerInput uses 'id')
```
Catatan: `buildExplainerInput` menerima `project` — tambahkan `'language'` ke `Pick<Project, …>` dan perbarui pemanggilnya.

- [ ] **Step 1: Skrip cek** `C:\temp\check-hs.mjs`: bundel `src/shared/explainer.ts` (esbuild `--bundle --format=esm`) lalu assert:
  - `normalizeScene({type:'step',heading:'x'})` (scene lama) → `timeline` `[]`, `chart` `{kind:'bar',unit:'',items:[]}`, field lain sama seperti HEAD (bandingkan dengan bundel versi HEAD untuk 3 scene lama dari `SAMPLE_SCENES`).
  - `chartNumber('1.234,5')===1234.5`, `chartNumber('3,5')===3.5`, `chartNumber('1,234.5')===1234.5`, `chartNumber(7)===7`, `chartNumber('abc')===null`, `chartNumber(NaN)===null`.
  - chart donut dengan item negatif → item negatif dibuang; bar dengan 20 item → 8; item tanpa label atau nilai invalid dibuang; `kind:'none'` → `'bar'`.
  - timeline 9 titik → 6; titik tanpa `date` dan `title` dibuang.
  - `type:'chart'` dengan `imageMode:'ai'` → `'none'`.
  - `formatChartValue(1234.5,'id')==='1.234,5'`, `formatChartValue(1234.5,'en')==='1,234.5'`, `formatChartValue(2,'xx-invalid')` tidak throw.
- [ ] **Step 2: Jalankan; Expected:** gagal (fungsi/field belum ada).
- [ ] **Step 3: Implementasi** di `src/shared/explainer.ts` sesuai Interfaces dan Global Constraints.
- [ ] **Step 4: Skema LLM** di `src/main/explainer.ts`: tambah `timeline` (array objek `{date,title}` wajib) dan `chart` (objek `{kind enum, unit, items: [{label, value:number}]}` wajib) ke properti dan `required`; deskripsi bahasa Inggris (pakai hanya untuk adegan timeline/chart, selain itu kosong / kind "none"). Pastikan hasil LLM melewati `normalizeScene`.
- [ ] **Step 5: Jalankan skrip; Expected:** semua lulus. `npm run typecheck`, `npm run build` bersih.
- [ ] **Step 6: Commit** — `git commit -m "Model adegan linimasa dan grafik untuk video penjelasan"` (+ trailer).

### Task 2: Template `history` dan `science` terdaftar di semua tempat

**Files:**
- Modify: `src/shared/explainer.ts` (`ExplainerTemplateId`, `EXPLAINER_TEMPLATES`, peta `look` di `explainerImagePrompt`, `SAMPLE_SCENES`)
- Modify: `src/remotion/explainer/ExplainerVideo.tsx` (hiasan latar per template di `Backdrop`, transisi di `SceneShell`)
- Modify: `src/renderer/src/pages/Home.tsx` (`EXPLAINER_SUGGESTIONS`, dan seri bila ada per-template)
- Modify: `src/renderer/src/pages/project/explainer/ExplainerIdeaStep.tsx` (`PLACEHOLDERS`)
- Modify: tempat lain yang ditunjuk `npm run typecheck` (mis. `captions.tsx`, `ExplainerPreview.tsx`, `series.ts`) — hanya bila perlu

**Interfaces (Produces):**
- `history`: name "Sejarah / linimasa", blurb ≤ 90 karakter, `sceneTypes: ['title','timeline','fact','quote','points','outro']`, `mainType: 'timeline'`, ≥5 palet (indeks 0 `perkamen`), fonts mulai `dmserif`, guidance sesuai spec + aturan akurasi.
- `science`: name "Sains / data", `sceneTypes: ['title','chart','fact','step','compare','points','outro']`, `mainType: 'fact'`, ≥5 palet (indeks 0 `lab`), font sans yang ada, guidance sesuai spec (pemilihan `chart.kind`) + aturan akurasi.
- `SAMPLE_SCENES.history` (≥5 adegan, termasuk 1 `timeline` 5 titik, 1 `fact` dengan tahun) dan `SAMPLE_SCENES.science` (≥6 adegan, termasuk 4 adegan `chart`: bar, line, donut, bubble dengan data nyata dan sumber).
- Peta `look` "Otomatis": history = lukisan sejarah, science = diagram buku pelajaran (bahasa Inggris, satu kalimat).

- [ ] **Step 1: Perluas `C:\temp\check-hs.mjs`**: 8 template; `history`/`science` punya field sesuai Interfaces; palet unik, indeks 0 sesuai, kontras lolos (pakai kode cek kontras bagian 1 bila ada di `C:\temp`, atau tulis ulang: luminans relatif sRGB); `SAMPLE_SCENES` kedua template lolos `normalizeScene(scene, template.sceneTypes)` tanpa berubah tipe.
- [ ] **Step 2: Jalankan; Expected:** gagal (template belum ada).
- [ ] **Step 3: Implementasi** template + hiasan latar (sejarah: tekstur kertas tua halus + vinyet, CSS/SVG; sains: grid milimeter halus) + transisi `SceneShell` (sejarah lembut dan lebih lambat; sains rapi dan cepat). Sampai Task 3–5 selesai, `timeline`/`chart` boleh dirender dengan tata letak sementara yang aman (mis. `StepScene`) lewat `SCENES`.
- [ ] **Step 4: Harness** (`{"main":"seedExplainer","template":"history"}` lalu `science`), screenshot pemilih template di Beranda dan langkah 1 (8 template tampil rapi, 1180×720), dan pratinjau adegan judul kedua template. Lihat screenshot.
- [ ] **Step 5: Skrip cek lulus, `npm run typecheck`, `npm run build` bersih.**
- [ ] **Step 6: Commit** — `git commit -m "Template Sejarah dan Sains untuk video penjelasan"`.

### Task 3: Adegan Linimasa (Remotion)

**Files:**
- Create: `src/remotion/explainer/timeline.tsx` (`TimelineScene`)
- Modify: `src/remotion/explainer/ExplainerVideo.tsx` (`SCENES.timeline = TimelineScene`)

**Interfaces:**
- Consumes: `SceneProps`, `Frame` (`f.u`, `f.portrait`, `f.contentWidth`), helper yang ada (`enter`, `Words`, `headingStyle`, `fitSize`, `alpha`, `onColor`) — baca `scenes.tsx`/`news.tsx`/`parts.tsx`.
- Perilaku: lihat spec Tujuan 1. Garis tergambar dulu (~10 frame), titik muncul dengan jarak `Math.max(6, Math.min(40, frames*0.5/n))` seperti `PointsScene`; titik terakhir yang sudah muncul beraksen; 16:9 mendatar, 9:16 menurun; teks panjang dipotong rapi (≤2 baris per titik); `author` kecil di bawah sebagai sumber.

- [ ] **Step 1: Harness** template history: render beberapa frame adegan timeline (awal, tengah, akhir) di 16:9 dan 9:16 lewat Player (lihat cara screenshot frame di dokumentasi harness; atau ekspor pendek). Expected sebelum implementasi: tata letak sementara Task 2.
- [ ] **Step 2: Implementasi `TimelineScene`.**
- [ ] **Step 3: Harness ulang**: 3 titik, 5 titik, 6 titik dengan judul panjang; 16:9 dan 9:16; screenshot dilihat — terbaca, tidak terpotong, animasi bertahap terlihat antar frame.
- [ ] **Step 4: `npm run typecheck`, `npm run build` bersih. Commit** — `git commit -m "Adegan linimasa untuk template Sejarah"`.

### Task 4: Adegan Grafik — batang dan garis

**Files:**
- Create: `src/remotion/explainer/chart.tsx` (`ChartScene` + `BarChart`, `LineChart`; donut/bubble menyusul di Task 5 — sementara tampilkan `BarChart` untuk keduanya)
- Modify: `src/remotion/explainer/ExplainerVideo.tsx` (`SCENES.chart = ChartScene`)

**Interfaces:**
- Consumes: `formatChartValue(value, input.language)` (Task 1), helper Remotion yang ada.
- `ChartScene`: kicker `label`, `heading`, area grafik, `body` (kesimpulan) dan `author` (sumber, kecil). Grafik digambar SVG/div, warna dari palet (`accent`, `accent2`, turunannya), teks di atas isian `onColor`.
- `bar`: vertikal di 16:9 bila semua label ≤ 12 karakter, selain itu horizontal; 9:16 selalu horizontal. Batang tumbuh bergantian; angka menghitung naik (interpolasi nilai, diformat). Nilai negatif turun di bawah sumbu nol.
- `line`: sumbu nol/rentang dari min–max data (dengan ruang 10%); garis tergambar kiri→kanan (stroke-dashoffset), titik muncul mengikuti; label sumbu x tiap titik (dipangkas bila >8 titik: tampilkan sebagian); nilai titik terakhir ditonjolkan.
- Semua nilai 0 → batang/garis datar, tanpa NaN.

- [ ] **Step 1: Harness** template science, adegan bar dan line dari `SAMPLE_SCENES`, frame awal/tengah/akhir, 16:9 dan 9:16. Expected sebelum implementasi: tata letak sementara.
- [ ] **Step 2: Implementasi.**
- [ ] **Step 3: Harness ulang** + kasus tepi via `projects.save` (bar 8 item label panjang; line 12 titik dengan nilai negatif; semua nol); screenshot dilihat.
- [ ] **Step 4: `npm run typecheck`, `npm run build` bersih. Commit** — `git commit -m "Grafik batang dan garis untuk template Sains"`.

### Task 5: Adegan Grafik — donut dan lingkaran proporsional

**Files:**
- Modify: `src/remotion/explainer/chart.tsx` (`DonutChart`, `BubbleChart`)

**Interfaces:**
- `donut`: irisan dari total item (persen = value/total), terbuka berurutan searah jarum jam dari atas; legenda (warna + label + persen dibulatkan, total 100 tampil apa adanya); total 0 → cincin kosong abu tipis tanpa NaN.
- `bubble`: luas lingkaran ∝ nilai (radius ∝ √nilai), diurutkan kecil→besar, diskalakan agar terbesar muat; nilai sangat kecil tetap minimal terlihat (radius minimum) dengan label; lingkaran membesar bergantian; label + nilai terformat di bawah (16:9 berjajar, 9:16 boleh dua baris).

- [ ] **Step 1: Harness** adegan donut dan bubble dari `SAMPLE_SCENES` (frame awal/tengah/akhir, 16:9 dan 9:16). Expected: tampil sebagai batang (sementara Task 4).
- [ ] **Step 2: Implementasi.**
- [ ] **Step 3: Harness ulang** + kasus tepi (donut 6 irisan dengan satu sangat kecil; bubble rasio 1:10.000; total nol); screenshot dilihat.
- [ ] **Step 4: Ekspor satu proyek science penuh** (`{"main":"export","projectId":…}` atau seed + export) dan cuplik frame grafik dari MP4 dengan ffmpeg — sama dengan pratinjau. Lihat frame.
- [ ] **Step 5: `npm run typecheck`, `npm run build` bersih. Commit** — `git commit -m "Grafik donut dan lingkaran proporsional untuk template Sains"`.

### Task 6: Editor adegan linimasa dan grafik + dokumentasi

**Files:**
- Modify: `src/renderer/src/pages/project/explainer/ScenesStep.tsx` (`SceneForm`: editor `timeline` dan `chart`)
- Modify: `docs/remotion.md` (template baru, jenis adegan baru, cara menambah jenis grafik), `CHANGELOG.md`

**Interfaces:**
- Timeline: baris `[Tanggal] [Peristiwa]` + tombol hapus, geser naik/turun (ikon), "Tambah titik" (nonaktif di 6).
- Grafik: 4 tombol jenis bergambar ikon `lucide-react` (Batang, Garis, Donut, Lingkaran) dengan tanda terpilih `bg-sun-soft`; kolom Satuan; baris `[Label] [Angka]` + hapus/geser; "Tambah data" (nonaktif di batas maksimum jenis). Input angka bebas diketik (string lokal di state baris), disimpan lewat `chartNumber`; angka tidak valid ditandai merah dan tidak disimpan.
- Pengingat kecil di kedua editor: "Cek ulang tahun dan angka sebelum ekspor." Kolom Sumber (`author`) tetap ada (label "Sumber").
- Simpan otomatis seperti field lain (`updateClip`/`onScene` yang ada).

- [ ] **Step 1: Harness** proyek science dan history: buka langkah Adegan, pilih adegan grafik/timeline. Expected sebelum implementasi: tidak ada editor data.
- [ ] **Step 2: Implementasi.**
- [ ] **Step 3: Harness ulang**: ketik "3,5" di angka → `projects.get` menyimpan `3.5`, pratinjau menampilkan "3,5"; tambah/hapus/geser titik timeline tersimpan; ganti jenis grafik bar→donut tampil; ganti template proyek ke `tips` lalu kembali ke `science` → data grafik masih ada. Screenshot 1180×720 dilihat.
- [ ] **Step 4: Dokumentasi + CHANGELOG** ("[Belum dirilis] › Ditambahkan": template Sejarah dan Sains, adegan linimasa, grafik batang/garis/donut/lingkaran proporsional).
- [ ] **Step 5: `npm run typecheck`, `npm run build` bersih. Commit** — `git commit -m "Editor data linimasa dan grafik di langkah Adegan"`.
