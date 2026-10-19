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
| Direktur (Super Admin) | admin@scmu.local | Admin@1234 |
| Admin | operasional@scmu.local | Ops@1234 |

Password yang telah diganti tidak direset oleh seed. Email dan identitas di atas hanya
untuk demo lokal. Akun dengan peran lama selain dua peran internal tidak bisa login.
Akun staf lama yang masih diperlukan sebagai pelaku riwayat disimpan nonaktif;
akun pelanggan dihapus. Token lama juga ditolak melalui API dan Socket.IO.

Direktur (Super Admin) mengelola akun, peran dan status aktif pengguna, profil perusahaan,
serta keputusan persetujuan. Admin menyiapkan operasional, dokumen dan pengajuan biaya,
invoice serta pembayaran; kemudian mencatat realisasi yang sudah diotorisasi. Admin tidak
dapat membuka pengelolaan akun atau mengubah profil perusahaan SCMU. Super Admin tidak
dapat menonaktifkan/menurunkan perannya sendiri; minimal satu Super Admin aktif dipertahankan.

## Navigasi kembali

Halaman detail penawaran komersial, job order, pengiriman dan RFQ memiliki bilah atas
yang tetap terlihat saat isi digulir. Bilah memuat tombol kembali, nomor dokumen dan status.
Tujuan mengikuti halaman asal: dokumen dari persetujuan kembali ke persetujuan, sedangkan
pengiriman yang dibuka dari job kembali ke job dan tab sebelumnya. Tautan yang dibuka
langsung menggunakan daftar modul sebagai tujuan bawaan.

Pencarian, filter, halaman tabel dan tab job disimpan di URL. Posisi gulir dipulihkan setelah
data daftar dimuat, termasuk saat memakai tombol Back/Forward browser. Riwayat posisi
tersimpan selama sesi browser untuk akun yang sedang login.

## Urutan demonstrasi

1. Buka http://localhost:5173. Login dan pilih Bahasa Indonesia atau English.
2. **Perusahaan** memuat identitas SCMU dan mitra angkutan/broker/penerima, tanpa master pelanggan.
   Transaksi baru otomatis memakai identitas SCMU; tidak ada pilihan pelanggan.
3. **Penawaran komersial**: buat draf, isi harga jual dan estimasi biaya, ajukan ke direktur,
   lalu setelah disetujui cetak/tandai terkirim,
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
8. **Invoice & pembayaran**: buat draf invoice dari pendapatan disetujui, isi pajak,
   lalu ajukan invoice kepada direktur. Setelah disetujui, Admin dapat mencatat penerimaan.
   Pengeluaran vendor/internal diajukan terlebih dahulu, disetujui direktur, kemudian Admin
   mencatat realisasi dan referensi bukti di detail pengajuan. Persetujuan belum mengubah saldo kas.
   Pembayaran biaya internal memiliki tabel terpisah dengan penerima, metode dan referensi.
   Pembayaran tidak boleh melebihi saldo; referensi unik mencegah pencatatan ganda.
9. **Penanganan**: catat barang masuk/keluar per lokasi, referensi kepabeanan, klaim dan
   asuransi. Stok gudang tidak boleh negatif. Nilai register tidak otomatis menjadi biaya.
10. **Keuangan job** menyajikan laba, piutang/utang vendor, biaya internal disetujui/dibayar/sisa,
    umur tagihan, peringatan, dan CSV per mata uang. Laba memperhitungkan seluruh biaya
    disetujui; biaya internal tidak masuk umur utang vendor.
11. **Ajukan penutupan job** kepada direktur setelah pemeriksaan tahapan terkirim, dokumen wajib terverifikasi dan belum kedaluwarsa,
    biaya selesai ditinjau, pelunasan termasuk biaya internal, stok kosong, klaim selesai dan kontainer kembali.
12. **RFQ vendor**: Admin mencatat penawaran dengan memilih vendor. Beberapa vendor dapat
    dicatat sebelum pilihan vendor diajukan kepada direktur. Pemesanan angkutan vendor baru
    melalui job juga memerlukan persetujuan. Vendor tidak memiliki akun login.
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

## Tampilan keuangan job

Empat kartu utama menampilkan pendapatan disetujui, laba kotor tertagih, piutang, dan utang
vendor untuk seluruh job dalam mata uang yang dipilih. Pilih tab **Ringkasan**, **Piutang**,
**Utang vendor**, atau **Biaya internal** untuk memeriksa tabel terkait. Ringkasan biaya
internal disetujui/dibayar/sisa tersedia di tab biaya internal; tagihan vendor di tab utang vendor.

