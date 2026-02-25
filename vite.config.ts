import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "path";

export default defineConfig({
  plugins: [basicSsl()],
  resolve: {
    alias: {
      starkzap: path.resolve(__dirname, "../starkzap/src/index.ts"),
      "@": path.resolve(__dirname, "../starkzap/src"),
    },
  },
  optimizeDeps: {
    exclude: ["starkzap"],
  },
  server: {
    https: {},
    allowedHosts: ["localhost"],
  },
});
