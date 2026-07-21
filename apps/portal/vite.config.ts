import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 3201, strictPort: true },
  preview: { port: 4201, strictPort: true },
  build: { sourcemap: false },
});
