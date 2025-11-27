import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Use EVOLINK_API_KEY for the new platform and map to process.env.API_KEY for convenience
        'process.env.API_KEY': JSON.stringify(env.EVOLINK_API_KEY),
        'process.env.EVOLINK_API_KEY': JSON.stringify(env.EVOLINK_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
