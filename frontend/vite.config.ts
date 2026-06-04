import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devnetConfig from './config/devnet.json';
import testnetConfig from './config/testnet.json';
import mainnetConfig from './config/mainnet.json';

const networkConfigs = {
  devnet: devnetConfig,
  testnet: testnetConfig,
  mainnet: mainnetConfig,
};

export default defineConfig(({ mode }) => {
  const config = networkConfigs[mode as keyof typeof networkConfigs] ?? networkConfigs.devnet;

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(config.apiUrl),
    },
    server: {
      host: true,
      port: 32001,
    },
  };
});
