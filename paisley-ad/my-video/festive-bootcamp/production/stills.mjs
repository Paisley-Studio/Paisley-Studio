// Render review stills from one bundle and one browser.
// Usage: node production/stills.mjs <composition> <outDir> <frame> [frame...]
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";

const [comp, outDir, ...frames] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), rootDir: process.cwd() });
const browser = await openBrowser("chrome");
const composition = await selectComposition({ serveUrl, id: comp, puppeteerInstance: browser });
for (const f of frames) {
  await renderStill({ composition, serveUrl, frame: Number(f), output: path.join(outDir, `f${f}.jpg`), imageFormat: "jpeg",
    jpegQuality: 72, scale: 0.5, logLevel: "error", puppeteerInstance: browser });
  process.stdout.write(`${f} `);
}
await browser.close({ silent: true });
