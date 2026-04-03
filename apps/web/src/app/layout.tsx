import type { Metadata } from "next";
import { Livvic } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const livvic = Livvic({ 
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "REZEA - Gestion de Réservations Sportives",
  description: "Plateforme de réservation pour établissements sportifs",
  manifest: "/manifest.json",
  themeColor: "#000000",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={livvic.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
