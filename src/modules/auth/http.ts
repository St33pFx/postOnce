import type { createAuth } from "./factory";

export async function authRequest(request: Request, services: { auth: ReturnType<typeof createAuth>; origin: string }) {
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  const allowed = request.method === "GET"
    ? ["/get-session", "/callback/google"].includes(path)
    : request.method === "POST" && ["/sign-in/social", "/sign-out"].includes(path);
  if (!allowed) return Response.json({ error: "Not found" }, { status: 404 });
  if (request.method === "POST" && request.headers.get("origin") !== services.origin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (path === "/sign-in/social") {
    let body;
    try { body = await request.clone().json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
    if (!body || typeof body !== "object" || body.provider !== "google" || body.idToken || body.scopes ||
        Object.keys(body).some((key) => !["provider", "callbackURL", "errorCallbackURL", "disableRedirect"].includes(key))) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
  }
  const response = await services.auth.handler(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
