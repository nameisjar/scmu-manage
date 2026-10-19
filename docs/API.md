# SCMU — API Reference

Base URL: `http://localhost:5000/api`

All protected endpoints require: `Authorization: Bearer <JWT_TOKEN>`

## JPT workflow

Endpoint baru memakai nominal desimal berupa string pada data job. Satu job hanya
memakai satu mata uang. Invoice lama mempertahankan format nominal angka.

| Endpoint | Fungsi |
| --- | --- |
| `GET/POST /sales-quotations` | Daftar dan buat draf penawaran komersial |
| `GET/PUT /sales-quotations/:id` | Detail dan ubah draf beserta rincian harga |
| `POST /sales-quotations/:id/status` | `SENT`, `ACCEPTED`, atau `REJECTED` |
| `POST /sales-quotations/:id/revise` | Salin menjadi revisi draf baru |
| `POST /sales-quotations/:id/job` | Konversi penawaran diterima menjadi job, idempoten |
| `GET/POST /jobs`, `GET/PUT /jobs/:id` | Daftar, buat, detail, ubah job |
| `GET /jobs/finance` | Agregat per mata uang, piutang/utang, umur tagihan, peringatan |
| `POST /jobs/:id/shipments` | Buat tahap angkutan dengan `transportSource: INTERNAL/EXTERNAL` dan `mode` |
| `POST /jobs/:id/shipments/:shipmentId/empty-return` | Catat kontainer kosong dikembalikan |
| `POST /jobs/:id/charges`, `PUT /jobs/:id/charges/:chargeId` | Ajukan/ubah pendapatan atau biaya yang belum ditinjau |
| `POST /jobs/:id/charges/:chargeId/review` | Ditutup (403); gunakan `CHARGE_APPROVE` di antrean persetujuan |
| `POST /jobs/:id/documents` | Tambah daftar dokumen |
| `POST /jobs/:id/documents/:documentId/upload` | Unggah multipart field `file`, maksimal 5 MB |
| `POST /jobs/:id/documents/:documentId/verify` | Verifikasi unggahan |
| `GET /jobs/:id/documents/:documentId/file` | Unduh dokumen dengan autentikasi |
| `POST /jobs/:id/invoices` | Tagihkan pendapatan disetujui yang belum memiliki invoice; `taxAmount` opsional |
| `POST /jobs/:id/payments` | Pembayaran parsial `RECEIVABLE` + `invoiceId`, `PAYABLE` atau `INTERNAL_EXPENSE` + `chargeId`; `amount`, `reference` wajib |
| `POST /jobs/:id/operations`, `PUT /jobs/:id/operations/:operationId` | Register gudang, kepabeanan, klaim, asuransi |
| `POST /jobs/:id/close` | Ditutup (403); ajukan `JOB_CLOSE` setelah pemeriksaan operasional/keuangan terpenuhi |

Admin menyiapkan operasional dan pengajuan. Keputusan direktur hanya dapat dilakukan Super Admin
melalui `/approvals/:id/review`. Pengelolaan akun `/users` juga hanya Super Admin.
Master dan akun pelanggan dihapus; endpoint `/portal/*` mengembalikan 404.
Transaksi otomatis memakai identitas perusahaan SCMU; `customerId`/`shipperCompanyId`
merupakan nama field kompatibilitas dan hanya menerima ID perusahaan internal.
`GET /companies/internal` mengembalikan profil SCMU. Pembuatan perusahaan eksternal
hanya mendukung TRANSPORTER, BROKER dan CONSIGNEE.
Endpoint tracking dan POD pengiriman lama juga mendukung pengiriman yang terkait job.
Pembuatan invoice melalui pengiriman lama ditolak untuk pengiriman terkait job agar
penagihan tidak ganda. Semua perubahan job utama memiliki activity log.

Tahap `INTERNAL` hanya menerima `ROAD` dengan `vehicleId` dan `driverId` aktif milik SCMU,
tanpa `carrierId`. Tahap `EXTERNAL` memerlukan `carrierId` vendor aktif; kendaraan/pengemudi
darat opsional dan harus milik vendor tersebut. Moda SEA/AIR/RAIL tidak menerima kendaraan
atau pengemudi darat. Vendor dapat dipilih langsung tanpa RFQ. Aturan ini juga dipakai
oleh `POST/PUT /shipments`; perubahan penugasan tidak boleh bertentangan dengan biaya terkait.

