# Finance V2 Frontend

Dokumentasi ini menjelaskan frontend `finance_v2` yang berjalan saat ini: teknologi yang dipakai, struktur folder, konfigurasi environment, halaman, alur UI, dan hubungan frontend dengan backend.

## Ringkasan Project

Frontend ini adalah aplikasi web finance/accounting berbasis React untuk mengelola:

- Login dan register user.
- Dashboard finance berbasis `tt_summary_v2`.
- Master data: kategori, sub kategori, akun, perusahaan, bank, rekening.
- Transaksi finance detail.
- Import data `tt_finance_details` dari sistem lama.
- Tutup buku fiscal year.
- Tools superuser: Summary Tools dan Reconciliation Tool.

Frontend tidak menghitung kebenaran nominal sendiri. Nominal dashboard dan laporan tetap bersumber dari backend, terutama dari collection `tt_summary_v2` yang dibentuk dari `tt_finance_details`.

## Teknologi

- React 18
- TypeScript
- Vite
- React Router DOM
- TanStack React Query
- Axios
- Tailwind CSS
- Radix UI / shadcn-style components
- Lucide React icons
- Recharts untuk grafik
- React Toastify dan Sonner untuk notifikasi
- CryptoJS untuk secure storage ringan di browser

## Struktur Folder Penting

```text
finance_v2/frontend
├── assets/
│   └── accounting character/
├── public/
├── src/
│   ├── api/
│   │   ├── axiosInstance.ts
│   │   ├── fiscal.ts
│   │   └── users.ts
│   ├── components/
│   │   ├── ui/
│   │   ├── login/
│   │   ├── MainLayout.tsx
│   │   ├── ProtectedRoute.tsx
│   │   └── Sidebar.tsx
│   ├── lib/
│   │   └── utils.ts
│   ├── pages/
│   │   ├── Auth/
│   │   ├── MasterData/
│   │   ├── Dashboard.tsx
│   │   ├── Transaksi.tsx
│   │   ├── TutupBuku.tsx
│   │   ├── SummaryTools.tsx
│   │   └── ReconciliationTool.tsx
│   ├── store/
│   │   └── useAppStore.ts
│   ├── utils/
│   │   ├── secureStorage.ts
│   │   └── webauthn.ts
│   ├── App.tsx
│   └── main.tsx
├── .env.example
├── .gitignore
├── package.json
├── tailwind.config.ts
└── vite.config.ts
```

## Environment

Template environment ada di `.env.example`.

```env
VITE_API_BASE_URL=http://localhost:5103/api
VITE_API_BASE_URL_ATTACHMENT=http://localhost:5103
VITE_APP_VERSION=2.0.0
```

Penjelasan:

- `VITE_API_BASE_URL`: base URL semua endpoint API backend.
- `VITE_API_BASE_URL_ATTACHMENT`: base URL untuk membuka file static upload, misalnya `/uploads/transaksi/file.jpg`.
- `VITE_APP_VERSION`: versi aplikasi yang bisa ditampilkan di UI.

File `.env` lokal tidak boleh masuk git. `.gitignore` sudah mengabaikan `.env*` dan tetap mengizinkan `.env.example`.

## Menjalankan Frontend

Install dependency:

```bash
npm install
```

Jalankan development server:

```bash
npm run dev
```

Default port:

```text
http://localhost:5174
```

Build production:

```bash
npm run build
```

Preview build:

```bash
npm run preview
```

## Integrasi API

Frontend memakai `axiosInstance` di `src/api/axiosInstance.ts`.

Fungsi utama:

- Menggunakan `VITE_API_BASE_URL`.
- Menambahkan token `Authorization: Bearer <token>`.
- Jika response `401` dan bukan endpoint login/register, token dihapus dan user diarahkan ke `/login`.

Token disimpan lewat `secureStorage`.

Catatan keamanan:

- `VITE_*` akan ikut masuk bundle frontend.
- Jangan menyimpan secret backend/API key penting di env frontend.
- Untuk keamanan session yang lebih kuat, arah jangka panjang adalah httpOnly cookie dari backend.

## Routing Halaman

Routing utama ada di `src/App.tsx`.

