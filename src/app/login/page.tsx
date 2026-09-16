import { authConfig } from "../../config/auth";
import { LoginButton } from "./login-button";

export const dynamic = "force-dynamic";
export default function Login() {
  let configured = false;
  const local = process.env.NODE_ENV === "development" && process.env.POSTONCE_DEV_LOGIN === "1";
  try { const config = authConfig(process.env); configured = !!(config.clientId && config.clientSecret); } catch { /* No secrets in UI. */ }
  return <main><h1>Inicia sesión en PostOnce</h1>
    <p>Tu login de Google identifica tu usuario. No conecta YouTube ni autoriza publicaciones.</p>
    {configured ? <LoginButton /> : !local && <p>El inicio de sesión aún requiere configuración del administrador.</p>}
  {local && <form action="/api/dev/login" method="post"><button type="submit">Entrar en modo local</button><small>Solo desarrollo. No requiere Google OAuth.</small></form>}</main>;
}

