
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Removed process.env.API_KEY definition to follow guidelines: "Do not define process.env"
  server: {
    port: 3000,
  },
});
