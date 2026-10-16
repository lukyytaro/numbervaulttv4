# Nomor Vault v4

Aplikasi satu halaman (HTML + JavaScript murni, tanpa backend) untuk memuat file TXT berisi nomor, memilahnya per workspace, lalu mengambil nomor dalam batch tanpa duplikat. Data tersimpan di browser pengguna.

## Menjalankan di Acode / HP

1. Ekstrak ZIP.
2. Buka folder `public`, lalu buka `index.html`.
3. Tekan Preview (tombol ▶).
4. Tekan **Pilih File**, pilih satu atau beberapa file `.txt`.

Dashboard admin: buka `admin/index.html` dengan cara yang sama.

Bisa juga dibuka langsung di Chrome desktop (klik dua kali `public/index.html`), atau lewat server statis apa saja.

Hasil build sudah berdiri sendiri: `public/index.html` dan `admin/index.html` masing-masing satu file tanpa dependensi, jadi aman dibuka dari `file://`.

## Alur pakai

1. **Workspace**: upload file TXT. Setiap file menjadi workspace sendiri (riwayat file). Boleh upload banyak file sekaligus, atau seret dan lepas file ke mana saja di halaman (desktop).
2. **Ambil**: pilih sumber, tier, urutan, dan jumlah, lalu tekan **Ambil**. Hasil bisa disalin atau diunduh sebagai TXT.
3. **Riwayat**: setiap batch tersimpan dengan nomornya dan bisa dibuka, disalin, atau diunduh lagi.

Di HP, tiga panel ini dipisah oleh tab bar di bawah layar. Di layar ≥ 900 px ketiganya tampil berdampingan.

### Filter

| Pilihan | Arti |
|---|---|
| Sumber: Business Meta | hanya nomor di bawah judul "Business Meta" |
| Sumber: Semua nomor | semua nomor di file |
| Tier: Semua / Tinggi / Exclusive / Standard / Low / Agent AI | "Tinggi" = Exclusive + Standard + Agent AI |
| Urutan: Acak | acak (Fisher–Yates parsial) |
| Urutan: Urutan file | dari atas file |
| Urutan: Dari bawah | N nomor terakhir, dibaca dari bawah ke atas |

Jumlah yang diminta divalidasi. Nilai kosong, nol, desimal, atau di atas stok ditolak dengan pesan jelas, tidak diubah diam-diam. Stok per tier ditampilkan sebagai chip.

### Format nomor yang dikenali

- Awalan `+` opsional; pemisah spasi, titik, tanda hubung, dan tanda kurung diterima.
- 9 sampai 15 digit. Di luar itu ditolak.
- Teks yang terlihat seperti tanggal ditolak.
- Teks tanpa pemisah yang lebih dari 15 digit dipecah menjadi beberapa nomor bila memungkinkan.
- Duplikat dibuang berdasarkan digitnya saja (`+51 912-345-678` dan `51912345678` dianggap sama).
- Nomor ditampilkan sebagai `+digits`.
- Tier dibaca per baris: Exclusive, Standard, Low, Agent AI. Tier harus berada pada baris yang sama dengan nomor.
- Baris berjudul "Business Meta" menandai nomor berikutnya sebagai Business sampai ada judul lain (sama dengan semantik v3).

### Nama file dan batch

- Nama workspace otomatis dari kode negara mayoritas, misalnya `Peru-numbers.txt`, `Peru-numbers-2.txt`.
- Nama batch: `Peru-batch-001.txt`, `Peru-2-batch-001.txt` (basis nama unik per workspace).
- Bila file berisi banyak negara, nama memakai negara terbanyak dan catatan komposisi ditampilkan di bawah nama.

### Anti-duplikat lintas workspace

Saklar di panel Workspace. Bila aktif, nomor yang sudah diambil di workspace mana pun tidak ditawarkan lagi di workspace lain. Bila dimatikan, tiap workspace berdiri sendiri. Saat workspace dihapus, nomornya yang sudah terambil tersedia lagi.

### Hapus

Hapus workspace selalu meminta konfirmasi lewat dialog (bukan `confirm()` bawaan browser), menampilkan jumlah nomor dan batch yang hilang. Batal, tombol Esc, dan klik latar tidak menghapus.

### Backup dan restore

- **Ekspor backup** menulis satu file JSON berisi semua workspace dan nomornya.
- **Impor backup** menambahkan workspace yang belum ada (berdasarkan id); yang sudah ada dilewati; yang rusak dihitung dan dilaporkan.
- Bila unduhan tidak berfungsi di WebView tertentu, tombol **Salin** pada hasil ekstraksi tetap jalan.

## Dashboard admin

