import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "../styles.css";

const displayFont = Instrument_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-display",
});
const accentFont = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-accent",
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${displayFont.variable} ${accentFont.variable}`}
      style={{ fontFamily: "var(--font-display), ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {children}
    </div>
  );
}
