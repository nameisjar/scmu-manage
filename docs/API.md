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
| `POST /jobs/:id/charges/:chargeId/review` | Setujui nilai aktual atau tolak |
| `POST /jobs/:id/documents` | Tambah daftar dokumen |
| `POST /jobs/:id/documents/:documentId/upload` | Unggah multipart field `file`, maksimal 5 MB |
| `POST /jobs/:id/documents/:documentId/verify` | Verifikasi unggahan |
| `GET /jobs/:id/documents/:documentId/file` | Unduh dokumen dengan autentikasi |
| `POST /jobs/:id/invoices` | Tagihkan pendapatan disetujui yang belum memiliki invoice; `taxAmount` opsional |
| `POST /jobs/:id/payments` | Pembayaran parsial `RECEIVABLE` + `invoiceId`, `PAYABLE` atau `INTERNAL_EXPENSE` + `chargeId`; `amount`, `reference` wajib |
| `POST /jobs/:id/operations`, `PUT /jobs/:id/operations/:operationId` | Register gudang, kepabeanan, klaim, asuransi |
| `POST /jobs/:id/close` | Tutup setelah seluruh pemeriksaan operasional/keuangan terpenuhi |

Super Admin dan Admin menjalankan semua operasional. Pengelolaan akun `/users` hanya Super Admin.
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
| POST | `/rfq/:id/award/:quoteId` | Award a quote | SUPER_ADMIN, ADMIN |

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
