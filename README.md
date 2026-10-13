<p align="center"><img src="public/brand/logo-dark.png" alt="Naquth" width="320"></p>

# Naquth

Push **ZIP, folder, atau file** ke GitHub dalam **satu commit** — langsung dari browser, tanpa terminal, tanpa server.

## Kenapa cepat & tidak timeout

Tool serupa mengirim **2 request per file, berurutan, 1 commit per file**. Naquth memakai Git Data API:

1. Membaca tree repo (3 request) dan menghitung SHA Git tiap file lokal → **hanya file yang berubah** yang dikirim.
2. File **teks** ditanam langsung di request tree (0 request tambahan). File **biner** diunggah sebagai blob, **paralel** (6 sekaligus).
3. Tree dibuat berantai → **1 commit** → **1 update branch**. Gagal di tengah jalan = repo tidak berubah; aman diulang.
4. Tahan banting: timeout 30 dtk/request, retry + backoff, patuh `Retry-After`/rate-limit GitHub, layar dijaga tetap menyala selama proses.

ZIP 600 file teks ≈ **<10 request** (sebelumnya 600+).

## Fitur
- Seret & lepas file/folder, pilih folder, atau ZIP (diekstrak di browser; sampah `__MACOSX`, `.DS_Store`, `.git`, path `../` dibuang; folder pembungkus otomatis dibuang)
- **Pratinjau perubahan** sebelum push (baru / diubah / dihapus / sama)
- Target folder, template pesan commit (`{filename} {count} {date}`), mode **mirror** (hapus file lama, dibatasi ke target folder)
- **Penjelajah**: telusuri, buka, hapus file/folder (1 commit)
- **Repositori**: daftar publik **dan privat**, jadikan target, buat, hapus (wajib ketik nama)
- Mode terang/gelap, PWA (service worker berversi), responsif mobile

## Privasi & keamanan
- Tidak ada backend: browser → `api.github.com` langsung (dikunci oleh CSP `connect-src`).
- Token **default hanya di sessionStorage** (hilang saat tab ditutup). "Ingat token" opsional (disimpan tanpa enkripsi — jangan di perangkat bersama). Ekspor konfigurasi **tidak** menyertakan token.
- Scope token: `repo` (+ `workflow` bila menyentuh `.github/workflows`, + `delete_repo` untuk hapus repo). Fine-grained token per-repo lebih aman.

## Menjalankan
```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm test           # 30 tes engine (GitHub palsu in-memory)
npm run typecheck && npm run lint
```
Deploy: Vercel/Netlify/hosting Node apa pun. Header keamanan & CSP aktif di produksi (`next.config.mjs`).

### Uji end-to-end (opsional)
`e2e/` berisi skrip Playwright (Python) + GitHub palsu yang menjalankan seluruh alur UI di build produksi:
```bash
pip install playwright && playwright install chromium
npm run build && npm start -- -p 3100 &
python3 e2e/e2e.py
```

## Lisensi
Apache-2.0. Karya turunan dari GITHUB-UPLOADER oleh SANN404 FORUM GROUP — lihat `LICENSE` dan `NOTICE`.
