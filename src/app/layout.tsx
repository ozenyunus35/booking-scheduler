import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Book an appointment · Halden Hair Studio", template: "%s · Cadence" },
  description: "Cadence booking demo: a salon's online booking page with real-time availability, and the staff calendar and dashboard behind it. Runs entirely in the browser with synthetic data.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0f" },
  ],
};

// Applies the saved theme before first paint to avoid a flash. Light is the default for the public page's clients.
const THEME_SCRIPT = `try{var t=localStorage.getItem("cadence:theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans text-[13px] leading-5">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