Biaya `kind: COST` memiliki `costSource: INTERNAL/VENDOR` (bawaan VENDOR untuk kompatibilitas),
`costCategory: FUEL/TOLL/PARKING/DRIVER_ALLOWANCE/LOADING_UNLOADING/FREIGHT/OTHER`, serta
`shipmentId` opsional yang harus berasal dari job dan sesuai pelaksana/vendor tahap tersebut.
Biaya internal tidak menerima vendor; biaya VENDOR wajib memiliki vendor sebelum persetujuan.
Pendapatan mengabaikan atribut klasifikasi biaya.

`INTERNAL_EXPENSE` hanya membayar biaya internal yang disetujui dan mewajibkan `paidTo`.
`PAYABLE` hanya membayar tagihan vendor. `notes` opsional; kedua jenis pembayaran mendukung
metode CASH/BANK_TRANSFER/OTHER, pembayaran bertahap dan penanda `isAdvance`.
Saldo, keunikan referensi dan transaksi serializable mencegah pembayaran berlebih/ganda.
Penanda uang muka bukan modul kas bon dengan pengembalian sisa dana.

Keuangan job menambahkan `internalCost`, `vendorCost`, `internalExpensePaid`, dan
`internalOutstanding`. `approvedCost` dan laba mencakup kedua jenis biaya; `payable`
hanya saldo vendor. `GET /jobs/finance` memisahkan `payables` dan `internalExpenses`.
Penutupan job juga memerlukan `internalOutstanding` nol.

---

## Packing lists

Semua endpoint berikut memakai token Super Admin/Admin dan beroperasi pada satu job:

`POST /jobs` menerima `jobType: SENDER/RECEIVER` (default SENDER untuk kompatibilitas).
`GET /jobs?jobType=RECEIVER` menyaring job penerimaan. `PUT /jobs/:id` hanya mengizinkan
perubahan jenis sebelum ada packing list, kepala, atau tahap angkutan. Konversi penawaran
`POST /sales-quotations/:id/job` juga menerima `jobType`. Job RECEIVER memakai SCMU sebagai
penerima dan tidak otomatis mewajibkan POD terpisah; hasil penerimaan dicatat per dokumen asal.

| Endpoint | Fungsi |
| --- | --- |
| `GET/POST /jobs/:jobId/packing-lists` | Daftar dan buat draf dokumen asal INBOUND atau packing list keluar OUTBOUND |
| `GET/PUT /jobs/:jobId/packing-lists/:packingId` | Detail dan ubah draf; PUT memerlukan `version` |
| `POST /jobs/:jobId/packing-lists/:packingId/original` | Ganti/lengkapi lampiran draf INBOUND, multipart `file` + `version`, PDF/JPEG/PNG/WebP maksimal 5 MB |
| `POST /jobs/:jobId/packing-lists/:packingId/finalize` | Verifikasi penerimaan INBOUND tanpa selisih dengan `version`; OUTBOUND/selisih melalui persetujuan direktur |
| `DELETE /jobs/:jobId/packing-lists/:packingId` | Hapus draf dengan body `{ "version": 1 }` |
| `GET/POST /jobs/:jobId/packing-header` | Detail `{ data: header/null }` atau buat satu kepala gabungan pada job RECEIVER |
| `PUT /jobs/:jobId/packing-header` | Ubah draf kepala dan pilihan dokumen; memerlukan `version` |
| `POST /jobs/:jobId/packing-header/finalize` | Endpoint langsung ditutup (403); gunakan persetujuan `PACKING_HEADER_FINALIZE` |
| `DELETE /jobs/:jobId/packing-header` | Hapus draf kepala dengan `version`; file/dokumen asal dipertahankan |