| Route | Halaman | Proteksi | Keterangan |
| --- | --- | --- | --- |
| `/` | redirect ke `/dashboard` | Ya | Landing internal aplikasi |
| `/login` | Login | Tidak | Login password dan security key |
| `/register` | Register | Tidak | Register user/security key |
| `/dashboard` | Dashboard | Ya | Ringkasan finance dari `tt_summary_v2` |
| `/master/kategori` | Master Kategori | Ya | CRUD kategori |
| `/master/subkategori` | Master Sub Kategori | Ya | CRUD sub kategori |
| `/master/akun` | Master Akun | Ya | CRUD akun |
| `/master/perusahaan` | Master Perusahaan | Ya | CRUD perusahaan |
| `/master/bank` | Master Bank | Ya | CRUD bank |
| `/master/rekening` | Master Rekening | Ya | CRUD rekening dan transfer saldo |
| `/transaksi` | Transaksi | Ya | Input, import, validasi, attachment |
| `/tutupbuku` | Tutup Buku | Ya | Lock fiscal year |
| `/summary-tools` | Summary Tools | Ya | Rebuild `tt_summary_v2`, menu superuser |
| `/reconciliation-tool` | Reconciliation Tool | Ya | Cek mismatch detail vs summary, menu superuser |
| `/users` | Users | Ya | Manajemen user |
| `/update-log` | Update Log | Ya | Changelog |
| `/public-dashboard` | Public Dashboard | Tidak | Dashboard publik |

Proteksi route dilakukan oleh `ProtectedRoute`.

## Layout dan Sidebar

Layout utama:

- `MainLayout.tsx`
- `Sidebar.tsx`

Sidebar memuat menu:

- Main: Dashboard
- Data: Master Data
- Operations: Transaksi, Tutup Buku
- Tools: Summary Tools, Reconciliation Tool
- Settings/User: Users, Update Log, Logout

Menu Tools hanya relevan untuk superuser. Backend tetap melakukan validasi role, jadi meskipun route frontend dibuka manual, endpoint penting tetap diproteksi.

## Halaman Login

File utama:

- `src/pages/Auth/Login.tsx`
- `src/components/login/LoginCharacter.tsx`
- `src/components/login/LoginCharacter.css`

Asset karakter diambil dari:

```text
assets/accounting character/icon.png
```

Login mendukung:

- Username/password.
- WebAuthn/security key.

## Halaman Dashboard

File utama:

```text
src/pages/Dashboard.tsx
```

Endpoint yang dipakai:

- `GET /api/fiscal/years`
- `GET /api/fiscal/active`
- `GET /api/dashboard/rekap-aggregate?tahun=2026&bulan=JAN`
- `GET /api/dashboard/pendapatan-harian?tahun=2026&bulan=JAN`
- `GET /api/master/rekening?all=true`

Sumber angka dashboard:

```text
tt_summary_v2
```

Dashboard tidak lagi bergantung pada `tt_finance`, `tt_finance_daily`, `th_finance`, atau `th_finance_daily`.

Filter dashboard:

- Tahun fiskal.
- Bulan/scope.
- Grouping chart.
- Toggle tampil/sembunyikan nominal.

## Master Data

Folder:

```text
src/pages/MasterData
```

Halaman:

- `Kategori.tsx`
- `SubKategori.tsx`
- `Akun.tsx`
- `Perusahaan.tsx`
- `Bank.tsx`
- `Rekening.tsx`

Pola UI yang dipakai:

- Header halaman.
- Filter card.
- Table card.
- Modal tambah/edit.
- Empty state.
- Pagination.

Style master kategori dijadikan acuan untuk halaman master lain:

- Clean card putih.
- Header table lembut.
- Input fokus warna primary.
- Modal tidak terlalu lebar.
- Tombol primary biru.

## Halaman Transaksi

File utama:

```text
src/pages/Transaksi.tsx
```

Fungsi utama:

- List transaksi detail.
- Filter berdasarkan tahun, bulan, perusahaan, kategori, sub kategori, akun, input by, jenis transaksi.
- Tambah transaksi.
- Upload attachment.
- Preview attachment.
- Validasi transaksi.
- Edit transaksi belum valid.
- Soft delete transaksi.
- Import `tt_finance_details` dari sistem lama.
- Export Excel.

Endpoint yang dipakai:

- `GET /api/transaksi/tt-finance-detail`
- `GET /api/transaksi`
- `POST /api/transaksi`
- `PUT /api/transaksi/:id`
- `DELETE /api/transaksi/:id`
- `POST /api/transaksi/:id/attachments`
- `DELETE /api/transaksi/:id/attachments/:filename`
- `POST /api/transaksi/validate-attachment`
- `PUT /api/transaksi/validator-notes`
- `POST /api/transaksi/import-details/batch`
- `GET /api/transaksi/export-excel`

Attachment URL diselesaikan oleh:

