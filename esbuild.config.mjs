import esbuild from "esbuild";
import { builtinModules } from "module";

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtinModules.filter((m) => m !== "crypto")],
  // tweetnacl only falls back to Node's crypto when browser crypto is missing, which never
  // happens in Obsidian (and this plugin only verifies signatures). Keep Node out of the bundle.
  alias: { crypto: "./tools/crypto-stub.js" },
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
