import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["node:net", "node:http", "node:https"],
    },
  },
  server: {
    port: 3000,
  },
});
