import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { layerAssetsPlugin } from './src/server/layerAssets';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
        watch: { ignored: ['**/assets/**'] },
      },
      plugins: [react(), layerAssetsPlugin(path.resolve('assets'), { enabled: env.ALLOW_PAID_DECOMPOSITION === 'true', replicate: env.REPLICATE_API_TOKEN, runware: env.RUNWARE_API_KEY }, { baseUrl: env.PROCESS_FLOW_URL, token: env.PROCESS_FLOW_API_TOKEN })],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
