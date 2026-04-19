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
        <a
          href="https://www.hetzner.com/cloud"
          target="_blank"
          rel="noopener noreferrer"
          title="Self-hosted on Hetzner Cloud (ARM) via Coolify — migrated off Vercel+Supabase Cloud to cut demo hosting costs"
          style={{
            position: "fixed",
            bottom: 12,
            left: 12,
            zIndex: 9999,
            background: "rgba(17, 24, 39, 0.85)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 9999,
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            textDecoration: "none",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            backdropFilter: "blur(4px)",
          }}
        >
          🏠 Hetzner · Coolify
        </a>
      </body>
    </html>
  );
}
