import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: ["./components/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ['"Sora Variable"', '"Plus Jakarta Sans Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        success: "var(--success)",
        warn: "var(--warn)",
        info: "var(--info)",
        brand: { from: "var(--brand-from)", to: "var(--brand-to)" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 4px)", sm: "calc(var(--radius) - 8px)" },
      boxShadow: {
        glow: "0 8px 28px -10px color-mix(in srgb, var(--brand-from) 38%, transparent)",
        soft: "0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent) inset, 0 12px 32px -16px rgb(0 0 0 / 0.35)",
      },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "brand-pulse": { "0%,100%": { opacity: "0.55", transform: "scale(1)" }, "50%": { opacity: "1", transform: "scale(1.06)" } },
        rise: { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        shimmer: "shimmer 2.2s linear infinite",
        "brand-pulse": "brand-pulse 1.8s ease-in-out infinite",
        rise: "rise .35s cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
export default config
