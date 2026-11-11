import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 4173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
