# Keputusan teknis

Catatan kenapa sesuatu dibuat begitu. Sebagian besar lahir dari bug nyata, jadi baca dulu sebelum mengubah
bagian terkait. Tambahkan entri baru di akhir setiap kali membuat keputusan penting.

### Narasi direkam satu kali utuh, lalu dipotong per adegan
TTS yang dipanggil per klip menghasilkan suara dan intonasi yang berbeda-beda. Satu rekaman utuh lalu dipotong
membuat suaranya konsisten. Jangan menambah tombol "buat suara" per klip.

### Whisper tanpa `--prompt`, dengan DTW
Naskah yang dikirim sebagai prompt membuat Whisper berhalusinasi: dalam uji coba, Whisper mengulang "tidak tidak
tidak..." puluhan kali. Caption klip 1 selesai 2 detik lebih cepat dari suaranya, dan kata-kata awal klip lain
tertumpuk di detik 0. Waktu per kata bawaan whisper.cpp juga kurang presisi. Dari tiga cara yang diuji,
`-nfa -dtw small` tanpa prompt paling akurat: caption hanya meleset sekitar 0,1–0,2 detik dari suara (diuji pada
proyek nyata). Ejaan caption tetap dari naskah (`align.ts`); dari Whisper hanya diambil waktunya.

### Potongan adegan mengikuti kata
Dengan Whisper, adegan dipotong di jeda antara kata terakhir satu adegan dan kata pertama adegan berikutnya
(`cutsFromWords`), jadi potongan tidak pernah jatuh di tengah kata. Tanpa waktu kata, `chooseCuts` memilih dari
jeda yang dideteksi FFmpeg. Gemini diberi `<long pause>` di antara adegan supaya jedanya jelas. ElevenLabs
memakai waktu kata dari API-nya sendiri.

### Sorotan caption bertahan di jeda antar kata
Di jeda antar kata, sorotan tetap di kata terakhir yang sudah diucapkan (`captionAt`), sama seperti ekspor.
Dulu sorotan lompat ke kata terakhir baris lalu balik lagi, sehingga terlihat berkedip.

### Segmen ekspor dibulatkan ke frame + 2 frame cadangan
`xfade` menghentikan seluruh video kalau klip pertama habis sebelum offset transisi. Dengan transisi `cut`
(1 frame) dan durasi klip yang tidak pas di frame, gambar video pernah berhenti setelah klip 1 sementara audio
tetap jalan. `planSegments` membulatkan awal klip ke frame utuh dan menambah 2 frame cadangan.

### Gerak kamera di ekspor memakai filter `perspective`, bukan `zoompan`
`zoompan` membulatkan potongan gambar ke piksel bulat setiap frame, sehingga gerak lambat bergoyang 0,6–0,7 px
per frame (terlihat bergetar, terutama garis tipis). `perspective` (sense=source, cubic) bergerak pecahan piksel:
getarannya 0,02–0,16 px dengan kecepatan hampir sama. Gambar diproses di resolusi aslinya (1×–2× output) lalu
diperkecil, supaya tetap tajam. Catatan: penghitung frame `perspective` mulai dari 1, jadi rumusnya memakai `(on-1)`.

### Kotak caption rounded digambar sendiri
libass hanya bisa membuat kotak bersudut siku. Kotak rounded digambar sebagai drawing ASS di layer bawah teks.
Lebarnya dihitung dari metrik file font (`fontMetrics.ts`), dan baris dipecah dengan fungsi yang sama dengan
pratinjau (`layoutCaptionLines`).

### Ukuran caption memakai metrik `cell` per font
libass mengukur ukuran font dengan winAscent+winDescent, CSS dengan em. Tanpa konversi, caption di ekspor hanya
sekitar 57% ukuran pratinjau. Setiap font di `CAPTION_FONTS` punya nilai `cell` hasil pengukuran file TTF-nya.

### Pratinjau menjaga tiga klip tetap terpasang
Membuat elemen `<video>` baru setiap pindah klip sempat menampilkan frame pertama video (atau poster) sebelum
seek. Akibatnya ada kilasan di sambungan potongan dan di transisi. Klip sebelum/sekarang/sesudah selalu
terpasang dalam urutan timeline. Klip berikutnya menunggu di titik mulainya, dan langsung diputar tanpa seek
ulang (seek ulang menahan video sekitar 150 ms).

### Video overlay hardware dimatikan
Di Windows, Chromium menyerahkan video ke overlay hardware (DirectComposition) yang membulatkan posisi dan
ukuran ke piksel bulat. Gerak kamera di atas video jadi gemetar di pratinjau, padahal gambar halus.
Switch `disable-direct-composition-video-overlays` dan opasitas 0,999 untuk video yang bergerak menahan video
di jalur render biasa. (Pemilik aplikasi masih melihat getaran di pratinjau; lihat masalah-diketahui.md.)

### Suara milik klipnya ("klip tertaut")
Seperti suara bawaan klip video di editor lain: suara bisa dipotong dan digeser di dalam klip, dan terpotong di
akhir klip. Ini menjaga sinkron naskah per adegan dan rekam ulang narasi tetap sederhana.

