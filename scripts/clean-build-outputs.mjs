import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--desktop") ? "desktop" : "all";
const targets = mode === "desktop"
  ? [path.join(root, "apps", "desktop", "dist")]
  : [
      path.join(root, "apps", "desktop", "dist"),
      path.join(root, "packages", "core", "dist"),
      path.join(root, "packages", "i18n", "dist"),
      path.join(root, "packages", "shared", "dist")
    ];

for (const target of targets) {
  assertInsideWorkspace(target);
  fs.rmSync(target, { recursive: true, force: true });
}

function assertInsideWorkspace(target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean outside workspace: ${target}`);
  }
  const normalized = relative.replaceAll("\\", "/");
  if (!/^(apps\/desktop|packages\/[^/]+)\/dist$/.test(normalized)) {
    throw new Error(`Refusing to clean unexpected build path: ${target}`);
  }
}
