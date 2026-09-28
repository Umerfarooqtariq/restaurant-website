import { readCookie, SESSION_COOKIE, verifySession } from "../../shared/session.ts";

declare const Netlify: { env: { get(name: string): string | undefined } };

export default async function adminGuard(request: Request, context: { next: () => Promise<Response> }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin/login") return context.next();

  const secret = Netlify.env.get("SESSION_SECRET") || "";
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const subject = secret && token ? await verifySession(secret, token) : null;
  if (!subject) {
    const login = new URL("/admin/login", url.origin);
    if (token) login.searchParams.set("expired", "1");
    return Response.redirect(login.toString(), 302);
  }
  return context.next();
}
