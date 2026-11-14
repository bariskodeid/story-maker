# Gaya gambar AI, palet, dan thumbnail untuk Video penjelasan — desain singkat

Tanggal: 2026-11-14. Bagian 1 dari 3 (2: template Sejarah dan Sains dengan timeline dan grafik; 3: narator animasi
dengan mimik wajah untuk kedua tipe video).

## Maksud

Pengguna ingin membuat video penjelasan **edukasi sejarah dan sains**. Gaya gambar AI yang ada (13) condong ke
teknologi dan produk, dan pemilihnya hanya ikon + kotak warna, padahal aturan UI proyek meminta pilihan visual berupa
grid thumbnail persegi (`docs/konvensi.md`, aturan UI 2). Bagian ini menambah gaya dan palet yang cocok untuk sejarah
dan sains, lalu memberi semua gaya gambar thumbnail asli.

## Tujuan

1. **8 gaya gambar AI baru** di `EXPLAINER_IMAGE_STYLES` (`src/shared/explainer.ts`), masing-masing dengan `id`,
   `name`, `blurb`, `swatch`, `ink`, `prompt` (bahasa Inggris, tanpa teks di gambar, mengikuti pola gaya yang ada):

   | id | name | Untuk |
   |---|---|---|
   | `oldmap` | Peta kuno | sejarah: perkamen, kartografi lama, rute dan wilayah |
   | `engraving` | Ukiran ensiklopedia | sejarah: gravir/ukiran hitam-putih ala buku tua |
   | `historypaint` | Lukisan sejarah | sejarah: lukisan klasik museum, adegan peristiwa |
   | `relief` | Relief candi | sejarah: pahatan batu ala relief Borobudur/Prambanan |
   | `textbook` | Diagram buku pelajaran | sains: ilustrasi ilmiah bersih, potongan melintang |
   | `micro` | Mikroskopis | sains: sel, molekul, tampilan mikroskop |
   | `space` | Luar angkasa | sains: render ala foto teleskop/NASA |
   | `inventor` | Sketsa penemu | sains: sketsa tinta di kertas tua ala buku catatan Da Vinci |

2. **12 palet baru**: dua per template yang ada (tutorial, tips, facts, quote, compare, news). Satu bernuansa
   **sejarah** (hangat: perkamen, sepia, merah bata) dan satu bernuansa **sains** (sejuk: lab bersih atau kosmos
   gelap). Warnanya disesuaikan dengan karakter tiap template (misalnya tips tetap cerah dan berani). ID baru unik di
   dalam templatenya dan tidak bentrok dengan ID palet yang ada.
3. **Thumbnail untuk semua gaya gambar AI** yang punya prompt (12 lama selain `auto` + 8 baru = 20). Pemilih
   `ImageStylePicker` menampilkan thumbnail itu di tile persegi (cover), dengan ikon + kotak warna sebagai cadangan
   kalau thumbnail tidak ada (termasuk `auto`).

## Bukan tujuan

- Template baru, jenis adegan timeline/grafik (bagian 2), narator animasi (bagian 3).
- Thumbnail untuk palet (pemilih palet tetap seperti sekarang).
- Mengubah gaya visual video cerita.

## Batasan

- Gambar AI tanpa teks/huruf (label dan angka ditulis adegan Remotion).
- Kontras palet: `ink` di atas `bg` dan di atas `surface` ≥ 4,5:1; `accent` di atas `bg` ≥ 3:1. `dark` harus sesuai
  kecerahan `bg`.
- Prompt LLM dan prompt gambar bahasa Inggris; teks UI bahasa Indonesia.
- Kunci API pengguna tidak boleh keluar dari penyimpanan terenkripsinya dan tidak boleh dicetak.

## Pendekatan (dipilih: A)

- **A — lewat aplikasinya sendiri, dengan salinan data (dipilih).** Salin `studio.db` dan `Local State` dari
  `%APPDATA%\Story Maker` ke folder sementara (kunci tetap terenkripsi DPAPI untuk akun Windows yang sama), jalankan
  dev harness dengan `STUDIO_USER_DATA` ke salinan itu: buat proyek penjelasan contoh, set gaya gambar per adegan,
  jalankan pembuatan gambar adegan yang biasa (`generate.clipImage`) dengan model `9router:ag/gemini-3.1-flash-image`,
  lalu ambil file gambarnya. Thumbnail dibuat dengan prompt gaya yang persis dipakai pengguna. Salinan dihapus setelah
  selesai. Data asli tidak disentuh.
- **B — script terpisah ke 9Router.** Pengguna mengisi kunci sebagai variabel lingkungan; prompt gaya disalin ke
  script. Ditolak: kunci harus diketik, prompt bisa menyimpang dari aplikasi.

## Yang diputuskan bersama pengguna

- Fokus konten: edukasi sejarah dan sains.
- Thumbnail dibuat lewat 9Router pengguna (kuota akunnya), dengan cara A.
- Urutan proyek 1 → 2 → 3; narator nanti untuk kedua tipe video.

## Diserahkan ke pembangun (keputusan Claude, bisa dikoreksi)

- Format thumbnail mengikuti thumbnail gaya cerita: WebP 640×358, disimpan di
  `src/renderer/src/assets/explainer-styles/<id>.webp`, dimuat dengan `import.meta.glob` seperti `StyleArt.tsx`.
- Subjek tiap thumbnail dipilih sesuai kegunaan gayanya dan berbeda antar gaya (misalnya peta pesisir untuk `oldmap`,
  sel untuk `micro`), supaya tiap tile langsung terbaca. Satu kali generate per gaya; ulangi hanya kalau hasilnya
  jelas gagal (ada teks, salah gaya, kosong).
- Ikon baru untuk 8 gaya di peta `ICON` pemilih (cadangan bila thumbnail hilang).
- Dev harness boleh mendapat langkah kecil tambahan bila dibutuhkan untuk menunggu job gambar atau menyalin file
  aset, hanya aktif di mode harness.
