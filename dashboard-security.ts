import { timingSafeEqual } from "node:crypto";

export interface DashboardRequestEvidence {
  host?: string;
  origin?: string;
  port: number;
  stateChanging: boolean;
  expectedToken: string;
  providedToken?: string;
}

export function evaluateDashboardRequest(input: DashboardRequestEvidence) {
  const hosts = new Set([
    `127.0.0.1:${input.port}`,
    `localhost:${input.port}`,
    `[::1]:${input.port}`,
  ]);
  const host = (input.host || "").toLowerCase();
  if (!hosts.has(host)) return { ok: false as const, error: "Untrusted dashboard host" };
  if (input.origin) {
    let origin: URL;
    try { origin = new URL(input.origin); }
    catch { return { ok: false as const, error: "Invalid dashboard origin" }; }
    if (origin.protocol !== "http:" || !hosts.has(origin.host.toLowerCase()))
      return { ok: false as const, error: "Cross-origin dashboard request blocked" };
  }
  if (input.stateChanging) {
    const expected = Buffer.from(input.expectedToken);
    const provided = Buffer.from(input.providedToken || "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
      return { ok: false as const, error: "Missing dashboard request token" };
  }
  return { ok: true as const };
}

export function dashboardSecurityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
  } as const;
}
