import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    https: true,
    host: true, // Listen on all network interfaces so mobile devices on the same WiFi can connect
    port: 5173,
  },
  preview: {
    https: true,
    host: true,
    port: 4173,
  },
});
