# Pengiriman berdasarkan perjalanan kapal

Daftar **Pengiriman** menggunakan satu induk untuk satu perjalanan kapal: **kapal + voyage + periode + pelabuhan tujuan**. Pelabuhan muat dapat berbeda di dalam perjalanan yang sama, misalnya Surabaya dan Makassar menuju Merauke. Satu kapal pada voyage atau periode berbeda mempunyai pengiriman berbeda.

## Alur admin

1. Buka **Pengiriman > Tambah pengiriman**. Pilih **Unggah B/L** untuk memulai dari satu atau banyak file, atau **Isi manual** untuk membuat draf sebelum dokumen diterima. Unggahan dibaca lokal; admin memeriksa nomor B/L, kapal, voyage, pihak, pelabuhan, dan kontainer yang berhasil dibaca.
2. Pada alur unggah langsung, tandai hasil pembacaan yang sudah diperiksa, lalu pilih **Periksa pengelompokan**. B/L pada kapal/voyage/tujuan yang sama dikelompokkan, pelabuhan muat boleh berbeda. Periksa periode: tahun penerbitan B/L hanya saran, bukan kepastian periode perjalanan. Pilih pengiriman baru atau pengiriman yang sudah tersedia. B/L yang sudah tersimpan tetap menggunakan pengiriman asalnya. Konfirmasi pengelompokan, lalu **Simpan pengiriman dan dokumen**. Belum ada pengiriman dibuat sebelum penyimpanan; kegagalan satu B/L tidak meninggalkan induk kosong untuk file tersebut. File lain yang berhasil tetap terlihat, dan file yang gagal dapat diperiksa kembali. Hasil menyediakan tautan ke setiap pengiriman. Untuk menambah dokumen kemudian, buka detail pengiriman, tab **Dokumen > Unggah B/L dan dokumen**. Data sumber yang sudah tersimpan tidak ditimpa, dan B/L dari pengiriman lain tidak dipindah diam-diam.
3. Tab **Ringkasan & B/L** menampilkan seluruh B/L. Klik nomor B/L untuk memeriksa identitas dan rincian sumbernya. **Tambah rincian / B/L manual** tersedia ketika dokumen belum diterima atau data perlu dimasukkan manual.
4. Tab **Dokumen** menggabungkan file semua B/L dan dokumen bersama. File fisik yang sama ditampilkan sekali dengan semua referensi B/L. Pilih beberapa dokumen untuk mengunduh ZIP. Dokumen bersama menerima semua format, maksimum 5 MB per file. File yang tidak didukung pratinjau tetap dapat diunduh.
5. Untuk PL mitra, berita acara, atau dokumen pendukung bersama, pilih file dan **Tautkan ke B/L** yang dicakup. Ini menambahkan referensi ke rincian B/L tanpa menggandakan file fisik. Tautan yang sudah ada tetap dipertahankan; koreksi/penghapusan sumber dilakukan dari B/L terkait agar riwayat tetap jelas.
6. Tab **Packing List & Rekap** menyediakan **Rekap seluruh B/L** untuk ringkasan kontainer dan segel, **Rekap rincian Packing List** untuk rincian penerima/barang yang telah dicatat, serta **Kelola Packing List** pada tiap B/L untuk sumber PL mitra, berita acara, atau input manual. Tidak ada pencocokan PL–B/L otomatis yang menghalangi pengumpulan sumber; admin memeriksanya manual.
7. Pratinjau rekap, lengkapi nama cetak, jumlah/satuan dan tanggal yang diketahui, lalu pilih PDF melalui dialog cetak browser atau unduh Excel. Keduanya memakai snapshot yang sama. Jumlah yang tidak diketahui tetap kosong, tidak dihitung dari berat. Rekap tersimpan pada B/L yang dipilih dan terlihat sekali di daftar dokumen induk.
8. Tab **Bonrate Sopir** mencatat penugasan untuk kontainer lintas B/L pada pengiriman yang sama. Bon lama per B/L tetap dapat dibuka dari tautannya. Nominal/pembayaran pada bon adalah catatan; biaya harus diajukan terpisah, tanpa membuat pembayaran otomatis.
9. Tab **Biaya** menggabungkan biaya lama per B/L dan biaya bersama. Pilih cakupan **Bersama / seluruh pengiriman** atau B/L tertentu. Biaya bersama dicatat satu kali dan memerlukan persetujuan direktur. Biaya bon yang sudah selesai hanya dapat diajukan sekali. Ringkasan biaya disetujui hanya menghitung nominal yang benar-benar disetujui.

