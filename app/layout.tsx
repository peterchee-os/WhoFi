import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhoFi",
  description: "WiFi identity and device visibility for coworking spaces, hackathons, events, and guest networks."
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
