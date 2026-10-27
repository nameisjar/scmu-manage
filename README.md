# SCMU Management System

<img src="frontend/public/scmu-logo.svg" width="96" height="96" alt="Logo SCMU" />

Sistem manajemen logistik SCMU berbasis React, Express, Prisma, dan PostgreSQL.

Panduan kapal/voyage, unggah B/L dengan pembacaan lokal, dan rekap Packing List internal: [panduan operasional](docs/VESSELS-BL-IMPORT.md).

Antarmuka mendukung **Bahasa Indonesia dan English**. Gunakan pilihan **Bahasa / Language**
di halaman login, sidebar, atau Pengaturan. Pilihan bahasa tersimpan di perangkat dan
berlaku untuk formulir, status, grafik, ekspor CSV, dan cetak invoice. Bahasa bawaan: Indonesia.

## Demo lokal (Windows)

Prasyarat: Node.js 22.13+ pada seri 22 (atau Node.js 24+) dan PostgreSQL 14+ dengan `pg_ctl`, `initdb`, dan `psql` di PATH.
Jalankan dari folder proyek:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -SkipSeed
```

Jika PostgreSQL belum ada di PATH, tambahkan `-PostgresBin "C:\Program Files\PostgreSQL\14\bin"`.
Script memasang dependensi jika diperlukan, membuat database terpisah di `.demo/postgres`
pada port **55432**, menjalankan migrasi tanpa seed, membangun frontend, serta menjalankan
kedua layanan di latar belakang. File `.env` yang sudah ada tetap digunakan untuk setup manual;
script demo memasok konfigurasi proses sendiri. Database demo hanya menerima koneksi loopback.

- Aplikasi: **http://localhost:5173**
- API: http://localhost:5000/health
- Direktur (Super Admin): `admin@scmu.local` / `Admin@1234`
- Admin operasional: `operasional@scmu.local` / `Ops@1234`

Email `@scmu.local` adalah akun contoh lokal. Sistem hanya dapat diakses Super Admin dan Admin.
Alur aktif berfokus pada satu Pengiriman terintegrasi, unggah dokumen, pencarian,
ekspor Excel, arsip, riwayat perubahan, dan pengelolaan pengguna internal. Gunakan `-SkipSeed`
agar data yang sudah ada tidak ditambah ulang. Audit lengkap tersedia di
[docs/REGISTER-AUDIT.md](docs/REGISTER-AUDIT.md).

Untuk menghentikan layanan tanpa menghapus data:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

## ✨ Features

| Modul | Kemampuan |
| --- | --- |
| Dashboard register | Jumlah register, periode, kapal/voyage, dokumen belum tersedia, dan data terbaru |
| Pengiriman | Satu form dan satu record untuk seluruh kolom buku kiri–kanan; pencarian, filter, sorting, pagination, edit, arsip dan riwayat |
| Dokumen pengiriman | B/L, Packing List opsional, dokumen pendukung, pratinjau modal, unduhan berotorisasi dan histori lampiran |
| Ekspor Excel | XLSX seluruh hasil filter atau seluruh register, tipe data terjaga dan tanpa duplikasi relasi |
| Pengguna | Super Admin mengelola akun Super Admin/Admin; Admin mengelola register |
| Bahasa | Antarmuka Bahasa Indonesia dan Inggris |

Nominal pada buku disimpan sebagai nilai netral dan tidak digunakan sebagai pendapatan, biaya,
invoice, pembayaran, utang, piutang, laba, atau KPI keuangan sampai artinya dikonfirmasi SCMU.

---

## 🏗️ Architecture

```
scmu/
├── backend/          # Node.js + Express + Prisma API
├── frontend/         # React + Vite + Tailwind SPA
├── docs/             # Architecture & API documentation
├── docker-compose.yml
└── .env.example
```

**Tech Stack:**
- **Backend**: Node.js 22.13+/24+, Express.js, Prisma ORM, PostgreSQL
- **Frontend**: React 18, Vite, Tailwind CSS, React Router v6, Recharts
- **Auth**: JWT + bcrypt
- **Infra**: Docker, Docker Compose, Nginx (reverse proxy)

---

## 🚀 Quick Start (Docker — Recommended)

### Prerequisites
- Docker 24+
- Docker Compose v2+

### 1. Clone the repository
```bash
# Masuk ke folder proyek SCMU yang sudah diunduh
cd "scmu managemen system"
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your settings (DB password, JWT secret, etc.)
nano .env
```

### 3. Launch all services
```bash
docker compose up -d
```

### 4. Run database migrations & seed
```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend node prisma/seed.js
```

### 5. Access the app
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Default login**: `admin@scmu.local` / `Admin@1234`

---

## 🛠️ Manual Setup (Development)

### Prerequisites
- Node.js 22.13+ pada seri 22, atau Node.js 24+
- PostgreSQL 15+
- npm or yarn

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials
npm install
npx prisma migrate dev
node prisma/seed.js
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:5000`.

Panduan [impor Excel mitra dan pembuatan Kepala Packing List SCMU](docs/PACKING-IMPORT.md) mencakup alur pratinjau, pemeriksaan manual, penggabungan B/L, serta unduh Excel/cetak PDF.

Panduan [penghapusan lampiran pengiriman](docs/SHIPMENT-DOCUMENT-DELETION.md) menjelaskan penghapusan file salah unggah, dokumen bersama, riwayat, dan migrasi antrean pembersihan berkas.

## 🔐 Default Roles

| Role | Permissions |
|------|-------------|
| `SUPER_ADMIN` | Full access to all modules |
| `ADMIN` | All operations except user management |

---