## Direktur dan riwayat

Direktur memeriksa pengajuan biaya pada **Persetujuan Direktur** melalui alur yang sudah ada. Perubahan konteks material dapat memerlukan pengajuan ulang. Persetujuan biaya tidak mencairkan uang. **Riwayat** pada pengiriman menggabungkan perubahan induk dan job B/L yang terkait.

## Arsip dan Sampah

- **Arsipkan** membuat induk dan B/L di dalamnya hanya dapat dibaca. Mengaktifkan kembali induk mempertahankan status B/L yang sebelumnya sudah diarsipkan sendiri.
- **Hapus** memindahkan induk beserta rincian aktifnya ke Sampah, menyimpan dokumen dan riwayat, dan melepaskan identitas unik. Perjalanan dan nomor B/L yang sama dapat dibuat baru setelah data lama dihapus.
- Transaksi aktif, pengajuan biaya, pembayaran, atau bonrate yang sudah diproses dapat menghalangi penghapusan. Gunakan Arsipkan untuk menyimpan riwayat operasional tersebut.
- Pemulihan memeriksa konflik perjalanan dan nomor B/L terlebih dahulu. Jika sudah digunakan data baru, data lama tetap berada di Sampah sampai konfliknya diselesaikan; tidak digabung atau ditimpa otomatis.

## Migrasi data lama

Migrasi `20261030020000_shipping_journeys` menambahkan induk dan relasi `SeaBill.journeyId`. B/L asli, job, file, alokasi, dan transaksi tetap pada tempatnya. Identitas lengkap dikelompokkan berdasarkan kapal/voyage/periode/tujuan, bukan pelabuhan muat. Identitas yang belum lengkap dan data Sampah lama dipisahkan agar tidak tergabung secara keliru.

Jika master voyage belum tersedia, tahun dokumen dipakai sebagai periode pengelompokan awal dan ditandai **Periode perlu diperiksa**. Admin perlu memastikan periode perjalanan melalui **Ubah data**. Periode ini tidak otomatis mengubah tanggal keberangkatan/tiba dari sumber.

Kontainer fisik dengan nomor sama dihitung sekali dalam ringkasan induk; rincian sumber di setiap B/L tetap ada. Rekap dari B/L menyimpan baris sumber per B/L agar referensi tidak hilang. Daftar dokumen memakai file fisik sebagai dasar deduplikasi, sehingga satu rekap yang ditautkan ke empat B/L tampil sebagai satu file dengan empat referensi.

## Menjalankan dan memeriksa

Untuk memperbarui demo yang sudah berisi data, dari akar proyek:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -SkipSeed
```

Antarmuka: `http://localhost:5173`. API: `http://localhost:5000/health`. Jangan menjalankan seed untuk memperbarui instalasi yang berisi data operasional.

Pengujian unit: `cd backend; npm.cmd test` dan `npm.cmd run test:documents`; antarmuka: `cd frontend; npm.cmd test`. Pengujian integrasi demo sintetis dari akar proyek:

```powershell
node .\scripts\test-journeys.mjs
# Uji unggah langsung dari Tambah pengiriman:
node .\scripts\test-journey-upload.mjs
$env:SCMU_QA_WIDTH='390'
node .\scripts\test-journey-upload.mjs
# Tambahkan pengujian Chrome desktop dan ponsel:
$env:SCMU_QA_BROWSER='1'
node .\scripts\test-journeys.mjs
```

Pengujian integrasi membuat data dengan penanda unik dan membersihkan hanya data miliknya. Mencakup unggah B/L, 4 B/L/21 kontainer pada satu pengiriman, deduplikasi rekap, ZIP privat, tautan sumber bersama, bon lintas B/L, persetujuan biaya, arsip, Sampah, penggunaan ulang nomor, konflik pemulihan, serta pemisahan periode/tujuan. Pengujian browser memakai profil Chrome sementara yang terpisah dari profil pengguna.
