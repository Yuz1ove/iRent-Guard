import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleApiRequest } from "./server/apiHandler.mjs";

export default defineConfig({
  server: {
    allowedHosts: [".lhr.life", ".loca.lt"]
  },
  preview: {
    allowedHosts: [".lhr.life", ".loca.lt"]
  },
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
