# Hapus pengiriman dan Sampah

Pada **Pengiriman**, tekan **Hapus** di baris yang salah input atau duplikat. Modal menampilkan jumlah dokumen, kontainer, Packing List terhubung, bonrate, invoice, biaya/pendapatan, pembayaran, dan pengajuan direktur. Isi alasan, periksa keterkaitan, centang konfirmasi, lalu tekan **Pindahkan ke Sampah**.

Hapus pengiriman memindahkan seluruh catatan ke Sampah. Hapus lampiran hanya menghapus file pada satu pengiriman. Arsipkan digunakan untuk menyimpan pengiriman yang benar tetapi sudah tidak aktif. Ketiga tindakan ini berbeda.

## Pengiriman yang belum dapat dihapus

Penghapusan tertahan jika masih ada invoice aktif, biaya/pendapatan berstatus diajukan/disetujui, pembayaran tercatat, pengajuan direktur diajukan/disetujui, atau bonrate yang ditugaskan/diproses/selesai/dibayar. Catatan tagihan berstatus dibayar, job ditutup/dibatalkan, release barang dikonfirmasi, dan job lama yang dipakai beberapa B/L juga memerlukan pemeriksaan. Modal menjelaskan penyebab dan menyediakan tautan pemeriksaan serta pilihan Arsipkan. Invoice dibatalkan, biaya ditolak, serta bonrate draf/batal yang belum dibayar tetap dapat disimpan bersama catatan di Sampah.

Semua ketentuan diperiksa ulang dalam transaksi ketika admin menekan konfirmasi. Nomor versi mencegah penghapusan atau pemulihan menggunakan data lama.

## Pemulihan

Buka **Pengiriman > Sampah**. Daftar menampilkan nomor urut, B/L, kapal/voyage, tanggal dihapus, pengguna, alasan, serta Detail dan Pulihkan. Data di Sampah hanya dapat dibaca. Konfirmasikan **Pulihkan** untuk mengembalikan catatan yang sama beserta seluruh dokumen. Catatan yang semula diarsipkan kembali ke arsip; catatan aktif kembali ke daftar aktif.

Admin dan Super Admin dapat menghapus ke Sampah serta memulihkan. Penghapusan permanen dan pengosongan Sampah tidak disediakan. Nomor B/L langsung dilepas ketika pengiriman masuk Sampah. Alur **hapus > unggah ulang > buat pengiriman baru** tidak meminta pemulihan. Pemeriksaan nomor hanya mencakup pengiriman aktif dan arsip. Data lama tetap tersimpan di Sampah, terpisah dari pengiriman baru.

Jika nomor B/L lama sudah digunakan pengiriman pengganti, pemulihan ditahan dengan pesan yang menjelaskan benturan dan tautan ke pengiriman tersebut. Ubah nomor atau hapus pengiriman pengganti sebelum memulihkan data lama. Nomor diperiksa ulang dalam transaksi pemulihan; konfirmasi lama tidak dapat melewati pemeriksaan ini.

## Data dan cakupan

Status Sampah disimpan pada `SeaBill.registerData.trash`, termasuk waktu, pengguna, alasan, status arsip sebelumnya, dan jumlah keterkaitan. Kolom arsip juga mengunci jalur perubahan dokumen/operasional yang sudah ada. Saat dihapus, `registerIdentity` dilepas menjadi null; nomor dokumen `billNumber` tetap tersimpan. Pemulihan mengambil kembali identitas unik jika tersedia. Migrasi `20261030010000_release_trashed_bl_identity` melepas identitas pada data yang sebelumnya sudah berada di Sampah tanpa mengubah nomor, dokumen, atau riwayat. Jalankan `prisma migrate deploy` saat memperbarui instalasi; skrip start-demo menjalankannya otomatis. File fisik tidak dihapus atau dimasukkan ke antrean pembersihan. Riwayat `SHIPMENT_TRASHED` dan `SHIPMENT_RESTORED` mencatat kedua tindakan, termasuk alasan penghapusan setelah pemulihan.

Daftar aktif, arsip, gabungan aktif/arsip, ringkasan dasbor, pemilihan Packing List, hitungan master kapal/voyage, dan ekspor biasa mengecualikan Sampah. Dokumen dan rekap historis yang sudah dihasilkan tetap disimpan. Pengiriman di Sampah tidak dapat dipilih sebagai sumber rekap baru. Antrean unggahan memperlihatkan status Pengiriman di Sampah ketika disegarkan.

## Validasi

```powershell
cd backend
npm.cmd test
npm.cmd run test:documents
cd ..\frontend
npm.cmd test
cd ..
node scripts/test-shipment-trash.mjs
node scripts/test-reuse-trashed-bl.mjs
$env:SCMU_QA_WIDTH = '390'
node scripts/test-shipment-trash.mjs
node scripts/test-reuse-trashed-bl.mjs
Remove-Item Env:\SCMU_QA_WIDTH
```

Uji integrasi memerlukan demo terisolasi pada port 5000/5173 dan database demo 55432. Pengujian membuat dan membersihkan data sintetis miliknya; memeriksa alasan, ketergantungan, API hanya baca, nomor B/L, ekspor, riwayat, pemulihan, dan hash file asli. Data pengguna tidak dihapus oleh pengujian.