`direction: INBOUND` hanya untuk job RECEIVER dan mendaftarkan satu packing list asal dengan `externalNumber`, `documentDate`,
`senderName`, `senderAddress`, `recipientAddress`, `originCity`, `destCity`, `packages`,
`netWeightKg`, `grossWeightKg`, `volumeCbm`, `reference`, dan `notes`. Penerima otomatis SCMU.
Pembuatan INBOUND **wajib multipart/form-data**: `file` berisi dokumen asli PDF/JPEG/PNG/WebP
maksimal 5 MB dan `data` berisi string JSON objek dengan field di atas (termasuk `direction`).
File dan metadata asal disimpan sekaligus; file dibersihkan bila validasi atau transaksi gagal.
Permintaan JSON INBOUND tanpa file ditolak. Draf lama tetap dapat dilengkapi lewat `/original`.
`recordNumber` baru memakai PL-ASAL, terpisah dari nomor dokumen pengirim dan nomor kepala.
Rute harus sesuai job penerimaan. Mengunggah dokumen tidak otomatis membuat kepala.
INBOUND tidak menerima rincian barang atau sumber lain. `receiptStatus` bernilai PENDING,
RECEIVED atau DISCREPANCY; dua status terakhir memerlukan `receivedAt`, `receivedBy`, dan
`actualPackages`. `actualWeightKg`/`actualVolumeCbm` opsional. Perbedaan nilai memerlukan
DISCREPANCY dan `discrepancyNotes`. Finalisasi memerlukan lampiran asli serta hasil penerimaan.

Kepala gabungan menerima `{ documentDate, reference?, notes?, packingListIds: [...] }`.
Admin memilih 1-200 packing list asal unik dari job yang sama; tidak ada pilihan otomatis.
Dokumen boleh masih menunggu barang saat kepala dibuat sebagai DRAFT. Satu job memiliki
satu kepala; satu dokumen hanya menjadi anggota kepala pada job tersebut. Ringkasan
`summary` dihitung dari anggota di server: jumlah dokumen, koli, berat bersih/kotor, CBM,
jumlah dokumen diterima/menunggu/selisih dan jumlah koli aktual yang sudah dikonfirmasi.
Perubahan dokumen asal menaikkan versi kepala agar perubahan bersamaan tidak tertimpa.
Finalisasi kepala mensyaratkan seluruh dokumen INBOUND pada job telah dipilih dan FINAL,
memiliki file asli, serta hasil penerimaan. Sesudah final, anggota dan unggahan baru dikunci.
Admin mengajukan kepala kepada direktur; persetujuan direktur yang melakukan finalisasi.
Kepala dapat dicetak/simpan PDF A4 lanskap; draf diberi penanda verifikasi belum selesai.
Data lama dipertahankan; migrasi mengelompokkan dokumen penerimaan lama tanpa menghapus file.

`direction: OUTBOUND` hanya untuk job SENDER, tetap menggunakan JSON dan dapat dibuat langsung dengan `documentDate`, `recipientName`,
`recipientAddress`, rute, referensi, catatan dan `items`. Pengirim/penerbit otomatis SCMU;
nomor PL-SCMU dibuat server. Rincian maksimal 200 baris berisi `description`, `marks`,
`quantity`, `unit`, `packages`, `netWeightKg`, `grossWeightKg` dan `volumeCbm`, atau tiga dimensi
`lengthCm`/`widthCm`/`heightCm`. Dimensi adalah ukuran per koli; berat adalah total per baris.
Dimensi lengkap menghitung volume secara otomatis dan mengabaikan volume manual. Total
header dihitung dari rincian, bukan dari nilai total yang dikirim klien. Finalisasi memerlukan
rincian, berat kotor positif dan alamat penerima. `sourceIds` opsional, unik, maksimal 50,
hanya menerima dokumen INBOUND final pada job yang sama untuk referensi data lama. Job baru
memisahkan kedua arah dan tidak memerlukan kepala untuk menerbitkan packing list SCMU.

Lampiran menggunakan penyimpanan dokumen job dan diunduh melalui endpoint dokumen yang
terautentikasi. Dokumen yang terikat packing list tidak bisa diunggah/diverifikasi lewat alur
umum. Finalisasi memperbarui status dokumen menjadi VERIFIED; packing list keluar dihasilkan
untuk cetak/PDF dari data final pada frontend, tanpa kewajiban mengunggah file hasil cetak.
Data profil SCMU disimpan sebagai snapshot dokumen. API memeriksa versi dan transaksi
serializable untuk mencegah perubahan/finalisasi bersamaan. Catatan final dan job tertutup
menolak perubahan. Pembuatan tidak mengubah transaksi keuangan atau master pihak eksternal.
Job penerimaan menjadi DELIVERED setelah kepala final dan semua tahap angkutan yang dicatat
selesai. Job yang hanya menerima barang tidak wajib memiliki tahap angkutan milik SCMU.
Penutupan tetap memeriksa dokumen, keuangan, gudang, klaim dan kontainer seperti sebelumnya.

