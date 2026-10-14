"use client"

import { AppShell } from "@/components/shell/app-shell"
import { Uploader } from "@/components/dashboard/uploader"
import { Explorer } from "@/components/dashboard/explorer"
import { Repositories } from "@/components/dashboard/repositories"
import { SettingsPanel } from "@/components/dashboard/settings-panel"
import { Toaster } from "@/components/ui/sonner"

export default function Home() {
  return (
    <>
      <AppShell views={{ upload: <Uploader />, explorer: <Explorer />, repositories: <Repositories />, settings: <SettingsPanel /> }} />
      <Toaster position="top-center" />
    </>
  )
}
