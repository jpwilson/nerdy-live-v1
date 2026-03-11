import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveSesh — Join Session",
  description: "Student-side video client for LiveSesh real-time tutoring analysis.",
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
