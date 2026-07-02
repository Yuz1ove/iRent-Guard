import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleApiRequest } from "./server/apiHandler.mjs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "irent-demo-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/api/")) {
            const handled = await handleApiRequest(req, res);
            if (handled) return;
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/api/")) {
            const handled = await handleApiRequest(req, res);
            if (handled) return;
          }
          next();
        });
      }
    }
  ]
});
