/**
 * Menjaga proses tetap hidup selama operasi panjang di HP:
 * layar tidak mati (Wake Lock) dan tab tidak tertutup tanpa peringatan.
 */
export async function withKeepAlive<T>(fn: () => Promise<T>): Promise<T> {
  let lock: { release: () => Promise<void> } | null = null
  try { lock = (await (navigator as any).wakeLock?.request('screen')) ?? null } catch { /* tidak didukung */ }
  const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
  window.addEventListener('beforeunload', guard)
  try {
    return await fn()
  } finally {
    window.removeEventListener('beforeunload', guard)
    try { await lock?.release() } catch { /* abaikan */ }
  }
}
