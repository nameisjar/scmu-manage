# Audit dan implementasi Register Pengiriman SCMU

## Hasil akhir

Sistem menggunakan satu modul **Register Pengiriman**. Satu baris pada bentangan halaman kiri dan kanan buku menjadi satu record `SeaBill`, satu form, satu halaman daftar, dan satu riwayat perubahan. Dokumen B/L, Packing List opsional, dan dokumen pendukung ditambahkan pada record yang sama.

Antarmuka yang aktif hanya mencakup Dashboard Register, Register Pengiriman, Pengguna untuk Super Admin, dan Pengaturan. Menu lama untuk kontainer terpisah, tarif, penawaran, job, keuangan, persetujuan, RFQ, shipment, armada, pengemudi, perusahaan, invoice, rute, analitik, dan laporan telah dikeluarkan. API publik internal untuk modul-modul itu juga tidak lagi dipasang di `server.js`.

Tabel pendukung lama tidak langsung dihapus karena record register masih mempunyai foreign key ke job, shipment, perusahaan internal, dan dokumen. Menghapus tabel tersebut akan menghapus atau merusak register. Data pendukung itu sekarang berfungsi sebagai implementasi internal dan tidak menjadi modul pencatatan kedua.

## Kondisi awal yang ditemukan

- Aplikasi memakai React 18, Vite, Tailwind, Express, Prisma, dan PostgreSQL.
- `SeaBill` sudah menyimpan identitas B/L, kapal, voyage, pelabuhan, relasi dokumen, dan metadata JSON.
- Data register belum memuat semua kolom halaman kanan buku dalam satu form.
- Dokumen tersimpan aman, tetapi pengelolaannya tersebar di workspace job.
- Daftar belum mempunyai ekspor XLSX register, filter lengkap, dan arsip yang dapat dipulihkan.
- Dashboard register masih berbaur dengan indikator operasional/keuangan lama.

## Pembacaan foto buku

Foto yang diperiksa:

- `WhatsApp Image 2026-10-26 at 01.03.28.jpeg`: bentangan buku kiri-kanan.
- `WhatsApp Image 2026-10-25 at 11.56.44.jpeg`: bagian halaman kanan.

Judul yang dapat dibaca dengan cukup jelas:

| Judul buku | Kolom sistem | Aturan |
| --- | --- | --- |
| NO. | `registerNumber` | Nomor internal unik; dibuat otomatis jika kosong |
| NAMA KAPAL | `vesselName` | Teks opsional |
| VOY | `voyageNumber` | Teks agar nol awal tidak hilang |
| NO. BL | `billNumber` | Teks wajib; duplikasi baru diperiksa global tanpa membatasi jumlah B/L per kapal |
| PELABUHAN ASAL | `portOfLoading` | Teks opsional |
| TGL KELUAR | `register.departureDate` | Tanggal buku; maknanya tidak ditebak |
| TGL MASUK | `register.arrivalDate` | Tanggal buku; maknanya tidak ditebak |
| JUMLAH | `quantity20`, `quantity21`, `quantity40` | Nilai manual; kosong berbeda dari nol |
| JENIS BRG. | `cargoDescription` | Uraian/transkripsi barang |

Subjudul 20 dan 40 terlihat. Arti subjudul tengah belum terbaca pasti. Label 21 dipertahankan karena sudah ada pada konfigurasi tarif sebelumnya, tetapi ini bukan konfirmasi bahwa foto menyebut 21.

Halaman kanan memperlihatkan nama pihak, teks SCMU, referensi, tanggal tambahan, dan nominal. Judulnya belum cukup jelas, sehingga sistem memakai label netral:

- `partyName`: pihak/perusahaan, peran belum dikonfirmasi.
- `partyText`: teks pihak/SCMU.
- `reference1` dan `reference2`: referensi tanpa menebak invoice atau delivery order.
- `additionalDate1` dan `additionalDate2`: tanggal tambahan tanpa arti otomatis.
- `registerAmount`: nominal register `Decimal(18,2)`; bukan pendapatan, biaya, invoice, pembayaran, utang, piutang, atau laba.
- `additionalNotes`: catatan transkripsi dan ketidakpastian.

Tidak ada tulisan tangan dari foto yang diimpor menjadi data demo.

## Perubahan sistem

