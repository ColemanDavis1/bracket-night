import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { BRANDING } from "@/lib/branding";

export const metadata: Metadata = {
  title: {
    default: `${BRANDING.name} — ${BRANDING.tagline}`,
    template: `%s · ${BRANDING.name}`,
  },
  description: BRANDING.description,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