`admin/index.html` membaca penyimpanan yang sama di browser yang sama: jumlah file, nomor, terambil, batch, sebaran tier, per negara, per workspace, batch terbaru, kapasitas penyimpanan, dan catatan data v3 lama. Segarkan otomatis saat tab lain mengubah data.

Keterbatasan penting: aplikasi ini frontend-only. Admin tidak bisa melihat data browser pengguna lain. Statistik lintas pengguna butuh backend dan database.

## Penyimpanan

Urutan: IndexedDB (`nomor-vault`) → localStorage (awalan `nvault:`) → memori. Bila jatuh ke localStorage atau memori, banner di atas halaman memberi tahu (kapasitas localStorage sekitar 5 MB, memori hilang saat halaman ditutup).

- Setiap tulis memakai `rev` (compare-and-set); tab lain yang mengubah workspace yang sama menimbulkan konflik yang ditangani, bukan menimpa diam-diam.
- Tab lain disinkronkan lewat BroadcastChannel.
- Aplikasi meminta `navigator.storage.persist()` sekali per muat agar data tidak dibersihkan otomatis.
- Data corrupt terdeteksi per workspace: kartu error dengan tombol hapus, workspace lain tetap bisa dipakai.

### Migrasi dari v3

Saat pertama dibuka, data v3 (kunci `nomor-vault-v3` di localStorage) dimigrasi otomatis ke format baru: nama, id, riwayat, dan nomor terambil dipertahankan. Data v3 asli tidak dihapus (dibiarkan sebagai cadangan) dan ditandai sudah dimigrasi supaya tidak diproses dua kali.

Catatan: v3 tidak menyimpan isi nomor tiap batch lama, jadi batch lama di riwayat hanya menampilkan jumlah, tanpa nomor.

## Perubahan utama dari v3

- Penyimpanan pindah dari satu blob localStorage (tulis sinkron seluruh DB) ke IndexedDB per workspace.
- Pencarian stok dan penyaringan nomor terambil memakai struktur data cepat (sebelumnya `used.includes`, kuadratik).
- Riwayat batch kini menyimpan nomornya.
- Perilaku tab ganda aman (sebelumnya tab terakhir menimpa).
- Validasi jumlah, pesan error, loading, empty state, toast, dan dialog konfirmasi.
- Tata letak responsif: tab bar di HP, tiga panel di desktop; target sentuh ≥ 44 px; label ARIA.
- Dashboard admin diperluas (v3 hanya 4 angka).

Semua fitur v3 yang berfungsi dipertahankan: upload TXT, workspace per file, riwayat file, nama otomatis per negara dan batch, filter tier, anti-duplikat, salin, dan unduh.

## Batasan yang diketahui

- Pembacaan nomor memakai aturan heuristik. Akhiran seperti ` - 3` tepat setelah nomor bisa ikut tergabung ke nomor. Tier di baris terpisah dari nomornya tidak terbaca.
- Format lokal (tanpa kode negara) dan internasional untuk nomor yang sama tidak disatukan; keduanya dianggap nomor berbeda.
- Ukuran file maksimum 30 MB per file (pesan jelas ditampilkan bila lebih). Pecah file yang lebih besar.
- Jika penyimpanan jatuh ke localStorage, kapasitas kecil (banner tampil).
- Ekstraksi dengan jumlah sangat besar menulis ulang record workspace sekali per ambil; wajar untuk puluhan ribu nomor, makin lambat bila ratusan ribu.
- Data hanya ada di browser tempat file diupload. Membersihkan data situs menghapusnya. Ekspor backup secara berkala.
- Unduhan file tidak selalu bisa di semua WebView; gunakan Salin sebagai cadangan.

## Pengembangan

Kode sumber ada di `src/` (`app.html`, `admin.html`, `store.js`). Folder `public/` dan `admin/` adalah hasil build.

```bash
node dev/build.mjs      # rakit public/index.html dan admin/index.html
npm install             # hanya untuk tes (playwright)
node tests/e2e.mjs      # 177 tes end-to-end (butuh Chromium)
node tests/shots.mjs    # tangkapan layar tiap ukuran viewport
```

`tests/e2e.mjs` membuka hasil build di Chromium lewat Playwright dan memeriksa parser, negara, urutan, validasi jumlah, persistensi, penamaan, hapus, upload dan drag-and-drop, lintas workspace, tab ganda, migrasi v3, backup, fallback penyimpanan (corrupt, `file://`), performa, dashboard admin, tata letak 320 sampai 1440 px, dan aksesibilitas. Jalur Chromium diatur lewat variabel lingkungan `CHROME_PATH` bila bukan lokasi bawaan.
