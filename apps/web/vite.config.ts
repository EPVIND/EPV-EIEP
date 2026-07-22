import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3200,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3100",
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/u, ""),
      },
    },
  },
  preview: { port: 4200, strictPort: true },
  build: { sourcemap: false },
});
