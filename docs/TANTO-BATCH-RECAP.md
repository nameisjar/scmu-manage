# Unggah dokumen Tanto dan rekap Packing List kapal

## Alur admin

1. Buka **Pengiriman > Tambah pengiriman > Unggah B/L** untuk membaca dan mengelompokkan B/L sebelum membuat pengiriman. Pilihan **Isi manual** tersedia pada tombol yang sama. Untuk pengiriman yang sudah dibuat, gunakan **Dokumen > Unggah B/L dan dokumen**. Satu pengiriman dapat berisi banyak B/L. Pilih satu atau banyak file. Satu antrean memuat maksimal 20 file, masing-masing 5 MB. Pembacaan berjalan berurutan; satu file bermasalah tidak menghentikan file lain. Lihat [alur pengiriman per perjalanan kapal](SHIPPING-JOURNEYS.md).
2. Tekan **Periksa** pada setiap file. Periksa jenis dokumen, file asli, nomor B/L, kapal/voyage, pihak, dan tabel kontainer. B/L bisa dikategorikan draft atau final. Hasil yang belum terbaca dapat dikoreksi atau dilengkapi manual, termasuk menambah kontainer. PDF/gambar yang didukung dibaca lokal; format lainnya dapat dilampirkan sebagai pendukung setelah admin mengisi nomor B/L tujuan.
3. Sistem memeriksa nomor B/L saat peninjauan. Nomor baru menjadi rincian dalam pengiriman kapal yang sedang dibuka; nomor yang sudah ada pada pengiriman yang sama digunakan untuk menambahkan file. Admin mengonfirmasi tujuan tersebut; isian dan kontainer lama tidak ditimpa. Tandai sumber sudah diperiksa, lalu pilih **Simpan yang diperiksa**. B/L diproses lebih dahulu, kemudian DO dan surat kuasa ditautkan ke nomor B/L yang sama. Satu surat kuasa dapat menjadi lampiran pada beberapa B/L tanpa menambah jumlah kontainer. Nomor ambigu, pengiriman hanya baca, B/L dari pengiriman lain, atau B/L tujuan yang belum ada perlu diperiksa sebelum lampiran disimpan. File lainnya tetap dapat selesai. Ringkasan menampilkan jumlah B/L baru, B/L dilengkapi, dan dokumen yang masih tertunda.
4. Pilih **Buat rekap Packing List** dari antrean, atau **Packing List & Rekap > Rekap seluruh B/L** pada detail pengiriman. Pilih maksimal 40 B/L dalam pengiriman yang sama, maksimal 500 baris kontainer.
5. Isi kepala cetak: kapal/voyage cetak, keberangkatan, tiba, storage, demurrage, dan catatan. Tanggal B/L, tanggal sandar, tanggal cetak DO, dan masa berlaku DO tidak diganti menjadi tanggal operasional tersebut secara otomatis.
6. Lengkapi **Pengirim cetak** serta **Penerima / tujuan lapangan** per B/L. B/L yang mempunyai dua nama cetak yang sama digabung menjadi satu kelompok. Urutan B/L dapat diatur. Nama asli pada B/L tetap disimpan dan ditampilkan sebagai acuan.
7. Lengkapi uraian cetak, jumlah kemasan beserta satuannya, dan catatan per kontainer. Jumlah kosong tetap belum diketahui; nol harus diisi secara eksplisit. Berat tidak diubah menjadi jumlah sak/koli. Kontainer dan segel mengikuti data B/L. Koreksi sumber dilakukan melalui Ubah data pada pengiriman, lalu pratinjau rekap dibuat kembali.
8. Periksa pratinjau, lalu pilih **Cetak / Simpan PDF** atau **Unduh Excel**. PDF menggunakan dialog cetak browser. Kedua keluaran memakai satu snapshot yang sama; pengunduhan ulang dalam modal tidak membuat lampiran tambahan. Rekap disimpan pada seluruh B/L yang dipilih. Dari tab Dokumen, pilih lampiran rekap kapal untuk mengunduh Excel atau mencetak PDF dari snapshot lama.

## Cakupan Tanto

Pembaca `TANTO_V1` membedakan judul Konosemen/Bill of Lading, Delivery Order, dan Surat Kuasa. Teks syarat pengangkutan yang menyebut Delivery Order tidak mengubah B/L menjadi DO. Pembacaan menggunakan posisi kolom pada halaman utama, termasuk kontainer, tipe, segel, muatan, dan berat sumber. Halaman syarat pengangkutan tidak menjadi sumber data muatan. Berat tanpa satuan tetap disimpan sebagai teks sumber, tanpa konversi ke kg.

Contoh yang digunakan untuk evaluasi memuat empat B/L dan 21 kontainer, empat DO dengan referensi B/L yang sama, serta satu surat kuasa. Data dan gambar dari Downloads hanya dipakai sebagai referensi lokal; tidak dijadikan seed atau fixture dalam Git. Fixture pengujian berisi nama dan nomor sintetis.

Pembacaan format lain tetap memerlukan pemeriksaan admin. Tidak ada tahap pencocokan PL dengan B/L atau layanan AI eksternal. Pemeriksaan sumber pada unggahan bukan verifikasi pelayaran maupun izin release barang. Proses ini tidak membuat tagihan atau pembayaran.

## Penyimpanan dan kegagalan

File asli disimpan privat dengan UUID. Sesi pratinjau hanya dapat diakses pembuatnya dan kedaluwarsa setelah 24 jam. Daftar sesi di browser disimpan per akun pada sessionStorage, agar file yang sudah terbaca dapat dibuka kembali; koreksi yang belum disimpan harus diperiksa kembali setelah halaman dimuat ulang. Mengeluarkan file yang sudah tersimpan dari antrean tidak menghapus lampiran pada pengiriman. Status lampiran disegarkan ketika antrean dibuka. Jika file sudah dihapus dari pengiriman, antrean menampilkan **Lampiran telah dihapus**, tidak menganggapnya masih tersimpan atau memulihkannya diam-diam. Unggah ulang file untuk menambahkannya kembali.

Penyimpanan satu sesi dapat diulang dengan aman tanpa menggandakan pengiriman atau lampiran. File identik pada B/L dan kategori yang sama digunakan kembali. Setiap operasi penyimpanan memakai transaksi dan versi pengiriman. Kegagalan pada satu dokumen menyisakan sesi tersebut untuk diperiksa atau diulang. Rekap memakai pilihan B/L dan sidik data pratinjau; perubahan sumber memerlukan pratinjau baru. Snapshot historis dan identitas admin dicatat di riwayat. Semua pemeriksaan dan file tetap berada di server SCMU.

## Pengujian

```powershell
cd backend
npm.cmd test
npm.cmd run test:documents
cd ..\frontend
npm.cmd test
npm.cmd run build
cd ..
node scripts/test-tanto-batch.mjs
$env:SCMU_QA_WIDTH = '390'
node scripts/test-tanto-batch.mjs
Remove-Item Env:\SCMU_QA_WIDTH
```

Uji integrasi membutuhkan demo terisolasi pada 5000/5173 dan PostgreSQL demo 55432. Uji membuat dan membersihkan data sintetis miliknya, memeriksa empat B/L/21 kontainer, DO dan kuasa tanpa duplikasi, satu file rusak, dua kelompok cetak, PDF/Excel, kontrol versi, privasi sesi, dan ketiadaan biaya/pembayaran otomatis. Tangkapan layar berada di `.demo/tanto-batch-ui` dan `.demo/tanto-batch-mobile` yang diabaikan Git.
