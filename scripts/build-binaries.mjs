import { chmod } from "node:fs/promises";
import { build } from "esbuild";

const targets = [
  ["ghostrun.ts", "ghostrun.js"],
  ["mcp-server.ts", "mcp-server.js"],
];

for (const [entryPoint, outfile] of targets) {
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    packages: "external",
  });
  if (process.platform !== "win32") await chmod(outfile, 0o755);
}
