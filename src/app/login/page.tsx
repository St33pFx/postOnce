import { authConfig } from "../../config/auth";
import { LoginButton } from "./login-button";

export const dynamic = "force-dynamic";
export default function Login() {
  let configured = false;
  try { authConfig(process.env); configured = true; } catch { /* No secrets in UI. */ }
  return <main><h1>Inicia sesión en PostOnce</h1>
    <p>Tu login de Google identifica tu usuario. No conecta YouTube ni autoriza publicaciones.</p>
    {configured ? <LoginButton /> : <p>El inicio de sesión aún requiere configuración del administrador.</p>}
  {process.env.NODE_ENV === "development" && process.env.POSTONCE_DEV_LOGIN === "1" && <form action="/api/dev/login" method="post"><button type="submit">Entrar en modo local</button><small>Solo desarrollo</small></form>}</main>;
}

