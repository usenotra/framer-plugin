import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import framer from "vite-plugin-framer";
import mkcert from "vite-plugin-mkcert";

const PATH_REGEX = /^\/api\/notra/;

export default defineConfig({
  plugins: [react(), mkcert(), framer()],
  server: {
    proxy: {
      // Proxy Notra API in dev to avoid CORS (plugin loads from localhost)
      "/api/notra": {
        target: "https://api.usenotra.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(PATH_REGEX, ""),
      },
    },
  },
});
