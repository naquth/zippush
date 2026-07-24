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

1. You drop a `.zip` file — JSZip extracts it entirely in the browser
2. Each file is uploaded as a **Git blob** via the GitHub API
3. A new **Git tree** is created on top of the current branch tree
4. A **commit** is created pointing to the new tree
5. The **branch ref** is updated to point to the new commit

This is equivalent to `git add . && git commit -m "..." && git push`.
