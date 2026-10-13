"use client"

import dynamic from "next/dynamic"
import { Uploader } from "@/components/dashboard/uploader"
import { SettingsPanel } from "@/components/dashboard/settings-panel"
import { Explorer } from "@/components/dashboard/explorer"
import { Repositories } from "@/components/dashboard/repositories"
import { ThemeToggle } from "@/components/theme-toggle"
import { Logo } from "@/components/brand/logo"
import { FolderGit2, Settings, UploadCloud, BookMarked, BookOpen } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

// recharts ±100 KB: dimuat hanya di browser & setelah halaman interaktif
const UploadHistoryChart = dynamic(
  () => import("@/components/dashboard/upload-history-chart").then((m) => m.UploadHistoryChart),
  { ssr: false, loading: () => null }
)

const steps: Array<[string, string]> = [
  ["1. Pengaturan", "Buka tab Pengaturan, tempel Personal Access Token (scope `repo`; tambah `workflow` jika ZIP berisi .github/workflows), lalu pilih repositori dan branch. Repo privat ikut tampil."],
  ["2. Target folder (opsional)", "Isi mis. assets/images untuk mengunggah ke subfolder. Kosongkan untuk root repo."],
  ["3. Unggah", "Di tab Unggah: seret file/folder, pilih folder, atau pilih ZIP (diekstrak di browser). Ketuk Pratinjau untuk melihat apa yang akan berubah, lalu Unggah."],
  ["4. Satu commit", "Semua perubahan masuk dalam SATU commit. Hanya file yang benar-benar berubah yang dikirim; kalau gagal di tengah jalan, repo tidak berubah dan antrean Anda tetap utuh."],
  ["5. Kelola", "Tab Penjelajah: telusuri, buka, dan hapus file/folder (satu commit). Tab Repositori: lihat, pilih, buat, dan hapus repositori."],
]

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo height={28} />
          <div className="flex items-center gap-1">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="Panduan penggunaan" aria-label="Panduan penggunaan"><BookOpen className="h-5 w-5" /></Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Cara memakai Naquth</DialogTitle>
                  <DialogDescription>Dari ZIP ke GitHub dalam beberapa ketukan.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2 text-sm text-muted-foreground">
                  {steps.map(([t, d]) => (
                    <div key={t} className="space-y-1"><h3 className="font-bold text-foreground">{t}</h3><p>{d}</p></div>
                  ))}
                  <div className="bg-muted/50 p-3 rounded-md text-xs border-l-4 border-sky-500 text-foreground">
                    <b>Privasi:</b> tidak ada server Naquth. Semua proses terjadi di browser Anda dan langsung ke <code>api.github.com</code>. Token hanya tersimpan di perangkat jika Anda mengaktifkan &quot;Ingat token&quot;.
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4 sm:p-6 lg:p-8">
        <Tabs defaultValue="upload" className="w-full animate-in fade-in duration-300">
          <div className="flex justify-center mb-6 overflow-x-auto pb-2">
            <TabsList className="flex w-max min-w-full sm:min-w-0 sm:grid sm:grid-cols-4 h-auto p-1">
              <TabsTrigger value="upload" className="flex gap-2 py-2.5 px-5 sm:px-4 sm:py-2"><UploadCloud className="h-5 w-5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Unggah</span></TabsTrigger>
              <TabsTrigger value="explorer" className="flex gap-2 py-2.5 px-5 sm:px-4 sm:py-2"><FolderGit2 className="h-5 w-5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Penjelajah</span></TabsTrigger>
              <TabsTrigger value="repositories" className="flex gap-2 py-2.5 px-5 sm:px-4 sm:py-2"><BookMarked className="h-5 w-5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Repositori</span></TabsTrigger>
              <TabsTrigger value="settings" className="flex gap-2 py-2.5 px-5 sm:px-4 sm:py-2"><Settings className="h-5 w-5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Pengaturan</span></TabsTrigger>
            </TabsList>
          </div>

          {/* forceMount: state (antrean, log) tidak hilang saat pindah tab */}
          <TabsContent value="upload" forceMount className="data-[state=inactive]:hidden"><Uploader /><div className="max-w-4xl mx-auto"><UploadHistoryChart /></div></TabsContent>
          <TabsContent value="explorer" forceMount className="data-[state=inactive]:hidden"><Explorer /></TabsContent>
          <TabsContent value="repositories" forceMount className="data-[state=inactive]:hidden"><Repositories /></TabsContent>
          <TabsContent value="settings" forceMount className="data-[state=inactive]:hidden"><SettingsPanel /></TabsContent>
        </Tabs>
      </main>
      <Toaster />
      <footer className="border-t py-6 text-center text-xs text-muted-foreground bg-muted/20 px-4">
        <p>© Naquth</p>
      </footer>
    </div>
  )
}