Pencarian mencakup nomor job, judul, rute, dan referensi. Pilihan **Masih memiliki saldo**
membatasi tabel pada job/tagihan dengan saldo positif. Tanpa pilihan ini, catatan lunas tetap
dapat diperiksa. Filter berlaku pada tabel dan CSV; kartu ringkasan tetap mencakup seluruh job
dalam mata uang tersebut. Tab, mata uang, pencarian dan pilihan saldo tersimpan di URL.

Tekan **Lihat** untuk modal rincian estimasi, nilai disetujui, penagihan, biaya dan realisasi
pembayaran. Invoice draf/dibatalkan tidak masuk piutang dan ditandai tidak dihitung dalam
modal. **Buka keuangan job** menuju tab pembayaran job; tombol kembali memulihkan filter.
**Ekspor CSV** mengekspor tab aktif sesuai filter dengan nilai desimal asli. Ekspor ringkasan
mempertahankan kolom buku pembantu yang sudah tersedia.

## Packing list masuk dan keluar

Buka **Job order → pilih job → Packing list**. Admin menyiapkan dokumen; direktur memutuskan
pengajuan finalisasi kepala/packing list keluar dan selisih penerimaan.

Tombol **Lihat**, nomor referensi, dan dokumen asal yang dipilih dari kepala packing list
membuka modal detail. Isi dapat digulir; tombol unduh, cetak, dan tindakan tetap tersedia
di bagian bawah. Tutup melalui **Tutup**, ikon silang, atau Escape.

- Saat membuat job, pilih jenis **SCMU sebagai pengirim** atau **SCMU sebagai penerima**.
  Daftar job dapat disaring berdasarkan jenis. Jenis dikunci setelah dokumen packing atau
  tahap angkutan dibuat. Konversi penawaran menjadi job juga menyediakan pilihan ini.
- **SCMU sebagai penerima:** pilih **Unggah packing list asal**, pilih file pengirim PDF/gambar
  maksimal 5 MB, lalu isi nomor/tanggal asal, pengirim, rute job dan ringkasan koli/berat/volume.
  File dapat dibuka sebagai acuan. Simpan dan ulangi untuk dokumen berikutnya. Dokumen asli
  beserta metadata disimpan sekaligus; kegagalan tidak meninggalkan file atau catatan baru.
- Pilih **Buat kepala packing list**, lalu centang packing list asal yang masuk kelompok
  pengiriman ini. Tidak ada dokumen yang dipilih otomatis. Satu job penerimaan memiliki satu
  kepala yang memuat banyak dokumen asal. Total koli, berat dan volume dihitung dari pilihan.
  Contoh: PL-A-001 10 koli + PL-A-002 15 koli + PL-A-003 5 koli menjadi satu kepala 30 koli.
- Barang belum tiba dapat dicatat PENDING. Buka masing-masing dokumen untuk mengisi hasil
  penerimaan, tanggal, petugas dan jumlah aktual. Selisih memerlukan status serta catatan.
  Admin memfinalisasi dokumen tanpa selisih. Dokumen berselisih diajukan kepada direktur.
  Setelah seluruh dokumen job tercakup dan selesai, ajukan kepala untuk difinalisasi direktur.
  Kepala final mengunci anggota dan unggahan baru. Draf kepala boleh dihapus tanpa menghapus
  packing list asal. Kepala dapat dicetak/simpan PDF; draf memiliki penanda verifikasi belum selesai.
- **SCMU sebagai pengirim:** pilih **Buat packing list keluar**, isi penerima dan rincian barang
  yang diberangkatkan. Tidak memerlukan kepala penerimaan atau gabungan seluruh packing list.
- Berat bersih/kotor adalah **total per baris**. Jika dimensi diisi, ketiga ukuran dalam cm berlaku
  untuk setiap koli berukuran sama: volume baris = panjang × lebar × tinggi × jumlah koli / 1.000.000.
  Jika dimensi kosong, volume dapat diisi manual. Server menghitung total dan menolak berat kotor
  yang lebih kecil dari berat bersih.
- Simpan sebagai draf untuk melanjutkan pengisian. Packing list keluar final dapat dicetak atau
  disimpan sebagai PDF A4 melalui dialog cetak browser, dengan logo SCMU, identitas pihak,
  rincian barang, total, referensi dan tanda tangan. Job penerimaan mencetak kepala gabungan
  serta mengunduh dokumen asal masing-masing; tidak menerbitkan ulang packing list SCMU.
