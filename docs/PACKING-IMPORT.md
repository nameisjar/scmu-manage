# Impor Packing List mitra dan Kepala Packing List SCMU

`KANTOR C.xlsx` adalah referensi keluaran internal SCMU. Berkas Excel dari mitra menjadi sumber transkripsi dan tetap disimpan terpisah dari dokumen internal yang dihasilkan.

## Keluaran Packing List internal

Pada **Kelola Packing List**, setelah memeriksa sumber dan pratinjau, tersedia dua pilihan langsung: **Cetak / Simpan PDF** dan **Simpan dan unduh Excel**. PDF membuka dialog cetak browser; pilih **Simpan sebagai PDF**. Memilih PDF tidak mengunduh Excel otomatis. Setelah tersimpan, kedua format tetap tersedia dengan isi yang sama, tanpa membuat lampiran ganda untuk pengunduhan ulang. Draf B/L tetap diberi tanda draf dan tidak mengubah kelengkapan PL internal menjadi siap. Bila hasil pemeriksaan lapangan diperbarui, konfirmasi pratinjau terbaru sebelum membuat keluaran baru.

Bagian berikut menjelaskan pembaca Excel dan opsi penggabungan sumber. Alur utama kini dimulai dari tombol **Kelola Packing List** pada B/L.

## Penggunaan

1. Buat/buka B/L pada Pengiriman. Catat kontainer dan segel sesuai B/L pada tab Kontainer.
2. Buka tab Packing List, unggah Excel mitra `.xlsx` (maksimal 5 MB). Unggahan disimpan sebagai Packing List mitra; pratinjau belum mengubah transkripsi.
3. Periksa judul kapal/voyage sumber, kontainer, segel, mark, item dan total koli. Pilih semua kelompok yang diperlukan pada B/L tersebut dalam satu impor. Kelompok dengan kontainer di luar B/L tidak dapat diimpor; tambahkan kontainer yang benar terlebih dahulu atau gunakan B/L yang sesuai.
4. Pastikan satuan kolom M3/TN sebelum memilih CBM. Bila belum jelas, simpan sebagai nilai sumber. Tanggal tanpa tahun tetap menjadi teks sumber. Rumus dibaca hanya dari nilai cache, tanpa menjalankan rumus atau menebak nilai yang kosong.
5. Konfirmasi impor. Hasil masuk sebagai **draf**. Perbaiki nama, alamat, telepon, tanggal dan rincian pada transkripsi, lalu simpan dan konfirmasi manual setelah pemeriksaan. Rekonsiliasi menandai selisih kontainer, segel, ukuran, koli dan volume.
6. Klik **Buat Kepala Packing List** pada B/L. Untuk menggabungkan beberapa B/L, pilih barisnya pada menu Packing List. Pilihan maksimal 40 B/L harus memiliki kapal dan voyage yang sama; kontainer yang sama pada beberapa B/L ditolak agar tidak dihitung ganda.
7. Periksa pratinjau, akui catatan bila ada data belum lengkap, lalu **Simpan dan unduh Excel**. Dokumen terhubung ke seluruh B/L terpilih. Setelah tersimpan, gunakan **Cetak / Simpan PDF** melalui dialog cetak browser.

Keluaran mempunyai blok pengirim, penerima, B/L, tanggal, tenggat storage/demurrage, serta kontainer/segel/ringkasan barang. Hitungan ukuran kontainer berasal dari data kontainer, bukan angka total manual buku register. Sheet `Rincian PL` mempertahankan rincian item, tanggal sumber, nilai M3/TN, ID berkas, worksheet dan baris sumber. Snapshot pembuatan tercatat di riwayat setiap B/L. Revisi transkripsi, tenggat atau identitas B/L menandai kepala perlu dibuat ulang; dokumen lama tetap tersedia sebagai riwayat.

## Cakupan pembaca awal

Pembaca mendukung contoh Bilba dengan penanda `SPNU ... / SEAL ...`, blok `MERK:`, dan kolom `TGL`, `TOKO`, `COLY`, `NAMA BARANG`, `UKURAN`, `M3/TN`. Pemisah titik/spasi/tanda hubung nomor kontainer dinormalisasi untuk pencocokan. Subtotal/total dan header halaman berulang tidak dijadikan item. Template lain yang tidak dikenali perlu transkripsi manual; ini belum OCR atau pembaca semua format PDF/Excel.

Workbook XLSX valid dengan format yang belum dikenali tetap disimpan sebagai sumber dan ditandai untuk transkripsi manual. File rusak, terenkripsi, mengandung macro/tautan workbook eksternal, atau melampaui batas ekspansi ditolak.

PDF B/L tetap merupakan dokumen sumber yang diunggah. Impor ini tidak mengubah metadata atau persetujuan B/L secara diam-diam, tidak memberikan release barang, dan tidak membuat tagihan/pajak. Berkas diproses di server SCMU tanpa layanan AI/cloud tambahan. File disimpan di `backend/uploads/job-documents` yang diabaikan Git, diunduh melalui API dengan autentikasi, dan tidak disajikan sebagai folder publik.

Pencegahan impor ganda memakai SHA-256 isi workbook per B/L; mengganti nama file tidak mengizinkan impor ulang yang sama. Berkas yang memuat kontainer untuk beberapa B/L dapat digunakan pada masing-masing B/L dengan memilih kelompok yang sesuai. B/L yang diarsipkan atau job yang ditutup hanya dapat dibaca. Penyimpanan memakai versi optimistis dan transaksi; data yang sudah berubah harus dimuat ulang.

## Verifikasi pengembang

```powershell
cd backend
npm.cmd test
cd ..\frontend
npm.cmd test
npm.cmd run build
cd ..
node scripts/test-packing-import-live.cjs
node scripts/test-packing-import-browser.mjs
```

Dua skrip terakhir memerlukan demo lokal pada port 5000/5173 dan PostgreSQL demo pada 55432. Keduanya membuat dan menghapus data sintetis miliknya sendiri. Pengujian browser menyimpan tangkapan layar di `.demo/packing-import-ui` serta mencegah unduhan uji masuk ke folder Downloads pengguna.