```text
src/lib/utils.ts -> resolveAttachmentUrl()
```

Contoh:

```text
VITE_API_BASE_URL_ATTACHMENT=http://localhost:5103
path=/uploads/transaksi/file.jpg
hasil=http://localhost:5103/uploads/transaksi/file.jpg
```

## Import `tt_finance_details`

Import berada di halaman transaksi.

Format file:

- JSON
- CSV

Alur UI import:

1. User memilih file export dari sistem lama.
2. Frontend membaca total dokumen.
3. Data dikirim batch ke backend.
4. Progress menampilkan jumlah dokumen yang sudah diproses.
5. Data sukses, skip, dan gagal ditampilkan.
6. Error detail ditampilkan per row agar bisa diaudit.

Validasi import dilakukan backend, bukan frontend.

Contoh error yang ditampilkan:

- Master kategori belum ada.
- Master sub kategori belum ada.
- Master akun belum ada.
- Master rekening belum ada.
- Rekening belum terhubung ke perusahaan.
- Dokumen sudah pernah diimport.

Data `status_deleted: true` tetap boleh masuk ke `tt_finance_details`, tetapi tidak masuk ke `tt_summary_v2`.

## Summary Tools

File:

```text
src/pages/SummaryTools.tsx
```

Endpoint:

```text
POST /api/summary-v2/rebuild
```

Fungsi:

- Rebuild total `tt_summary_v2` dari `tt_finance_details`.
- Menyamakan `posting_state` detail.
- Hanya boleh dipakai superuser.

## Reconciliation Tool

File:

```text
src/pages/ReconciliationTool.tsx
```

Endpoint:

```text
GET /api/summary-v2/reconciliation?limit=1000
```

Fungsi:

- Membandingkan expected total dari `tt_finance_details` dengan actual total di `tt_summary_v2`.
- Menampilkan mismatch.
- Dipakai untuk audit data.

Status mismatch:

- `MATCH`
- `MISSING_SUMMARY`
- `SUMMARY_GREATER_THAN_DETAIL`
- `DETAIL_GREATER_THAN_SUMMARY`
- `DUPLICATE_SUMMARY`

## Tutup Buku

File:

```text
src/pages/TutupBuku.tsx
```

Endpoint:

```text
POST /api/fiscal/close
```

Fungsi:

- Mengunci fiscal year tertentu.
- Mengubah active year ke tahun berikutnya.
- Setelah tahun ditutup, backend menolak input/edit/delete/validasi pada tahun fiskal tersebut.

## Fiscal Year

Frontend menyimpan fiscal year global lewat:

```text
src/store/useAppStore.ts
```

Pada awal aplikasi, `FiscalYearInitializer` memanggil:

```text
GET /api/fiscal/active
```

Lalu active year dari backend disimpan ke state global.

Aturan fiscal year:

- JAN sampai NOV masuk tahun kalender yang sama.
- DEC masuk tahun fiskal berikutnya.

Contoh:

```text
JAN-26 -> tahun_fiskal 2026
DEC-24 -> tahun_fiskal 2025
```

## Role dan Akses

Role yang digunakan di aplikasi:

- `superuser`
- `corsec`
- `finance`
- role lain sesuai data user

Fitur penting:

- Validasi transaksi: superuser/corsec di backend.
- Delete transaksi tervalidasi: superuser dan secret code backend.
- Rebuild summary: superuser.
- Reconciliation: superuser.
- Tutup buku: superuser/corsec.

Frontend menampilkan menu berdasarkan user, tetapi backend tetap menjadi penjaga utama.

## Build dan Deploy

Build:

```bash
npm run build
```

Hasil build:

```text
dist/
```

`dist/` tidak masuk git.

Env production sebaiknya disesuaikan:

```env
VITE_API_BASE_URL=https://domain-api.com/api
VITE_API_BASE_URL_ATTACHMENT=https://domain-api.com
VITE_APP_VERSION=2.0.0
```

## Catatan Maintenance

- Jangan hardcode base URL API di component.
- Gunakan `axiosInstance` untuk request API.
- Gunakan `resolveAttachmentUrl()` untuk URL attachment.
- Jangan simpan secret backend di env frontend.
- Jika menambah endpoint baru, dokumentasikan di README backend dan update service/frontend API.
- Jika menambah menu baru, pastikan role aksesnya jelas di frontend dan backend.
- Jangan menjadikan `tt_finance`/`tt_finance_daily` sebagai sumber dashboard baru.
- Dashboard finance harus tetap membaca summary engine v2.

