import { describe, expect, it } from "vitest";
import { dashboardSecurityHeaders, evaluateDashboardRequest } from "../../dashboard-security";

const request = (overrides: Partial<Parameters<typeof evaluateDashboardRequest>[0]> = {}) =>
  evaluateDashboardRequest({
    host: "127.0.0.1:4173",
    origin: "http://127.0.0.1:4173",
    port: 4173,
    stateChanging: false,
    expectedToken: "a".repeat(64),
    ...overrides,
  });

describe("dashboard request policy", () => {
  it("accepts loopback reads and exact-token writes", () => {
    expect(request().ok).toBe(true);
    expect(request({ stateChanging: true, providedToken: "a".repeat(64) }).ok).toBe(true);
  });

  it("blocks DNS rebinding, cross-origin access, and tokenless writes", () => {
    expect(request({ host: "evil.example:4173" }).ok).toBe(false);
    expect(request({ origin: "https://evil.example" }).ok).toBe(false);
    expect(request({ stateChanging: true }).ok).toBe(false);
    expect(request({ stateChanging: true, providedToken: "b".repeat(64) }).ok).toBe(false);
  });

  it("ships browser hardening headers", () => {
    const headers = dashboardSecurityHeaders();
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Cache-Control"]).toBe("no-store");
  });
});
