import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostOnce — Cimientos",
  description: "Base técnica de PostOnce. Integraciones pendientes de implementación.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
