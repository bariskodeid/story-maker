# Changelog

Semua perubahan penting dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/),
dan nomor versi mengikuti [Semantic Versioning](https://semver.org/lang/id/): **mayor** untuk perubahan yang merusak
data atau alur lama, **minor** untuk fitur baru, **patch** untuk perbaikan.

Cara menaikkan versi ada di [docs/pengembangan.md](docs/pengembangan.md#versi-dan-rilis).

## [Belum dirilis]

### Ditambahkan
- Dua template video penjelasan baru:
  - **Perbandingan (A vs B)**: layar terbelah miring dengan warna masing-masing pilihan, ronde per aspek dengan angka
    besar dan pemenang yang terungkap (cakram VS berubah jadi skor), adegan plus minus, putusan dengan cap dan skor
    akhir, serta transisi dua warna yang bertabrakan.
  - **Berita / rangkuman cepat**: pembuka dengan daftar berita, judul dalam lower third, poin penting yang muncul satu
    per satu, tanggal dan sumber, bug desk di pojok, ticker judul (16:9), dan pita merah di setiap potongan. AI hanya
    merangkum isi topik, tanpa mengarang peristiwa, angka, atau sumber.
- **Gaya caption** untuk video penjelasan: **Kotak**, **Karaoke** (warna mengisi kata demi kata), **Minimal**, dan
  **Besar** (2–3 kata besar ala Shorts), di posisi bawah, tengah, atau atas, dipilih dari kotak pratinjau di Editor.
  Isi adegan bergeser dan mengecil bila perlu, jadi caption tidak pernah menutupi teks adegan.
- Kolom opsional **Kunci lisensi Remotion** di Pengaturan › Umum › Mesin render, untuk perusahaan dengan lebih dari
  3 orang. Disimpan terenkripsi; tanpa kunci, ekspor berjalan seperti sebelumnya.
- Model gambar AI video penjelasan bisa diganti di langkah Adegan, tanpa kembali ke langkah 1.
- **Video penjelasan**, jenis proyek baru di samping cerita. Pilih di Beranda, tulis topiknya, lalu pilih satu dari
  empat template: **Tutorial langkah demi langkah**, **Tips & trik**, **Fakta / countdown**, dan **Kutipan /
  motivasi**. AI menulis adegan yang didesain (judul, langkah dengan kode atau perintah terminal, tips dengan emoji,
  fakta dengan angka besar, kutipan, perbandingan, penutup) beserta narasinya.
  - Langkah **Adegan**: ubah teks, jenis adegan, dan narasi dengan pratinjau langsung; unggah screenshot per adegan
    dan tandai bagian pentingnya dengan kotak sorotan; atau buat gambar AI (Higgsfield/9Router).
  - Langkah **Editor**: pratinjau video utuh dengan Remotion Player, palet warna, warna aksen, font judul, caption,
    logo, dan musik latar yang mengecil saat narasi.
  - Ekspor dengan Remotion (720p, 1080p, 4K), lalu volume disamakan ke −14 LUFS; `.srt` opsional. Sekali klik dan
    ekspor otomatis juga berlaku.
- **Mesin render video penjelasan** di Pengaturan › Umum: Chrome Headless Shell (unduhan ±100 MB, terpasang
  ±250 MB) diunduh sekali ke folder data aplikasi, otomatis saat ekspor pertama atau dari sini, dengan tombol
  **Uji render**.
- Catatan lisensi Remotion di halaman Tentang dan README: gratis untuk perorangan dan perusahaan sampai 3 karyawan;
  perusahaan yang lebih besar perlu Remotion Company License sendiri.

### Diubah
- Nama aplikasi menjadi **Story Maker** (installer `StoryMaker-Setup-<versi>.exe`, ID aplikasi
  `com.bariskode.storymaker`). Folder data lama `%APPDATA%\Bang Story` dipindahkan otomatis ke
  `%APPDATA%\Story Maker` saat pertama dibuka. Karena ID aplikasinya baru, Windows menganggapnya aplikasi lain:
  instalasi Bang Story yang lama perlu dihapus sendiri.

### Dihapus
- Video tutorial YouTube dan tautan channel di halaman Tentang, beserta header Referer khusus embed YouTube dan izin
  iframe YouTube di CSP.
- Tautan referral Higgsfield di Pengaturan, diganti dengan dashboard Higgsfield Cloud.

### Diperbaiki
- Hiasan template Tips (konfeti, cakram, cincin) tidak lagi muncul di sela huruf judul atau caption; grid titik
  Tutorial memudar di bawah teks, dan cincin di adegan penutup diganti cahaya lembut.
- Teks adegan yang terlalu panjang tidak lagi tumpah ke caption atau keluar layar: isinya diperkecil sampai muat.
- Caption Tips dengan palet Arang (gelap) kini terbaca (sebelumnya teks putih di kotak krem).

### Ditambahkan
- **Seri dan episode**: dari satu premis, AI menyusun bible seri (dunia, nada, aturan), pemeran tetap, dan rencana
  2–20 episode, bersambung atau antologi. Setiap episode adalah proyek biasa dengan naskah yang mengikuti bible dan
  ringkasan episode sebelumnya. Lembar karakter dibuat sekali lalu disalin ke setiap episode. Halaman seri untuk
  menyunting bible, pemeran, dan episode; **Tambah episode**; dan **Buat semua episode sekali klik** yang membuat
  episode satu per satu (bisa dihentikan dan dilanjutkan) dengan ekspor opsional ke folder seri. Seri tampil sebagai
  kartu bertumpuk di Beranda dengan filter **Seri**.
- **Sekali klik** di Beranda: dari satu ide, naskah, rencana visual, lembar karakter, gambar klip, narasi, dan
  caption dibuat otomatis, lalu proyek terbuka di editor. Progresnya tampil di halaman proyek, bisa dihentikan, dan
  bisa dilanjutkan tanpa mengulang langkah yang sudah selesai. Video AI tidak ikut dibuat.
- **Lanjutkan otomatis** di header proyek: meneruskan proyek yang sudah ada dari langkah terakhirnya dengan cara
  yang sama. Tombolnya hanya muncul kalau masih ada yang perlu dibuat.
- Opsi **ekspor MP4 otomatis** setelah editor siap, di dialog Sekali klik/Lanjutkan otomatis dan di panel progres.
  Memakai pilihan bawaan dialog Ekspor dan folder ekspor bawaan; pilihan terakhir diingat.
- **9Router** (gateway AI lokal atau yang di-host sendiri, kompatibel OpenAI) sebagai penyedia baru. Satu koneksi
  (alamat + kunci opsional) dipakai untuk:
  - penyusun cerita (naskah, rencana visual, prompt musik);
  - suara narator lewat `/v1/audio/speech`, misalnya Edge TTS bahasa Indonesia, dengan daftar suara bawaan dan ID
    suara yang bisa diketik sendiri;
  - gambar klip dan lembar karakter lewat `/v1/images/generations`, dengan lembar karakter sebagai gambar
    referensi. Video tetap dari Higgsfield.

### Diperbaiki
- Permintaan ke penyedia LLM mengirim User-Agent `Story Maker/<versi>`, supaya tidak diblokir Cloudflare di server
  yang di-host sendiri.

## [1.0.0] - 2026-10-02

Rilis pertama Bang Story (sebelumnya bernama Studio Cerita).

### Alur produksi
- Empat langkah: **Ide cerita → Naskah → Storyboard → Editor**, tersimpan otomatis di database lokal.
- Penyusun cerita memakai Gemini, OpenRouter, Groq, atau endpoint custom yang kompatibel dengan OpenAI. Daftar
  modelnya diambil langsung dari penyedia.
- Naskah bisa diubah, ditambah, dihapus, dan diurutkan ulang. Narasi boleh memuat tag ekspresi suara.
- Rencana visual dibuat dari naskah final: prompt gambar berlabel (dunia dan era, aksi, baju per adegan, hal yang
  harus dihindari), pemeran beserta lembar karakter, gerak kamera, transisi, dan arahan gerak video.
- 14 model gambar dan 34 model video Higgsfield, dengan perkiraan kredit dari endpoint `estimate`. Resolusi video
  bisa dipilih per proyek.
- Narasi dibuat dalam satu rekaman utuh (Gemini TTS atau ElevenLabs), lalu dipotong otomatis per adegan.
- Caption akurat dengan Whisper lokal (mode DTW). Klip lama bisa disinkronkan ulang dari tab Caption.
- Panel Musik bisa membuat prompt musik latar untuk Suno atau AI musik lain.

### Editor
- Pratinjau langsung dengan gerak kamera, transisi, caption karaoke, musik latar, dan overlay (logo, watermark,
  teks) yang bisa digeser di pratinjau.
- Timeline seperti editor video:
  - tarik tepi klip untuk mengatur panjangnya (video tidak bisa melebihi panjang aslinya);
  - geser dan potong suara, caption, musik, dan overlay;
  - **Potong** (S atau Ctrl+B) dan **Hapus** (Delete);
  - snap ke playhead dan sambungan;
  - overlay bertumpuk di baris masing-masing.
- Transisi diatur per sambungan dari tombol di antara klip. Panelnya punya pratinjau yang diputar berulang, durasi
  0,2–2 detik, dan tombol terapkan ke semua.
- Gerak kamera bisa diatur untuk klip gambar maupun video. Pratinjaunya diputar tanpa menggeser playhead.
- Caption:
  - 4 gaya dan pilihan tanpa caption;
  - 15 font (4 tegas, 9 kartun/komik, 2 tulisan tangan/elegan) dengan contoh di daftar;
  - ukuran, posisi, warna, dan kotak latar rounded;
  - teksnya bisa diedit langsung dan tersimpan otomatis.
- Suara: volume per klip dan volume narasi. Musik: volume, otomatis mengecil saat narasi, dipotong, dan digeser.

### Ekspor
- MP4 dirender dengan FFmpeg di komputer pengguna. Hasilnya sama dengan pratinjau karena aturan gerak, transisi,
  caption, dan potongan suara dipakai bersama (`src/shared/`).
- Gerak kamera halus memakai filter `perspective`. Caption memakai libass dengan kotak rounded, dan ukurannya
  sama dengan pratinjau.
- Proyek bisa diekspor berulang kali setelah diedit.

### Lainnya
- Kunci API milik pengguna (BYOK), disimpan terenkripsi dengan DPAPI Windows (`safeStorage`).
- Halaman About menampilkan versi aplikasi, tautan ke channel Bang Tutorial, dan video tutorial.
- Salinan siap jalan dengan skrip START untuk Windows dan macOS.
- Dokumentasi pengembang: [AGENTS.md](AGENTS.md) dan folder [docs/](docs/README.md).
- Kode dirilis dengan [lisensi MIT](LICENSE). README dilengkapi badge dan screenshot.
- Installer Windows (`BangStory-Setup-1.0.0.exe`) dengan ikon dari logo Bang Story.

### Batasan yang diketahui
Lihat [docs/masalah-diketahui.md](docs/masalah-diketahui.md). Yang paling terasa:
- gerak kamera di atas video masih bergetar di pratinjau (hasil ekspor halus);
- belum ada undo/redo;
- Whisper dan installer baru tersedia untuk Windows.
