// frontend/vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // Carga .env desde la raíz de este frontend.
  // Si se apunta a otro directorio, import.meta.env puede quedar undefined.
  envDir: './', 

  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
