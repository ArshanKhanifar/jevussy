import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Jevussy — An Endless Piano by JEV";
const description =
  "What if Debussy could keep dreaming? Give JEV a mood and hear an original piano reverie unfold, one live decision at a time.";
const shareImage = {
  url: "/og.png?v=20260921",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Jevussy — An endless piano, imagined by JEV. A classical composer portrait on parchment.",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://jevussy.arshan.to"),
  title,
  description,
  applicationName: "Jevussy",
  category: "music",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Jevussy",
    title,
    description,
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [{ url: shareImage.url, alt: shareImage.alt }],
  },
  icons: {
    icon: [
      {
        url: "/favicon.ico?v=2",
        sizes: "16x16 32x32 48x48",
        type: "image/x-icon",
      },
      { url: "/favicon.svg?v=2", sizes: "any", type: "image/svg+xml" },
      { url: "/favicon-48.png?v=2", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=2",
  },
  manifest: "/site.webmanifest",
  appleWebApp: { capable: true, title: "Jevussy", statusBarStyle: "default" },
  robots: { index: true, follow: true, "max-image-preview": "large" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6f302f",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