- Finalisasi mengunci data dan memverifikasi daftar dokumen job yang terkait. Unggah/verifikasi
  umum tidak dapat melewati alur packing list. Draf dapat dihapus; catatan final tetap tersimpan.
  Penutupan job menolak catatan packing list yang masih draf. Perubahan bersamaan memeriksa
  versi data agar perubahan pengguna lain tidak tertimpa. Job yang hanya menerima tidak wajib
  memiliki armada/tahap angkutan; kepala final menyelesaikan penerimaan. Jika tahap angkutan
  dicatat, seluruh tahap tetap wajib selesai. Pemeriksaan keuangan dan operasional lain tetap berlaku.

Contoh **SCMU-JOB-TERIMA-002** memuat `KPL-SCMU-DEMO-GABUNG-001` dengan tiga packing list
pengirim Surabaya, total **30 koli, 3.600 kg dan 19,5 CBM**. **SCMU-JOB-ARMADA-001** memuat
`PL-SCMU-DEMO-001`, diterbitkan SCMU langsung. Pengelompokan tidak melakukan alokasi atau
pengurangan stok otomatis. Master pelanggan dan portal tetap tidak digunakan. Pengiriman
file ke pihak luar dilakukan manual setelah PDF disimpan.

## Demo persetujuan direktur

1. Login **Admin** (`operasional@scmu.local`) dan buka **SCMU-JOB-SETUJU-001**.
   Tersedia pengajuan contoh BBM Rp750.000 dan packing list keluar dari Admin.
2. Buka **Persetujuan direktur**. Admin dapat melihat ringkasan dan riwayat, tetapi tidak
   memiliki tombol keputusan. Pengajuan milik sendiri dapat ditarik dengan alasan.
3. Login **Direktur** (`admin@scmu.local`), buka menu yang sama, tekan **Lihat** untuk membuka modal detail, lalu **Periksa pengajuan**.
   Pilih disetujui, dikembalikan untuk revisi, atau ditolak. Pengembalian/penolakan wajib disertai catatan.
   Membatalkan formulir keputusan mengembalikan modal detail; keputusan berhasil menutup modal.
4. Pengajuan yang dikembalikan diperbaiki Admin pada data asal lalu diajukan kembali.
   Direktur tidak dapat memutuskan pengajuan yang dibuat akunnya sendiri.
5. Untuk pengeluaran, Admin mengajukan pembayaran atas biaya disetujui. Setelah direktur
   mengotorisasi, buka detail pengajuan dan pilih **Catat realisasi pembayaran**, isi waktu
   serta referensi bukti. Jumlah dan penerima mengikuti persetujuan; otorisasi hanya digunakan sekali.

Dokumen/transaksi historis dipertahankan tanpa mengubah status yang sudah final. Semua
pengeluaran baru memerlukan persetujuan karena batas nominal belum ditetapkan.
Transfer uang dan pengiriman file ke pihak luar tetap dilakukan manual. Batas unggahan lama
30 per jam dan 5 MB per file tetap berlaku.

## Pemeriksaan

```powershell
node scripts/test-internal-access.cjs
node scripts/test-director.cjs
node scripts/test-demo-indonesia.cjs
node scripts/smoke-demo.cjs
node scripts/workflow-demo.cjs
node scripts/jpt-workflow.cjs
node scripts/test-own-fleet.cjs
node scripts/test-packing.cjs
node scripts/test-modal-browser.mjs
node scripts/test-navigation-browser.mjs
node scripts/test-finance-browser.mjs
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
Tema aplikasi dan cetak memakai biru. Logo memakai gambar asli `logo scmu asli.jpeg`,
disimpan tanpa perubahan di `frontend/public/scmu-original.jpeg`. `scmu-logo.svg` memuat
gambar tersebut secara utuh dengan area tampilan yang mengurangi ruang kosong; ikon tab
`scmu-favicon.svg` memakai bagian lambangnya. Kedua SVG menyertakan gambar di dalam file
agar tetap tampil saat dokumen cetak diekspor tanpa koneksi.

## Menghentikan

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

Database tetap tersimpan. Periksa `.demo/backend.err.log`, `.demo/frontend.err.log` dan
http://localhost:5000/health bila ada masalah. Jika HTTP 429 muncul, ikuti waktu tunggu
di login. Kuota API umum 300 permintaan/menit; login membatasi 10 percobaan gagal/15 menit.
