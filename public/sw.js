// Naquth service worker — aman terhadap deploy baru:
//  • navigasi: network-first (selalu HTML terbaru; cache hanya untuk offline)
//  • /_next/static/*: cache-first (nama file ber-hash, immutable)
//  • aset statis lain: stale-while-revalidate
//  • tidak pernah menyentuh request non-GET atau lintas-origin (termasuk api.github.com)
const VERSION = "naquth-v2"
const SHELL = ["/", "/manifest.json", "/icons/icon-192.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u)))).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/", copy)) }
          return res
        })
        .catch(() => caches.match("/").then((r) => r || Response.error()))
    )
    return
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)) }
        return res
      }))
    )
    return
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)) }
        return res
      }).catch(() => hit || Response.error())
      return hit || net
    })
  )
})
