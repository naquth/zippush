"use client"
import { useEffect } from "react"

/** Daftarkan service worker (hanya produksi). Tidak bergantung pada event `load` yang bisa sudah lewat. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    const register = () => navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW gagal terdaftar", e))
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
  }, [])
  return null
}