## Persetujuan direktur

Semua pengajuan baru menggunakan antrean persetujuan; transaksi dan dokumen final historis
dipertahankan. Tidak ada batas nominal yang mengizinkan persetujuan biaya/pengeluaran otomatis.

| Endpoint | Akses dan fungsi |
| --- | --- |
| `GET /approvals?status=SUBMITTED&jobId=...` | Kedua peran; filter status/job/action opsional; ringkasan data yang diajukan dan pelaku keputusan |
| `POST /approvals` | Kedua peran dapat mengajukan `{ action, entityId, payload, note? }` |
| `POST /approvals/:id/review` | Super Admin saja; `{ decision: APPROVED/RETURNED/REJECTED, note? }`; catatan wajib untuk RETURNED/REJECTED |
| `POST /approvals/:id/withdraw` | Pengaju atau Super Admin; `{ note }`; pengajuan aktif atau otorisasi pembayaran yang belum direalisasikan |

Pengaju tidak boleh memutuskan pengajuannya sendiri. Jika direktur menyiapkan data,
Admin dapat memeriksa lalu mengajukannya; permintaan yang diajukan akun direktur sendiri
memerlukan direktur lain untuk memutuskan. Nama pengaju, pemeriksa, waktu dan catatan
tersimpan. Snapshot yang diajukan tidak ikut berubah saat data sumber diubah; persetujuan
ditolak bila sumber sudah berbeda. Tarik permintaan lama lalu ajukan data terbaru.
Keputusan dan penerapan tindakan berlangsung dalam transaksi yang sama, dengan pemeriksaan
konkurensi agar persetujuan tidak diterapkan dua kali.

| `action` | `entityId` / payload | Hasil setelah disetujui |
| --- | --- | --- |
| `SALES_QUOTATION_APPROVE` | ID penawaran | DRAFT menjadi APPROVED; Admin baru dapat mencatat SENT. Mengubah penawaran APPROVED mengembalikannya ke DRAFT |
| `CHARGE_APPROVE` | ID biaya/pendapatan; `{ actualAmount? }` | PROPOSED menjadi APPROVED dengan nilai yang diajukan. Penolakan menetapkan REJECTED |
| `VENDOR_AWARD` | ID quote vendor | Menetapkan vendor RFQ, mengunci hasil pemilihan |
| `TRANSPORT_BOOK` | ID job; field tahap angkutan EXTERNAL | Membuat tahap angkutan vendor dan checklist dokumen |
| `TRANSPORT_CHANGE` | ID shipment; field penugasan/tarif/jadwal/catatan atau `{ status: CANCELLED }` | Menerapkan perubahan setelah validasi pemilik armada/vendor dan biaya terkait |
| `PACKING_FINALIZE` | ID packing list OUTBOUND; `{ version }` | Mengunci packing list SCMU dan memverifikasi dokumen |
| `PACKING_EXCEPTION` | ID packing list INBOUND selisih; `{ version }` | Menyetujui hasil penerimaan dengan catatan selisih, lalu memfinalisasi catatan asal |
| `PACKING_HEADER_FINALIZE` | ID kepala; `{ version }` | Memfinalisasi kepala yang seluruh dokumen/penerimaannya selesai |
| `DOCUMENT_VERIFY` | ID dokumen packing list unggahan umum | Memverifikasi dokumen packing manual yang tidak terikat pembuat packing list |
| `INVOICE_ISSUE` | ID invoice | Menyetujui invoice draf; tagihan job baru masuk saldo keuangan setelah persetujuan |
| `PAYMENT_AUTHORIZE` | ID job; direction, chargeId, amount, reference, method, paidTo bila internal, isAdvance | Memberi izin pengeluaran; belum membuat `JobPayment` |
| `CLAIM_DECISION` | ID operasi CLAIM; `{ status: APPROVED/SETTLED/REJECTED, notes }` | Menerapkan keputusan klaim beserta penjelasan |
| `JOB_CLOSE` | ID job | Menutup job setelah seluruh pemeriksaan dokumen/operasional/keuangan dan pengajuan lain selesai |
| `LEGACY_INVOICE_SETTLE` | ID invoice lama tanpa job; `{ paidDate? }` | Konfirmasi pembayaran invoice lama |

