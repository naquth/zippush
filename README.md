# ZipPush

> Push code to GitHub from your phone — no terminal required.

Extract a ZIP file and commit all changed files to your GitHub repository using only your browser and a Personal Access Token.

## Stack

- **React 18** + **TypeScript**
- **Tailwind CSS v3**
- **Vite** (build tool)
- **JSZip** (client-side ZIP extraction)
- **GitHub REST API** (Git Data API for blobs/trees/commits)

## Features

- 📦 Client-side ZIP extraction (no server, no uploads)
- 🔐 GitHub PAT auth with optional localStorage persistence
- 🌿 Auto-detects and strips root folder from ZIP
- 📊 Real-time push log with timestamps
- ⚡ **Turbo push engine** — only *changed* files are sent; text files go inline in the tree (0 extra requests), binaries upload in parallel; ends with exactly **one commit + one ref update** (atomic)
- 🔁 Auto-retry with backoff, per-request timeout, GitHub rate-limit (429/403) aware, screen wake-lock while pushing
- 📈 Per-file progress tracking
- 🔒 Binary-safe (base64 for images/fonts, utf-8 for text)
- ✅ Direct link to created commit

## Deploy to Vercel

```bash
# 1. Clone / download this project
# 2. Install deps
npm install

# 3. Dev server
npm run dev

# 4. Deploy
npx vercel --prod
```

Or connect your GitHub repo to [vercel.com](https://vercel.com) for automatic deploys.

## GitHub Token

You need a **Personal Access Token** with `repo` scope:

1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=repo&description=ZipPush)
2. Select `repo` scope
3. Generate and copy the token

Your token is **never sent to any server** — it lives only in your browser and goes directly to `api.github.com`.

## How it works

1. You drop a `.zip` — JSZip extracts it in the browser; junk (`__MACOSX`, `.DS_Store`, `.git`, `../` paths) is filtered and the root folder is auto-stripped.
2. ZipPush reads the branch's current tree (3 requests) and computes the **Git blob SHA-1** of each local file — files identical to the repo are skipped.
3. Changed **text** files are embedded directly in the tree request (no per-file request). **Binary** files are uploaded as blobs, in parallel (6 at a time).
4. Trees are created in chained chunks, then **one commit** and **one branch update**. If anything fails before the last step, the repo is untouched; re-pushing is safe.

A 500-file ZIP that used to need 500+ sequential requests now takes roughly 5–10 requests (plus one per changed binary).

## Tests

```bash
npm test
```

The engine is covered by an in-memory fake GitHub that mimics Git Data API semantics (real blob SHAs, duplicate-path and file/folder conflict rejection).