- Form tambah dan edit menyimpan seluruh kolom dalam satu permintaan. B/L adalah satu-satunya isian wajib; nomor register dibuat otomatis.
- Validasi frontend dan backend mempertahankan nilai input saat gagal. Update menggunakan nomor versi untuk mencegah penimpaan perubahan pengguna lain.
- Daftar memakai tabel lebar dengan scroll horizontal, dua kolom identitas sticky, pagination server, pencarian, filter, sorting, detail, edit, arsip, dan pemulihan.
- Pencarian mencakup nomor register, B/L, kapal, voyage, pelabuhan asal, pihak/perusahaan, dan referensi.
- Filter mencakup periode, kapal, voyage, pelabuhan asal, perusahaan, rentang tanggal pembuatan, dokumen, dan arsip.
- B/L, Packing List, serta dokumen pendukung memakai upload PDF/JPEG/PNG/WebP maksimum 5 MB, pemeriksaan signature, nama fisik acak, histori lampiran, pratinjau modal, dan unduhan berotorisasi.
- Packing List tetap opsional dan dapat ditambahkan setelah register disimpan.
- Ekspor menghasilkan XLSX asli. Ekspor filter dan seluruh register mengabaikan pagination, mempertahankan identifier sebagai teks, tanggal sebagai sel tanggal, dan rupiah sebagai angka ketika presisinya aman untuk Excel. Nilai yang tidak dapat diekspor tanpa kehilangan presisi ditolak dengan pesan kesalahan.
- Dashboard hanya menampilkan jumlah register, periode, kapal/voyage, B/L belum tersedia, Packing List belum tersedia, dan data terbaru. Nominal netral tidak masuk KPI keuangan.
- Riwayat audit tampil langsung di halaman register. Navigasi kembali tetap terlihat saat halaman digulir.
- Bahasa Indonesia dan Inggris tersedia untuk antarmuka register.

## Database dan migrasi

Tiga migrasi diterapkan:

1. `20261026010000_unified_register`: menambahkan `registerAmount DECIMAL(18,2)` nullable.
2. `20261026020000_register_archive_columns`: menambahkan `archivedAt` dan `archivedById` nullable.
3. `20261026030000_remove_legacy_register_customer_fields`: menghapus hanya `customerName` dan `billingPartyName` dari JSON register lama.

Migrasi dijalankan tanpa reset dan tanpa seed. Sebelum migrasi dibuat backup PostgreSQL custom-format, lalu migrasi diuji pada database hasil restore yang terisolasi. Pemeriksaan 31 tabel memastikan jumlah baris, kolom historis, dan semua nilai selain dua atribut pelanggan yang memang dihapus tidak berubah. Backup terbaru berada di `.demo/backups/unified-register-20261026032312.dump`.

## Pengujian yang dijalankan

- 80 tes backend lulus.
- 16 tes frontend dan pemeriksaan render register lulus.
- Tes integrasi database nyata lulus untuk create/edit, nilai Decimal, konflik versi, pencarian/filter, upload B/L, Packing List belakangan, unduhan aman, XLSX, arsip/pemulihan, audit, serta pembersihan fixture.
- Tes browser desktop 1440×1000 dan tablet 800×1000 lulus untuk scroll horizontal, sticky identity, validasi, dokumen, ekspor, arsip, dashboard, bahasa Inggris, satu form, dan navigasi kembali sticky.
- Production build lulus; bundle utama turun dari sekitar 963 KB menjadi 357 KB setelah modul antarmuka lama dikeluarkan.
- Repository tidak menyediakan perintah lint atau type-check khusus, sehingga keduanya tidak diklaim sebagai pemeriksaan terpisah.

## Menjalankan demo

Dari root proyek:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -SkipSeed -PostgresBin "C:\Program Files\PostgreSQL\14\bin"
```

Buka `http://localhost:5173`. Gunakan akun internal demo yang dicantumkan oleh skrip. `-SkipSeed` harus dipakai untuk menjalankan data yang sudah ada tanpa memasukkan contoh ulang.

Untuk menghentikan layanan tanpa menghapus database:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

## Keputusan bisnis yang masih perlu dikonfirmasi

- Judul tepat seluruh kolom halaman kanan.
- Arti subjudul jumlah di antara 20 dan 40.
- Arti operasional tanggal keluar/masuk dan dua tanggal tambahan.
- Arti nominal rupiah.
- Apakah aturan keunikan B/L kelak perlu dibatasi per pelayaran/tahun. Saat ini record baru menggunakan pemeriksaan nomor B/L global tanpa membatasi banyak B/L pada kapal yang sama.
- Cakupan pasti data modul lama lain yang boleh dihapus permanen. Tabel pendukung yang masih direferensikan register tidak dapat dihapus tanpa merancang ulang foreign key dan migrasi data terlebih dahulu.
