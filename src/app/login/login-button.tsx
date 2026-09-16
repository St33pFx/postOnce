"use client";
import { createAuthClient } from "better-auth/react";
import { useState } from "react";
const auth = createAuthClient();

export function LoginButton() {
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  return <><button disabled={pending} onClick={async () => {
    setPending(true); setError(false);
    try {
      const result = await auth.signIn.social({ provider: "google", callbackURL: "/drafts" });
      if (result.error) setError(true);
    } catch { setError(true); }
    finally { setPending(false); }
  }}>{pending ? "Abriendo Googleâ€¦" : "Continuar con Google"}</button>
  {error && <p role="alert">No se pudo iniciar sesiÃ³n. Verifica la configuraciÃ³n o intenta de nuevo.</p>}</>;
}
