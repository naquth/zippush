import Image from "next/image"
import { cn } from "@/lib/utils"

/** Wordmark NAQUTH. Aset putih untuk tema gelap, hitam untuk tema terang (tanpa kedip, murni CSS). */
export function Logo({ height = 28, className }: { height?: number; className?: string }) {
  const width = Math.round((height * 640) / 196)
  const common = { width, height, unoptimized: true, style: { height, width: "auto" } } as const
  return (
    <>
      <Image src="/brand/logo-dark.png" alt="Naquth" priority {...common} className={cn("dark:hidden", className)} />
      <Image src="/brand/logo-light.png" alt="Naquth" priority {...common} className={cn("hidden dark:block", className)} />
    </>
  )
}

export function Emblem({ size = 32, className }: { size?: number; className?: string }) {
  const width = Math.round((size * 302) / 381)
  const common = { "aria-hidden": true, width, height: size, unoptimized: true, style: { height: size, width: "auto" } } as const
  return (
    <>
      <Image src="/brand/emblem-dark.png" alt="" {...common} className={cn("dark:hidden", className)} />
      <Image src="/brand/emblem-light.png" alt="" {...common} className={cn("hidden dark:block", className)} />
    </>
  )
}
