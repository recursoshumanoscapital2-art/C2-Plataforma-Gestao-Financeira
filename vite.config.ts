import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Carrega as variáveis de ambiente do Render/Vite
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    // Define a variável `process.env.API_KEY` para ser usada no navegador.
    // O código buscará a chave de `VITE_API_KEY` no ambiente de hospedagem.
    // Isso resolve o erro de API Key no Render sem violar as diretrizes.
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || env.API_KEY)
    },
    server: {
      port: 3000,
    },
  };
});
