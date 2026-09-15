import Link from "next/link";
export default function Home() {
  return (
    <main>
      <p className="eyebrow">POSTONCE / IDENTITY AND CONNECTIONS</p>
      <h1>Una base para publicar una sola vez.</h1>
      <p>Estamos construyendo PostOnce para Instagram, TikTok y YouTube.</p>
      <section aria-labelledby="status">
        <h2 id="status">Cimientos en desarrollo</h2>
        <p>Esta versión técnica todavía no permite cargar videos ni publicar.
          No hay integraciones simuladas.</p>
        <Link href="/login">Iniciar sesión con Google</Link>
      </section>
    </main>
  );
}
