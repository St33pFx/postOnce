"use client";
import { createAuthClient } from "better-auth/react";
import { useState } from "react";

export function LogoutButton() {
  const [error, setError] = useState(false);
  return <><button onClick={async () => {
    try {
      const result = await createAuthClient().signOut();
      if (result.error) setError(true); else window.location.assign("/login");
    } catch { setError(true); }
  }}>Cerrar sesión</button>{error && <p role="alert">No se pudo cerrar sesión. Intenta de nuevo.</p>}</>;
}
