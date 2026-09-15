"use client";
import { useState } from "react";

export function DisconnectButton({ id }: { id: string }) {
  const [error, setError] = useState(false);
  return <><button onClick={async () => {
    if (!window.confirm("¿Desconectar esta cuenta de PostOnce? El historial se conserva.")) return;
    try {
      const response = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      if (!response.ok) setError(true); else window.location.reload();
    } catch { setError(true); }
  }}>Desconectar</button>{error && <p role="alert">No se pudo desconectar. Intenta de nuevo.</p>}</>;
}

export function ConfirmAccountButton({ draftId, platform, connectionId, revision }: {
  draftId: string; platform: string; connectionId: string; revision: number;
}) {
  const [error, setError] = useState(false);
  return <><button onClick={async () => {
    if (!window.confirm("¿Utilizar esta cuenta diferente en este draft? Su configuración deberá revalidarse antes de publicar.")) return;
    try {
      const response = await fetch("/api/connections/confirm", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId, platform, connectionId, revision }) });
      if (!response.ok) setError(true); else window.location.reload();
    } catch { setError(true); }
  }}>Confirmar cambio de cuenta</button>{error && <p role="alert">La cuenta cambió o no está disponible. Actualiza la página.</p>}</>;
}
