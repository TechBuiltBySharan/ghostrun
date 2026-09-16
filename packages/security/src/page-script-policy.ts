export function assertPageScriptAllowed(enabled: boolean, script: unknown): asserts script is string {
  if (!enabled) {
    throw new Error(
      "eval action is disabled. Set policies.allowPageScripts=true in .ghostrun/config.json only for trusted flows.",
    );
  }
  if (typeof script !== "string" || !script.trim())
    throw new Error("eval: value must be a JavaScript expression");
}
