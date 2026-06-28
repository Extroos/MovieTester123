import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'os';

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const localIp = getLocalIp();
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        proxy: {
          '/vidsrc': {
            target: 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev',
            changeOrigin: true,
            followRedirects: true,
          },
          '/vidsrc-pm': {
            target: 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev',
            changeOrigin: true,
            followRedirects: true,
          },
          '/consumet': {
             target: 'https://api.consumet.org',
             changeOrigin: true,
             rewrite: (path) => path.replace(/^\/consumet/, ''),
          },
          '/proxy': {
            target: 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev', 
            changeOrigin: true,
          }
        }
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-motion': ['framer-motion'],
              'vendor-supabase': ['@supabase/supabase-js'],
              'vendor-hls': ['hls.js'],
              'vendor-query': ['react-query'],
            }
          }
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        '__LOCAL_IP__': JSON.stringify(localIp)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
          'next-themes': path.resolve(__dirname, 'node_modules/next-themes'),
        }
      }
    };
});

