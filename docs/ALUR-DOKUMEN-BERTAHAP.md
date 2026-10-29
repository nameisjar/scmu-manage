# Pengiriman dan pemeriksaan manual admin

Pengiriman dapat dibuat tanpa nomor atau file B/L. Simpan informasi yang sudah diketahui; B/L, Packing List, berita acara, bonrate, dan dokumen lainnya dapat menyusul pada pengiriman yang sama.

## Urutan kerja

1. Buat pengiriman. Unggah dokumen sesuai urutan kedatangannya.
2. Setelah PL mitra diunggah, modal Ringkasan Packing List Mitra langsung terbuka. Periksa atau koreksi ringkasan per kontainer/segel, penerima, jumlah, satuan, dan catatan, lalu cetak PDF atau unduh Excel. Label keluaran: **Berdasarkan Packing List mitra**. Format yang belum terbaca otomatis dapat diringkas singkat secara manual sambil melihat file asli.
3. Untuk PL internal atau lembar pemeriksaan lapangan, buka **Packing List & Rekap > Kelola Packing List**. Pilih sumber PL mitra, Berita Acara, atau Input manual. Pilih rincian yang memang termasuk pengiriman ini pada saat impor; koreksi atau hapus kelompok yang tidak diperlukan pada editor sumber.
4. Periksa sumber, simpan rincian sebagai diperiksa, pilih bentuk cetak, lalu periksa pratinjau. PL internal, Kepala PL, dan rekap dapat dibuat tanpa tahap pencocokan B/L. Untuk menggabungkan beberapa pengiriman, pilihan harus berada pada kapal/periode voyage yang sama agar rekap tetap jelas.
5. Cetak melalui **Cetak / Simpan PDF**, atau unduh Excel. B/L tidak menjadi prasyarat PL. Draf identitas B/L tanpa rincian barang tetap tersedia sebagai cetakan awal dan tidak dianggap PL lengkap.
6. Ketika B/L diterima, unggah ke pengiriman yang sama. Bila memakai pembacaan B/L, admin memeriksa hasilnya sebelum menyimpan. File yang sudah tersimpan dapat dibaca kembali tanpa unggah ganda.
7. Admin membuka file asli dan memeriksa kesesuaian secara manual. Bila ada kesalahan, perbaiki data sumber yang salah atau tambahkan catatan klarifikasi. Tidak ada penilaian otomatis cocok/selisih atau tombol konfirmasi pencocokan.

## Data dan status

B/L dan PL menyimpan identitas masing-masing. Kontainer, segel, penerima, dan jumlah pada PL mengikuti sumber PL. Mengubah B/L tidak menimpa rincian PL atau hasil aktual. Mengubah rincian PL membuat keluaran dan pemeriksaan lapangan yang bergantung pada rincian tersebut perlu diperiksa kembali; versi lama tetap ada di lampiran/riwayat.

Status ringkasan pengiriman memisahkan **Dokumen utama**, **Rincian Packing List**, dan **Pekerjaan lapangan**. Kelengkapan dokumen mengikuti aturan mitra, tetapi tidak mengunci pencetakan PL. Status rincian diperiksa menyatakan admin telah memeriksa sumber, bukan sertifikasi bahwa PL sama dengan B/L. Status pekerjaan lapangan berasal dari pemeriksaan barang dan bon aktif.

Jumlah kosong tetap belum diketahui dan nol harus dinyatakan. Satuan berbeda tidak dijumlahkan. Jumlah aktual, rusak, dan selisih pemeriksaan fisik tetap dicatat terpisah dari jumlah pada dokumen. Riwayat menyimpan admin, waktu, dan perubahan. Catatan pencocokan lama dipertahankan sebagai data historis dan tidak lagi mengatur pilihan muatan atau pencetakan. URL lama `?tab=matching` membuka Dokumen; endpoint pencocokan telah dihapus.

## Bonrate dan biaya

Bonrate sopir tetap dicatat pada pengiriman. Bon selesai yang memiliki nominal dapat diajukan sekali sebagai biaya kepada direktur. Tidak ada biaya atau pembayaran yang dibuat otomatis ketika mengunggah atau memeriksa dokumen.

## Verifikasi

Jalankan `npm.cmd test` dan `npm.cmd run test:documents` pada backend, serta `npm.cmd test` pada frontend. Skrip `node scripts/test-deferred-shipment.mjs` menguji alur PL sebelum B/L, B/L yang berbeda dan menyusul, PDF/Excel, sumber serta aktual yang tetap terpisah, dan URL lama pada browser desktop/ponsel. Skrip `node scripts/test-partner-summary-browser.mjs` memeriksa ringkasan langsung setelah unggah. Data uji sintetis dibersihkan sesudah pengujian.
