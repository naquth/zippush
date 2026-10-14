"use client"
import { createContext, useContext } from "react"

export type ViewId = "upload" | "explorer" | "repositories" | "settings"
export const ShellContext = createContext<{ view: ViewId; setView: (v: ViewId) => void }>({ view: "upload", setView: () => {} })
export const useShell = () => useContext(ShellContext)
