import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, "src", "renderer"),
  plugins: [react()],
  build: {
    outDir: path.join(root, "dist", "renderer"),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
