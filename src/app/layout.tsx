import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostOnce — Cimientos",
  description: "Base técnica de PostOnce. Integraciones pendientes de implementación.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:`(()=>{try{const t=localStorage.getItem('postonce-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}})()`}} /></head><body>{children}</body></html>;
}
