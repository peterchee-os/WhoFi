import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhoFi",
  description: "WiFi identity and device visibility."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
