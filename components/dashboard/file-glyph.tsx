import { File as FileIcon, FileArchive, FileCode, FileImage, FileText, Folder } from "lucide-react"
import { cn } from "@/lib/utils"

type Kind = "code" | "image" | "text" | "archive" | "other" | "dir"
const kindOf = (name: string): Kind => {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["ts", "tsx", "js", "jsx", "mjs", "css", "html", "json", "py", "go", "rs", "sh", "yml", "yaml", "toml"].includes(ext)) return "code"
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif"].includes(ext)) return "image"
  if (["md", "txt", "csv", "log"].includes(ext)) return "text"
  if (["zip", "gz", "tar", "rar", "7z"].includes(ext)) return "archive"
  return "other"
}
const TONE: Record<Kind, string> = {
  code: "bg-info/15 text-info", image: "bg-success/15 text-success", text: "bg-secondary text-muted-foreground",
  archive: "bg-warn/15 text-warn", other: "bg-secondary text-muted-foreground", dir: "bg-primary/15 text-primary",
}
const ICON = { code: FileCode, image: FileImage, text: FileText, archive: FileArchive, other: FileIcon, dir: Folder }

/** Kotak ikon berwarna menurut jenis berkas. */
export function FileGlyph({ name, dir, className }: { name: string; dir?: boolean; className?: string }) {
  const k: Kind = dir ? "dir" : kindOf(name)
  const I = ICON[k]
  return <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", TONE[k], className)}><I className="h-[18px] w-[18px]" /></span>
}
