# Impor Packing List mitra dan Kepala Packing List SCMU

`KANTOR C.xlsx` adalah referensi keluaran internal SCMU. Berkas Excel dari mitra menjadi sumber transkripsi dan tetap disimpan terpisah dari dokumen internal yang dihasilkan.

## Ringkasan langsung setelah unggah PL mitra

Unggah dokumen berkategori **Packing List mitra** dari tab Dokumen atau dari Kelola Packing List. Modal **Ringkasan Packing List Mitra** langsung terbuka. Ringkasan sumber dapat dicetak sebelum B/L tersedia, setelah admin memeriksa isi ringkasan terhadap file asli. Impor rincian barang tidak diwajibkan.

1. Periksa pratinjau per kontainer/segel, nama penerima atau mark, jumlah beserta satuan, dan catatan. Kapal, voyage, tanggal, serta nomor B/L pada kepala ringkasan berasal dari sumber yang terbaca, bukan disalin dari pengiriman induk.
2. Bila diperlukan, pilih **Ubah ringkasan** untuk koreksi singkat. Jika format belum terbaca, pilih **Lihat file asli**, lalu isi ringkasan kontainer atau penerima tanpa harus menyalin rincian barang. Kepala ringkasan opsional.
3. Centang bahwa ringkasan sudah diperiksa terhadap file asli. Pilih **Cetak / Simpan PDF** melalui dialog cetak browser, atau **Unduh Excel**. Ringkasan disimpan per file sumber dan dapat dibuka lagi melalui tombol **Ringkasan PL**.

Jumlah kosong tetap belum diketahui; nol hanya ditampilkan jika dinyatakan. Jumlah dipisahkan menurut satuan. Daftar penerima panjang dilanjutkan ke baris berikutnya pada keluaran cetak, tanpa menghitung jumlah dua kali. Ringkasan selalu bertanda **Berdasarkan Packing List mitra**. Ini tidak mengubah isi B/L atau rincian PL operasional.

Pembacaan otomatis memakai pembaca XLSX mitra yang formatnya sudah dikenali, seperti contoh Bilba. PDF, gambar, dan format lain tetap disimpan sebagai file asli dengan opsi ringkasan singkat manual; fitur ini belum OCR untuk semua format. File asli tetap privat dan tidak ditimpa. Penyimpanan ringkasan mencatat admin, waktu, versi, dan sidik isi sumber; mengunduh ulang tidak membuat lampiran ganda. Pengiriman yang diarsipkan atau ditutup hanya dapat mencetak ringkasan yang sudah disimpan. Menghapus file sumber juga melepas ringkasannya, sementara riwayat pencatatan tetap tersedia.

## Keluaran Packing List internal

Alur lengkap: **Kelola Packing List > pilih sumber > periksa data > bentuk cetak > pratinjau > PDF atau Excel**. Pilih PL mitra, Berita Acara, atau Input manual. Rincian yang dipakai ditentukan admin pada impor/editor sumber. Periksa sumber dan simpan rincian sebelum menerbitkan PL internal. Nilai yang belum diketahui tetap kosong; ringkasan penerima dapat dipakai saat detail barang belum tersedia.

Tidak ada tahap pencocokan dengan B/L, penilaian selisih otomatis, atau syarat memiliki B/L untuk mencetak PL. Kontainer dan segel pada keluaran mengikuti sumber PL. Admin memeriksa file asli secara manual dan mencatat koreksi atau klarifikasi. Pembaruan B/L tidak mengganti isi PL ataupun hasil aktual. Keluaran juga dapat berbentuk Kepala Packing List atau rekap internal; penggabungan beberapa pengiriman tetap memakai kapal dan periode voyage yang sama.

PDF menggunakan dialog cetak browser: pilih Simpan sebagai PDF. Excel berupa XLSX. Draf identitas B/L tanpa rincian barang tetap tersedia dan tidak dianggap PL lengkap. Hasil pemeriksaan lapangan mempertahankan jumlah dokumen, aktual dan rusak secara terpisah; instruksi lapangan tidak otomatis dianggap selesai. Riwayat pembuatan menyimpan sumber, admin dan snapshot. Lihat [alur operasional](ALUR-DOKUMEN-BERTAHAP.md).

## Cakupan pembaca awal

Pembaca mendukung contoh Bilba dengan penanda `SPNU ... / SEAL ...`, blok `MERK:`, dan kolom `TGL`, `TOKO`, `COLY`, `NAMA BARANG`, `UKURAN`, `M3/TN`. Pemisah titik/spasi/tanda hubung nomor kontainer dinormalisasi untuk pencatatan. Subtotal/total dan header halaman berulang tidak dijadikan item. Template lain yang tidak dikenali perlu transkripsi manual; ini belum OCR atau pembaca semua format PDF/Excel.

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
node scripts/test-partner-summary-browser.mjs
```

Skrip integrasi tersebut memerlukan demo lokal pada port 5000/5173 dan PostgreSQL demo pada 55432. Skrip membuat dan menghapus data sintetis miliknya sendiri. Pengujian browser menyimpan tangkapan layar di `.demo/packing-import-ui` atau `.demo/partner-summary-browser` serta mencegah unduhan uji masuk ke folder Downloads pengguna. Uji ringkasan memeriksa unggah XLSX, fallback PDF, pratinjau otomatis dari dua jalur unggah, PDF/Excel, pembukaan ulang, serta penyimpanan tanpa B/L dan tanpa mutasi rincian PL/pemeriksaan manual admin.
