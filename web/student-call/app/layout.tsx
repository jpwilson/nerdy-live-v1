import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveSesh Student Call",
  description: "Student-side WebRTC client for LiveSesh tutoring sessions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
