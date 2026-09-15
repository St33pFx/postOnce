export async function readiness(probe: () => Promise<void>): Promise<Response> {
  try {
    await probe();
    return Response.json({ status: "ok", service: "web", database: "ok" },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "not_ready", service: "web", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
