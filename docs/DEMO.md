# Demo internal SCMU

SCMU hanya dipakai oleh **Super Admin** dan **Admin**. Master pelanggan, akun pelanggan,
menu pelanggan dan portal telah dihapus. Penawaran, job, invoice, pembayaran dan dokumen
yang sudah ada tetap tersimpan atas nama perusahaan internal SCMU.

## Menjalankan

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1
```

Jika PostgreSQL tidak ditemukan, tambahkan `-PostgresBin "C:\Program Files\PostgreSQL\14\bin"`.
Port bawaan: database 55432, API 5000, aplikasi 5173. Parameter `-DatabasePort`, `-ApiPort`,
dan `-FrontendPort` tersedia. Script menjalankan migrasi dan seed tanpa mereset database.
Log, database, secret demo dan identitas proses berada di `.demo/` yang diabaikan Git.

## Akun

| Peran | Email | Password |
| --- | --- | --- |
| Super Admin | admin@scmu.local | Admin@1234 |
| Admin | operasional@scmu.local | Ops@1234 |

Password yang telah diganti tidak direset oleh seed. Email dan identitas di atas hanya
untuk demo lokal. Akun dengan peran lama selain dua peran internal tidak bisa login.
Akun staf lama yang masih diperlukan sebagai pelaku riwayat disimpan nonaktif;
akun pelanggan dihapus. Token lama juga ditolak melalui API dan Socket.IO.

Super Admin mengelola akun, peran dan status aktif pengguna, serta profil perusahaan SCMU.
Admin mengelola operasional, dokumen, biaya, invoice, pembayaran dan laporan. Admin tidak
dapat membuka pengelolaan akun atau mengubah profil perusahaan SCMU. Super Admin tidak
dapat menonaktifkan/menurunkan perannya sendiri; minimal satu Super Admin aktif dipertahankan.

## Urutan demonstrasi

1. Buka http://localhost:5173. Login dan pilih Bahasa Indonesia atau English.
2. **Perusahaan** memuat identitas SCMU dan mitra angkutan/broker/penerima, tanpa master pelanggan.
   Transaksi baru otomatis memakai identitas SCMU; tidak ada pilihan pelanggan.
3. **Penawaran komersial**: buat draf, isi harga jual dan estimasi biaya, cetak, tandai terkirim,
   lalu catat konfirmasi yang diterima Admin. Revisi menghasilkan draf baru.
4. Konversi penawaran diterima menjadi job. Membuka konversi yang sama tidak menggandakan job.
5. **Job order** → `SCMU-JOB-DEMO-001`: Surabaya–Merauke, 10 koli, 1.200 kg, 6,5 CBM,
   dengan tahapan darat–laut–darat. Tambahkan tahap, cetak surat jalan, catat tracking/POD,
   dan pengembalian kontainer kosong.
6. **Pendapatan & biaya** memisahkan pengajuan, estimasi dan nilai aktual disetujui.
   Pilih biaya operasional internal (BBM, tol, parkir, uang jalan, bongkar muat) atau tagihan vendor.
   Biaya dapat dikaitkan ke tahap angkutan yang sesuai. Tagihan vendor memerlukan vendor
   sebelum persetujuan; biaya internal dicatat tanpa vendor.
7. **Dokumen**: unggah PDF/JPEG/PNG/WebP maksimal 5 MB, unduh, kemudian verifikasi.
   Semua dokumen bersifat internal. Penggantian file membatalkan verifikasi sebelumnya.
8. **Invoice & pembayaran**: buat invoice dari pendapatan disetujui yang belum ditagihkan,
   isi pajak sebagai nilai transaksi, catat penerimaan dan pembayaran vendor secara parsial.
   Pembayaran biaya internal memiliki tabel terpisah dengan penerima, metode dan referensi.
   Pembayaran tidak boleh melebihi saldo; referensi unik mencegah pencatatan ganda.
9. **Penanganan**: catat barang masuk/keluar per lokasi, referensi kepabeanan, klaim dan
   asuransi. Stok gudang tidak boleh negatif. Nilai register tidak otomatis menjadi biaya.
10. **Keuangan job** menyajikan laba, piutang/utang vendor, biaya internal disetujui/dibayar/sisa,
    umur tagihan, peringatan, dan CSV per mata uang. Laba memperhitungkan seluruh biaya
    disetujui; biaya internal tidak masuk umur utang vendor.
11. **Tutup job** memeriksa tahapan terkirim, dokumen wajib terverifikasi dan belum kedaluwarsa,
    biaya selesai ditinjau, pelunasan termasuk biaya internal, stok kosong, klaim selesai dan kontainer kembali.
12. **RFQ vendor**: Admin mencatat penawaran dengan memilih vendor. Beberapa vendor dapat
    dicatat sebelum pemenang ditetapkan. Vendor tidak memiliki akun login.
13. Login Admin dan pastikan menu Pengguna tidak tersedia; login Super Admin untuk mengelola akun.

### Armada sendiri dan jasa vendor

Buka **SCMU-JOB-ARMADA-001** untuk contoh Surabaya–Merauke dengan tiga tahap:
truk/pengemudi SCMU di Surabaya, kapal vendor, dan truk/pengemudi SCMU di Merauke.
Tambah tahap angkutan menyediakan pilihan **Armada SCMU / Jasa vendor**. Armada SCMU
memerlukan kendaraan dan pengemudi aktif milik SCMU, hanya untuk moda darat. Angkutan
laut/udara memakai vendor tanpa kendaraan/pengemudi darat. Jasa vendor dapat dipilih
langsung tanpa RFQ, termasuk ketika sudah ada kesepakatan tarif.

Contoh ini memiliki pendapatan Rp15 juta, biaya internal Rp2 juta dan biaya kapal Rp8 juta.
Invoice Rp15 juta menghasilkan laba kotor Rp5 juta sebelum biaya tidak langsung.
Penerimaan Rp5 juta, pembayaran vendor Rp1 juta dan pembayaran internal Rp500 ribu
menyisakan piutang Rp10 juta, utang vendor Rp7 juta dan biaya internal Rp1,5 juta.
Riwayat transaksi lama tetap dipertahankan; seed menambah contoh baru tanpa menimpa job lama.
Penanda uang muka hanya mencatat pembayaran sebagian atas biaya yang sudah disetujui;
belum ada buku kas bon terpisah untuk pengembalian sisa uang jalan atau alokasi penyusutan otomatis.

Seluruh contoh bawaan memakai Indonesia, tujuan Merauke, Papua Selatan, dan rupiah.
Identitas, harga dan estimasi perjalanan adalah simulasi. Pelacakan dicatat operator internal.
GPS, carrier, CEISA/INSW, bank, e-Faktur dan pengiriman pesan belum terhubung ke layanan eksternal.
Keuangan job merupakan buku pembantu operasional, bukan buku besar akuntansi lengkap.

## Pemeriksaan

```powershell
node scripts/test-internal-access.cjs
node scripts/test-demo-indonesia.cjs
node scripts/smoke-demo.cjs
node scripts/workflow-demo.cjs
node scripts/jpt-workflow.cjs
node scripts/test-own-fleet.cjs
node scripts/test-modal-browser.mjs
```

Jalankan pemeriksaan pertama untuk validasi peran, penghapusan master/akun pelanggan,
identitas transaksi SCMU, pembatasan akun, sesi lama dan Socket.IO. Jika snapshot sebelum
migrasi tersedia, jumlah, status, nominal dan file transaksi dibandingkan dengan snapshot itu.
Jalankan pemeriksaan secara berurutan agar transaksi sementara tidak memengaruhi snapshot.
Pengujian workflow membersihkan hanya data dan file miliknya. Pemeriksaan wilayah menjalankan
seed ulang untuk memastikan tidak ada duplikasi atau perubahan pada catatan yang tersimpan.

Di folder backend jalankan `npm.cmd test`. Di frontend jalankan `npm.cmd test` dan
`npm.cmd run test:language`. Pemeriksaan Chrome headless memakai profil terisolasi dan
menyimpan screenshot di `.demo/ui-check/`; browser pribadi tidak digunakan. Path browser
bisa diatur melalui `SCMU_TEST_BROWSER`.

Modal dipasang langsung pada body melalui React portal, sehingga animasi dan scroll halaman
tidak memotongnya. Form panjang dapat digulir dengan judul dan tombol aksi tetap terlihat.
Tema aplikasi dan cetak memakai biru; logo SVG mempertahankan warna referensi SCMU.

## Menghentikan

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

Database tetap tersimpan. Periksa `.demo/backend.err.log`, `.demo/frontend.err.log` dan
http://localhost:5000/health bila ada masalah. Jika HTTP 429 muncul, ikuti waktu tunggu
di login. Kuota API umum 300 permintaan/menit; login membatasi 10 percobaan gagal/15 menit.