### Potong klip ikut membelah suara dan naskah
Saat klip dibelah, file suara dipotong di jeda antar kata terdekat, dan teks narasinya dibagi
(`splitNarration`). Dengan begitu tiap bagian punya aset dan naskah yang cocok (tidak dianggap basi), dan bisa
direkam ulang sendiri. Bagian pertama diberi transisi `cut` agar sambungannya mulus.

### Panel Transisi, bukan popup
Popup di timeline menutupi pratinjau, padahal pengguna ingin melihat contoh transisinya. Tombol sambungan
membuka panel di kanan, lalu pratinjau memutar sambungan itu berulang-ulang (audition).

### Prompt visual berlabel dan baris Wardrobe
Model gambar tidak membaca naskah. Prompt yang kurang spesifik menghasilkan latar Bumi dan alien untuk cerita di
Mars, dan baju astronot di semua adegan. Setiap prompt kini menyebut dunia/era dengan jelas, orang disebut
"human", dan baju per adegan ditulis di baris `Wardrobe` (bawaan lembar karakter atau custom).

### Prompt video selalu melarang musik
Beberapa model video (Veo, Grok, MiniMax) membuat musik sendiri tanpa saklar. Setiap prompt diakhiri `NO_MUSIC`,
dan audio dimatikan lewat parameter kalau modelnya punya. Audio dari file video tidak pernah dipakai di ekspor.

### Kunci API dienkripsi safeStorage, kunci kripto dibuat saat startup
Kunci kriptografi `safeStorage` baru tertulis ke `Local State` sekitar 10 detik setelah dibuat. Membuatnya saat
startup (`warmUpEncryption`) mencegah kunci API tidak terbaca setelah aplikasi ditutup paksa.

### Sekali klik dijalankan dari renderer, bukan proses utama
Renderer menyimpan proyek sebagai snapshot utuh (`saveSnapshot` menghapus klip dan pemeran yang tidak ada di
snapshot). Kalau proses utama menulis naskah atau pemeran baru sendiri, snapshot lama dari renderer bisa
menghapusnya lagi, dan tidak ada event "proyek berubah" untuk memuat ulang. Karena itu `autopilot.ts` memanggil IPC
yang sama dengan tombol langkah dan me-`load()` setiap bundle ke store kalau proyeknya terbuka, persis seperti alur
manual. Selama berjalan, isi langkah diganti panel progres supaya tidak ada suntingan yang bertabrakan.

### Episode seri adalah proyek biasa, dan pemerannya disalin
Ekspor (`exporter.ts` memakai `bundle.project.id`), pratinjau (`getBundle` hanya memuat aset proyek itu), dan store
renderer (`addAsset` membuang aset proyek lain) semuanya mencari file di folder proyek pemiliknya. Supaya tidak ada
yang perlu diubah di jalur itu, episode dibuat sebagai proyek biasa, dan lembar karakter seri **disalin** (baris dan
file) ke setiap episode (`syncCastIn`), lalu lembar baru dari episode disalin balik ke folder seri (`syncCastOut`).
Lembar seri yang sudah ada tidak pernah ditimpa, jadi semua episode memakai referensi wajah yang sama dan
`generateMissingImages` tidak menggambar lembar baru. Seperti Sekali klik, penyalinan masuk dilakukan sebelum
renderer memuat proyeknya, dan bundle hasilnya di-`load()` kalau proyek itu terbuka, supaya snapshot lama tidak
menghapus pemeran yang baru disalin.

### Episode seri dibuat berurutan, tidak paralel
Naskah episode bersambung ditulis dari ringkasan episode sebelumnya (`episode_summary`), lembar karakter yang dibuat
episode pertama dipakai ulang oleh episode berikutnya, dan penyedia gambar/suara (terutama 9Router dengan akun
langganan) cepat kena batas pemakaian. Karena itu `seriesAutopilot.ts` menjalankan satu episode sampai selesai
sebelum mulai episode berikutnya, dan berhenti di episode pertama yang gagal.

### Narasi 9Router: satu rekaman per bagian 1.000 karakter, tanpa waktu kata
9Router meneruskan ke banyak mesin suara (Edge TTS, OpenAI, Gemini, ElevenLabs), dan endpoint-nya tidak mengirim
waktu per kata. Narasinya ikut jalur Gemini (`untimedTake`): satu rekaman per bagian, lalu dipotong dengan Whisper
atau `chooseCuts`. Bagiannya dibatasi 1.000 karakter karena Edge TTS (lewat Bing) dan OpenAI TTS menolak teks
panjang. Setiap adegan diakhiri tanda titik supaya ada jeda di batas adegan. Teks untuk suara `edge-tts/` di-escape
(`&`, `<`, `>`) karena 9Router memasukkannya ke SSML tanpa escape. Semua permintaan memakai `User-Agent` sendiri:
9Router yang dipasang di balik Cloudflare menantang user agent bawaan fetch (`node`) dengan halaman 403.

