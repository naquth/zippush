"use client"
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { get, set, del } from "idb-keyval"
import { GitHubClient, type GitHubRepo, type GitHubUser } from "@/lib/zippush/github"

export interface GitHubConfig {
  token: string
  /** pemilik repo (user atau organisasi). Kosong = pakai user yang login. */
  username: string
  repo: string
  branch: string
  targetFolder: string
  commitMessageTemplate: string
  /** true = token disimpan di perangkat (IndexedDB). false = hanya selama tab terbuka. */
  rememberToken: boolean
}

export interface UploadHistory {
  [date: string]: number
}

export interface GithubContextType {
  config: GitHubConfig
  setConfig: (config: GitHubConfig) => Promise<void>
  clearAll: () => Promise<void>
  ready: boolean
  user: GitHubUser | null
  scopes: string[] | null
  userError: string | null
  owner: string
  repositories: GitHubRepo[]
  reposLoading: boolean
  branches: string[]
  isConfigured: boolean
  client: GitHubClient
  refreshUser: () => void
  refreshRepositories: () => void
  /** naik setiap kali isi repo berubah (unggah/hapus) → Penjelajah memuat ulang */
  contentsVersion: number
  bumpContents: () => void
  uploadHistory: UploadHistory
  recordUploads: (count: number) => void
}

export const defaultConfig: GitHubConfig = {
  token: "",
  username: "",
  repo: "",
  branch: "main",
  targetFolder: "",
  commitMessageTemplate: "Upload {filename}",
  rememberToken: false,
}

const CONFIG_KEY = "naquth-config"
const TOKEN_KEY = "naquth-token"
const HISTORY_KEY = "naquth-upload-history"

const GithubContext = createContext<GithubContextType | undefined>(undefined)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan")

export function GithubProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<GitHubConfig>(defaultConfig)
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [scopes, setScopes] = useState<string[] | null>(null)
  const [userError, setUserError] = useState<string | null>(null)
  const [repositories, setRepositories] = useState<GitHubRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [uploadHistory, setUploadHistory] = useState<UploadHistory>({})
  const [userTick, setUserTick] = useState(0)
  const [repoTick, setRepoTick] = useState(0)
  const [contentsVersion, setContentsVersion] = useState(0)

  // ── muat konfigurasi (token TIDAK ikut tersimpan kecuali "ingat token" aktif) ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const saved = (await get(CONFIG_KEY)) as Partial<GitHubConfig> | undefined
        const merged = { ...defaultConfig, ...(saved ?? {}), token: "" }
        let token = ""
        if (merged.rememberToken) token = ((await get(TOKEN_KEY)) as string | undefined) ?? ""
        else token = sessionStorage.getItem(TOKEN_KEY) ?? ""
        const history = (await get(HISTORY_KEY)) as UploadHistory | undefined
        if (!alive) return
        setConfigState({ ...merged, token })
        if (history) setUploadHistory(history)
      } catch (e) {
        console.error("Gagal memuat data lokal", e)
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => { alive = false }
  }, [])

  const setConfig = useCallback(async (next: GitHubConfig) => {
    setConfigState(next)
    try {
      const { token, ...rest } = next
      await set(CONFIG_KEY, rest)
      if (next.rememberToken) {
        sessionStorage.removeItem(TOKEN_KEY)
        await set(TOKEN_KEY, token)
      } else {
        await del(TOKEN_KEY)
        if (token) sessionStorage.setItem(TOKEN_KEY, token)
        else sessionStorage.removeItem(TOKEN_KEY)
      }
    } catch (e) {
      console.error("Gagal menyimpan konfigurasi", e)
    }
  }, [])

  const clearAll = useCallback(async () => {
    setConfigState(defaultConfig)
    setUser(null); setScopes(null); setRepositories([]); setBranches([])
    try {
      await del(CONFIG_KEY); await del(TOKEN_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
    } catch (e) { console.error(e) }
  }, [])

  const recordUploads = useCallback((count: number) => {
    if (count <= 0) return
    const date = new Date().toISOString().split("T")[0]
    setUploadHistory((prev) => {
      const next = { ...prev, [date]: (prev[date] || 0) + count }
      set(HISTORY_KEY, next).catch((e) => console.error("Gagal menyimpan riwayat", e))
      return next
    })
  }, [])

  // ── user yang login (+ scope token) ──
  useEffect(() => {
    if (!ready) return
    if (!config.token) { setUser(null); setScopes(null); setUserError(null); return }
    let alive = true
    new GitHubClient({ token: config.token }).getUser()
      .then(({ user, scopes }) => { if (alive) { setUser(user); setScopes(scopes); setUserError(null) } })
      .catch((e) => { if (alive) { setUser(null); setScopes(null); setUserError(errMsg(e)) } })
    return () => { alive = false }
  }, [ready, config.token, userTick])

  // ── daftar repo: /user/repos → termasuk privat, org, kolaborasi (+ pagination) ──
  useEffect(() => {
    if (!ready) return
    if (!config.token) { setRepositories([]); return }
    let alive = true
    setReposLoading(true)
    new GitHubClient({ token: config.token }).listRepos()
      .then((r) => { if (alive) setRepositories(r) })
      .catch((e) => { if (alive) console.error(errMsg(e)) })
      .finally(() => { if (alive) setReposLoading(false) })
    return () => { alive = false }
  }, [ready, config.token, repoTick])

  const owner = (config.username.trim() || user?.login || "").trim()
  const repoName = config.repo.trim()

  const client = useMemo(
    () => new GitHubClient({ token: config.token, owner, repo: repoName }),
    [config.token, owner, repoName]
  )

  // ── branch (semua, dengan pagination) ──
  useEffect(() => {
    if (!ready || !config.token || !owner || !repoName) { setBranches([]); return }
    let alive = true
    setBranches([]) // jangan tampilkan branch repo sebelumnya selagi memuat
    client.listBranches()
      .then((b) => { if (alive) setBranches(b) })
      .catch(() => { if (alive) setBranches([]) })
    return () => { alive = false }
  }, [ready, client, config.token, owner, repoName])

  const isConfigured = Boolean(config.token && owner && repoName && config.branch.trim())

  const value: GithubContextType = {
    config, setConfig, clearAll, ready, user, scopes, userError, owner,
    repositories, reposLoading, branches, isConfigured, client,
    refreshUser: () => setUserTick((n) => n + 1),
    refreshRepositories: () => setRepoTick((n) => n + 1),
    contentsVersion, bumpContents: () => setContentsVersion((n) => n + 1),
    uploadHistory, recordUploads,
  }

  return <GithubContext.Provider value={value}>{children}</GithubContext.Provider>
}

export function useGithub() {
  const context = useContext(GithubContext)
  if (!context) throw new Error("useGithub must be used within GithubProvider")
  return context
}
