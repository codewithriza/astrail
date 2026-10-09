import localFont from "next/font/local";
import "../styles.css";
import "./pixel-home.css";

// Pixelify Sans and Montserrat (SIL Open Font License), self-hosted so builds never depend on Google Fonts.
const pixelFont = localFont({
  src: "../fonts/PixelifySansVF.woff2",
  variable: "--font-pixel",
  weight: "400 700",
  display: "swap",
  fallback: ["Courier New", "ui-monospace", "monospace"],
});
const bodyFont = localFont({
  src: "../fonts/MontserratVF.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${pixelFont.variable} ${bodyFont.variable}`}
      style={{ fontFamily: "var(--font-body), ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {children}
    </div>
  );
}
