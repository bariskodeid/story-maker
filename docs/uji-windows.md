# Daftar periksa uji Windows

Daftar singkat untuk menguji Story Maker di Windows sebelum rilis. Fitur-fitur ini sudah diuji di Linux, tetapi
installer, Whisper, DPAPI, dan mesin render Remotion versi Windows hanya bisa diuji di Windows. Centang tiap butir;
kalau ada yang gagal, catat langkahnya, pesan error di layar, dan versi Windows, lalu ambil screenshot.

**Sebelum mulai:** cadangkan dulu `%APPDATA%\Bang Story` dan `%APPDATA%\Story Maker` (kalau ada), karena uji
nomor 2 memindahkan data lama.

## 1. Build dan installer

- [ ] `git pull`, `npm install`, lalu `npm run typecheck`: bersih.
- [ ] `npm install` memasang `node_modules\@remotion\compositor-win32-x64-msvc`.
- [ ] `npm run dist` menghasilkan `dist\StoryMaker-Setup-1.1.0.exe`.
- [ ] Jalankan installer. SmartScreen akan memperingatkan karena installer belum ditandatangani; pilih
      **More info › Run anyway**.
- [ ] Pasang di folder yang namanya mengandung spasi (bawaannya `C:\Program Files\Story Maker` sudah begitu).
- [ ] Aplikasi terbuka dengan judul **Story Maker** dan ikon yang benar di taskbar dan Start Menu.
- [ ] Properti file `Story Maker.exe` (klik kanan › Properties › Details) mencantumkan versi 1.1.0 dan
      Copyright © 2026 bariskodeid.

## 2. Data dan kunci

- [ ] Kalau sebelumnya ada Bang Story: proyek lama muncul di Beranda, dan folder `%APPDATA%\Bang Story` sudah
      pindah ke `%APPDATA%\Story Maker`.
- [ ] Bang Story versi lama masih terpasang sebagai aplikasi terpisah (ID aplikasinya berbeda); hapus lewat
      Settings › Apps kalau sudah tidak dipakai.
- [ ] Simpan koneksi 9Router (alamat + kunci) di Pengaturan: statusnya **Terhubung**.
- [ ] Tutup lalu buka lagi aplikasinya: kunci masih terbaca (status tidak berubah jadi "tidak bisa dibuka lagi").

## 3. Cerita

- [ ] Pengaturan › Umum › Whisper: unduh model (sekitar 488 MB), lalu progres selesai dan model terpasang.
- [ ] Beranda › **Sekali klik** untuk cerita 30 detik: naskah, gambar, narasi, dan editor terbuka sendiri.
- [ ] Caption di editor pas dengan suaranya (disamakan oleh Whisper, bukan waktu perkiraan).
- [ ] Ekspor MP4 1080p: file terbuka di pemutar bawaan Windows, suara dan gambar sinkron, caption tertanam.
- [ ] Sekali klik dengan **Ekspor MP4 otomatis** menyala: MP4 muncul di folder ekspor bawaan
      (`Videos\Story Maker`).

## 4. Seri

- [ ] Beranda › Seri, 2 episode bersambung, **Sekali klik semua** dengan ekspor otomatis: file `E01-….mp4` dan
      `E02-….mp4` ada di subfolder seri.
- [ ] Lembar karakter dibuat sekali di episode 1, lalu dipakai ulang di episode 2 (tidak dibuat ulang).

## 5. Video penjelasan (Remotion)

Langkah lengkapnya ada di [remotion.md](remotion.md#daftar-periksa-windows). Ringkasnya:

- [ ] Pengaturan › Umum › Mesin render: **Unduh**, lalu **Batalkan** di tengah jalan. Folder `render-browser`
      bersih, dan tidak ada proses `Story Maker.exe` tambahan di Task Manager.
- [ ] Unduh lagi sampai selesai (Chrome masuk ke `%APPDATA%`, tidak ada yang ditulis ke folder instalasi), lalu
      **Uji render** berhasil. Izinkan kalau Defender bertanya soal `chrome-headless-shell.exe` atau `remotion.exe`.
- [ ] Video penjelasan template Tips 9:16 lewat Sekali klik, lalu ekspor: emoji tampil berwarna dan caption tidak
      menutupi isi.
- [ ] Tutorial: unggah screenshot sendiri dan tarik kotak sorotan, lalu pastikan tampil sama di pratinjau dan di MP4.
- [ ] Batalkan satu ekspor di tengah jalan: job berstatus dibatalkan, tidak ada file setengah jadi, dan tidak ada
      proses `chrome-headless-shell.exe` atau `remotion.exe` yang tertinggal.

## 6. Ketahanan

- [ ] Tutup aplikasi saat Sekali klik sedang membuat gambar, lalu buka lagi: proyek terbuka normal, job yang
      terputus ditandai gagal, dan **Lanjutkan otomatis** meneruskan dari langkah terakhir.
- [ ] Tutup aplikasi saat mesin render sedang diunduh: tidak ada proses yang tertinggal, dan unduhan berikutnya
      mulai dari awal dengan bersih.

## Opsional

- [ ] Video AI Higgsfield dari gambar 9Router (butuh kunci Higgsfield).
- [ ] Ekspor 4K video penjelasan.
- [ ] Kunci lisensi Remotion asli (hanya untuk perusahaan dengan lebih dari 3 orang): ekspor tetap berjalan.
