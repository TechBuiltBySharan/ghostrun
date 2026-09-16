import { describe, expect, it } from "vitest";
import { assertPageScriptAllowed } from "../../packages/security/src/page-script-policy";

describe("page script policy", () => {
  it("blocks eval actions by default", () => {
    expect(() => assertPageScriptAllowed(false, "document.title")).toThrow(/disabled/);
  });

  it("allows a non-empty script only after explicit opt-in", () => {
    expect(() => assertPageScriptAllowed(true, "document.title")).not.toThrow();
    expect(() => assertPageScriptAllowed(true, " ")).toThrow(/expression/);
  });
});
