import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 3200, strictPort: true },
  preview: { port: 4200, strictPort: true },
  build: { sourcemap: true },
});

