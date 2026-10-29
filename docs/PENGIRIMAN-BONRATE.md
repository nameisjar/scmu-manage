# Pengiriman, dokumen, dan bonrate sopir

Satu pengiriman menjadi wadah pekerjaan dan dokumen; nomor/file B/L boleh menyusul. Alur bertahap dijelaskan di [ALUR-DOKUMEN-BERTAHAP.md](ALUR-DOKUMEN-BERTAHAP.md). Detailnya terdiri dari Ringkasan, Dokumen, Packing List & Rekap, Bonrate Sopir, serta Biaya & Riwayat. Tab Kontainer & Bongkar telah digabung ke alur ini. Tautan lama `?tab=containers` membuka Ringkasan; `?tab=unloading` membuka Packing List & Rekap.

Identitas kontainer (nomor, ukuran, segel) terlihat pada Ringkasan dan dikoreksi melalui Ubah data → Kontainer dalam B/L. Perubahan tetap memakai versi data dan aturan revisi B/L. Rincian operasional lama tetap tersimpan; editor baru tidak menghapusnya. Kontainer yang dipakai bon aktif harus dilepaskan atau dikoreksi pada bon tersebut sebelum nomor kontainernya diganti/dihapus.

Unggah B/L, PL mitra, Berita Acara, bonrate, atau dokumen pendukung melalui tab Dokumen. Unggahan PL mitra langsung tersedia di Kelola Packing List, tanpa mengunggah file yang sama lagi. PL SCMU dan rekapan tetap bisa dibuat dari PL mitra, Berita Acara, atau Input manual. Pemeriksaan barang dicatat dari lembar pemeriksaan PL SCMU. Pengingat pada daftar pengiriman memakai status pemeriksaan tersebut, bukan formulir bongkar lama.

## Bonrate

Bonrate sementara dimaknai sebagai catatan penugasan/ritase sopir, dengan nominal opsional. Definisi dan format dokumen perusahaan masih dapat disesuaikan. Satu B/L dapat memiliki beberapa bon; masing-masing mencatat nomor otomatis atau manual, tanggal, sopir, kendaraan, asal/tujuan, jumlah rit, ringkasan muatan, instruksi, catatan, serta pilihan kontainer dan lampiran.

Alur status: Draf → Ditugaskan → Dalam perjalanan → Selesai. Bon aktif dapat dibatalkan dengan alasan. Bon batal hanya baca. Setelah selesai, identitas penugasan dikunci; catatan, lampiran, nominal dan catatan pembayaran masih dapat diperbarui. Penyelesaian memerlukan tanggal selesai. Catatan sudah dibayar memerlukan nominal dan tanggal pembayaran. Pencatat dan waktu perubahan berasal dari server serta masuk riwayat B/L.

Menyimpan nominal dan status pembayaran bon tidak membuat transaksi keuangan. Setelah bon selesai, tindakan Ajukan biaya mengirim nominal satu kali ke persetujuan direktur melalui alur biaya yang sudah ada. Nominal dikunci setelah pengajuan. Pembayaran tidak dibuat otomatis.

Lampiran dapat dipilih dari dokumen pada B/L yang sama; kategori Bonrate sopir tersedia saat unggah. Menghapus file melepaskan tautan lampiran dan meninggalkan pemberitahuan pada bon serta riwayat penghapusan. Penugasan dan catatan pembayaran tetap dipertahankan. Bon pada pengiriman arsip atau job ditutup hanya baca. Hanya Admin/Super Admin dapat mengaksesnya.

## Verifikasi

`npm.cmd test` dari backend mencakup validasi, transisi status, pencatatan pembayaran, otorisasi, versi, arsip, serta pelepasan lampiran. `node scripts/test-driver-bons-browser.mjs` menggunakan demo terisolasi dan membuat/membersihkan data uji sendiri. Skrip memeriksa alur desktop/ponsel, editor B/L, detail modal, lampiran, serta tidak adanya transaksi keuangan otomatis.
