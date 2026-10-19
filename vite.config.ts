import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { Agent } from "node:http";
export default defineConfig({
  root: "apps/web",
  plugins: [react(), tailwind()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        agent: new Agent({ keepAlive: true, maxSockets: 4 }),
      },
    },
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: "vendor",
              test: /node_modules/,
              minSize: 20000,
              maxSize: 220000,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