`POST /jobs/:id/payments` tetap dapat mencatat RECEIVABLE sebagai pekerjaan Admin.
Untuk PAYABLE/INTERNAL_EXPENSE wajib menyertakan `approvalId` dari PAYMENT_AUTHORIZE yang
APPROVED dan belum digunakan. Arah, biaya, jumlah, referensi, metode, penerima dan status
uang muka harus sama dengan otorisasi. Sertakan `paidAt` dan `notes` sebagai referensi bukti
realisasi. Saldo dan referensi diperiksa lagi; satu otorisasi hanya berlaku untuk satu realisasi.
Persetujuan tidak melakukan transfer bank. Otorisasi yang belum digunakan dapat ditarik
dengan alasan; riwayat keputusan tetap tersimpan.

Invoice job dibuat PENDING. `PUT /jobs/:id/invoices/:invoiceId` mengubah pajak, jatuh tempo
dan catatan draf. Admin tidak dapat memposting penerimaan atas invoice yang belum disetujui.
Penerimaan normal, tracking, POD, gudang, dokumen angkutan biasa dan penugasan armada internal
tetap dapat dikerjakan Admin. Selisih penerimaan dan keputusan akhir klaim memerlukan direktur.
Unggahan tetap dibatasi 30 per jam dan 5 MB per file sesuai konfigurasi sebelumnya.

Endpoint lama `/jobs/:id/close`, `/jobs/:id/charges/:chargeId/review`, award RFQ dan finalisasi
dokumen yang dikendalikan direktur menolak keputusan langsung (403), termasuk dari Super Admin.
Pengiriman vendor baru dari `/shipments` juga ditolak; gunakan job dan TRANSPORT_BOOK.
Mengganti vendor/moda/sumber angkutan vendor, mengubah tarif, atau membatalkan angkutan vendor
melalui PUT shipment memerlukan TRANSPORT_CHANGE. Perubahan data yang sudah final tetap dikunci.

## Authentication

### POST `/auth/login`
**Body:** `{ email, password }`  
**Response:** `{ token, user }`

### GET `/auth/me`
Returns the currently authenticated user.

### POST `/auth/change-password`
**Body:** `{ currentPassword, newPassword }`

---

## Users

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/users` | List users (paginated) | SUPER_ADMIN, ADMIN |
| POST | `/users` | Create user | SUPER_ADMIN, ADMIN |
| PUT | `/users/:id` | Update user | SUPER_ADMIN, ADMIN |
| DELETE | `/users/:id` | Deactivate user | SUPER_ADMIN |

**Query params (GET):** `page`, `limit`, `search`, `role`

---

## Companies

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/companies` | List companies | All |
| GET | `/companies/:id` | Company details | All |
| POST | `/companies` | Create company | ADMIN+ |
| PUT | `/companies/:id` | Update company | ADMIN+ |
| DELETE | `/companies/:id` | Deactivate company | SUPER_ADMIN, ADMIN |

**Query params (GET):** `page`, `limit`, `search`, `type` (SHIPPER|TRANSPORTER|BROKER|CONSIGNEE|BOTH)

---

