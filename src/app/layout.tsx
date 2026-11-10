import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KoraLab — le labo réseau en ligne", template: "%s — KoraLab" },
  description: "Simulez des routeurs, switchs et PC directement dans votre navigateur. Gratuit, sans installation, pensé pour les étudiants en réseau informatique.",
  metadataBase: new URL("https://koralab.vercel.app"),
  keywords: ["simulateur réseau", "CCNA", "Packet Tracer", "GNS3", "Cisco IOS", "labo réseau en ligne", "étudiant réseau", "Bénin"],
  openGraph: {
    title: "KoraLab — le labo réseau en ligne",
    description: "Configurez des routeurs et des switchs dans votre navigateur. Gratuit, sans installation.",
    url: "https://koralab.vercel.app",
    siteName: "KoraLab",
    locale: "fr_FR",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "KoraLab — le labo réseau en ligne", description: "Configurez des routeurs et des switchs dans votre navigateur. Gratuit, sans installation." },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
