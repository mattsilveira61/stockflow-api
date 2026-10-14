import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// O navegador só fala com /api: no dev o Vite repassa para a API, no Docker quem faz isso é o nginx.
// Assim tudo parece um site só e não é preciso CORS.
const apiTarget = process.env.API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas em arquivos separados: mudam pouco e ficam no cache do navegador entre versões.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/recharts|d3-|victory-vendor/.test(id)) return "charts";
          // [\\/] aceita a barra do Windows e a do Linux no caminho do arquivo
          if (/react-dom|react-router|scheduler|[\\/]react[\\/]/.test(id)) return "react";
          if (/@tanstack/.test(id)) return "query";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: apiTarget, rewrite: (path) => path.replace(/^\/api/, "") } },
  },
  preview: {
    port: 4173,
    proxy: { "/api": { target: apiTarget, rewrite: (path) => path.replace(/^\/api/, "") } },
  },
});