### Video penjelasan dirender dengan Remotion, bukan FFmpeg
Adegan penjelasan berisi tipografi beranimasi, kode yang diketik, kotak sorotan, dan angka yang menghitung naik.
Membuatnya dengan filter FFmpeg/ASS berarti menulis ulang tata letak di dua tempat. Dengan Remotion, satu komponen
React (`src/remotion/explainer`) dipakai Player di aplikasi dan render MP4, dengan props dari `buildExplainerInput`
yang sama, jadi pratinjau dan ekspor identik (diuji dengan membandingkan screenshot Player dan frame MP4 yang sama).
Proyek cerita tetap memakai exporter FFmpeg. Lisensi Remotion: lihat [remotion.md](remotion.md#lisensi-remotion).

### Chrome Headless Shell diunduh ke folder data, dari working directory sementara
Remotion memilih folder unduhan browser dari `process.cwd()`. Aplikasi terpasang bisa berjalan dengan working
directory `C:\Program Files\...` (tidak bisa ditulis), dan kalau ada `package.json` di folder induk, browser bisa
terunduh ke tempat yang tidak terduga. `ensureRenderBrowser` menjalankan `ensureBrowser` dari
`<folder data>/render-browser` (berisi `package.json` kecil) lalu memberi `browserExecutable` ke setiap render.

### Bundle Remotion tanpa source map
Kalau `bundle.js` menyebut `bundle.js.map`, `@remotion/renderer` membaca file itu secara sinkron sebelum render.
Saat `.map` tidak ikut terpasang, render gagal dengan `ENOENT`. Bundle dibuat dengan `devtool: false`.

### Komposisi membawa reset CSS sendiri
Preflight Tailwind milik aplikasi ikut berlaku di dalam Remotion Player, tapi tidak di browser render. Tanpa reset
`.sm-x` (box-sizing, margin, line-height, gambar block), ukuran kotak dan jarak baris di pratinjau berbeda dari MP4.

### Player tanpa shared audio tags
`@remotion/player` menyiapkan elemen audio dengan `data:audio/mp3`, yang diblokir CSP (`media-src`). Electron tidak
butuh gestur pengguna untuk memutar media, jadi Player memakai `numberOfSharedAudioTags={0}` dan CSP tidak dilonggarkan.

### Server aset sementara untuk render
Browser render tidak mengenal `studio://`. Membuka akses `file://` ke seluruh disk lebih berisiko, jadi setiap
render mendapat server HTTP di `127.0.0.1` dengan port dan prefix acak yang hanya menyajikan folder proyek dan
font, lalu ditutup.

### Pemeran yang dihapus dari episode dicatat, bukan disalin ulang
Dulu `syncCastIn` menambahkan setiap pemeran seri yang tidak ada di episode, juga setiap kali halaman episode dibuka.
Pemeran yang sengaja dihapus pengguna dari satu episode jadi muncul lagi diam-diam. Sekarang membuka episode hanya
menyalin lembar karakter untuk pemeran yang sudah ada; pemeran seri ditambahkan saat episode dibuat dan sebelum
Sekali klik menulis naskah atau rencana visualnya (saat itulah pemeran memengaruhi hasil). Supaya penambahan itu juga
tidak membatalkan hapusan, `saveSnapshot` mencatat nama yang hilang dari episode di `projects.cast_removed_json`.
Catatan dibuat di proses utama, di satu tempat yang dilewati semua perubahan pemeran dari renderer, dan nama yang
kembali ada di episode dihapus dari catatan, jadi snapshot lama yang sempat menghapus pemeran lalu dimuat ulang tidak
meninggalkan catatan yang salah. Arah sebaliknya sama: pemeran yang dihapus atau diganti namanya di halaman seri
dicatat di `series.cast_removed_json` supaya `syncCastOut` tidak mengembalikannya dari episode lama. Pengembalian
yang disengaja lewat tombol **Ambil pemeran seri**.

### Pengaturan seri hanya diterapkan ke episode tanpa klip
Gambar, lembar karakter, dan suara episode yang sudah dibuat bergantung pada gaya, model, suara, format, dan bahasa
saat itu. Mengubahnya di episode tersebut membuat episode setengah lama setengah baru (misalnya narasi baru dengan
suara lain sementara gambar tetap). Karena itu `updateSeriesSettings` hanya menulis ke episode yang belum punya klip,
dan hanya kolom yang diubah, lalu UI menyebut berapa episode yang tidak ikut berubah.

### `hook` episode ditulis eksplisit sebagai penggoda episode itu sendiri
Saat diuji, model menulis `hook` tiap episode sebagai *cliffhanger* di akhir episode itu (penggoda episode
sesudahnya). Karena akhir episode N dibuat dari `hook` episode N+1, pelajaran 1 jadi menggoda isi yang baru ada di
pelajaran 3. Deskripsi skema (`OUTLINE_PROPS`, `EXPLAINER_OUTLINE_PROPS`) sekarang menyebut bahwa `hook` membahas
episode itu sendiri dan tidak boleh menggoda episode sesudahnya; setelah perubahan ini hook kembali sesuai.
