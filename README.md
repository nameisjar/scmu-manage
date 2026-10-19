# SCMU Management System

<img src="frontend/public/scmu-logo.svg" width="96" height="96" alt="Logo SCMU" />

Sistem manajemen logistik SCMU berbasis React, Express, Prisma, dan PostgreSQL.

Antarmuka mendukung **Bahasa Indonesia dan English**. Gunakan pilihan **Bahasa / Language**
di halaman login, sidebar, atau Pengaturan. Pilihan bahasa tersimpan di perangkat dan
berlaku untuk formulir, status, grafik, ekspor CSV, dan cetak invoice. Bahasa bawaan: Indonesia.

## Demo lokal (Windows)

Prasyarat: Node.js 18+ dan PostgreSQL 14+ dengan `pg_ctl`, `initdb`, dan `psql` di PATH.
Jalankan dari folder proyek:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1
```

Jika PostgreSQL belum ada di PATH, tambahkan `-PostgresBin "C:\Program Files\PostgreSQL\14\bin"`.
Script memasang dependensi jika diperlukan, membuat database terpisah di `.demo/postgres`
pada port **55432**, menjalankan migrasi dan seed, membangun frontend, serta menjalankan
kedua layanan di latar belakang. File `.env` yang sudah ada tetap digunakan untuk setup manual;
script demo memasok konfigurasi proses sendiri. Database demo hanya menerima koneksi loopback.

- Aplikasi: **http://localhost:5173**
- API: http://localhost:5000/health
- Admin: `admin@scmu.local` / `Admin@1234`
- Admin operasional: `operasional@scmu.local` / `Ops@1234`

Email `@scmu.local` adalah akun contoh lokal. Seed dapat dijalankan ulang tanpa menggandakan
data atau mereset password akun yang sudah ada. Dataset baru memuat job JPT Surabaya–Merauke
dengan 3 tahap darat–laut–darat, penawaran komersial, biaya vendor, dokumen wajib,
invoice dan pembayaran parsial dalam rupiah. Seluruh contoh bawaan menggunakan rute Indonesia dan IDR.

Alur demo internal JPT: Admin → penawaran jual → job order → tahapan angkutan →
dokumen/POD → invoice → penerimaan pembayaran dan pelunasan vendor → tutup job.
Sistem hanya dapat diakses Super Admin dan Admin. Master/akun/portal pelanggan dihapus; transaksi dipertahankan atas nama SCMU.
Panduan rinci tersedia di [docs/DEMO.md](docs/DEMO.md).

Untuk menghentikan layanan tanpa menghapus data:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

## ✨ Features

| Modul | Kemampuan |
| --- | --- |
| Penawaran komersial | Draf/revisi, harga jual/beli, konfirmasi oleh Admin, cetak, konversi menjadi job |
| Job order | Satu pekerjaan dengan beberapa tahap darat, laut, udara atau kereta |
| Operasional | Tracking manual, surat jalan, nomor booking/BL/AWB, kontainer dan pengembalian kosong |
| Biaya dan laba | Pengajuan biaya vendor, persetujuan nilai aktual, estimasi dan laba tertagih |
| Dokumen/POD | Daftar wajib, unggah, verifikasi, akses internal |
| Keuangan | Invoice per job, pajak berupa nilai input, pembayaran parsial, uang muka, piutang/utang dan umur tagihan |
| Penanganan | Register gudang masuk/keluar, kepabeanan, klaim, asuransi |
| Modul transportasi | RFQ vendor, armada, pengemudi, perusahaan dan rute |
| Laporan | Dashboard, ketepatan waktu dari data aktual, laporan per mata uang, CSV dan cetak |
| Pengguna | Super Admin untuk pengelolaan akun; Admin untuk operasional |

Integrasi GPS, carrier, kepabeanan, bank dan pajak elektronik belum terhubung.
Register operasional dan buku pembantu job tersedia untuk demo; bukan buku besar akuntansi.

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
- **Backend**: Node.js 18, Express.js, Prisma ORM, PostgreSQL 15, Socket.io
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
- Node.js 18+
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

## 🔐 Default Roles

| Role | Permissions |
|------|-------------|
| `SUPER_ADMIN` | Full access to all modules |
| `ADMIN` | All operations except user management |

---
