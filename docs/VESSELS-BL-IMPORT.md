# Kapal, pembacaan B/L lokal, dan rekap PL internal

Gunakan Node.js 22.13+ dalam seri 22, atau Node.js 24+. Setelah menarik perubahan, jalankan `npm ci` di backend dan frontend, `npx prisma generate`, serta `npx prisma migrate deploy` dengan database tujuan yang benar. Untuk demo lokal yang sudah tersedia: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -SkipSeed`. Jangan menjalankan ulang seed lama pada database operasional.

## Kapal dan voyage

Menu **Kapal** menyimpan nama, pelayaran, IMO opsional, alias, dan status aktif. Setiap voyage memiliki nomor dan periode wajib (YYYY atau YYYY-MM). Nomor yang sama boleh dipakai pada tahun berbeda. Nama atau alias yang sudah diklaim kapal lain ditolak. Master dapat dinonaktifkan; dokumen historis tetap disimpan.

Migrasi menautkan nama kapal yang sudah ada tanpa mengubah teks dokumen. Voyage lama sengaja tidak diberi tahun dari waktu pembuatan register. Admin membuat periode yang benar lalu menautkannya melalui **Ubah data** pada B/L. Tautan kapal/voyage pada dashboard membuka daftar B/L sesuai referensi tersebut.

## Unggah dahulu, periksa, lalu simpan

1. Buka **Pengiriman → Tambah pengiriman** (atau **Ubah data** pada pengiriman).
2. Klik **Unggah dan baca B/L**. Format PDF/JPEG/PNG, maksimal 5 MB. PDF teks maksimal 10 halaman; PDF hasil pindai maksimal 3 halaman.
3. Server memakai PDF.js untuk teks PDF dan Tesseract dengan model bahasa yang dibundel untuk gambar/pindai. Tidak ada panggilan API dokumen ke cloud maupun Ollama. Satu pembacaan berjalan pada satu waktu, batas 90 detik, gambar dibatasi ukuran dan dirasterisasi dalam worker terpisah.
4. Cocokkan isian dengan pratinjau asli. Admin dapat memperbaiki nilai dan memilih kolom yang diterapkan. Penggantian daftar kontainer disebutkan secara eksplisit. Nama kapal dicocokkan persis berdasarkan alias; beberapa periode voyage memerlukan pilihan admin.
5. Pilih draft/final dan konfirmasi. **Terapkan isian** baru menyalin ke form. **Simpan pengiriman** menyimpan transaksi dan lampiran asli dalam satu transaksi database. Percobaan ulang sesi yang sudah dipakai ditolak.

Pembaca SPIL telah diperiksa dengan dua PDF digital referensi. Format lain dibaca sebatas kolom yang dikenali dan tetap memerlukan pemeriksaan. Nomor B/L/kontainer/segel dipertahankan sebagai teks. Tanggal penerbitan dan muat tidak disalin sebagai tanggal berangkat/tiba. Jumlah kontainer bukan jumlah koli. Isian tidak terbaca dibiarkan kosong. PDF terkunci harus dibuka terlebih dahulu oleh pemiliknya atau diisi manual. Pembacaan bukan verifikasi B/L, persetujuan direktur, ataupun release barang.

Sesi unggahan hanya dapat diakses pemiliknya. Sesi sementara berakhir setelah 24 jam; pembatalan dan worker pembersih menghapus file yang tidak lagi direferensikan. Original yang disimpan menjadi lampiran privat pada B/L. Catatan audit menyimpan hash dan identitas parser; dokumen perusahaan tidak disertakan dalam Git.

## Packing List internal SCMU

Tombol **Kelola Packing List** tersedia pada tab **Dokumen** dan **Packing List**. Satu modal memandu **Sumber → Periksa data → Bentuk cetak → Pratinjau → Selesai**. Pilih salah satu dasar pembuatan:

- **Packing List mitra**: gunakan rincian hasil impor/transkripsi yang telah dikonfirmasi. Sistem menyalin rincian ke format SCMU, mencatat referensi file sumber, dan mempertahankan dokumen mitra.
- **Berita Acara**: unggah berkas dengan nomor dan tanggal, pilih sumber, catat petugas, kontainer, penerima/mark dan rincian aktual. Simpan draf bila belum lengkap. Koli yang belum diketahui tidak otomatis menjadi nol.
- **Belum ada rincian — draf dari B/L**: cetak identitas kontainer yang sudah tercatat sebagai lembar awal. Tidak menciptakan daftar barang dan tidak mengubah status PL internal menjadi siap.

Lampiran pengiriman menerima semua format, maksimal 5 MB per file. Berkas disimpan privat dengan nama penyimpanan acak; format tanpa pratinjau tetap bisa diunduh. File PL/BA cukup diunggah sekali dan tersedia dari kedua tab. Excel XLSX yang didukung bisa dibaca melalui **Baca rincian dari sumber** di tahap Sumber. Format lain diperiksa dan dicatat manual melalui alur yang sama. Kebebasan format lampiran tidak mengubah batas format pembaca otomatis B/L atau XLSX.

Setiap kelompok sumber dapat memakai **Ada rincian barang** atau **Ringkasan saja**. Ringkasan menyimpan penerima/mark, uraian muatan, jumlah opsional dan satuan tanpa membuat barang fiktif. Satuan berbeda seperti sak dan dus tidak dijumlahkan menjadi satu angka. Instruksi lapangan (misalnya ambil sendiri atau tahan sampai konfirmasi) tersimpan bersama penerima dan tampil pada cetakan; tidak otomatis ditandai selesai.

Rincian berita acara tersimpan terpisah dari transkripsi PL pengirim dan jumlah pada B/L. Koli menurut dokumen, koli aktual, serta kerusakan mempunyai kolom sendiri. Selisih dicatat; jumlah asal tidak ditimpa.

Pilih **Ringkasan kontainer**, **Lembar pemeriksaan barang**, atau **Ringkasan dan lembar pemeriksaan**. Ringkasan memuat kontainer/segel, penerima, uraian dan instruksi. Lembar pemeriksaan memuat jumlah dokumen, aktual, rusak, selisih, tanda diperiksa, catatan, petugas dan waktu. Identitas B/L/kontainer/segel diulang pada kepala tabel cetak. Hasil Excel menyertakan referensi sumber. **Cetak / Simpan PDF** tersedia setelah penyimpanan.

**Catat hasil lapangan** tersedia setelah penyimpanan atau dari tahap Sumber untuk data terkonfirmasi. Muat lembar terbaru, isi jumlah aktual dan rusak, tanda periksa, petugas serta waktu; jelaskan selisih/kerusakan. Isian kosong tetap kosong, berbeda dari nol. Jumlah rusak merupakan bagian dari jumlah aktual. Hasil lapangan disimpan terpisah dari B/L, PL mitra, dan data berita acara. Hasil lama tetap di riwayat; perubahan sumber/identitas B/L menuntut pemeriksaan ulang. Perubahan status operasional biasa tidak membuat sumber kedaluwarsa.

Setelah **Simpan dan unduh Excel**, hasil terlampir sebagai **Packing List internal**. Kartu dokumen, ringkasan B/L, dashboard, dan daftar Packing List menggunakan status hasil yang sama. Kepala PL tambahan tidak diwajibkan untuk menyelesaikan alur utama.

Kepala PL dapat menggunakan rincian dari PL internal yang masih sesuai sumber. Bila rincian sumber berubah atau dihapus, file lama tetap tersimpan sebagai riwayat dan PL internal harus dibuat ulang. Penghapusan BA mempertahankan rincian aktual sebagai draf; tidak menghapus data pengirim. Pembuatan dokumen ini tidak otomatis memverifikasi B/L, memberikan izin release, membuat tagihan atau menyetujui biaya.

Uji tambahan: `node scripts/test-packing-workflow-live.cjs` dan `node scripts/test-packing-workflow-browser.mjs`, menggunakan data sintetis pada database demo lokal dan membersihkan data ujinya sendiri. Uji layanan dokumen: `npm run test:documents` di backend. Uji cetak: `node --test src/pages/BL/internalPackingPrint.test.mjs` di frontend.

## Rekap PL internal

Ekspor gabungan lama **Kepala Packing List** dan **Rekap PL internal** tetap tersedia di bagian opsional pada daftar Packing List serta halaman kapal/voyage. Alur utama per pengiriman menggunakan **Kelola Packing List**. Rekap rinci gabungan mensyaratkan data rinci; sumber yang hanya memiliki ringkasan menggunakan Ringkasan kontainer pada alur utama.

Impor Excel mitra menggunakan kolom Bilba yang telah didukung; untuk PDF/foto PL dengan tabel berbeda, admin tetap mengisi transkripsi sesuai dokumen sumber. Setelah kelompok penerima, kontainer/segel, koli, satuan dan sumber diperiksa, simpan transkripsi berstatus **CONFIRMED**. Rekap otomatis menghitung rincian tersebut, bukan menerka isi file dengan tata letak yang tidak dikenali.

Rekap memuat B/L, kontainer/segel, penerima/mark, alamat/telepon bila tersedia, jumlah koli, CBM terkonfirmasi, catatan, subtotal kontainer, total, dan jejak file/sheet/baris sumber. CBM yang belum diketahui tetap kosong, bukan nol. Beberapa B/L hanya dapat digabung bila tertaut ke master kapal dan periode voyage yang sama.

Konfirmasi pratinjau untuk menyimpan dan mengunduh Excel. Excel mencakup sheet ringkasan dan rincian sumber; **Cetak / Simpan PDF** memakai fasilitas cetak browser. Perubahan sumber menandai rekap untuk dibuat ulang; file lama tetap merupakan riwayat, bukan hasil terkini.

Validasi: `npm test` dan `npm run test:documents` di backend; `npm test` dan `npm run build` di frontend. Uji integrasi demo: `node scripts/test-vessels-import-live.cjs` (menggunakan referensi PDF lokal dan membersihkan data uji miliknya).
