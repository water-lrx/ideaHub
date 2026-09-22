/**
 * Assembles the static web bundle for the Capacitor (Android) build.
 *
 * The app is authored as plain static files at the repository root so that
 * `python3 server.py` and the Electron build can serve them directly. Capacitor
 * needs its own self-contained webDir, so this copies exactly the files the
 * standalone app needs — and deliberately leaves out `data/` and `server.py`,
 * which are personal data and the local HTTP service.
 */
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "www");

const FILES = ["index.html", "styles.css", "app.js", "manifest.webmanifest"];
const DIRS = ["icons"];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const file of FILES) {
  const from = resolve(root, file);
  if (!existsSync(from)) throw new Error(`缺少必需文件: ${file}`);
  cpSync(from, resolve(outDir, file));
}

for (const dir of DIRS) {
  const from = resolve(root, dir);
  if (!existsSync(from)) throw new Error(`缺少必需目录: ${dir}`);
  cpSync(from, resolve(outDir, dir), { recursive: true });
}

// sw.js is intentionally excluded: a Service Worker adds nothing inside a
// Capacitor WebView (assets are already local) and complicates cache busting.
console.log(`www/ 已生成 -> ${outDir}`);
