import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { AuthProvider } from "@/components/auth-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Otto Perso — Control Panel",
  description:
    "Otto is a digital employee that lives on your computer. Direct desktop automation, multi-agent coordination, and a transparent Obsidian-style memory vault.",
  keywords: [
    "Otto Perso",
    "agentic AI",
    "desktop automation",
    "autonomous agent",
    "Obsidian vault",
    "local-first AI",
  ],
  authors: [{ name: "Otto Perso" }],
  manifest: "/manifest.json",
  applicationName: "Otto Perso",
  appleWebApp: {
    capable: true,
    title: "Otto Perso",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: [{ url: "/favicon.ico" }],
  },
  openGraph: {
    title: "Otto Perso — Control Panel",
    description:
      "A digital employee that lives on your computer. Direct desktop automation, multi-agent coordination, transparent memory.",
    siteName: "Otto Perso",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Otto Perso — Control Panel",
    description: "A digital employee that lives on your computer.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProvider>
            {/* Top-level theme toggle is in Topbar; ThemeProvider handles state */}
            {children}
            <Toaster />
            <ServiceWorkerRegister />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
