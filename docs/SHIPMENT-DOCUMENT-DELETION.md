# Penghapusan lampiran pengiriman

Menu operasional bernama **Pengiriman** (English: **Shipments**). Alamat `/bl-register` tetap dipertahankan agar tautan dan sumber navigasi yang sudah ada tetap berlaku.

## Penggunaan

1. Buka **Pengiriman → pilih B/L → Dokumen**.
2. Centang satu atau beberapa berkas yang salah, lalu klik **Hapus lampiran** pada toolbar di atas tabel. **Pilih semua** mencakup seluruh halaman daftar.
3. Periksa nama berkas, isi alasan penghapusan, kemudian konfirmasi. Batal/menutup modal tidak menghapus berkas.

Admin dan Super Admin dapat menghapus lampiran pada pengiriman yang masih dapat diubah. Pengiriman yang diarsipkan perlu dipulihkan terlebih dahulu. Penghapusan menggunakan versi data; jika pengiriman berubah, muat ulang sebelum mencoba lagi.

Pilihan dihapus dalam satu transaksi: bila satu lampiran tidak valid atau versi berubah, seluruh penghapusan dibatalkan. Toolbar juga menyediakan **Lihat** untuk satu dokumen dan **Unduh asli** (atau **Unduh Excel** untuk PL internal Excel). Beberapa dokumen diunduh dalam satu ZIP melalui API privat. **Cetak / Simpan PDF** untuk PL internal buatan sistem memakai snapshot lampiran yang dipilih, termasuk bila sumbernya sudah berubah; pilih **Simpan sebagai PDF** pada dialog cetak browser.

## Dampak

- Pengiriman, kontainer, nominal tagihan, transaksi, dan dokumen lain tetap tersimpan.
- B/L aktif yang dihapus mengosongkan penunjuk dokumen aktif dan mereset pemeriksaan/release dokumen. Versi lama tidak otomatis menjadi B/L aktif. Daftar, filter berkas belum tersedia, dashboard dan ekspor mengikuti kondisi aktif ini.
- Menghapus versi B/L lama tidak mereset pemeriksaan versi aktif yang masih tersedia.
- Menghapus sumber Packing List mempertahankan rincian barang sebagai draf, melepas referensi sumber yang dihapus, dan menandai Kepala Packing List untuk diperiksa/dibuat ulang. Kepala gabungan yang masih aktif pada pengiriman lain juga ditandai bila sumbernya ikut terdampak.
- Menghapus bukti release yang digunakan mereset status release dokumen. Hasil fisik bongkar dan progres kontainer tidak dihapus.
- Lampiran bersama hanya dilepas dari pengiriman yang dipilih. Berkas fisik tetap tersimpan selama masih dirujuk pengiriman atau dokumen sumber lain. Referensi terakhir yang dihapus memicu penghapusan fisik.
- Dokumen Packing List lama yang berasal dari tautan sumber dilepas dari pengiriman ini; sumber asli tetap berada pada pemilik dokumennya.
- Riwayat menyimpan pelaku, waktu, nama/kategori lampiran, alasan, dan hasil pemeriksaan yang direset; isi berkas tidak disalin ke riwayat.

## Penyimpanan dan migrasi

Migrasi `20261027010000_document_file_purge` menambahkan antrean pembersihan berkas. Permintaan pembersihan disimpan dalam transaksi yang sama dengan penghapusan referensi. Setelah commit, berkas tanpa referensi dihapus dari `backend/uploads/job-documents`. Jika penyimpanan sedang gagal/terkunci, status pembersihan tetap tercatat dan dicoba lagi saat startup dan tiap menit. Pembersih selalu memeriksa referensi `SeaBillFile` dan `JobDocument` sebelum menghapus berkas.

`scripts/start-demo.ps1 -SkipSeed` menjalankan migrasi tanpa menambahkan ulang seed. Untuk lingkungan lain, jalankan `prisma generate` dan `prisma migrate deploy` sebelum menjalankan backend versi ini.

## Verifikasi

`node scripts/test-document-toolbar.mjs` memeriksa pilihan lintas halaman, isi ZIP privat, snapshot cetak historis, penolakan versi lama, pembatalan dan penghapusan pilihan, serta toolbar desktop Indonesia dan ponsel Inggris. `node scripts/test-packing-workflow-browser.mjs` mencakup PDF tanpa unduhan Excel wajib, pengunduhan ulang Excel, sumber PL/BA, serta draf B/L.

`npm.cmd test` pada backend mencakup validasi hak akses, alasan/versi, perlindungan arsip, versi B/L lama, sumber Packing List, dokumen bersama dan percobaan ulang pembersihan. `node scripts/test-shipment-file-delete.mjs` menguji API, penghapusan fisik, filter/ekspor, audit, serta modal desktop/tablet Indonesia/Inggris menggunakan data sintetis yang dibersihkan setelah pengujian.
