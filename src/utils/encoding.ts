/** Batas ukuran file teks yang dikirim inline di dalam tree (bukan blob terpisah). */
export const INLINE_MAX_BYTES = 512 * 1024

/**
 * SHA-1 Git blob: sha1("blob <len>\0" + content) — identik dengan `git hash-object`.
 * Mengembalikan null jika WebCrypto tidak tersedia (konteks non-HTTPS).
 */
export async function gitBlobSha(data: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const header = new TextEncoder().encode(`blob ${data.byteLength}\0`)
  const buf = new Uint8Array(header.byteLength + data.byteLength)
  buf.set(header, 0)
  buf.set(data, header.byteLength)
  const digest = new Uint8Array(await subtle.digest('SHA-1', buf))
  let hex = ''
  for (const b of digest) hex += b.toString(16).padStart(2, '0')
  return hex
}

/**
 * Base64 aman untuk file besar: di-chunk kelipatan 3 byte sehingga tidak ada padding
 * di tengah, dan tidak ada string perantara sebesar file (String += per byte).
 */
export function toBase64(data: Uint8Array): string {
  const CHUNK = 0x6000 // 24576 = kelipatan 3
  const parts: string[] = []
  for (let i = 0; i < data.byteLength; i += CHUNK) {
    const slice = data.subarray(i, i + CHUNK)
    parts.push(btoa(String.fromCharCode.apply(null, slice as unknown as number[])))
  }
  return parts.join('')
}

/**
 * Mengembalikan string jika file PASTI teks UTF-8 valid yang aman dikirim inline;
 * selain itu null (→ dikirim sebagai blob base64, byte-exact).
 * Konservatif: BOM, NUL byte, UTF-8 invalid, file kosong, dan file besar semuanya ditolak.
 */
export function tryDecodeText(data: Uint8Array): string | null {
  if (data.byteLength === 0 || data.byteLength > INLINE_MAX_BYTES) return null
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) return null
  for (let i = 0; i < data.byteLength; i++) if (data[i] === 0) return null
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data)
  } catch {
    return null
  }
}
