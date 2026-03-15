import type { Metadata, Viewport } from "next";
import { GlobalNav } from "@/components/global-nav";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "LiveSesh AI — Real-Time Tutoring Analysis",
  description: "AI-powered engagement analysis for live tutoring sessions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <GlobalNav />
        {children}
      </body>
    </html>
  );
}
