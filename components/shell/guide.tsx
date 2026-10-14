"use client"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const steps: Array<[string, string]> = [
  ["Hubungkan", "Di Pengaturan, tempel Personal Access Token (scope repo; tambah workflow jika ZIP berisi .github/workflows). Repo privat ikut tampil."],
  ["Pilih tujuan", "Di Unggah, pilih repositori dan branch. Isi target folder di Pengaturan bila ingin ke subfolder (mis. assets/images)."],
  ["Masukkan sumber", "Seret file/folder atau ZIP. ZIP diekstrak di browser; sampah macOS/Windows dan folder pembungkus dibuang otomatis."],
  ["Tinjau", "Ketuk Pratinjau untuk melihat apa yang akan ditambah, diubah, atau dihapus — belum ada yang ditulis ke GitHub."],
  ["Luncurkan", "Semua perubahan masuk dalam SATU commit. Hanya file yang berubah yang dikirim; jika gagal di tengah jalan repo tidak berubah dan antrean tetap utuh."],
]

export function Guide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Panduan penggunaan" aria-label="Panduan penggunaan"><BookOpen className="h-[18px] w-[18px]" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cara memakai Naquth</DialogTitle>
          <DialogDescription>Dari ZIP ke GitHub dalam lima langkah.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-4">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ember text-xs font-bold text-primary-foreground">{i + 1}</span>
              <div><p className="text-sm font-bold">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>
            </li>
          ))}
        </ol>
        <p className="rounded-2xl border border-ember bg-primary/5 p-3 text-xs">
          <b>Privasi:</b> tidak ada server Naquth. Semua proses terjadi di browser Anda dan langsung ke <code className="font-mono">api.github.com</code>. Token hanya tersimpan di perangkat jika Anda mengaktifkan &quot;Ingat token&quot;.
        </p>
      </DialogContent>
    </Dialog>
  )
}
