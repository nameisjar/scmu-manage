# Register B/L dan tarif JPT

## Alur penggunaan

1. Buka Dasbor atau **Register B/L** lalu **B/L baru**.
2. Masukkan nomor B/L, kapal, voyage, pelayaran, pelabuhan asal/tujuan, pihak terkait dan jenis barang.
3. Tambahkan setiap kontainer berikut nomor, seal dan ukuran. Ukuran `21` adalah nilai tersendiri; ukuran historis yang tidak diketahui tidak ditebak.
4. Simpan. Sistem membuat job penerima, referensi pengiriman laut berstatus pending, dan dokumen B/L internal. Ini pencatatan dokumen, bukan persetujuan booking vendor, verifikasi B/L, atau release barang.
5. Kelola progres masing-masing kontainer di tab **Kontainer**: terdaftar, siap, keluar gerbang, dooring, bongkar selesai, kembali kosong. Simpan tanggal operasional, kendaraan, pengemudi, vendor dan batas free time bila tersedia.
6. Tab **Dokumen** menautkan unggahan, packing list, verifikasi dan release pada job yang sama. Pengaman dokumen dan persetujuan direktur lama tetap berlaku.
7. Tab **Biaya** menampilkan keuangan job dan estimasi tarif. Pilih komponen secara eksplisit. Ajukan pendapatan untuk membuat usulan charge dan permintaan persetujuan direktur, bukan invoice/pembayaran otomatis.
8. Gunakan **Master tarif JPT** untuk mengelola tarif. Admin hanya membaca; Super Admin dapat membuat atau mengubah tarif.

## Aturan data dan tarif

- Tanggal keluar/masuk buku dipisahkan dari tanggal pergerakan kontainer. Maknanya bawaan **belum dikonfirmasi**; pilih kapal, kontainer atau dokumen hanya setelah diketahui.
- Tarif dooring 20/21/40 adalah Rp3.750.000/Rp3.850.000/Rp6.750.000 dengan PPN 1,1% sudah termasuk. Estimator tidak menambahkan PPN lagi.
- Kelompok kedua Rp3.485.000/Rp3.485.000/Rp5.256.000 disimpan nonaktif dan perlu konfirmasi. Jangan aktifkan sebelum arti biaya serta cakupannya jelas.
- DO fee SPIL/Tanto Rp200.000 dan Temas Rp150.000 dihitung per B/L, bukan per kontainer. Pelayaran harus sesuai.
- Forklift, cleaning dan toeslag dihitung per kontainer sesuai ukuran atau cakupan tarif yang dipilih. Forklift/cleaning 21 tidak mengambil tarif 20 secara otomatis.
- PPh 23 2% hanya referensi; tidak dihitung otomatis karena dasar pemotongannya belum dikonfirmasi.
- Pastikan biaya tambahan tidak sudah termasuk paket dooring sebelum mengajukan; sistem tidak mengasumsikan paket komersial pelanggan.
- Charge menyimpan snapshot tarif dan jumlah. Perubahan master tidak mengubah charge historis. Satu tarif tidak dapat diajukan dua kali pada B/L yang sama.
- Konflik versi menahan penyimpanan dan mempertahankan nilai formulir. Muat ulang data sebelum mencoba lagi.
- Identitas operasional kontainer memakai nomor kontainer. Mengganti nomor diperlakukan sebagai identitas baru; masukkan ulang detail operasionalnya dengan sengaja.

## Halaman

- `/`: dashboard register B/L.
- `/bl-register`: register, pencarian dan filter bulan/kapal/pelabuhan/status.
- `/bl-register/new`: pencatatan pertama dari B/L.
- `/bl-register/:id`: identitas, kontainer, dokumen, biaya dan riwayat.
- `/container-operations`: pintu masuk monitoring kontainer.
- `/jpt-tariffs`: master tarif.

Data tulisan tangan pada foto tidak diimpor otomatis; tulisan dan judul kolom yang tidak terbaca perlu diverifikasi dahulu.

## Pengujian

Jalankan dari root proyek pada Node 22 atau yang mendukung global WebSocket untuk browser runner:

```sh
node --test backend/test/*.test.js
node scripts/test-bl-render.mjs
node scripts/test-bl-browser.mjs
node scripts/test-bl-register-live.cjs
node scripts/test-bl-live-browser.mjs
```

Jalankan `npm test` dan `npm run build` dari folder frontend. Runner `test-bl-browser` memakai fixture kontrak HTTP terisolasi. Runner `test-bl-register-live` dan `test-bl-live-browser` memakai database demo lokal dan menghapus hanya graph fixture miliknya setelah selesai. Token uji berumur pendek dibentuk secara privat dari identitas internal aktif; tidak ada password yang diketik di browser.

Migrasi `20261025070000_bl_register_tariffs` menambahkan metadata register, snapshot charge, dan tabel tarif beserta tarif referensi. Tidak ada reset atau seed ulang database. Hentikan backend milik proyek sebelum `prisma generate` di Windows agar DLL Prisma tidak terkunci, lalu hidupkan kembali backend.
