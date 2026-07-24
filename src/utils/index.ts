export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function formatTime(): string {
  const now = new Date()
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9)
}

export function encodeContent(uint8arr: Uint8Array): {
  content: string
  encoding: 'base64' | 'utf-8'
} {
  // Detect binary by scanning first 512 bytes
  let binary = false
  for (let i = 0; i < Math.min(uint8arr.length, 512); i++) {
    const b = uint8arr[i]
    if (b === 0 || (b < 9 && b !== 7 && b !== 8)) {
      binary = true
      break
    }
  }

  if (binary) {
    let str = ''
    uint8arr.forEach((b) => (str += String.fromCharCode(b)))
    return { content: btoa(str), encoding: 'base64' }
  }

  const decoder = new TextDecoder('utf-8', { fatal: false })
  return { content: decoder.decode(uint8arr), encoding: 'utf-8' }
}

export function detectStripRoot(paths: string[]): string | null {
  if (!paths.length) return null
  const firstSeg = paths[0].split('/')[0]
  if (firstSeg && paths.every((p) => p.startsWith(firstSeg + '/'))) {
    return firstSeg
  }
  return null
}
