import { authConfig } from "../../config/auth";
import { LoginButton } from "./login-button";

export const dynamic = "force-dynamic";
export default function Login() {
  let configured = false;
  const local = process.env.NODE_ENV === "development" && process.env.POSTONCE_DEV_LOGIN === "1";
  try { const config = authConfig(process.env); configured = !!(config.clientId && config.clientSecret); } catch { /* No secrets in UI. */ }
  return <main className="login-page"><div className="login-card"><p className="eyebrow">POSTONCE</p><h1>Publica una vez.<br/>Distribuye a todas partes.</h1>
    <p className="lede">Prepara tus publicaciones y conecta tus canales desde un solo lugar.</p>
    {configured ? <LoginButton /> : !local && <p className="notice">El inicio de sesión requiere configuración del administrador.</p>}
    {local && <form action="/api/dev/login" method="post"><button className="button secondary" type="submit">Entrar en modo local</button><small>Solo desarrollo. No requiere Google OAuth.</small></form>}<p className="login-footnote">Tu cuenta de Google identifica tu espacio de trabajo. Las conexiones sociales se autorizan por separado.</p></div></main>;
}

