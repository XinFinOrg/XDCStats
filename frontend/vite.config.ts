import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  console.log('VITE_API_URL:', env.VITE_API_URL);

  if (!env.VITE_API_URL) {
    console.error('VITE_API_URL is not set. Aborting.');
    process.exit(1);
  }

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 32001,
    },
  };
});