## RFQ (Indenting)

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/rfq` | List RFQs | All |
| GET | `/rfq/:id` | RFQ detail with quotes | All |
| POST | `/rfq` | Create RFQ | SUPER_ADMIN, ADMIN |
| PUT | `/rfq/:id` | Update RFQ | SUPER_ADMIN, ADMIN |
| DELETE | `/rfq/:id` | Cancel RFQ | SUPER_ADMIN, ADMIN |
| POST | `/rfq/:id/quote` | Submit quote | SUPER_ADMIN, ADMIN |
| POST | `/rfq/:id/award/:quoteId` | Direct award disabled (403); submit `VENDOR_AWARD` through approvals | SUPER_ADMIN, ADMIN |

**Create RFQ body:**
```json
{
  "title": "Pengiriman Surabaya ke Merauke (Demo)",
  "shipperCompanyId": "uuid",
  "originCity": "Surabaya",
  "originState": "Jawa Timur",
  "destCity": "Merauke",
  "destState": "Papua Selatan",
  "vehicleType": "TRUCK",
  "goodsTypeId": "uuid",
  "quantity": 2,
  "weight": 10.5,
  "loadingDate": "2026-11-01T06:00:00Z",
  "currency": "IDR",
  "basePrice": 15000000
}
```

**Record vendor quote (by Admin) body:**
```json
{ "transporterId": "vendor-uuid", "amount": 14000000, "validUntil": "2026-10-31T18:00:00Z", "notes": "Harga simulasi demo dalam rupiah" }
```

---

## Shipments

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/shipments` | List shipments | All |
| GET | `/shipments/:id` | Shipment detail | All |
| POST | `/shipments` | Create shipment | SUPER_ADMIN, ADMIN |
| PUT | `/shipments/:id` | Update shipment | SUPER_ADMIN, ADMIN |
| POST | `/shipments/:id/tracking` | Add tracking event | All |
| POST | `/shipments/:id/pod` | Upload POD (multipart) | All |

**Tracking Event Types:** `DEPARTED`, `REACHED_CHECKPOINT`, `HALTED`, `RESUMED`, `REACHED_DESTINATION`, `DELIVERED`

**Add Tracking body:**
```json
{
  "eventType": "REACHED_CHECKPOINT",
  "location": "Gudang Demo Merauke",
  "city": "Merauke",
  "state": "Papua Selatan",
  "notes": "Pembaruan pengiriman contoh di tujuan"
}
```

**POD Upload:** `multipart/form-data` with field `podImage` (file), `signedBy`, `notes`

---

## Fleet

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/fleet` | List vehicles | All |
| GET | `/fleet/:id` | Vehicle detail | All |
| POST | `/fleet` | Add vehicle | SUPER_ADMIN, ADMIN |
| PUT | `/fleet/:id` | Update vehicle | SUPER_ADMIN, ADMIN |
| DELETE | `/fleet/:id` | Deactivate | SUPER_ADMIN, ADMIN |

**Vehicle Types:** `TRUCK`, `TRAILER`, `CONTAINER`, `TANKER`, `REFRIGERATED`, `FLATBED`, `MINI_TRUCK`, `TEMPO`

---

## Drivers

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/drivers` | List drivers | All |
| GET | `/drivers/:id` | Driver detail | All |
| POST | `/drivers` | Add driver | SUPER_ADMIN, ADMIN |
| PUT | `/drivers/:id` | Update driver | SUPER_ADMIN, ADMIN |
| DELETE | `/drivers/:id` | Deactivate | SUPER_ADMIN, ADMIN |

---

## Invoices

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/invoices` | List invoices | All |
| POST | `/invoices` | Create invoice | SUPER_ADMIN, ADMIN |
| PUT | `/invoices/:id` | Update status | SUPER_ADMIN, ADMIN |

**Invoice Statuses:** `PENDING` → `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` / `DISPUTED` → `PAID`

---

## Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/dashboard` | Summary stats + recent shipments |
| GET | `/analytics/transporter-performance` | Win rates per transporter |
| GET | `/analytics/route-analysis` | Trip counts + avg freight per route |

---

## Goods & Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/goods` | List goods types |
| POST | `/goods` | Create goods type |
| GET | `/routes` | List freight routes |
| POST | `/routes` | Create route |
| PUT | `/routes/:id` | Update route |

---

## WebSocket (Real-time Tracking)

Connect to: `ws://localhost:5000`

```javascript
import { io } from 'socket.io-client';
const socket = io('http://localhost:5000');

// Subscribe to shipment updates
socket.emit('join_shipment', shipmentId);
socket.on('tracking_update', (event) => {
  console.log('New tracking event:', event);
});
```

---

## Pagination

All list endpoints support:
- `page` (default: 1)
- `limit` (default: 20)

Response format:
```json
{ "data": [...], "total": 100, "page": 1, "limit": 20 }
```

---

## Error Responses

```json
{ "message": "Description of error" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (insufficient role) |
| 404 | Not found |
| 409 | Conflict (duplicate record) |
| 500 | Internal server error |

SCMU
